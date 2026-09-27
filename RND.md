# OmniBot R&D — v0.2

## Product goal

A nontechnical Windows streamer opens one launcher, sees their saved voice samples, and starts chat-to-speech. Viewers on Kick, Twitch, and YouTube use the same command: `!tts samplename speech`. Names come from OmniVoice, never a maintained bot-side list.

## Implemented architecture

```
Kick public WebSocket ─┐
Twitch anonymous IRC ──┼─> normalized chat -> sample lookup -> filters/cooldowns
YouTube live-chat API ─┘                                      |
                                                            v
Local dashboard -> controls -> one bounded FIFO -> OmniVoice WAV -> Windows audio -> OBS
```

Modules:
- `config.js`: validated defaults and private local settings, including UTF-8 BOM compatibility.
- `voices.js`: saved-profile discovery, shared in-flight refresh, 30-second cache, strict command parsing.
- `adapters.js`: isolated platform transports; normalized platform, message ID, stable user ID, display name, and text.
- `bot.js`: queue, deduplication, cooldowns, stop/mute, bounded activity log and adapter lifecycle.
- `audio.js`: profile-specific generation, timeout, WAV validation, interruptible Windows playback, temporary-file cleanup.
- `server.js` + `ui/`: local browser dashboard; fixed asset allowlist, loopback binding, random session token, Host/Origin checks, no secret in state responses.
- `launch.ps1`: single-instance launcher, Node version check/install, lockfile-based dependency preparation, browser launch. Existing batch entry points retained.

## Voice contract

GET `/v1/audio/voices` returns `data` entries with `id`, `owned_by` and `profile_type`. Only entries owned by `local` are selectable samples. Built-in compatibility aliases and generic generation modes are excluded.

POST `/tts/generate` sends `text`, the exact discovered `voice_profile`, and `output_format: wav`. Profile defaults such as language and seed remain under OmniVoice's control. Names with spaces may be quoted or parenthesized. The command token must end at whitespace; `!ttsfoo` is not `!tts`. Missing/unknown/ambiguous sample names are rejected locally.

The first lookup/start refreshes voices. A subsequent relevant chat message refreshes a cache older than 30 seconds; concurrent lookups share one refresh. Manual refresh is immediate. A failed refresh rejects that request instead of silently selecting another voice. Deleted or invalid samples may still fail generation during the cache window and are logged clearly.

Profile creation stays in OmniVoice's existing Voices editor. Its source exposes profile saving through Gradio UI callbacks; this release does not invent an unsupported REST upload endpoint. The dashboard opens the editor and explains the save/refresh steps.

## Transport decisions

### Kick

Pinned `kick-wss` 1.0.5 exposes connect/channel, ChatMessage, ready, disconnect, error, and disconnect(). Public read-only access avoids bot identity/OAuth. It uses Kick's unofficial public endpoint and can fail if Kick changes or blocks access. Error status is shown rather than claiming readiness.

### Twitch

Anonymous `justinfan` IRC over `wss://irc-ws.chat.twitch.tv:443` provides read-only chat without credential setup. Request tags for message and user IDs, answer PING, wait for end-of-names confirmation, reconnect on disconnect/server request, and stop retries on Stop. No PRIVMSG is sent. Twitch recommends EventSub for full integrations; authenticated EventSub is a future replacement if anonymous IRC ceases to meet this use case.

### YouTube

The helper supplies a YouTube Data API key and current live-video URL. `videos.list(part=liveStreamingDetails)` resolves `activeLiveChatId`. `liveChatMessages.list` supplies message text and author channel IDs. Skip initial historical results, advance nextPageToken, honor pollingIntervalMillis, apply a five-second minimum interval, back off on temporary failures, and stop on terminal API errors/end of broadcast. Credentials are not printed.

This adapter is implemented but cannot be called verified against a user's channel until tested with a real API key and live stream. Polling quota is a material limitation for long broadcasts. Google now recommends streamList; adopt its server-streaming protocol in a future change with reconnection and quota measurements. Do not promise unlimited free operation.

### Further platforms

An adapter implements asynchronous start() and stop(), emits the normalized message contract, and reports status. Add Facebook/TikTok/other services only after selecting a supported read interface and authentication flow. No generic claim of all-platform support; this release contains Kick, Twitch, and YouTube adapters.

## Queue and failure behavior

One FIFO serializes audio across platforms. User cooldown keys include platform and stable user ID. Recent message IDs are bounded to 2,000; adjacent identical voice/text requests are suppressed. The pending lookup count, queue length, text size and log history are bounded. Defaults are intentionally conservative for a small stream.

Mute clears the queue, aborts fetch/playback, and drops incoming commands while muted. Stop invalidates in-flight message/start operations and closes adapters. Cancelling local requests does not guarantee cancellation of GPU computation already underway inside OmniVoice. Network/generation/audio failures are logged and the queue continues.

Each source reports its own connection status. An active bot is not proof every platform connected. Authentication/permission/quota failures require a helper; the other adapters remain independent.

## Nontechnical setup contract

First use: extract ZIP, start already-installed OmniVoice, double-click START_OMNIBOT, enter channels, save, refresh/test a sample, Start. Later use: start OmniVoice, double-click launcher, Start. The dashboard has Start, Stop, Mute, voice preview, sample-editor link, channel settings, connection states, and recent activity.

Dependencies download once per lockfile change. Node installation can require permission or a restart; the launcher says so. OmniVoice installation/model download and GPU driver setup are outside this launcher because the user's distribution and hardware are not known. A signed self-contained executable and guided OmniVoice installer remain future work.

## Verification and release gates

Automated: arbitrary and spaced names; case/boundary matching; aliases excluded; refresh and newly added names; exact TTS payload; invalid WAV rejection; serialized cross-platform playback; cooldown isolation; queue cap; message replay; mute abort; stop during startup; Twitch IRC tags/keepalive; YouTube URL validation/history/pagination; dashboard token/origin and key masking.

Required first-stream checks on the actual Windows PC:
1. Launch from an extracted ZIP on a machine with and without an existing supported Node runtime.
2. Save two differently named OmniVoice samples, refresh, and preview both.
3. Send one command per voice on each enabled platform; hear matching voices and no spoken selector.
4. Add another profile while running; verify automatic discovery after the cache interval.
5. Test unknown names, overload/cooldowns, mute during speech, unmute, stop/restart.
6. Disconnect network/OmniVoice and verify truthful status/recovery. Check OBS audio.
7. Run a representative-length YouTube broadcast and measure Google API quota before describing it as suitable for all-day streaming.

No live acceptance test should be represented as passed based solely on mocks. No changes to the private mobile repository are needed.

Implementation-session evidence: 11 automated tests pass; PowerShell launcher syntax checked; browser dashboard tested with fixture samples for refresh, command examples, preview feedback, and Quit; a read-only Twitch connection reached Connected on the public twitch channel. Fixture previews are not real synthesized audio. Live Kick, credentialed YouTube, actual OmniVoice synthesis, clean-machine dependency installation, and OBS routing remain acceptance checks.

## Next priorities

1. Real-machine acceptance and platform transport smoke tests.
2. YouTube streamList transport and guided OAuth if required by a deployment.
3. Signed packaged launcher, desktop shortcut, automatic local OmniVoice discovery/start only for known supported installs.
4. Optional on-screen queue/history, moderator controls, and audio-device selection after the base flow is proven.

## Primary sources inspected

- OmniVoice API and Gradio implementation: https://github.com/hangry-labs/OmniVoiceTTS/blob/master/omnivoice/app.py
- OmniVoice setup/profile documentation: https://github.com/hangry-labs/OmniVoiceTTS
- kick-wss 1.0.5 installed declarations and implementation: https://www.npmjs.com/package/kick-wss/v/1.0.5
- Twitch IRC concepts: https://dev.twitch.tv/docs/chat/irc/
- Twitch developer forum anonymous connection discussion: https://discuss.dev.twitch.com/t/twitch-tv-web-browser-chat/6186
- YouTube chat pagination/interval/errors: https://developers.google.com/youtube/v3/live/docs/liveChatMessages/list
- YouTube live video metadata: https://developers.google.com/youtube/v3/docs/videos#liveStreamingDetails.activeLiveChatId

Sources checked during this implementation; upstream APIs can change.
