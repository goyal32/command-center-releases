# History & Trends — 0.2.46 functional and data-accuracy audit

**Status:** documentation and testing only. Prepared 2026-09-25 against the unpacked, executed 0.2.46 runtime
(`app.asar` + `app-html/Command_center_universal_v120.html`, **unpatched** — the QA fixes from `qa/fixes` were
deliberately not applied for this audit). No production code was modified or patched.

**Method.** Static trace of every module that builds or feeds the History panel; then three Playwright runs of the
real Electron app on Linux (`xvfb`, `TZ=America/Los_Angeles`, clock 2026-09-25) with the synthetic caseload in
`qa/sample-data` plus variant files generated for this audit (same-day re-export, course added / completed /
dropped / re-enrolled, blank cells, Sunday contact, Excel-formatted dates). Every number History displayed was
compared with values computed independently from the CSVs by a Python script that does not share any code with the
app (`expected.py` in the audit scratchpad; its logic is summarised in §3). Where a comparison uses another
Command Center module, that is stated explicitly and the module is treated as a *second opinion*, not as truth.
Zero JavaScript page errors were recorded across all runs (55 screenshots kept in the scratchpad, not committed).

**Classification tags used below:** `[CRITICAL-ACCURACY]`, `[BUG]`, `[INCONSISTENT]`, `[MISLEADING-UX]`,
`[IMPROVE]`, `[OK]`.

---

## 1. Map of the feature

### 1.1 Entry points

| Entry point | Where | What it opens |
| --- | --- | --- |
| **History & Trends** button (`history-toggle-btn`) | Snapshot & Status row under the import buttons; hidden until a dashboard import exists | Toggles `#history-panel`; calls `renderHistoryPanel()` (core) whose completion is hooked by two modules (below) |
| **🕘 History** per-student button (`data-action="student-history"`) | Records List student header row, rendered by `renderGroupTable` | Inline **Student History** row (`renderInlineStudentHistory`) under the student |
| **Refresh**, **Clear Saved History**, **Click to View Import Log** | Inside the panel (legacy block) | Re-render / `clearHistoryEntries()` (confirm dialog) / toggle log |
| **Refresh**, section headers, **Show import details** | Inside the panel (redesign block `#ipal-history-v36`) | Re-render redesign; collapse state persisted per section in `ipal_hv36_*_collapsed_v1` |
| **Edgenuity Snapshots** (`ipal-edgenuity-snap-history`) | Import area | Bulk back-fill modal of `ipal-edgenuity-snapshots-v77-16-20` (historical exports → `snapshots` store) |
| **Advisor Weekly Digest** | Same row as History | Separate digest panel (not part of History, shares the status row) |
| **Smart Attention** modal | per-student ⚑ button | Reads history through `__getSmartHistorySummary` |
| **Today's Worklist** trend chips | worklist panel | `ipal-quickwins-v130` reads the raw history store |
| **Data backup** card | injected at the top of the History panel by `anon-034` (data-protection export/import) | Export/Restore of IndexedDB + localStorage |

The 🕘 button appears only when the Records List is grouped by *none*, *advisor* or *grade level*. Grouped by
**Name** (the natural way to look one student up), by **Course Name**, or in **Student Summary** it is not rendered
at all (verified: 12 buttons in the first three groupings, 0 in the last three). `[MISLEADING-UX]`

### 1.2 Modules and functions that build the view

| Layer | Module / functions | Role |
| --- | --- | --- |
| Storage + legacy panel | core script: `openHistoryDb`, `historyCleanup` (90-day retention, prior-year archive), `buildHistorySnapshotPayload`, `historyEntrySignature`, `saveImportToHistory`, `dedupeHistoryEntries`, `getHistoryEntries`, `findHistoryBaseline`, `compareHistoryEntries`, `renderHistoryPanel`, `renderInlineStudentHistory`, `autoSaveCurrentImport`, `getProgressBucketFromPacing`, `getHistorySortTime`, `extractSnapshotDateFromFileName`, `saveAleSnapshotToHistory`, `getAleSnapshotHistory` | Writes one entry per Edgenuity import to IndexedDB, renders the legacy stats/trend cards/import log and the inline Student History |
| Redesign | `ipal-history-redesign-v36` (2,871 lines): `renderRedesign`, `renderEdgenuitySection` (+ its own `bestBaseline`, `getHistorySortTs`), `renderAleSection` (`computeAleWeeklyPatterns`), `renderWeeklyAdvisorReport`, `renderMonthlySummary`, `renderImportLog`, `exportWeeklyToXlsx`, `exportMonthlyToXlsx`, hybrid contact-log loader (`__cnGetHybridLog`, `__cnLoadHybridLog`, `__cnAugmentRecord`) | Inserts the four-section "Auto History & Trends" block at the top of the panel; re-renders on panel open (MutationObserver) and on import events |
| Audit sub-panel | `ipal-audit-panel-v77-16-7`: `computeAudit`, `runAudit`, `weeksBetween`, `sundayOf`, `isBreakWeek`, `SCHOOL_YEAR`, `BREAK_WEEKS` | "Advisor Contact Audit" section inside the History panel; needs the Bulk Archive (`ipal_audit_archive_v1`) and reads the **legacy** `TENANT_CONFIG.calendar` |
| Back-fill | `ipal-edgenuity-snapshots-v77-16-20`: `importAll`, `putSnapshot`, `guessDateFromFilename` | Writes historical exports to the `snapshots` store (not the History store) |
| Readers elsewhere | Smart Attention `__getSmartHistorySummary`; worklist `ipal-quickwins-v130.computeBaseline`; per-course `getTrendForCourse` and `__aiGetTrend` (recommendations / AI e-mail); `anon-034` export/import; Leadership `delta` (its own previous-run store) | Consume history with their own baselines |

### 1.3 Data sources

| Store | Key / DB | Written by | Read by History |
| --- | --- | --- | --- |
| IndexedDB `ipal_command_center_history` / `edgenuity_imports` | one record per import: `{importedAt, snapshotDate, fileName, summary{enrollments, students, behind, severe, extreme}, records[{key: userId||courseName, pacing, progress, targetProgress, overallGrade, activeSeconds, lastGradebookEntryTs, firstGradebookEntryTs, bucket, teacher, advisor}]}` | `autoSaveCurrentImport` after every Edgenuity import (including "older file" imports) | legacy panel, redesign Edgenuity section, inline Student History, Smart Attention, worklist chips |
| IndexedDB same DB / `ale_snapshots` | `{importedAt, fileName, studentCount, contacts: {sid: lastContactDate}}` | ALE contact-log upload | redesign ALE Contact Patterns section, import log |
| IndexedDB same DB / `snapshots` (keyed `snapshot_date`) | weekly snapshot copies | back-fill module | not read by History (only by the back-fill modal) |
| localStorage `ipal_weekly_snapshot_v1` | `{savedAt, savedDateLabel, records[...]}` | `saveWeeklySnapshot` (button) **and** `autoSaveWeeklySnapshotSilently` (every import) | Weekly Snapshot Compare banner |
| localStorage `ipal_latest_dashboard_import_v1` | current dashboard rows | import | Weekly Student Check-ins, Monthly Summary (caseload/advisor), inline "active courses" filter |
| localStorage `ipal_cn_contact_log_v1` | parsed contact-log rows `{sid, name, date (raw string), by, type, note, isCheckin}` | `anon-013` (Contact Navigator) on ALE log upload, merged across uploads | Weekly Student Check-ins, Monthly Summary (through the hybrid loader; the archive path is used only if `__ipalAuditArchive.getRecent` exists — it does, in `ipal-bulk-archive-v77-16`) |
| `window.__aleLastContactByStudentNumber`, `__aleContactsByStudentNumber` | last contact of *any* type per SID; ALE enrollment record per SID | core ALE parsers | ALE Contact Patterns; caseload and closed-plan exclusion |
| `TENANT_CONFIG.calendar` (2025-26) | legacy calendar block | tenant file | Audit sub-panel only |
| SQLite | nothing | — | History never reads SQLite; the mirror (`mirror_records`) receives copies of the stores above |

### 1.4 Calculations, grouping, filters, charts

- **Snapshot date** = date parsed from the file name (`MM_DD_YYYY`, set to local **noon**), else local midnight of
  import day. The redesign's own `getHistorySortTs` uses local **midnight** for the same file name (12 h apart).
- **Bucket** = `getProgressBucketFromPacing`: ≤ −30 Extremely Behind, ≤ −20 Significantly Behind, ≤ −10 Starting to
  Struggle, ≤ −5 Watch List, else On Pace / Ahead; non-numeric → Unknown (weight 9, i.e. *worse than* Extremely Behind).
- **Summary counts** per import: enrollments (attendance-course rows removed), students, behind (any bucket below
  On Pace), severe (≤ −20), extreme (≤ −30).
- **Legacy "Today vs 7 / 30 Days"**: baseline = the entry nearest to N days before the newest entry, but at least
  N/2 days old (v133.3); per matched `userId||courseName`: improved/worsened/unchanged by bucket weight, "No progress"
  = progress delta ≤ 0.05, "7+ days inactive" = last gradebook entry ≥ 7 days before the newest entry's snapshot
  date; "Top changes" = up to 8 rows, inactive first then |Δpacing|, shown 3.
- **Redesign "Edgenuity Progress"**: baseline = entry nearest to 7 days back with **no minimum age**; shows severe
  and behind counts with a ± diff pill; label "Since {date} ({relative to real today})".
- **Inline Student History**: entries filtered to the student; courses restricted to the courses present in the
  *current* dashboard import (dropped courses vanish); rows grouped by **Sunday-start week** of the snapshot date,
  latest snapshot per week wins, 8 weeks shown then "earlier months" first→last; per-course trend = last − first
  pacing over the span; **Weekly Change** = average of per-course pacing deltas vs the 7-day baseline (or the
  next-older entry); **Latest Status** = worst bucket of the latest snapshot.
- **ALE Contact Patterns**: uses the *last contact of any type* per student; "contacted this week" = last ≥ this
  Sunday; "not yet contacted" = last < this Sunday; "chronic" = last < two Sundays ago; footnote admits it cannot see
  more than one date per student.
- **Weekly Student Check-ins**: Sunday–Saturday week (selectable), caseload from the ALE enrollment (ALE mode) with
  plan start/end spans (closed plans excluded; a student whose plan starts after the week is excluded), contacted =
  any check-in-type contact dated inside the week (string compare of `YYYY-MM-DD`), plus keyword classification of
  notes into deactivate/reactivate/warning-only; "resolved late" = contacted in the following week.
- **Monthly Summary**: month picker; "Month %" = unique students with ≥ 1 check-in in the month; "Avg Weekly %" =
  mean of weekly contacted/caseload over every Sunday-start week that touches the month, **including weeks that have
  not happened yet**; partial-month banner with an effective-days count.
- **Filters**: the "Show only students with an ALE record" toggle (`ipal_war_ipal_only_v1`), week and month pickers;
  the dashboard's advisor/teacher/counselor filters do **not** scope the History panel (the worklist and Today do
  scope). No charts anywhere in History: everything is tables, stat tiles and text; the "Chart.js" library loaded by
  the page is not used by this feature.

---

## 2. Button and UI tests (synthetic students)

| Test | Result |
| --- | --- |
| Open History from the main button, pre-import | Button is hidden until an import exists; forced open shows the empty state correctly: "0 imports, 0 ALE logs", four empty sections, legacy cards "—". `[OK]` |
| One record (09_11 only) | Stats 1 import / 1 day / 24 enrollments / 2 severe; both compare cards "Not enough history yet"; inline Student History "Only one snapshot saved — trend will appear after the next upload". `[OK]` |
| Many records (six imports 9/11 … 9/28) | All six listed; History window 18 days; cards populated; import log shows file date and save time for each. `[OK]` |
| Missing-data import (blank Pacing, blank Progress/Grade, blank Last Gradebook Entry) | No errors; blanks render as "—" in the inline table; but see §3.9 for how blanks are *counted*. |
| Student selection | 🕘 works in three groupings, absent in three (see §1.1). Search box + grouping "Name" (the obvious path) has no History button. |
| Filters | Week picker, month picker and the ALE-only toggle all re-render correctly; the "← Back to current week" link works. Dashboard who-filters do not apply. |
| Date ranges | Legacy cards are fixed at 7 and 30 days; the redesign has no range control; the audit sub-panel offers This Week / 4 / 12 weeks / YTD / months but its month list runs **August 2025 – September 2026** (legacy calendar). |
| Back / navigation | Panel toggle, inline close, section collapse state persist across re-renders; after app restart the panel content persists (IndexedDB). In the unpatched build the History button is hidden on restart until the teacher clicks "Resume" (QA-audit C1, reproduced). |
| Clear Saved History | Confirm dialog → entries 0; ALE logs and the dashboard are untouched. `[OK]` |
| Edgenuity Snapshots modal, Advisor Weekly Digest | Both open without errors; their content was not audited here (outside the History data path). |
| JavaScript / page errors | 0 page errors, 0 console errors attributable to History across three runs (the only console error is a blocked CDN font request). `[OK]` |

---

## 3. Verify every number

Independent expectations were computed from the CSVs (Sunday–Saturday weeks, school days Mon–Fri with Labor Day
9/7 closed, calendar-day math on dates only). "History" below means the value the panel displayed.

### 3.1 Per-import summary (behind / severe / extreme) `[OK]`

| Import | Expected behind / severe / extreme | History | Match |
| --- | --- | --- | --- |
| 09_11 | 6 / 2 / 0 | 6 / 2 / 0 | ✔ |
| 09_18 | 8 / 2 / 1 | 8 / 2 / 1 | ✔ |
| 09_25 | 10 / 2 / 2 | 10 / 2 / 2 | ✔ |
| 09_26 (everyone −12) | 21 / 8 / 3 | 21 / 8 / 3 | ✔ |
| 09_27 (everyone −24) | 24 / 20 / 10 | 24 / 20 / 10 | ✔ |
| 09_28 (course changes) | 10 / 2 / 2 (24 enrollments: 23 + Art 1) | 10 / 2 / 2, 24 | ✔ |

### 3.2 Legacy compare cards `[OK]` on counts

| Compare | Expected matched / improved / worsened / unchanged / no-progress / inactive | History | Match |
| --- | --- | --- | --- |
| 9/18 vs 9/11 | 24 / 0 / 4 / 20 / 4 / 5 | 24 / 0 / 4 / 20 / 4 / 5 | ✔ |
| 9/25 vs 9/18 | 24 / 0 / 4 / 20 / 2 / 5 | same | ✔ |
| 9/26 vs 9/18, 9/27 vs 9/18 | 24 / 0 / 20 / 4 / 2 / 5; 24 / 0 / 23 / 1 / 2 / 5 | same | ✔ |
| 9/28 vs 9/18, 9/28 vs 9/11 | 23 / 0 / 4 / 19 / 2 / 6; 23 / 0 / 8 / 15 / 2 / 6 | same | ✔ |
| 9/26 vs 9/11, 9/27 vs 9/11 (30-day card) | 24 / 0 / 21 / 3 / 2 / 5; 24 / 0 / 24 / 0 / 2 / 5 | same | ✔ |

Every count matches. The *meaning* of some of them is the problem (§3.6, §3.9, §6).

### 3.3 Inline Student History values `[OK]` on values, with rounding caveats

Chen (fixture −29.4 → −32.4 → −35.4 pacing; 0 → 0 → 3.0 progress; grade 52): History rows show −29.4 % / −32.4 % /
−35.4 %, 0 % / 0 % / 3 %, 52 %. Chemistry progress 1.3 → "1 %", 5.5 → "6 %": progress is rounded to a whole
percent. Grade shown as whole percent (69.4 → "69 %"). Pacing keeps one decimal. Baker, Johnson, Alvarez, Dawson,
Espinoza, Foster all match the fixture values row by row. `[IMPROVE]` rounding hides the small weekly gains the
MPR narrative counts (a 1.3 → 5.5 change is the difference between "No Progress" and progress).

### 3.4 Weekly Change and per-course trend `[OK]` arithmetic, `[MISLEADING-UX]` presentation

- Chen "Weekly Change: Dropped 3.0 pts" = mean of (−35.4 − −32.4, −31.0 − −28.0) = −3.0 ✔.
- Per-course "Pacing dropped by 6.0 pts over the last 2 weeks" (9/11 → 9/25) ✔.
- With only 9/11 and 9/25 saved (missing week), the same tile reads "Dropped 6.0 pts" under the heading **Weekly
  Change**, and the legacy card headed **Today vs 7 Days** compares 14 days. Neither says so.
- Alvarez (on pace, +7.5 → +1.5) is labelled in red "Dropped 6.0 pts"; Gutierrez, whose Economics went from 99 % to
  **100 % complete**, is labelled "Dropped 18.0 pts" and her Weekly Change reads "Dropped 9.0 pts" (§5.9).

### 3.5 Expected progress, pacing gap, grade, target/expiration

History stores `targetProgress` but never displays it; it does not store or display target dates or expiry.
Dawson's US History B (target 9/15 passed, 81 % complete) appears in History only as "Starting to Struggle −19 %"
with no expiry marker, while the dashboard row shows the expired target date and Student Summary shows "expired 0"
for her (a separate dashboard issue). `[MISLEADING-UX]` History cannot tell a teacher that a course expired.

### 3.6 Activity / inactivity

- "7+ days inactive" in the compare cards is measured from the **file date of the newest import**, not from today.
  Counts matched the independent computation for every pair (5, 5, 5, 5, 6, 6).
- No per-student inactivity is shown in History at all; the worklist shows "14 DAYS INACTIVE" for Chen and the
  dashboard shows "No work for 15 days" for the same student on the same day (worklist uses elapsed-time floor,
  dashboard uses dates). Expected from the CSV: 15. `[INCONSISTENT]` (worklist −1 day; also Espinoza 27 vs 28,
  Ibarra 39 vs 40).

### 3.7 Contact counts and weekly-contact status `[OK]` in History's table, `[CRITICAL-ACCURACY]` on the dashboard

Expected contacted/caseload per advisor from the ALE log (student-type contacts only, Sunday–Saturday, closed
plans excluded, plan start respected):

| Week | Expected GH / KL / STA | History Weekly Student Check-ins | Match |
| --- | --- | --- | --- |
| 9/20 (current) | 3/4 · 2/3 · 2/4 | 3/4 · 2/3 · 2/4, total 7/11 = 63.6 % | ✔ |
| 9/13 | 3/4 · 2/3 · 2/3 (Foster's plan starts 9/21 → excluded) | 3/4 · 2/3 · 2/3, "resolved late 1" for KL once Hale's later contact exists | ✔ |
| 9/6 | 3/4 · 3/3 · 2/3 | same | ✔ |
| 8/30 | 4/4 · 3/3 · 2/3 | same | ✔ |
| 9/20 with a **Sunday 9/20** Teams contact for Hale | KL 3/3 | KL 3/3 (100 %) | ✔ |

The table also correctly names the students not contacted (Chen; Espinoza, Foster). The same week, the
dashboard's `__aleHasNoRecentContact` said Hale **had no contact** (his Sunday contact was not recognised, §4.3).

### 3.8 Monthly Summary `[BUG]` in the average

Expected September (through 9/25): GH unique 4/4, KL 3/3, STA 3/4 (Espinoza has only a Parent contact; Foster's
Saturday 9/19 call counts). History: 100 % / 100 % / 75 % ✔. "Avg Weekly %": History shows GH 65.0 %, KL 73.3 %,
STA 45.0 %. Reproducing those numbers requires averaging **five** weeks: 9/1–5, 9/6, 9/13, 9/20 **and 9/27–10/3
(0 % — it has not happened)**. The four real weeks give GH 81.3 %, KL 91.7 %, STA 56.3 %. The future week silently
deflates every advisor's average by a full week. The partial-month banner also says "26 days of September covered"
for Sep 1–25 (25 days) and "August … 7 days" for Aug 26–31 (6 days): an off-by-one from rounding an end-of-day
timestamp. `[BUG]`

### 3.9 Snapshot deltas, direction and blank cells `[CRITICAL-ACCURACY]`

- Weekly Snapshot Compare (the banner above History): after **every** import in the shipped build the banner read
  "Compared with snapshot from Fri, Sep 25, 2026 … Improved 0 · Worsened 0 · New Extreme 0 · No Change 24 · No
  major changes", including after the 9/26 (everyone −12) and 9/27 (everyone −24) imports where the independent
  expectation is 20 and 23 worsened. Cause: `autoSaveWeeklySnapshotSilently()` overwrites the saved snapshot on every
  import, so the dashboard always compares an import with itself; the "Save Snapshot" button's own pill still read
  "No Snapshot Saved" afterwards. This is QA-audit M19 reproduced in the unpatched runtime; the Weekly Snapshot
  feature is non-functional for its stated purpose in 0.2.46.
- A **blank Pacing** cell (Chen, Chemistry, 9/29 variant) becomes bucket "Unknown" with weight 9: the compare card
  reports "Extremely Behind → Unknown" as **Worsened 1**, the severe count drops from 2 to 1 and the redesign shows
  "severe −1" (an improvement). A missing value moves the program summary in both directions at once. The dashboard,
  for the same row, shows "GAP: 5.5 % · GOAL: 0.0 % · ON TARGET". `[INCONSISTENT]`
- A **blank Last Gradebook Entry** (Espinoza) silently leaves the inactivity count.

### 3.10 Course counts / statuses

"Current Enrollments 24" matches after every import (attendance-course rows are excluded consistently). After the
course-change import: Alvarez's new Art 1 shows one row and "Only one snapshot saved" ✔; Baker's dropped Biology
disappears from her inline history with no trace ("2 active") `[MISLEADING-UX]`; Ibarra, archived and then
re-enrolled, shows an unbroken weekly series with no marker of the archived period; Gutierrez's completed course
is shown as a pacing crash (§5.9).

---

## 4. Week and date audit

### 4.1 Week definitions across the app

| Module | Week start | Function |
| --- | --- | --- |
| History inline Student History | Sunday (`x.getDate() - x.getDay()`) | `weekStartOf` |
| History redesign (patterns, check-ins, monthly) | Sunday | `sundayStart`, `weekStart` |
| Audit sub-panel | Sunday | `sundayOf` |
| Dashboard weekly-contact override (`ipal-contact-week-fix`) | Sunday | `thisWeekStart` |
| Contact Navigator (`anon-013`) | Sunday (function still named `startOfWeekMon`) | `startOfWeekMon` |
| Contact Watch | Sunday | `sundayOf` |
| MPR | Sunday–Saturday | `schoolWeeks` |
| Attendance module (`ipal-attendance-v139`) | **Monday** | `mondayOfThisWeek` |
| e-mail click history (core) | Sunday | `__getWeekStartSunday` |

History is consistently Sunday-based, matching WAC 392-550-020. The attendance module's Monday week is the one
outlier; it feeds "Edgenuity Attendance" check-ins into the same contact stores that History reads, so an attendance
completion logged on a Sunday would be attributed to a different week by the two modules. `[INCONSISTENT]`

### 4.2 Local vs UTC

- Snapshot file dates are built with `new Date(y, m-1, d, 12)` (local) in core and `new Date(y, m-1, d)` (local
  midnight) in the redesign. Both then derive day keys with `toISOString().slice(0,10)` (UTC). In US time zones
  local noon and local midnight both fall on the same UTC date, so the keys are right for Pasco; east of UTC the
  midnight variant would key to the previous day. Not a defect for the district, a latent one for the product.
- Contact dates in the check-ins and monthly tables are compared as `YYYY-MM-DD` **strings** derived from the raw
  value without constructing a Date — this is why History got every week right, including the Sunday contact.
- The History import log prints "Imported: Sep 25, 2026 11:26 AM" (local) and "File Date: Sep 11, 2026 12:00 PM":
  the "12:00 PM" is the synthetic noon, not a real time. `[MISLEADING-UX]`
- The QA-audit finding M7 (History screen showing dates shifted by the UTC offset) concerns the separate
  *History screen* of the ALE queue/History redesign timeline, not the panel audited here; no shifted date was
  observed in this panel.

### 4.3 Excel-formatted dates `[CRITICAL-ACCURACY]` (dashboard), `[OK]` (History)

With `ALE_Contact_Log_excel_dates.csv` (dates like `9/23/2026`) as the only contact log:

| Consumer | Result |
| --- | --- |
| History Weekly Student Check-ins | GH 3/4 · KL 2/3 · STA 2/4 — **correct** |
| History ALE Contact Patterns | 8 contacted / 2 not yet — same as with ISO dates |
| Contact Watch | archive 1 · meeting 1 · reach 1 — same as with ISO dates |
| Dashboard `__aleHasNoRecentContact` | **true for all 11 students**; quick view "Missing Weekly Contact" lists all 12 (including Ibarra, archived) |

Cause (QA-audit C2): `__aleStudentTypeContactDatesByStudentNumber` is sorted as strings, so `"9/9/2026"` sorts
above `"9/23/2026"` and above every ISO date; the "most recent" contact the dashboard checks is the wrong one.
When ISO and Excel logs are both loaded the two formats interleave and the same bug produced `412001=true` (Alvarez,
contacted 9/23) after the Excel file was added, and made Hale's Sunday ISO contact invisible to the dashboard.
History does not share this bug because it re-parses each date string.

### 4.4 Month boundaries

- Monthly Summary attributes a contact to the week that contains it and to the month by date string; the week of
  8/30–9/5 is clipped to 9/1–9/5 for the September table ✔. The **future week** inclusion (§3.8) and the
  off-by-one day counts are the month-boundary defects.
- Inline Student History "earlier months" groups by the **week-start's** month, so a week starting 8/30 is filed
  under August even if the snapshot was taken 9/3. `[IMPROVE]`

### 4.5 Sunday contacts

History counts a Sunday contact toward the Sunday–Saturday week that starts that day ✔ (Hale, 9/20). The dashboard
did not, for the reason in §4.3, and the Today card and quick views therefore listed Hale as missing contact while
History listed him as contacted. `[INCONSISTENT]`

### 4.6 School breaks and closures

History's weekly and monthly tables have no notion of school days or breaks: a Thanksgiving week is a normal week
with an expected contact, and "Avg Weekly %" would count it. The audit sub-panel does exclude break weeks, but from
a hard-coded **2025-26** list (Thanksgiving 2025-11-23, Winter 2025-12-21/28, Spring 2026-04-05) and a school year
of 2025-08-24 → 2026-06-13 when `TENANT_CONFIG.calendar.schoolYear` is present — and in 0.2.46 that block *is*
present and *is* the stale 2025-26 calendar (QA-audit C3). Its month picker runs from August 2025. `[BUG]`

### 4.7 Daylight-saving / time zone

Week arithmetic uses `setDate(getDate() - getDay())` and `setHours(0,0,0,0)` (calendar-safe). Two places subtract
`7 * 86400000` ms from a local midnight to get "last Sunday" / "two weeks ago" (`computeAleWeeklyPatterns`,
`weekLabel`'s `Math.round(diff / 7d)`); across the November DST change these are off by one hour, which the
`Math.round` absorbs for labels but which makes `lastSunday` 23:00 on the Saturday before for the "last week"
window. A contact logged at 23:30 on that Saturday would be counted in the wrong week for one week each autumn.
`[BUG]` (low impact; the check-ins table is unaffected because it compares date strings).

---

## 5. Snapshot audit

| Case | Behaviour observed | Assessment |
| --- | --- | --- |
| 5.1 First snapshot | Entry saved, "Not enough history yet", inline "Only one snapshot saved". | `[OK]` |
| 5.2 Second snapshot | Compare cards and diff pills populate; inline shows two weeks and a trend. | `[OK]` |
| 5.3 Multiple weeks | Six entries listed newest first; inline groups by week; the 8-week cap and "earlier months" roll-up exist (not reached with a 3-week fixture). | `[OK]` |
| 5.4 Duplicate snapshot (same file, different folder) | Signature match → `skipped-duplicate`; raw store stays at 3. | `[OK]` |
| 5.5 Same-day re-import with different numbers (`EdgenuityEnrollments_09_25_2026 (1).csv`) | Raw store keeps both (ids 3 and 4); the view (`dedupeHistoryEntries`) collapses to the **latest importedAt** per day, so the first 9/25 import disappears from the panel and the import log with no indication. Nothing is deleted. | `[MISLEADING-UX]` — history is not overwritten in storage, but the panel silently shows only one version and the teacher cannot tell an earlier same-day export existed. |
| 5.6 Older export after a newer one (9/18 after 9/25) | "Older file … saved to history. Dashboard still showing 9/25" path taken; dashboard meta unchanged; because the entry already existed it was skipped as a duplicate. | `[OK]` |
| 5.7 Missing week (9/11 → 9/25) | "Today vs 7 Days" compares 14 days, inline "Weekly Change" spans 14 days, the redesign says "Since Sep 11 (14 days ago)". | `[MISLEADING-UX]` — the labels do not adapt to the gap. |
| 5.8 Course added later (Art 1 on 9/28) | New card with one row; counted in "Current Enrollments"; not matched in compares. | `[OK]` |
| 5.9 Course completed (Economics 100 %) | Pacing 12 → 0 → bucket On Pace; trend "Pacing dropped by 18.0 pts over the last 3 weeks" in red; Weekly Change "Dropped 9.0 pts". | `[MISLEADING-UX]` — completion is reported as a decline. |
| 5.10 Course expired (US History B) | No expiry indication anywhere in History; bucketed by pacing only. | `[MISLEADING-UX]` |
| 5.11 Course dropped (Biology) | Removed from the inline view by the "active courses" filter; the entry data remains; compare "matched" falls from 24 to 23 with no explanation. | `[MISLEADING-UX]` |
| 5.12 Student withdrawn and re-enrolled (Ibarra archived → active) | Unbroken weekly series; no marker; archived weeks look like normal weeks. The Today card and quick views also included the archived student (QA-audit M3). | `[MISLEADING-UX]` |
| 5.13 Is old history silently overwritten? | No. Storage is append-only with a 90-day retention sweep and a prior-year archive; the same-day view collapse (5.5) and the weekly-snapshot overwrite (§3.9) are the two places where a teacher *sees* a replacement without being told. | see 5.5 and §3.9 |

---

## 6. Course vs student trends

How History produces a student-level trend:

1. **Inline "Weekly Change"** = arithmetic mean of per-course pacing deltas (current vs baseline) over the courses
   present in both snapshots. A student who improves +6 in one course and drops −6 in another shows "No weekly
   change"; Gutierrez's completed course (+12 → 0) plus a steady course produced "Dropped 9.0 pts" for a student
   with nothing wrong. `[MISLEADING-UX]` — a single averaged number hides mixed behaviour and mislabels completion.
2. **Inline "Latest Status"** = worst bucket of the latest snapshot (Dawson: "Starting to Struggle" because of an
   expired course at 81 %). Worst-of is defensible for triage but is never explained as such.
3. **Legacy compare cards** are per-*enrollment* counts (24 matched), never per student; "Worsened: 4" can be one
   student with four courses. The "Top changes" list names the course, which is good, but is capped at three.
4. **Smart Attention summary** = average of per-course *progress* deltas plus "n courses showed progress and m
   showed little or no change" — the only place that reports mixed behaviour explicitly. `[OK]`
5. **Worklist trend chip** (`ipal-quickwins`) = current worst pacing minus the *minimum* pacing in the oldest import
   within 10 days, clipped to ≤ 0. It compares different courses if the worst course changed, and reads the raw store
   (no same-day dedupe, `snapshotDate` not file date). "↘ DECLINING −3 %" appeared on every student including
   on-pace Alvarez. `[INCONSISTENT]`
6. **Today card** "fell into a worse pacing bucket" = student worst-pacing bucket vs the card's own previous run
   (`ipal_today_prev_v1`), not vs History. It flagged Johnson on 9/25 (her worst course crossed −10) while History's
   Chen-first ordering never surfaced her.

Conclusion: a single "Improved/Worsened" label at student level exists in three modules with three formulas, and in
History specifically the averaged Weekly Change can and does hide mixed course behaviour and misreports completion
and on-pace slippage as decline. `[CRITICAL-ACCURACY]` for the label semantics, even though the arithmetic is right.

---

## 7. Cross-module consistency matrix

Same fixture, same day (Fri 2026-09-25, ISO contact log unless stated). "Expected" is the independent computation.
Modules named in the third column are second opinions, not truth.

| Metric | History value | Other-module value | Expected value | Match? | Reason |
| --- | --- | --- | --- | --- | --- |
| Chen weekly contact, week of 9/20 | Not contacted (check-ins table) | Dashboard `__aleHasNoRecentContact`: true (no contact); ALE Contact Patterns (same panel): **contacted** | Not contacted (only a Teacher Initiated e-mail 9/20) | History table ✔; ALE Patterns ✖ | Patterns section uses last contact of *any* type |
| Hale weekly contact with a Sunday 9/20 Teams contact | Contacted (KL 3/3) | Dashboard: no contact; Today: "no check-in"; Contact Watch: contacted (reach 0) | Contacted | History ✔, dashboard ✖ | dashboard sorts date strings; Sunday belongs to the new week |
| All students with an Excel-dated log only | GH 3/4 · KL 2/3 · STA 2/4 | Dashboard: all 11 "no contact"; quick view lists 12 | 7 of 11 contacted | History ✔, dashboard ✖ | string-sorted M/D/YYYY |
| Days since student contact, Chen / Espinoza | not shown | Dashboard quick views: Chen "15–19 days", Espinoza "20+"; Today: both "crossed 20 days"; worklist: "NO CHECK-IN" | calendar 23 / 27; school days 16 / 19; weekday-only (no Labor Day) 17 / 20 | Modules disagree | dashboard = weekdays from the stale calendar (Labor Day not skipped) → Espinoza wrongly 20+; Today = calendar days |
| Contact status, Ibarra (archived, plan closed) | Excluded ("1 dropped/closed excluded") | Dashboard quick view "Missing Weekly Contact": listed; Today "Risk jumped for … Mateo I."; worklist row 3 | Excluded | History ✔, others ✖ | archived rows leak (QA M3) |
| Chen inactivity | compare card "7+ days inactive" only | Dashboard "No work for 15 days"; worklist "14 DAYS INACTIVE" | 15 | dashboard ✔, worklist ✖ | worklist floors elapsed hours |
| Chen pacing / progress / grade (Algebra 2 A) | −35.4 % / 3 % / 52 % | Dashboard −35.4 / 3.0 / 52.0; Student Summary worst −35.4 CRITICAL | −35.4 / 3.0 / 52.0 | ✔ | History rounds progress |
| Chen bucket | Extremely Behind | Dashboard "35.4 % BEHIND"; Student Summary "CRITICAL"; Today bucket 4; MPR summary "No Progress" | ≤ −30 | ✔ (labels differ by module) | four vocabularies for one fact |
| Chen Chemistry with blank Pacing (variant) | Unknown; counted as Worsened; severe −1 | Dashboard "GAP 5.5 % · ON TARGET" | not evaluable | both ✖ | blank handled as worst (History) and as best (dashboard) |
| Weekly change, Chen (9/25 vs 9/18) | −3.0 pts | Worklist "↘ DECLINING −3 %"; Smart Attention "+3.60 progress" | −3.0 pacing; +3.6 progress | ✔ | different measures, both right |
| Weekly change, Alvarez | "Dropped 6.0 pts" (red) | Worklist "↘ DECLINING −3 %"; dashboard On Pace | +7.5 → +1.5, still on pace | arithmetic ✔, message ✖ | on-pace slippage shown as decline |
| Program severe / behind after 9/25 | 2 / 10 | Dashboard stat tiles 6 students behind (student-level); Today "4 of 12 behind pace" then "6 behind pace" in the same card | enrollments 10 behind; students 6 (bucket ≤ Watch) | ✔ per definition | enrollment vs student counts; Today prints two different student counts |
| Weekly Snapshot Compare after 9/26 (−12) | legacy card: Worsened 20 | Banner: "No major changes", Worsened 0 | 20 worsened | History ✔, banner ✖ | auto-save overwrites the snapshot every import |
| September communication, Chen | (Monthly Summary: contacted once ✔) | MPR: 1 of 3 judged weeks, "Unsatisfactory" | 1/3 | ✔ | MPR judged weeks = completed Sun–Sat weeks + current if met |
| September communication, Foster (plan 9/21) | Weekly table excludes her before 9/20 ✔; Monthly includes her in every week's denominator | MPR: 0/3 "No Communication" | not required before 9/21 | History weekly ✔, History monthly ✖, MPR ✖ | only the weekly table applies plan start |
| Avg weekly % STA (September) | 45.0 % | — | 56.3 % over the four real weeks | ✖ | future week 9/27–10/3 averaged in as 0 % |
| Audit sub-panel, YTD | "No contact archive found" | — | 9 weeks of data exist in the contact log | ✖ | reads only the bulk archive; calendar 2025-26 |

---

## 8. Report quality from a teacher's point of view

| Question | Answer today |
| --- | --- |
| Can I understand *what* changed? | Partly. Per course, yes (pacing/progress/grade by week). At program level, "Worsened 4" with three named rows is a start, but the rest is hidden, and "Improved" has never been non-zero in a term where students only slip. |
| Can I tell *when* it changed? | Only to the week; the week labels ("This week / Last week / 2 weeks ago") are relative to the real calendar, so a file dated in the future is labelled "Future" and a gap week simply vanishes from the table. |
| Can I tell *why* the trend changed? | No. Nothing links a pacing move to activity (last gradebook entry is stored but never shown per week), to a target-date change, or to a course being added, completed, dropped or expired. |
| Can I distinguish a real student change from a new import or a course change? | No. A completed course reads as an 18-point crash; a dropped course silently reduces "matched"; a blank cell reads as "worsened"; a same-day re-export replaces the earlier one without notice; two imports on the same day cannot both be seen. |
| Can I identify the course responsible? | In the inline view yes (per-course cards). In the panel's "Weekly Change" and the worklist chip, no — those are averages or worst-of across courses. |
| Is anything shown that could mislead? | "Dropped n pts" for on-pace students and for completed courses; "Today vs 7 Days" for 10- or 14-day comparisons; "Avg Weekly %" including a week that has not happened; "Missed this week 2" (any contact type) next to a table saying 4 not contacted (check-in types); "12:00 PM" file times; the audit sub-panel's 2025 months; "Compared with snapshot from Sep 25 — No major changes" after everyone slipped 24 points. |
| Is there unnecessary information? | The panel carries a data-backup card, an advisor contact audit that cannot run, an import log with save times, keyword-classified deactivate/reactivate columns that are empty for most teams, and two overlapping "Edgenuity Progress" blocks (legacy cards + redesign tiles) that say the same thing with different baselines. |
| What would make it useful in an MPR or parent conversation? | One per-student page with: courses in rows, weeks in columns, pacing and progress together, the week's contact (type, date) in the same row, markers for course start / completion / expiry / drop, the month's judged weeks highlighted, a plain sentence per course ("progress +4.2 this week, still 31 behind target; no work since 9/10"), and no averaged student-level arrow. That is the Student Evidence timeline in the Brain v1 spec (§7.5 / §8.3). |

---

## 9. Brain v1 relationship

| Existing piece | Disposition | Why |
| --- | --- | --- |
| Append-only per-import store (`edgenuity_imports`) with signature dedupe, retention sweep and prior-year archive | **Consume normalised Brain data later** | It is exactly `course_snapshot` by another name; the one-way sync in the migration map (§3.4) reads it. Keep it as the source until `brain.normalization` is default-on. |
| `getProgressBucketFromPacing` thresholds | **Stay unchanged** (then delegate) | Identical to the Brain classifier buckets; becomes a shim over the shared classifier. |
| Legacy compare-card arithmetic (`compareHistoryEntries`) | **Fix** (Unknown weight; inactive-from-file-date wording), then **deprecate** | Superseded by PR-02 findings and the case view; until then correct the blank-cell handling and label the comparison span. |
| Redesign "Edgenuity Progress" tiles | **Fix** (minimum baseline age; "since" label) then **deprecate** | Duplicates the legacy cards with a weaker baseline rule. |
| Inline Student History (per-course weekly table) | **Become part of the Student Evidence timeline** | The per-course, per-week table is the right shape; add the week's contact, markers for start/complete/expire/drop, keep one decimal of progress, drop the averaged "Weekly Change". |
| "Weekly Change" average and worklist trend chip | **Deprecate** | Student-level arrows hide mixed behaviour; Brain reports per-course PR-02 findings and never averages pacing across courses. |
| Weekly Snapshot Compare banner | **Fix now** (stop auto-overwrite; already in `qa/fixes`), then **deprecate** | Its job (import-to-import diff) is the compare card; Brain's `course_snapshot` diff replaces both. |
| Weekly Student Check-ins table | **Stay unchanged**, then **consume Brain contacts** | It is the one weekly-contact computation in the app that got every week right, including Sunday contacts, plan start and Excel dates. It should become the reference implementation for WC-01 during shadow mode and be fed by `brain_contact` afterwards. |
| ALE Contact Patterns section | **Deprecate** | Built on a one-date-per-student map that mixes contact types; its own footnote concedes the limitation. |
| Monthly Summary | **Fix** (exclude future weeks; day counts; plan-start denominators), then **consume Brain** (judged weeks per MP-P2) | The MPR module already has the correct judged-week rule; two definitions of "September weeks" must become one. |
| Advisor Contact Audit sub-panel | **Deprecate** | Requires the bulk archive, hard-codes 2025-26 breaks through the legacy calendar, and duplicates the check-ins table; Brain's exceptions report (with confidence columns) supersedes it. |
| Data-backup card inside the panel | **Move**, not History's concern | Keep the feature, relocate to the Data strip. |
| Import log | **Consume Brain `import` rows** | Data Health shows the same facts with file hash, horizon and checks. |
| Retention (90 days, prior-year archive) | **Stay unchanged** until Brain retention (D-7) is decided | |

---

## 10. Findings index

**Critical accuracy issues**
- C-H1 Weekly Snapshot Compare always compares an import with itself ("No major changes" after a 24-point program-wide drop); the auto-save overwrites the saved snapshot on every import (§3.9).
- C-H2 With Excel-formatted contact-log dates the dashboard marks every student "no weekly contact" while History's table is correct; with mixed formats individual students flip (Alvarez, Hale) (§4.3). History is not the source of the error but is the only place a teacher could notice it.
- C-H3 A blank Pacing cell is bucketed "Unknown" with the worst weight: reported as "Worsened", while lowering the severe count; the dashboard calls the same row "ON TARGET" (§3.9).
- C-H4 Student-level "Weekly Change" averages course deltas and reports a completed course and on-pace slippage as "Dropped" (§3.4, §5.9, §6).

**Functional bugs**
- B-H1 Monthly "Avg Weekly %" averages in a future week at 0 % (§3.8).
- B-H2 Partial-month day counts off by one (26 for 25 days, 7 for 6) (§3.8).
- B-H3 Advisor Contact Audit sub-panel uses the stale 2025-26 school year and breaks and reports "No contact archive found" on a normal install (§4.6).
- B-H4 Redesign baseline has no minimum age: with imports on consecutive days it compares against yesterday while the legacy card refuses to (§1.4).
- B-H5 Millisecond week windows in the ALE patterns section drift by an hour across DST (§4.7).
- B-H6 🕘 History button missing in Name / Course Name / Student Summary groupings (§1.1).
- B-H7 Unpatched restart hides the History button until "Resume" (QA-audit C1, reproduced §2).

**Cross-module inconsistencies**
- I-H1 Weekly contact: History table (correct) vs dashboard override (string sort), vs ALE Contact Patterns (any type), vs Today/worklist (§7).
- I-H2 Days-without-contact: History none; dashboard weekdays from a stale calendar (Espinoza "20+" at 19 school days); Today calendar days (§7).
- I-H3 Inactivity days: dashboard 15, worklist 14 (§3.6).
- I-H4 Archived student excluded by History, included by dashboard quick views, Today and worklist (§7).
- I-H5 Attendance module Monday weeks feed Sunday-week consumers (§4.1).
- I-H6 Plan start honoured by the weekly table, ignored by Monthly Summary and MPR judged weeks (§7).
- I-H7 Four vocabularies for one pacing fact (Extremely Behind / 35.4 % BEHIND / CRITICAL / No Progress) (§7).

**Misleading UX**
- U-H1 "Today vs 7 Days" and "Weekly Change" labels do not adapt to 10- or 14-day gaps (§5.7).
- U-H2 Same-day re-export silently replaces the earlier entry in the view (§5.5).
- U-H3 No expiry, completion, drop, start or archived markers in the timeline (§5.8–5.12).
- U-H4 "12:00 PM" synthetic file times; "Missed this week 2" beside "4 not contacted" in the same panel (§4.2, §7).
- U-H5 Progress rounded to whole percent hides the gains the MPR counts (§3.3).
- U-H6 Duplicate "Edgenuity Progress" blocks (legacy + redesign) with different baselines (§8).

**Improvement opportunities**
- P-H1 Show the week's contact next to the week's pacing row; show target progress and target date; keep one decimal.
- P-H2 Replace averaged student arrows with per-course sentences; name the course in every program-level count.
- P-H3 Scope History by the dashboard who-filters like Today and the worklist do.
- P-H4 One school-calendar service; "Avg Weekly %" over completed school weeks only; exclude break weeks the way the audit sub-panel intended.
- P-H5 Surface "two imports on {date}; showing the later one" and "n courses no longer enrolled since {date}".

**Working correctly**
- W-H1 Per-import summary counts, all compare-card counts, and every inline per-course value matched the independent computation (§3.1–3.3).
- W-H2 Weekly Student Check-ins: every week, Sunday contact, plan-start exclusion, closed-plan exclusion, Excel dates, "resolved late" (§3.7).
- W-H3 Duplicate import skipped; older export kept as history; storage never overwritten; persistence across restart; clear-history dialog (§5).
- W-H4 No JavaScript errors in any state tested (§2).

---

## Appendix — fixture variants used

Generated for this audit from `qa/sample-data` (kept in the audit scratchpad, not committed to the repository):
`EdgenuityEnrollments_09_25_2026 (1).csv` (same-day re-export, Chen Algebra 3.0 → 4.0), `EdgenuityEnrollments_09_28_2026.csv`
(Alvarez + Art 1 started 9/28; Gutierrez Economics 100 % complete; Baker Biology removed; Ibarra Active again with a
9/28 gradebook entry; everyone else +2 progress), `EdgenuityEnrollments_09_29_2026.csv` (Chen Chemistry blank
Pacing/Target; Baker Geometry blank Progress/Grade; Espinoza blank Last Gradebook Entry), `ALE_Contact_Log_sunday.csv`
(Hale Teams Sun 9/20 15:00; Foster Phone Sat 9/19), plus the existing `ALE_Contact_Log_excel_dates.csv`,
`EdgenuityEnrollments_09_26/09_27_2026.csv`. Runs: `h1.js` (13 states), `h3.js` (button locations, values,
duplicate path, course cases, week/month tables, audit), `h4.js` (fresh profile: missing week, blanks, Excel-only
log, MPR communication through the module API).
