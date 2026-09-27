# OmniBot R&D

## Goal

Make Kick-to-OmniVoice TTS simple enough for a nontechnical streamer to operate without Streamer.bot, custom OBS plugins, moderator permissions, OAuth setup, or hand-written scripts.

## v0.1 architecture

```
PUBLIC KICK CHAT
      |
      v
 kick-wss listener
      |
      v
 command/filter gate
      |
      v
 bounded FIFO queue
      |
      v
 OmniVoice /tts/generate
      |
      v
 temporary WAV
      |
      v
 Windows SoundPlayer
      |
      v
 normal Windows output / OBS
```

## Why this design

### Public read-only Kick transport for v0.1

The current `kick-wss` package exposes a simple `KickWebSocket` client, `ChatMessage` events, automatic reconnection, and public-chat operation without authentication. Its documented limitation is that it is read-only and only works with public chats. That limitation is acceptable here because OmniBot does not need to post messages. citeturn207736search0

This is deliberately treated as a **replaceable adapter**, not permanent platform infrastructure.

### OmniVoice as a local service

OmniVoice already exposes:
- `GET /tts/ping`
- `GET /tts/status`
- `POST /tts/generate`
- saved voice profiles
- WAV/MP3 output

The Docker distribution defaults to one concurrent GPU generation, so callers naturally queue rather than stacking GPU-heavy jobs. OmniBot still serializes its own playback so generated clips never talk over each other. citeturn207736search1

## Acceptance criteria

A streamer should be able to:

1. Start OmniVoice.
2. Run `setup.bat` once.
3. Put a channel name in `config.json`.
4. Run `self-test.bat`.
5. Run `start.bat`.
6. Type `!tts hello` in Kick.
7. Hear the result through normal Windows audio.

No moderator role. No secondary Kick identity. No cloud server. No Streamer.bot.

## Abuse controls in v0.1

The bot rejects or constrains:
- oversized messages
- URLs
- identical consecutive requests
- rapid repeat requests by the same user
- queue overflow
- configured ignored users

These are intentionally boring controls. They prevent obvious chat abuse without building a moderation platform.

## Failure behavior

### OmniVoice down at startup
Fail clearly before connecting to Kick.

### OmniVoice fails during stream
Log the error, discard that item, continue the queue.

### Kick disconnect
Rely on the transport's automatic reconnect and display the state.

### Audio playback failure
Delete the temporary file and log the Windows playback error.

## Deliberate non-goals for v0.1

- sending messages to Kick
- moderation actions
- subscriber/payment gating
- AI-generated replies
- cloud TTS
- browser overlays
- multi-platform chat
- voice cloning setup inside OmniBot
- installer/auto-updater

## v0.2 candidates

1. Friendly desktop GUI with green/red Kick and OmniVoice status lights.
2. User allowlist/blocklist editing from GUI.
3. Subscriber/mod/broadcaster eligibility rules when supported reliably.
4. Per-user queue position display.
5. Emergency mute/hotkey.
6. Dedicated Windows audio-device routing.
7. Official Kick OAuth/event adapter.
8. Single-file Windows executable packaging.

## Official API migration

Kick's official developer API is the durable long-term integration target. The reason it is not the first MVP transport is deployment friction: authenticated/event-driven app integrations require more setup than a read-only local chat listener. The architecture should therefore keep the chat source behind a small adapter boundary.

## Packaging direction

The end-state UX should be a signed `OmniBot.exe` with:

- first-run configuration
- channel-name field
- OmniVoice autodetection
- Start/Stop TTS
- queue counter
- mute button
- log pane
- no Node.js installation required

The Node MVP exists to validate behavior before spending effort on desktop packaging.
