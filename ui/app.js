const token = location.hash.slice(1) || sessionStorage.getItem('omnibot-token');
sessionStorage.setItem('omnibot-token', token || '');
history.replaceState(null, '', '/');
const $ = id => document.getElementById(id);
let state, initialized = false, voiceKey = '', closed = false;
function notice(text, error = false) { $('notice').textContent = text; $('notice').className = error ? 'error' : ''; }
async function api(route, body) {
  const response = await fetch('/api/' + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type':'application/json', 'X-Omnibot-Token':token }, ...(body === undefined ? {} : { body:JSON.stringify(body) }) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error); return data;
}
function example() { const voice = $('voices').value; $('example').value = `${state?.config.command || '!tts'} ${/\s/.test(voice) ? JSON.stringify(voice) : voice || 'samplename'} hello there`; }
async function refreshState() {
  if (closed) return;
  state = await api('state');
  if (!initialized) {
    for (const key of ['kickChannel','twitchChannel','youtubeVideo','omnivoiceBaseUrl']) $('settings').elements[key].value = state.config[key] || '';
    initialized = true;
  }
  $('settings').elements.youtubeApiKey.placeholder = state.config.hasYoutubeApiKey ? 'Saved — leave blank to keep it' : 'Paste your API key';
  $('samples').href = state.config.omnivoiceBaseUrl;
  $('status').textContent = `${state.muted ? 'MUTED' : state.active ? 'Bot started — check connections below' : 'Stopped'} · ${state.queue} waiting${state.busy ? ' · Audio in progress' : ''}`;
  $('start').disabled = state.active || state.working;
  $('mute').textContent = state.muted ? 'Unmute' : 'Mute now';
  $('platforms').replaceChildren(...Object.entries(state.platforms).map(([name,status]) => { const p = document.createElement('p'); p.textContent = `${name}: ${status}`; return p; }));
  if (voiceKey !== JSON.stringify(state.voices)) {
    voiceKey = JSON.stringify(state.voices); const selected = $('voices').value;
    $('voices').replaceChildren(...state.voices.map(v => new Option(v,v)));
    if (!state.voices.length) $('voices').add(new Option('No saved samples loaded',''));
    if (state.voices.includes(selected)) $('voices').value = selected;
    example();
  }
  $('logs').textContent = state.logs.map(l => `${l.time}  ${l.message}`).join('\n') || 'No activity yet.';
}
async function action(route, body = {}, message = 'Done.') {
  try { await api(route, body); notice(message); await refreshState(); } catch (error) { notice(error.message, true); }
}
$('start').onclick = () => action('start', {}, 'Bot started. Check each platform connection below.');
$('stop').onclick = () => action('stop', {}, 'Stopped. Chat will not be spoken.');
$('mute').onclick = () => action('mute', { muted:!state?.muted }, state?.muted ? 'Unmuted.' : 'Muted. Current audio and waiting messages cancelled.');
$('refresh').onclick = () => action('refresh', {}, 'Voice list refreshed.');
$('test').onclick = () => action('test', { voice:$('voices').value }, 'Voice test queued. Listen for the test sentence; check Recent activity if it fails.');
$('voices').onchange = example;
$('copy').onclick = async () => { try { await navigator.clipboard.writeText($('example').value); notice('Command copied. Paste it into chat.'); } catch { $('example').select(); notice('Press Ctrl+C to copy the selected command.'); } };
$('settings').onsubmit = async event => { event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); data.clearYoutubeKey = event.target.elements.clearYoutubeKey.checked; await action('save', data, 'Settings saved. Click Refresh voices, then Start bot.'); event.target.elements.youtubeApiKey.value = ''; event.target.elements.clearYoutubeKey.checked = false; };
$('quit').onclick = async () => { try { await api('quit',{}); closed = true; notice('OmniBot has closed. You can close this tab.'); } catch (e) { notice(e.message,true); } };
async function poll() { try { await refreshState(); } catch { if (!closed) notice('OmniBot is not reachable. Reopen START_OMNIBOT.bat.', true); } if (!closed) setTimeout(poll,2000); }
poll();
