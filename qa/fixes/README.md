# Production fixes for Command Center 0.2.46 → 0.2.47

Two unified diffs against the files shipped in `Command-Center-Setup-0.2.46.exe`. Nothing else in `qa/`
belongs in a release.

| patch | files touched | apply from |
| --- | --- | --- |
| `Command_center_universal_v120.html.patch` | `app-html/Command_center_universal_v120.html` (29 hunks, every change marked `QA-fix`, CRLF line endings preserved) | the folder that contains `app-html/` |
| `desktop-main-process.patch` | `main.js`, `src/laserfiche.js`, `renderer/login.html` | the desktop project root |

```bash
patch -p1 --dry-run < qa/fixes/Command_center_universal_v120.html.patch   # then without --dry-run
patch -p1 --dry-run < qa/fixes/desktop-main-process.patch
```

If a hunk is rejected, the source file has moved on from 0.2.46; open the `.rej` file and re-apply the
`QA-fix` block by hand (each is 1–15 lines). After building, run `qa/playwright/smoke.js` against the build.
