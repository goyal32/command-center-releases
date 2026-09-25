# QA deliverables for Command Center 0.2.46

| path | contents |
| --- | --- |
| `../QA-AUDIT.md` | the audit: critical / medium / minor bugs, teacher-UX problems, suggested improvements, what works, fixes applied |
| `fixes/` | patched `Command_center_universal_v120.html`, `main.js`, `src/laserfiche.js`, `renderer/login.html` (every change is marked `QA-fix`) and unified diffs against the 0.2.46 installer contents |
| `sample-data/` | synthetic Edgenuity / ALE / Students-report CSVs + `gen.py` (no real students) |
| `playwright/` | the Electron + Playwright harness that ran the audit (see its README) |
| `screenshots/` | selected screenshots from the runs (original build and patched build) |

Apply the fixes to the real source repository with `patch -p1 < qa/fixes/<name>.patch` (paths are `app-html/…`, `main.js`, `src/…`, `renderer/…`) or copy the four files, build,
and re-run `playwright/stage5.js` to confirm.
