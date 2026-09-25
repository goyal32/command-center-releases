# Command Center — QA & Teacher-UX Audit (v0.2.46, 2026-09-25)

**What was audited.** The exact build teachers run: `Command-Center-Setup-0.2.46.exe` from this
repository's Releases page. The installer was unpacked (NSIS → `app-64.7z` → `resources/app.asar`), which
contains the full, unminified source: the Electron main process (`main.js`, `src/*.js`, `renderer/*.html`)
and the 53,000-line single-file dashboard `app-html/Command_center_universal_v120.html` (the "universal"
HTML app, made of ~95 `<script id="ipal-…">` modules layered on one core module at lines 10015–20758).

**How it was tested.** The real desktop app was run under Electron 36.9.5 on a virtual display, driven by
Playwright (`qa/playwright/`), with synthetic students (`qa/sample-data/`, no real data) covering every
requested scenario: on pace, slightly behind, severely behind, expired course, no recent activity, new
student, senior, missing weekly contact — plus archived enrollment, no e-mail on file, a "two teachers"
course and an ahead-of-pace student. Every panel, filter, Quick View, View Mode, sort, upload input,
e-mail button, export and window size (1920×1080, 1536×864, 1366×768, 1280×720, 1024×768) was exercised
while page errors, console warnings and `mailto:` launches were captured. Four independent static reviews
covered the e-mail builders, history/snapshot/export code, the MPR / Contact Watch / Attendance / reminders
modules and the Electron main process. Findings below say **[verified live]** when reproduced in the running
app and **[verified in code]** when confirmed by reading the code path.

**Line numbers** refer to the *original* 0.2.46 `Command_center_universal_v120.html` unless a file is named.

**Fixes.** Safe, local fixes were applied and re-verified in the running app (section 7). They are in
`qa/fixes/` as full files and as unified diffs (`*.patch`) to apply to the real source repository. This
repository only holds installers, so nothing here changes a shipped build until the patches are merged and
0.2.47 is built.

---

## 1. Critical bugs

### C1. The dashboard never restores on launch — every teacher sees "Resume from last session?" [verified live, FIXED]
- **Where:** core module, `restoreLatestDashboardImport()` call at L12482, `let __statusFilterSelection` at L12856,
  `const __POLICY_SORTS` at L13253 (`__isPolicySort`, `__updateBulkPolicyEmailButton`).
- **What happens:** the restore call sits half-way through the core script and runs `updateDashboard()`,
  which reads `let`/`const` bindings declared *further down* the same script. That is a temporal-dead-zone
  `ReferenceError` ("Cannot access '__statusFilterSelection' before initialization"), swallowed by
  `console.warn('Latest dashboard restore failed')`. The empty splash stays visible, so the session-guard
  module (L23242) shows the **Resume / Start fresh** card with a scary "Viewing cached data from your last
  session — re-upload files" warning on *every* launch. Teachers have been clicking Resume every morning
  without knowing the app was supposed to open straight onto their data.
- **Fix applied:** the two restore calls (`restoreAleFromStorage()`, `restoreLatestDashboardImport()`) now run
  at the end of the core script, after every binding exists; `__statusFilterSelection` is `var`-hoisted as a
  belt-and-braces measure. After the fix the app opens with 12 students on screen and no Resume card (stage 5).

### C2. ALE contact dates were sorted as text — every student showed "No Contact This Week" [verified live, FIXED]
- **Where:** `__parseAleContactLog` L13233 (`sort(localeCompare)`), consumers `__aleMissedLastWeekContact`
  L15790 (`new Date(str)`), risk score L50898, Today card L51142 (`dates.slice().sort()`).
- **What happens:** the per-student list of student-type contact dates is sorted as strings. The real ALE
  export uses `YYYY-MM-DD hh:mm:ss`, which sorts correctly — but the moment a teacher opens the CSV in Excel
  and saves it (very common), dates become `9/9/2026`, `9/16/2026`… and `"9/9/2026" > "9/23/2026"` as text.
  The "most recent" contact becomes an old one: all 12 test students were flagged *No Contact This Week*, the
  Quick View "Missing Weekly Contact" listed everyone, the Today card reported 7 students "reached 15 days
  without contact", and the same students' pill said "LAST CONTACT: 9/23/2026" — a contradiction on one row.
- **Fix applied:** a shared `__aleContactDateTs()` parses ISO or M/D/YYYY as a *local* date; the sort and the
  three consumers use it. Re-tested with the Excel-style file: pills show OK/contacted, and "Missing Weekly
  Contact" lists exactly the 5 students who really missed (stage 5).

### C3. Two calendars — audit, WAC, reminders and Free Movement still ran on the 2025-26 school year [verified in code, FIXED]
- **Where:** `TENANT_CONFIG.calendar` L147–185 (2025-26, `calendarEnd: '2026-06-19'`) vs
  `TENANT_CONFIG.school_calendar` L288 (2026-27). Readers of the stale block: hs-policy `__ipalBusinessDaysBetween`
  L22368–22407 (used by Quick Views *15–19 / 20+ school days no contact*, the contact banner, daily summary,
  AI helper), WAC intervention due dates L44361–44537, the Advisor Contact Audit `SCHOOL_YEAR`/`BREAK_WEEKS`
  L31394–31407, Free Movement reminders L40335–40417, year-end banner L39656.
- **What happens in September 2026:** `isHoliday()` returns false after 2026-06-19, so Labor Day (9/7) counts as
  a school day and every winter-break day will count in January: "20 school days without contact" fires a day
  early now and ~2 weeks early after winter break; intervention-plan due dates and "OVERDUE n school days" are
  wrong; the audit's school-year month list starts August 2025; the Friday Free-Movement reminder (enabled
  2026-09-05) never fires because the year window is "over".
- **Fix applied:** the legacy block is now *derived* from `school_calendar` at startup (`deriveLegacyCalendar`,
  inserted after the override merge at L380): school-year Sunday/Saturday bounds, expanded no-school weekdays,
  break weeks (< 3 school days) and `calendarEnd`. The static block was also updated to 2026-27 as a fallback.
  Note: "uncertain" days answered by the teacher in the 📅 panel are not folded in (they are stored per
  computer); that is the one remaining difference between the two calendars.

### C4. Bulk e-mail sent the wrong letter for six Quick Views [verified in code, FIXED]
- **Where:** `__policyCommonMessage` L13755–13825; button enabled for these keys by `recommendedSorts` L20785.
- **What happens:** `expired-date`, `no-contact-15-19`, `no-contact-20`, `missed-last-week-contact`,
  `graded-out` and `ungraded-work` had no body, so the fallback letter went out: *"Students are expected to make
  at least 10% progress in all enrolled courses within the first 10 days… may be placed on the watchlist"*.
  Pressing **Email Ready to Grade Out** mailed students who had *finished* a course a new-enrollment warning;
  the 20-day no-contact letter never mentioned contact.
- **Fix applied:** each key has a purpose-written intro and the 10-day paragraph is only included for the
  new-enrollment views. Subjects were also fixed (M4).

---

## 2. Medium-priority problems

### M1. "Behind pace" means four different things on one screen [verified live]
On the same import the Today card said **"12 students · 6 behind pace"** and, three lines up,
**"Program: 4 of 12 behind pace"**; the tile said **6 STUDENTS BEHIND/EXPIRED**.
- Tile / Behind-tile click (`updateDashboard` L16492, `renderView` L17495): worst pacing **< −5** *or* any expired course.
- Today card totals (`bucketOf` L51136): worst pacing **≤ −5**, expiry ignored.
- Leadership fact / Leadership panel (`tierOf` L52126): pacing **≤ −11** *or* target date passed.
- Status-grouped view, History, Excel colours (`getProgressBucketFromPacing` L11974, L17566, L18499, L19144):
  buckets at ≤ −5 / −10 / −20 / −30, **expiry ignored** — clicking the Behind tile opens the grouped view where an
  expired-but-on-pace student sits under "On Pace / Ahead".
- Student Summary badges (L18181): CRITICAL ≤ −30, **WATCH ≤ −10**, BEHIND < −1 — a third scale; a student at −3
  is "BEHIND" here, red in the Records List pill (L18672), but on-pace for the tile and green in Excel.
- Quick View "Watchlist Candidates" has two definitions: started > 10 days ago and progress < 10 % in the master
  list (L13300) vs pacing −5…−10 in Student Summary (L17941).
**Recommendation (not auto-fixed — it is a design decision):** one shared `classifyStudent(rows)` returning
`{bucket, expired, atRisk}` used by the tile, grouped view, Student Summary, Today card, Leadership, History,
snapshot and Excel; keep the five bucket labels the Records List already uses; treat expired as at least Watch
List everywhere. Until then the Leadership line now says "(11%+ behind or past target)" so the two numbers on
the Today card are at least explained.

### M2. "Expired" is decided against the clock on most screens but against midnight on the Expired Quick View [verified in code]
`< new Date()` at L16476, L17493, L17621, L17844, L18450, L18487, L19124 vs `< todayOnly` at L17410 (the
"⌛ Expired Target Dates" filter). On the due date itself the tile counts the student, the row shows the
pulsing EXPIRED pill and the Excel row is red, but the Expired Quick View does not list them until tomorrow.
**Recommendation:** one `isExpiredRow(row, todayMidnight)` helper; "target date passed" should mean *after*
the target date (the midnight rule).

### M3. Archived enrollments are counted on the dashboard but excluded in five modules [verified live]
The core module never reads `Enrollment Status`; Attendance (L42689), Advisory e-mail (L47630), Contact Watch
(L48563), MPR (L50221) and the new-student nudge (L53278) skip `Archived`. Leadership checked a column that does
not exist (`Status`, L52138 — fixed to `Enrollment Status`). With the archived test student the tiles said 12
students / 6 behind while Contact Watch showed 10 in view. **Recommendation:** drop archived rows once at import
(or a shared `isActiveEnrollment`), and say so in the import toast ("2 archived enrollments skipped").

### M4. E-mail subjects fell back to a bare "Reminder" [verified in code, FIXED]
`__getEmailSubject` L393–407 returned the tenant default before the per-view fallback, so Extremely Behind,
Behind + No Contact, the three bucket views and the 15–19/20-day views all went out as **"Reminder"** while
the code held better subjects. Order fixed and subjects added for every view.

### M5. Individual "No Activity" e-mail greets one student as "Hello Students," [verified in code, FIXED]
Module `ipal-no-activity-email-fix` (L6079) replaced the per-student letter with the bulk letter. The
per-student version now greets by first name. (The `missing-contact` fix module L5995 still uses a generic
"Hello," — acceptable.)

### M6. Weekly Snapshot "Top Changes" said *worsened* when the student improved [verified in code, FIXED]
`renderSnapshotComparison` L12362: `delta = current − previous pacing`, but `delta > 0` was labelled
"worsened". The bucket arrow on the same line said the opposite. Labels swapped.

### M7. History & Trends shifted Sunday contacts into last week [verified in code, FIXED]
`computeAleWeeklyPatterns` L24424 parsed `YYYY-MM-DD` with `new Date()` = UTC midnight = the previous evening
in Pacific time, so a Sunday contact counted as "missed this week". Now parsed as a local date.

### M8. Monthly Progress Report: teacher-only warnings were sent into the family-facing form [verified in code, FIXED]
`narrativeHtml` L50358 embeds red notes such as *"[ALE contact log for this month is not loaded — press Reload
ALE month…]"* / *"No direct personal contact is on file — add one before submitting"* in the Meeting Narrative,
and `openForm` L50408 sends that HTML into the Laserfiche form that the family receives. Warnings are now
stripped from the payload (`stripPanelWarnings`).

### M9. MPR communication status wrong with one judged week [verified in code, FIXED]
`evaluate()` L50320 tested `missedW === 1 → Needs Improvement` before `weeksMet === 0 → No Communication`, so a
student with zero qualifying contacts was "Needs Improvement" in the first week of a month and "No
Communication" a week later. Order fixed.

### M10. MPR draft state is memory-only [verified in code]
`state.filled` / `state.prepared` (L50171) are never saved. If the app is closed between "Prepare & open" and
ALE showing the report done, `finalize()` never runs: the pill later says "Done in ALE" but Monthly
Evaluations never gets the record, the "✅ I submitted it" button is gone and the Unsatisfactory→plan toast is
lost. **Recommendation:** persist per `sid|month` in localStorage and, on `loadMonth`, offer one-click
recording when `mpr_done && no ledger record`.

### M11. Contact Watch decisions share one storage key [verified in code]
Grace period (L48888), "I archived them" (L48904) and Resolved/Keep (L48919) all write `sid|<this Sunday>`.
Saving a grace period and then pressing Resolved the same week silently deletes the grace period (the
forgiven weeks start counting again). **Recommendation:** key grace windows separately (`sid|week|grace`).

### M12. Quit closes the database before the final backup runs [verified in code, FIXED in main.js]
`main.js` `before-quit` closed SQLite before the window's `close` handler wrote the quit-time backup, so that
backup always failed ("The database connection is not open" — visible in the log of every test run) and
"Stay" in the close prompt left the app running with no database. `storage.close()` moved to `will-quit`; an
explicit quit no longer re-asks "Close Command Center?".

### M13. Auto-backups written from the sign-in page contain no student data [verified in code, FIXED in main.js]
`runAutoBackup` ran with no session (the renderer bundle is null on the login page), recording DB-only
`.ccbackup` files that count against `keep` and postpone the next real backup. Now skipped when nobody is
signed in.

### M14. Admin "temporary password" promise is not kept [verified in code]
`users:create` / `users:setPassword` set `must_change_password` and `admin.html` says "They will be asked to
change it at next sign-in", but there is no change-password screen or IPC and login ignores the flag. Teachers
keep the admin's temporary password forever. **Recommendation:** add `auth:changePassword` and a forced
change on first sign-in (or remove the claim).

### M15. Logout during an in-flight ALE sign-in can leave the next user on the previous teacher's ALE session [verified in code]
`aleSync.js` `_login` (L186) awaits three requests; `resetUserState()` from logout runs in between, then
`_login` resumes and re-sets `loggedIn/user/creds`. "Sign in → immediately Logout → colleague signs in" within a
few seconds hands the colleague the previous ALE identity for the 30-minute poll (the approval dialog does show
the ALE user, which is the only mitigation). **Recommendation:** generation counter bumped on logout; `_login`
discards its result if the generation changed.

### M16. MPR "submitted" can be recorded for a form that was never submitted [verified in code]
`laserfiche.js` `pollFormGone` L133–145: if the teacher clicks Submit, gets a validation error and closes the
window inside 60 s, `clicked` is never cleared; the next form opened for *any* student fires `mpr:submitted`
on its first navigation with the old student's values. Any navigation (including an SSO re-auth redirect)
counts as a submit. **Recommendation:** clear `clicked` on window close, keep the 60-second window on the
navigate path, and only settle when the new URL is on the form origin and not the form itself.

### M17. Duplicate-contact heuristic blocks legitimate ALE writes with no override [verified in code]
`aleSync.js` `authorMatches` L477 treats any `created_by` sharing the teacher's surname (two staff named
Garcia) as "mine", returns `duplicate:true`, and `force` does not apply to that branch — the teacher cannot log
the contact at all for that student/type/day.

### M19. Weekly Snapshot Compare could never show a change [verified live, FIXED]
- **Where:** `autoSaveWeeklySnapshotSilently` L11655, called from the import handler at L12770 right after the
  comparison is computed; `updateDashboard` then recomputes the comparison against the freshly-saved snapshot.
- **What happens:** every Edgenuity import overwrote the saved weekly snapshot with the data just imported, so the
  banner always read "No major changes were found between the saved snapshot and the current report" (24 of 24
  "No Change" even after importing a file where every student slipped 12 points), and a snapshot the teacher saved
  with **Save Snapshot** was silently replaced by the next import.
- **Fix applied:** the silent auto-save keeps an existing snapshot that is less than a week old as the baseline
  (the manual Save Snapshot button still overwrites on purpose). Re-tested: importing a newer, worse file now
  lists the students under "Worsened".

### M18. Leadership entry lives inside the Quick View dropdown and hijacks the selection [verified live]
Picking "🏛 Leadership — by advisor, teacher, cause" in *Quick View* opens a full-screen modal and snaps the
dropdown back (L52620). In the test run the modal stayed open over the page while other controls were
operated (Playwright could not click anything until it was closed). A dropdown entry that behaves as a button
is surprising; a normal button next to PLC View would be clearer.

---

## 3. Minor problems

- **m1.** Group e-mail subject shows "(Current Filters)" instead of the teacher's name for teachers whose name
  contains "all" (Hall, Allen, Wallace) — `/all/i` at L17048. FIXED (`/^all\b/i`).
- **m2.** Accented first names lose letters in every individual e-mail: "José" → "Jos", "Zoë" → "Zo"
  (`cleanToken` L13839, `__cleanNameToken` L14127 strip non-ASCII). FIXED with `\p{L}`.
- **m3.** MPR comment drops 3-letter first names with a middle name ("Cruz, Eva Maria" → "Maria", "Kim, Ian
  Michael" → "Michael") — `extractFirstName` L16599 strips 1–3-letter tokens. FIXED (1–2 letters, and never the
  last token).
- **m4.** Advisory e-mail: when the link is too long twice, the body is dropped from the URL and then the BCC
  list overwrites the clipboard — the teacher's edited message is lost (L47760–47765). FIXED (body rides in the
  link once the addresses are on the clipboard).
- **m5.** MPR narrative read "by Email on today" when no direct contact exists (L50357). FIXED.
- **m6.** MPR deadline countdown used `new Date()` while the month picker uses `todayDate()` (L50211). FIXED.
- **m7.** Laserfiche pre-fill used `String.replace` with a string replacement, so `$&`, `$'`, `$$` inside a
  narrative corrupt the injected script (`laserfiche.js:119`). FIXED.
- **m8.** First-run: if the auto sign-in after "Create Admin Account" fails, `setMode(false)` hid every form
  (`login.html:459`). FIXED (`setMode('login')`).
- **m9.** "Download Missing Email List" can never appear: module 011's handler is attached after module 010's
  capture handler calls `stopImmediatePropagation` (L6967 / L7256).
- **m10.** Five wrappers of `buildBulkPolicyMailto` (modules 004–008) are dead code — module 010 clone-replaces
  the bulk button and builds its own link; module 007 would throw `ReferenceError` (`getAleContactsMap`,
  `safeStr` undefined) if it were ever reached.
- **m11.** Per-student policy letter repeats the 10 %-in-10-days rule up to three times in one e-mail (L13958,
  L14061, L14085).
- **m12.** "Worked Today" uses `Math.round` of hours (L10680): work at 8 pm yesterday reads "WORKED TODAY" before
  8 am; the No-Activity-7 rule uses calendar days. Use a date-only diff.
- **m13.** Three different "7-day baseline" pickers in History (L11033 requires ≥ 3.5 days, L12294 falls back to
  the previous entry, L24530 has no guard and can say "Since Sep 24 (Yesterday)").
- **m14.** Excel export omits Teacher, Active Time, Last Gradebook Entry / inactive days, Assignment Status and
  GAP % that the Records List shows (L19025–19054); the older CSV export does include Teacher.
- **m15.** Attendance board groups everyone under "(no teacher)" — it reads a `Teachers` column while the
  import carries `Teacher` [verified live].
- **m16.** Attendance "started in the last 2 weeks — remove the earlier weeks" nudge fires for *every* student in
  the first two weeks of the year (keys on Start Date ≤ 14 days, L53282); ignore starts within 14 days of
  `school_calendar.first_day`.
- **m17.** Attendance baseline is "last import", not "end of last week" (L42588): with a Monday import, work done
  Tue–Fri is credited to the following week.
- **m18.** MPR attendance credit from history is dated by import snapshot, not by the gradebook entry (L50284):
  a weekly importer sees completions one week late.
- **m19.** `auth:login` accepts a second identity while a session exists (a slow Google flow completing after a
  local login reloads the dashboard mid-work).
- **m20.** OneDrive discovery scans every 30 s on the main thread even when no district folder is configured
  (`main.js:167`, up to 3000 sync `readdirSync` per root) — a periodic stall on laptops with a large OneDrive.
- **m21.** `app.isQuittingForUpdate` is never reset if `quitAndInstall` fails (`updater.js:131`), silently
  disabling the close-time backup and close guard for the rest of the session.
- **m22.** Today card "N at 20+ days without contact" counts *calendar* days (L51134) while the Quick View it
  links to counts *school* days — same words, different numbers.
- **m23.** The Snapshot/History day keys use `toISOString()` from local midnight (L10870, L11258) — correct in
  Pacific time, off by one east of UTC (matters only if the app is ever used outside the US).
- **m24.** Header toolbar: the "19 compliance reminders" toast and the "Students report imported" toast cover the
  Edgenuity-freshness pill and ALE queue button at 1600 px wide [verified live, screenshot 01/02].
- **m25.** At 1366×768 (auto-zoom 94 %) the floating pills overlap content: Messages / Calendar / EOY on the
  left sit on top of the Smart-groups row and the "Not connected to the district folder" banner text, and the
  Reminders badge + "1 reconciliation issue" pill on the right cover the "Remind me tomorrow" button
  [verified live at 1366×768; screenshots are regenerated by `qa/playwright/stage4.js`]. Give the page a bottom/side padding equal to the pill
  stack, or dock the pills into one bar.
- **m26.** Attendance board groups every student under "(no teacher)" because it reads a `Teachers` column while
  the import carries `Teacher` [verified live, screenshot 23].
- **m27.** Smart Attention for an on-pace student says "No major concern found right now" but pre-selects the
  **Firm** tone and lists all eleven templates including "Drop / Withdrawal Notice"; default the tone to
  Supportive/Celebrate when nothing is flagged [verified live, screenshot 52].
- **m28.** Two "backup" concepts on one page: the desktop app writes automatic `.ccbackup` files (File menu), while
  History & Trends shows "🔒 Data backup — No backup saved yet" with Export All Data / Restore buttons (the
  browser-edition export). On the desktop the second one should say where the automatic backups are, not "none".
- **m29.** Leadership now excludes archived enrollments (the `Enrollment Status` fix), so until M3 is done the Today
  card reads "Program: 4 of 11 …" next to "12 students …" — the same import counted two ways.

---

## 4. Teacher UX problems (a first-time teacher's view)

1. **The first screen after sign-in asks the wrong question.** "Resume from last session? … Viewing cached data
   from your last session — re-upload files to load today's data" appeared on every launch (C1). A new
   teacher reads this as "something went wrong". With C1 fixed the dashboard simply opens; the Resume card
   should be reserved for genuinely stale data (> 1 day) and phrased positively ("Showing Tuesday's import —
   import today's file when you have it").
2. **Two dropdowns with the same 30 entries.** *Quick View* and *Order by* both list "Most Behind First",
   "Missing Weekly Contact", "20+ School Days No Contact", "PLC View"… The Quick View filters *and* the Order-by
   filters (the "policy sorts" hide non-matching rows). Nobody can predict which one to use. Recommendation: Quick
   View = *who* (filters), Order by = plain sorts only (A–Z, risk, grade, pacing, expired first); move the policy
   filters out of Order by.
3. **"Most Behind First" is a filter, not a sort.** It hides the on-pace students (8 of 12 shown) while its name
   promises a re-ordering. Say "Behind pace only (most behind first)".
4. **Four numbers for "behind".** See M1 — a teacher cannot reconcile the tile (6), the Today totals (6), the
   Leadership line (4) and the Student Summary badges.
5. **Row contradictions.** "LAST CONTACT: 9/20/2026" (a teacher-initiated entry) next to "20 days without an ALE
   student contact" on the Today card is technically right (only *student-type* contacts count) but reads as a
   bug. Label the pill "Last entry" and show "Last student contact" separately, or add a tooltip that says
   which types count.
6. **Vocabulary a new teacher does not know:** ALE, WAC 392-550-025, WSLP, MPR, PLC, EOY, "policy sort",
   "graded out", "Awaiting Grade Out (Ready to Process)", "Free Movement", "iPAL". None of it is explained
   in-app. A one-line glossary tooltip on each header button, and spelled-out names on first use ("Monthly
   Progress Report (MPR)"), would remove most support questions.
7. **Twenty-plus header buttons and floating pills.** Diagnostics, Data Setup, Contacts & Birthdays, ALE sync,
   ALE queue, District Overview, History & Trends, Reminders, Messages, Calendar, EOY Close-out, Copy View Link,
   reconciliation 🔍, plus nine tool buttons above the list. Group them into three menus (*Import*, *Tools*,
   *Reports*) and keep Today + the Records List as the page. Advisor/teacher accounts should not see District
   Overview, Diagnostics or EOY by default.
8. **Same message twice.** "Not connected to the district folder — staff Messages are off until you connect" is
   a banner *and* a Today-card line with two buttons each (Connect now / Remind me tomorrow / Connect →). One
   place is enough.
9. **"GAP: 1.5%" on a student who is ahead.** In the Records List a positive gap is good, but the word GAP and
   the same red/green treatment as behind-pace rows make it read as a problem. Show "+1.5% ahead".
10. **Email buttons do not say what they will send.** "✉ Email Student", "✉ Email Advisory", "Email Watch List
    Group", "✍️ Check-In Draft Reply", "✨ AI" — five ways to e-mail with no preview of the body before Outlook
    opens (Email Advisory is the exception and has the best flow: preview, edit, include guardians). Reuse that
    preview modal for every e-mail button.
11. **The Today card ages badly.** "since today 8:05 AM" with facts like "Risk jumped for Marcus C., Luis E., Mateo I…"
    include an *archived* student (M3) and use first-name-plus-initial while every other screen uses "Last, First".
12. **Birthday line reads the wrong age if the Students report DOB is wrong** ("turns 26") — a sanity check
    (age 12–22) would suppress obviously bad data instead of announcing it.
13. **Monthly Evaluations panel jargon:** "1 first-claim to document", "Board Report", "Weekly Briefing", "Focus"
    appear with no explanation of what a first-claim is or who the board is.
14. **Zoom hint at 1366×768:** auto-fit zooms to 94 %, at 1280×720 to 88 %, at 1024 px to 71 % (table then
    overflows). Fine on the common Windows sizes; worth a one-time toast explaining Ctrl +/− and Ctrl 0.

### The Monthly Progress Report (MPR) workflow
Steps a teacher performs today (module 082): open **📝 Monthly Reports** → (Step 1 "Connect") turn on ALE sync,
sign in to Edgenuity in the app window, "Reload ALE month", check the calendar → (Step 2) pick advisor code /
All students / month → per student **Prepare & open** (waits for the month load, prints the Edgenuity PDF,
evaluates, confirms if no direct contact, opens the pre-filled Laserfiche form) → sign and Submit in the form
window → the app records the evaluation when ALE shows the report done, when the form window navigates away, or
when the teacher presses **✅ I submitted it** → if Unsatisfactory, a toast says "create the intervention plan in
Monthly Evaluations" → the teacher must find Monthly Evaluations, create the plan, return to the MPR *Full
panel* (not the wizard), select the student, press **Send intervention plan to ALE**, and later **Checkpoint
review**.

Verdict: the *evaluation* half is genuinely good (determinations are explained, the narrative is generated, the
form is pre-filled, the default month on the 25th is correct with "4 working days left"). The problems are the
seams:
- **Unnecessary steps:** Step 1 "Connect" should disappear once connected (it is always shown); "Reload ALE
  month" should happen automatically when the panel opens; the Edgenuity PDF should be fetched once per month
  for the whole caseload, not per student on click; "I submitted it" is needed only because submit detection is
  unreliable (M16) — fixing detection removes the button.
- **Stuck paths:** memory-only drafts (M10); the intervention plan lives in a different panel with no link from
  the wizard row; the *Full panel* is the only place with Send-to-ALE / Checkpoint, which the wizard never
  mentions.
- **Wording:** wizard rows show tokens ("Unsatisfactory / No Communication") without the one-line rule that the
  Full panel shows; warnings were leaking into the family narrative (M8, fixed).
- **Recommended shape (documented, not built):** a single per-student row with four states — *Needs ALE data →
  Ready → Form opened → Recorded* — one primary button per state, the intervention-plan action appearing in the
  same row when the result is Unsatisfactory, and a month summary at the top ("14 of 22 recorded · window closes
  Wed 9/30").

---

## 5. Suggested improvements

1. **One classifier for pacing/expiry/risk** shared by every screen (M1, M2) — the single highest-value change.
2. **Drop archived enrollments at import** and show the count in the import toast (M3).
3. **Split Quick View (who) from Order by (how)**; rename "Most Behind First" (UX 2–3).
4. **Group the header into Import / Tools / Reports menus; role-based defaults** (UX 7).
5. **Glossary tooltips and spelled-out acronyms** (UX 6).
6. **MPR wizard: state-driven rows, auto-reload, persisted drafts, in-row intervention plan** (section 4).
7. **Contact Watch: separate storage keys for grace vs decisions** (M11).
8. **Change-password flow** for teachers (M14).
9. **ALE session hygiene:** generation counter on logout (M15); exact-author duplicate rule with `force` override (M17).
10. **Reliable submit detection** for the Laserfiche form (M16).
11. **Remove dead e-mail wrapper modules 004–008** and fold 011 into 010 (m9, m10) — 600 fewer lines and one code
    path for bulk e-mail.
12. **Excel export parity** with the Records List columns (m14).
13. **A single `parseLocalDate()`** used for every Edgenuity/ALE date (m23, M7); every `new Date(str)` on a
    date-only string is a latent off-by-one.
14. **Automated tests:** the harness in `qa/playwright/` already imports data and walks every panel; wire it to a
    CI job that runs on each release build with the synthetic dataset, failing on any page error. Add one smoke
    assertion that every module's global exists after load (`window.MPR`, `__ipalToday`, `__ipalContactWatch…`):
    a syntax error in one `<script id="ipal-…">` block silently removes that whole feature (its button simply
    disappears) — this audit's own first patch of the MPR module tripped exactly that and was caught only because
    the walk noticed the Monthly Reports button was gone.
15. **Content-Security-Policy** for the HTML app (Electron warns on every launch); the CDN dependencies could be
    bundled with the installer so the app works offline and does not depend on cdnjs / jsDelivr availability.

---

## 6. Features that are already working correctly (verified live)

- Sign-in, first-run admin creation, session chip with role, logout/login round-trip; no page errors on any
  screen in the whole walk (0 uncaught exceptions across five stages on the original build; the only console
  warnings were the two restore errors fixed in C1).
- Edgenuity import: single and multi-file, older-file detection ("saved to history, dashboard kept"), header
  variants, teacher normalisation ("two teachers" → configured name), advisor/counselor tokens from External ID,
  course-prefix stripping, attendance-course rows split off to the Attendance board, completion event fired.
- ALE enrollment + contact log import (ISO dates), Students-report import (e-mails, birthdays, 🎂 on the row and
  Today card), Downloads watcher hooks.
- Tiles and per-student math: unique-student counts, worst-pacing roll-up, at-risk (grade < 70 / ≤ −30 /
  expired), averages; filters (school, counselor, advisor, teacher, status multi-select, search, ALE no-contact)
  all narrow consistently and compose; every Quick View and sort renders without error and picks the expected
  students for the synthetic scenarios (extremely behind = Chen; expired = Dawson; no activity 7+ = Espinoza,
  Ibarra, Chen; new starts = Foster; 20+ days = Espinoza).
- View modes: Course List, Student Summary (worst pacing, lowest grade, total active time, teachers), Group by
  Course (per-course counts and last activity), Group by Student, Group by Advisor, Group by Grade Level.
- Today card: correct facts for the scenarios (attendance-course nudge for the new student, birthday, worse
  bucket, risk jump, 15/20-day crossings, module counts) with working action buttons.
- Contact Watch: the ladder is right for the scenarios (Espinoza 3 weeks → archive step, Chen 2 weeks → meeting,
  Hale 1 week → reach out), week chips, Resolved / Keep / Archived / Grace decisions with reasons, notes, audit
  log copy, follows the dashboard filters.
- Attendance board: graded / awaiting grade / missing with the reason ("last activity 9/10", "Pending Grading"),
  new-student nudge, link to Contact Watch.
- Monthly Evaluations (WAC) panel, WSLP checker, Reminders centre (19 items across compliance types), History &
  Trends (three weekly imports produce trend deltas), Advisor Weekly Digest,
  PLC View cards, Leadership meeting list and Excel/print report, District Overview, Messages "Connect" screen,
  School calendar panel with the two "uncertain day" questions, EOY close-out, Diagnostics, Ctrl+K Ask.
- E-mail: Email Advisory preview modal with guardian option and clipboard fallback; per-student e-mail
  builds a course-by-course letter with the right first name for "Last, First" names; mailto links are
  encoded correctly and echoed to the ALE queue.
- Exports: Excel (colour) and CSV download the current view; print report opens a clean report window.
- Responsiveness: no horizontal scroll at 1920×1080, 1536×864, 1366×768 or 1280×720 (auto-zoom 100/100/94/88 %);
  header wraps instead of overflowing; modals fit at 1366×768.
- Report windows open correctly inside the desktop app (EOY close-out, printable student brief, Leadership
  print) — `window.open('', '_blank')` is allowed by the main process; Reminders, Messages, Diagnostics, Copy
  View Link, the user menu (Sign out) and the inline contact history all open and close cleanly.
- Desktop: zoom shortcuts, window placement memory, backups folder, repair dialog, update guard, single
  instance, role gates on every IPC channel (admin-only user management, oversight-only feature switches).

---

## 7. Fixes applied and verified

All fixes are marked `// QA-fix` in the patched files. Verified by re-running the harness on the patched build
(`qa/playwright/stage5.js`):

| # | Fix | Verification |
| --- | --- | --- |
| C1 | Startup restore moved to the end of the core script; `__statusFilterSelection` hoisted | App opens with 12 students, no Resume card, no restore warning |
| C2 | Date-aware sorting of ALE contact dates (`__aleContactDateTs`) in the parser, `__aleMissedLastWeekContact`, risk score and Today card | Excel-format log: pills correct, "Missing Weekly Contact" = the 5 real misses |
| C3 | `calendar` derived from `school_calendar`; static block rolled to 2026-27 | `TENANT_CONFIG.calendar` = 2026-08-30 → 2027-06-19, 26 closures, Labor Day 9/7 included |
| C4 | Bodies for the six Quick Views; 10-day paragraph only for new-enrollment views | `__policyCommonMessage('graded-out')` etc. return the new text |
| M4 | Subject fallback order and per-view subjects | `__getEmailSubject('no-contact-20')` = "Urgent: Weekly Contact Required" |
| M5 | Per-student No-Activity letter greets by first name | code |
| M6 / M19 | Snapshot improved/worsened labels; auto-save no longer overwrites a snapshot younger than a week | importing a newer, worse file shows the students under "Worsened" (stage 9) |
| M7 | Local date parse in History weekly patterns | code |
| M8 | Panel warnings stripped from the Laserfiche narrative | code; MPR module loads (`window.MPR` present, Monthly Reports button back, wizard opens) |
| M9 | MPR communication status order | code |
| M12/M13 | `storage.close()` in `will-quit`; explicit quit auto-allows unload; no backups from the sign-in page | log no longer shows "database connection is not open" at close |
| M18 | Leadership fact states its threshold | Today card text |
| m1–m8 | Name/greeting/subject/wording fixes, `setMode('login')`, `replace` callback | code |
| — | Leadership reads `Enrollment Status` | code |

**Files:** `qa/fixes/Command_center_universal_v120.html.patch` (29 hunks, CRLF line endings preserved) and
`qa/fixes/desktop-main-process.patch` (`main.js`, `src/laserfiche.js`, `renderer/login.html`). Apply with
`patch -p1` as described in `qa/fixes/README.md`, build 0.2.47, and run `qa/playwright/smoke.js` against it.
Final smoke test on a fresh profile against the patched build: 15 of 15 assertions passed, zero page errors.

**Not changed on purpose** (documented above, need a decision or a larger change): M1–M3, M10, M11, M14–M17,
UX 2–12, m9–m23.
