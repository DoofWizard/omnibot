# OmniBot

**OmniBot** is a deliberately simple Windows bridge from public **Kick chat** to **OmniVoiceTTS**.

```
Kick chat -> !tts -> OmniBot -> OmniVoiceTTS -> Windows audio -> OBS
```

## Ryan-proof setup

For a normal Windows PC, the streamer should only have to do this:

1. Download/copy the `omnibot` folder.
2. Double-click **`RUN_ME_FIRST.bat`**.
3. Type the Kick channel name when asked.
4. Start OmniVoice.
5. Double-click **`TEST_OMNIVOICE.bat`**.
6. If you hear the test sentence, double-click **`START_OMNIBOT.bat`**.
7. In Kick chat, type:
   ```
   !tts hello from Kick
   ```

Keep the OmniBot window open while streaming.

### What RUN_ME_FIRST does

It checks for Node.js. If Node is missing and Windows Package Manager is available, it installs the official Node.js LTS package automatically. Then it installs OmniBot's one dependency and asks for the Kick channel name. The streamer does **not** have to edit JSON or run npm manually.

## No bot account or moderator role

v0.1 only reads **public Kick chat**. It does not send messages or moderate users. A separate Kick bot identity is not required, and making anything a moderator is not part of setup.

## Current verified interfaces

OmniBot v0.1 pins `kick-wss 1.0.5`. Its current documentation exposes `KickWebSocket`, `connect(channelName)`, `ChatMessage`, public-chat operation without authentication, and automatic reconnection.

OmniVoiceTTS currently documents:
- `GET /tts/ping`
- `POST /tts/generate`
- `voice_profile`
- WAV output by default or via `output_format: "wav"`

Those are the interfaces OmniBot uses.

## Default protections

- command: `!tts`
- max message: 240 characters
- per-user cooldown: 20 seconds
- global TTS cooldown: 2 seconds
- waiting queue cap: 10
- URLs rejected
- identical consecutive requests rejected
- ignored-user list
- one audio clip at a time

Advanced settings remain in `config.json`, but the streamer does not need to touch them for normal use.

## Troubleshooting

### TEST_OMNIVOICE says OmniVoice is not reachable
OmniVoice is not running at `http://127.0.0.1:7861`. Start OmniVoice first.

### Kick does not connect
Run `configure.ps1` again, or rerun `RUN_ME_FIRST.bat`, and enter only the Kick channel name—not the whole URL.

### The bot says TTS happened but OBS cannot hear it
OmniBot plays through the normal Windows output device. OBS should capture that device as Desktop Audio.

### Chat is abusing TTS
Increase `userCooldownSeconds`, lower `maxQueueLength`, or add usernames to `ignoreUsers` in `config.json`.

## Transport note

v0.1 uses `kick-wss 1.0.5` because it gives us the lowest-friction read-only public chat connection. It is an unofficial transport, so a future Kick-side change can require an OmniBot update. The TTS and queue code are intentionally isolated from that choice so we can replace the transport later without rebuilding the whole bot.

## Status

**v0.1.0 — functional MVP / first-stream validation build**

Before treating it as appliance-grade software, test it against the streamer's actual Kick channel and actual OmniVoice installation once.

## Safety and voice rights

OmniVoice supports voice cloning. Use voices you have authorization to use. Do not use OmniBot for deceptive impersonation, fraud, harassment, or other misuse.
