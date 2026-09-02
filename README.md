# Stremio + — v1.0.0

Custom desktop build of Stremio (Electron + Vite + React). Bundles the local streaming server at `127.0.0.1:11470`, Supabase cloud sync, Sentry, and auto-updates. Unsigned for now — see **Bypass Gatekeeper Warnings** below.

## Requirements
- Node 20+, npm 10+
- `npm install`

## Packaging (electron-builder → `release/`)
`package.json:build` → `asar: true` (with `stremio-server/**` unpacked), sourcemaps disabled, JS obfuscated. `version: 1.0.0`.

| Command | Output (actual) | When |
|---------|--------|------|
| `npm run dist` | builds for **current** OS only | fastest on your machine |
| `npm run dist:mac` | `release/Stremio-Plus-1.0.0-x64.dmg` + `Stremio-Plus-1.0.0-x64.zip` | run **on macOS** |
| `npm run dist:linux` | `release/Stremio-Plus-1.0.0.AppImage` | run **on Linux** |
| `npm run dist:win` | `release/Stremio-Plus-Setup-1.0.0.exe` + `Stremio-Plus-Setup-1.0.0.zip` | run **on Windows** (or with Wine on mac) |

*Why `Stremio-Plus` not `Stremio +` in filenames:* `+` is not allowed in Linux `productFilename` (`AppImage`/`deb`); productName is `Stremio Plus` (package.json) while the in-app Titlebar still shows **Stremio +** (with `+` sign). The `.app`/`.exe` display name is **Stremio Plus**.

All artifacts land in `release/`. Update `productName` and `appId: com.stremio.custom` in `package.json:build` if you rename.

> Cross-building (e.g. `.dmg` on Linux) requires Docker/wine and is not reliable — build each installer on its native OS.

## Bypass Gatekeeper Warnings (app is unsigned)

You will see a system warning on first launch. This is expected while the app is not Apple/Microsoft signed. Do **one** of the options below per OS.

### macOS — `Stremio-Plus-1.0.0-x64.dmg` → `/Applications/Stremio Plus.app`
1. Open the `.dmg`, drag **Stremio Plus** to `/Applications`.
2. **First launch — Finder method (recommended):**
   - Right-click (Control-click) **Stremio Plus** in `/Applications` → **Open** → **Open** again in the dialog. This whitelists it and you won’t be asked again.
3. If you already double-clicked and got *“Stremio Plus is damaged / can’t be opened because Apple cannot check it for malicious software”*:
   ```bash
   xattr -cr "/Applications/Stremio Plus.app"
   # or stronger (removes quarantine):
   sudo xattr -rd com.apple.quarantine "/Applications/Stremio Plus.app"
   ```
   Then right-click → Open again.
4. macOS 13+ also allows: **System Settings → Privacy & Security** → scroll to *“Stremio Plus was blocked”* → **Open Anyway**.
5. Alternative one-liner (terminal):
   ```bash
   open "/Applications/Stremio Plus.app"
   # if blocked, then:
   sudo xattr -rd com.apple.quarantine "/Applications/Stremio Plus.app" && open "/Applications/Stremio Plus.app"
   ```

No `spctl --master-disable` needed.

### Linux — `Stremio-Plus-1.0.0.AppImage`
```bash
chmod +x "Stremio-Plus-1.0.0.AppImage"
./"Stremio-Plus-1.0.0.AppImage"          # run in place
# optional: integrate into app menu
./"Stremio-Plus-1.0.0.AppImage" --appimage-extract  # inspect if you want
```
If running as root or in a container you may need `./...AppImage --no-sandbox`. On Ubuntu 22.04+ if AppImage fails to mount, `sudo apt install libfuse2`.

### Windows — `Stremio-Plus-Setup-1.0.0.exe`
1. Double-click the `.exe`. SmartScreen will say *“Windows protected your PC / Unknown publisher”*.
2. Click **More info** → **Run anyway**.
3. If Defender SmartScreen still blocks after that, right-click the `.exe` → **Properties** → check **Unblock** → **Apply**, then run again.
4. Portable `.zip` (in `release/`): extract anywhere → run `Stremio Plus.exe` — same SmartScreen dialog applies.

> After the first whitelisting, later launches and auto-updates (electron-updater, checks GitHub Releases every 6h) will not re-trigger the warning.
