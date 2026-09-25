# QA deliverables for Command Center 0.2.46

| path | contents |
| --- | --- |
| `../QA-AUDIT.md` | the audit: critical / medium / minor bugs, teacher-UX problems, suggested improvements, what works, fixes applied |
| `fixes/` | **the only production change**: two unified diffs against the 0.2.46 installer contents (`app-html/Command_center_universal_v120.html`; `main.js`, `src/laserfiche.js`, `renderer/login.html`), every hunk marked `QA-fix` |
| `sample-data/` | synthetic Edgenuity / ALE / Students-report CSVs + `gen.py` (no real students) |
| `playwright/` | the Electron + Playwright harness that ran the audit (see its README) |
| (screenshots) | kept out of the branch on purpose (17 MB); the harness regenerates them into `playwright/shots/` on every run |

Apply the fixes to the real source repository with `patch -p1 < qa/fixes/<name>.patch` (see `fixes/README.md`), build,
and run `playwright/smoke.js` against the build. Everything outside `fixes/` is QA material and must not ship.
