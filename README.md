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
- **Auto-updates**: new versions install themselves. Restart the app when the panel says so.

---

## Install

### Windows
1. Download **`DiscordPresence-Setup-x.y.z.exe`** from the [latest release](https://github.com/HappyFew2309/adobe-discord-presence/releases/latest) and run it. No admin rights are needed.
2. Restart any Adobe apps that are open.

That's it. Your Discord status updates on its own whenever one of the apps is open.

> Windows may say *"Windows protected your PC"* the first time, because the installer isn't code-signed with a paid certificate. Click **More info → Run anyway**.

### macOS
Download **`DiscordPresence-x.y.z.zxp`** from the [latest release](https://github.com/HappyFew2309/adobe-discord-presence/releases/latest) and install it with the free [ZXP Installer by aescripts](https://aescripts.com/learn/zxp-installer/).

### Discord settings
- Use the **Discord desktop app**. The browser version can't show Rich Presence.
- *User Settings → Activity Privacy → Share your detected activities with others* must be on.
- If you added Adobe apps under *Registered Games* before, remove them, or you'll show two activities.

---

## Customizing

Open **Window → Extensions → Discord Presence** in any of the apps. You only need it to change things; it doesn't have to stay open.

- **Preview**: the card at the top shows exactly what your friends see right now.
- **App picker** (top right): edit the settings of any app from here, including Media Encoder and Audition, which may not show the panel themselves.
- **Text**: rewrite each line with `{variables}` (see below). Click a variable to insert it.
- **Images & links**: change the picture, or add up to 2 buttons.
- **Behavior**: privacy, idle time, the timer, the activity type (*Playing / Watching / Listening / Competing*), Premiere's auto-Watching and updates.
- **Time**: how long you've worked today, this week and per project.
- **Show on Discord**: switch it off to hide your status for that app.

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
| Nothing shows on Discord | Check the **Discord settings** above, and that the dot in the panel is green. |
| **Discord closed** in the panel | Open the Discord desktop app. It reconnects on its own, or click **Reconnect**. |
| Not in Window → Extensions | Restart the app fully. For Media Encoder or Audition, use the app picker in another app's panel. |
| Buttons don't show | Discord hides your own buttons from you. Your friends can see them. |
| Watching doesn't trigger | Premiere Pro only: the timeline has to play for the number of seconds set in the Behavior tab (10 by default). |
| Update says "can't write" | Download the new installer from the [latest release](https://github.com/HappyFew2309/adobe-discord-presence/releases/latest). |
| Anything else | Behavior tab → **Open log**, and [open an issue](https://github.com/HappyFew2309/adobe-discord-presence/issues) with what it says. |

### Uninstall
Windows: *Settings → Apps → Installed apps → Discord Presence for Adobe → Uninstall*. Your settings stay in `%APPDATA%\AdobeDiscordPresence`; delete that folder to remove them too.

---

## Privacy

Your status goes straight to the Discord app on your computer. The only internet requests are a public lookup of the Discord app's name and images, and the update check on GitHub. File paths and your time tracking never leave your computer.

---

## Building from source

See [RELEASING.md](RELEASING.md).
