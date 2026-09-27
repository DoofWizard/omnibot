import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { KickWebSocket } from "kick-wss";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const configPath = path.join(root, "config.json");

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    throw new Error("config.json is missing.");
  }
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  return {
    kickChannel: String(cfg.kickChannel ?? "").trim(),
    command: String(cfg.command ?? "!tts").trim(),
    omnivoiceBaseUrl: String(cfg.omnivoiceBaseUrl ?? "http://127.0.0.1:7861").replace(/\/$/, ""),
    language: String(cfg.language ?? "English"),
    voiceProfile: String(cfg.voiceProfile ?? "").trim(),
    maxMessageLength: Number(cfg.maxMessageLength ?? 240),
    userCooldownSeconds: Number(cfg.userCooldownSeconds ?? 20),
    globalCooldownSeconds: Number(cfg.globalCooldownSeconds ?? 2),
    maxQueueLength: Number(cfg.maxQueueLength ?? 10),
    rejectUrls: Boolean(cfg.rejectUrls ?? true),
    ignoreUsers: Array.isArray(cfg.ignoreUsers) ? cfg.ignoreUsers.map(v => String(v).toLowerCase()) : [],
    debug: Boolean(cfg.debug ?? false)
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hasUrl = text => /(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|gg|tv|io|co)\b)/i.test(text);

async function pingOmniVoice(cfg) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(cfg.omnivoiceBaseUrl + "/tts/ping", { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function generateWav(cfg, text) {
  const body = {
    text,
    language: cfg.language,
    output_format: "wav"
  };
  if (cfg.voiceProfile) body.voice_profile = cfg.voiceProfile;

  const res = await fetch(cfg.omnivoiceBaseUrl + "/tts/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OmniVoice returned HTTP ${res.status}${detail ? ": " + detail.slice(0, 300) : ""}`);
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  const dir = path.join(os.tmpdir(), "omnibot");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `omnibot-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`);
  fs.writeFileSync(file, bytes);
  return file;
}

function playWavWindows(file) {
  return new Promise((resolve, reject) => {
    const escaped = file.replace(/'/g, "''");
    const command = `$p = New-Object System.Media.SoundPlayer '${escaped}'; $p.PlaySync()`;
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"]
    });
    let err = "";
    child.stderr.on("data", d => { err += d.toString(); });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(err.trim() || `audio player exited ${code}`)));
  });
}

async function speak(cfg, text) {
  const file = await generateWav(cfg, text);
  try {
    await playWavWindows(file);
  } finally {
    fs.promises.unlink(file).catch(() => {});
  }
}

class TtsQueue {
  constructor(cfg) {
    this.cfg = cfg;
    this.items = [];
    this.running = false;
    this.lastSpokenAt = 0;
  }

  push(item) {
    if (this.items.length >= this.cfg.maxQueueLength) return false;
    this.items.push(item);
    this.drain().catch(err => console.error("[TTS] Queue error:", err.message));
    return true;
  }

  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.items.length) {
        const wait = this.cfg.globalCooldownSeconds * 1000 - (Date.now() - this.lastSpokenAt);
        if (wait > 0) await sleep(wait);

        const item = this.items.shift();
        console.log(`[TTS] ${item.user}: ${item.text}`);
        try {
          await speak(this.cfg, item.text);
          this.lastSpokenAt = Date.now();
        } catch (err) {
          console.error("[TTS] Failed:", err.message);
        }
      }
    } finally {
      this.running = false;
    }
  }
}

async function selfTest(cfg) {
  console.log("Checking OmniVoice...");
  if (!(await pingOmniVoice(cfg))) {
    throw new Error(`OmniVoice is not reachable at ${cfg.omnivoiceBaseUrl}. Start OmniVoice first.`);
  }
  console.log("OmniVoice: CONNECTED");
  console.log("Speaking self-test...");
  await speak(cfg, "OmniBot self test successful.");
  console.log("Self-test passed.");
}

async function main() {
  const cfg = loadConfig();

  if (process.argv.includes("--self-test")) {
    await selfTest(cfg);
    return;
  }

  if (!cfg.kickChannel || cfg.kickChannel === "CHANGE_ME") {
    throw new Error("Open config.json and change kickChannel from CHANGE_ME to the Kick channel name.");
  }

  console.log("========================================");
  console.log("              OmniBot");
  console.log("========================================");
  console.log(`Channel:   ${cfg.kickChannel}`);
  console.log(`Command:   ${cfg.command}`);
  console.log(`OmniVoice: ${cfg.omnivoiceBaseUrl}`);
  console.log("");

  if (!(await pingOmniVoice(cfg))) {
    throw new Error(`OmniVoice is not reachable at ${cfg.omnivoiceBaseUrl}. Start OmniVoice first, then run self-test.bat.`);
  }
  console.log("OmniVoice: CONNECTED");

  const queue = new TtsQueue(cfg);
  const cooldowns = new Map();
  let lastAcceptedText = "";

  const kick = new KickWebSocket({
    debug: cfg.debug,
    autoReconnect: true,
    reconnectInterval: 5000,
    connectionTimeout: 10000,
    filteredEvents: ["ChatMessage"]
  });

  kick.on("ready", () => {
    console.log(`Kick:      CONNECTED — ${cfg.kickChannel}`);
    console.log("Status:    READY");
    console.log("");
  });

  kick.on("disconnect", ({ reason } = {}) => {
    console.log("[Kick] Disconnected" + (reason ? `: ${reason}` : "") + " — reconnecting automatically.");
  });

  kick.on("error", error => {
    console.error("[Kick] Error:", error?.message ?? error);
  });

  kick.on("ChatMessage", message => {
    const user = String(message?.sender?.username ?? "unknown");
    const userKey = user.toLowerCase();
    const raw = String(message?.content ?? "").trim();

    if (cfg.ignoreUsers.includes(userKey)) return;
    if (!raw.toLowerCase().startsWith(cfg.command.toLowerCase())) return;

    let text = raw.slice(cfg.command.length).trim();
    if (!text) return;

    if (text.length > cfg.maxMessageLength) {
      console.log(`[DROP] ${user}: over ${cfg.maxMessageLength} characters`);
      return;
    }
    if (cfg.rejectUrls && hasUrl(text)) {
      console.log(`[DROP] ${user}: URL detected`);
      return;
    }
    if (text.toLowerCase() === lastAcceptedText.toLowerCase()) {
      console.log(`[DROP] ${user}: duplicate message`);
      return;
    }

    const now = Date.now();
    const last = cooldowns.get(userKey) ?? 0;
    const remaining = cfg.userCooldownSeconds * 1000 - (now - last);
    if (remaining > 0) {
      console.log(`[DROP] ${user}: cooldown (${Math.ceil(remaining / 1000)}s left)`);
      return;
    }

    if (!queue.push({ user, text })) {
      console.log(`[DROP] ${user}: queue full`);
      return;
    }

    cooldowns.set(userKey, now);
    lastAcceptedText = text;
    console.log(`[QUEUE] ${user} — ${queue.items.length} waiting`);
  });

  await kick.connect(cfg.kickChannel);
}

main().catch(err => {
  console.error("");
  console.error("OmniBot could not start:");
  console.error(err.message);
  process.exitCode = 1;
});
