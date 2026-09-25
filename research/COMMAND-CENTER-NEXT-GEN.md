# Command Center — Next Generation: research and architecture

**Status: research only.** Prepared 2026-09-25 on the `claude/cool-einstein-l3ccqm` branch. No Command Center
production code was modified, patched, committed or released for this document. It builds on the QA audit of
the installed 0.2.46 build (`QA-AUDIT.md`), public official documentation, and public open-source repositories.

**Sourcing caveat.** The research container could search the web but could not open pages on leg.wa.gov,
ospi.k12.wa.us, imaginelearning.com, huggingface.co and several other domains, so quoted regulatory and vendor
text comes from search-index excerpts of the cited pages. Every requirement, product claim and library carries a
URL; verify quotations against the live source before relying on exact wording. Open-source licenses were checked
against GitHub metadata where the API answered and are marked *unverified* otherwise. No code was copied.

**Reading order.** Part 1 says what exists today, Part 2 what Washington requires, Part 3 what Imagine Edgenuity
can and cannot feed automatically, Part 4 which libraries could help, Parts 5–9 the automation catalogue and the
designs (Autopilot, Audit Ready, MPR, Brain), Parts 10–11 local AI and the market, Part 12 the scored roadmap and
the five features to investigate first.

---

## Part 1 — What Command Center 0.2.46 already does

Source: the audited 0.2.46 build (Electron main process + the `Command_center_universal_v120.html` app, ~95
`ipal-*` modules). Status key: **Implemented** = works end-to-end today; **Partial** = exists but with the gaps
noted; **Manual** = the teacher does it by hand with the app's help; **Missing** = not present.

### 1.1 Dashboards and views

| Area | What exists | Status |
| --- | --- | --- |
| Main dashboard | Five tiles (unique students, avg grade, behind/expired, high risk, avg progress), charts (pacing distribution, grade distribution; hidden on short screens), Records List with per-student header row and per-course rows (start/target, last work, active time, progress vs goal, grade, pacing pill) | Implemented |
| Filters | School, counselor, advisor, teacher, ALE status multi-select, search, "ALE no contact (7 days)" box; Smart Groups (saved filter sets with live counts); Copy View Link; saved view state in URL | Implemented |
| Quick View (30 entries) | Behind buckets, extremely behind, behind + no contact, missing weekly contact, missed last week, no activity 7+, 15–19 / 20+ school days no contact, new starts 5/10, 10-day check, watchlist candidates, target date approaching, expired, ungraded work, ready to grade out, PLC View, Leadership | Implemented (definitions inconsistent, see audit M1) |
| View modes | Course list, Student Summary (worst pacing, lowest grade, active time), Group by course / student / advisor / grade level; Course Summary cards | Implemented |
| Student view | Click a name → profile banner, MPR comment generator, inline student history (per-course trend table with week columns), Smart Attention overlay (why flagged + template picker + tone), printable one-page brief, contact history row, Check-In Draft Reply | Implemented |
| Course view | Group by course; per-course counts (behind/critical/expired/need action), last activity; Course Summary module | Implemented |
| Advisor view | Advisor filter, Group by Advisor, Advisor Weekly Digest (needs-action / no-contact / new starts / expired tiles), Email Advisory, Advisor Contact Audit (weekly compliance % per advisor) | Implemented |
| Today card | Facts vs previous import (worse bucket, risk jump, 15/20-day crossings, new expirations), module counts (checkpoints, MPRs open, ALE queue pending, Contact Watch steps), attendance nudge, messages nudge, birthdays; optional AI prose line | Implemented |
| Today's Worklist | Ranked to-do (score = no check-in 4, expired ≤9, 10-day ≤6, inactivity 2–3, pacing 1–3, failing ≤3, grade-out 1) with chips and daily-resetting checkmarks | Implemented |
| Leadership view | Program/advisor/teacher/cause briefing, meeting list, tiers, "ask" questions, Excel + print | Implemented |
| PLC View 2.0 | Meeting cards: evidence → tried → decision → owner → follow-up; log to ALE queue | Implemented |
| District Overview | Counts-only activity summaries per staff member from the shared folder; Monthly Reports on/off per staff | Implemented (oversight roles) |
| Ask (Ctrl+K) | Deterministic intent parser over the current scope; optional AI phrasing | Implemented |

### 1.2 MPR (Monthly Progress Report) functions

| Function | What exists | Status |
| --- | --- | --- |
| Month selection, MPR window countdown (last 5 working days) | `defaultMonth()`, `deadlineText()` | Implemented |
| Per-student determinations | Progress summary (On Target / Adequate / Unsatisfactory / No Progress from pacing gap, failing count, expiry), communication status (weeks met of judged weeks), overall status (rule: both / either / progress) | Implemented |
| Evidence pull | ALE monthly status + weekly contact-log CSVs (desktop, via ALE sync); Edgenuity progress-report PDF per student (in-app window) | Partial: per-student on click, memory-only, needs ALE sync signed in |
| Narrative + report notes | Generated meeting narrative (successes / challenges / next steps or intervention plan), course-by-course notes with Edgenuity lag explanation | Implemented (warnings leaked into narrative — fixed in audit) |
| Form pre-fill | Laserfiche form opened in an app window, fields filled, teacher signs and submits | Implemented (desktop only) |
| Submission detection / recording | `mpr:submitted` from the form window, ALE polling, "I submitted it" | Partial: unreliable detection, drafts not persisted (audit M10, M16) |
| Ledger | Monthly Evaluations IndexedDB (result per sid|month), consecutive-unsatisfactory count | Implemented |
| Intervention hand-off | Toast only; plan lives in Monthly Evaluations; Send-to-ALE / Checkpoint only in the Full panel | Manual |

### 1.3 Intervention functions

| Function | What exists | Status |
| --- | --- | --- |
| Monthly Evaluations (WAC) panel | Satisfactory/Unsatisfactory per student per month, first-claim flag, 5-school-day plan due date with countdown, plan record (strategies text, WAC options: contact / goals / course, involvement, checkpoint date ≈ +10 school days, status open/closed), AI-drafted plan text, three-consecutive-months note, board report, print | Implemented |
| Plan → ALE | `addIntervention` with manager match, strategy mapping, approval dialog; goal checkpoint review → ALE | Implemented (desktop, ALE session) |
| Checkpoint follow-up | Reminder when checkpoint date passes; Today card fact | Implemented |
| Escalation across months | Consecutive-unsatisfactory counter shown; no automatic escalation workflow (what changes at month 2/3) | Partial |
| Family involvement record | Free-text "involvement" field only | Partial |

### 1.4 ALE contact tracking

| Function | What exists | Status |
| --- | --- | --- |
| Contact log import | CSV import (multi-file, merged, capped), student-type vs non-student-type rules, per-student last contact + all student-type dates | Implemented |
| ALE auto-sync | Main-process pulls (contact log this+last week, enrollment, course enrollment) with the teacher's own ALE login every 30 min; "verify now" | Implemented (desktop, per-teacher login) |
| ALE review queue | Collects app-observed contacts (attendance completions, drafted e-mails, Contact Watch notes, recorded check-ins, voice check-ins), duplicate check against ALE, approval dialog, write to ALE, verification on next pull | Implemented |
| Contact Watch | Sunday–Saturday ladder (1/2/3+ weeks), decisions (Resolved / Keep / Archived in Edgenuity / Grace), auto-return, notes, audit log copy | Implemented |
| Weekly contact status on rows | "Contacted this week / No contact this week" pill; missing-weekly-contact and missed-last-week views; 15–19 / 20+ school-day views | Implemented (string-sort bug fixed in audit) |
| Contact evidence fields | Date, type, author, notes text from ALE; method/subject only as free text | Partial (subject of communication not structured) |

### 1.5 E-mail functions

| Function | What exists | Status |
| --- | --- | --- |
| Per-student e-mail | Course-by-course letter, policy letters per Quick View, smart templates with tone, AI draft (local model) | Implemented |
| Bulk e-mail | BCC per Quick View with clipboard fallback, missing-e-mail coverage note | Implemented (six views had wrong bodies — fixed) |
| Email Advisory | Preview modal, templates, guardians option, signature | Implemented (the best flow in the app) |
| Auto-log of e-mails | mailto echoed to the ALE queue as Teacher Initiated (never counts as check-in) | Implemented |
| Delivery / reply tracking | None (mailto hands off to Outlook) | Missing |

### 1.6 Attendance and contact history

| Function | What exists | Status |
| --- | --- | --- |
| Attendance board | Weekly attendance-course done / awaiting grade / missing with reason, baseline roll-over, new-student nudge | Implemented (baseline = last import, audit m17) |
| Contact history per student | Inline row (ALE + app check-ins), archive of older check-ins in IndexedDB | Implemented |
| Weekly Student Check-ins (History panel) | Per-advisor weekly pattern, chronic no-contact | Implemented (UTC bug fixed) |

### 1.7 Snapshots and trends

| Function | What exists | Status |
| --- | --- | --- |
| Auto history | Every Edgenuity import saved to IndexedDB (deduped, school-year cleanup), ALE snapshots, enrollment snapshots | Implemented |
| History & Trends panel | Baselines (7/14/30 days), trend cards, per-student inline trend, monthly summary | Implemented |
| Weekly Snapshot compare | Save/compare buckets, improved/worsened lists | Implemented (auto-overwrite bug fixed) |
| Reconciliation diff | Edgenuity vs ALE course enrollment differences, FTE overclaim check | Implemented |

### 1.8 Reminders and automation that already exists

| Function | What exists | Status |
| --- | --- | --- |
| Reminder Center | Ten reminder kinds (plans overdue, checkpoints due, evaluations needed, attendance missing/awaiting grade, new ALE students not in Edgenuity, marked-enrolled-but-missing, archive step, meeting step, Free Movement), mute per kind, remembered scope | Implemented |
| Downloads watcher | Recognises Edgenuity/ALE/Students CSVs landing in Downloads and offers one-click import | Implemented |
| ALE auto-sync | 30-minute pulls; contact verification | Implemented |
| Auto-backup | Every 6 h + on close (.ccbackup with DB + renderer bundle) | Implemented |
| Auto-update | GitHub Releases, install now/later, repair | Implemented |
| Free Movement reminders | Friday/Monday switch reminders (calendar-gated; broken by stale calendar — fixed) | Implemented |
| Scheduled scans | None: every computation runs when the page is open and data is imported | Missing |
| Background jobs | None outside ALE sync and backups | Missing |

### 1.9 Exports and leadership/admin

| Function | What exists | Status |
| --- | --- | --- |
| Exports | Excel (colour) of current view, CSV, print report, Leadership Excel/print, EOY close-out report, audit log copy (Contact Watch), Board report | Implemented (column parity gaps, audit m14) |
| Admin | Local accounts, roles (admin/director/facilitator/advisor/teacher/readonly), audit log window, backups list, District Setup File provisioning, licensing, feature switch (MPR on/off per staff) | Implemented |
| Staff messages | OneDrive shared-folder messaging with groups and toasts | Implemented |
| Voice check-ins | Local Whisper transcription | Implemented |
| Local AI | Qwen2.5-1.5B via node-llama-cpp for e-mail drafts, Today prose, plan drafts, Ask | Implemented (optional download) |

### 1.10 What is missing altogether

- A **unified student/course/contact model**: modules read raw CSV rows and re-derive students, buckets and
  contact rules independently (four "behind" definitions, three sid extractors, two calendars).
- A **rules engine** with declared rules, thresholds and explanations; rules are scattered across modules.
- A **task/work-queue object** with owner, due date, evidence and completion state that survives restarts
  (the worklist resets daily; Contact Watch, MPR, WAC and reminders each keep their own state).
- **Scheduled/background evaluation** (nothing runs unless the page is open and the teacher looks).
- **Evidence packet / audit export** across modules (each module exports its own slice).
- **Family communication log with delivery/reply tracking** (mailto only).
- **Structured contact evidence** (method / subject / who) beyond ALE's type + notes.
- **Cross-month escalation workflow** (second/third unsatisfactory month → required actions).
- **Course-expiration forecasting** (projected finish date vs target date; only "expired" is detected).
- **Graduation/credit risk** for seniors (EOY close-out is a year-end snapshot, not a running indicator).
- **Data quality checks on import** beyond header presence (no anomaly detection: duplicate SIDs, impossible dates, sudden roster drops).


---

## Part 2 — Washington ALE / OSPI requirements and the Compliance Automation Matrix

### 2.0 How to read this part
The requirements catalogue and open questions that follow (2.1–2.4) were researched from the Washington
Administrative Code, RCW, OSPI guidance and State Auditor reports. Because this container could not open
leg.wa.gov or ospi.k12.wa.us directly, quoted text comes from search-index excerpts of those pages and must be
checked against the cited URL before it is used in product copy or policy. **Command Center is a tracking and
documentation aid; nothing in this report claims it makes a district compliant.** The obligations sit with the
district and its certificated staff.

Key sources: [Chapter 392-550 WAC](https://app.leg.wa.gov/WAC/default.aspx?cite=392-550&full=true) ·
[WAC 392-550-020 definitions](https://app.leg.wa.gov/wac/default.aspx?cite=392-550-020) ·
[WAC 392-550-025 written student learning plan](https://app.leg.wa.gov/wac/default.aspx?cite=392-550-025) ·
[WAC 392-550-030 program requirements](https://apps.leg.wa.gov/WAC/default.aspx?cite=392-550-030) ·
[WAC 392-550-040 truancy / missed contact](https://app.leg.wa.gov/wac/default.aspx?cite=392-550-040) ·
[WAC 392-550-045 board policies](https://app.leg.wa.gov/wac/default.aspx?cite=392-550-045) ·
[WAC 392-550-060 reporting](https://www.law.cornell.edu/regulations/washington/WAC-392-550-060) ·
[WAC 392-550-065 documentation and retention](https://app.leg.wa.gov/wac/default.aspx?cite=392-550-065) ·
[WAC 392-121-182 ALE enrollment](https://app.leg.wa.gov/wac/default.aspx?cite=392-121-182) ·
[RCW 28A.232.010](https://app.leg.wa.gov/rcw/default.aspx?cite=28A.232.010) ·
[RCW 28A.250.060 online providers](https://app.leg.wa.gov/RCW/default.aspx?Cite=28A.250.060) ·
[OSPI Guide to Offering ALE (July 2024)](https://ospi.k12.wa.us/sites/default/files/2024-09/publication-guide-offering-ale.pdf) ·
[OSPI ALE Self-Assessment (Jan 2026)](https://ospi.k12.wa.us/sites/default/files/2026-01/ale_self_assessment.pdf) ·
[OSPI ALE Year End Report guidance](https://ospi.k12.wa.us/sites/default/files/2025-04/guidance-reporting-ale-yer.pdf) ·
[OSPI Program Review & Support](https://ospi.k12.wa.us/policy-funding/grants-management/program-review-support-formerly-cpr).

### 2.1 Compliance Automation Matrix

"Current Command Center capability" is from the 0.2.46 audit (Part 1). "What can be automated" means detect,
compute, remind, prepare and record; it never means decide.

| Requirement (id) | Evidence required | Current Command Center capability | What can be automated | What requires educator judgment | Missing capability | Citation |
| --- | --- | --- | --- | --- | --- | --- |
| **ALE-01 Written student learning plan** in place (start date before first count day; required elements; certificated teacher accountable per course) | Approved plan with dates, weekly-hours estimate, per-course goals/objectives/activities, evaluation timelines, materials, standards, course type (online/remote/site-based), how weekly contact will be fulfilled | WSLP Checker (checklist of the OSPI self-assessment elements per student, completeness %, board report); plan start/end dates from ALE enrollment; reconciliation of Edgenuity vs ALE course lists | Completeness check per element; flag plan end date passed with no successor plan; flag courses in Edgenuity not on the plan (and vice versa); flag plan start after the next count day; remind on course change to update the plan | Writing goals that "facilitate monthly evaluation"; the hours estimate; approving the plan | The plan document itself is not stored; no course-type field; no "plan updated after change" workflow | [392-550-025](https://app.leg.wa.gov/wac/default.aspx?cite=392-550-025), [392-121-182](https://app.leg.wa.gov/wac/default.aspx?cite=392-121-182) |
| **ALE-02 Weekly contact** (direct personal contact = one-to-one, two-way; or in-person / synchronous instructional contact; each school week with ≥3 in-session days) | Date, method, subject of communication, certificated teacher, student (attendance records for scheduled classes) | Contact Watch ladder (Sun–Sat weeks, ≥3-school-day rule, 1/2/3+ week steps, decisions with reasons, grace); row pills; Quick Views; ALE log import + auto-sync; student-type vs teacher-initiated distinction; attendance-course completion counts as check-in (district policy) | Detect a week with zero qualifying contacts; count consecutive and cumulative missed weeks; require method and subject on app-recorded contacts; flag contacts with parent only (if student is not K-8) or by non-certificated staff; queue the parent notification after a missed week | Whether an exchange was genuinely two-way and instructional; whether a justification is valid under board policy; conducting the conference | Structured *subject* field on app contacts; capture of the student's reply (two-way proof) for e-mail; a "valid justification" code list from board policy | [392-550-020](https://app.leg.wa.gov/wac/default.aspx?cite=392-550-020), [392-550-065](https://app.leg.wa.gov/wac/default.aspx?cite=392-550-065), [Guide 2024](https://ospi.k12.wa.us/sites/default/files/2024-09/publication-guide-offering-ale.pdf) |
| **ALE-02b Missed-contact escalation** (parent informed by direct personal contact after any unjustified missed week; after 2nd consecutive or 3rd cumulative missed week: conference, screener, data-based intervention plan; truancy petition by 5th consecutive / 6th cumulative) | Dated parent notification; conference record; screener; intervention plan; petition filing | Contact Watch tracks *consecutive* weeks only (reach out / meeting / archive steps mirror district practice, not the WAC conference-and-screener steps); no cumulative counter; no parent-notification record | Cumulative and consecutive counters with justification codes; tasks for parent notification, conference + screener at 2/3, petition deadline at 5/6; evidence links for each | Justification decisions; holding the conference; choosing the screener; filing | Cumulative missed-week counter; parent-notification evidence; conference/screener records; petition tracking | [392-550-040](https://app.leg.wa.gov/wac/default.aspx?cite=392-550-040), [392-550-045](https://app.leg.wa.gov/wac/default.aspx?cite=392-550-045) |
| **ALE-03 Monthly progress evaluation** (each calendar month, by a certificated teacher, against plan objectives, must include direct personal contact, communicated to student and to parent for K-8) | Dated evaluation per month, evaluator, determination, the DPC that accompanied it, communication record | Monthly Evaluations panel (Satisfactory/Unsatisfactory per month, evaluator name, first-claim flag); MPR wizard computes proposed summary/communication status and checks for direct contact in the month; Laserfiche form pre-fill; ledger | Detect a month of enrollment without a recorded evaluation; require a linked DPC in the month; require "communicated to" (parent for K-8 by grade level); assemble the evidence packet (Part 8); remind before the district window closes | The satisfactory/unsatisfactory determination and what it is based on | Communication-to-family record; grade-level rule for parent inclusion; the signed form is not captured | [392-550-030](https://apps.leg.wa.gov/WAC/default.aspx?cite=392-550-030), [RCW 28A.232.010](https://app.leg.wa.gov/rcw/default.aspx?cite=28A.232.010) |
| **ALE-04 Intervention plan within 5 school days** of an unsatisfactory evaluation, by a certificated teacher with the student (and parent for K-8), documented and implemented | Plan, its date, participants, implementation evidence | WAC panel: plan record with due date = +5 school days (calendar-aware after the audit fix), checkpoint ≈ +10 school days, strategies, WAC option boxes, involvement text, ALE write, reminders | Start the timer on save; task with derivation; block "closed" without content; K-8 parent participation field required; checkpoint review task; implementation evidence prompts (contacts, goal progress) | Plan content; implementation; whether it is working | Parent participation as a structured field; implementation evidence linkage; the plan document as a stored artefact | [392-550-030](https://apps.leg.wa.gov/WAC/default.aspx?cite=392-550-030), [392-550-020](https://app.leg.wa.gov/wac/default.aspx?cite=392-550-020) |
| **ALE-05 No more than three consecutive unsatisfactory months** despite documented intervention → new course of study (may include removal from ALE) | Sequence of evaluations, interventions between them, revised course of study / new plan with date and participants | Consecutive-unsatisfactory counter shown in the WAC panel and MPR; "three consecutive months" note field | Count per student with the intervention record between months; tasks at month 2 (review plan) and month 3 (course-of-study decision required); require a new plan or program change record to clear | Designing the new course of study; removal decision | Escalation workflow; new-plan / program-change record; pause rules over breaks (policy) | [392-550-025](https://app.leg.wa.gov/wac/default.aspx?cite=392-550-025), [392-550-030](https://apps.leg.wa.gov/WAC/default.aspx?cite=392-550-030) |
| **ALE-06 Enrollment counting / FTE** (monthly count days; plan in place before first claim; prior-month evaluation; exclude students with 20 consecutive school days without certificated-teacher contact until they meet the teacher and resume; FTE = plan minutes ÷ 1,665) | Plan dates and minutes; contact log proving no 20-school-day gap at each count day; prior-month evaluation; P-223 detail | Quick Views for 15–19 and 20+ school days without contact (calendar-aware after the audit fix); reconciliation module's FTE overclaim check; Today card crossings (calendar days, not school days — audit m22) | Per-count-day eligibility list (plan in place, contact within 20 school days, prior-month evaluation recorded); warn at 10/15 school days; "resumed participation" checklist after a 20-day gap; export for the enrollment office | Confirming resumed participation; certifying the count; the hours estimate | Count-day calendar (WAC 392-121-119) in the app; eligibility list; plan minutes field | [392-121-182](https://app.leg.wa.gov/wac/default.aspx?cite=392-121-182), [392-121-119](https://app.leg.wa.gov/wac/default.aspx?cite=392-121-119), [Enrollment handbook 2025-26](https://ospi.k12.wa.us/sites/default/files/2025-07/2025-26enrollmenthandbookfinal.pdf) |
| **ALE-07 Assessments** (annual state assessment for full-time students; district assessments; WaKIDS for full-day K) | Results | None | Flag full-time students with no result on file for the year (needs an import) | Administration and scoring | Assessment data import | [392-550-050](https://app.leg.wa.gov/WAC/default.aspx?cite=392-550-050) |
| **ALE-08 Reporting** (board policy annual review; annual board report with staff-to-FTE ratios; monthly headcount/FTE to OSPI; annual certificated FTE; Year End Report by 31 Aug with course-type percentages; CEDARS course type) | Reports, dates, ratios | District Overview counts; Leadership report; EOY close-out | Roll up certificated staff per course and student FTE per course; produce course-type percentages (first day and Feb 1); deadline reminders for the YER and board report | Policy adoption; naming the responsible official | Course-type per course; staff FTE data; report templates | [392-550-045](https://app.leg.wa.gov/wac/default.aspx?cite=392-550-045), [392-550-060](https://www.law.cornell.edu/regulations/washington/WAC-392-550-060), [YER guidance](https://ospi.k12.wa.us/sites/default/files/2025-04/guidance-reporting-ale-yer.pdf) |
| **ALE-09 Documentation and retention** (retain all required documentation per the records retention schedule; available on request for monitoring and audit) | Board policy, reports, WSLPs, weekly-contact evidence (date/method/subject), evaluations, intervention plans, assessment results, enrollment detail | Local SQLite + IndexedDB with backups; desktop audit log; Contact Watch audit-log copy; per-module exports | Audit Ready packet per student/month with manifest and hashes (Part 7); retention holds; tamper-evident event log | Setting the retention period (SOS schedule); responding to OSPI/SAO | Cross-module packet; immutable log; retention configuration | [392-550-065](https://app.leg.wa.gov/wac/default.aspx?cite=392-550-065), [SOS K-12 retention schedule v9.1](https://www.sos.wa.gov/sites/default/files/2026-06/Public-Schools-(K-12)-Records-Retention-Schedule.PDF) |
| **ALE-10 Online courses / providers** (funding only for OSPI-approved online providers; online-only plans may be approved/evaluated by school-based support staff, weekly contact still by a certificated teacher) | Provider approval per course; staff role per plan | None | Validate course provider against the OSPI approved list (import); flag plans where the evaluator role does not meet the rule | Provider selection; program approval | Provider list; role field on plans | [RCW 28A.250.060](https://app.leg.wa.gov/RCW/default.aspx?Cite=28A.250.060), [OSPI provider approval](https://ospi.k12.wa.us/student-success/learning-alternatives/online-learning/programprovider-approval-application) |
| **ALE-11 Certificated teacher responsibilities** (plan approval, course accountability, weekly contact, monthly evaluation with DPC, intervention plan) | Teacher of record per course and plan | Advisor/teacher tokens from Edgenuity External ID; ALE advisor name | Flag courses without a teacher of record; flag contacts/evaluations recorded by someone other than the responsible certificated teacher (role data needed) | Everything in the list | Certification/role data per staff member | [392-550-025](https://app.leg.wa.gov/wac/default.aspx?cite=392-550-025), [OSPI endorsement guidance](https://ospi.k12.wa.us/sites/default/files/2025-05/guidance-ale-certification-endorsements.pdf) |

### 2.2 What this means for the design
- The two clocks Command Center already runs well (weekly contact, 5-school-day plan) are the right foundation;
  the ones it does not run (cumulative missed weeks, parent notification, count-day eligibility, month 2/3
  escalation) are all computable from data it already holds plus a count-day calendar and a justification list.
- Evidence fields are the gap, not detection: subject of communication, two-way proof, communication-to-family,
  parent participation, and the stored plan/form documents.
- Every rule threshold that the WAC leaves to districts (what counts as contact, the week definition, the
  evaluation window, day-0 vs day-1 counting, break handling for consecutive months) must be a *policy setting*
  shown next to the rule, because the open questions in 2.4 are real and differ by district.

### 2.3 Requirements catalogue and recent changes (research notes)

Research date: 2026-09-25. Sourcing note: the egress proxy blocked direct fetches of app.leg.wa.gov, lawfilesext.leg.wa.gov, ospi.k12.wa.us, law.cornell.edu, justia and district sites. Everything below comes from search-index excerpts of those pages. Text marked as a quote is reproduced as the excerpt gave it; verify against the live cited URL before relying on exact wording. Nothing here is legal advice, and no software can make a district compliant — the rules put the obligation on the district and its certificated staff.

Note on section numbering: the task brief guessed section contents. Verified titles are: -020 Definitions, -025 Written student learning plan, -030 Program requirements, -035 Full-day kindergarten, -040 Truancy, -045 Required board policies, -050 Assessment requirements, -055 Enrollment reporting procedures, -060 Reporting requirements, -065 Documentation and record retention (full chapter: https://app.leg.wa.gov/WAC/default.aspx?cite=392-550&full=true ; LII index: https://www.law.cornell.edu/regulations/washington/title-392/chapter-392-550). I found no live -070 or -080 sections; the weekly-contact and monthly-evaluation duties sit in -025/-030, and online-provider rules sit in RCW 28A.250 and chapter 392-502 WAC. Course type is reported to CEDARS as Element E09 (Student Schedule) / H27 (Grade History): https://ospi.k12.wa.us/sites/default/files/2024-04/cedars_manual_ada.pdf

---

#### 2.3.1 What changed recently (2024–2026)

| Date | Change | Source |
|---|---|---|
| 15 Jul 2022 (eff. 15 Aug 2022) | Last permanent amendment to ch. 392-550 (WSR 22-15-060): WaKIDS / full-day-K observations may be done "in person or through synchronous digital instructional contact" (-035, -050). The chapter's "last update" shown by the Legislature is 7/15/22. | https://lawfilesext.leg.wa.gov/law/wsrpdf/2022/15/22-15-060.pdf |
| Jul 2024 | OSPI reissued the *Guide to Offering ALE* (guidance, not rule). | https://ospi.k12.wa.us/sites/default/files/2024-09/publication-guide-offering-ale.pdf |
| Apr 2025 | OSPI ALE Year End Report guidance; report due 31 Aug 2026 for SY 2025-26. | https://ospi.k12.wa.us/sites/default/files/2025-04/guidance-reporting-ale-yer.pdf |
| 16 Jun 2025 | OSPI filed CR-101 (WSR 25-13-079) to revisit ch. 392-550: quote from the filing excerpt: "OSPI is considering rule making to update requirements for claiming enrollment and associated documentation to ensure requirements maintain accountability while also supporting various implementation models, instructional pedagogies, and individual student needs, as directed in RCW 28A.232.010 (8)(b)." | https://lawfilesext.leg.wa.gov/law/wsr/2025/13/25-13-079.htm |
| 1 Oct 2025 | OSPI withdrew that CR-101 (WSR 25-20-113). No rule text changed. | https://lawfilesext.leg.wa.gov/law/wsr/2025/20/25-20-113.htm ; https://ospi.k12.wa.us/policy-funding/ospi-rulemaking-activity |
| 2025-26 SY | OSPI Program Review & Support: all LEAs must complete the Tier I Self-Assessment annually; ~60 LEAs get Tier II review. | https://ospi.k12.wa.us/policy-funding/grants-management/program-review-support-formerly-cpr |
| Jan 2026 | OSPI published an ALE Self-Assessment (voluntary program review tool; covers e.g. no student/parent allotments, CEDARS course-type reporting, WSLP, weekly contact, monthly progress). | https://ospi.k12.wa.us/sites/default/files/2026-01/ale_self_assessment.pdf |
| 27 Jan 2026 | SB 6320 introduced: would exclude remote/online ALE FTE from local effort assistance, add a per-student petition to restore it, and bar OSPI from approving private/for-profit online providers (rescission by 1 Aug 2026). Last recorded action found: committee hearing 28 Jan 2026. I could not confirm passage; treat as not enacted unless verified. | https://lawfilesext.leg.wa.gov/biennium/2025-26/Htm/Bill%20Reports/Senate/6320%20SBR%20EDU%20TA%2026.htm ; https://app.leg.wa.gov/BillSummary/?BillNumber=6320&Year=2026 |
| Jun 2026 | SOS Public Schools (K-12) Records Retention Schedule v9.1 issued (retention periods for ALE records live here; I could not read the DAN rows). | https://www.sos.wa.gov/sites/default/files/2026-06/Public-Schools-(K-12)-Records-Retention-Schedule.PDF |

Bottom line: the operative ALE rules today are the 2020/2022 text of ch. 392-550 WAC and WAC 392-121-182. A 2025 attempt to rewrite the enrollment/documentation rules was abandoned.

---

#### 2.3.2 Requirements catalogue (ALE-01 … ALE-12)

#### ALE-01 Written Student Learning Plan (WSLP)
- Rule: every ALE student must have a WSLP "developed and approved by a certificated teacher that is designed to meet the student's individual educational needs" (quote, -025). For online-only plans it "may be developed and approved by a certificated teacher or a school-based support staff" (quote, -025). A certificated teacher "must have responsibility and accountability for each course specified in the plan, including supervision and monitoring, and evaluation and documentation of the student's progress" (quote, -025).
- Required elements (from -025 excerpts): (a) beginning and ending date of the ALE courses; (b) a certificated teacher's "estimate ... of the average number of hours per school week the student will engage in learning activities"; (c) for online/remote courses, "a description of how weekly contact requirements will be fulfilled"; (d) description of each course including "specific learning goals, performance objectives, and learning activities ... written in a manner that facilitates monthly evaluation of student progress"; (e) "description of the timelines and methods for evaluating student progress"; (f) identification of "all instructional materials"; (g) whether each course meets state EALRs/grade-level expectations and district requirements. RCW 28A.232.010 additionally makes the plan the place where site-based courses state required in-person instructional contact time ("Site-based course" = plan "includes a requirement for in-person instructional contact time"; "Remote course" = plan "does not include" such a requirement).
- Evidence: the signed/approved plan with all elements, its start/end dates, teacher of record, hours/week, course type (online/remote/site-based). SAO has questioned funding where a plan was "missing one of the required elements" (https://portal.sao.wa.gov/ReportSearch/Home/ViewReportFile?arn=1019487&isFinding=false).
- Timing: must exist "with a start date before the monthly count day" the first time enrollment is claimed (392-121-182). A student who completes the plan before its end date and has no new plan "with a new beginning and ending date that encompasses the count date" is excluded from the count (392-121-182). The current WAC excerpts give no explicit periodic "update" trigger other than: new/changed courses, plan completion, and the three-month unsatisfactory-progress revision (ALE-05).
- Citations: https://app.leg.wa.gov/wac/default.aspx?cite=392-550-025 ; https://app.leg.wa.gov/wac/default.aspx?cite=392-121-182 ; https://app.leg.wa.gov/rcw/default.aspx?cite=28A.232.010

#### ALE-02 Weekly contact
- Rule: each ALE student must have one of three contact types with a certificated teacher "at least once a school week until the student completes all course objectives or otherwise meets the requirements of the learning plan" (quote, chapter excerpt): direct personal contact, in-person instructional contact, or synchronous digital instructional contact.
- Definitions (-020, quotes): "Direct personal contact" means "a one-to-one meeting between a certificated teacher and the student, or, where appropriate, between the certificated teacher, the student, and the student's parent"; it "must at minimum include a two-way exchange of information between a certificated teacher and the student" and "can be accomplished in person or through the use of telephone, email, instant messaging, interactive video communication, or other means of digital communication." Purpose: "instruction, review of assignments, testing, evaluation of student progress, or other learning activities or requirements identified in the written student learning plan." "In-person instructional contact" = "face-to-face contact ... in a classroom environment," may be group. "Synchronous digital instructional contact" = "real-time communication ... using interactive online, voice, or video communication technology." "School week" = "any seven-day calendar period starting with Sunday and continuing through Saturday that includes at least three days when a district's schools are in session."
- Who: a certificated teacher (OSPI guide: contact "must be with the student, not a parent or guardian").
- Evidence (-065): for students not in regularly scheduled classes, "the date of the contact, the method of communication by which the contact was accomplished, and documentation to support the subject of the communication"; students in regularly scheduled classes may use "classroom attendance records."
- Missed-contact consequences (-040, -045): board policy must list "valid justifications why a student may miss the weekly contact"; district must "inform parents by direct personal contact whenever a child has failed to make weekly contact without valid justification"; "after the second consecutive week ... or third cumulative week of missed contact without valid justification" hold a conference, administer a screener, and "develop a data-based intervention plan"; truancy petition "no later than the fifth consecutive or sixth cumulative missed weekly contact without valid justification."
- Citations: https://app.leg.wa.gov/WAC/default.aspx?cite=392-550&full=true ; https://app.leg.wa.gov/wac/default.aspx?cite=392-550-020 ; https://app.leg.wa.gov/wac/default.aspx?cite=392-550-065 ; https://app.leg.wa.gov/wac/default.aspx?cite=392-550-040 ; https://app.leg.wa.gov/wac/default.aspx?cite=392-550-045 ; https://ospi.k12.wa.us/sites/default/files/2024-09/publication-guide-offering-ale.pdf

#### ALE-03 Monthly progress evaluation
- Rule: progress "must be evaluated at least once each calendar month of enrollment by a certificated teacher" (online-only plans: "or school-based support staff"), "based on the learning goals and performance objectives defined in the written student learning plan," and "must include direct personal contact with the student." The teacher "must determine and document whether the student is making satisfactory progress." Results "must be communicated to the student or, if the student is in grades K-8, both the student and the student's parent."
- Evidence: dated evaluation record per calendar month, evaluator, satisfactory/unsatisfactory determination against plan objectives, the DPC that accompanied it, and the communication to student (and parent for K-8).
- Timing: every calendar month of enrollment; 392-121-182 ties the prior month's evaluation to claiming the next count day ("A monthly progress evaluation requirement must be met in the prior month for state funding claims" — search excerpt of 392-121-182/-025). SAO reports describe districts completing the evaluation "by the fifth school day of the following month" — that is practice, not WAC text.
- Citations: https://app.leg.wa.gov/rcw/default.aspx?cite=28A.232.010 ; https://apps.leg.wa.gov/WAC/default.aspx?cite=392-550-030 ; https://app.leg.wa.gov/wac/default.aspx?cite=392-121-182 ; https://portal.sao.wa.gov/ReportSearch/Home/ViewReportFile?arn=1019487&isFinding=false

#### ALE-04 Intervention plan (5 school days)
- Rule: "If it is determined that the student failed to make satisfactory progress or that the student failed to follow the written student learning plan, an intervention plan must be developed for the student within five school days of the date of the monthly progress evaluation." It "must be developed, documented, and implemented by a certificated teacher in conjunction with the student and, for students in grades K-8, the student's parent(s)." Definition: "a plan designed to improve the progress of students determined to be not making satisfactory progress."
- Evidence: the plan document, its date (≤5 school days after the evaluation date), the teacher, student participation, parent participation for K-8, and implementation notes. (-065 lists "student progress evaluations and intervention plans" as retained records.)
- Citations: https://apps.leg.wa.gov/WAC/default.aspx?cite=392-550-030 ; https://app.leg.wa.gov/wac/default.aspx?cite=392-550-020 ; https://app.leg.wa.gov/wac/default.aspx?cite=392-550-065

#### ALE-05 Consecutive months of unsatisfactory progress
- Rule: "If after no more than three consecutive calendar months in which it is determined the student is not making satisfactory progress despite documented intervention efforts, a course of study designed to more appropriately meet the student's educational needs must be developed and implemented by a certificated teacher in conjunction with the student and where possible, the student's parent. This may include removal of the student from the alternative learning experience and enrollment of the student in another educational program offered by the school district."
- Course-based vs other: the current chapter text I could find applies one rule to all ALE course types (online/remote/site-based). I found no separate two-month track for "course-based" ALE in the current WAC; the only 2-count rule is the missed-*contact* rule in ALE-02 (second consecutive / third cumulative missed week → conference + intervention plan). Do not design around a two-month progress rule without verifying against the live text.
- Evidence: sequence of monthly evaluations showing unsatisfactory status, the intervention plan(s) in between, and the revised course of study / new WSLP or program change with date and participants.
- Citations: https://app.leg.wa.gov/wac/default.aspx?cite=392-550-025 ; https://apps.leg.wa.gov/WAC/default.aspx?cite=392-550-030

#### ALE-06 Enrollment counting and FTE
- Rule: ALE enrollment "is claimed based on the monthly count dates as defined in WAC 392-121-119" ("the fourth school day of September and the first school day of each of the nine subsequent months"). First claim requires "a completed written student learning plan ... in place with a start date before the monthly count day, and ... documented evidence of student participation." Exclusions: students "who have not had contact with a certificated teacher for 20 consecutive school days" — excluded "until the student has met with a certificated teacher and resumed participation ... or is participating in another course of study"; and students who finished the plan early without a new plan spanning the count date. Programs ending before June 1 may use the last school day in May as the June count date.
- FTE: "Enrollment of part-time alternative learning experience students generates a pro rata share of full-time funding based on the estimated average weekly minutes of learning activity described in the written student learning plan divided by 1,665 weekly minutes" (392-121-182); 1.0 FTE = 27 h 45 min / week (392-121-122).
- Evidence: WSLP dates and estimated weekly minutes; contact log proving no 20-consecutive-school-day gap as of each count day; prior-month progress evaluation; monthly headcount/FTE reported to OSPI (P-223) per the Enrollment Reporting Handbook.
- Citations: https://app.leg.wa.gov/wac/default.aspx?cite=392-121-182 ; https://app.leg.wa.gov/wac/default.aspx?cite=392-121-119 ; https://apps.leg.wa.gov/wac/default.aspx?cite=392-121-122 ; https://ospi.k12.wa.us/sites/default/files/2025-07/2025-26enrollmenthandbookfinal.pdf

#### ALE-07 Assessments / state testing
- Rule (-050): all ALE students "must be assessed at least annually, using, for full-time students, the state assessment for the student's grade level and using any other annual assessments required by the school district." Full-day K in ALE: WaKIDS with "multiple weekly observations ... during the eight-week assessment window," in person or via synchronous digital instructional contact (-035/-050, 2022 amendment). District must ensure students have "all curricula, course content, instructional materials and learning activities" in the plan.
- Evidence: assessment results (-065 lists "assessment results" as retained).
- Citations: https://app.leg.wa.gov/WAC/default.aspx?cite=392-550-050 ; https://app.leg.wa.gov/WAC/default.aspx?cite=392-550-035

#### ALE-08 Reporting to board and OSPI
- Rule: Board must "adopt and annually review written policies" naming each ALE program/provider, valid justifications for missed contact, and an official (by title) who "will monitor compliance and report at least annually to the school district board" (-045). Annual board report must include "the overall ratio of certificated instructional staff to full-time equivalent students enrolled in each ALE course" and the number of certificated staff per course (-060). To OSPI: "report monthly ... accurate monthly headcount and full-time equivalent enrollment," and annually the "certificated instructional staff full-time equivalent assigned to each alternative learning experience program," full-day-K counts and WaKIDS participation (-060). ALE Year End Report (due 31 Aug 2026 for SY 2025-26) collects percent of courses online/remote/site-based on the first day of class and on Feb 1 (whole numbers summing to 100 or 0) and total certificated teacher FTE. RCW 28A.232.010: districts that purchase/contract instructional or cocurricular experiences must file an annual cost/purpose report with OSPI. CEDARS: ALE course type per course (E09/H27).
- Citations: https://app.leg.wa.gov/wac/default.aspx?cite=392-550-045 ; https://www.law.cornell.edu/regulations/washington/WAC-392-550-060 ; https://ospi.k12.wa.us/sites/default/files/2025-04/guidance-reporting-ale-yer.pdf ; https://app.leg.wa.gov/rcw/default.aspx?cite=28A.232.010 ; https://ospi.k12.wa.us/sites/default/files/2024-04/cedars_manual_ada.pdf

#### ALE-09 Documentation and record retention
- Rule (-065): districts "must retain all documentation required in this chapter in accordance with established records retention schedules and make such documentation available upon request for purposes of state monitoring and audit." Must maintain: board policy; annual reports to the board; monthly and annual reports to OSPI; WSLPs; "evidence of weekly contact" (date, method, subject, or attendance records); "student progress evaluations and intervention plans"; "assessment results"; and "student enrollment detail substantiating full-time equivalent enrollment reported to the state."
- Retention period: set by the SOS Public Schools (K-12) Records Retention Schedule (v9.1, June 2026), which cross-references the ALE WAC; I could not read the specific DAN/period through the proxy. Records are subject to SAO audit (SAO has issued ALE findings of over-reported AAFTE for non-compliant WSLPs and missing monthly reviews).
- Citations: https://app.leg.wa.gov/wac/default.aspx?cite=392-550-065 ; https://www.sos.wa.gov/sites/default/files/2026-06/Public-Schools-(K-12)-Records-Retention-Schedule.PDF ; https://portal.sao.wa.gov/ReportSearch/Home/ViewReportFile?isFinding=false&arn=1021126

#### ALE-10 Online courses and providers
- Rule: districts "may claim state funding for students enrolled in remote, site-based, or online alternative learning experience courses, including the provisions of RCW 28A.250.060" (RCW 28A.232.010). RCW 28A.250.060: since 2013-14, funding for online courses "only if the online courses or programs are offered by an online provider approved under RCW 28A.250.020 by the superintendent of public instruction" (single-district, affiliate, multidistrict approvals; ch. 392-502 WAC). OSPI: an online school program approval is required when more than half of a student's schedule is delivered electronically and more than half of teaching is remote. Online-only WSLPs may be approved and evaluated monthly by "school-based support staff" (-020: an employee "who is supporting a student in an online course" who "may or may not hold a teaching certificate"). The weekly-contact certificated-teacher requirement still applies.
- Evidence: provider approval status per course; course-type designation; staff role on each plan.
- Citations: https://app.leg.wa.gov/RCW/default.aspx?Cite=28A.250.060 ; https://ospi.k12.wa.us/student-success/learning-alternatives/online-learning/programprovider-approval-application ; https://app.leg.wa.gov/wac/default.aspx?cite=392-550-020

#### ALE-11 Certificated teacher responsibilities
- Develop/approve the WSLP; hold "responsibility and accountability for each course ... including supervision and monitoring, and evaluation and documentation of the student's progress"; make weekly contact; conduct the monthly evaluation with DPC; write the intervention plan and any revised course of study. Endorsement guidance: https://ospi.k12.wa.us/sites/default/files/2025-05/guidance-ale-certification-endorsements.pdf . Citation: https://app.leg.wa.gov/wac/default.aspx?cite=392-550-025

#### ALE-12 Instructional contact reporting
- The WSLP must state required in-person instructional contact time for site-based courses (defines course type); the guide lists instructional interaction as "direct instruction, review of assignments, assessment, testing, progress monitoring, and educational facilitation" with "no minimum in-person instructional contact time" for remote. Course type is reported to CEDARS (E09/H27) and as percentages on the Year End Report. Citations: https://app.leg.wa.gov/rcw/default.aspx?cite=28A.232.010 ; https://ospi.k12.wa.us/sites/default/files/2025-04/guidance-reporting-ale-yer.pdf

---

#### 2.3.3 Research draft of the matrix (superseded by 2.1, kept for the per-rule detail)

| Requirement | Evidence required | Software can track/flag automatically | Requires educator judgment | Citation |
|---|---|---|---|---|
| WSLP complete before first count day (ALE-01/06) | Approved plan; start/end dates; hours/week; course list w/ goals, objectives, activities; materials; EALR mapping; course type; teacher of record | Required-field completeness check; block "claimable" status until approver signature and start date < next count day (from WAC 392-121-119 calendar); flag plan end date passed with no successor plan; flag completed-early with no new plan | Whether goals/objectives are specific enough to "facilitate monthly evaluation"; hours estimate; EALR alignment; approving the plan | 392-550-025; 392-121-182 |
| Weekly contact (ALE-02) | Date, method, subject, teacher, student; or attendance record | Compute school weeks as Sun–Sat periods with ≥3 in-session days from district calendar; detect a week with zero qualifying entries; require method ∈ {DPC, in-person, synchronous} and a subject note; flag entries logged by non-certificated staff or with parent only; count consecutive/cumulative missed weeks (2/3 → conference+screener+intervention; 5/6 → petition deadline) and note valid justification codes from board policy | Whether an exchange was genuinely two-way and instructional; whether a justification is valid; conducting the conference/screener | 392-550-020/-030/-040/-045/-065 |
| 20 consecutive school days w/o contact (ALE-06) | Contact log vs. school-day calendar | Count in-session days since last qualifying contact; warn at e.g. 10/15; auto-mark "exclude from count" at 20 as of each count day; clear only after a logged teacher meeting and resumed participation | Confirming the student "resumed participation"; deciding alternate course of study | 392-121-182 |
| Monthly progress evaluation (ALE-03) | Dated evaluation per calendar month; satisfactory Y/N; DPC included; communicated to student (+parent K-8) | Detect a calendar month of enrollment with no evaluation; require linked DPC entry; require "communicated to" record (parent for K-8 by grade); flag missing prior-month evaluation before count day | The satisfactory-progress determination itself | 392-550-030; RCW 28A.232.010 |
| Intervention plan within 5 school days (ALE-04) | Plan, date, teacher, student/parent participation | On "unsatisfactory," start a 5-school-day timer using the district calendar; flag missing/late plan; require K-8 parent field | Plan content and implementation | 392-550-030 |
| 3 consecutive unsatisfactory months (ALE-05) | Evaluation sequence, interventions, revised course of study | Count consecutive unsatisfactory months per student; escalate at 3 with "revised course of study/removal required"; require a new plan or program change record | Designing the new course of study; removal decision | 392-550-025/-030 |
| FTE claim (ALE-06) | Weekly minutes in plan; count-day eligibility | Compute FTE = plan minutes ÷ 1,665; produce per-count-day eligibility list (plan in place, contact within 20 days, prior-month evaluation) for P-223 | Reasonableness of hour estimate; final certification of the count | 392-121-182/-122 |
| Assessment (ALE-07) | Annual state/district assessment results | Flag full-time students with no assessment result for the year; K WaKIDS observation cadence during 8-week window | Administering/scoring | 392-550-050/-035 |
| Board/OSPI reporting (ALE-08) | Staff-to-FTE ratios, headcount/FTE monthly, course-type %, teacher FTE, YER by 31 Aug | Roll up ratios per course/program; generate course-type percentages for first day and Feb 1; CEDARS E09 consistency check; due-date reminders | Board policy adoption/annual review; naming the responsible official | 392-550-045/-060; YER guidance |
| Retention/audit (ALE-09) | All items in -065 retrievable on request | Immutable audit log; export per student/per month; retention hold per SOS schedule | Setting the retention period; responding to SAO/OSPI | 392-550-065; SOS schedule |
| Online provider (ALE-10) | Approved-provider status per course | Validate course provider against OSPI approved list; flag online-only plans approved by support staff still needing certificated weekly contact | Choosing providers; program-approval application | RCW 28A.250.060 |

---

### 2.4 Open questions and ambiguities the district must settle as policy

1. **Does a teacher-initiated email with no reply count?** The -020 definition says DPC "must at minimum include a two-way exchange of information between a certificated teacher and the student" but lists "email, instant messaging" as acceptable media. A one-way message therefore appears insufficient, but the rule does not say how quickly the reply must arrive, whether the reply must fall in the same school week, or whether a student's submitted assignment plus teacher feedback is an "exchange." Software should record both directions with timestamps and let the district set the pairing window. (https://app.leg.wa.gov/wac/default.aspx?cite=392-550-020)
2. **Week boundary.** "School week" is defined as Sunday–Saturday with "at least three days when a district's schools are in session." Weeks with 1–2 in-session days (e.g., Thanksgiving, winter break edges) are not school weeks, so no contact is required; which calendar governs (district vs. program) is not stated. (same URL)
3. **Group contact vs. one-to-one.** In-person instructional contact "may be accomplished in a group setting," while DPC is "one-to-one." Whether a synchronous group class session satisfies "synchronous digital instructional contact" for every attendee is not spelled out. (same URL)
4. **Parent-mediated contact.** DPC may be "where appropriate, between the certificated teacher, the student, and the student's parent," yet the OSPI guide says contact "must be with the student, not a parent." Where the student is very young, the line is left to the district. (guide URL above)
5. **Monthly evaluation deadline.** "At least once each calendar month of enrollment" — no due day. SAO/district practice of "by the fifth school day of the following month" is not in the WAC; a district must choose the window and whether a late evaluation counts for the prior month for count-day purposes. (https://apps.leg.wa.gov/WAC/default.aspx?cite=392-550-030)
6. **"Five school days" and "school day."** Intervention plans are due "within five school days of the date of the monthly progress evaluation"; whether the evaluation date counts as day 0 or 1, and whether "school day" follows the district calendar or the ALE program calendar, is unstated. (same URL)
7. **"No more than three consecutive calendar months."** Unclear whether the counter resets after one satisfactory month, whether summer/breaks pause it, and whether "despite documented intervention efforts" is a precondition or merely descriptive. (https://app.leg.wa.gov/wac/default.aspx?cite=392-550-025)
8. **20 consecutive school days.** The exclusion applies to "contact with a certificated teacher" — it is not explicit whether all three contact types count, and "resumed participation" is undefined. (https://app.leg.wa.gov/wac/default.aspx?cite=392-121-182)
9. **Valid justifications.** The list is delegated to board policy (-045), so the same absence can be justified in one district and a missed contact in another. (https://app.leg.wa.gov/wac/default.aspx?cite=392-550-045)
10. **WSLP update triggers.** The excerpts give no explicit rule for amending a plan mid-year (course change, hours change); districts infer that any change to a required element needs an updated, re-approved plan. (https://app.leg.wa.gov/wac/default.aspx?cite=392-550-025)
11. **Support staff for online-only plans.** -025/-030 let "school-based support staff" (may be uncertificated) approve plans and evaluate monthly for online-only students, while RCW 28A.232.010 says the evaluation is by "a certificated teacher" and weekly contact must be with a certificated teacher; how districts reconcile these for online-only students is a policy choice. (https://app.leg.wa.gov/rcw/default.aspx?cite=28A.232.010)
12. **Retention period.** -065 defers to "established records retention schedules"; the exact years are in the SOS schedule (v9.1, June 2026), which I could not open. Confirm before hard-coding a purge rule.
13. **Pending policy risk.** The withdrawn 2025 CR-101 signals OSPI interest in changing "requirements for claiming enrollment and associated documentation"; SB 6320 (2026) targeted funding and for-profit providers. Any design should keep contact/evaluation rules configurable.


---

## Part 3 — Imagine Edgenuity: official integration capabilities

Method note: the egress proxy blocked every Imagine Learning, Clever, 1EdTech and Laserfiche domain, so all findings come from search-engine snippets of the official pages linked below. Wording in quotes is as it appeared in those snippets. Where a page could not be confirmed, the item is marked **not documented publicly**.

### 1. Rostering / SIS integration

**Three official rostering tiers.** Imagine Edgenuity "offers three ways to roster: Self-Managed, One-Time Assisted, and Automated" ([Imagine Edgenuity rostering options](https://help.imagineedgenuity.com/hc/en-us/articles/12464914701591-Imagine-Edgenuity-rostering-options)).
- *Self-Managed*: staff create accounts/enrollments in the educator portal.
- *One-Time Assisted* (purchased option): district populates an Educator Import Template and a Student template and uploads them "using the secure form"; Imagine returns login files "securely through Box" ([Uploading your roster files](https://help.imagineedgenuity.com/hc/en-us/articles/4403546784279-Uploading-your-roster-files-to-Imagine-Edgenuity)).
- *Automated*: "your district exports roster data from their SIS using the OneRoster standard and then sends it to Imagine Learning via SFTP ... or the OneRoster 1.1 API" (same rostering-options article; SFTP setup: [Setting up an SFTP connection](https://help.imaginelearning.com/hc/en-us/articles/360059644313-Setting-up-an-SFTP-connection)).

**OneRoster.** Version documented is **OneRoster 1.1** (CSV over SFTP, or the 1.1 REST API pulled by Imagine). "Edgenuity/EdgeEX support the OneRoster standard for account creation" and "for enrollments"; "Once a district staff member has mapped SIS course codes to Edgenuity/EdgeEX courses, students can automatically be enrolled in courses/sections via nightly sync with your SIS" ([Integrations](https://help.imagineedgenuity.com/hc/en-us/articles/29562613754007-Integrations)). Imagine Learning's generic OneRoster article lists the file set: "manifest, academicsessions, classes, courses, demographics (optional), enrollments, orgs (optional), and users" ([Setting up a OneRoster integration](https://help.imaginelearning.com/hc/en-us/articles/360059645613-Setting-up-a-OneRoster-integration)); that article is written for Literacy/Math/Assessment, so the Edgenuity-specific entity list beyond users + enrollments is **not documented publicly**. EdgeEX course-code mapping is done with the [External Course Code Import Wizard](https://help.imagineedgenuity.com/hc/en-us/articles/28621901012375-EdgeEX-Using-the-SIS-Import-Wizard-to-manage-SIS-Enrollment-Codes). OneRoster 1.2 support: not documented publicly.

**1EdTech certification.** The 1EdTech directory entry for Imagine Learning shows the company as a Contributing Member (since 2021) but the snippet states the listed product "doesn't have any active certifications" ([Imagine Learning | 1EdTech](https://site.imsglobal.org/certifications/imagine-learning)); the legacy Edgenuity entry says "Edgenuity is not a member" ([Edgenuity | 1EdTech](https://site.imsglobal.org/certifications/edgenuity)). Treat Imagine Edgenuity as **not 1EdTech-certified** for OneRoster or LTI (consumer or provider) unless Imagine provides a certificate.

**Clever.** The Clever App Gallery listing: "Imagine Edgenuity offers SSO through Clever Instant Login and rosters and provisions accounts through Clever Secure Sync" ([Clever App Gallery — Imagine Edgenuity](https://www.clever.com/app-gallery/imagine-edgenuity/)). Imagine's Clever article: "Clever synchronizes roster data with your district SIS and sends it to Imagine Learning via an API connection ... Your district SIS is the authoritative source" ([Setting up and using Clever](https://help.imaginelearning.com/hc/en-us/articles/360057793954-Setting-up-and-using-Clever-for-automated-rostering)).

**ClassLink.** "ClassLink ... synchronizes roster data with your district SIS and uploads it to Imagine Learning using an SFTP connection or the OneRoster 1.1 API format" (Roster Server) and "provides Imagine Learning with student or staff identity information for Single Sign-On" ([Setting up and using ClassLink](https://help.imaginelearning.com/hc/en-us/articles/360059645073-Setting-up-and-using-ClassLink-for-automated-rostering)). A vendor status incident refers to "Districts using Classlink SAML SSO" with Imagine Edgenuity ([isdown incident](https://isdown.app/status/odysseyware/incidents/214355-imagine-edgenuity-districts-using-sso-may-experience-difficulty-logging-into-edgenuity)). ClassLink OneSync is not named on any Imagine page: **not documented publicly**.

**Direct SIS connectors (PowerSchool, Skyward, Infinite Campus).** No Imagine page names a native connector; the documented path is OneRoster export from the SIS (or via Clever/ClassLink). **Not documented publicly** as vendor-specific plug-ins.

**What the district must do.** "Integration is a paid add-on feature. If your district needs to set up Enrollment Integration, please contact your Imagine Learning Account Executive" ([Integrations](https://help.imagineedgenuity.com/hc/en-us/articles/29562613754007-Integrations)). All SSO "must be used in combination with a nightly import to create user accounts" ([Technical Requirements](https://www.imaginelearning.com/support/technical-requirements/)). Districts on Clever/ClassLink rostering also get a "Manage Student SSO Username" permission ([Managing a student's SSO username](https://help.imagineedgenuity.com/hc/en-us/articles/19843211570199-Managing-a-student-s-SSO-username)).

### 2. Outbound data (grades, progress, activity)

#### 2a. Edgenuity API (the only documented programmatic outbound channel)
"Edgenuity (Edgenuity and EdgeEX) supports an API that district IT staff can use to create custom integrations" ([Integrations](https://help.imagineedgenuity.com/hc/en-us/articles/29562613754007-Integrations)). Imagine's Technical Requirements page: "The Imagine Edgenuity API provides methods to create users, login, and assign course enrollments, as well as to return student progress and grade information to a third-party system. It is usually deployed in partnership with a SIS ... Use of the API requires a district or third-party vendor to engage in their own engineering development" ([Technical Requirements](https://www.imaginelearning.com/support/technical-requirements/)). Public reference docs exist: "Edgenuity API Documentation – Table of Content" at [apidocs-manual.imaginelearning.com](https://apidocs-manual.imaginelearning.com/), with a v4.8.25 class reference including [StudentCourseProgressData](https://apidocs-manual.imaginelearning.com/APIDocs/4.8.25/html/62018546-9a46-8d8a-94c5-28efac692429.htm) and [StudentInfo](https://apidocs-manual.imaginelearning.com/APIDocs/4.8.25/html/2de2366c-fbe8-d695-05f4-b27a95ac04c5.htm). Endpoint list, transport (SOAP/REST), authentication and per-field schema were **not readable** (blocked) — do not assume any endpoint names. API access is sold/enabled via the Account Executive ("paid add-on"); no self-service educator API token is documented.

#### 2b. LTI / grade passback
- Imagine Edgenuity → LMS: Thin Common Cartridge lets teachers "assign activities to build courses in Schoology, Canvas, and others, with scores returned to the third-party LMS for assessments and some assignment types" ([Imagine Edgenuity LTI TCC Integration](https://help.imagineedgenuity.com/hc/en-us/articles/23795773645975-Imagine-Edgenuity-LTI-Thin-Common-Cartridge-Integration)).
- EdgeEX → LMS: "With an upgrade to LTI 1.3, EdgeEX courses can be downloaded as Thin Common Cartridges ... Grades for any EdgeEX activities a student completes will show in the Canvas or Schoology LMS gradebook automatically"; EdgeEX TCCs "cannot be used at the same time as the TCCs for Imagine Edgenuity" ([EdgeEX LTI TCC integration](https://help.imagineedgenuity.com/hc/en-us/articles/41661425960215-EdgeEX-LTI-Thin-Common-Cartridge-integration)).
- Grade passback is only documented toward Canvas/Schoology (LTI platforms). LTI Advantage AGS to an arbitrary district app, OneRoster Gradebook/Results, SIS grade sync, webhooks/events: **not documented publicly**.

#### 2c. Reports and exports (human-initiated, CSV/XLSX/print)
| Report | Where | Fields documented | Source |
|---|---|---|---|
| **Manage Enrollments → Export to Excel** ("Course Enrollments" export) | Students › Manage Enrollments | "view, filter, and export on-demand enrollment data"; "Filters that have been applied ... will be applied on the exported report"; enrollment start/target dates managed here | [Managing Enrollments Overview](https://help.imagineedgenuity.com/hc/en-us/articles/360050004974-Managing-Enrollments-Overview) |
| **Student Pacing Report** (dropdown on the same export) | same | Student Name, Course Name, School, STBID, External ID, Target Progress, Progress Pacing, Overall Grade, Relative Grade, Actual Grade; downloads as .csv; needs "Download Enrollment Data" permission | [Exporting Student Pacing Report](https://help.imagineedgenuity.com/hc/en-us/articles/4419848459415-Exporting-Student-Pacing-Report) |
| **Assignments to be Graded Report** | same dropdown | ungraded assignments per student; .csv | [Exporting Assignments to be Graded](https://help.imagineedgenuity.com/hc/en-us/articles/4642132909847-Exporting-Assignments-to-be-Graded-Report) |
| **Report Builder – Enrollments** (admin) | Administrator Reports | enrollment-level, "highly customizable" columns/filters/bookmarks; "export a version of the Manage Enrollments page" | [Report Builder – Enrollments](https://help.imagineedgenuity.com/hc/en-us/articles/15251889850519-Understanding-the-Report-Builder-Enrollments) |
| **Report Builder – Students** (admin) | Administrator Reports | student-level: active courses, completed courses, time spent working; exportable | [Report Builder – Students](https://help.imagineedgenuity.com/hc/en-us/articles/15273993079063-Understanding-the-Report-Builder-Students) |
| **On Track/Off Track** | Administrator Reports | on-track to earn credit; "All table results can be exported" | [On Track/Off Track](https://help.imagineedgenuity.com/hc/en-us/articles/14945224861719-Understanding-the-On-Track-Off-Track-Report) |
| **Daily / Weekly Activity** | Administrator Reports | total active time, completed activities/quizzes/tests/exams; exportable | [Weekly Activity](https://help.imagineedgenuity.com/hc/en-us/articles/24966137321623-Understanding-the-Weekly-Activity-Report), [Daily Activity](https://help.imagineedgenuity.com/hc/en-us/articles/39631486821143-Understanding-the-Daily-Activity-Report) |
| **Session Log** | per student | login sessions; Active vs Idle time; EdgeEX splits Active into Activity Time and Review Time | [Session Log Overview](https://help.imagineedgenuity.com/hc/en-us/articles/1500004692601-Session-Log-Overview), [EdgeEX Attendance/Session Log](https://help.imagineedgenuity.com/hc/en-us/articles/23344890007319-EdgeEX-Using-the-Attendance-Log-and-Session-Log) |
| **Student Progress Report** (print/PDF) | Selected Student › Progress Report | per course: % complete, Complete (count), Target Date, activity scores/counts, category weights, Overall/Relative/Actual grade; "must be accessed and printed one at a time" | [Table Description](https://help.imagineedgenuity.com/hc/en-us/articles/360043035613-Student-Progress-Report-Table-Description), [Progress Report Overview](https://help.imagineedgenuity.com/hc/en-us/articles/1500004680021-Progress-Report-Overview) |
| **Manage Students** | Students › Manage Students | change columns, export to Excel (exact column list not in snippets) | [Settings menu icons – Managing Students](https://help.imagineedgenuity.com/hc/en-us/articles/5323300416023-Settings-menu-icons-Managing-Students) |

Imagine's own data summary sheet lists the core measures as engagement ("Active time, first / last gradebook entry") and progress ("Progress %, target progress % and pacing % (if target date is set)") ([Data & Reports Summary PDF](https://content.imaginelearning.com/pdAssets/imagineEdgenuity/imagineEdgenuity_dataAndReportsSummary.pdf)). Grade metric definitions: [Grade metrics](https://help.imagineedgenuity.com/hc/en-us/articles/360043235213-Grade-metrics), [Reports containing Overall, Actual, and Relative Grade](https://help.imagineedgenuity.com/hc/en-us/articles/360043236653-Reports-containing-Overall-Actual-and-Relative-Grade).

#### 2d. Scheduled / automated delivery
- The only scheduled output is the **Parent Progress Report e-mail** (daily 5–7 a.m. ET, weekly Mondays, monthly on the 1st, from noreply@communications.imaginelearning.com) plus the Family Portal ([Sending scheduled Progress Report emails](https://help.imagineedgenuity.com/hc/en-us/articles/360042917714-Sending-scheduled-Progress-Report-emails-to-parents), [Family Portal overview](https://help.imagineedgenuity.com/hc/en-us/articles/38968895983127-Family-Portal-overview)).
- Scheduled educator report e-mail, SFTP report drops, a "Reports API", webhooks, or a named "Imagine Data Exports"/"Imagine Insights" product for Edgenuity: **not documented publicly**. (Imagine Math suite has an e-mailed CSV export, but it is not an Edgenuity feature: [Exporting student data from the Imagine Math suite](https://help.imaginelearning.com/hc/en-us/articles/1500010692742-Exporting-student-data-from-the-Imagine-Math-suite).)

### 3. Authentication / SSO
"All Imagine Learning products support multiple types of single sign-on (SSO), allowing districts to use existing login credentials via Active Directory/ADFS, LDAP, SAML, LTI, Google, or Clever ... All SSO integrations must be used in combination with a nightly import to create user accounts" ([Technical Requirements](https://www.imaginelearning.com/support/technical-requirements/); [Imagine Edgenuity Tech System Overview PDF](https://www.imaginelearning.com/media/pdf/tech-docs/Imagine-Edgenuity-Technical-Requirements.pdf)). ClassLink SSO is documented ([ClassLink article](https://help.imaginelearning.com/hc/en-us/articles/360059645073-Setting-up-and-using-ClassLink-for-automated-rostering)); an educator SAML endpoint exists ([auth.edgenuity.com/Login/SAML/Educator](https://auth.edgenuity.com/Login/SAML/Educator)). Microsoft/Entra login is mentioned only on third-party blogs — **not documented officially**. Educator API tokens/personal access tokens: **not documented publicly**.

### 4. Terms of use — automated access
Imagine Learning End User Terms of Service v1.0: users may not generate "automated searches, requests, or queries to (or to strip, scrape, or mine data from) our Services"; a revocable exception exists only for public search-engine spiders; users also may not "use any technology, code, or other method to automatically skip content or answer questions" ([IL End User TOS PDF](https://cdn-websites.imaginelearning.com/marketing/IL-End-User-Terms-Service.pdf); [mirror](https://www.imaginelearning.com/media/pdf/End%20User%20TOS%202022%20IL%20LLC.pdf)). Imagine also states its platforms "are equipped to detect and block some scripts" ([Academic Integrity — Scripts and Bots flyer](https://www.imaginelearning.com/wp-content/uploads/2024/05/EDG-Academic-Integrity-Scripts-and-Bots-Flyer.pdf); [Promoting academic integrity](https://help.imagineedgenuity.com/hc/en-us/articles/33307853753623-Promoting-academic-integrity-with-Imagine-Edgenuity)). Implication: unattended scripting of the educator portal is prohibited by the TOS; a human clicking "Export" inside an embedded window (the current design) is ordinary use, but any headless/scheduled scraper is not. The sanctioned automated path is the paid API or OneRoster/LTI.

### 5. Roadmap items affecting integration
- Back to School 2026 (effective July 1, 2026): "Platform enhancements extend LMS integrations, improve reporting access for teachers", "redesigned Family Portal bringing progress, attendance, and coursework into one place while consolidated reporting simplifies tracking" ([press release](https://www.imaginelearning.com/press/imagine-learning-introduces-enhancements-across-curriculum-assessment-and-services-for-back-to-school-2026/); [help article](https://help.imagineedgenuity.com/hc/en-us/articles/40743580644887-Back-to-School-2026-Enhancements-and-additions); [flyer](https://www.imaginelearning.com/wp-content/uploads/2026/04/EDG-EEX-In-Session-Courseware-Flyer.pdf)).
- EdgeEX is the successor course platform (Academic Integrity Report, ClassMate, new courses only in EdgeEX); districts may "fully adopt", pilot, or wait ([When should my district adopt EdgeEX?](https://help.imagineedgenuity.com/hc/en-us/articles/12716824209687-EdgeEX-When-should-my-district-adopt-EdgeEX); [Current functionality](https://help.imagineedgenuity.com/hc/en-us/articles/13966818541207-EdgeEX-Current-functionality-and-new-releases)). Reports are already split ("Administrator Reports and EdgeEX Reports") and Session Log semantics differ between heritage and EdgeEX courses, so any parser must handle both. No public sunset date for heritage Imagine Edgenuity or the r*.core.learn.edgenuity.com portal: **not documented publicly**. "Imagine MyPath"/"Imagine Learning platform" consolidation affecting Edgenuity: not documented publicly.

### 6. Integration options for each current manual process

| Current CSV/manual process | Potential integration | Official support? | Data available | Difficulty | District/Imagine permission needed? |
|---|---|---|---|---|---|
| (a) "Course Enrollments" CSV export (daily/weekly) for progress, pacing, grades | 1) Keep human-initiated export; 2) Edgenuity API ("return student progress and grade information to a third-party system"); 3) Report Builder – Enrollments export by admin | **Partial** — API is official but paid and undocumented in detail ([Tech Requirements](https://www.imaginelearning.com/support/technical-requirements/), [API docs](https://apidocs-manual.imaginelearning.com/)); no scheduled export/SFTP/webhook | Progress %, target progress %, pacing %, Overall/Actual/Relative grade, STBID, External ID, target/start dates, first/last gradebook entry, active time ([Pacing Report](https://help.imagineedgenuity.com/hc/en-us/articles/4419848459415-Exporting-Student-Pacing-Report), [Data summary](https://content.imaginelearning.com/pdAssets/imagineEdgenuity/imagineEdgenuity_dataAndReportsSummary.pdf)) | Medium (API contract + custom dev); Low for keeping the human-triggered CSV | Yes — API is an Account Executive-sold add-on; "Download Enrollment Data" permission for the CSV |
| (b) "Students" report for student/parent e-mails and birthdays | 1) Source identity/contacts from the district SIS instead (SIS is authoritative and feeds Edgenuity via OneRoster/Clever); 2) Manage Students / Report Builder – Students export | **Partial** — exports exist ([Manage Students](https://help.imagineedgenuity.com/hc/en-us/articles/5323300416023-Settings-menu-icons-Managing-Students)); exact columns (DOB, guardian e-mail) not confirmed in public docs; API StudentInfo class exists but fields unverified | Student e-mail (stored per [Adding a student's email](https://help.imagineedgenuity.com/hc/en-us/articles/360042713454-Adding-a-student-s-email-address)); guardian name/e-mail via family contacts ([Viewing family members](https://help.imagineedgenuity.com/hc/en-us/articles/360042725734-Viewing-a-student-s-family-members)) | Low (SIS is the better source) | District SIS/data-governance approval; no Imagine permission for SIS route |
| (c) Per-student progress-report PDF printed monthly | 1) Enable scheduled Parent Progress Report e-mails (daily/weekly/monthly) and Family Portal; 2) generate the district's own report from (a) data | **Yes** for parent e-mail/Family Portal ([Scheduled emails](https://help.imagineedgenuity.com/hc/en-us/articles/360042917714-Sending-scheduled-Progress-Report-emails-to-parents)); **No** bulk PDF — "printed one at a time" ([Progress Report Overview](https://help.imagineedgenuity.com/hc/en-us/articles/1500004680021-Progress-Report-Overview)) | Same course-level fields as the printed report | Low (setting toggle) / Medium (own PDF) | School admin enables Family Portal/e-mail; guardian contacts must be entered |
| (d) ALE Management (learnpsd.psd1.org) contact log and enrollment CSVs | Unknown vendor (district-built); ask district IT for a DB view, CSV drop, or REST endpoint | **Not documented publicly** (no public docs found; only PSD ALE policy/PDLA pages: [Policy 2255](https://www.psd1.org/about/policies-and-procedures/dynamic-policy-page/~board/2000-series/post/policy-2255-alternative-learning-experience-programs)) | Whatever the district app stores (contact log, ALE enrollment) | Unknown until IT is consulted | District IT / app owner |
| (e) Laserfiche Forms monthly progress report (forms.psd1.org) | 1) Pre-fill via Laserfiche Forms URL parameters/lookup; 2) Laserfiche REST API for the repository; 3) Forms webhook service task to push submissions out | **Partial** — Laserfiche publishes a REST API and webhooks ([developer.laserfiche.com](https://developer.laserfiche.com/docs/api/guide_overview-of-the-laserfiche-api/), [Service Tasks](https://doc.laserfiche.com/laserfiche.documentation/11/administration/en-us/Subsystems/Forms/Content/Service-Tasks.htm)) but "doesn't have a publicly documented API specifically for Laserfiche Forms" ([Laserfiche Answers](https://answers.laserfiche.com/questions/203576/Does-Laserfiche-Forms-has-an-API)) | Form fields the district defines | Medium | District Laserfiche admin (API keys, process changes) |
| (f) IEP/504 PDFs | No Edgenuity integration; keep as district documents (IEP system is separate) | **No** (nothing in Imagine docs) | n/a | n/a | District special-ed data owner |
| (g) District calendar PDF | Parse once per year or use district calendar feed (ICS) if published | **No** Imagine relevance | dates only | Low | District communications |
| (h) Staff roster / OneDrive shared folder messaging | Microsoft Graph (OneDrive/Teams) or district AD groups; no Edgenuity role | **No** Imagine relevance (Edgenuity educator accounts come from nightly import: [Integrations](https://help.imagineedgenuity.com/hc/en-us/articles/29562613754007-Integrations)) | staff list, files | Low–Medium | District M365 admin |

### 7. Bottom line for product design
1. The only Imagine-sanctioned programmatic outbound channel is the **Edgenuity API** (paid, via Account Executive, requires district engineering; schema not publicly readable). Everything else outbound is human-initiated CSV/XLSX/print or LTI grade return into Canvas/Schoology.
2. Inbound automation (accounts + enrollments) is well documented: **OneRoster 1.1 via SFTP or API, Clever Secure Sync, ClassLink Roster Server**, all as paid add-ons requiring nightly SIS export and course-code mapping.
3. The TOS forbids automated queries/scraping of the Services; the current embedded-window, human-click export model stays inside the terms, whereas a scheduled headless fetch would not.
4. Plan for EdgeEX: reports, session-time semantics and LMS integration differ from heritage Edgenuity, and the 2026 "consolidated reporting" changes may alter export layouts.


---

## Part 4 — Open-source technology scout

**Scope.** Electron desktop app (single-file HTML renderer + Node main process, better-sqlite3, local-first, FERPA-sensitive, no server). Scouted 2026-09-25.

**Verification method.** Every "License / Last push / Stars" cell marked *(v)* was pulled from the GitHub API on 2026-09-25 (via the GitHub MCP search endpoint; direct `api.github.com/repos/...` was blocked by the session proxy). `NOASSERTION` means GitHub could not auto-detect an SPDX id; in those cases the license named is from the repo's LICENSE file as I know it and is flagged *(repo file, not API-confirmed)*. Rows marked *(unverified)* were not indexed by the search endpoint; treat their license as "from memory".

**License legend.** Permissive (MIT/ISC/BSD/Apache/0BSD/Unlicense) = no obligation beyond attribution notice in the app's About/licenses screen. **MPL-2.0** = file-level copyleft: you may ship it in a proprietary Electron app, but modifications *to those files* must be published. **GPL/AGPL** = viral: linking into a distributed Electron app would require releasing Command Center's source under the same license. **BUSL / "source-available"** = not open source; production use restricted. **Dual** = pick the permissive option and record it.

**Difficulty.** low = drop-in npm, pure JS, works in the renderer or main; med = needs a build step, native module rebuild for Electron (`electron-rebuild`), or a worker; high = new process/service, large runtime, or architecture change.

---

### 1. Rules / workflow engines

| Project | GitHub URL | Purpose | License | Last push | Stars | Security concerns | How Command Center could use it | Difficulty |
|---|---|---|---|---|---|---|---|---|
| json-rules-engine | https://github.com/CacheControl/json-rules-engine | Rules as JSON (conditions -> events), async facts | ISC (v) | 2026-02-16 | 3.1k | Pure JS, no network. Slow release cadence but stable | Store advisor-defined "flag a student if GPA<2.0 AND absences>5" rules as JSON in SQLite; evaluate nightly | low |
| GoRules Zen (zen-engine) | https://github.com/gorules/zen | Decision tables / DMN-style graphs; Rust core with Node bindings | MIT (v) | 2026-09-25 | 2.0k | **Native (napi-rs) binary** must be rebuilt for Electron's ABI; prebuilt Win binaries exist. Optional hosted editor is a separate commercial product | Decision tables for tiering (Tier 1/2/3) that non-devs can edit in a spreadsheet-like JSON | med |
| XState | https://github.com/statelyai/xstate | Statecharts / actors for long-lived workflows | MIT (v) | 2026-09-25 | 30.2k | Pure JS. Large API surface; v5 is a breaking change from v4 | Model an intervention case lifecycle (referred -> plan -> monitoring -> review -> closed) with persisted snapshots in SQLite | med |
| json-logic-js | https://github.com/jwadhams/json-logic-js | Tiny serializable boolean/arith logic | MIT (v) | 2024-07-09 | 1.5k | Pure JS; effectively in maintenance mode (no push in 2+ yrs) | Cheap filter expressions saved with dashboards/queries | low |
| node-rules | https://github.com/mithunsatheesh/node-rules | Forward-chaining rules, TS | MIT (v) | 2026-01-21 | 681 | Rules are JS functions -> no sandbox; only load rules you ship | Alternative to json-rules-engine if you prefer code-defined rules | low |

Not recommended: **nools** (MIT, last push 2019-01-30, 953★) is dead; **Jexl** (MIT, last push 2023-09-18) is a fine expression evaluator but unmaintained — prefer json-logic-js.

### 2. Event-driven automation

| Project | GitHub URL | Purpose | License | Last push | Stars | Security concerns | How Command Center could use it | Difficulty |
|---|---|---|---|---|---|---|---|---|
| RxJS | https://github.com/ReactiveX/rxjs | Reactive streams, debounce/throttle/combine | Apache-2.0 (v) | 2026-08-08 | 31.7k | Pure JS; heavy for a single-file app unless tree-shaken | Debounced "recompute risk flags after N record edits" pipelines | med |
| mitt | https://github.com/developit/mitt | 200-byte typed event emitter | MIT (v) | 2024-08-14 | 11.9k | Pure JS; "done" not abandoned | In-renderer event bus (record.saved, import.finished) | low |
| EventEmitter2 | https://github.com/EventEmitter2/EventEmitter2 | Emitter with wildcards/namespaces, TTL | MIT (v) | 2024-02-19 | 2.9k | Pure JS; stale but stable | Namespaced `student.*.attendance` events feeding rules engine | low |
| nanoevents | https://github.com/ai/nanoevents | 107-byte emitter, TS | MIT (v) | 2026-07-22 | 1.6k | Pure JS, actively maintained | Same as mitt; pick one | low |

Note on Temporal: `temporalio/sdk-typescript` is MIT (v, 2026-09-22, 924★) but **requires the Temporal server** — not viable for a no-server app. A "local Temporal" is best approximated with XState + a SQLite-backed job table (section 3).

### 3. Task / action queues (offline, single process)

| Project | GitHub URL | Purpose | License | Last push | Stars | Security concerns | How Command Center could use it | Difficulty |
|---|---|---|---|---|---|---|---|---|
| p-queue | https://github.com/sindresorhus/p-queue | In-memory promise queue with concurrency/priority | MIT (v) | 2026-07-22 | 4.3k | Pure JS, ESM-only | Throttle PDF generation / imports; **not durable** across restarts | low |
| bree | https://github.com/breejs/bree | Job scheduler running jobs in worker_threads with cron/human syntax | MIT (v) | 2026-02-17 | 3.3k | Pure JS; jobs are files spawned as workers — path-safety matters | Nightly "recompute deadlines", weekly reports, inside the Electron main process | med |
| better-queue + better-queue-sqlite | https://github.com/diamondio/better-queue , https://github.com/diamondio/better-queue-sqlite | Persistent queue with retry/batch; SQLite store | MIT (v) / MIT (v) | 2024-06-22 / 2023-03-13 | 551 / 13 | Pure JS but the SQLite store uses the older `sqlite3` binding, not better-sqlite3 -> second native module | Durable outbox for "generate packet", "send reminder" | med |
| BullMQ | https://github.com/taskforcesh/bullmq | Redis/Postgres-backed queues | MIT (v) | 2026-09-25 | 9.4k | **Requires Redis or Postgres server** — disqualifying for a local-first desktop app | Do not adopt | high |
| @anephenix/job-queue | https://github.com/anephenix/job-queue | Queue with SQLite (better-sqlite3) backend | **No license file** (v) | 2026-09-21 | 0 | Unlicensed = all rights reserved; zero adoption | Do not adopt | — |

Recommendation: a hand-rolled `jobs` table in the existing better-sqlite3 DB (state, run_at, attempts, payload JSON) polled by a `setInterval`/croner tick is ~150 lines and avoids a second SQLite binding. Use p-queue for in-process concurrency on top of it.

### 4. School-calendar / deadline engines

| Project | GitHub URL | Purpose | License | Last push | Stars | Security concerns | How Command Center could use it | Difficulty |
|---|---|---|---|---|---|---|---|---|
| date-fns | https://github.com/date-fns/date-fns | Functional date utils incl. `addBusinessDays`, `differenceInBusinessDays` | MIT (repo LICENSE.md; API returned no SPDX) | 2026-09-22 | 36.6k | Pure JS, tree-shakable | Core date math; business-day helpers are Mon–Fri only — layer school holidays on top | low |
| Luxon | https://github.com/moment/luxon | Immutable DateTime with IANA zones via Intl | MIT (v) | 2026-08-09 | 16.5k | Pure JS | Alternative to date-fns if you want an object API | low |
| Day.js | https://github.com/iamkun/dayjs | 2 kB Moment-compatible API | MIT (v) | 2026-09-15 | 48.7k | Pure JS; 1.3k open issues | Only if the codebase already speaks Moment | low |
| rrule | https://github.com/jkbrzt/rrule | RFC 5545 recurrence rules | BSD-3-Clause (repo file; API NOASSERTION) | 2024-06-27 | 3.7k | Pure JS; 214 open issues, slow maintenance | "Every 2nd Tuesday check-in", term boundaries, recurring deadlines | low |
| date-holidays | https://github.com/commenthol/date-holidays | Worldwide public-holiday rules (US states) | ISC (repo file; API NOASSERTION) | 2026-09-20 | 1.1k | Pure JS; big data bundle (~MBs) | Seed a district calendar; still need manual in-service/snow days | low |
| ical.js | https://github.com/kewisch/ical.js | Parse .ics (RFC 5545) | **MPL-2.0** (v) | 2026-09-22 | 1.2k | Pure JS. MPL is fine to bundle; only modified ical.js files must be published | Import the district's published .ics calendar to derive school days | low |
| temporal-polyfill (js-temporal) | https://github.com/js-temporal/temporal-polyfill | TC39 Temporal API polyfill | ISC (v) | 2026-09-22 | 790 | Pure JS, spec-tracking | Future-proof date model; Chromium in Electron may ship Temporal natively soon | low |

"School day" counting: no library models instructional-day calendars. Pattern: store a `school_days` table generated from term start/end minus holidays (date-holidays + imported .ics + manual overrides), then count with a SQL `BETWEEN`. `business-days-js` (npm, not verified) wraps dayjs + date-holidays and is a reasonable reference.

### 5. Intervention workflow / MTSS / RTI systems

Honest finding: **there is no maintained, permissively licensed open-source MTSS/RTI or student case-management engine.** The market is commercial (Branching Minds, Panorama, Frontline, EmbraceMTSS). What exists:

| Project | GitHub URL | Purpose | License | Last push | Stars | Security concerns | How Command Center could use it | Difficulty |
|---|---|---|---|---|---|---|---|---|
| Gibbon | https://github.com/GibbonEdu/core | PHP school platform with behaviour/planner modules | **GPL-3.0** (v) | 2026-09-25 | 633 | PHP/MySQL server; GPL forbids embedding | Study only: data model for behaviour incidents/notes/referrals | n/a |
| openSIS Classic | https://github.com/OS4ED/openSIS-Classic | PHP SIS (attendance, gradebook) | **No license file** in API (v); project states GPL-3.0 | 2026-06-08 | 340 | PHP server; copyleft | Reference for SIS field naming only | n/a |
| Primero | https://github.com/primeroIMS/primero | UNICEF child-protection case management (Rails + React) | NOASSERTION (v); custom **AGPL-style** license, read carefully | 2026-09-25 | 76 | Server app; restrictive license | Best open reference for case-management workflow states, consent tracking, and audit expectations | n/a |
| Ed-Fi ODS/API | https://github.com/Ed-Fi-Alliance-OSS/Ed-Fi-ODS | K-12 data standard + ODS (C#) | Apache-2.0 (v) | 2026-09-09 | 28 | Server; .NET | Borrow the **Ed-Fi Intervention / InterventionStudy / StudentIntervention** entity definitions as your schema vocabulary | n/a |

Recommendation: build the intervention workflow yourself on XState (§1) + the event log (§6), using Ed-Fi's intervention entities as the schema and Primero as a UX/audit reference.

### 6. Audit / event logging

| Project | GitHub URL | Purpose | License | Last push | Stars | Security concerns | How Command Center could use it | Difficulty |
|---|---|---|---|---|---|---|---|---|
| Emmett | https://github.com/event-driven-io/emmett | Event-sourcing toolkit (stores, projections, streams) | No SPDX in API; repo declares MIT *(unverified)* | 2026-09-25 | 539 | Pure TS; official stores are Postgres/EventStoreDB/in-memory — SQLite store would be custom | Command/handler/projection structure for the case timeline | med |
| node-eventstore | https://github.com/thenativeweb/node-eventstore | Event store with pluggable DB incl. in-memory/SQLite-ish | MIT (v) | 2026-09-04 | 536 | Old callback-style API; many DB adapters pull optional deps | Legacy but working; prefer a custom table | med |
| sql-event-store | https://github.com/mattbishop/sql-event-store | Reference SQL schema for append-only event store with ordering/dedup | Unlicense (v) | 2026-05-19 | 72 | Schema + tests, not a library | Copy the schema pattern (append-only table, triggers blocking UPDATE/DELETE) into better-sqlite3 | low |
| node-event-storage | https://github.com/albe/node-event-storage | Embedded file-based event store, explicitly targets Electron | MIT (v) | 2026-09-21 | 41 | Single maintainer, tiny community | Only if you want a file-based log separate from SQLite | med |
| Trillian | https://github.com/google/trillian | Verifiable Merkle log (Go server) | Apache-2.0 (v) | 2026-09-21 | 3.8k | Server + DB; overkill | Reference only for hash-chain design | high |
| immudb | https://github.com/codenotary/immudb | Immutable tamper-evident DB | NOASSERTION (v) — **BUSL-1.1 / source-available** | 2026-09-10 | 9.0k | Go server; license restricts commercial use | Do not adopt | high |

Recommendation: an `audit_events` table with `prev_hash`, `hash = sha256(prev_hash || canonical_json(event))`, SQLite triggers that `RAISE(ABORT)` on UPDATE/DELETE, and a periodic "verify chain" routine. Node's built-in `crypto` suffices; no dependency needed.

### 7. OneRoster 1.1 / 1.2

| Project | GitHub URL | Purpose | License | Last push | Stars | Security concerns | How Command Center could use it | Difficulty |
|---|---|---|---|---|---|---|---|---|
| oneroster-ts | https://github.com/trilogy-group/oneroster-ts | TS SDK (types + REST client) for OneRoster 1.2 | 0BSD (v) | 2026-05-11 | 10 | Pure TS; REST client makes network calls — use only the **types** for CSV mapping if you stay offline; small user base | Typed models for users/orgs/classes/enrollments when importing SIS CSV exports | low |
| edfi-oneroster | https://github.com/Ed-Fi-Alliance-OSS/edfi-oneroster | Serves OneRoster 1.2 from Ed-Fi ODS (Node) | Apache-2.0 (v) | 2026-09-25 | 6 | Server; reference implementation quality from the Ed-Fi Alliance | Reference for field-by-field OneRoster 1.2 shape and validation | n/a |
| oneroster-csv-validator | https://github.com/wwewtech/oneroster-csv-validator | Rules for validating OneRoster CSV bundles (manifest, GUIDs, orphans, bulk vs delta) | MIT (v) | 2026-09-23 | 1 | Created 2026-09-20; it is an "AI agent skill" (prose rules), not a library | Checklist for your own CSV validator | low |
| conform-ed | https://github.com/conform-ed/conform-ed | Conformance tooling for ed-tech standards (TS) | MIT (v) | 2026-09-24 | 2 | 3 months old, 2★ | Watch list | — |

Not usable: `oat-sa/oneroster-import` (**GPL-2.0**, PHP); `ridencww/uniroster-server` (archived). 1EdTech's own validators are hosted services, not open code. Practical path: PapaParse + a zod schema per OneRoster CSV file (users.csv, orgs.csv, classes.csv, enrollments.csv, academicSessions.csv, manifest.csv), with referential checks in SQL after load.

### 8. CSV schema detection / import validation

| Project | GitHub URL | Purpose | License | Last push | Stars | Security concerns | How Command Center could use it | Difficulty |
|---|---|---|---|---|---|---|---|---|
| PapaParse | https://github.com/mholt/PapaParse | Browser/Node CSV parser; delimiter sniffing, streaming, worker mode | MIT (v) | 2026-09-15 | 13.6k | Pure JS; runs in renderer with `worker:true` | Primary CSV reader; auto-detect delimiter/encoding, preview first rows | low |
| node-csv (csv-parse) | https://github.com/adaltas/node-csv | Streaming CSV parse/stringify for Node | MIT (v) | 2026-09-25 | 4.3k | Pure JS | Main-process streaming import of very large SIS exports | low |
| zod | https://github.com/colinhacks/zod | TS-first schema validation | MIT (v) | 2026-09-24 | 44.0k | Pure JS | Per-file row schemas, coercion (dates, grade levels), error rows report | low |
| valibot | https://github.com/fabian-hiller/valibot | Modular, tiny alternative to zod | MIT *(unverified; not indexed)* | — | — | Pure JS | Same role, smaller bundle | low |
| ajv | https://github.com/ajv-validator/ajv | JSON Schema validator | MIT (v) | 2026-09-06 | 14.8k | Pure JS; uses `new Function` codegen (CSP: needs `unsafe-eval` in renderer, so run in main) | If you want schemas as data files shareable with the district | low |
| duckdb-wasm | https://github.com/duckdb/duckdb-wasm | DuckDB in WASM; `read_csv_auto` sniffing | MIT (v) | 2026-07-28 | 2.1k | Large WASM (~10–30 MB); no network needed | Type inference on unknown CSVs and ad-hoc analytics (§18) | med |
| tableschema-js (Frictionless) | https://github.com/frictionlessdata/tableschema-js | Table Schema inference/validation | MIT (v) | 2023-08-26 | 85 | Unmaintained since 2023 | Borrow the Table Schema JSON format for describing import templates | low |

Avoid: `frictionless-js` (no license file, dead since 2023).

### 9. Data quality / anomaly detection

| Project | GitHub URL | Purpose | License | Last push | Stars | Security concerns | How Command Center could use it | Difficulty |
|---|---|---|---|---|---|---|---|---|
| simple-statistics | https://github.com/simple-statistics/simple-statistics | Descriptive stats, z-scores, regression, quantiles, MAD | ISC (v) | 2026-09-16 | 3.5k | Pure JS, zero deps | Outlier flags on attendance/grade series (robust z-score via MAD), trend slopes | low |
| stdlib | https://github.com/stdlib-js/stdlib | Large numerical/statistical library, per-function packages | Apache-2.0 (v) | 2026-09-25 | 6.0k | Pure JS; install only the sub-packages you need | Distributions, hypothesis tests if needed | low |
| ml.js | https://github.com/mljs/ml | Classic ML (k-means, PCA, regression) | MIT (v) | 2024-10-21 | 2.7k | Pure JS; umbrella repo quiet, sub-packages still move | Clustering students by risk profile (exploratory) | med |
| danfo.js | https://github.com/javascriptdata/danfojs | Pandas-like DataFrame on TensorFlow.js | MIT (v) | 2026-04-15 | 5.1k | Pulls TensorFlow.js (large; native tfjs-node optional) | Only if you need DataFrame ergonomics; otherwise duckdb-wasm | med |
| volume-anomaly | https://github.com/tripolskypetr/volume-anomaly | CUSUM + Bayesian Online Changepoint Detection, zero deps, TS | **No license file** (v) | 2026-07-07 | 11 | Unlicensed; finance-oriented | Reference implementation of CUSUM/BOCPD to re-implement (~100 lines) | low |

There is no mature JS changepoint library. CUSUM and a simple BOCPD are small enough to implement in-house on top of simple-statistics.

### 10. Notification / reminder scheduling

| Project | GitHub URL | Purpose | License | Last push | Stars | Security concerns | How Command Center could use it | Difficulty |
|---|---|---|---|---|---|---|---|---|
| croner | https://github.com/Hexagon/croner | Cron parse + schedule, zero deps, TZ-aware, browser+Node | MIT (v) | 2026-08-31 | 2.6k | Pure JS | The scheduler tick for reminders and jobs (§3) | low |
| cron-parser | https://github.com/harrisiirak/cron-parser | Parse/iterate cron expressions | MIT (v) | 2026-09-12 | 1.5k | Pure JS | Compute "next run" for display | low |
| node-cron (kelektiv) | https://github.com/kelektiv/node-cron | Cron jobs for Node, TS | MIT (v) | 2026-09-25 | 9.0k | Pure JS | Alternative to croner | low |
| node-schedule | https://github.com/node-schedule/node-schedule | Cron-like + date-based jobs | MIT (v) | 2025-06-19 | 9.2k | Pure JS; slower maintenance | Alternative | low |
| Electron `Notification` (built-in) | https://github.com/electron/electron | Native OS toasts from main process | MIT (v) | 2026-09-25 | 123k | On Windows needs an AppUserModelId + Start-menu shortcut (Squirrel/NSIS installers do this) | Deadline reminders while app runs | low |
| node-notifier | https://github.com/mikaelbr/node-notifier | Cross-platform notifications (bundles SnoreToast .exe on Windows) | MIT (v) | 2024-06-24 | 5.8k | Ships a Windows binary; supply-chain surface; unmaintained 2 yrs | Only if Electron's Notification is insufficient | med |

Avoid: `electron-windows-notifications` (MIT, last push 2022-03-22, native WinRT via NodeRT — brittle across Electron versions). Note: reminders fire only while the app is open; for "when closed" use a Windows Task Scheduler entry that launches the app with a flag.

### 11. Document / PDF generation

| Project | GitHub URL | Purpose | License | Last push | Stars | Security concerns | How Command Center could use it | Difficulty |
|---|---|---|---|---|---|---|---|---|
| Electron `webContents.printToPDF` (built-in) | https://github.com/electron/electron | Render HTML/CSS to PDF via Chromium | MIT (v) | 2026-09-25 | 123k | Built-in; no extra deps; deterministic if fonts are bundled | Primary path: HTML templates -> PDF for plans, letters, packets | low |
| pdf-lib | https://github.com/Hopding/pdf-lib | Create/modify/merge PDFs, fill forms | MIT (v) | 2024-07-17 | 8.6k | Pure JS; **no commits since 2024-07**, 317 open issues; still widely used. Community fork `@cantoo/pdf-lib` exists | Merge printToPDF outputs, stamp page numbers/watermarks, fill district forms | low |
| pdfmake | https://github.com/bpampuch/pdfmake | Declarative JSON -> PDF (tables, columns) | MIT (repo file; API NOASSERTION) | 2026-06-12 | 12.4k | Pure JS; bundles fonts (large) | Tabular reports without HTML layout quirks | low |
| PDFKit | https://github.com/foliojs/pdfkit | Low-level PDF drawing API | MIT (v) | 2026-09-24 | 10.7k | Pure JS | Under pdfmake; direct use for custom layouts | med |
| jsPDF | https://github.com/parallax/jsPDF | Client-side PDF generation | MIT (v) | 2026-09-23 | 31.3k | Pure JS; html2canvas rasterizes text (accessibility loss) | Not needed if printToPDF is used | low |
| docx | https://github.com/dolanmiu/docx | Generate .docx declaratively | MIT (v) | 2026-09-25 | 5.9k | Pure JS | Editable Word versions of intervention plans for staff | low |
| pdfme | https://github.com/pdfme/pdfme | Template designer + generator on pdf-lib | MIT (v) | 2026-09-21 | 4.8k | React-based designer; pulls pdf-lib | Let advisors design letter templates visually | med |

### 12. Evidence / audit packet generation

| Project | GitHub URL | Purpose | License | Last push | Stars | Security concerns | How Command Center could use it | Difficulty |
|---|---|---|---|---|---|---|---|---|
| JSZip | https://github.com/Stuk/jszip | Create/read zip in JS | **Dual MIT or GPL-3.0** (repo file; API NOASSERTION) — choose MIT | 2026-09-09 | 10.4k | Pure JS; in-memory (large packets = RAM) | Bundle PDFs + `manifest.json` + `hashes.txt` into one evidence packet | low |
| node-archiver | https://github.com/archiverjs/node-archiver | Streaming zip/tar for Node | MIT (v) | 2026-09-23 | 3.0k | Pure JS, streaming | Same, in main process for big packets | low |
| hash-wasm | https://github.com/Daninet/hash-wasm | Fast SHA-256/SHA-3/BLAKE in WASM | MIT (repo file; API NOASSERTION) | 2024-11-19 | 1.2k | WASM, no network | Hash each artifact for the manifest; Node `crypto` is enough in main | low |
| node-signpdf | https://github.com/vbuch/node-signpdf | PKCS#7 detached signatures on PDFs | MIT (v) | 2026-09-11 | 942 | Needs a P12 cert; depends on node-forge | Sign final packets so recipients can verify integrity | med |
| node-forge | https://github.com/digitalbazaar/forge | PKI/X.509/PKCS in JS | **Dual BSD-3-Clause or GPL-2.0** (repo file; API NOASSERTION) — choose BSD | 2026-09-25 | 5.3k | Pure JS; 464 open issues; prefer Node `crypto`/WebCrypto where possible | Certificate handling for signing | med |
| BagIt spec (LoC) | https://github.com/LibraryOfCongress/bagit-conformance-suite | Packaging format: payload dir + manifest-sha256.txt + bag-info.txt | *(unverified)* | — | — | Spec, not code | Adopt BagIt layout for packets: it is the archival standard for "files + checksums + metadata" and trivially implemented | low |

Recommendation: BagIt-style folder (`data/`, `manifest-sha256.txt`, `bag-info.txt` with student id, date range, generating user, app version) zipped with node-archiver; optionally signed with node-signpdf on the cover PDF.

### 13. Electron offline / local databases

| Project | GitHub URL | Purpose | License | Last push | Stars | Security concerns | How Command Center could use it | Difficulty |
|---|---|---|---|---|---|---|---|---|
| better-sqlite3 | https://github.com/WiseLibs/better-sqlite3 | Sync SQLite binding (current choice) | MIT (v) | 2026-08-10 | 7.5k | Native; needs `electron-rebuild`/prebuilds per Electron ABI | Keep | — |
| better-sqlite3-multiple-ciphers | https://github.com/m4heshd/better-sqlite3-multiple-ciphers | better-sqlite3 built on SQLite3MultipleCiphers (AES-256, SQLCipher-compatible) | MIT (v) | 2026-09-21 | 242 | Native; drop-in API; single maintainer but tracks upstream closely; prebuilds for Electron | **Encryption at rest with zero API change** — key from Electron `safeStorage` (DPAPI on Windows) | low |
| SQLCipher | https://github.com/sqlcipher/sqlcipher | Encrypted SQLite fork | BSD-3-Clause (v) (commercial editions exist) | 2026-09-15 | 7.3k | Native; you must build your own Node binding or use the above | Alternative if district requires "SQLCipher" by name | high |
| Kysely | https://github.com/kysely-org/kysely | Type-safe SQL query builder, better-sqlite3 dialect | MIT (v) | 2026-09-23 | 14.2k | Pure TS | Typed queries + migrations without an ORM | low |
| Drizzle ORM | https://github.com/drizzle-team/drizzle-orm | TS ORM with better-sqlite3 driver + drizzle-kit migrations | Apache-2.0 (v) | 2026-09-25 | 35.9k | Pure TS; 2k open issues; fast-moving | Schema-as-code + migration generation | med |
| sqlite-vec | https://github.com/asg017/sqlite-vec | Vector search SQLite extension | Apache-2.0 (v) | 2026-05-18 | 8.1k | Native loadable extension (`db.loadExtension`); pre-v1 | Embedding search over notes for local AI (§14) | med |
| libsql-js | https://github.com/tursodatabase/libsql-js | better-sqlite3-compatible binding for libSQL (vectors, encryption) | MIT (v) | 2026-09-22 | 335 | Native; Turso-driven; sync features imply cloud | Only if you want built-in vectors + encryption in one binding | med |
| sql.js | https://github.com/sql-js/sql.js | SQLite in WASM (in-memory) | MIT (repo file; API NOASSERTION) | 2026-08-14 | 13.7k | WASM; whole DB in memory | Renderer-side scratch queries on exported snapshots | low |
| Dexie.js | https://github.com/dexie/Dexie.js | IndexedDB wrapper | Apache-2.0 (v) | 2026-09-25 | 14.6k | Pure JS; renderer-only, no encryption | Not needed with SQLite in main | — |
| RxDB | https://github.com/pubkey/rxdb | Reactive local-first DB with replication | Apache-2.0 core (v); **premium plugins are paid/proprietary** | 2026-09-25 | 23.4k | Encryption and some storages are premium | Overkill; would replace SQLite | high |
| PouchDB | https://github.com/pouchdb/pouchdb | CouchDB-style local DB | Apache-2.0 *(unverified; not indexed)* | — | — | Pure JS | Not recommended vs SQLite | — |

### 14. Local AI / small language models (Windows laptops, offline)

| Project | GitHub URL | Purpose | License | Last push | Stars | Security concerns | How Command Center could use it | Difficulty |
|---|---|---|---|---|---|---|---|---|
| node-llama-cpp | https://github.com/withcatai/node-llama-cpp | Node bindings to llama.cpp; prebuilt binaries (CPU/CUDA/Vulkan); JSON-schema-constrained output; Electron docs | MIT (v) | 2026-09-24 | 2.2k | Native; downloads prebuilt binaries at install (pin + vendor them); GGUF model files are large | In-process summarization/drafting of intervention notes with **no network**; grammar-enforced JSON output | med |
| llama.cpp | https://github.com/ggml-org/llama.cpp | C/C++ inference engine | MIT (v) | 2026-09-25 | 129k | Native; underlying runtime | Via node-llama-cpp | — |
| Ollama | https://github.com/ollama/ollama | Local model server + CLI | MIT (v) | 2026-09-25 | 182k | **Separate installed service** listening on localhost:11434; auto-updates; model pulls need internet once | Optional "bring your own Ollama" integration for power users; not for default install | med |
| transformers.js | https://github.com/huggingface/transformers.js | ONNX models in JS/WASM/WebGPU (embeddings, classification, small LLMs) | Apache-2.0 (v) | 2026-09-25 | 16.3k | Downloads models from HF Hub by default — set `env.allowRemoteModels=false` and bundle | Local embeddings (e.g. bge-small) into sqlite-vec for note search; zero native code | low |
| onnxruntime (node) | https://github.com/microsoft/onnxruntime | ONNX inference, DirectML on Windows | MIT (v) | 2026-09-25 | 21.9k | Native; large binary | Under transformers.js; direct use for Phi-4-mini ONNX builds | med |
| WebLLM | https://github.com/mlc-ai/web-llm | WebGPU LLM inference in browser | Apache-2.0 (v) | 2026-09-15 | 19.2k | Needs WebGPU (Electron OK); model weights fetched from CDN — must self-host | Renderer-side inference without native modules, GPU required | med |
| llamafile | https://github.com/Mozilla-Ocho/llamafile | Single-file executable model | *(unverified; Apache-2.0 from memory)* | — | — | Spawns an .exe; SmartScreen prompts | Not recommended for a signed installer | high |

**Model licenses (weights, not code):**

| Model family | Repo | Weights license | Fit |
|---|---|---|---|
| Qwen2.5 / Qwen3 0.6B–8B | https://github.com/QwenLM/Qwen3 (no SPDX in API; model cards say **Apache-2.0**) | Apache-2.0 | Best quality/size for 8–16 GB laptops; Qwen3-1.7B/4B Q4 GGUF |
| SmolLM2/3 135M–3B | https://github.com/huggingface/smollm (Apache-2.0 (v)) | Apache-2.0 | Tiny; good for classification/extraction |
| Phi-4-mini (3.8B) | https://github.com/microsoft/PhiCookBook (MIT (v)); model card MIT | MIT | Strong reasoning at 4B; ONNX/DirectML builds |
| Gemma 3 1B/4B | https://github.com/google-deepmind/gemma (code Apache-2.0 (v)) | **Gemma Terms of Use** — custom, permits commercial use with use-policy restrictions; not OSI | Usable, but legal should read the terms |
| Llama 3.2 1B/3B | https://github.com/meta-llama/llama-models (NOASSERTION (v)) | **Llama 3.2 Community License** — custom; attribution "Built with Llama", >700M MAU clause, acceptable-use policy | Usable, not OSI; extra notice obligations |

FERPA note: all inference stays on device; never enable remote model download at runtime; log model version in the audit trail when AI drafts content.

### 15. FERPA-conscious / local-first architecture

| Project | GitHub URL | Purpose | License | Last push | Stars | Security concerns | How Command Center could use it | Difficulty |
|---|---|---|---|---|---|---|---|---|
| Electron `safeStorage` (built-in) | https://github.com/electron/electron | OS-backed encryption (DPAPI on Windows) | MIT (v) | 2026-09-25 | 123k | Keys tied to the Windows user profile — document backup/restore | Protect the SQLite encryption key and any tokens | low |
| Automerge | https://github.com/automerge/automerge | JSON CRDT (Rust core, WASM) | MIT (v) | 2026-09-25 | 6.6k | WASM; no server needed; sync is optional | Peer-to-peer or USB/network-share sync of case files between advisors without a server | high |
| Yjs | https://github.com/yjs/yjs | CRDT for collaborative data/text | MIT (repo file; API NOASSERTION) | 2026-09-23 | 22.8k | Pure JS | Same; better for rich-text notes | high |
| cr-sqlite | https://github.com/vlcn-io/cr-sqlite | CRDT extension for SQLite (multi-writer merge) | MIT (v) | 2026-08-10 | 3.8k | Native loadable extension; maintenance slowed in 2026 | Make selected SQLite tables mergeable for LAN sync between staff laptops | high |
| Loro | https://github.com/loro-dev/loro | High-perf CRDT (Rust/WASM) | MIT (v) | 2026-09-21 | 6.2k | WASM | Alternative to Automerge | high |
| TinyBase | https://github.com/tinyplex/tinybase | Reactive store with SQLite persister and CRDT sync | MIT (v) | 2026-09-24 | 5.2k | Pure JS | Reactive renderer state persisted to SQLite | med |
| Evolu | https://github.com/evoluhq/evolu | Local-first E2E-encrypted SQLite + sync | MIT (v) | 2026-09-24 | 1.9k | Sync relay is optional; encryption built in | Reference for E2E design | high |
| ElectricSQL | https://github.com/electric-sql/electric | Postgres -> client sync | Apache-2.0 (v) | 2026-09-09 | 10.4k | **Requires Postgres + Electric service** | Not applicable (server) | — |
| PowerSync JS | https://github.com/powersync-ja/powersync-js | SQLite client sync SDK | Apache-2.0 (v) | 2026-09-24 | 724 | **Requires PowerSync service** (self-host or cloud) | Not applicable now | — |
| electron-store | https://github.com/sindresorhus/electron-store | JSON settings file with optional encryption | MIT (v) | 2026-09-20 | 5.0k | Pure JS; its `encryptionKey` is obfuscation, not security | Preferences only, never PII | low |

Avoid: **keytar** (https://github.com/atom/node-keytar) is **archived** (v; last push 2022-12-12) — use `safeStorage`.

Data-minimization patterns worth adopting: store student identifiers once (a `students` table) and reference by surrogate id; keep free-text notes in a separate table so exports can exclude them; per-field "directory information" flags; export-time redaction; and an app-level "purpose of access" prompt recorded in the audit log.

### 16. Playwright / Electron automated testing

| Project | GitHub URL | Purpose | License | Last push | Stars | Security concerns | How Command Center could use it | Difficulty |
|---|---|---|---|---|---|---|---|---|
| Playwright (`_electron`) | https://github.com/microsoft/playwright | E2E automation; Electron support (documented as experimental, stable in practice since 2021) | Apache-2.0 (v) | 2026-09-25 | 96.7k | Dev-only dep | Launch main process, drive the single-page renderer, screenshot regressions, seed SQLite fixtures | low |
| electron-playwright-helpers | https://github.com/spaceagetv/electron-playwright-helpers | Helpers: find packaged app path, IPC calls, menu clicks | MIT (v) | 2026-09-10 | 82 | Dev-only; small maintainer base | Test the built installer output, not just `electron .` | low |
| wdio-electron-service | https://github.com/webdriverio-community/wdio-electron-service | WebdriverIO Electron service (official Spectron successor) | MIT (v) | 2026-05-06 | 39 | Dev-only; Chromedriver-based | Only if the team already uses WebdriverIO | med |
| Spectron | https://github.com/electron-userland/spectron | Legacy ChromeDriver harness | MIT (v) | 2024-02-29 | 1.7k | **Deprecated 2022-02-01 (Electron 13 was last supported)**; do not use | — | — |

### 17. Background jobs inside Electron

| Project | GitHub URL | Purpose | License | Last push | Stars | Security concerns | How Command Center could use it | Difficulty |
|---|---|---|---|---|---|---|---|---|
| Electron `utilityProcess` (built-in, v22+) | https://github.com/electron/electron | Spawn a sandbox-less Node child process from main with MessagePorts | MIT (v) | 2026-09-25 | 123k | Built-in; separate process = crash isolation | Run imports, PDF batches, and LLM inference off the main thread | low |
| Node `worker_threads` (built-in) | — | In-process threads | — | — | — | better-sqlite3 supports one connection per worker | Parallel CSV validation | low |
| Piscina | https://github.com/piscinajs/piscina | Worker-thread pool | MIT (repo file; API NOASSERTION) | 2026-09-24 | 5.2k | Pure JS | Pool for CPU-bound stats/hashing | low |
| workerpool | https://github.com/josdejong/workerpool | Worker pool for Node and browser | Apache-2.0 (v) | 2026-09-13 | 2.3k | Pure JS | Same; works in renderer too | low |
| tinypool | https://github.com/tinylibs/tinypool | Minimal pool (used by Vitest) | MIT (repo file; API NOASSERTION) | 2026-09-13 | 1.6k | Pure JS | Same, smaller | low |
| threads.js | https://github.com/andywer/threads.js | Worker abstraction | MIT (v) | 2024-06-19 | 3.5k | Unmaintained 2 yrs | Skip | — |

Scheduling inside Electron: croner or node-cron (§10) in the main process; persist next-run times so missed runs execute on next launch (`powerMonitor` resume event helps on laptops).

### 18. Reporting / analytics

| Project | GitHub URL | Purpose | License | Last push | Stars | Security concerns | How Command Center could use it | Difficulty |
|---|---|---|---|---|---|---|---|---|
| Chart.js | https://github.com/chartjs/Chart.js | Canvas charts, small API | MIT (v) | 2026-09-14 | 67.7k | Pure JS | Default for dashboards in a single-file renderer | low |
| Apache ECharts | https://github.com/apache/echarts | Rich charting incl. calendar heatmaps, timelines | Apache-2.0 (v) | 2026-09-16 | 67.4k | Pure JS; large bundle (tree-shake) | Attendance calendar heatmaps, brush/zoom | low |
| Observable Plot | https://github.com/observablehq/plot | Grammar-of-graphics on D3, SVG | ISC (v) | 2026-09-01 | 5.4k | Pure JS | Quick exploratory charts; SVG prints crisply to PDF | low |
| Vega-Lite | https://github.com/vega/vega-lite | Declarative JSON chart specs | BSD-3-Clause (v) | 2026-09-24 | 5.5k | Pure JS; heavy | Store chart specs as data (user-defined reports) | med |
| uPlot | https://github.com/leeoniya/uPlot | Tiny, fast time-series charts | MIT (v) | 2026-09-25 | 10.5k | Pure JS | Sparklines for progress monitoring | low |
| duckdb-wasm | https://github.com/duckdb/duckdb-wasm | SQL OLAP in-process | MIT (v) | 2026-07-28 | 2.1k | WASM; can read SQLite via extension | Cohort analytics over exported SQLite snapshots | med |
| ExcelJS | https://github.com/exceljs/exceljs | Read/write xlsx with styles, streaming | MIT (v) | 2025-01-21 | 15.5k | Pure JS; 809 open issues, slow maintenance, but stable | **Recommended** for styled Excel exports | low |
| SheetJS CE (xlsx) | https://github.com/SheetJS/sheetjs | Read many spreadsheet formats | Apache-2.0 (v) | 2024-04-18 (GitHub mirror) | 36.3k | **Distribution risk:** npm registry frozen at 0.18.5; current builds only from cdn.sheetjs.com / git.sheetjs.com; Pro features are commercial | Reading legacy .xls/.xlsb SIS exports only; pin a tarball URL | med |
| xlsx-js-style | https://github.com/gitbrent/xlsx-js-style | SheetJS 0.18 fork adding cell styles | Apache-2.0 *(unverified; not indexed)* | — | — | Fork of frozen SheetJS code | Prefer ExcelJS | low |
| Tabulator | https://github.com/olifolkerd/tabulator | Interactive data table | MIT *(unverified; not indexed)* | — | — | Pure JS | Sortable/filterable student grids | low |
| AG Grid Community | https://github.com/ag-grid/ag-grid | Data grid | NOASSERTION (v): **Community = MIT, Enterprise = commercial**; repo mixes both | 2026-09-25 | 15.6k | Enterprise modules trigger license watermarks | Only Community packages (`ag-grid-community`) | med |
| Perspective (FINOS) | https://github.com/finos/perspective | WASM pivot/streaming analytics UI | Apache-2.0 *(unverified; not indexed)* | — | — | Large WASM | Pivot tables for admins | med |

### 19. Timeline / event-history UI

| Project | GitHub URL | Purpose | License | Last push | Stars | Security concerns | How Command Center could use it | Difficulty |
|---|---|---|---|---|---|---|---|---|
| vis-timeline | https://github.com/visjs/vis-timeline | Interactive zoomable timeline with groups/ranges | **Dual Apache-2.0 or MIT** (repo file; API NOASSERTION) | 2026-09-25 | 2.6k | Pure JS; 304 open issues; needs moment/vis-data deps | Per-student case timeline (interventions as ranges, incidents as points) | low |
| Frappe Gantt | https://github.com/frappe/gantt | Lightweight SVG Gantt | MIT (v) | 2026-06-18 | 6.1k | Pure JS | Intervention plan duration view | low |
| TimelineJS3 | https://github.com/NUKnightLab/TimelineJS3 | Storytelling timeline | **MPL-2.0** (v) | 2026-09-22 | 3.2k | Pure JS; media-oriented, opinionated UI | Probably too narrative for case data | low |
| react-chrono | https://github.com/prabhuignoto/react-chrono | React timeline component | MIT (v) | 2025-12-29 | 4.2k | Requires React | Only if renderer moves to React | med |
| SVAR Gantt (Svelte) | https://github.com/svar-widgets/gantt | Svelte Gantt | MIT (v) | 2026-09-09 | 260 | Svelte-only | Not for a vanilla renderer | med |

Plain-JS alternative: an SVG timeline built with d3-scale/d3-axis (ISC) is ~200 lines and avoids vis-timeline's moment dependency.

### 20. Role-based permissions

| Project | GitHub URL | Purpose | License | Last push | Stars | Security concerns | How Command Center could use it | Difficulty |
|---|---|---|---|---|---|---|---|---|
| CASL | https://github.com/stalniy/casl | Isomorphic ability-based authz (RBAC + attribute conditions) | MIT (v) | 2026-09-25 | 7.1k | Pure JS; conditions are data, serializable | Roles (advisor, counselor, admin, read-only auditor) with field-level rules ("can read notes only for own caseload") stored in SQLite; same rules enforce UI and main-process IPC | low |
| node-casbin | https://github.com/casbin/node-casbin | Policy-model engine (RBAC/ABAC) with adapters | Apache-2.0 (v) | — (not re-fetched; active) | — | Pure JS; policy files or SQLite adapter | If you want PERM-model policy files auditable by IT | med |
| accesscontrol | https://github.com/onury/accesscontrol | Role/attribute grants with field filtering | MIT (v) | 2026-09-24 | 2.3k | Pure JS; long dormant then revived | Simpler RBAC with attribute whitelists | low |
| Oso (library) | https://github.com/osohq/oso | Polar policy language | Apache-2.0 (v) | 2025-02-26 | 3.5k | **Deprecated** (README); native Rust core | Do not adopt | — |
| OpenFGA / Cerbos | https://github.com/openfga/js-sdk , https://github.com/cerbos/cerbos | Zanzibar/PDP servers | Apache-2.0 (v) | 2026-09-25 | 89 / 4.6k | Require a server | Overkill for a desktop app | high |

---

### What NOT to adopt, and why

1. **BullMQ, Temporal, ElectricSQL, PowerSync, OpenFGA, Cerbos, Trillian, Ollama-as-dependency** — all require a server or daemon; incompatible with "local-first, no server".
2. **immudb** — BUSL-1.1 source-available; production restrictions.
3. **Gibbon, openSIS, oat-sa/oneroster-import** — GPL; embedding would force Command Center to GPL. Study their schemas only.
4. **Primero** — custom AGPL-style license; reference only.
5. **Oso library** — officially deprecated Feb 2025.
6. **Spectron** — deprecated 2022; **keytar** — archived 2022 (use Electron `safeStorage`).
7. **nools, Jexl, threads.js, node-notifier, electron-windows-notifications, tableschema-js, frictionless-js** — unmaintained 2+ years.
8. **anephenix/job-queue, volume-anomaly** — no license file at all (all rights reserved by default).
9. **SheetJS from the npm registry** — frozen at 0.18.5 with known CVEs (prototype pollution/ReDoS fixed only in CDN builds). If you must use it, pin the cdn.sheetjs.com tarball; otherwise ExcelJS.
10. **RxDB / AG Grid Enterprise premium modules** — open-core traps: fine core license, but the features you will want (encryption, pivoting) are paid.
11. **Llama 3.2 and Gemma 3 weights** — not OSI licenses; usable but need legal sign-off and in-app attribution. Prefer Qwen3 / SmolLM / Phi-4-mini (Apache-2.0 / MIT) for the default bundled model.
12. **Any library that fetches models or binaries at runtime** (transformers.js default, WebLLM CDN, node-llama-cpp postinstall) unless pinned, vendored, and hash-checked in the installer.

### Suggested minimal stack (all permissive, verified)

json-rules-engine + XState · mitt · croner + in-house SQLite `jobs` table + p-queue · date-fns + rrule + date-holidays + ical.js(MPL) · in-house hash-chained `audit_events` · PapaParse + zod · simple-statistics · Electron Notification · printToPDF + pdf-lib + docx · node-archiver + BagIt layout · better-sqlite3-multiple-ciphers + Kysely + safeStorage · node-llama-cpp + Qwen3-1.7B/4B (Apache-2.0) + transformers.js embeddings + sqlite-vec · Playwright `_electron` + electron-playwright-helpers · utilityProcess + Piscina · Chart.js/ECharts + ExcelJS · vis-timeline (MIT option) · CASL.


---

## Part 5 — Automation opportunities across a teacher's week

Format for each: **Trigger → data examined → rule → automatic action → teacher approval/action → evidence
recorded.** "Qualifying contact" means a student-type ALE contact (the app's `CHECKIN_TYPES`) or an
attendance-course completion, per district policy. School days come from the district calendar module.

| # | Automation | Trigger → data → rule → automatic action → teacher action → evidence |
| --- | --- | --- |
| A1 | **Monday compliance scan** | Trigger: first launch on the first school day of the week (or 6:30 am scheduled job). Data: last Edgenuity import, ALE contact log, Contact Watch, Monthly Evaluations, calendar. Rule: for every active student compute last-week contact, streak, activity gap, expired/expiring courses, open plan deadlines. Action: build the week's work queue and a 5-line briefing; toast once. Teacher: acknowledges, works the queue. Evidence: `scan` event with inputs' hashes and counts. |
| A2 | **Weekly-contact detection** (already partial) | Trigger: any contact-log import or ALE pull. Data: contacts by student, week keys. Rule: week with zero qualifying contacts and ≥3 school days → "missing"; current week only after Thursday → "at risk". Action: task *Contact {student}* with the exact week, last contact date/type/author. Teacher: contacts student, logs in ALE (queue), or records exception (arranged absence). Evidence: task + the ALE entry id that closed it. |
| A3 | **Missing-evidence detector** | Trigger: nightly / on import. Data: ALE contact rows. Rule: contact without a date, method (type), or an empty note ("subject") — the three WAC evidence fields; contacts by a non-certificated author flagged for review. Action: task *Complete contact record* with the field missing. Teacher: edits in ALE. Evidence: before/after snapshot of the row. |
| A4 | **No-activity detection** (exists as a view) | Rule: last gradebook entry ≥7 calendar days (warn) / ≥10 school days (act), excluding students on a grace or arranged absence. Action: task with the day count and the course list. Teacher: outreach; may draft e-mail. Evidence: task + e-mail record. |
| A5 | **Pacing deterioration** | Data: last 3 imports. Rule: pacing drops ≥5 points in 7 days or crosses a bucket boundary downward. Action: task *Check in on {course}* with the trend numbers and projected finish date. Teacher: outreach / plan adjustment. Evidence: trend snapshot attached. |
| A6 | **Automatic prioritisation** (worklist exists, resets daily) | Rule: one shared risk score (contact gap × pacing × expiry × failing × inactivity × deadline proximity) with the reasons listed. Action: queue order + "why" line. Teacher: none (ordering only). Evidence: score components stored with each task. |
| A7 | **Intervention deadline tracking** (exists in WAC panel) | Trigger: Unsatisfactory saved. Rule: due = evaluation date + 5 school days; checkpoint = +10 school days; "second consecutive month" and "third" escalate. Action: tasks *Write plan*, *Review checkpoint*, *Escalate (month 2/3)* with deadlines on the calendar. Teacher: writes/updates plan, records family involvement. Evidence: plan record versions, dates. |
| A8 | **MPR preparation** | Trigger: MPR window opens (last 5 working days) or on demand. Rule: for every student on the caseload assemble the evidence packet (Part 8). Action: packet + draft determinations + draft narrative, flagged "draft". Teacher: confirms or changes each determination, signs the form. Evidence: packet hash, teacher's final values, submission event. |
| A9 | **Three-month escalation tracking** | Data: Monthly Evaluations ledger. Rule: consecutive Unsatisfactory = 2 → task *Review plan effectiveness / consider plan revision*; = 3 → task *Program decision required (per district policy)*. Action: tasks with the ledger excerpt. Teacher: decision + documentation. Evidence: decision record. |
| A10 | **Course expiration forecasting** | Data: progress, target date, recent progress rate (from history). Rule: projected finish (progress remaining ÷ weekly rate) later than target date by >1 week → *at risk of expiring*; target date within 14 days and behind → *needs extension or push*. Action: task with projection and the daily-goal math (minutes/day). Teacher: extension request in Edgenuity or outreach. Evidence: projection snapshot. |
| A11 | **Graduation-risk indicators** | Data: grade level 12, courses, expected credits (needs import or manual credit map). Rule: senior with expiring or failing required courses, or fewer active courses than needed. Action: task *Counselor conversation* with the list. Teacher/counselor: decision. Evidence: task record. (Phase 2: needs credit/transcript data.) |
| A12 | **New-student 10% tracking** (exists as a view) | Rule: day 10 after start with progress <10% (and day 5 with 0%). Action: task with the exact deadline date and the letter draft. Teacher: sends, logs. Evidence: e-mail record; task closure. |
| A13 | **Contact follow-up queue** | Trigger: teacher-initiated e-mail logged, no student-type contact in the following 3 school days. Rule: outreach without reply. Action: task *Second attempt by phone/guardian* with the prior attempt. Teacher: call, log. Evidence: both attempts linked. |
| A14 | **Draft parent/student communication** | Trigger: any task with a communication step. Rule: template by task type and tone; facts inserted from the packet (grounded). Action: draft in the preview modal. Teacher: edits, sends. Evidence: final text, recipients, time, link to task. |
| A15 | **Automatic weekly snapshots** (exists; baseline fixed) | Trigger: first import of a new week. Action: save snapshot, compute deltas, feed A5/A6. Evidence: snapshot id. |
| A16 | **Advisor morning briefing** (Today card exists) | Extend with: tasks due today, deadlines this week, what changed overnight from ALE sync, calendar notes (early release, no-school). Action: one card + optional Windows toast at first launch. Evidence: none needed (derived). |
| A17 | **End-of-week unfinished-work report** | Trigger: Friday 2 pm (last school day). Rule: tasks still open, contacts still missing this week, plans due next week. Action: report + e-mail-to-self / export. Teacher: works the list or defers with a reason. Evidence: deferral reasons. |
| A18 | **Administrator exception reports** | Trigger: Monday scan, monthly. Rule: per advisor: % students contacted, overdue plans, MPRs not recorded, evidence gaps, students at 20+ school days. Action: District Overview rows + exportable report (counts and, for oversight roles, names). Evidence: report file with hash. |
| A19 | **Audit preparation** | Trigger: on demand / monthly. Action: Audit Ready packet (Part 7). Teacher: reviews missing-evidence warnings. Evidence: packet manifest. |
| A20 | **Attendance-course auto-nudge** | Trigger: Thursday with attendance course not done this week. Action: draft reminder e-mail queued; auto-log as Teacher Initiated once sent. Teacher: send. Evidence: e-mail record. |
| A21 | **Roster change detection** | Trigger: Edgenuity or ALE import. Rule: student disappeared / appeared / advisor changed / course dropped / new course added / status changed. Action: change list on the Today card and tasks for onboarding (welcome e-mail, WSLP check) or off-boarding (archive confirmation). Evidence: diff record. |
| A22 | **Data-quality gate on import** | Rule: duplicate SIDs, missing External ID tokens, dates in the wrong year, a roster that shrank >20%, pacing values outside −100…100, files older than the current dashboard. Action: block or warn before the dashboard changes. Teacher: confirm. Evidence: import log with rejections. |
| A23 | **WSLP completeness watch** | Data: WSLP checker items. Rule: any required element unchecked 10 school days after plan start; plan not updated after course change. Action: task *Update WSLP*. Evidence: checklist versions. |
| A24 | **Grade-out / course-completion hand-off** | Rule: progress 100% and no ungraded work. Action: task *Grade out in Edgenuity, enter final in ALE* with a checklist; auto-close when the next import shows the course gone. Evidence: import diff. |
| A25 | **Ungraded-work backlog to teachers** | Rule: Assignment Status "Ungraded" older than N days per content teacher. Action: teacher-scoped list; optional message via staff Messages. Evidence: none required. |
| A26 | **Birthday / milestone touch** (exists for birthdays) | Add: first course completion, 30 days on pace, return after grace. Action: suggested positive contact (counts as student contact only if the student replies). |
| A27 | **Calendar exceptions** | Rule: weeks with <3 school days, snow days answered in the calendar panel → all week-based rules re-evaluate. Action: automatic recalculation; note on affected tasks. |
| A28 | **Silent-failure watchdog** | Rule: ALE sync failed 3 pulls, Edgenuity data older than 3 school days, backup older than 24 h, a module global missing after load. Action: one banner, one task for the admin. Evidence: log. |

Additional opportunities not in the brief: **guardian-contact cadence** (no guardian contact in 30 days for K-8
or for students under intervention); **IEP/504 accommodation reminders** at plan time (IEP module exists);
**seat-time / FTE sanity** (reconciliation module exists — turn its findings into tasks); **course-load
sanity** (student with zero active courses or >8); **teacher workload balance** (records per teacher over 150
already flagged); **duplicate-contact prevention** before ALE write (exists in the queue).

## Part 6 — "ALE Compliance Autopilot" design

### 6.1 What it is
A module that continuously turns data into an explained work queue. It does not decide; it detects, explains,
prepares, and tracks. Everything a teacher sees answers four questions: *who, why (with the numbers and the
rule), by when, and what evidence will close it.*

```
TODAY NEEDS ATTENTION — Advisor GH — Fri Sep 25 (week of 9/20)          3 due today · 2 this week · 1 overdue
─────────────────────────────────────────────────────────────────────────────────────────────────────────────
1  Chen, Marcus (412003)        OVERDUE  Weekly contact missing — weeks of 9/6 and 9/13
   Why: no student-type ALE contact since Phone 9/2; a Teacher-Initiated e-mail on 9/20 does not count.
   Rule: WAC 392-550-025 weekly contact (district: student-type contacts only). Contact Watch: meeting step.
   Next step: call the student and guardian today; log the contact in ALE (opens the queue).
   [Contact + log ▸] [Meeting held ▸] [Arranged absence ▸] [Snooze 1 day ▸]
2  Dawson, Kayla (412004)       DUE TODAY  Intervention plan due (Unsatisfactory on 9/18)
   Why: 5 school days from the evaluation date = 9/25 (Labor Day skipped).  Plan: not started.
   [Write plan ▸ (draft prepared)] [Plan already in ALE ▸]
3  Espinoza, Luis (412005)      THIS WEEK  Second consecutive Unsatisfactory month — existing plan needs review
   Why: Aug and Sep both Unsatisfactory; plan opened 8/28, checkpoint 9/11 not recorded.
   [Review plan ▸] [Record checkpoint ▸]
4  Foster, Emma (412006)        WATCH  New student, day 4 — no course activity yet (grace period active)
   Why: started 9/21; 10% by 10/5 expected. Nothing due yet.
```

### 6.2 Rules engine
- **Rule = data + condition + explanation + action template + evidence spec**, declared in one registry
  (JSON-like objects, not scattered `if`s). Example:
  ```
  { id: 'weekly-contact-missing', severity: 'high', appliesTo: student,
    when: (s, ctx) => ctx.completedWeeks(s).filter(w => !w.contacted && !w.grace && w.schoolDays >= 3),
    explain: (hits, s) => `No student-type ALE contact in the week(s) of ${hits.map(w => w.label)}; last contact ${s.lastContact}`,
    cite: 'WAC 392-550-025(3)', policy: 'district.contact.qualifyingTypes',
    task: { title: 'Contact {student}', due: ctx => ctx.endOfWeek(), actions: ['contact-log', 'meeting', 'arranged-absence', 'snooze'] },
    closesWhen: (s, ctx) => ctx.contactedInWeek(s, hit.week) || ctx.exception(s, hit.week),
    evidence: ['ale.contact.id', 'exception.reason'] }
  ```
- Rules are **pure functions over the normalised model** (Part 9) with a `ctx` that supplies calendar,
  policy thresholds and history, so they can be unit-tested with synthetic students (the QA dataset).
- **Policy layer** separates law from district choice: qualifying contact types, whether a guardian call
  counts, the "week" definition (Sunday–Saturday), grace weeks, escalation steps. Each policy value shows in
  the explanation ("district: student-type contacts only").
- Every rule evaluation produces a **finding** `{ruleId, studentId, firstSeen, lastSeen, facts, explanation}`;
  tasks are created from findings, and a finding that stops firing auto-resolves its task (with the reason).

### 6.3 Priority system
`priority = severity(rule) × urgency(deadline) × exposure(student)`:
- severity: legal deadline (plan due, 20-school-day exclusion risk) > weekly contact > pacing/no-activity > housekeeping;
- urgency: overdue > due today > due this week > no date;
- exposure: consecutive months unsatisfactory, days without contact, expired courses, senior status.
Order is deterministic and the components are shown, so two advisors see the same list for the same data.

### 6.4 Deadline engine
- One `SchoolCalendar` service (already in v147) with `addSchoolDays`, `schoolDaysBetween`, `weekOf`,
  `isSchoolWeek`, break weeks, teacher-answered uncertain days; all modules must call it (the audit found two
  calendars).
- Deadline types: fixed date (MPR window), N school days from an event (plan +5, checkpoint +10, 10% at day 10),
  rolling (weekly contact), consecutive-count (20 school days no contact; 2/3 unsatisfactory months).
- Every deadline stores the **derivation** (`from 9/18 + 5 school days, skipping 9/7`), so the teacher and an
  auditor can see why the date is what it is.

### 6.5 Evidence model
```
Evidence { id, kind: 'ale-contact' | 'attendance-completion' | 'email' | 'phone-note' | 'plan' | 'checkpoint' |
           'mpr' | 'exception' | 'import-row' | 'document', studentId, at, by, source, sourceRef,
           method?, subject?, hash, attachments[] }
```
Contacts carry date, method, subject and who (the WAC fields). Each task lists the evidence kinds that can
close it; closing records the link. Nothing is deleted; corrections append a new version.

### 6.6 Acknowledgment / completion workflow
Task states: `open → in-progress → waiting (snoozed with reason/date) → done (evidence) | resolved-by-data |
exception (reason)`. Every transition records who/when. A task can be *delegated* (to a counselor) inside
staff Messages. Snooze requires a reason and has a maximum (policy). Exceptions are typed (arranged absence,
medical, counselor request, IEP team) — the same list Contact Watch already uses.

### 6.7 Exception handling
- **Data gaps** are first-class findings, not silent zeros: "ALE contact log for the week of 9/13 was not
  pulled" creates a *data* task for the advisor/admin and suppresses contact findings for that week.
- Break weeks and grace windows neutralise weekly rules; a student marked terminal (closed/dropped/archived)
  closes all tasks with "status changed".
- Conflicting sources (Edgenuity says active, ALE says closed) produce a reconciliation task rather than a guess.

### 6.8 Administrator view
Counts by advisor and by rule, overdue items, evidence-gap rate, median time-to-close, students at 15–19 and
20+ school days, plans overdue, MPRs unrecorded; drill-down to names only for oversight roles; export as the
monthly exception report. Reads the same findings/tasks tables — no separate computation.

## Part 7 — "Audit Ready" design

### 7.1 Purpose
One click assembles, per student or per caseload, what an ALE monitor asks for, and says what is missing. It
is an evidence *organiser*, not a compliance certificate.

### 7.2 Packet contents (per student)
| Section | Source in Command Center today | Generated by CC? | Needs another system |
| --- | --- | --- | --- |
| Enrollment history (dates, status changes, courses added/dropped) | Edgenuity import history + ALE enrollment snapshots (IndexedDB) | Yes (diffs across imports) | Official enrollment/withdrawal dates from the SIS |
| Written student learning plan | WSLP checker items (completeness), plan start/end dates from ALE | Partial (checklist only) | The WSLP document itself (ALE Management / SIS) |
| Weekly contacts (date, method, subject, who) | ALE contact log + app check-ins + attendance completions | Yes; week-by-week table with gaps highlighted | Contacts logged outside ALE |
| Monthly progress reviews | Monthly Evaluations ledger, MPR prepared values, submission events | Yes | The signed Laserfiche form (PDF from Laserfiche) |
| Interventions | Plan records (dates, strategies, WAC options, checkpoints, ALE intervention id) | Yes | — |
| Course progress history | Import snapshots (weekly) | Yes; trend table per course | — |
| Responsible certificated teacher | Advisor token / ALE advisor, teacher per course | Yes | Certification status (HR) |
| Communication history | E-mail records (recipients, subject, time), messages | Partial (mailto only, no body) | Sent-mail archive |
| Timestamps / change history | Task transitions, evidence versions, audit log (desktop) | Yes | — |
| Missing-evidence warnings | Rules engine findings | Yes | — |
| Assessment participation | Not tracked | No | SIS / OSPI |

### 7.3 Output
- `AuditPacket_{sid}_{range}.pdf` (cover: student, plan dates, teacher, period; sections above; each item with
  source and timestamp) plus `manifest.json` (source files and hashes, rule versions, generated-at, generated-by)
  and the raw CSV slices, zipped. Caseload mode adds a summary table and an exceptions list.
- Every packet is itself an evidence record (hash) so a later packet can show what changed.

### 7.4 Gaps to close first
Structured **method/subject** on app-recorded contacts (ALE has type + note only), a **document store** for the
signed MPR PDF and WSLP (import or fetch), and **e-mail body capture** at send time (the advisory modal already
has the text; store it).

## Part 8 — MPR automation

### 8.1 Evidence packet prepared before the teacher starts
For each student on the caseload for the month:
1. Course table: progress %, expected (target) %, gap, grade, last activity, active time, target date, projected
   finish (from the last 4 weekly snapshots), expiring-soon flag.
2. Trend since the previous month's report: Δprogress per course, Δgrade, bucket movement, activity days.
3. ALE contacts in the month by week: date / type / author / subject snippet; weeks met vs judged; direct
   personal contact present (yes/no, which).
4. Attendance course weeks completed.
5. Previous MPR: determinations, narrative, submitted date; consecutive-unsatisfactory count.
6. Open intervention plan: strategies, checkpoint results, family involvement.
7. Data-quality notes: missing contact-log weeks, stale Edgenuity data, plan status conflicts.

The packet is computed from the normalised model, cached per `sid|month`, refreshed when data changes, and
persisted (fixing audit M10).

### 8.2 Draft determinations — proposed, never final
- The app proposes *Progress summary* and *Communication status* exactly as today, but labels them **Proposed**
  with the rule that produced them and a one-line "what would change it" (e.g. "one more student-type contact
  this week → Weekly Requirements Met").
- The teacher must click **Confirm** or change the value; unconfirmed rows cannot open the form. This keeps the
  determination with the certificated teacher.
- The narrative draft cites packet facts by id (`[c3]`), so every sentence is traceable; free text the teacher
  adds is kept separately.

### 8.3 Flow
`Packet ready → teacher reviews/edits (bulk confirm allowed for On Target + Met) → open pre-filled form →
submit → recorded (event or "I submitted it") → ledger + Audit Ready + Today card`.
Removed steps: separate "Reload ALE month" (automatic), per-student PDF fetch (batched during packet build),
switching to the Full panel for intervention actions (in the row).

### 8.4 When the teacher marks Unsatisfactory
Automatically: create the intervention task with due = evaluation date + 5 school days, checkpoint = +10 school
days; open the plan draft pre-filled from the packet (behind courses with daily-goal math, contact expectation,
family involvement line); add the family-notification task; if this is the second consecutive month, add
*Review effectiveness of the existing plan* and, on the third, *Program decision required* (policy text from the
district). The teacher writes/approves the plan; the ALE write remains behind the approval dialog. All dates are
shown with their derivation and land on the Today card and Reminder Center.

## Part 9 — "Command Center Brain" architecture

### 9.1 Layers
```
Sources        Edgenuity CSV/PDF · ALE contact log/enrollment · Students report · Laserfiche events · IEP PDFs · calendar
                       │  importers (schema-detected, validated, versioned)            │  desktop watchers (Downloads, ALE sync)
Normalisation  ──────► Canonical model in SQLite (already the desktop store): Student, Enrollment, CourseSnapshot,
                       Contact, Evaluation, Plan, Checkpoint, Task, Evidence, Import, CalendarDay, Policy
Rules          ──────► Rule registry (pure functions) + Policy (district) + SchoolCalendar service
Detection      ──────► Findings (idempotent per rule+student+key), change events (roster/pacing/status diffs)
Action         ──────► Task engine (create/update/close), draft generator (templates + optional local AI),
                       reminder scheduler, packet builders (MPR, Audit Ready, exception report)
Review         ──────► Work queue UI: approve / modify / complete / snooze / exception; bulk actions
Evidence       ──────► Append-only event log (hash-chained), evidence links, exports
```

### 9.2 Data model (SQLite, one file, encrypted as today)
- `student(sid, name, grade, school, counselor, advisor, status, plan_start, plan_end, source_refs)`
- `enrollment(id, sid, course, teacher, start, target, status, first_seen_import, last_seen_import)`
- `course_snapshot(import_id, enrollment_id, progress, target_progress, pacing, grade, last_entry, active_secs, assignment_status)`
- `contact(id, sid, at, type, author, subject, note_hash, source, source_ref, qualifies)`
- `evaluation(sid, month, progress_summary, comm_status, status, proposed_json, confirmed_by, confirmed_at, submitted_at)`
- `plan(id, sid, month, due, strategies, options, family, checkpoint_date, checkpoint_result, ale_id, status)`
- `finding(id, rule_id, sid, key, first_seen, last_seen, facts_json, explanation)`
- `task(id, finding_id, sid, title, priority, due, state, owner, snooze_until, reason, created, updated)`
- `evidence(id, kind, sid, at, by, source, ref, hash, task_id)`
- `event(seq, at, actor, type, payload_json, prev_hash, hash)` (append-only)
- `import(id, kind, file_name, file_hash, rows, imported_at, snapshot_date, warnings_json)`
- `calendar_day(date, is_school_day, label, source)`, `policy(key, value_json, set_by, at)`

The renderer keeps its IndexedDB stores during migration (the desktop already mirrors student data to SQLite);
the Brain reads the SQLite model only, so the HTML modules can be migrated one at a time.

### 9.3 Where it runs
- A `utilityProcess` (Electron) owns the SQLite model and runs the evaluation loop: on import, on ALE pull, on a
  timer (school-day mornings), on calendar/policy change. It exposes IPC: `brain:findings`, `brain:tasks`,
  `brain:packet`, `brain:act`. Heavy work stays off the UI thread.
- Determinism: a run is `evaluate(modelSnapshotHash, rulesVersion, policyVersion, calendarVersion, today)` and
  writes an `evaluation_run` event; identical inputs produce identical findings (testable in CI with the
  synthetic dataset).

### 9.4 Rule and action contracts
```ts
interface Rule { id; version; scope: 'student'|'enrollment'|'caseload'; cite?; policyKeys: string[];
  evaluate(ctx: Ctx, subject): Finding[]; taskFor(f: Finding): TaskSpec; closesWhen(ctx, f): boolean }
interface TaskSpec { title; priority; due?; actions: ActionId[]; evidenceKinds: string[]; explanation }
interface Action { id; run(ctx, task): Promise<ActionResult> }   // contact-log → ALE queue; draft-email → preview modal; write-plan → plan editor
```
Drafts are generated by templates first; the local model, when present, only rewrites tone using packet facts
and must return the fact ids it used (grammar-constrained JSON), otherwise the template stands.

### 9.5 Migration path from 0.2.46
1. Extract the calendar, sid, bucket and contact-qualification helpers into one shared module (removes the
   inconsistencies in the audit). 2. Write the SQLite schema and a one-way sync from the current IndexedDB/localStorage
   stores. 3. Port rules one at a time (Contact Watch → weekly-contact rule; WAC panel → plan deadlines; worklist →
   priority), keeping the old UI until the queue UI covers it. 4. Ship the queue as a new panel beside Today; retire
   Reminder Center / Worklist when parity is reached. 5. Add packets (MPR, Audit Ready). 6. Add scheduled runs.


---

## Parts 10 and 11 — Local AI and what other products do

Prepared 2026-09-25 for the Command Center product-design report. Sources are web-search snippets (the egress proxy blocked direct fetches of leg.wa.gov, ospi.k12.wa.us, huggingface.co, imaginelearning.com and geniuslearning.com), so vendor claims are marked **[vendor copy]** where they come from marketing pages. "Command Center today" is taken from the v0.2.46 QA audit in this repository (`QA-AUDIT.md`).

---

### Part 11 — What other products do

#### 11.1 The compliance frame Command Center serves

Washington's ALE rules (chapter 392-550 WAC, effective August 2020; WAC 392-121-182 now covers only enrollment reporting) require, per student: a written student learning plan; **weekly contact** with a certificated teacher (direct personal contact = one-to-one, two-way, documented, by phone/e-mail/IM/video allowed; or synchronous digital instructional contact); a **monthly progress evaluation** with a satisfactory/unsatisfactory determination; an **intervention plan within five school days** of an unsatisfactory evaluation, developed by a certificated teacher with the student (and parent for K–8); a redesigned course of study after **three consecutive months** of unsatisfactory progress despite documented intervention; and exclusion from the monthly count after **20 consecutive school days** without certificated-teacher contact. Sources: [WAC 392-550-025](https://app.leg.wa.gov/wac/default.aspx?cite=392-550-025), [WAC 392-121-182](https://apps.leg.wa.gov/WAC/default.aspx?cite=392-121-182), [OSPI Guide to Offering ALE (July 2024)](https://ospi.k12.wa.us/sites/default/files/2024-09/publication-guide-offering-ale.pdf), [OSPI ALE self-assessment](https://ospi.k12.wa.us/sites/default/files/2026-01/ale_self_assessment.pdf).

The enforcement mechanism is the State Auditor. SAO's ALE special reports found problems at 52 of 67 districts audited for FY2011 with ~$27M in possible overpayments, and individual findings cite "monthly progress reviews that were not performed" and non-compliant learning plans as the reason FTE was over-reported ([SAO ALE special report](https://portal.sao.wa.gov/ReportSearch/Home/ViewReportFile?arn=1013651&isFinding=false), [SAO finding example](https://portal.sao.wa.gov/ReportSearch/Home/ViewReportFile?arn=1014023&isFinding=true&sp=false), [SAO ALE capstone](https://portal.sao.wa.gov/ReportSearch/Home/ViewReportFile?amp=&amp=&arn=1021126&isFinding=false&sp=false), [OSPI "What is an ALE Compliance Review?"](https://ospi.k12.wa.us/sites/default/files/2023-08/what_is_an_ale_compliance_review.pdf)). Audits are file reviews, remote or on-site. **No commercial product surfaced in this research is built around these specific WAC clocks**; every category below approximates one piece of the job.

#### 11.2 Categories and representative products

**A. Early-warning / student-success platforms**

- **Panorama Student Success** — EWS + MTSS tracker over the "ABCs" (attendance, behavior, coursework). Intervention records carry type, goal, timeline, strategy picked from a customizable menu, an assigned adult "champion", and a progress-monitoring method; shared team notes; leadership dashboards for chronic absence, interventions, strategic goals and custom reports; SIS/assessment/survey integration. ([Panorama KB](https://academy.panoramaed.com/articles/8832654532-what-is-panorama-student-success), [product page — vendor copy](https://www.panoramaed.com/products/student-success), [integrations](https://www.panoramaed.com/products/student-success/integrations)). *CC lacks:* a structured intervention object with champion/goal/monitoring method, and role dashboards above the advisor.
- **SchoolStatus Attend** — predictive "Early Warning Insights" after 60 school days; automated tiered outreach by mail, SMS (130+ languages) and digital channels; "every intervention is logged automatically, creating a complete record of what was sent, when, and to whom" for board questions ([SchoolStatus EWS](https://www.schoolstatus.com/blog/identify-at-risk-students-before-they-become-chronically-absent), [automated outreach — vendor copy](https://www.schoolstatus.com/blog/automated-family-outreach-attendance-data)). *CC lacks:* delivery-tracked communication log (CC sends `mailto:` letters, so it cannot know if anything was delivered or opened).
- **Infinite Campus Early Warning (Campus Analytics Suite)** — statistical graduation-risk model using attendance, behavior, academics and "stability" factors (address changes, time in district, parent portal use), housed in the SIS so the full history is in scope ([KDE overview](https://www.education.ky.gov/educational/int/Pages/EarlyWarningAndPersistenceToGraduation.aspx), [Campus Analytics Suite](https://www.infinitecampus.com/products/campus-analytics-suite)). *CC lacks:* any longitudinal history beyond snapshots of Edgenuity imports.
- **PowerSchool MTSS** — personalized plans, Tier 1–3 assignment/scheduling/documentation, goal tracking, "Learner Variability Navigator" strategy library; 1EdTech certified ([PowerSchool MTSS](https://www.powerschool.com/products/student-interventions/mtss/), [1EdTech cert](https://site.imsglobal.org/certifications/powerschool-group-llc/powerschool-mtss)).
- **Otus** — combines gradebook, assessment, progress-monitoring graphs, tiered plans with frequency/fidelity, AI risk flags, family view of intervention progress; roster sync via Clever/ClassLink/OneRoster/CSV ([Otus progress monitoring](https://otus.com/platform/progress-monitoring), [Otus family engagement — vendor copy](https://otus.com/solutions/family-engagement), [Otus SIS integrations](https://help.otus.com/en/articles/1816923-sis-integrations-with-otus)).
- BrightBytes/Clarity was not researched in depth; it is now part of the SchoolStatus family per general knowledge and is not cited here.

**B. MTSS / intervention platforms**

- **Branching Minds** — library of "hundreds of evidence-based interventions", scaffolded support-plan workflow, progress-monitoring graphs with goal line, trend line and calculated Rate of Improvement, plan-fidelity tracking, documentation of services by all staff ([Branching Minds progress monitoring](https://www.branchingminds.com/blog/intervention-plan-progress-monitoring-mtss-platform), [platform — vendor copy](https://www.branchingminds.com/explore-branching-minds-platform), [MTSS management](https://www.branchingminds.com/mtss-management)). *CC lacks:* intervention library, measurable goal with ROI, fidelity log.
- **eduCLIMBER (Renaissance, ex-Illuminate)** — intervention tracking with fidelity, progress-monitoring analysis, effectiveness reporting, Observations module, FastBridge integration ([Renaissance eduCLIMBER](https://www.renaissance.com/products/actionable-insights/educlimber/), [FastBridge integration](https://www.renaissance.com/product_update/new-fastbridge-and-educlimber-integration-streamlines-intervention-and-progress-monitoring-workflows/)). Illuminate DnA adds an EWS feeding the RtI/MTSS module ([DnA](https://www.illuminateed.com/products/dna/)); SchoolCity is Renaissance's assessment builder, not an intervention tool ([SchoolCity](https://www.renaissance.com/products/assessment/schoolcity/)).
- **Kickboard → PowerSchool Behavior Support** — real-time behavior logging, Behavior Intervention Plans that are created, tracked, evaluated and adjusted ([Kickboard RTI release](https://www.businesswire.com/news/home/20160307005236/en/With-Kickboard%E2%80%99s-New-RTI-System-Teachers-Can-Easily-Create-Monitor-and-Update-Behavior-Intervention-Plans), [PowerSchool acquisition](https://www.powerschool.com/kickboard/)).
- **Intervention Compass** — "guides and prompts teachers for applying timely support", tracks efficacy, data walls, and is the repository for PLC and parent-conference reporting ([Intervention Compass — vendor copy](https://www.interventioncompass.com/), [EdTech Digest](https://www.edtechdigest.com/2022/08/19/intervention-compass/)). *Pattern worth copying:* prompts/nudges to the teacher rather than a passive dashboard.

**C. Online / virtual-school management systems**

- **Genius SIS / Genius Class (Genius Learning)** — built for rolling enrollment and dynamic pacing; admin-configured Pacing/Activity/Grades colour bands; logins and attendance heat-maps; **every e-mail is logged in a communication log**; trigger-based automated e-mails to targeted groups; a "coach" role scoped to assigned learners; audit trails and role-based access; LMS integrations (Open LMS, Buzz, Edgenuity SIS guide) ([Genius Core Features](https://geniussis.zendesk.com/hc/en-us/articles/360001264971-Core-Features-Overview), [Class+ student profiles](https://geniussis.zendesk.com/hc/en-us/articles/26715527534349-Student-Profiles-in-Class-for-Teachers), [Genius FAQ — vendor copy](https://geniuslearning.com/education-management-system-faq/), [Edgenuity SIS admin guide](https://files.edgenuity.com/help_center/instructional_services/program-lead-admin-SIS-Guide.pdf)). This is the closest commercial analogue to CC's job; it is server-hosted and district-licensed.
- **Agilix Buzz** — LMS positioned for virtual/blended/mastery/mentored models; formative and remediation assessments; used by many virtual schools ([Agilix Buzz — vendor copy](https://www.agilix.com/products/buzz), [Virtual schools on Buzz](https://support.agilix.com/hc/en-us/articles/115001060966-Virtual-Schools-on-Agilix-Buzz)).
- **Pearson Connexus** — 700+ courses, auto-graded work feeding the gradebook, family/learning-coach portals ([Pearson platform — vendor copy](https://www.pearson.com/en-us/schools/products-services/k12-online-schools/platform.html)).
- **Stride/K12 (WAVA via Omak SD; Insight School of Washington via Quillayute Valley SD)** — Stride's own platform; "Class Connect" live sessions, progress reports, Learning Coach role; Stride Learning Solutions is also an OSPI-listed course provider ([WAVA](https://www.k12.com/washington-online-schools/), [ISWA](https://insightwa.k12.com/about-our-school/), [OSPI Stride provider sheet](https://ospi.k12.wa.us/sites/default/files/2023-08/stride-learning-solutions_cp.pdf)). Their internal compliance tooling is not public.
- **Edmentum EdOptions Academy** — virtual teachers, success coaches, pacing and progress-monitoring tools, an "Instructional Engagement Model" document ([EdOptions Academy — vendor copy](https://www.edmentum.com/products/edoptions-academy/), [engagement model 2025-26](https://www.edmentum.com/resources/brochures/edoptions-academy-instructional-engagement-model-at-a-glance/)).
- **Imagine Edgenuity (the source CC imports)** — Progress Report (completion %, activity scores, target date, daily goal), Student Session Log (login times), Course Report, real-time alerts, sortable/exportable reports ([Progress report overview](https://help.imagineedgenuity.com/hc/en-us/articles/1500004680021-Progress-report-overview), [Session Log](https://help.imagineedgenuity.com/hc/en-us/articles/360043035293-Understanding-the-Student-Session-Log), [Data & Reports summary PDF](https://content.imaginelearning.com/pdAssets/imagineEdgenuity/imagineEdgenuity_dataAndReportsSummary.pdf)). Edgenuity gives pace and time-on-task but nothing about WAC contact, evaluations or interventions.

**D. Attendance / compliance and Washington-specific tooling**

- **PowerSchool Attendance Intervention (ex-Kinvolved)** — two-way family texting with auto-translation, tiered message templates, chronic-absence tiers, daily digests, attendance letters/certificates; ESSA evidence listing ([Evidence for ESSA](https://www.evidenceforessa.org/program/powerschool-unified-operations-attendance-intervention-suite-formerly-kinvolved/), [PowerSchool page — vendor copy](https://www1.powerschool.com/solutions/student-success/attendance-intervention/)). *Pattern:* tier → template → delivery record.
- **Washington-specific:** no public "ALE module" for Skyward Qmlativ, Alma or Qmlativ surfaced ([Skyward Qmlativ](https://www.skyward.com/qmlativ)); OSPI publishes *sample forms* for WSLP, monthly evaluation and intervention plans and says programs may build their own ([OSPI ALE page](https://ospi.k12.wa.us/student-success/learning-alternatives/alternative-learning-experience)). District programs (Pasco Digital Learning Academy, Kennewick's Endeavor, Wapato Online Academy, Columbia Virtual Academy, Kelso Virtual Academy) publish contact expectations but not their tooling ([PDLA](https://pdla.psd1.org/), [Wapato](https://www.wapatosd.org/apps/pages/index.jsp?uREC_ID=2819810&type=d&pREC_ID=2316693), [CVA](https://www.cva.org/)). The realistic competitor for CC is therefore **a spreadsheet plus the district's forms system** (Pasco uses Laserfiche forms, per the QA audit), not a product.

#### 11.3 Where a local-first, teacher-owned, ALE-specific tool differentiates

1. **No server, no DPA.** Every product above is SaaS and needs a district data-privacy agreement and SIS integration project. CC runs on the advisor's laptop with SQLite and local backups; student data never leaves the device except through the district's own e-mail and Laserfiche. OSPI's Human-Centered AI guidance says staff should never put education-record data into systems not vetted for FERPA/COPPA/CIPA ([OSPI AI guidance ed. 2](https://ospi.k12.wa.us/sites/default/files/2024-04/human-centered-ai-guidance-k-12-edition-2.pdf)); a fully local tool sidesteps the question.
2. **WAC clocks as first-class objects.** CC already computes 15–19 / 20+ school-day no-contact views, monthly-evaluation deadlines ("4 working days left") and intervention due dates against a school calendar. None of the MTSS products encode "5 school days after the evaluation" or "3 consecutive unsatisfactory months". Make these explicit, explainable rules with the WAC citation on screen.
3. **One-click audit packet.** SAO reviews are file reviews. A per-student, per-month PDF/ZIP containing the contact log (with method and two-way evidence), the evaluation, the determination rationale, the intervention plan and its checkpoint reviews — plus a program-level index — is something no general product produces and is the artefact auditors ask for.
4. **Evidence, not just logs.** Genius and SchoolStatus log *sent* messages; WAC needs *two-way* contact. CC can record the reply (paste/voice note via the bundled Whisper) and mark the week satisfied only on two-way evidence.
5. **Teacher-owned work queue.** Intervention Compass's "prompt the teacher" model fits a single advisor better than district dashboards: a daily queue ordered by WAC risk (contact overdue → evaluation due → intervention due → checkpoint due), each row with one primary action — the same shape the QA audit recommended for the MPR wizard.

#### 11.4 Concept table

| Concept | Seen in | Why it matters for ALE staff | Command Center today | Differentiation opportunity |
|---|---|---|---|---|
| Work queue / "next action" prompts | Intervention Compass; SchoolStatus tiers | Advisors juggle weekly, monthly and 5-day clocks for 20–60 students | Quick Views and Today card, but many parallel tiles and modules (QA §4) | Single WAC-ordered queue with one primary action per row and a "why" line citing the WAC clause |
| Case / intervention object with goal, owner, monitoring method, fidelity | Panorama, Branching Minds, eduCLIMBER, PowerSchool MTSS | WAC 392-550-025(4) intervention plans must be documented and *implemented*; 3-month rule needs history | Intervention plan lives in Monthly Evaluations panel; checkpoint review exists but unlinked from wizard | Plan = goal + strategies (small local library) + checkpoint dates + evidence; auto-count consecutive unsatisfactory months |
| Family communication log with delivery tracking | SchoolStatus, PowerSchool Attendance Intervention, Genius comm log | Audit needs proof of contact attempts and of two-way contact | `mailto:` letters, no send/delivery record beyond the contact log import | Local outbox: log every letter with template id, recipient, timestamp; capture replies; mark two-way vs one-way explicitly |
| Tiered intervention / strategy library | Branching Minds, PowerSchool Learner Variability Navigator | Speeds plan writing; consistency across advisors | None; narrative generated by AI helper | Small, editable, offline library of ALE-appropriate strategies (pacing contracts, synchronous sessions, course swaps) |
| Progress-monitoring goals with trend | Branching Minds ROI graphs, Otus graphs | Shows whether the intervention worked before month 3 | Weekly snapshot compare (pace deltas) | Per-plan goal line from Edgenuity pace/completion snapshots; flag "not on track" before the next evaluation |
| Automated letters by tier, translated | PowerSchool Attendance Intervention, SchoolStatus | Families of ALE students are often reached only by e-mail | Per-Quick-View letter templates (fixed in QA C4/M4) | Tier-aware templates keyed to WAC state; optional local-model translation with human review |
| Audit / evidence export | SchoolStatus "record already there"; Genius audit trails | SAO file reviews; OSPI compliance reviews | Excel/CSV exports, Advisor Contact Audit module | One-click per-student/per-month audit packet (PDF+CSV+hash manifest) |
| Role dashboards | Panorama leadership dashboards, Infinite Campus EWS | Program leads must see caseload coverage | Single advisor view; advisor code filter | Local "program lead" view built from advisors' exported packets (no server) |
| SIS / LMS sync | Genius (LMS), Otus (Clever/OneRoster), PowerSchool | Reduces re-keying | Edgenuity CSV import, ALE web sync, Laserfiche pre-fill | Keep import-based; add Skyward export parsing and a stable student-id crosswalk |
| Explainable determinations | (none encode WAC) | Auditors ask "why satisfactory?" | Determination rules explained in MPR Full panel | Show the rule, the inputs, and the WAC cite on every determination; AI never chooses it (see 10.6) |

---

### Part 10 — Local / offline AI for the advisor's laptop

Target hardware: Windows laptops with 8–16 GB RAM, integrated Intel graphics or none, occasionally 32 GB with an NVIDIA GPU. Command Center already bundles **node-llama-cpp** with **Qwen2.5-1.5B-Instruct Q4_K_M** and **transformers.js** for Whisper.

#### 10.1 Frameworks

| Framework | What it gives an Electron app | Fit for CC |
|---|---|---|
| **node-llama-cpp** (MIT) | Native llama.cpp bindings for Node/Electron; prebuilt CPU, CUDA, Vulkan (Windows/Linux) and Metal binaries; auto-selects backend; JSON-schema-enforced output and GBNF grammars at token level; function calling; must ship unpacked from asar ([GitHub](https://github.com/withcatai/node-llama-cpp), [Electron guide](https://node-llama-cpp.withcat.ai/guide/electron), [CUDA guide](https://node-llama-cpp.withcat.ai/guide/CUDA), [grammar guide](https://node-llama-cpp.withcat.ai/guide/grammar)) | **Keep.** Already integrated; Vulkan binary covers Intel iGPUs and CUDA binary covers the 32 GB/NVIDIA case with no user install. |
| **llama.cpp direct** (MIT) | Same engine via `llama-server` or CLI; SYCL/Vulkan for Intel GPUs; JSON-schema→GBNF converter ([grammars README](https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md), [SYCL backend](https://github.com/ggml-org/llama.cpp/blob/master/docs/backend/SYCL.md), [Intel guide](https://www.intel.com/content/www/us/en/developer/articles/technical/run-llms-on-gpus-using-llama-cpp.html)) | Only if CC needed a sidecar process; no advantage over the bindings. |
| **Ollama** | MIT CLI/server; separate install; its own model store and registry; the newer GUI app is under a different license ([LICENSE](https://github.com/ollama/ollama/blob/main/LICENSE), [issue 11634](https://github.com/ollama/ollama/issues/11634), [issue 8218](https://github.com/ollama/ollama/issues/8218)) | Not recommended: extra install on managed laptops, background service, model pulls from ollama.com. |
| **onnxruntime-genai / Foundry Local** | Microsoft's ONNX pipeline; int4 CPU builds of Phi-4-mini; Foundry Local SDK is MIT and has an npm package, the CLI is under Microsoft Software License Terms; runs on any DX12 GPU; Windows ML routes to NPU/GPU/CPU ([onnxruntime-genai](https://github.com/microsoft/onnxruntime-genai), [Phi-4-mini ONNX](https://huggingface.co/microsoft/Phi-4-mini-instruct-onnx), [foundry-local-sdk npm](https://www.npmjs.com/package/foundry-local-sdk), [Windows ML](https://learn.microsoft.com/en-us/windows/ai/new-windows-ml/overview)) | Viable second backend for Phi models; adds a second runtime and model format. Defer. |
| **transformers.js** (Apache-2.0) | WebGPU or WASM in the renderer; Whisper works well; LLM decode on WASM is slow (Qwen3-1.7B ~28 tok/s WebGPU on an RTX 4090 vs ~3 tok/s WASM, per a third-party write-up) ([Transformers.js v3](https://www.huggingface.co/blog/transformersjs-v3), [WebGPU write-up](https://vucense.com/dev-corner/webgpu-browser-llm-2026/)) | Keep for Whisper only. |
| **WebLLM** (Apache-2.0) | WebGPU engine, ~80% of native per its paper; Electron on Windows reported multi-minute shader compilation ([paper](https://arxiv.org/abs/2412.15803), [issue 621](https://github.com/mlc-ai/web-llm/issues/621)) | Not for CPU-only laptops. |
| **Windows AI Foundry / Phi Silica** | OS-managed 3.3B SLM via Windows App SDK; originally Copilot+ NPU only, now also GPU on non-Copilot+ PCs; WinRT API, so Electron needs a native bridge ([Phi Silica](https://learn.microsoft.com/en-us/windows/ai/apis/phi-silica), [transparency note](https://learn.microsoft.com/en-us/windows/ai/apis/phi-silica-transparency-note), [Copilot+ dev guide](https://learn.microsoft.com/en-us/windows/ai/npu-devices/)) | Optional future path when the fleet is Copilot+; not today. |
| **AMD / Apple NPU** | AMD NPU is not in mainline llama.cpp (goes through ONNX Runtime GenAI); llama.cpp/MLX use Apple GPU via Metal, not the Neural Engine ([llama.cpp issue 14377](https://github.com/ggml-org/llama.cpp/issues/14377), [Ryzen AI docs](https://ryzenai.docs.amd.com/en/latest/llm/overview.html), [Core ML vs MLX](https://cactuscompute.com/compare/coreml-vs-mlx)) | Ignore NPUs; rely on CPU/iGPU/CUDA. |

#### 10.2 Candidate models

Sizes are Q4_K_M GGUF on disk (~); RAM = weights + KV cache + runtime. KV-cache figures are my estimates from published architectures (fp16 cache; halve with q8 cache). Tokens/sec are third-party reports and vary widely with CPU generation; CC must benchmark in-app.

| Model | License (commercial redistribution) | Q4_K_M size | Context | Reported CPU speed | Notes for CC |
|---|---|---|---|---|---|
| **Qwen2.5-1.5B-Instruct** (current) | Apache-2.0 ([LICENSE](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/blob/main/LICENSE)) | ~1.0 GB | 32K (128K family) | ~30–60 tok/s on M1 for Qwen2-1.5B-class ([benchmark post](https://singhajit.com/llm-inference-speed-comparison/)) | KV ≈ 28 KB/token (~230 MB at 8K). Weak at multi-constraint instructions; fine for short drafts from a fact list. |
| **Qwen2.5-3B-Instruct** | **Qwen Research License, non-commercial** ([LICENSE](https://huggingface.co/Qwen/Qwen2.5-3B/blob/main/LICENSE), [discussion](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/discussions/1)) | ~2.0 GB | 32K | — | **Do not ship.** |
| **Qwen2.5-7B-Instruct** | Apache-2.0 ([Qwen2.5 blog](https://qwenlm.github.io/blog/qwen2.5-llm/)) | ~4.7 GB | 128K | GPU class | 32 GB/NVIDIA tier only. |
| **Qwen3-0.6B / 1.7B / 4B** (and 4B-Instruct-2507 non-thinking) | Apache-2.0, all sizes ([Qwen3 GitHub](https://github.com/qwenLM/qwen3), [Qwen3-4B-Instruct-2507](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507)) | 1.7B ~1.1 GB; 4B ~2.5 GB | 32K (4B-2507: 256K) | 1.7B 25–40 tok/s on N100/i5-1235U-class ([CPU guide](https://www.promptquorum.com/local-llms/fastest-local-llms-low-end-pcs)) | Use the 2507 Instruct checkpoints or `enable_thinking=false` to avoid `<think>` output ([Ollama issue 12917](https://github.com/ollama/ollama/issues/12917)). Strong tool/JSON priors. |
| **Qwen3.5 0.8B / 2B / 4B** (Mar 2026) | Apache-2.0 ([Unsloth guide](https://unsloth.ai/docs/models/qwen3.5), [Enclave summary](https://enclaveai.app/blog/2026/03/08/qwen-3-5-complete-model-family-local-ai/)) | 4B 2.74 GB ([unsloth GGUF](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/blob/main/Qwen3.5-4B-Q4_K_M.gguf)) | 262K | not yet benchmarked | Multimodal; llama.cpp support new; wait for stable node-llama-cpp support. |
| **Llama 3.2 1B / 3B Instruct** | Llama 3.2 Community License: must ship license copy, display "Built with Llama", 700M-MAU cap, "Llama" naming for derivatives ([license](https://www.llama.com/llama3_2/license/)) | 1B ~0.8 GB ([hugging-quants](https://huggingface.co/hugging-quants/Llama-3.2-1B-Instruct-Q4_K_M-GGUF)); 3B ~2.0 GB | 128K | 3B ~20–30 tok/s extrapolated from 8B Q4 at 14 tok/s ([Markaicode CPU bench](https://markaicode.com/benchmarks/tool-cpu-benchmark/)) | Legal overhead for a product sold to districts; Apache/MIT alternatives are as good. |
| **Phi-4-mini-instruct (3.8B)** | MIT ([HF card](https://huggingface.co/microsoft/Phi-4-mini-instruct-onnx), [Artificial Analysis](https://artificialanalysis.ai/models/phi-4-mini)) | ~2.5 GB ([Q4_K_M repo](https://huggingface.co/harisnaeem/Phi-4-mini-instruct-GGUF-Q4_K_M)) | 128K | ~12 tok/s reported on a modern CPU ([CPU-only guide](https://www.promptquorum.com/local-llms/best-cpu-only-llm)) | Strong English reasoning/math; IFEval ~70 per its report ([tech report](https://arxiv.org/pdf/2503.01743)); ONNX int4 path available. |
| **Gemma 3 1B / 4B** | Gemma Terms + Prohibited Use Policy; Google reserves right to restrict use "remotely or otherwise" ([terms](https://ai.google.dev/gemma/terms), [policy](https://ai.google.dev/gemma/prohibited_use_policy)) | 1B ~0.8 GB; 4B ~2.5 GB | 32K / 128K | 4B sub-10 tok/s CPU class | Gemma 3 4B reports 0.902 IFEval ([llm-stats compare](https://llm-stats.com/models/compare/gemma-3-4b-it-vs-phi-4-mini)) but one multilingual benchmark found it the highest hallucination rate ([MUCH](https://arxiv.org/pdf/2511.17081)). Terms are a procurement question. |
| **Gemma 4 E2B / E4B** (Apr 2026) | **Apache-2.0** ([Google blog](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/), [gHacks](https://www.ghacks.net/2026/04/06/google-releases-gemma-4-in-four-model-sizes-under-apache-2-0-license/)) | E2B ~2.3B effective; E4B ~4.5B | large | new | Removes the Gemma-terms objection; verify llama.cpp/node-llama-cpp maturity. |
| **SmolLM2-1.7B / SmolLM3-3B** | Apache-2.0 ([SmolLM2](https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct), [SmolLM3](https://huggingface.co/HuggingFaceTB/SmolLM3-3B)) | 1.7B ~1.0 GB; 3B ~1.9 GB | 8K / 64K | similar to Qwen at size | Fully open training; SmolLM2's 8K context is tight for long fact lists. |
| **Granite 4.0 Micro (3B) / H-Tiny (7B, 1B active)** | Apache-2.0; signed weights; ISO 42001 ([IBM Granite](https://www.ibm.com/granite/docs/models/granite), [micro GGUF](https://huggingface.co/ibm-granite/granite-4.0-micro-GGUF), [h-tiny GGUF](https://huggingface.co/ibm-granite/granite-4.0-h-tiny-GGUF)) | Micro ~2 GB; H-Tiny ~4.5 GB | 128K | H-Tiny fast for its size (1B active) | Enterprise provenance story (signed, certified) is attractive for district procurement. |
| **Ministral 3B / 8B** | Mistral Research License; commercial license on request ([Mistral](https://mistral.ai/news/ministraux/)) | — | 128K | — | **Do not ship** without a contract. Mistral Small 3 is Apache-2.0 but 24B ([Mistral Small 3](https://mistral.ai/news/mistral-small-3/)) — too large for the fleet. |

Quality for CC's tasks (summarising a structured student record; drafting a family e-mail): all ≥3B models handle it when the prompt supplies every fact; 1–2B models drift on tone constraints and occasionally invent a date or number, which is why grounding and post-checks (10.3) matter more than model choice. The Phi-3 report notes that tiny models "do not have the capacity to store much factual knowledge" ([Phi-3 report](https://arxiv.org/pdf/2404.14219)) — for CC that is a feature: the model should never be asked to *know* anything, only to *rephrase* supplied facts.

#### 10.3 Grounded generation, constrained output, evaluation

**Prompt pattern (fact-ID grounding).** Serialize the record as numbered facts (`[F1] Last two-way contact 2026-09-18 (phone)`, `[F2] Algebra 1: 42% complete, 9 points behind pace`, …), then instruct: use only the facts; cite the fact id after every sentence that uses one; if a needed fact is missing, write `[MISSING: …]` rather than guessing; no evaluation of satisfactory/unsatisfactory; specified audience and length. This is the standard "grounded generation" recipe ([ZeroEntropy](https://zeroentropy.dev/concepts/grounded-generation/), [grounding techniques](https://prompt-architects.com/blog/618-grounding-techniques-keeping-ai-tied-to-your-facts)). Because CC's determinations already come from deterministic rules, the model receives the determination as a fact and never derives it.

**Constrained output.** llama.cpp GBNF grammars restrict sampling to valid tokens; node-llama-cpp converts a JSON schema (subset) to a grammar and enforces it at generation time, but the docs warn the model "isn't aware of the entire schema", so the schema must also be described in the prompt ([node-llama-cpp grammar guide](https://node-llama-cpp.withcat.ai/guide/grammar), [llama.cpp grammars](https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md), [constrained decoding overview](https://www.aidancooper.co.uk/constrained-decoding/)). Recommended schema for a draft: `{ "subject": string, "body": string, "citations": [factId], "missing": [string] }`. Grammar guarantees shape, not truth.

**Evaluation of narrative drafts.** (a) Deterministic checks in CC: every date, percentage, course name and person name in `body` must occur in the fact set (regex extraction), every sentence must carry a citation, banned phrases ("unsatisfactory", "will be withdrawn") absent unless present as a fact. (b) NLI-based faithfulness: SummaC / AlignScore-style sentence entailment, which correlate with human judgement and can run on a small cross-encoder locally ([SummaC](https://www.researchgate.net/publication/358553684_SummaC_Re-Visiting_NLI-based_Models_for_Inconsistency_Detection_in_Summarization), [faithfulness metrics review](https://arxiv.org/abs/2501.00269), [clinical summary evaluation using nli-deberta-v3-small](https://arxiv.org/html/2607.09932)); Vectara's HHEM-2.1-Open is an open hallucination classifier for summaries ([HHEM 2.1](https://www.vectara.com/blog/hhem-2-1-a-better-hallucination-detection-model), [leaderboard](https://github.com/vectara/hallucination-leaderboard)). (c) Offline regression suite: the synthetic cases already in `qa/sample-data/` become a gold set; each model/prompt change is scored on citation coverage, unsupported-claim rate and reading level before release. (d) Human: the advisor edits every draft; log edit distance as a quality signal.

#### 10.4 Privacy and provenance posture

- **Data never leaves the device.** node-llama-cpp is in-process; no network calls. Document this and add a runtime egress assertion (block outbound sockets from the inference worker). This is the posture OSPI's guidance implicitly asks for when it forbids entering education-record data into unvetted AI systems ([OSPI AI guidance](https://ospi.k12.wa.us/sites/default/files/2024-04/human-centered-ai-guidance-k-12-edition-2.pdf)).
- **Model provenance.** Pin the exact GGUF, record its SHA-256 from the Hugging Face LFS metadata, and verify on download and on every load; several desktop tools historically skipped this ([openweb-ui-desktop issue](https://github.com/ggrace519/openweb-ui-desktop/issues/34), [verification guide](https://drforbin.ai/guides/verify-downloads/)). GGUF chat templates are executable Jinja and were shown to carry injected instructions (Pillar Security, June 2025, via [markaicode summary](https://markaicode.com/usecases/ai-model-supply-chain-security/)): ship CC's own chat template rather than trusting file metadata. Granite's signed weights are an example of vendor-side provenance ([IBM Granite](https://www.ibm.com/granite/docs/models/granite)).
- **Antivirus / SmartScreen.** GGUF files are data, not executables; the real false-positive risk is the unsigned Electron installer and the native llama binaries. Sign with an OV/EV certificate (EV gives immediate SmartScreen reputation) and ship the model inside the signed installer or from a district-approved URL ([Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing), [Advanced Installer on SmartScreen](https://www.advancedinstaller.com/prevent-smartscreen-from-appearing.html), [Defender false-positive handling](https://learn.microsoft.com/en-us/defender-endpoint/defender-endpoint-false-positives-negatives)). Keep model files out of `Downloads` and out of the Electron asar (required anyway for node-llama-cpp).
- **Inference in a worker.** Run the model in a utility process with a memory ceiling so a 4B model on an 8 GB laptop fails gracefully instead of freezing the dashboard.

#### 10.5 Comparison and recommendation

| # | Combo | Weights | RAM at 8K ctx (est.) | License | Best for |
|---|---|---|---|---|---|
| 1 | node-llama-cpp + **Qwen2.5-1.5B-Instruct Q4_K_M** (current) | 1.0 GB | ~1.5 GB | Apache-2.0 | 8 GB CPU-only baseline; short drafts |
| 2 | node-llama-cpp + **Qwen3-1.7B (non-thinking) Q4_K_M** | 1.1 GB | ~1.8 GB | Apache-2.0 | 8 GB; better JSON/instruction adherence than 2.5-1.5B |
| 3 | node-llama-cpp + **Qwen3-4B-Instruct-2507 Q4_K_M** | 2.5 GB | ~4 GB | Apache-2.0 | 16 GB CPU or iGPU (Vulkan); main recommendation |
| 4 | node-llama-cpp + **Phi-4-mini-instruct Q4_K_M** | 2.5 GB | ~3.8 GB | MIT | 16 GB; strongest English reasoning at size; slower decode |
| 5 | onnxruntime-genai + **Phi-4-mini int4 (CPU)** | ~2.3 GB | ~3.5 GB | MIT (model), MIT (runtime) | Alternative if ONNX/Windows ML NPU path is wanted later |
| 6 | node-llama-cpp + **Gemma 4 E4B Q4** | ~2.7 GB | ~4.5 GB | Apache-2.0 | 16 GB once llama.cpp support is stable |
| 7 | node-llama-cpp (CUDA) + **Qwen3-8B Q4_K_M** (5.03 GB, [Qwen GGUF](https://huggingface.co/Qwen/Qwen3-8B-GGUF)) or **Qwen2.5-7B-Instruct** | 4.7–5 GB | 6–7 GB VRAM | Apache-2.0 | 32 GB + NVIDIA; longest, best-toned drafts |
| 8 | node-llama-cpp + **Granite 4.0 H-Tiny Q4** | ~4.5 GB | ~6 GB | Apache-2.0 | 32 GB tier alternative with signed provenance; fast (1B active) |

**Recommendation.**
1. **CPU-only 8 GB laptop:** stay on Qwen2.5-1.5B-Instruct or move to Qwen3-1.7B non-thinking (both Apache-2.0, ~1 GB). Cap context at 4K, feed only the facts needed, use JSON-schema grammar, `n_threads = physical cores − 1`, mmap on. Expect 15–40 tok/s; a 150-word e-mail in 5–10 s.
2. **16 GB laptop (Intel iGPU common):** Qwen3-4B-Instruct-2507 Q4_K_M as default, Phi-4-mini as the MIT alternative; try the Vulkan prebuilt on iGPUs with ≥4.5 GB shared memory and fall back to CPU (Intel's own guidance, [Intel article](https://www.intel.com/content/www/us/en/developer/articles/technical/run-llms-on-gpus-using-llama-cpp.html)). Expect 8–15 tok/s CPU.
3. **32 GB + NVIDIA:** Qwen3-8B Q4_K_M (or Qwen2.5-7B-Instruct) with node-llama-cpp's CUDA binary, full offload; Granite 4.0 H-Tiny if procurement wants signed, ISO-certified weights. Expect 40+ tok/s.

Ship one model per tier, auto-detected by RAM/VRAM at first run, each with a pinned SHA-256; avoid Llama (attribution/naming terms), Qwen2.5-3B (research-only), Ministral (research license) and Gemma 3 (Google terms) for the redistributed build.

#### 10.6 Guardrails: the AI never makes the educator determination

WAC 392-550-025 assigns the monthly progress determination and the intervention plan to a **certificated teacher**. In Command Center the AI is a drafting aid only:

- **Determinations are computed by rules, entered by the teacher, never by the model.** The model receives `determination` as an input fact and the grammar forbids generating the words "satisfactory"/"unsatisfactory"/"intervention required" unless they are cited from that fact.
- **No inference about causes.** The prompt bans speculation about why a student is behind (illness, family, effort); the checker rejects drafts with uncited causal language.
- **Every draft is labelled "AI-assisted draft — not sent, not recorded"** until the teacher edits and confirms; the audit packet stores the teacher's final text, the fact list, the model id and hash, and the checker result — the human-AI-human loop OSPI describes ([OSPI Human-Centered AI](https://ospi.k12.wa.us/student-success/resources-subject-area/human-centered-artificial-intelligence-schools)).
- **Missing-fact protocol.** If the fact list lacks a required item (e.g., no two-way contact this month), the model must emit `[MISSING]` and CC blocks the letter until the teacher resolves it, rather than letting the model paper over it.
- **Scope limits.** No free chat over student data; only fixed tasks (progress narrative, family letter, intervention-plan wording, contact-note cleanup from Whisper) with fixed schemas.
- **Regression gate.** No model or prompt change ships without the offline gold-set evaluation in 10.3 passing at the previous thresholds.


---

## Part 12 — Product roadmap

Scores 1–5 (5 = best for the first four columns; for *Difficulty* and *External API dependency* 5 = hardest /
most dependent). "Data CC already has" = Edgenuity export, ALE contact log/enrollment, Students report, calendar,
the app's own records.

| # | Feature | Teacher time saved | Compliance value | Admin value | Sales differentiation | Difficulty | External API dependency | Phase |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | Explained work queue (Autopilot v1: weekly contact, plan deadlines, no-activity, expiring courses) | 5 | 5 | 4 | 5 | 3 | 1 | 1 |
| F2 | One shared classifier + calendar + policy module (foundation; fixes the four "behind" definitions) | 2 | 4 | 3 | 2 | 2 | 1 | 1 |
| F3 | MPR evidence packet with proposed determinations and persisted drafts | 5 | 5 | 3 | 5 | 3 | 1 | 1 |
| F4 | Intervention auto-workflow (plan task, checkpoint, family notification, month 2/3 escalation) | 4 | 5 | 4 | 4 | 3 | 1 | 1 |
| F5 | Audit Ready packet (per student / caseload, PDF + manifest, missing-evidence list) | 4 | 5 | 5 | 5 | 3 | 1 | 1 |
| F6 | Monday compliance scan + morning briefing + Friday unfinished-work report (scheduled runs) | 4 | 4 | 3 | 3 | 2 | 1 | 1 |
| F7 | Data-quality gate on import (duplicates, stale files, roster drops, bad dates, Excel-mangled CSVs) | 3 | 4 | 3 | 2 | 2 | 1 | 1 |
| F8 | Course-expiration forecasting with daily-goal math | 3 | 3 | 3 | 4 | 2 | 1 | 1 |
| F9 | Contact follow-up queue (outreach without reply → second attempt) | 4 | 4 | 2 | 3 | 2 | 1 | 1 |
| F10 | Roster-change detection (new/withdrawn/advisor change → onboarding tasks) | 3 | 3 | 3 | 3 | 2 | 1 | 1 |
| F11 | Administrator exception report (per advisor, monthly, exportable) | 2 | 4 | 5 | 4 | 2 | 1 | 1 |
| F12 | Communication log with stored bodies, recipients and reply detection (student-type contact on reply) | 4 | 4 | 2 | 3 | 3 | 2 (Outlook/Graph for replies) | 2 |
| F13 | Structured contact evidence (method / subject / who) on app-recorded contacts; WSLP document store | 2 | 5 | 3 | 3 | 2 | 1 | 2 |
| F14 | Signed MPR PDF capture from Laserfiche into the packet | 2 | 4 | 3 | 2 | 3 | 3 (Laserfiche) | 2 |
| F15 | Graduation / credit risk for seniors (credit map or transcript import) | 3 | 3 | 5 | 4 | 3 | 2 (SIS export) | 2 |
| F16 | Guardian cadence and family-contact tracking (K-8 involvement, under-intervention students) | 3 | 4 | 3 | 3 | 2 | 1 | 2 |
| F17 | Local AI grounded drafting v2 (fact-cited narratives, grammar-constrained, evaluation harness) | 3 | 2 | 2 | 4 | 3 | 1 | 2 |
| F18 | Automatic rostering from OneRoster/Clever/ClassLink (students, guardians, e-mails, classes) | 3 | 3 | 4 | 3 | 4 | 5 | 3 |
| F19 | Automated Edgenuity progress feed (scheduled report delivery/SFTP or vendor data export) | 5 | 3 | 4 | 4 | 4 | 5 | 3 |
| F20 | ALE Management / SIS write-back (plans, evaluations, contacts) through a supported API instead of the in-app browser session | 4 | 4 | 4 | 3 | 4 | 5 | 3 |
| F21 | Multi-teacher shared queue (district folder or small sync service) with delegation | 3 | 3 | 5 | 4 | 4 | 2 | 3 |
| F22 | Regression suite on every build (the Playwright harness + synthetic data in CI) | 1 | 3 | 3 | 2 | 2 | 1 | 1 |

**Phase 1 — data Command Center already has:** F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F22.
**Phase 2 — additional data/imports:** F12, F13, F14, F15, F16, F17.
**Phase 3 — Imagine / SIS integration:** F18, F19, F20, F21.

### The five features to investigate first

1. **F2 + F1 — the shared model and the explained work queue.** Every other feature depends on one
   definition of "behind", "contacted", "school day" and "student". Today four modules disagree on the first
   two and two calendars disagree on the third (audit M1, C3). Building the queue on top of a single, tested
   model means the Today card, Reminder Center, Worklist, Contact Watch and Monthly Evaluations stop being
   five separate to-do lists with five different rules. The queue's "why" line is what makes teachers trust
   it: the numbers, the rule and the district policy that produced each item. This is also the feature that
   removes the most clicking: instead of visiting six panels to find out what to do, the teacher opens one list.
2. **F3 — MPR evidence packet.** The monthly report is the heaviest recurring task and the one with the most
   compliance exposure. The app already computes determinations and narratives well; what it lacks is a
   packet that is prepared *before* the teacher starts, persisted, and carries the trend since the previous
   month and the previous plan. With bulk-confirm for On Target students, a 25-student caseload becomes a
   15-minute review instead of an afternoon of clicking, and the required determinations stay with the teacher.
3. **F4 — intervention auto-workflow.** The 5-school-day rule, the checkpoint, the family notification and the
   consecutive-month escalation are exactly the deadlines that get missed under load. The pieces exist
   (WAC panel, ALE write, reminders); connecting them into tasks created automatically at the moment a
   teacher marks Unsatisfactory turns a toast into a tracked obligation with a derivation an auditor can read.
4. **F5 — Audit Ready.** Districts spend days assembling evidence for ALE monitoring visits from screens,
   e-mail and paper. Command Center already stores most of the raw material (contacts, evaluations, plans,
   progress snapshots, change history). Generating a per-student packet with a manifest and a missing-evidence
   list is mostly assembly work, and no comparable local-first tool offers it. It is the strongest sales
   differentiator because it answers the question every ALE director asks first: "will this help me pass a
   review?" (as a tool, not a guarantee).
5. **F6 + F7 — scheduled scans and the import gate.** Cheap to build, and they remove the two silent failure
   modes the audit found: nothing runs unless a teacher happens to open a panel, and bad or stale files can
   quietly change the dashboard. A Monday scan with a morning briefing and a Friday unfinished-work report
   gives the program a weekly rhythm; the import gate makes every downstream number trustworthy.

**Part 3 changes the API scores, not the order:** the only Imagine-sanctioned outbound channel is a paid Edgenuity API sold through the account executive (schema not public), the terms of service forbid automated queries of the educator portal, and rostering arrives via OneRoster 1.1 / Clever / ClassLink as paid add-ons. F18–F20 therefore stay in Phase 3 with dependency score 5, and the human-initiated export inside the app window remains the compliant path until a district buys the API.

Deliberately *not* first: Imagine/SIS integrations (F18–F20). They would save the most time per week, but they
depend on vendor support and district IT approval, and the manual exports work today. Build the model and the
queue first so that when a feed arrives it drops into a system that already knows what to do with it.
