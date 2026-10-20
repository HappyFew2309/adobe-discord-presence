# Discord Presence for Adobe

Shows what you're actually working on in your Discord status, not just the app name. Works with **Premiere Pro, After Effects, Photoshop, Illustrator, Audition and Media Encoder** (2021 and newer).

> **Playing Premiere Pro**
> Editing Summer Trip Vlog
> Main Edit v3 · 4K · 23.976 fps
> 1:23:45 elapsed

| App | What it shows (all editable) |
|---|---|
| Premiere Pro | project, sequence, resolution, fps, clips. Play the timeline for 10 s → **Watching** with a progress bar |
| After Effects | project, comp, layers, format. **Rendering …** while the render queue runs |
| Photoshop | document, size, layers, the tool you're using |
| Illustrator | document, artboard, artboards, layers |
| Audition | session, multitrack/waveform, sample rate *(best effort: Audition's scripting is limited)* |
| Media Encoder | **Encoding Vlog Final · 40% · 3:10 left**, hidden while the queue is idle |

Also in every app:
- **Idle detection**: after 10 minutes with no changes it shows "Idle", or hides your status if you prefer.
- **Privacy**: privacy mode for everything, folders that are always private (e.g. `Clients`), or one click to keep a single project private.
- **Time tracking**: today / this week / per project, in the panel's **Time** tab and as `{todayTime}` `{projectTime}` `{weekTime}` in your status. It stays on your computer.
- **Buttons**: up to 2 links on your status (portfolio, YouTube…).
- **Auto-updates** from GitHub Releases.

---

## Install

### Windows
1. Download **`DiscordPresence-Setup-x.y.z.exe`** from the [latest release](https://github.com/HappyFew2309/adobe-discord-presence/releases/latest) and run it. No admin rights are needed.
2. Restart your Adobe apps. That's it. To change what's shown, open **Window → Extensions → Discord Presence**.

> Windows may say *"Windows protected your PC"* the first time, because the installer isn't code-signed with a paid certificate. Click **More info → Run anyway**.

### macOS
Download **`DiscordPresence-x.y.z.zxp`** and install it with the free [ZXP Installer by aescripts](https://aescripts.com/learn/zxp-installer/).

### Discord settings
- Use the **Discord desktop app**. The browser version can't show Rich Presence.
- *User Settings → Activity Privacy → Share your detected activities with others* must be on.
- If you added Adobe apps under *Registered Games* before, remove them, or you'll show two activities.

---

## Publishing it yourself

You only do this once. After that, releasing a new version is just pushing a tag.

### 1. Create the Discord apps
Discord shows the **application name** as the "Playing …" text, so you need one app per Adobe app. At <https://discord.com/developers/applications>, create apps named e.g. `Premiere Pro`, `After Effects`, `Photoshop`, `Illustrator`, `Audition`, `Media Encoder`. For each one:
- Copy the **Application ID** from *General Information*.
- Optional: upload an **App Icon**. The plugin falls back to it if no art asset matches.
- Optional: under *Rich Presence → Art Assets*, upload an image named **`logo`**.

You don't need to verify the apps, and you never need the Client Secret.

### 2. Fill in `extension/shared/distribution.js`
```js
appIds: { PPRO: '1290…', AEFT: '1290…', PHXS: '…', ILST: '…', AUDT: '…', AME: '…' },
githubRepo: 'HappyFew2309/adobe-discord-presence'
```
Application IDs are public, so shipping them is safe. Users can still put in their own ID in the panel to override yours.

### 3. Push to GitHub and tag a release
```
git init && git add . && git commit -m "Discord Presence for Adobe"
git remote add origin https://github.com/HappyFew2309/adobe-discord-presence.git
git push -u origin main
git tag v1.0.0 && git push origin v1.0.0
```
GitHub Actions (`.github/workflows/release.yml`) then runs the tests, signs the extension, builds the installer and publishes a release with the `.exe`, the `.zxp` and `checksums.txt`. You can also start it from the **Actions** tab with *Run workflow*.

**New version** = bump nothing by hand, just tag it: `git tag v1.1.0 && git push origin v1.1.0`. The tag becomes the version.

### How updates work
Each installed copy checks your repo's latest release when it starts and every 6 hours. It downloads the `.zxp` and only installs it if:
- its SHA-256 matches `checksums.txt`,
- it's this extension,
- the versions match, and
- it's signed.

It then swaps the folder in place, and the new version loads the next time the app starts. The panel shows a banner, and users can turn auto-install off (they'll get an **Install** button instead).

Security comes down to your GitHub account: whoever can publish releases on your repo can ship an update. **Turn on 2FA.** If you want to be stricter, keep one signing certificate as repo secrets `ZXP_CERT_B64` + `ZXP_CERT_PASSWORD`. Otherwise each build makes a fresh self-signed certificate, which Adobe apps accept.

### Optional: get rid of the SmartScreen warning
That needs a Windows code-signing certificate, either a regular one or Microsoft's *Trusted Signing* service. Add a signing step after `tools/build.ps1` in the workflow.

---

## Variables

Use these in any text field. Separate parts with ` · `, ` • ` or ` | `. A part whose variable is empty is hidden, so `{sequence} · 4K` turns into just `4K` when no sequence is open. In the panel, click a variable to insert it; each one shows its current value.

| Everywhere | |
|---|---|
| `{project}` / `{document}` | Project or document name (or your privacy label) |
| `{app}` `{year}` `{version}` | "Premiere Pro", "2025", "25.1" |
| `{todayTime}` `{projectTime}` `{weekTime}` | "3h 12m" |

| Premiere Pro | |
|---|---|
| `{sequence}` `{resolution}` `{format}` `{fps}` `{duration}` `{playhead}` | "Main Edit v3", "3840×2160", "4K", "23.976", "12:34", "1:01" |
| `{clipsText}` `{audioClipsText}` `{videoTracksText}` `{audioTracksText}` `{sequencesText}` `{itemsText}` | "16 clips", … |

| After Effects | |
|---|---|
| `{comp}` `{item}` `{layersText}` `{compsText}` `{itemsText}` | "Logo Reveal", "14 layers", … |
| `{rendering}` `{queuedText}` | comp being rendered, "2 items" left in queue |

| Photoshop | |
|---|---|
| `{resolution}` `{format}` `{layersText}` `{docsText}` `{dpi}` `{colorMode}` | "3000×4000", "23 layers", "2 documents", "300 ppi", "RGB" |
| `{tool}` `{historyText}` `{unsaved}` | "Brush", "41 history steps", "Unsaved changes" |

| Illustrator | |
|---|---|
| `{artboard}` `{artboardsText}` `{layersText}` `{objectsText}` `{docsText}` `{colorMode}` | "Instagram Post", "2 artboards", … |

| Audition | |
|---|---|
| `{docType}` `{sampleRate}` `{tracksText}` | "Multitrack session", "48 kHz", "6 tracks" |

| Media Encoder | |
|---|---|
| `{file}` `{output}` `{progressText}` `{timeLeft}` `{doneText}` `{failedText}` | "Vlog Final", "40%", "3:10", "2 exports done" |

Every `…Text` variable also exists as a plain number (`{clips}`, `{layers}`, …).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Not in Window → Extensions | Restart the app fully. In Media Encoder and Audition you can also configure everything from the panel in another app: use the app picker at the top. |
| **Discord closed** | Open the Discord desktop app. It reconnects on its own, or click **Reconnect**. |
| No / wrong image | The panel lists your app's Art Assets. The *App Icon* isn't an Art Asset: type `icon` to use it. Click **Reconnect** after uploading. Discord can take 10+ minutes to show new assets. |
| Watching doesn't trigger | Premiere Pro only: the timeline has to play for the number of seconds set in the Behavior tab. |
| Update says "can't write" | The extension was installed somewhere read-only (e.g. by a ZXP installer into Program Files). Download the new installer from the release page. |
| Anything else | Behavior tab → **Open log**. |

---

## Development

```
extension/              the CEP extension (what gets signed and shipped)
  CSXS/manifest.xml       hidden background service + settings panel, 6 host apps
  background/             starts with the app, polls, talks to Discord, tracks time, updates
  panel/                  settings UI, live preview, Time tab
  jsx/host.jsx            reads project info from each Adobe app (read-only)
  shared/discord-ipc.js   Discord's local IPC protocol, no dependencies
  shared/presence.js      variables, templates, privacy rules, playback detection
  shared/discord-app.js   looks up your Discord app's name/icon/art assets
  shared/updater.js       GitHub Releases updater (+ zip.js to unpack .zxp)
  shared/timetrack.js     local time tracking
  shared/distribution.js  your app IDs + GitHub repo
installer/setup.iss     Windows installer (Inno Setup)
tools/build.ps1         sign + build installer + checksums (used by CI)
tools/dev/              unsigned dev install (enables PlayerDebugMode) for testing changes
test/                   node test/run.js && node test/features.js
.github/workflows/      release pipeline
```

To try changes without making a release, run `tools\dev\dev-install.bat -Link` once and restart the app after each edit. Remote DevTools: `http://localhost:8098` (Premiere), `8099` (After Effects), `8100` (Photoshop), `8101` (Illustrator), `8102` (Audition), `8103` (Media Encoder).

Privacy: your status goes straight to the Discord app on your computer through its local pipe. The only internet requests are a public lookup of your Discord app's name, icon and art assets (every 30 min) and the update check against GitHub. File paths and time logs never leave your computer.
