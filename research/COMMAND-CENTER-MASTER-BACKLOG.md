# Command Center — Master Implementation Backlog

**Status:** documentation only. Consolidated 2026-09-25 from `QA-AUDIT.md`, `COMMAND-CENTER-NEXT-GEN.md`,
`COMMAND-CENTER-BRAIN-V1-SPEC.md` (Rev C), `COMMAND-CENTER-BRAIN-V1-VALIDATION.md`, `COMMAND-CENTER-APPLICABILITY-MODEL.md`,
`COMMAND-CENTER-BRAIN-V1-MIGRATION-MAP.md`, `COMMAND-CENTER-MPR-VOCABULARY-TRACE.md`, `HISTORY-TRENDS-0.2.46-AUDIT.md`.
No production code, no patches, no release.

**Status values:** `PATCHED-VERIFY` = already fixed in the existing QA patch (`qa/fixes`, applied to the unpacked
0.2.46 runtime, verified by `smoke.js`) and needs re-verification against the real source before release;
`IMPLEMENT` = needs implementation; `VERIFY-SOURCE` = needs source-code verification before deciding;
`BRAIN` = Brain migration item; `POLICY` = district policy decision; `UX` = UX improvement; `DEPRECATE` = deprecate later.
**Priority:** P0 incorrect/safety-critical · P1 important correctness · P2 workflow/UX · P3 future architecture.
**Evidence keys:** QA = QA-AUDIT (C/M/m ids), HT = HISTORY-TRENDS audit ids, VAL = validation report, APP = applicability
model, MAP = migration map, MPR = vocabulary trace, NG = next-gen research, SPEC = Brain spec.
**Release keys:** R47 = 0.2.47, R48 = 0.2.48, R49 = 0.2.49, BF1–BF4 = Brain foundation releases (MAP §8 order), LATER.

## 0. Reconciliation of findings that several audits reached independently

| Underlying bug | Reported as | One backlog item |
| --- | --- | --- |
| ALE contact dates compared as text (M/D/YYYY vs ISO) | QA C2; HT C-H2, I-H1, §4.3 (dashboard flags all students; Sunday contact invisible); VAL I-7; MAP §2 dates row | MB-020 (patched; History's own table was never affected) |
| Two calendars, stale 2025-26 block still consumed | QA C3; HT B-H3, I-H2 (Espinoza "20+" at 19 school days), §4.6; MAP §2 school-day row; VAL C-3/E-22 | MB-030 (patched) + MB-031 (single calendar service) + MB-035 (audit sub-panel) |
| Weekly snapshot auto-saved on every import → compare never changes | QA M19 (+M6 labels); HT C-H1, §3.9 | MB-060 (patched), MB-061 (patched) |
| History weekly patterns parse `YYYY-MM-DD` as UTC → Sunday contacts shift | QA M7; HT §4.2 (not reproduced with timestamps in the fixture) | MB-062 (patched; verify with date-only fixture) |
| Archived enrollments leak into dashboard/quick views/Today/worklist | QA M3, m29; HT I-H4, §5.12; VAL C-14 | MB-050 |
| "Behind" defined four ways; blank pacing handled as best/worst | QA M1; HT C-H3, I-H7; MAP §2 classification row; VAL C-14/I-2 | MB-040, MB-042 |
| Weekly contact computed in nine places | QA M11/M1; HT I-H1, §4.1; MAP §2; APP §7 | MB-021 (Brain) with MB-022/023/024 interim fixes |
| Days-without-contact: weekdays (stale calendar) vs calendar days vs school days | QA m22; HT I-H2, §7 | MB-032 with MB-031 |
| MPR vocabulary / proposal logic / drafts / submitted state | QA M8, M9, M10, M16, m5, m6; MPR trace §7; VAL C-3, C-4, C-12; SPEC Rev C | MB-090…MB-103 |
| History student-level "Improved/Worsened" hides mixed courses | HT C-H4, §6; VAL I-5 (risk score) ; QA m13 baselines | MB-063, MB-064 |
| Blue e-mail button opens ALE for everyone | APP §5; QA UX 10; NG Part 5 | MB-115 |
| Module-global lost after a one-line comment (MPR SyntaxError during QA) | QA §7 lesson; VAL §10 L9 gate; MAP step 2 | MB-105 |

---

## 1. Backlog

Columns: ID · Issue · Module · Evidence · User impact · Proposed change · In QA patch? · Tests · Dependency · Status · Pri · Release.

### 1.1 Startup, data safety, main process

| ID | Issue | Module | Evidence | Impact | Proposed change | QA patch? | Tests | Dep. | Status | Pri | Rel. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MB-001 | Dashboard never restores at launch (TDZ on `__statusFilterSelection` / `__POLICY_SORTS`); every teacher sees "Resume" | core startup | QA C1; HT §2 (reproduced) | Every launch looks broken; History button hidden until Resume | Hoist declarations; move restore calls to the end of the core script | Yes | smoke: fresh-profile launch shows 12 students, no Resume, 0 page errors | — | PATCHED-VERIFY | P0 | R47 |
| MB-002 | Quit closes SQLite before the final backup | main.js | QA M12 | Last backup of the day can fail silently | `storage.close()` in `will-quit`; `before-quit` sets `app.isQuitting` | Yes (main patch) | close log shows no "connection not open" | — | PATCHED-VERIFY | P1 | R47 |
| MB-003 | Auto-backups written from the sign-in page contain no student data | main.js `runAutoBackup` | QA M13 | Empty backups | Skip auto-backup when no session | Yes | backup file size/contents check | — | PATCHED-VERIFY | P1 | R47 |
| MB-004 | Laserfiche fill uses string `replace` so `$&`/`$'` in narrative corrupts the injected script | src/laserfiche.js | QA m7 | Form fill fails on some narratives | Replacement callback | Yes | unit: narrative containing `$&` | — | PATCHED-VERIFY | P1 | R47 |
| MB-005 | First-run auto sign-in failure hides every form | renderer/login.html | QA m8 | Stuck first run | `setMode('login')` | Yes | manual first-run failure path | — | PATCHED-VERIFY | P2 | R47 |
| MB-006 | `auth:login` accepts a second identity while a session exists | src/ipc.js | QA m19 | Wrong user attribution in audit | Reject login while a session is active | No | unit on ipc guard | — | IMPLEMENT | P1 | R48 |
| MB-007 | Logout during an in-flight ALE sign-in leaves the next user on the previous ALE session | src/aleSync.js | QA M15 | Cross-user ALE writes | Cancel in-flight login and `forget` on logout | No | integration: logout mid-login | — | IMPLEMENT | P1 | R48 |
| MB-008 | Admin "temporary password" promise not kept | users IPC / admin.html | QA M14 | Confusing account setup | Implement forced change on first login or reword | No | admin flow test | — | IMPLEMENT | P2 | R48 |
| MB-009 | `app.isQuittingForUpdate` never reset if `quitAndInstall` fails | src/updater.js | QA m21 | Silent failed updates | Reset flag on failure | No | unit | — | IMPLEMENT | P2 | R48 |
| MB-010 | OneDrive discovery scans every 30 s on the main thread with no folder configured | src/districtSync.js | QA m20 | CPU / IO churn | Scan only when configured; backoff | No | timing test | — | IMPLEMENT | P2 | R49 |
| MB-011 | No guard against a module global disappearing after load (class of the MPR `SyntaxError` found in QA); DH-05 watchdog | build/test + core | QA §7; VAL §10 L9; SPEC DH-05 | A single bad comment removes a whole feature silently | Per-module syntax check + `window.MPR`/module-global assertion in `smoke.js`; later DH-05 | Test only | CI gate | MB-105 | IMPLEMENT | P1 | R47 |

### 1.2 Weekly contact and ALE contact data

| ID | Issue | Module | Evidence | Impact | Proposed change | QA patch? | Tests | Dep. | Status | Pri | Rel. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MB-020 | ALE contact dates sorted as text: Excel-format logs mark every student "No Contact This Week"; mixed formats flip individual students; Sunday ISO contact invisible to the dashboard | core `__parseAleContactLog`, `__aleStudentTypeContactDatesByStudentNumber`, missed-last-week, risk, Today | QA C2; HT C-H2, §4.3, §7 | Wrong compliance pills, quick views, Today card for whole caseload | `__aleContactDateTs` date-aware sort in the parser and every consumer | Yes | fixture `ALE_Contact_Log_excel_dates.csv` and the Sunday variant: dashboard, quick views, Today, ALE Patterns all agree with History's table | — | PATCHED-VERIFY (confirm the ALE Contact Patterns `last` map and `__aleLastContactByStudentNumber` are covered) | P0 | R47 |
| MB-021 | Weekly contact computed independently in nine modules (core override chain, digest, banner, Contact Watch, MPR, Today, worklist, attendance, e-mail click history) | many | QA M1/M11; HT I-H1, §4.1; MAP §2; APP §7 | Modules disagree on the same student | One WC-01 implementation (Brain rule engine); shadow-compare against the History Weekly Check-ins table (the only one verified correct) | No | shadow diff = 0 for weekly contact over the fixture | MB-130, MB-131 | BRAIN | P1 | BF3 |
| MB-022 | History "ALE Contact Patterns" counts any contact type (Teacher Initiated, Parent) and one date per student | ipal-history-redesign-v36 `computeAleWeeklyPatterns` | HT §3.7, I-H1 | Panel contradicts its own table ("8 contacted" vs "4 not contacted") | Use student-type dates; or remove the section (its footnote concedes the limit) | No | HT fixture: Chen not counted | — | DEPRECATE (hide in R49) | P1 | R49 |
| MB-023 | Attendance module uses Monday-based weeks while every other consumer is Sunday-based | ipal-attendance-v139 `mondayOfThisWeek` | HT I-H5, §4.1 | Sunday attendance completions attributed to the wrong week | Sunday week via the shared week helper | No | Sunday completion fixture | MB-131 | IMPLEMENT | P1 | R48 |
| MB-024 | Contact Watch decisions share one storage key (collision) | ipal-contact-watch-v143 | QA M11 | Decisions overwrite each other | Key by student + week | No | two students, same week | — | IMPLEMENT | P1 | R48 |
| MB-025 | Duplicate-contact heuristic blocks legitimate ALE writes with no override | ale queue / aleApproval | QA M17 | Teacher cannot log a second same-day call | Override with note | No | queue test | — | IMPLEMENT | P2 | R49 |
| MB-026 | Contacts written by the app but not yet seen in a pull are not modelled (pending/unverified) | ale queue | VAL C-8, E-26; SPEC `verification_state` | False "no contact" between write and pull | Brain `verification_state` + Warning confidence | No | WC02-Pending | MB-130 | BRAIN | P2 | BF2 |
| MB-027 | Contact records missing WAC evidence fields (method, subject) are never flagged | — | SPEC WC-08; NG Part 2 | Audit gaps | Brain WC-08 | No | WC08-* | MB-142 | BRAIN | P3 | BF3 |
| MB-028 | Row shows "LAST CONTACT: 9/20" (a Teacher Initiated entry) beside "20 days without an ALE student contact" | core Records List pills | QA UX 5; HT §7 | Contradictory row | Label the pill with type and whether it counts | No | fixture Chen row text | — | UX | P2 | R49 |
| MB-029 | App-side e-mail click counts as "contacted this week" in the app but never in ALE | core `__recordWeeklyEmailClick`, autolog | QA UX 5; APP §5; SPEC WC-07 | Teachers believe an e-mail satisfied the week | Record as outbound `email_record`; WC-07 follow-up | No | WC07-* | MB-115 | BRAIN | P2 | BF3 |

### 1.3 Calendar, school days and day counts

| ID | Issue | Module | Evidence | Impact | Proposed change | QA patch? | Tests | Dep. | Status | Pri | Rel. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MB-030 | Legacy `TENANT_CONFIG.calendar` (2025-26) still consumed by hs-policy, WAC panel, audit panel, Free Movement, reminders | ipal-tenant-config-v1 + consumers | QA C3; HT B-H3, §4.6 | Wrong holidays, 15/20-day counts, deadlines; audit months from 2025 | `deriveLegacyCalendar()` builds `calendar` from `school_calendar`; static block rolled | Yes | assert `TENANT_CONFIG.calendar` year, closures incl. Labor Day; verify `schoolYear`/`breakWeeks` keys used by the audit sub-panel are also derived | — | PATCHED-VERIFY (audit-panel keys) | P0 | R47 |
| MB-031 | Three `isSchoolDay`, `businessDaysBetween`, MPR `isWorkingDay`, aleSync `weekOf` — no single calendar service | fm-script, wac-v129, school-calendar-v147, hs-policy, mpr, aleSync | MAP §2; VAL §10 L1; SPEC §2.8 | Every module counts days differently | One `school_calendar` service; legacy functions become shims with disagreement logging | No | VAL §9 date cases (IP01-Holiday/Break, WC05-B1/B2) | MB-030 | BRAIN | P1 | BF1 |
| MB-032 | Today card "20+ days without contact" uses calendar days; quick views use weekdays; correct is school days (Espinoza: 27 / 20 / 19) | ipal-today-v151, hs-policy quick views | QA m22; HT I-H2, §7 | Same student appears in different tiers | Both read the shared school-day count | No | Espinoza tier = 15–19 on 9/25, 20+ on 9/28 | MB-031 | IMPLEMENT | P1 | R48 |
| MB-033 | Snapshot/History day keys use `toISOString()` of local midnight (wrong east of UTC) | core, redesign | QA m23; HT §4.2 | Latent for non-US installs | Local `YYYY-MM-DD` formatter | No | TZ=Europe test | — | IMPLEMENT | P2 | R49 |
| MB-034 | ALE-patterns week windows built with ms arithmetic drift one hour across DST | redesign `computeAleWeeklyPatterns` | HT B-H5 | One wrong-week contact per autumn | Calendar-safe `setDate` | No | DST fixture | — | IMPLEMENT | P2 | R49 |
| MB-035 | "Advisor Contact Audit" sub-panel needs the bulk archive, hard-codes 2025-26 breaks and reports "No contact archive found" on a normal install | ipal-audit-panel-v77-16-7 | HT B-H3, §4.6 | Dead feature inside History | Hide unless archive present (R48); superseded by the Brain exceptions report | No | panel absent without archive | MB-141 | DEPRECATE | P1 | R48 |
| MB-036 | Uncertain calendar days, count-day dates and deadline derivations not modelled | — | SPEC §2.8; VAL E-22/E-28 | Deadlines cannot be explained | Brain deadline engine | No | deadline table | MB-031 | BRAIN | P3 | BF2 |

### 1.4 Pacing, "behind", expiry and missing data

| ID | Issue | Module | Evidence | Impact | Proposed change | QA patch? | Tests | Dep. | Status | Pri | Rel. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MB-040 | "Behind" defined four ways (tile, Today, quick views, MPR); four label vocabularies for one fact | core, hs-policy, plc-view, today, mpr, leadership | QA M1, UX 4; HT I-H7; MAP §2 | Teacher cannot reconcile counts | One classifier (Brain §2.2 buckets); thresholds as T1 policy | No | classifier unit tests; shadow diff | MB-130 | BRAIN + POLICY | P1 | BF1 |
| MB-041 | "Expired" judged against the clock on most screens and against midnight in the Expired quick view | core | QA M2 | A course flips state during the day | `target_date < today (local midnight)` everywhere | No | boundary test PR03-B2 | — | IMPLEMENT | P1 | R48 |
| MB-042 | Blank Pacing → History bucket "Unknown" weighted worse than Extremely Behind (counted "Worsened", lowers severe); dashboard shows the same row "ON TARGET" | core `getProgressBucketFromPacing`, compare, dashboard gap | HT C-H3, §3.9 | Missing data reported as change in both directions | Unknown is neither improved nor worsened and never on target; show "not evaluable" | No | 09_29 blank-cell fixture | — | IMPLEMENT | P1 | R48 |
| MB-043 | MPR four-tier summary uses different inputs than dashboard buckets (max gap, failing count, expired count) | ipal-mpr-v146 | MPR §2; SPEC MP-P1 Rev C | Dashboard "Watch List" student is "Unsatisfactory" in MPR | Keep the form vocabulary; make thresholds T1 policy; print the rule on the wizard row | No | MPP-* parity | MB-040 | POLICY + BRAIN | P2 | BF3 |
| MB-044 | Pacing-drop alerts fire for students still on pace (every student in a three-file history) | worklist chip; Brain PR-02 draft | VAL I-2; HT §6.5 | Noise | Require resulting bucket ≤ Watch and minimum drop | No | PR02-N1 | — | BRAIN | P2 | BF3 |

### 1.5 Archived / active students and roster

| ID | Issue | Module | Evidence | Impact | Proposed change | QA patch? | Tests | Dep. | Status | Pri | Rel. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MB-050 | Archived enrollments counted on the dashboard, quick views, Today ("Risk jumped for … Mateo I."), worklist; excluded by History, Contact Watch, Leadership (patched) | core filters, today, worklist | QA M3, m29; HT I-H4, §7 | Archived students in outreach lists | One `is_active` predicate on `Enrollment Status` + ALE status, applied at import | Partial (Leadership reads `Enrollment Status`) | Ibarra absent from every list; RS-02 cases | — | IMPLEMENT | P1 | R48 |
| MB-051 | Withdrawn-and-re-enrolled students show an unbroken history; no enrollment episodes | History, Brain model | HT §5.12; VAL E-16 | Counters and history mislead | Enrollment episodes; counters reset per policy | No | RS01-Return | MB-130 | BRAIN + POLICY (D-11) | P2 | BF2 |
| MB-052 | Advisor derived from two sources that can disagree (External ID token vs ALE advisor) | core, mpr, queue, snapshots | MAP §2; VAL C-13 | Caseload views disagree after a change | `program.advisor_source`; RS-03 mismatch finding | No | RS03-Disagree | MB-130 | BRAIN | P2 | BF2 |
| MB-053 | Six `parseCsv` copies and seven SID/name extractors | many | MAP §2 | Divergent parsing | One normaliser with shims | No | fixture parity | — | BRAIN | P2 | BF1 |

### 1.6 Snapshots, History & Trends, worklist trends

| ID | Issue | Module | Evidence | Impact | Proposed change | QA patch? | Tests | Dep. | Status | Pri | Rel. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MB-060 | Weekly Snapshot Compare always compares an import with itself ("No major changes" after a 24-point drop) because auto-save overwrites the snapshot on every import | core `autoSaveWeeklySnapshotSilently` | QA M19; HT C-H1, §3.9 | Feature non-functional | Auto-save only when the saved snapshot is older than a week | Yes | stage 9 / HT S8: worsened 20 after 09_26 | — | PATCHED-VERIFY | P0 | R47 |
| MB-061 | Snapshot "Top Changes" labelled worsened when improved | core `renderSnapshotComparison` | QA M6 | Wrong direction | Label fix | Yes | improved fixture | — | PATCHED-VERIFY | P1 | R47 |
| MB-062 | History weekly patterns parsed date-only strings as UTC → Sunday contacts shift a week | redesign | QA M7; HT §4.2 (not reproduced with timestamps) | Wrong "contacted this week" for date-only logs (ALE sync bundles) | Local date parse | Yes | date-only contact log fixture | — | PATCHED-VERIFY (add date-only fixture) | P1 | R47 |
| MB-063 | Three different "7-day baseline" rules (core ≥ 3.5 days, redesign nearest, worklist 10-day window) | core, redesign, quickwins | QA m13; HT B-H4, §6.5 | Same day, different comparisons | One baseline rule (min age, gap-aware label) | No | consecutive-day imports fixture | — | IMPLEMENT | P2 | R49 |
| MB-064 | Student-level "Weekly Change" averages course deltas; a completed course reads "Dropped 18 pts"; on-pace slippage reads "Dropped" in red | core `renderInlineStudentHistory` | HT C-H4, §5.9, §6 | Misleads in MPR/parent conversations | Short term: exclude completed courses, label as average, neutral colour while on pace; long term: per-course sentences only | No | Gutierrez/Alvarez fixtures | — | IMPLEMENT (then DEPRECATE) | P1 | R48 |
| MB-065 | Monthly "Avg Weekly %" averages in a week that has not happened (0 %) | redesign `renderMonthlySummary` | HT B-H1, §3.8 | Every advisor under-reported by a full week | Completed weeks only | No | STA = 56.3 % on the fixture | — | IMPLEMENT | P1 | R48 |
| MB-066 | Partial-month day counts off by one (26 for 25) | redesign | HT B-H2 | Wrong banner text | Date-only arithmetic | No | banner text | — | IMPLEMENT | P2 | R49 |
| MB-067 | Monthly denominators ignore plan start/end (weekly table honours them) | redesign | HT I-H6, §7 | New students count as missed before enrolment | Reuse the weekly table's span logic | No | Foster fixture | — | IMPLEMENT | P1 | R48 |
| MB-068 | 🕘 History button missing when grouped by Name, Course Name or Student Summary | core `renderGroupTable` | HT B-H6 | Hard to reach | Render in every grouping | No | button count per grouping | — | UX | P2 | R49 |
| MB-069 | "Today vs 7 Days" / "Weekly Change" labels do not adapt to 10- or 14-day gaps; "Since Sep 11 (14 days ago)" relative to real today | core, redesign | HT U-H1, §5.7 | Misleading span | Label with the actual span | No | missing-week fixture | MB-063 | UX | P2 | R49 |
| MB-070 | Same-day re-export silently replaces the earlier entry in the view (storage keeps both) | core `dedupeHistoryEntries` | HT U-H2, §5.5 | Cannot see both | "Two imports on {date}; showing the later" note | No | (1) fixture | — | UX | P2 | R49 |
| MB-071 | No markers for course start, completion, expiry, drop, archived period in the timeline | core inline history | HT U-H3, §5.8–5.12 | Cannot tell real change from a course change | Student Evidence timeline (Brain) | No | 09_28 fixture | MB-143 | BRAIN | P2 | BF3 |
| MB-072 | Progress rounded to whole percent (1.3 → "1 %") | core inline history | HT U-H5 | Hides gains the MPR counts | One decimal | No | Chemistry 1.3/5.5 | — | UX | P2 | R49 |
| MB-073 | Two "Edgenuity Progress" blocks (legacy cards + redesign tiles) with different baselines | core + redesign | HT U-H6 | Duplicate, contradictory | Hide the legacy block once MB-063 lands | No | panel text | MB-063 | DEPRECATE | P2 | R49 |
| MB-074 | Worklist trend chip reads the raw store (no same-day dedupe), uses min pacing across courses, flags on-pace students "declining" | ipal-quickwins-v130 | HT §6.5, I-H1 | Noise on every row | Reuse the History baseline and per-course deltas | No | Alvarez shows no chip | MB-063 | IMPLEMENT | P1 | R48 |
| MB-075 | Worklist inactivity one day lower than the dashboard (14 vs 15) | ipal-worklist-v122 `daysBetween` | HT I-H3 | Contradiction | Date-only day math | No | Chen = 15 | — | IMPLEMENT | P1 | R48 |
| MB-076 | Data-backup card inside the History panel; two backup concepts (`.ccbackup` vs Export All Data) | anon-034, main | QA m28; HT §8 | Confusion | Move the card to the Data strip; explain both | No | — | — | UX | P2 | R49 |
| MB-077 | "File Date: Sep 11, 2026 12:00 PM" prints a synthetic noon | core history log | HT U-H4 | Looks like a real time | Date only | No | — | — | UX | P3 | R49 |
| MB-078 | History not scoped by the dashboard who-filters (Today and worklist are) | history | HT P-H3 | Program-wide numbers for an advisor | Apply scope | No | advisor filter fixture | — | UX | P2 | R49 |
| MB-079 | Back-fill module writes historical exports to the `snapshots` store, which History never reads | ipal-edgenuity-snapshots | HT §1.2 | Back-filled history invisible in the panel | Confirm intent in source; write to `edgenuity_imports` or read both | No | back-fill fixture | — | VERIFY-SOURCE | P2 | R48 |
| MB-080 | "Worked Today" uses rounded hours (8 pm yesterday reads today) | core `workStatusMeta` | QA m12 | Wrong badge | Date-only | No | boundary | — | IMPLEMENT | P2 | R49 |
| MB-081 | Attendance baseline = last import, not end of week; MPR attendance credit dated by import snapshot; nudge fires for every student | ipal-attendance-v139, mpr, att-newstudents | QA m16, m17, m18 | Wrong attendance weeks and nudges | Baseline on week end; date by gradebook entry; nudge only for real new starts | No | attendance fixtures | MB-023 | IMPLEMENT | P2 | R48 |

### 1.7 Monthly Progress Report (MPR)

| ID | Issue | Module | Evidence | Impact | Proposed change | QA patch? | Tests | Dep. | Status | Pri | Rel. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MB-090 | Teacher-only panel warnings leaked into the family-facing Laserfiche narrative | ipal-mpr-v146 `openForm` | QA M8 | Families see internal warnings | `stripPanelWarnings(html)` | Yes | narrative contains no warning markup | — | PATCHED-VERIFY | P0 | R47 |
| MB-091 | Communication status wrong with one judged week | mpr `evaluate` | QA M9 | Wrong proposal early in the month | Order of checks | Yes | MPP-Comm week 1 | — | PATCHED-VERIFY | P1 | R47 |
| MB-092 | Narrative "by Email on today" with no direct contact; deadline countdown used `new Date()` vs `todayDate()` | mpr | QA m5, m6 | Wrong text/dates | Fixed wording; `todayDate()` | Yes | narrative text | — | PATCHED-VERIFY | P2 | R47 |
| MB-093 | MPR drafts, edits and prepared state are memory-only (lost on restart) | mpr `state.edits/prepared/filled` | QA M10; SPEC §2.4 | Lost work | Persist to IndexedDB now; Brain `evaluation` table later | No | restart mid-wizard | MB-130 | IMPLEMENT (R48) → BRAIN | P1 | R48 |
| MB-094 | "Submitted" can be recorded for a form that was never submitted | mpr `applySubmitted`/watch | QA M16; MPR §3 | False compliance record | Require the submit signal; keep `submitted_*` read-back separate | No | submit/no-submit fixtures | — | IMPLEMENT | P1 | R48 |
| MB-095 | Blank Progress Status at finalize defaults to "Satisfactory" | mpr `finalize` | MPR §3, §7.5 | Silent satisfactory determination | Store `not_stated`; keep evaluation open | No | blank-status form | — | IMPLEMENT | P1 | R48 |
| MB-096 | Ledger keeps only `satisfactory/unsatisfactory`; summary and communication tiers are lost | mpr `recordEvaluation`, wac ledger | MPR §5 | Audit cannot reconstruct the evaluation | Brain `evaluation` with proposed/confirmed/submitted fields | No | evaluation model tests | MB-130 | BRAIN | P2 | BF3 |
| MB-097 | Second evaluator in the core (`generateMPRComment`) uses days-since-contact for communication and disagrees with the module | core | MPR §2, §7.6 | Two answers on one screen | Delegate to `MPR.evaluate`; then retire behind `brain.mpr` | No | parity test | — | DEPRECATE | P2 | R49 |
| MB-098 | Snapshot-compare card titled "No Progress" collides with the MPR tier of the same name | core snapshot cards | MPR §3 | Confusion | Rename to "No change" | No | — | — | UX | P3 | R49 |
| MB-099 | MPR judged weeks ignore plan start (Foster judged for weeks before enrolment) | mpr `schoolWeeks/judged` | HT I-H6 | Wrong communication tier for new students | Required-week rule (plan start); D-9 | No | MP01-Partial | MB-021 | IMPLEMENT + POLICY | P1 | R48 |
| MB-100 | MPR `daysSince` uses any contact type (Chen shows 5 days via a Teacher Initiated e-mail) | mpr `evaluate` | MPR trace (h3/h4 runs) | Misleading fallback tier | Student-type contacts only, or remove the fallback | No | Chen daysSince = 23 | — | IMPLEMENT | P2 | R48 |
| MB-101 | Form option strings hard-coded in three places; not configurable | mpr, core, laserfiche | MPR §1–2; SPEC Rev C | Any form change is a code change | T2 `mpr.form_vocabulary` mapping | No | form fill/read-back | MB-136 | BRAIN | P2 | BF3 |
| MB-102 | No path to record an evaluation when the month ends without a direct personal contact | mpr / Brain MP-03 | VAL C-3 | Deadlock | `no_dpc_attestation` | No | MP03-AfterMonth | MB-142 | BRAIN + POLICY | P2 | BF3 |
| MB-103 | Bulk "confirm all" style shortcuts convert proposals into determinations in one click | mpr wizard / Brain packet | VAL C-12; SPEC §7.6 | Rubber-stamping risk | Confirm-selected with per-row review | No | MP-Bulk | MB-142 | BRAIN | P2 | BF3 |
| MB-104 | Wizard shows tokens ("Unsatisfactory / No Communication") without the rule; Step 1 "Connect" always shown; plan lives in another panel with no link; jargon ("1 first-claim", "Board Report") | mpr, monthly evaluations | QA UX 13, §4 | New teachers stall | Rule text per row; hide connected steps; link plan; plain labels | No | wizard text | — | UX | P2 | R49 |
| MB-105 | Build has no per-module syntax/global gate; the QA fix itself once broke the MPR module | build | QA §7 | Whole module vanishes silently | CI: `new Function` per script block + `smoke.js` module-global assertions | Test only | CI | — | IMPLEMENT | P1 | R47 |
| MB-106 | Intervention plans, checkpoints and escalation (5-school-day deadline, month 2/3) are manual and unexplained | wac-v129, mpr ledger | NG Part 6; SPEC IP-01..05; VAL C-7 | Missed legal deadlines | Brain IP rules with deadline derivations | No | IP* cases | MB-036, MB-142 | BRAIN + POLICY (D-2) | P2 | BF4 |

### 1.8 E-mail, external actions, applicability

| ID | Issue | Module | Evidence | Impact | Proposed change | QA patch? | Tests | Dep. | Status | Pri | Rel. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MB-110 | Bulk e-mail sent the wrong letter for six quick views | core `__policyCommonMessage` | QA C4 | Wrong letters to families | Bodies per view; 10-day paragraph only for new-enrollment views | Yes | `__policyCommonMessage(view)` text per view | — | PATCHED-VERIFY | P0 | R47 |
| MB-111 | Subjects fell back to bare "Reminder"; "Hello Students," in an individual letter | core | QA M4, M5 | Unprofessional | Subject order + greetings | Yes | `__getEmailSubject` per view | — | PATCHED-VERIFY | P1 | R47 |
| MB-112 | Group subject "(Current Filters)" for names containing "all"; accented names lose letters; 3-letter first names dropped; BCC body lost on long links | core name/e-mail helpers, advisory e-mail | QA m1–m4 | Wrong names in letters | `/^all\b/i`, `\p{L}`, name rule, body in clipboard | Yes | names fixture (José, Zoë, Eva Maria) | — | PATCHED-VERIFY | P1 | R47 |
| MB-113 | "Download Missing Email List" handler never attaches; five dead `buildBulkPolicyMailto` wrappers; 10 %-rule paragraph repeated three times | modules 004–011 | QA m9, m10, m11 | Dead button; noisy letters | Fix handler order; delete dead code; one paragraph | No | letter text | — | IMPLEMENT | P2 | R49 |
| MB-114 | Five ways to e-mail with no preview; buttons do not say what they send | core, advisory | QA UX 10 | Wrong e-mail sent | One preview-first composer; button labels | No | Playwright per entry point | MB-115 | UX | P2 | R49 |
| MB-115 | Roster envelope / AI e-mail / smart template open the ALE student page for every student, including non-ALE; no applicability | core `openAleStudentWindow` sites | APP §5, §7; NG Part 5 | Wrong system opened; CR students treated as ALE | External Action Policy adapter with `compat` mode until the wizard is confirmed | No | APP §10 e-mail cases | MB-120, MB-138 | BRAIN | P1 | BF3 |
| MB-116 | E-mail entry points not logged as contact evidence consistently (autolog only for some paths) | autolog-v128, advisory | MAP §1.2; APP §5 | Missing evidence | `contact.record_local` always | No | e-mail evidence tests | MB-115 | BRAIN | P2 | BF3 |
| MB-120 | ALE rules assumed for every student; only heuristics (CR prefix, `cr_teachers`) exist; T0 read as "applies in Washington" | tenant config, recon, all rules | APP §1–§8; VAL §12 | Non-ALE students get weekly-contact and MPR duties; CR teachers nagged for ALE files | Regimes, applicability gate, L2–L6 hierarchy, AP-01..03, first-run administrator wizard | No | APP §10 fixtures; property test | MB-136 | BRAIN + POLICY (D-14..16) | P1 | BF2 |

### 1.9 Brain v1 foundation (architecture)

| ID | Issue | Module | Evidence | Impact | Proposed change | QA patch? | Tests | Dep. | Status | Pri | Rel. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MB-130 | No normalised student/enrollment/contact/import model; renderer stores are the truth | new `brain_*` tables, `brain:ingest`, one-way sync | SPEC §2; MAP §3 | Every module re-parses | Migration v4; one-way sync from legacy stores | No | ingest idempotency; fixture row counts; backup round-trip | MB-131, MB-053 | BRAIN | P3 | BF1 |
| MB-131 | Shared primitives absent (calendar, date parsers, normalisers, config layer) | new helpers + shims | MAP L1 | see MB-031/053 | Build first, with disagreement logging | No | VAL §9 date cases | — | BRAIN | P3 | BF1 |
| MB-132 | Data confidence is binary; coverage horizons and pending contacts not modelled | Brain confidence engine | VAL C-8, §5.2; SPEC §2.7/§2.10 | False "no contact" from stale/partial sources | Four-level confidence with horizons | No | WC01-S, WC02-Pending, DH04-P | MB-130 | BRAIN | P3 | BF2 |
| MB-133 | One problem → many tasks; no case/step dedup | Brain case engine | VAL C-6, §6 | Teacher click load | Case/step model | No | VAL §6.2 example | MB-142 | BRAIN | P3 | BF3 |
| MB-134 | "Unjustified" inferred by software; past-week tasks unclosable | Brain WC-01/03/04 | VAL C-1, C-2 | Legal actions from inference | Acknowledgment outcomes; language rules | No | WC03-*, forbidden-word test | MB-133 | BRAIN | P3 | BF3 |
| MB-135 | Audit log lacks before/after, reason, source, versions; chain integrity overstated | brain_event | VAL C-10, §7.2; SPEC §2.9 | Not audit-grade | Extended schema, corrections protocol, head-hash anchor | No | chain verify; corrections | — | BRAIN | P3 | BF1 |
| MB-136 | Pasco-specific values as product defaults; no T0–T3 tiers | tenant config | VAL C-9; SPEC §3.1; APP §3 | Second district inherits Pasco | Configuration tiers + regimes | No | policy_version stamping | — | BRAIN | P3 | BF1 |
| MB-137 | No way to prove Brain before switching | shadow mode | MAP §4 | Risky cutover | Shadow scans, legacy probe, diff classes, exit criteria | No | golden run G1 in CI | MB-142 | BRAIN | P3 | BF2 |
| MB-138 | No progressive activation | feature flags on `featureAccess` | MAP §5 | Big-bang release | `brain.*` flags with dependencies and kill switches | No | flag guard tests | — | BRAIN | P3 | BF1 |
| MB-139 | Findings not explainable (rule, policy, source, as-of, confidence) | explain_json | VAL §8; SPEC §2.7 | "Why is this student here?" unanswered | Fixed explain schema; card footer | No | every rule row | MB-142 | BRAIN | P3 | BF2 |
| MB-140 | No audit packet | Audit Ready | NG Part 7; SPEC §7.8 | Audit prep is manual | Packet generator with hashes, regime-driven sections | No | reproducibility | MB-135 | BRAIN | P3 | BF4 |
| MB-141 | Oversight report counts proposals and blends unverified data | exceptions report | VAL §5.1; APP §7 | Misleading supervision | Confirmed / unverified / cannot-evaluate columns; ALE-tracked denominators | No | report tests | MB-132, MB-120 | BRAIN | P3 | BF4 |
| MB-142 | No declared rule registry; 25 Phase 1 rules + AP rules; golden fixtures with expected outputs | rule engine | SPEC §4; VAL §9 | — | Registry, pure evaluate, subject keys, DH → WC → PR → RS order | No | VAL §9 matrix | MB-130, MB-132 | BRAIN | P3 | BF2 |
| MB-143 | Student Evidence timeline (absorbs inline History with contacts and course markers) | new screen | SPEC §7.5/§8.3; HT §9 | see MB-071 | Build on cases + snapshots | No | wireframe smoke | MB-133 | BRAIN | P3 | BF3 |
| MB-144 | Today's Work queue replacing Today card + worklist + Reminders computations | new screen | SPEC §7.4/§8.2 | Three "today" computations | Views of steps | No | parity vs legacy counts | MB-133 | BRAIN | P3 | BF3 |
| MB-145 | Local AI narrative drafts with fact ids; model licence choice (Qwen3/Phi-4-mini; avoid research-licensed models) | src/ai | NG Parts 10–11 | Ungrounded drafts | Fact-id grounding, constrained output, labelled drafts | No | draft cites only packet facts | MB-096 | BRAIN | P3 | BF4 |
| MB-146 | Imagine Edgenuity API / OneRoster / Clever integrations | — | NG Parts 3, 12 | Manual exports | Phase 3 only; paid API via account executive; TOS forbids scraping | No | — | district contract | LATER | P3 | LATER |
| MB-147 | Certificated-author verification for contacts (staff table) | — | SPEC WC-05/06; VAL C-11 | Cannot verify WAC 392-121-182 author | Phase 2 staff table | No | — | MB-130 | LATER | P3 | LATER |

### 1.10 District policy decisions (block specific items)

| ID | Decision | Evidence | Blocks | Status | Pri |
| --- | --- | --- | --- | --- | --- |
| MB-150 | Qualifying contact types; whether attendance-course completion counts (D-1) | SPEC §10; VAL §11 | MB-021, MB-022 | POLICY | P1 |
| MB-151 | Day-0 for the 5-school-day plan; whether breaks pause the consecutive-month counter (D-2) | SPEC §10 | MB-106 | POLICY | P2 |
| MB-152 | Board-policy justification codes for missed weeks (D-3) | SPEC §10 | MB-134 | POLICY | P2 |
| MB-153 | Evaluation window; whether a late evaluation counts (D-4) | SPEC §10 | MB-093, MB-099 | POLICY | P2 |
| MB-154 | Whether the Laserfiche submission satisfies "communicated to the family" (D-5) | SPEC §10 | MB-096 | POLICY | P2 |
| MB-155 | Who may confirm evaluations for online-only plans (D-6) | SPEC §10 | MB-103 | POLICY | P2 |
| MB-156 | Retention and redaction for events and packets (D-7) | SPEC §10; VAL §11 | MB-135, MB-140 | POLICY | P3 |
| MB-157 | School days to communicate a confirmed evaluation (D-8) | SPEC Rev A | MB-096 | POLICY | P2 |
| MB-158 | Partial-month evaluations; withdrawn student's final month (D-9) | SPEC Rev A | MB-099 | POLICY | P1 |
| MB-159 | Whether non-school weeks interrupt a missed-week run (D-10) | SPEC Rev A | MB-134 | POLICY | P2 |
| MB-160 | Counter reset on re-enrolment (D-11) | SPEC Rev A | MB-051 | POLICY | P2 |
| MB-161 | Expired courses in the progress proposal (D-12) | SPEC Rev A | MB-043 | POLICY | P2 |
| MB-162 | Contact without a subject still qualifies (D-13) | SPEC Rev A | MB-027 | POLICY | P3 |
| MB-163 | Which programs are Washington ALE programs; untagged courses of an ALE student (D-14) | SPEC Rev B; APP §3 | MB-120 | POLICY | P1 |
| MB-164 | Credit-recovery practice rules; Contact Watch binding (D-15) | SPEC Rev B | MB-120 | POLICY | P2 |
| MB-165 | External Action Policy rows, esp. course-level e-mail on non-plan courses (D-16) | SPEC Rev B; APP §6 | MB-115 | POLICY | P2 |

### 1.11 General UX (QA §4–§5)

| ID | Issue | Module | Evidence | Impact | Proposed change | QA patch? | Tests | Dep. | Status | Pri | Rel. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MB-170 | First screen asks "Resume from last session?" | core | QA UX 1 | Alarm | Resolved by MB-001 | Yes | smoke | MB-001 | PATCHED-VERIFY | P1 | R47 |
| MB-171 | Quick View and Order By list the same entries; "Most Behind First" is a filter | core filters | QA UX 2, 3 | Confusion | Separate filter and sort; rename | No | Playwright | — | UX | P2 | R49 |
| MB-172 | Jargon for new teachers (ALE, WAC, WSLP, MPR, PLC, EOY, "policy sort") | header, panels | QA UX 6 | Onboarding | Glossary tooltips; plain labels | No | — | — | UX | P2 | R49 |
| MB-173 | Twenty-plus header buttons and floating pills; overlap at 1366×768; toasts cover the toolbar | header, fit, toasts | QA UX 7, 14, m24, m25 | Clutter, hidden controls | Consolidate; toast placement; fit rules | No | screenshot diff at 1366×768 | — | UX | P2 | R49 |
| MB-174 | Same message twice (district folder) | today, messages | QA UX 8 | Noise | Dedupe facts | No | Today text | — | UX | P3 | R49 |
| MB-175 | "GAP: 1.5 %" for a student who is ahead | Records List | QA UX 9 | Reads as a problem | "AHEAD 1.5 %" | No | row text | — | UX | P2 | R49 |
| MB-176 | Today card ages ("since today 8:05 AM"); prints two different student counts in one card | ipal-today-v151 | QA UX 11; HT §7 | Trust | Views of Brain steps; until then one count | No | Today text | MB-144 | UX → BRAIN | P2 | R49 |
| MB-177 | Birthday line trusts a wrong DOB ("turns 26") | roster | QA UX 12 | Wrong greeting | Sanity range 12–22 | No | DOB fixture | — | UX | P3 | R49 |
| MB-178 | Smart Attention pre-selects a template for an on-pace student while saying "no concern" | core smart alert | QA m27 | Wrong e-mail | No template when no concern | No | on-pace fixture | — | UX | P2 | R49 |
| MB-179 | Leadership entry lives inside the Quick View dropdown and hijacks the selection (fact wording patched only) | ipal-leadership-v155 | QA M18 | Lost filter state | Own button | Partial | Playwright | — | UX | P2 | R49 |
| MB-180 | Attendance board groups everyone under "(no teacher)" (`Teachers` vs `Teacher` column) | ipal-attendance-v139 | QA m15, m26 | Board unusable by teacher | Read `Teacher` | No | fixture | — | IMPLEMENT | P2 | R48 |
| MB-181 | Excel export omits Teacher, Active Time, Last Gradebook Entry, Assignment Status | core export | QA m14 | Incomplete export | Add columns | No | export test | — | UX | P2 | R49 |
| MB-182 | Records List "Student Summary" shows "expired 0" for a student with an expired course | core `renderStudentSummary` | HT §3.5 | Wrong count | Same expiry predicate as MB-041 | No | Dawson fixture | MB-041 | VERIFY-SOURCE | P1 | R48 |

---

## 2. Release plan

### RELEASE 0.2.47 — VERIFIED QA FIXES ONLY
Scope: apply `qa/fixes/*.patch` to the real source after the source-repo checklist (MAP §10), build with the
existing process, run `smoke.js`. Nothing new.
- MB-001 startup restore (P0) · MB-020 ALE date sorting (P0; confirm every consumer, incl. the last-contact map) · MB-030 derived calendar (P0; confirm `schoolYear`/`breakWeeks` keys) · MB-060/061 weekly snapshot (P0/P1) · MB-090 MPR narrative warnings (P0) · MB-110 bulk e-mail bodies (P0)
- MB-002/003 backups · MB-004 Laserfiche replace · MB-005 first-run · MB-062 History local date parse (add a date-only fixture) · MB-091/092 MPR order and wording · MB-111/112 subjects, greetings, names · MB-170 Resume screen
- Test-only: MB-011/MB-105 per-module syntax check and module-global assertions in the smoke gate.
- Rollback: reinstall 0.2.46 (no schema change).

### RELEASE 0.2.48 — CORRECTNESS / DATA-HANDLING FIXES
Small, verifiable fixes in existing modules; no new screens; no schema change.
- Contact and day counts: MB-023 attendance Sunday weeks · MB-024 Contact Watch keys · MB-032 Today/quick-view day counts on one school-day helper · MB-099 MPR judged weeks honour plan start (needs D-9 default) · MB-100 MPR days-since student types
- Classification and data: MB-041 expiry at midnight · MB-042 blank pacing not-evaluable · MB-050 archived students excluded everywhere · MB-182 Student Summary expiry
- History and trends: MB-064 weekly change (exclude completed, label average) · MB-065 monthly average over completed weeks · MB-067 monthly plan-start denominators · MB-074/075 worklist chip and inactivity · MB-035 hide the dead audit sub-panel · MB-079 back-fill store (verify) · MB-081 attendance baselines
- MPR state: MB-093 persist drafts · MB-094 submitted only on submit · MB-095 no default Satisfactory
- Security/ops: MB-006 second login · MB-007 ALE session on logout · MB-008 temp password · MB-009 updater flag · MB-180 attendance board column
- Tests: HT fixtures (blank cells, 09_28 course cases, Sunday/Excel logs), Espinoza tier boundary, Ibarra exclusion, restart mid-wizard.

### RELEASE 0.2.49 — UX AND CONSISTENCY
- History: MB-063 one baseline rule · MB-068 History button in every grouping · MB-069 span-aware labels · MB-070 same-day note · MB-072 one decimal · MB-073 hide legacy block · MB-076 backup card moved · MB-077/078 date text and scope · MB-022 hide ALE Contact Patterns
- Dates: MB-033 local day keys · MB-034 DST-safe windows · MB-066 day counts · MB-080 Worked Today
- MPR/e-mail: MB-097 core evaluator delegates · MB-098 rename snapshot card · MB-104 wizard text and links · MB-113 dead e-mail code · MB-114 preview-first composer
- General: MB-010 OneDrive scan · MB-025 duplicate-contact override · MB-028 contact pill labels · MB-171–MB-179, MB-181 header, jargon, filters, GAP wording, Today counts, Smart Attention, Leadership entry, export columns

### BRAIN FOUNDATION RELEASES (MAP §8 order: 0.2.48+ numbering continues after the fixes above)
- **BF1 — Shared primitives + normalised model (invisible):** MB-131 calendar/normalisers with shims and disagreement logging · MB-136 configuration tiers · MB-138 feature flags · MB-135 event log · MB-130 migration v4 + one-way sync · MB-053; Data strip behind `brain.dataHealth` for pilots. Gate: VAL §9 date cases; ingest idempotency; backup round-trip.
- **BF2 — Applicability + rule engine in shadow:** MB-120 regimes, gate, wizard (needs MB-163) · MB-142 registry with DH/WC/PR/RS rules · MB-132 confidence · MB-139 explain_json · MB-036 deadline engine · MB-137 shadow diff and report · MB-021 weekly-contact parity vs the History table · MB-040 classifier parity · MB-051/052 episodes and advisor source. Gate: golden run G1 = expected; zero date-math/week-boundary diffs.
- **BF3 — Cases, external actions, Today's Work, MPR on Brain (pilot):** MB-133 case/step · MB-134 acknowledgment and language rules · MB-115/116/029 External Action Policy and e-mail evidence (compat until wizard confirmed) · MB-144 queue · MB-143 Student Evidence timeline (absorbs MB-071) · MB-043/096/101/102/103 MPR parity, evaluation model, form vocabulary, attestation, confirm-selected · MB-044 PR-02 conditions · MB-027 WC-08 · MB-026 pending contacts. Gate: VAL §6.2 example; APP §10 e-mail cases; MPP-* parity = 0.
- **BF4 — Interventions, Audit Ready, exceptions report, local AI:** MB-106 IP rules · MB-140 packet · MB-141 report · MB-145 grounded drafts. Then default-on for advisors (MAP 0.2.57).

### LATER / OPTIONAL
- MB-146 Imagine Edgenuity API / OneRoster / Clever (contract and TOS dependent; Phase 3).
- MB-147 certificated-author verification (staff table).
- District decisions with no default yet: MB-150–MB-165 as they come up in the releases above (P1 first: MB-150, MB-158, MB-163).
