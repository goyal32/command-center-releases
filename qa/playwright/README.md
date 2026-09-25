# Command Center QA harness (Playwright + Electron)

These scripts drive the **real desktop app** (Electron main process + the Command Center HTML) under a
virtual display, sign in, import the synthetic data in `../sample-data`, and walk every screen while
recording page errors, console warnings, `mailto:` links the app tries to open, and screenshots.

They were written against 0.2.46 (the source unpacked from `Command-Center-Setup-0.2.46.exe`) and run
on Linux; on Windows drop `xvfb-run` and point `SRC` in `lib.js` at your checkout.

## One-time setup (Linux CI / cloud session)

```bash
# app source checkout (package.json, main.js, src/, renderer/, and the HTML app)
cd <app-src>
npm install --no-save electron@36.9.5 playwright@1.56      # Electron version = the one in the installer
# native SQLite module for Electron's ABI (Windows builds ship win32 binaries only)
( cd node_modules/better-sqlite3-multiple-ciphers && npx prebuild-install --runtime=electron --target=36.9.5 )
```

`~/.config/command-center-desktop/config.json` (Linux) / `%APPDATA%\command-center-desktop\config.json`:

```json
{ "appHtmlPath": "<path to Command_center_universal_v120.html>",
  "allowManualFirstRun": true, "updates": { "enabled": false },
  "encryption": { "enabled": false }, "ai": { "enabled": false, "warmOnLaunch": false } }
```

The HTML app loads PapaParse / Chart.js / xlsx-js-style / JSZip / pdf.js from CDNs. If the machine has no
internet access, copy those files next to the HTML under `vendor/` and rewrite the `<script src>` URLs
(see `mkruntime.sh` in the session notes) — the app itself is otherwise fully offline.

## Configuration

`lib.js` reads `CC_SRC` (the desktop app checkout: `package.json`, `main.js`, `src/`, `renderer/`),
`CC_DATA` (defaults to `../sample-data`) and `QA_ADMIN_USER` / `QA_ADMIN_PASSWORD` (the throw-away admin account
the first run creates on the test profile — never a real account). Point `appHtmlPath` in the test profile's
`config.json` at the HTML build under test.

## Stages

| script | what it does |
| --- | --- |
| `smoke.js` | **the release gate**: fresh profile → first-run admin → import → restart → asserts dashboard restore, module globals, date sorting, calendar, e-mail bodies, MPR wizard, zero page errors |
| `stage1.js` | first-run admin creation, sign in, import Edgenuity (3 weekly files), ALE enrollment, ALE contact log, Students report; dumps every visible control and the Today card |
| `stage2.js` | Resume card, status filter, every Quick View, every View Mode, filters (advisor / teacher / school / search / ALE no-contact), every sort |
| `stage3.js` | opens every panel (Worklist, Monthly Evaluations, WSLP, Attendance, Contact Watch, Monthly Reports, Digest, History, Ask, ALE queue, ALE sync, District Overview, Contacts, Data Setup, Reminders, Messages, Calendar, EOY, Diagnostics…), student tools, email buttons (captures the mailto), exports |
| `stage4.js` | ALE log in ISO vs Excel-resaved date format; window sizes 1920×1080, 1536×864, 1366×768, 1280×720, 1024×768 |
| `stage5.js`, `stage5b.js` | regression checks for the QA fixes (startup restore, date sorting, e-mail bodies/subjects, derived calendar, Email Advisory modal, captured mailto) |
| `stage6.js` | buttons with CSS-uppercased labels (Reminders, Messages, Calendar, Diagnostics, Copy link, EOY), the MPR wizard via `window.MPR.open()`, student brief, check-in reply, user menu, export |
| `stage7.js` | do report windows open in the desktop app (EOY, brief)? |
| `stage8.js` | attaches error listeners to child windows and syntax-checks the inline scripts of report windows |
| `stage9.js` | Weekly Snapshot compare with a newer, worse import ("worsened" label) and a JSON.parse / Function hook to locate any SyntaxError |

Run one stage: `xvfb-run -a -s "-screen 0 1920x1080x24" node stage3.js` — or several in order with
`./runq.sh stage1 stage2` (Electron holds a single-instance lock, so never run two at once).
Outputs: `shots/*.png`, `<stage>.log.json` (errors, console, notes), `<stage>.out`.

Synthetic students (no real data) live in `../sample-data` and are regenerated with `python3 gen.py`
(today is pinned to 2026-09-25): on pace, slightly behind, severely behind, expired course, no recent
activity, new student, senior, missing weekly contact, archived enrollment, no email, two-teacher course,
ahead of pace.
