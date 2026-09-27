import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Bot } from './bot.js';
import { loadConfig, saveConfig, root } from './config.js';

export function createDashboard(initialConfig, options = {}) {
  let cfg = initialConfig;
  let bot = new Bot(cfg, options.dependencies);
  let working = false;
  const token = crypto.randomBytes(24).toString('hex');
  const server = http.createServer(async (req, res) => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.headers.host !== `127.0.0.1:${server.address().port}` || (req.headers.origin && req.headers.origin !== origin)) return json(403, { error: 'Open OmniBot from its desktop launcher.' });
    const url = new URL(req.url, origin);
    const staticFiles = { '/': ['index.html','text/html'], '/app.js': ['app.js','text/javascript'], '/style.css': ['style.css','text/css'] };
    if (req.method === 'GET' && staticFiles[url.pathname]) {
      const [file, type] = staticFiles[url.pathname];
      res.writeHead(200, { 'Content-Type': type + '; charset=utf-8' });
      return res.end(fs.readFileSync(path.join(root, 'ui', file)));
    }
    if (req.headers['x-omnibot-token'] !== token) return json(403, { error: 'Reopen OmniBot using START_OMNIBOT.bat.' });
    if (req.method === 'GET' && url.pathname === '/api/state') return json(200, { ...bot.state(), config: { ...cfg, youtubeApiKey: '', hasYoutubeApiKey: Boolean(cfg.youtubeApiKey) }, working });
    if (req.method !== 'POST') return json(404, { error: 'Not found' });
    try {
      let body = '';
      for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 16384) throw new Error('Request too large.'); }
      const input = body ? JSON.parse(body) : {};
      // Stop/mute stay responsive while an upstream connection is pending.
      if (url.pathname === '/api/stop') { bot.stop(); return json(200, { ok: true }); }
      if (url.pathname === '/api/mute') { bot.setMuted(Boolean(input.muted)); return json(200, { ok: true }); }
      if (working) return json(409, { error: 'Please wait for the current operation.' });
      working = true;
      try {
        switch (url.pathname) {
          case '/api/save': {
            if (bot.active || bot.busy) throw new Error('Stop the bot before changing settings.');
            const allowed = ['kickChannel','twitchChannel','youtubeVideo','youtubeApiKey','omnivoiceBaseUrl'];
            const changes = Object.fromEntries(allowed.filter(k => Object.hasOwn(input,k)).map(k => [k,input[k]]));
            if (!changes.youtubeApiKey) delete changes.youtubeApiKey;
            if (input.clearYoutubeKey) changes.youtubeApiKey = '';
            cfg = (options.save || saveConfig)({ ...cfg, ...changes });
            bot.stop(); bot = new Bot(cfg, options.dependencies);
            break;
          }
          case '/api/start': await bot.start(); break;
          case '/api/refresh': await bot.catalog.refresh(); break;
          case '/api/test': await bot.test(input.voice); break;
          case '/api/quit': bot.stop(); json(200, { ok: true }); setTimeout(() => server.close(), 100); return;
          default: return json(404, { error: 'Not found' });
        }
        json(200, { ok: true });
      } finally { working = false; }
    } catch (error) { json(400, { error: error.message === 'fetch failed' ? 'Cannot reach OmniVoice. Start OmniVoice, then try again.' : error.message }); }
  });
  server.on('close', () => bot.stop());
  return { server, token, getBot: () => bot };
}
export async function launch() {
  const { server, token } = createDashboard(loadConfig());
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const url = `http://127.0.0.1:${server.address().port}/#${token}`;
  console.log('OmniBot is open in your browser. Keep this window open. Use Quit in OmniBot when finished.');
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Start-Process '${url}'`], { windowsHide: true, stdio: 'ignore' });
  child.once('error', () => console.log('Open this address in your browser: ' + url));
  child.once('exit', code => { if (code) console.log('Open this address in your browser: ' + url); });
  const stop = () => { server.close(); server.closeAllConnections(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
