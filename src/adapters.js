import { KickWebSocket } from 'kick-wss';
export function parseTwitch(line) {
  const match = line.match(/^(?:@([^ ]+) )?:([^! ]+)!\S+ PRIVMSG #[^ ]+ :([\s\S]*)$/);
  if (!match) return null;
  const tags = Object.fromEntries((match[1] || '').split(';').map(t => { const n = t.indexOf('='); return [t.slice(0,n),t.slice(n+1)]; }));
  return { platform: 'twitch', id: tags.id, userId: tags['user-id'] || match[2], user: match[2], text: match[3] };
}
export function youtubeVideoId(value) {
  if (/^[\w-]{11}$/.test(value)) return value;
  try {
    const u = new URL(value);
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
    const id = host === 'youtu.be' ? u.pathname.slice(1) : host === 'youtube.com' ? (u.searchParams.get('v') || u.pathname.match(/^\/(?:live|shorts)\/([\w-]+)/)?.[1]) : '';
    if (/^[\w-]{11}$/.test(id || '')) return id;
  } catch {}
  throw new Error('Paste the YouTube live video link, not the channel link.');
}
export function kickAdapter(channel, emit, status) {
  let stopped = false;
  const client = new KickWebSocket({ autoReconnect: true, reconnectInterval: 5000, connectionTimeout: 10000, filteredEvents: ['ChatMessage'] });
  client.on('ChatMessage', m => { if (!stopped) emit({ platform: 'kick', id: m.id, userId: String(m.sender?.id || m.sender?.username), user: m.sender?.username || 'unknown', text: m.content }); });
  client.on('ready', () => { if (stopped) client.disconnect(); else status('Connected'); });
  client.on('disconnect', () => { if (!stopped) status('Reconnecting'); });
  client.on('error', () => { if (!stopped) status('Connection failed — check channel and internet'); });
  return { start: () => client.connect(channel), stop: () => { stopped = true; client.disconnect(); } };
}
export function twitchAdapter(channel, emit, status, Socket = WebSocket) {
  let socket, retry, watchdog, stopped = false;
  const connect = () => {
    if (stopped) return;
    status('Connecting'); socket = new Socket('wss://irc-ws.chat.twitch.tv:443');
    const current = socket;
    watchdog = setTimeout(() => current.close(), 20000);
    current.addEventListener('open', () => {
      if (stopped) return current.close();
      current.send('CAP REQ :twitch.tv/tags twitch.tv/commands\r\n');
      current.send(`NICK justinfan${Math.floor(Math.random() * 90000000 + 10000000)}\r\n`);
      current.send(`JOIN #${channel}\r\n`);
    });
    current.addEventListener('message', event => {
      if (stopped) return;
      for (const line of String(event.data).split('\r\n')) {
        if (line.startsWith('PING ')) current.send(line.replace(/^PING/, 'PONG') + '\r\n');
        if (line.includes(' 366 ') && line.includes(` #${channel} `)) { clearTimeout(watchdog); status('Connected'); }
        if (line.includes(' RECONNECT')) current.close();
        const message = parseTwitch(line); if (message) emit(message);
      }
    });
    current.addEventListener('error', () => { if (!stopped) status('Connection error'); });
    current.addEventListener('close', () => { clearTimeout(watchdog); if (!stopped) { status('Reconnecting'); retry = setTimeout(connect, 5000); } });
  };
  return { start: async () => connect(), stop: () => { stopped = true; clearTimeout(retry); clearTimeout(watchdog); socket?.close(); } };
}
export function youtubeAdapter(video, key, emit, status, fetcher = fetch) {
  let timer, stopped = false, page = '', chatId, initial = true, failures = 0;
  const controller = new AbortController();
  async function api(endpoint, params) {
    const url = new URL('https://www.googleapis.com/youtube/v3/' + endpoint);
    url.search = new URLSearchParams({ ...params, key }).toString();
    const response = await fetcher(url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
    const data = await response.json();
    if (!response.ok) {
      const reason = data.error?.errors?.[0]?.reason || `HTTP ${response.status}`;
      const error = new Error(`YouTube: ${reason}. Check the live link, API key, and available quota.`);
      error.terminal = response.status >= 400 && response.status < 500 && response.status !== 429;
      throw error;
    }
    return data;
  }
  async function poll() {
    if (stopped) return;
    try {
      const data = await api('liveChat/messages', { part: 'snippet,authorDetails', liveChatId: chatId, maxResults: '200', ...(page ? { pageToken: page } : {}) });
      if (stopped) return;
      if (data.offlineAt) { status('Stream ended'); return; }
      // Initial results are history; speak only messages arriving after connection.
      if (!initial) for (const m of data.items || []) {
        if (m.snippet?.type === 'textMessageEvent') emit({ platform: 'youtube', id: m.id, userId: m.authorDetails?.channelId, user: m.authorDetails?.displayName || 'unknown', text: m.snippet.textMessageDetails?.messageText || '' });
      }
      initial = false; page = data.nextPageToken; failures = 0;
      if (!page) throw new Error('YouTube did not return a chat continuation token.');
      status('Connected'); timer = setTimeout(poll, Math.max(5000, Number(data.pollingIntervalMillis) || 5000));
    } catch (error) {
      if (stopped) return;
      status(error.message);
      if (!error.terminal) timer = setTimeout(poll, Math.min(60000, 5000 * 2 ** Math.min(failures++, 4)));
    }
  }
  return {
    async start() {
      if (!key) throw new Error('YouTube needs a YouTube Data API key in Settings.');
      const data = await api('videos', { part: 'liveStreamingDetails', id: youtubeVideoId(video) });
      chatId = data.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
      if (!chatId) throw new Error('This YouTube video has no active live chat. Start the stream and check the link.');
      await poll();
    },
    stop() { stopped = true; clearTimeout(timer); controller.abort(); }
  };
}
export function createAdapters(cfg, emit, status) {
  const result = [];
  if (cfg.kickChannel) result.push(['kick', kickAdapter(cfg.kickChannel, emit, s => status('kick', s))]);
  if (cfg.twitchChannel) result.push(['twitch', twitchAdapter(cfg.twitchChannel, emit, s => status('twitch', s))]);
  if (cfg.youtubeVideo) result.push(['youtube', youtubeAdapter(cfg.youtubeVideo, cfg.youtubeApiKey, emit, s => status('youtube', s))]);
  return result;
}
