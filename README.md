# OmniBot

Windows chat-to-speech for **Kick, Twitch, and YouTube**, using any sample saved in **Hangry Labs OmniVoiceTTS**.

## Start here

1. Download this repository with **Code > Download ZIP**, then **Extract All**. Do not run it inside the ZIP.
2. Start your existing OmniVoice installation.
3. Double-click **START_OMNIBOT.bat**. It prepares Node.js and the small dependency if needed, then opens the control window in your browser.
4. Enter a Kick channel, Twitch channel, or both. Click **Save settings**.
5. Click **Refresh voices**, choose a sample, and click **Test voice**.
6. Click **Start bot**. Confirm the chosen platform says **Connected**.

After setup: start OmniVoice, double-click START_OMNIBOT.bat, and click Start bot. Your settings are remembered. Keep the launcher open. **Quit** in the dashboard closes the bot. Closing the browser tab alone does not stop it.

RUN_ME_FIRST.bat and configure.ps1 remain as compatibility shortcuts to the same launcher. TEST_OMNIVOICE.bat is an optional console test after first-time setup.

## Voice commands

```
!tts samplename words to say
!tts "Sample With Spaces" words to say
!tts (Sample With Spaces) words to say
```

There is no hardcoded sample list. The bot discovers saved local profiles from OmniVoice and refreshes its cache on the next chat request after 30 seconds. **Refresh voices** updates it immediately. Matching is case-insensitive unless names differ only by case; use the exact name then. Unknown samples are rejected, never replaced with a random voice. Only the words after the sample name are spoken. Profile language/seed defaults are retained by not overriding them.

To add a sample, click **Add samples in OmniVoice**, open its **Voices** tab, upload your audio, give it a name, and save the profile. Return to OmniBot and refresh. Loose audio files not saved as OmniVoice profiles are not discoverable. OmniBot does not install the GPU model or manage OmniVoice's Docker installation.

## Platforms

| Platform | Setup | Transport |
| --- | --- | --- |
| Kick | Channel name | Public read-only kick-wss connection; unofficial |
| Twitch | Channel name | Anonymous read-only IRC over secure WebSocket; no bot account |
| YouTube | Current live-video link and YouTube Data API key | Official public live-chat API; quota applies |

Multiple platforms can run together. Each shows its own status. A platform failure does not stop the others. Cooldowns are per platform/user, and all platforms share one bounded speech queue. The bot never posts chat messages or moderates users.

### YouTube: one-time helper setup

A technical helper should create a Google Cloud project, enable **YouTube Data API v3**, and create an API key restricted to that API. Paste it into the dashboard's YouTube setup, with the actual currently live video's link. Do not enter a channel-page link. Update the video link for each new broadcast. Live chat must be enabled and publicly accessible.

The key is saved locally in `settings.local.json`, excluded from Git. The dashboard never returns the saved key to the browser. Leave the key field blank to keep it; use **Forget the saved key** to remove it. Do not share your local settings file.

YouTube consumes Google API quota. This version uses paginated polling no faster than the server's requested interval and at least five seconds apart. It skips the initial chat history, stops on permanent API errors or an ended broadcast, and backs off on temporary failures. It does not buy quota or enable billing. A quota error needs a reset or a helper to review the Google project. Long-session quota efficiency is a known limitation; streaming API support is planned.

## Controls and troubleshooting

- **Mute now** interrupts local playback, cancels the active HTTP request, and discards waiting messages. OmniVoice may finish already-started GPU work on its own server.
- **Stop** disconnects all chat sources and cancels audio. **Quit** also closes the local dashboard server.
- **Cannot reach OmniVoice:** start OmniVoice and verify its address under Settings. The default is `http://127.0.0.1:7861`.
- **No voices:** save a named profile in OmniVoice's Voices tab, then refresh.
- **Connection error:** check that platform's channel/video, internet connection, and YouTube key/quota. Stop, then Start to retry a terminal failure.
- **No sound / OBS silent:** check Windows volume and output device. Capture the same device in OBS Desktop Audio.
- **Node installation fails:** install Node.js LTS (22 or newer) from https://nodejs.org and reopen the launcher. Administrator approval or a Windows restart may be needed for the installation.
- **Already open:** use the existing OmniBot browser tab and launcher window.

Defaults: 240 spoken characters, 20-second per-user cooldown, 2-second global gap, 10 waiting messages, URL rejection and duplicate suppression. Advanced defaults are in config.json; saved local settings override them.

## Development and validation

Requires Windows PowerShell for audio and the launcher, Node.js 22+ for built-in WebSocket/fetch. Platform compatibility means streaming-platform support; macOS/Linux audio is not implemented.

```
npm ci --ignore-scripts
npm test
npm start
```

Automated tests cover sample discovery, command parsing, outgoing TTS payloads, platform normalization, YouTube history/pagination, queue bounds, cooldowns, cancellation, and dashboard access restrictions. Real GPU generation, the user's Windows/OBS audio routing, and real chat credentials still need a first-stream acceptance test. See RND.md for architecture, evidence, and release gates.
