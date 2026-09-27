import { setTimeout as delay } from 'node:timers/promises';
import { VoiceCatalog, parseCommand } from './voices.js';
import { speak } from './audio.js';
import { createAdapters } from './adapters.js';
export class Bot {
  constructor(cfg, dependencies = {}) {
    this.cfg = cfg;
    this.catalog = dependencies.catalog || new VoiceCatalog(cfg.omnivoiceBaseUrl);
    this.speaker = dependencies.speaker || speak;
    this.adapterFactory = dependencies.adapterFactory || createAdapters;
    this.queue = []; this.cooldowns = new Map(); this.seen = new Set(); this.logs = [];
    this.platforms = {}; this.adapters = []; this.active = false; this.muted = false; this.busy = false; this.accepting = 0; this.generation = 0; this.cancelVersion = 0;
  }
  log(message) { this.logs.push({ time: new Date().toLocaleTimeString(), message }); if (this.logs.length > 60) this.logs.shift(); }
  async start() {
    if (this.active || this.starting) return;
    this.starting = true;
    const generation = ++this.generation;
    try {
    await this.catalog.refresh();
    if (generation !== this.generation) return;
    if (!this.catalog.voices.length) throw new Error('No saved samples found. Click Add samples, save a voice in OmniVoice, then Refresh voices.');
    this.adapters = this.adapterFactory(this.cfg, m => { if (generation === this.generation) void this.receive(m); }, (p, s) => { if (generation === this.generation) this.platforms[p] = s; });
    if (!this.adapters.length) throw new Error('Enter at least one channel in Settings.');
    this.active = true;
    await Promise.all(this.adapters.map(async ([name, adapter]) => {
      this.platforms[name] = 'Connecting';
      try { await adapter.start(); } catch (error) { adapter.stop(); if (generation === this.generation) { this.platforms[name] = error.message; this.log(error.message); } }
    }));
    } finally { this.starting = false; }
  }
  stop() { this.generation++; this.active = false; for (const [, adapter] of this.adapters) adapter.stop(); this.adapters = []; this.platforms = {}; this.cancel(); }
  cancel() { this.cancelVersion++; this.queue.length = 0; this.controller?.abort(); }
  setMuted(value) { this.muted = value; if (value) this.cancel(); }
  async receive(message) {
    if (!this.active || this.muted || this.accepting >= 20) return;
    const raw = String(message.text || '');
    if (!raw.toLowerCase().startsWith(this.cfg.command.toLowerCase())) return;
    if (raw.length > this.cfg.maxMessageLength + 300) return;
    const user = String(message.user || 'unknown');
    if (this.cfg.ignoreUsers.includes(user.toLowerCase()) || this.cfg.ignoreUsers.includes(`${message.platform}:${user}`.toLowerCase())) return;
    this.accepting++;
    const generation = this.generation;
    const cancelVersion = this.cancelVersion;
    try {
      await this.catalog.ensureFresh();
      if (!this.active || this.muted || generation !== this.generation || cancelVersion !== this.cancelVersion) return;
      const item = parseCommand(raw, this.cfg.command, this.catalog.voices);
      if (!item) return;
      if (item.text.length > this.cfg.maxMessageLength) throw new Error('Message is too long.');
      if (this.cfg.rejectUrls && /(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|gg|tv|io|co)\b)/i.test(item.text)) throw new Error('Links are not spoken.');
      const userKey = `${message.platform}:${message.userId || user.toLowerCase()}`;
      const messageKey = message.id && `${message.platform}:${message.id}`;
      const duplicate = `${item.voice}:${item.text}`.toLowerCase();
      const now = Date.now();
      if ((messageKey && this.seen.has(messageKey)) || duplicate === this.lastAccepted) return;
      if (now - (this.cooldowns.get(userKey) || 0) < this.cfg.userCooldownSeconds * 1000) return;
      if (this.queue.length >= this.cfg.maxQueueLength) throw new Error('Queue is full. Try again shortly.');
      this.queue.push(item); this.lastAccepted = duplicate; this.cooldowns.set(userKey, now);
      for (const [key, time] of this.cooldowns) if (now - time > this.cfg.userCooldownSeconds * 1000) this.cooldowns.delete(key);
      if (messageKey) { this.seen.add(messageKey); if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value); }
      this.log(`${message.platform}: queued ${item.voice}`); void this.drain();
    } catch (error) { this.log(error.message); } finally { this.accepting--; }
  }
  async test(voice) {
    const generation = this.generation;
    const cancelVersion = this.cancelVersion;
    await this.catalog.ensureFresh();
    if (generation !== this.generation || cancelVersion !== this.cancelVersion) return;
    if (!this.catalog.voices.includes(voice)) throw new Error('Select a saved voice first.');
    if (this.muted) throw new Error('Unmute before testing.');
    if (this.queue.length >= this.cfg.maxQueueLength) throw new Error('Queue is full.');
    this.queue.push({ voice, text: 'OmniBot voice test successful.' }); void this.drain();
  }
  async drain() {
    if (this.busy || this.muted) return;
    this.busy = true;
    try {
      while (this.queue.length && !this.muted) {
        this.controller = new AbortController();
        const item = this.queue.shift();
        try {
          const wait = this.cfg.globalCooldownSeconds * 1000 - (Date.now() - (this.lastSpoken || 0));
          if (wait > 0) await delay(wait, undefined, { signal: this.controller.signal });
          await this.speaker(this.cfg.omnivoiceBaseUrl, item, this.controller.signal);
          this.lastSpoken = Date.now(); this.log(`Spoke with ${item.voice}`);
        } catch (error) { if (!this.controller.signal.aborted) this.log(error.message); }
      }
    } finally { this.busy = false; }
  }
  state() { return { active: this.active, muted: this.muted, busy: this.busy, queue: this.queue.length, platforms: this.platforms, voices: this.catalog.voices, logs: this.logs }; }
}
