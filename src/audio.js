import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
export async function generateAudio(baseUrl, item, signal, fetcher = fetch) {
  const response = await fetcher(baseUrl + '/tts/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: item.text, voice_profile: item.voice, output_format: 'wav' }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(180000)])
  });
  if (!response.ok) throw new Error(`OmniVoice could not speak (HTTP ${response.status}). Check the sample in OmniVoice.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.subarray(0, 4).toString() !== 'RIFF' || bytes.subarray(8, 12).toString() !== 'WAVE') throw new Error('OmniVoice did not return WAV audio.');
  return bytes;
}
export async function speak(baseUrl, item, signal) {
  const bytes = await generateAudio(baseUrl, item, signal);
  signal.throwIfAborted();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'omnibot-'));
  const file = path.join(dir, 'speech.wav');
  try {
    await fs.writeFile(file, bytes);
    signal.throwIfAborted();
    await new Promise((resolve, reject) => {
      const command = `$ErrorActionPreference='Stop'; $p=New-Object System.Media.SoundPlayer '${file.replace(/'/g, "''")}'; $p.PlaySync()`;
      const player = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, stdio: 'ignore', signal });
      let failure;
      player.once('error', error => { failure = error; });
      player.once('close', code => failure ? reject(failure) : code === 0 ? resolve() : reject(new Error('Windows audio playback failed. Check your output device.')));
    });
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
