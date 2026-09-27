import { loadConfig } from './config.js';
import { Bot } from './bot.js';
try {
  if (process.argv.includes('--self-test')) {
    const bot = new Bot(loadConfig());
    await bot.catalog.refresh();
    const voice = bot.cfg.voiceProfile || bot.catalog.voices[0];
    if (!voice) throw new Error('Save a sample in OmniVoice first.');
    await bot.test(voice);
    const timer = setInterval(() => {
      if (!bot.busy) { clearInterval(timer); console.log(bot.logs.map(l => l.message).join('\n')); process.exitCode = bot.logs.some(l => l.message.startsWith('Spoke with')) ? 0 : 1; }
    }, 100);
  } else { const { launch } = await import('./server.js'); await launch(); }
} catch (error) { console.error('OmniBot: ' + error.message); process.exitCode = 1; }
