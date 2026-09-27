import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const settingsFile = path.join(root, 'settings.local.json');
export function validateConfig(input) {
  const c = { ...input };
  for (const key of ['kickChannel', 'twitchChannel']) {
    c[key] = String(c[key] || '').trim().toLowerCase();
    if (c[key] === 'change_me') c[key] = '';
    if (c[key] && !/^[a-z0-9_-]{1,50}$/.test(c[key])) throw new Error('Enter channel names only, without a website address.');
  }
  const url = new URL(c.omnivoiceBaseUrl || 'http://127.0.0.1:7861');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Enter a valid OmniVoice HTTP address.');
  c.omnivoiceBaseUrl = url.href.replace(/\/$/, '');
  c.command = String(c.command || '!tts').trim();
  if (!/^![a-z0-9_-]{1,20}$/i.test(c.command)) throw new Error('Use a command such as !tts.');
  for (const [key, fallback, min, max] of [['maxMessageLength',240,1,2000], ['userCooldownSeconds',20,0,3600], ['globalCooldownSeconds',2,0,60], ['maxQueueLength',10,1,100]]) {
    c[key] = Number(c[key] ?? fallback);
    if (!Number.isFinite(c[key]) || c[key] < min || c[key] > max) throw new Error(`Invalid setting: ${key}`);
  }
  c.ignoreUsers = Array.isArray(c.ignoreUsers) ? c.ignoreUsers.map(x => String(x).toLowerCase()) : [];
  c.rejectUrls = c.rejectUrls !== false;
  c.youtubeVideo = String(c.youtubeVideo || '').trim();
  c.youtubeApiKey = String(c.youtubeApiKey || '').trim();
  return c;
}
export function loadConfig() {
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  return validateConfig({ ...read(path.join(root, 'config.json')), ...(fs.existsSync(settingsFile) ? read(settingsFile) : {}) });
}
export function saveConfig(input) {
  const cfg = validateConfig(input);
  fs.writeFileSync(settingsFile + '.tmp', JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(settingsFile + '.tmp', settingsFile);
  return cfg;
}
