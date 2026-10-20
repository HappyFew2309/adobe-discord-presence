# Releasing and development

Notes for maintaining this project. Users only need the [README](README.md).

## Discord apps

The Application IDs of the six Discord apps (*Premiere Pro, After Effects, Photoshop, Illustrator, Audition, Media Encoder*) and the GitHub repo used by the auto-updater live in `extension/shared/distribution.js`. Application IDs are public, so shipping them is safe. **Never** put a Client Secret, bot token or public key in the repo. Rich Presence doesn't use them.

To change the name, icon or images people see, edit the apps in the [Discord Developer Portal](https://discord.com/developers/applications). The plugin looks for an Art Asset called `logo` and falls back to the App Icon.

## Making a release

Tag a version and push it:

```
git tag v1.1.0 && git push origin v1.1.0
```

GitHub Actions (`.github/workflows/release.yml`) then runs the tests, signs the extension, builds the installer and publishes a release with `DiscordPresence-Setup-<v>.exe`, `DiscordPresence-<v>.zxp` and `checksums.txt`. The tag becomes the version, so you never edit version numbers by hand. You can also start it from the **Actions** tab with *Run workflow*.

## How updates work
Each installed copy checks your repo's latest release when it starts and every 6 hours. It downloads the `.zxp` and only installs it if:
- its SHA-256 matches `checksums.txt`,
- it's this extension,
- the versions match, and
- it's signed.

It then swaps the folder in place, and the new version loads the next time the app starts. The panel shows a banner, and users can turn auto-install off (they'll get an **Install** button instead).

Security comes down to your GitHub account: whoever can publish releases on your repo can ship an update. **Turn on 2FA.** If you want to be stricter, keep one signing certificate as repo secrets `ZXP_CERT_B64` + `ZXP_CERT_PASSWORD`. Otherwise each build makes a fresh self-signed certificate, which Adobe apps accept.

## Optional: get rid of the SmartScreen warning
That needs a Windows code-signing certificate, either a regular one or Microsoft's *Trusted Signing* service. Add a signing step after `tools/build.ps1` in the workflow.

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

Tests: `node test/run.js && node test/features.js`.
