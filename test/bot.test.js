import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { VoiceCatalog, parseCommand } from '../src/voices.js';
import { validateConfig } from '../src/config.js';
import { generateAudio } from '../src/audio.js';
import { Bot } from '../src/bot.js';
import { parseTwitch, twitchAdapter, youtubeVideoId, youtubeAdapter } from '../src/adapters.js';
import { createDashboard } from '../src/server.js';
const cfg = validateConfig({ kickChannel:'test', globalCooldownSeconds:0, userCooldownSeconds:20 });
const catalog = () => ({ voices:['sample','Other Voice'], refresh:async function(){return this.voices;}, ensureFresh:async()=>{} });
const message = (text, platform='kick', userId='42', id=crypto.randomUUID()) => ({text,platform,userId,user:'viewer',id});
const waitFor = async condition => { for(let n=0;n<100;n++){if(condition())return;await delay(10);}throw new Error('Timed out'); };

test('any discovered name selects only that voice; names with spaces and command boundaries', () => {
  assert.deepEqual(parseCommand('!tts SAMPLE hello there','!tts',['sample']), {voice:'sample',text:'hello there'});
  assert.deepEqual(parseCommand('!tts "Other Voice" hello','!tts',['Other Voice']), {voice:'Other Voice',text:'hello'});
  assert.deepEqual(parseCommand('!tts (Other Voice) hello','!tts',['Other Voice']), {voice:'Other Voice',text:'hello'});
  assert.equal(parseCommand('!ttsfoo sample hello','!tts',['sample']),null);
  assert.throws(()=>parseCommand('!tts missing hello','!tts',['sample']),/Unknown/);
  assert.throws(()=>parseCommand('!tts sample','!tts',['sample']),/Use/);
});
test('catalog filters built-in aliases, coalesces refresh, and discovers newly added samples', async () => {
  let count=0;
  const v = new VoiceCatalog('http://local',async()=>{count++;return Response.json({data:[{id:'nova',owned_by:'hangrylabs'},{id:count===1?'sample':'new-sample',owned_by:'local'}]});});
  await Promise.all([v.refresh(),v.refresh()]); assert.equal(count,1); assert.deepEqual(v.voices,['sample']);
  v.updated=0; await v.ensureFresh(); assert.deepEqual(v.voices,['new-sample']);
});
test('exact voice sent to OmniVoice, preserving profile defaults and excluding name from speech', async () => {
  const wav = Buffer.from('RIFF0000WAVE');
  await generateAudio('http://local',{voice:'any-sample',text:'hello'},new AbortController().signal,async(url,init)=>{
    assert.equal(url,'http://local/tts/generate');
    assert.deepEqual(JSON.parse(init.body),{text:'hello',voice_profile:'any-sample',output_format:'wav'});
    return new Response(wav);
  });
  await assert.rejects(generateAudio('http://local',{voice:'x',text:'y'},new AbortController().signal,async()=>new Response('not audio')),/WAV/);
});
test('shared queue serializes platforms, isolates user cooldowns, rejects bad requests', async () => {
  let concurrent=0, peak=0; const spoken=[];
  const bot=new Bot(cfg,{catalog:catalog(),speaker:async(_,item)=>{peak=Math.max(peak,++concurrent);await delay(5);spoken.push(item);concurrent--;}});
  bot.active=true;
  await bot.receive(message('!tts sample first'));
  await bot.receive(message('!tts sample cooldown'));
  await bot.receive(message('!tts sample second','twitch'));
  await bot.receive(message('!tts absent nope','youtube'));
  await bot.receive(message('!tts sample https://example.com','youtube'));
  await waitFor(()=>!bot.busy);
  assert.equal(peak,1); assert.deepEqual(spoken.map(i=>i.text),['first','second']);
});
test('mute aborts active audio and discards waiting messages; unmute accepts new speech', async () => {
  const started=[];
  const bot=new Bot({...cfg,userCooldownSeconds:0},{catalog:catalog(),speaker:async(_,item,signal)=>{started.push(item.text);await delay(10000,undefined,{signal});}});
  bot.active=true;
  await bot.receive(message('!tts sample one')); await bot.receive(message('!tts sample two'));
  bot.setMuted(true); await waitFor(()=>!bot.busy);
  assert.deepEqual(started,['one']);assert.equal(bot.queue.length,0);
  bot.setMuted(false); await bot.receive(message('!tts sample three')); await waitFor(()=>started.length===2); bot.stop(); await waitFor(()=>!bot.busy);
});
test('stop during voice discovery cannot reconnect the bot', async () => {
  let resolve; const c=catalog(); c.refresh=()=>new Promise(r=>{resolve=r;});
  const bot=new Bot(cfg,{catalog:c,adapterFactory:()=>{throw new Error('Must not create adapter');}});
  const pending=bot.start();bot.stop();resolve();await pending;assert.equal(bot.active,false);
});
test('mute then unmute cannot revive a command still waiting for voice discovery', async () => {
  let finish;const c=catalog();c.ensureFresh=()=>new Promise(resolve=>{finish=resolve;});
  const spoken=[];const bot=new Bot(cfg,{catalog:c,speaker:async(_,i)=>spoken.push(i)});bot.active=true;
  const pending=bot.receive(message('!tts sample stale'));bot.setMuted(true);bot.setMuted(false);finish();await pending;
  assert.equal(spoken.length,0);assert.equal(bot.queue.length,0);
});
test('queue cap and message ID deduplication hold across deliveries', async () => {
  const bot=new Bot({...cfg,maxQueueLength:1,userCooldownSeconds:0},{catalog:catalog(),speaker:async(_,i,signal)=>delay(10000,undefined,{signal})});
  bot.active=true;
  await bot.receive(message('!tts sample one','kick','1','same'));
  await bot.receive(message('!tts sample two','kick','2','second'));
  await bot.receive(message('!tts sample three','kick','3','third'));
  assert.equal(bot.queue.length,1);assert.ok(bot.logs.some(l=>l.message.includes('Queue is full')));
  bot.stop();await waitFor(()=>!bot.busy);
  bot.active=true;await bot.receive(message('!tts sample replay','kick','1','same'));assert.equal(bot.busy,false);
});
test('Twitch parses tags and text and answers keepalive without posting chat', async () => {
  assert.deepEqual(parseTwitch('@id=m1;user-id=12 :viewer!viewer@host PRIVMSG #room :!tts sample hi'),{platform:'twitch',id:'m1',userId:'12',user:'viewer',text:'!tts sample hi'});
  let socket;const sent=[];const statuses=[];const received=[];
  class FakeSocket extends EventTarget { constructor(){super();socket=this;}send(s){sent.push(s);}close(){this.dispatchEvent(new Event('close'));} }
  const adapter=twitchAdapter('room',m=>received.push(m),s=>statuses.push(s),FakeSocket);
  await adapter.start();socket.dispatchEvent(new Event('open'));
  socket.dispatchEvent(new MessageEvent('message',{data:':server 366 nick #room :End\r\nPING :server\r\n:viewer!x@y PRIVMSG #room :!tts sample hello\r\n'}));
  assert.ok(statuses.includes('Connected'));assert.ok(sent.includes('PONG :server\r\n'));assert.equal(received[0].text,'!tts sample hello');
  assert.equal(sent.some(s=>s.startsWith('PRIVMSG')),false);adapter.stop();
});
test('YouTube validates links, skips history, paginates and stops polling', async () => {
  assert.equal(youtubeVideoId('https://youtube.com/live/abcdefghijk'),'abcdefghijk');
  assert.throws(()=>youtubeVideoId('https://evil.com/watch?v=abcdefghijk'));
  const received=[];let calls=0;const statuses=[];
  const adapter=youtubeAdapter('abcdefghijk','secret',m=>received.push(m),s=>statuses.push(s),async url=>{
    calls++;if(url.pathname.endsWith('/videos')) return Response.json({items:[{liveStreamingDetails:{activeLiveChatId:'chat'}}]});
    if(calls===3) assert.equal(url.searchParams.get('pageToken'),'next');
    return Response.json({nextPageToken:'next',pollingIntervalMillis:5000,items:[{id:String(calls),snippet:{type:'textMessageEvent',textMessageDetails:{messageText:'!tts sample hello'}},authorDetails:{channelId:'user',displayName:'Viewer'}}]});
  });
  try {await adapter.start();assert.equal(received.length,0);await delay(5100);assert.equal(received.length,1);assert.equal(received[0].platform,'youtube');}finally{adapter.stop();}
  assert.ok(statuses.includes('Connected'));
});
test('dashboard protects settings, hides API key, and provides voice controls', async () => {
  const app=createDashboard({...cfg,youtubeApiKey:'private-key'},{dependencies:{catalog:catalog()},save:validateConfig});
  app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const headers={'X-Omnibot-Token':app.token,'Content-Type':'application/json'};
  try {
    assert.equal((await fetch(base+'/api/state')).status,403);
    assert.equal((await fetch(base+'/api/state',{headers:{...headers,Origin:'https://other.test'}})).status,403);
    const state=await (await fetch(base+'/api/state',{headers})).json();assert.equal(state.config.youtubeApiKey,'');assert.equal(state.config.hasYoutubeApiKey,true);
    assert.equal((await fetch(base+'/api/refresh',{method:'POST',headers,body:'{}'})).status,200);
    assert.ok((await (await fetch(base)).text()).includes('Start bot'));
  } finally { app.server.close();app.server.closeAllConnections(); }
});
