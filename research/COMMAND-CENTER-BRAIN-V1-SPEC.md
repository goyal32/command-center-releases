# Command Center Brain v1 — Functional Specification

**Status:** specification only (no code). Prepared 2026-09-25 from `research/COMMAND-CENTER-NEXT-GEN.md` and the
QA audit of Command Center 0.2.46. **Revision A** (same day) applies the findings of
`research/COMMAND-CENTER-BRAIN-V1-VALIDATION.md`; every changed passage is marked `[Rev A]` and listed in §11.
**Revision B** (same day) adds the rule-applicability and mixed-program layer from
`research/COMMAND-CENTER-APPLICABILITY-MODEL.md`, marked `[Rev B]`. Phase 1 scope: everything here runs on data the app already has (Edgenuity
export, ALE contact log and enrollment, Students report, district calendar, the app's own records). No Imagine or
SIS integration is assumed.

**What Brain v1 is.** A local evaluation engine inside the desktop app that (1) normalises every import into one
model, (2) checks that data is healthy, (3) runs a declared set of rules against the district calendar and
policy, (4) turns findings into an explained work queue, (5) records the evidence that closes each item, and
(6) keeps an append-only audit history. It detects, explains, prepares and tracks. It never makes a
determination that Washington's ALE rules assign to a certificated teacher.

**Guiding rules**
1. One model, one calendar, one policy, one classifier. No module recomputes "behind", "contacted" or "school day".
2. Every item on screen answers: who, why (facts + rule + policy), by when (with the derivation), what closes it.
3. Determinism: same data + same rules + same policy + same date = same findings. Runs are reproducible from the audit log.
4. Nothing is deleted. Corrections append. The teacher can always see what changed and why.
5. Data never leaves the device. Drafts are drafts until a teacher confirms.
6. `[Rev A]` Every finding carries a confidence level (Reliable / Warning / Incomplete / Cannot Evaluate, §2.7) and
   automatic text never uses the words *missed*, *unjustified*, *excluded*, *failing* or *unsatisfactory*. The engine
   says "no qualifying contact recorded"; only a teacher's recorded outcome turns that into "missed without
   justification". A stale or missing source produces a data task, never a student conclusion.
7. `[Rev B]` Every rule declares the regimes it belongs to (§2.11). A regime-bound rule evaluates a subject only
   when that subject resolves `required` for the regime; `unknown` produces an applicability finding (AP-01),
   never a compliance finding and never silence; `not_required` produces nothing. "Rule exists" is not "rule
   applies here".
8. `[Rev B]` Applicability comes from explicit records (district and program configuration, the ALE enrollment
   and course-enrollment reports, administrator overrides), never from a course-name prefix, a school name, a
   teacher's name or the fact that the app runs in Washington. Heuristics may suggest a mapping to an
   administrator; they never decide.

---

## 1. Glossary

| Term | Meaning in this spec |
| --- | --- |
| Student | One person on the caseload, keyed by district student number (SID) from the Edgenuity External ID / ALE `student_number`. |
| Enrollment | One student in one Edgenuity course (the row of the Course Enrollments export). |
| Contact | One logged interaction with a student (ALE contact log row, app check-in, attendance-course completion, e-mail record). |
| Qualifying contact | A contact whose type is on the district's qualifying list (student-type ALE contacts; attendance-course completion if policy says so). Only these satisfy the weekly rule. |
| School week | Sunday–Saturday period containing at least three district school days (WAC 392-550-020). |
| School day | A weekday that is not a district closure per the school calendar. |
| Finding | The result of one rule matching one subject (student or enrollment) on one key (for example a week). |
| Task | The work item a finding creates for a person; has a state, a due date and evidence that closes it. |
| Evidence | A record that proves an action or fact: an ALE contact id, an e-mail record, a plan version, an exception, a document. |
| Policy | A district-configurable value a rule depends on (thresholds, qualifying types, week rules). |
| Judgment required | The step must be performed by an educator; Brain may prepare it but never completes it. |

---

## 2. Data models

All models live in the desktop SQLite database (encrypted at rest as today). Field types: `id` = surrogate
integer, `date` = ISO `YYYY-MM-DD` local, `ts` = ISO timestamp with offset, `json` = JSON text. Every table has
`created_at`, `updated_at`, `created_by` (staff username) unless stated. Renderer IndexedDB stores remain for
the legacy modules during migration; Brain reads only SQLite.

### 2.1 Student (normalised)

| Field | Type | Source | Notes |
| --- | --- | --- | --- |
| `sid` | text, PK | Edgenuity External ID (student token) / ALE `student_number` | 4–10 digits; the join key for everything |
| `name` | text | Edgenuity `Name` (Last, First) | ALE `student_name` used if Edgenuity absent |
| `first_name`, `last_name` | text | derived | Same extraction rule everywhere (fixes audit m3) |
| `edg_user_id` | text | Edgenuity `User ID` | Join key into import history |
| `grade_level` | int | Edgenuity `Student Grade Level` / ALE `grade_level` | Drives the K-8 parent rules |
| `school_key` | text | ALE `school` → tenant school list; fallback counselor initials | |
| `counselor_code`, `advisor_code` | text | External ID tokens (positions from tenant config) | |
| `advisor_name` | text | ALE `advisor` ("LAST, FIRST") | Advisor of record for ALE |
| `teacher_of_record` | text | Policy: advisor unless overridden | Certificated teacher accountable for the plan |
| `student_email`, `guardian_email`, `guardian_name`, `counselor_email` | text | ALE enrollment, Students report | ALE wins; Students report fills gaps |
| `dob` | date | Students report | Birthday facts; sanity range 12–22 years |
| `plan_status` | enum: active, closed, dropped, completed, unknown | ALE `learning_plan_status` | |
| `plan_start`, `plan_end` | date | ALE enrollment | Weeks before `plan_start` are "pre-plan" |
| `plan_weekly_minutes` | int, nullable | Phase 2 (WSLP) | FTE = minutes ÷ 1665 |
| `enrollment_status` | enum: active, archived | Edgenuity `Enrollment Status` (any row archived → student archived if all rows archived) | Archived students excluded from all rules (fixes audit M3) |
| `is_active` | bool, derived | `plan_status ∈ {active, unknown}` and `enrollment_status = active` | Rules run only on active students |
| `first_seen_import`, `last_seen_import` | import id | derived | Roster-change detection |
| `flags` | json | IEP/504 present, senior, new (start ≤ 14 school days ago) | |

Invariants: one row per `sid`; a student never disappears (a missing import marks `last_seen_import` and
creates a roster-change finding).

### 2.2 Course / enrollment

`enrollment` (one per student-course) and `course_snapshot` (one per enrollment per import).

| `enrollment` field | Type | Source |
| --- | --- | --- |
| `id` | id | |
| `sid` | text → student | |
| `course_name` | text | Edgenuity `Course Name` with tenant prefix stripped |
| `course_key` | text | normalised name (case, spaces) |
| `teacher` | text | Edgenuity `Teacher` normalised (multi-teacher rule from tenant config) |
| `is_attendance_course` | bool | tenant `attendance_course.name_patterns` |
| `start_date`, `target_date` | date | Edgenuity |
| `status` | enum: active, completed, archived, gone | Edgenuity `Enrollment Status`; `gone` when absent from the latest import while the student is present |
| `first_seen_import`, `last_seen_import` | import id | |

| `course_snapshot` field | Type | Source |
| --- | --- | --- |
| `import_id` | id → import | |
| `enrollment_id` | id | |
| `progress`, `target_progress`, `pacing` | real | Edgenuity (`pacing = progress − target`) |
| `overall_grade`, `actual_grade`, `relative_grade` | real, nullable | Edgenuity |
| `last_gradebook_entry` | ts, nullable | Edgenuity (parsed as local time) |
| `active_seconds` | int | Edgenuity `Active Time` |
| `assignment_status` | text | Edgenuity |
| `complete` | bool | Edgenuity |

Derived per enrollment (computed by the classifier, never stored twice):
- `bucket`: `on_pace` (pacing > −5), `watch` (−10 < pacing ≤ −5), `struggling` (−20 < pacing ≤ −10),
  `significantly_behind` (−30 < pacing ≤ −20), `extremely_behind` (pacing ≤ −30). One definition for the whole app.
- `expired`: `target_date < today (local midnight)` and `progress < 100`.
- `failing`: `overall_grade < policy.passing_grade` and (`grade > 0` or `progress ≥ policy.zero_grade_progress`).
- `inactive_days`: calendar days since `last_gradebook_entry` (date-only math).
- `weekly_rate`: progress gained per school week over the last four snapshots (null with fewer than two).
- `projected_finish`: today + (100 − progress) ÷ weekly_rate weeks (null when rate ≤ 0).

Derived per student: `worst_bucket`, `any_expired`, `below_passing_count`, `max_inactive_days`. `[Rev A]` The
earlier `risk_score` is removed from Phase 1; the case priority (§5) orders students. Cards print "grade 52 (below
70)", never "failing".

### 2.3 Contact / evidence

`contact` — every interaction, regardless of source.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | id | |
| `sid` | text | |
| `contact_date` | date | Local; parsed from ISO, M/D/YYYY, M/D/YY or an Excel serial (audit C2). `[Rev A]` ALE timestamps carry no offset and are read as local wall time, never converted. |
| `recorded_at` | ts | `[Rev A]` When the row was first seen by the app (import time or app entry); the packet prints "logged n days after the contact date" when it exceeds one day |
| `verification_state` | enum: verified, pending, unverified | `[Rev A]` `verified` = seen in an ALE pull; `pending` = written by the app, not yet seen in a pull; `unverified` = absent from two consecutive pulls after being written (DH-06) |
| `contact_ts` | ts, nullable | When the source has a time |
| `type` | text | ALE type label (Email, Phone, Teams, Zoom, Lab, Academic, Attendance, Form, Test, Admin Meeting, Intervention, Arranged Absence, Teacher Initiated, Parent, Automated, Plagiarism, Support Staff Contact) or app types (`attendance_course`, `app_checkin`, `email_sent`) |
| `direction` | enum: two_way, outbound, inbound, system | From type (policy map) |
| `qualifies` | bool | `type ∈ policy.qualifying_types` and `direction = two_way`/`inbound` per policy |
| `method` | enum: in_person, phone, email, video, messaging, lms, other | WAC "method of communication"; mapped from type, editable |
| `subject` | text | WAC "subject of the communication"; from notes text or entered by the teacher |
| `with_whom` | enum: student, student_and_parent, parent_only, staff | Parent-only never qualifies |
| `author` | text | ALE `created_by` or app user |
| `author_is_certificated` | bool, nullable | Staff table (Phase 2); null = unknown |
| `source` | enum: ale_log, ale_sync, app_checkin, attendance_import, email_record, contact_watch_note, voice | |
| `source_ref` | text | ALE row key / import id / e-mail record id |
| `notes_hash` | text | SHA-256 of the note text; full text stored in `contact_note` (separately exportable) |
| `week_key` | date | Sunday of the school week |
| `dedupe_key` | text, unique | `[Rev A]` `sid|date|type|author|notes_hash`; identical rows are deduplicated with a count on the import card, rows that differ only in notes are kept (two real calls in one day) and flagged "same day, same type" |

`evidence` — anything that proves something about a task or a fact.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | id | |
| `kind` | enum: contact, email, phone_note, exception, plan_version, checkpoint, evaluation, mpr_submission, document, import_row, task_action, packet | |
| `sid` | text, nullable | |
| `at` | ts | When the evidence happened |
| `by` | text | Staff username |
| `ref_table`, `ref_id` | text/id | Pointer to the underlying row |
| `summary` | text | One line shown in the UI ("Phone call with student, 9/23, GARCIA") |
| `hash` | text | SHA-256 of canonical JSON |
| `task_id` | id, nullable | Task this evidence closes or supports |

Exceptions are evidence of kind `exception` with a typed reason (`arranged_absence`, `medical`, `counselor_request`,
`iep_team`, `grace_new_student`, `grace_start_of_year`, `district_justification:<code>`, `other`) and a validity window.

### 2.4 MPR (monthly evaluation)

`evaluation` — one per student per calendar month.

| Field | Type | Notes |
| --- | --- | --- |
| `sid`, `month` (YYYY-MM) | PK | |
| `packet_json` | json | The evidence packet (§7.5) as computed; refreshed when data changes until confirmed |
| `packet_hash`, `packet_at` | text, ts | |
| `proposed_summary` | enum: on_target, adequate_needs_improvement, unsatisfactory, no_progress | From rules (today's MPR module logic) |
| `proposed_comm` | enum: met, needs_improvement, unsatisfactory, no_communication | From rules |
| `proposed_status` | enum: satisfactory, unsatisfactory | From policy rule (both / either / progress) |
| `confirmed_summary`, `confirmed_comm`, `confirmed_status` | enum, nullable | Entered by the teacher (judgment) |
| `confirmed_by`, `confirmed_at` | text, ts | Must be set before the form can open |
| `dpc_contact_id` | id, nullable | The direct personal contact linked to this evaluation (WAC: evaluation must include DPC) |
| `no_dpc_attestation` | json, nullable | `[Rev A]` `{by, at, text, attempts: [evidence ids]}` — set only by the teacher when the month ended without a direct personal contact; printed on the packet and in Audit Ready, never hidden |
| `version` | int | `[Rev A]` Incremented by "re-evaluate" (reason required); prior versions kept in `evaluation_version` |
| `judged_weeks` | json | `[Rev A]` The Sundays of the completed school weeks whose Saturday falls in `month` and that are *required weeks* for the student (§4.1); printed on the packet |
| `communicated_to` | json | `{student: ts, parent: ts}`; parent required when grade ≤ 8 |
| `narrative_draft`, `narrative_final` | text | Draft cites packet fact ids; final is the teacher's text |
| `form_opened_at`, `form_submitted_at`, `submission_source` | ts, enum: form_event, ale_status, teacher_confirmed | |
| `ale_mpr_done` | bool | From ALE monthly status |
| `state` | enum: not_started, packet_ready, confirmed, form_opened, submitted, recorded | |

Persisted from `packet_ready` onward (fixes audit M10).

### 2.5 Intervention

`plan` — one per unsatisfactory evaluation (may be carried forward).

| Field | Type | Notes |
| --- | --- | --- |
| `id` | id | |
| `sid`, `trigger_month` | text | The evaluation that triggered it |
| `evaluation_date` | date | Day 0 for the deadline |
| `due_date` | date | `add_school_days(evaluation_date, policy.plan_due_school_days)`; derivation stored |
| `checkpoint_date` | date | `add_school_days(evaluation_date, policy.checkpoint_school_days)` |
| `strategies` | text | Free text |
| `wac_options` | json | `{contact: bool, goals: bool, course: bool, lab: bool}` |
| `goal` | json | `{course, metric: progress|grade|contact, target, by: date}` (optional, enables progress-monitoring) |
| `participants` | json | `{student: bool, parent: bool, parent_required: bool, others: []}` — parent required when grade ≤ 8 |
| `family_notified_at` | ts, nullable | |
| `meeting_date` | date, nullable | `[Rev A]` Teacher-entered date of the conference; `created_at` stays the system time; both are shown |
| `late_by_school_days` | int | `[Rev A]` `school_days_between(due_date, saved date)` when positive; printed in the packet and the exceptions report |
| `implementation_evidence` | json | Evidence ids linked as the plan runs |
| `checkpoint_result` | enum: on_track, not_on_track, not_reviewed | |
| `checkpoint_reviewed_at` | ts, nullable | |
| `ale_intervention_id` | text, nullable | When written to ALE |
| `consecutive_unsat_months` | int | Count including the trigger month |
| `escalation` | enum: none, month2_review, month3_course_of_study | |
| `course_of_study_decision` | json, nullable | `{decision, date, participants, new_plan_ref}` |
| `state` | enum: due, open, checkpoint_due, closed_success, closed_escalated, closed_status_change | |
| `versions` | via `plan_version` table | Every edit appends a version with diff |

### 2.6 Task / action

`task`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | id | |
| `finding_id` | id → finding | |
| `rule_id` | text | |
| `sid` | text, nullable | |
| `title` | text | "Contact Chen, Marcus" |
| `why` | text | Human explanation with facts and the rule/policy names |
| `priority` | int | Computed (§5); components stored in `priority_json` |
| `due_date` | date, nullable | With `due_derivation` text |
| `owner` | text | Staff username (advisor of record by default) |
| `state` | enum: open, in_progress, waiting, done, resolved_by_data, exception, cancelled | |
| `waiting_until`, `waiting_reason` | date, text | Snooze; max per policy; `[Rev A]` never later than `due_date` for severity `legal_deadline` |
| `step_id` | id → step | `[Rev A]` Every task belongs to exactly one step of the student's case (§2.6a); the queue renders steps, not tasks |
| `actions` | json | Ordered action ids the UI offers (`contact_log`, `draft_email`, `record_exception`, `write_plan`, `record_checkpoint`, `open_mpr_packet`, `mark_done_with_note`, `delegate`) |
| `evidence_kinds` | json | What can close it |
| `closed_by_evidence_id` | id, nullable | |
| `closed_at`, `closed_by` | ts, text | |
| `judgment_required` | bool | Shown as a badge; such tasks never auto-complete |

`task_event` — every transition (`opened`, `viewed`, `started`, `snoozed`, `delegated`, `evidence_linked`,
`done`, `resolved_by_data`, `exception`, `reopened`) with actor, ts, note.

`action` — a named, reusable operation: `{id, label, requires_judgment, runs_in: renderer|main, produces_evidence_kind}`.
Phase 1 actions: contact_log (opens the ALE queue pre-filled), draft_email (opens the preview modal with a
template), record_exception, write_plan, record_checkpoint, open_mpr_packet, record_family_notification,
mark_done_with_note, delegate, snooze, open_student_evidence, acknowledge_week `[Rev A]`.

### 2.6a Case and step `[Rev A]`

One underlying problem must produce one piece of work. Findings stay individual (they are the audit record); the
teacher works **steps** inside one **case** per student.

`case`: `{id, sid, opened_at, closed_at, owner, priority, priority_json, confidence}` — one open case per student;
`priority` = max of its steps; `confidence` = min of its steps; closes when no step is open.

`step`: `{id, case_id, need, need_key, title, why, priority, due_date, state, owner, waiting_until}` keyed by
`(case_id, need, need_key)`. A finding maps to exactly one step through its rule's `need`:

| Need | Rules | need_key | Primary action | Step closes when |
| --- | --- | --- | --- | --- |
| data | DH-* touching the student, RS-02 | source / anomaly | import, pull, confirm status | the DH finding resolves |
| acknowledge | WC-01 | week | acknowledge_week (3 outcomes) | outcome recorded |
| contact | WC-02, WC-05/06, WC-07, PR-01 (act), MP-03, RS-01 welcome contact | — | contact_log | a qualifying contact dated on/after the step opened appears (verified or pending) |
| notify_family | WC-04 (acknowledged weeks), IP-05, MP-02 (parent) | month | draft_email (guardian) / phone note | family-notification evidence recorded after the step opened; it links every finding it covers |
| evaluate | MP-01 with sub-steps DPC → confirm → form → communicate (MP-03, MP-02 student) | month | open_mpr_packet | evaluation `recorded` and communication recorded |
| plan | IP-01, IP-03, WC-03 (plan part) | plan version | write_plan | plan version saved with required elements |
| review | IP-02, IP-04 | plan version + date / month 3 | record_checkpoint / record_decision | result recorded |
| progress_outreach | PR-02, PR-03, PR-04 (day 10), PR-06 | — | draft_email | contact + note, or data resolves every finding, or 14 days with a note |
| housekeeping | PR-05, RS-03, RS-04, WC-08, PR-04 (day 5) | finding | checklist / note | per finding |

Order inside a case: data → acknowledge → contact → evaluate → plan → notify_family → review → progress_outreach →
housekeeping (dependency order first, priority second). A step's *why* concatenates its findings' one-line reasons,
most severe first. Closing a step never closes a finding whose completion criterion is unmet; that finding joins the
next step of the same need. Snooze and delegation apply to steps. DH tasks are program-level, one per
`(source, last_import_id)`, listed once with the count of students affected. The Today card, Reminder Center,
Contact Watch and the queue are views of `step`; nothing else creates work.

### 2.7 Rule

Rules are data plus a pure evaluation function. Registry entry:

| Field | Type | Notes |
| --- | --- | --- |
| `rule_id` | text | `WC-01` etc. |
| `version` | int | Bumped on any change; stored on findings |
| `name`, `description` | text | |
| `scope` | enum: student, enrollment, caseload, system | |
| `trigger` | json | Which events re-run it (`import:edgenuity`, `import:ale_log`, `daily`, `calendar_change`, `policy_change`, `task_event`) |
| `required_data` | json | Sources that must be healthy; if not, the rule emits a `data_gap` finding instead of silence |
| `policy_keys` | json | Policy values it reads (shown in the explanation) |
| `severity` | enum: legal_deadline, contact, progress, housekeeping, data | |
| `cite` | text | WAC/RCW/district source shown in the UI |
| `judgment_required` | bool | |
| `regimes` | json | `[Rev B]` Regimes the rule belongs to (`core`, `wa_ale`, `credit_recovery`, …) |
| `guard` | enum: student, enrollment, source, none | `[Rev B]` Which subject must resolve `required` for every listed regime before `evaluate()` runs (§2.11) |
| `evaluate(ctx, subject) → Finding[]` | function | Pure; no I/O |
| `task_for(finding) → TaskSpec` | function | |
| `closes_when(ctx, finding) → bool` | function | Auto-resolution check |
| `evidence_shown(ctx, finding) → Fact[]` | function | The facts the UI lists |

`finding`: `{id, rule_id, rule_version, policy_version, calendar_version, sid, subject_key, first_seen_run,
last_seen_run, facts_json, explain_json, confidence, confidence_json, tier, applicability_json `[Rev B]`, state:
active|resolved|suppressed|resolved_by_policy|resolved_by_applicability, suppressed_by (exception id),
resolved_by (fact or evidence ref)}`. A finding is idempotent on
`(rule_id, sid, subject_key)`.

`[Rev A]` **Subject keys per rule** (an *episode* is a new finding, never a reopen): WC-01/02/04 = week Sunday;
WC-03 = the acknowledged-week set's first week; WC-05/06 = date of the last qualifying contact (or `plan_start`
when none), one finding with `tier` 15–19 / 20+ that escalates in place; WC-07 = outbound record id; WC-08 = contact
id; PR-01 = enrollment id + anchor date (last gradebook entry or course start); PR-02 = enrollment id + earliest
snapshot in the window; PR-03 = enrollment id + target date; PR-04 = enrollment id + day tier; PR-05 = enrollment
id; PR-06 = enrollment id; MP-01/02/03 = month; IP-01 = evaluation version; IP-02 = plan version + checkpoint date;
IP-03/04 = month; IP-05 = plan version; RS-01 = enrollment episode; RS-02 = import id; RS-03 = import id; RS-04 =
checklist version; DH-01..06 = source + last import id (or anomaly id).

`[Rev A]` **Confidence** is computed per finding from the rule's `required_data` and per-student anomalies:

| Level | Meaning | Student task? | Wording |
| --- | --- | --- | --- |
| Reliable | required sources fresh, coverage horizon ≥ end of the subject period, no anomaly touching the student, no pending contact for the period | yes | "No qualifying contact recorded for the week of 9/13 (contact log pulled 9/24 10:30)." |
| Warning | a required source is aging, or a non-blocking anomaly touches the student (Excel dates, name mismatch, rejected sibling rows), or a pending app contact covers the period, or a fallback derivation was used | yes, badge "verify" | "No qualifying contact found — contact log is 4 days old; a Teams call logged 9/24 awaits ALE verification." |
| Incomplete | the source exists but its horizon ends before the period ends, or an optional field the rule needs is absent | informational only | "Contact evidence for the week of 9/20 is not yet available (last pull 9/23)." |
| Cannot Evaluate | a required source is stale/missing/failed, the student is absent pending RS-02, or the calendar does not cover the period | no; one DH task per source | "Weekly contact cannot be checked — the ALE contact log has not been pulled since 9/14." |

Reports show confirmed / unverified / cannot-evaluate counts separately and never blend them. `confidence_json`
records the source states, horizons, anomalies and fallbacks that produced the level.

`[Rev A]` **`explain_json`** (fixed schema, filled by `evidence_shown`): `{rule: {id, version, name, cite},
subject: {sid, key, period}, facts: [{label, value, as_of, source: {system, import_id, imported_at, ref}}],
derivations: [{label, text, calendar_version}], policy: [{key, value, tier, version}], confidence: {level,
reasons}, automatic: [...], judgment: [{question, outcomes}]}`. Every card footer prints
"rule · policy tier/version · data as of · confidence".

### 2.8 Deadline

`deadline` — every date a rule derives, kept so the UI and the audit packet can show the derivation.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | id | |
| `kind` | enum: fixed, school_days_from_event, rolling_week, consecutive_count, calendar_month | |
| `anchor_date` | date | Evaluation date, plan start, week Sunday, month |
| `offset` | int | School days or weeks |
| `due_date` | date | Result |
| `derivation` | text | "9/18 + 5 school days, skipping Labor Day 9/7 → 9/25" |
| `calendar_version` | int | Which calendar produced it; recomputed when the calendar changes |
| `owner_table`, `owner_id` | text/id | Task, plan, evaluation |

`school_calendar` service (single implementation): `is_school_day(d)`, `add_school_days(d, n)`,
`school_days_between(a, b)`, `week_of(d)` (Sunday), `is_school_week(sunday)` (≥3 school days),
`count_days(month)` (WAC 392-121-119: 4th school day of September, 1st school day of each later month),
`version`. Sources: tenant `school_calendar`, teacher-answered uncertain days, teacher-added closures. The
legacy `calendar` block is derived from it (audit C3).

### 2.9 Audit event

`event` — append-only, hash-chained.

| Field | Type | Notes |
| --- | --- | --- |
| `seq` | int, PK autoincrement | |
| `at` | ts | |
| `actor` | text | Staff username or `system` (system events name the trigger: scan, import, sync) |
| `actor_role`, `session_id` | text | `[Rev A]` |
| `recorded_at`, `happened_at` | ts | `[Rev A]` `recorded_at` is the system clock (monotone with `seq`; a scan refuses to run if the clock is behind the last event); `happened_at` is the teacher-entered date for late-logged actions |
| `source` | enum: ui, import:<id>, ale_sync, ai_draft, system, migration | `[Rev A]` |
| `before_json`, `after_json` | json | `[Rev A]` Explicit old and new values for every mutating event |
| `rule_version`, `policy_version`, `calendar_version`, `app_version` | text | `[Rev A]` On every scan- or rule-produced event |
| `override`, `override_of` | bool, json | `[Rev A]` Set whenever a teacher replaces a proposal or forces a state; `override_of` holds the automatic value |
| `reason` | text | `[Rev A]` Required for exception, re-evaluate, reopen, apply-anyway, snooze, delegate, cancel, correction |
| `supersedes_seq` | int, nullable | `[Rev A]` A correction points at the event it replaces; the read model uses the latest non-superseded event; packets print both |
| `type` | text | `import.completed`, `scan.completed`, `finding.opened`, `finding.resolved`, `task.*`, `evidence.added`, `evaluation.confirmed`, `plan.created`, `plan.version`, `exception.recorded`, `policy.changed`, `calendar.changed`, `packet.generated`, `ai.draft` |
| `sid` | text, nullable | |
| `payload_json` | json | Minimal facts; free text by reference |
| `prev_hash`, `hash` | text | `hash = sha256(prev_hash + canonical(payload))` |

SQLite triggers reject UPDATE and DELETE on `event`. A `verify_chain()` routine runs weekly and on packet
generation. Existing desktop audit rows (`audit` table) are kept and mirrored into `event`.

`[Rev A]` **Corrections never delete.** A wrong contact or evidence row gets an `evidence.corrected` event with
`supersedes_seq`, `before_json`, `after_json` and `reason`; the old row is marked `voided_by` and stays exportable. A
wrong import is never edited: a later import with `supersedes_import_id` (or an `import.revoked` event) rebuilds the
derived state and hides the revoked snapshots from the live view. A changed determination is a new
`evaluation_version`. Policy and calendar changes create versions; findings they resolve are closed with the old
version stamped.

`[Rev A]` **Integrity statement.** The chain detects accidental corruption and casual edits; it does not protect
against a user who holds the database key and drops the triggers, and the product must not describe it as
tamper-proof. Mitigations: the hash covers `seq`, `recorded_at`, `prev_hash` and the canonical payload; the head
hash and `seq` are written into every backup manifest and printed on every Audit Ready packet so packets from
different dates can be compared; Phase 2 may e-mail the weekly head hash to the oversight login. Event payloads hold
references and hashes, never note or e-mail bodies; exports redact free text unless an oversight role includes it.

### 2.10 Import health

`import` — one per file or pull.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | id | |
| `kind` | enum: edgenuity, ale_log, ale_enrollment, students_report, calendar, iep | |
| `file_name`, `file_hash`, `file_size` | text | |
| `received_via` | enum: file_picker, downloads_watcher, ale_sync, drag_drop | |
| `snapshot_date` | date | From file name (MM_DD_YYYY) else import time |
| `rows_total`, `rows_accepted`, `rows_rejected` | int | |
| `header_profile` | json | Detected columns and mapping used |
| `checks_json` | json | Result of every health check (§6) |
| `health` | enum: ok, warn, blocked | |
| `applied` | bool | Blocked imports are stored but not applied |
| `imported_at`, `imported_by` | ts, text | |

`source_status` — one row per source: `last_import_id`, `last_ok_at`, `age_school_days`, `state:
fresh|aging|stale|missing|failed`, `horizon` (the last moment the source can speak for), `message`. Thresholds from
policy. `[Rev A]` Defaults and horizons:

| Source | fresh | aging | stale | Coverage horizon |
| --- | --- | --- | --- | --- |
| Edgenuity export | snapshot_date = today or the previous school day | 2–3 school days | > 3 school days | snapshot_date |
| ALE contact log | pulled today or yesterday | 2–7 days | > 7 days | pull time (a manual CSV older than one day asks for its export date) |
| ALE enrollment | ≤ 7 days | 8–30 days | > 30 days | pull time |
| Students report | ≤ 30 days | 31–90 days | > 90 days | n/a |
| School calendar | current year present, no unanswered days | unanswered uncertain days | year missing / `last_day` passed | the dates it defines |

Findings about periods that end after a source's horizon are at most *Incomplete*; findings that need a stale or
missing source are *Cannot Evaluate* and produce a DH task instead of a student task.

### 2.11 Regime and applicability `[Rev B]`

Full design: `research/COMMAND-CENTER-APPLICABILITY-MODEL.md`.

`regime`: `{id, name, cite, scope_text, version, requires_contact_documentation, contact_record_system}`. Phase 1
ships `core` (universal product rules) and `wa_ale` (Washington ALE) and an empty `credit_recovery` a district may
populate. A regime's T0 definitions apply only to subjects inside its scope; the product assigns no program to any
regime by itself.

`applicability_statement` (append-only): `{id, regime_id, level: L2 district | L3 program | L4 student record |
L5 enrollment record or course mapping | L6 override, subject_kind: program|school|student|enrollment|course_key,
subject_key, state: required|not_required|unknown, authoritative (L2/L3 only), source, effective_from,
effective_to, reason, set_by, set_at, version, superseded_by}`. Import-derived statements (ALE enrollment report =
L4, ALE course-enrollment report = L5) are rebuilt per import with the import id as version.

**Resolution** for `(regime, subject, date)`, most specific first: L6 override → L5 enrollment record / course
mapping → L4 student record (enrollment-scoped subjects get `unknown` from L4 alone unless the program default is
authoritative) → L3 program default → L2 district default if authoritative (advisory defaults yield `unknown` with
a suggestion) → `unknown`. Two explicit statements that disagree → `unknown` with both listed (AP-02). An expired
override → `unknown` (`override_expired`), never a silent fallthrough. Teacher role never decides applicability.

**Student aggregate:** a student is `required` for a regime if any enrollment or the L4 record says so;
`not_required` if all say so; else `unknown`. `R-scope enrollments` are those resolved `required`; `not_required`
ones are shown as "other enrollments (not in the plan)" and never enter the regime's packets or proposals.

`applicability_json` (stored on every finding, step, packet and external-action event): `{regime, subject, date,
state, decided_at, statements: [{id, level, state, source, version}], conflicts, hints (not used), explanation}`.

**Applicability findings** (regime `core`): AP-01 *unknown* (one per subject per cause from the closed list
`no_program_assignment`, `program_default_advisory_only`, `no_ale_enrollment_record`,
`course_membership_unconfirmed`, `conflicting_statements`, `override_expired`, `regime_unassigned`), AP-02
*conflict*, AP-03 *regime unassigned* (system). Each creates a configuration task for the oversight role (or a
DH-01 task when the cause is a stale source); the teacher sees the student under "Needs configuration" with the
universal findings and a *Request mapping* action. Unknown is reported as its own count everywhere.

---

## 3. Policy settings (district-configurable, shown in every explanation)

`[Rev A]` The default column shows product defaults with the Pasco/iPAL program values as *examples of tier T2*
(§3.1); nothing Pasco-specific is a product constant.

| Key | Default (T2 example: Pasco) | Used by |
| --- | --- | --- |
| `contact.qualifying_types` | student-type ALE types + `attendance_course` | WC rules |
| `contact.parent_only_counts_for_k8` | false | WC-01 |
| `contact.week` | Sunday–Saturday, ≥3 school days | calendar |
| `contact.at_risk_weekday` | Thursday | WC-02 |
| `contact.grace_max_weeks` | 4 | WC exceptions |
| `contact.justification_codes` | district board policy list | exceptions |
| `contact.school_days_warn`, `contact.school_days_exclude` | 15, 20 | WC-05/06 |
| `contact.followup_school_days` | 3 | WC-07 |
| `activity.warn_days`, `activity.act_school_days` | 7, 10 | PR-01 |
| `pacing.drop_points`, `pacing.window_days` | 5, 7 | PR-02 |
| `pacing.buckets` | −5/−10/−20/−30 | classifier |
| `grade.passing`, `grade.zero_grade_progress` | 70, 10 | classifier |
| `course.expiring_days` | 14 | PR-03 |
| `newstudent.zero_by_day`, `newstudent.min_progress`, `newstudent.by_day` | 5, 10, 10 | PR-04 |
| `mpr.window_working_days` | 5 | MP-01 |
| `mpr.unsatisfactory_rule` | both | MP proposal |
| `mpr.parent_grade_max` | 8 | MP-02 |
| `plan.due_school_days`, `plan.checkpoint_school_days`, `plan.day0_is_evaluation_date` | 5, 10, true | IP-01/02 |
| `plan.escalate_month2`, `plan.escalate_month3` | true, true | IP-03/04 |
| `plan.consecutive_pause_over_breaks` | true | IP-03 |
| `task.snooze_max_days`, `task.snooze_requires_reason` | 5, true | tasks |
| `data.edgenuity_stale_school_days`, `data.ale_log_stale_days` | 3, 7 | DH rules |
| `roster.drop_threshold_pct` | 20 | DH-03 |
| `contact.min_enrolled_school_days_in_week` `[Rev A]` | 3 | required-week rule (§4.1) |
| `contact.streak_skips_non_school_weeks` `[Rev A]` | true | WC-03 (D-10) |
| `contact.reset_counters_on_reenrollment` `[Rev A]` | true | RS-01 returning student (D-11) |
| `contact.require_subject_to_qualify` `[Rev A]` | false | WC-01/WC-08 (D-13) |
| `contact.count_pending_app_contacts` `[Rev A]` | true (at Warning) | WC-02 |
| `pacing.bucket_move_min_drop` `[Rev A]` | 3 | PR-02 |
| `mpr.min_judged_weeks_required` `[Rev A]` | 1 | MP-01 partial months (D-9) |
| `mpr.include_expired_courses` `[Rev A]` | true (flagged) | MP-P1 (D-12) |
| `mpr.communicate_within_school_days` `[Rev A]` | 3 | MP-02 (D-8) |
| `mpr.no_progress_avg`, `mpr.min_month_gain` `[Rev A]` | 10, 2 | MP-P1 |
| `program.graduation_date`, `program.advisor_source` `[Rev A]` | (T2), ale | PR-06, RS-03 |
| `regimes.programs` `[Rev B]` | `{iPAL: {wa_ale: required, authoritative: true}}` (T2 example) | applicability L2/L3 |
| `regimes.course_mapping` `[Rev B]` | `{}` (course_key → regime, set_by, version) | applicability L5 |
| `external_systems.contact_record_system` `[Rev B]` | `{id: ale, name, student_url_template, queue_provider: ale_queue, verify_via: ale_sync}` (T2) | External Action Policy |
| `external.policy` `[Rev B]` | rows `(regime, context, applicability) → [{action, mode}]`, see APPLICABILITY-MODEL §6 | e-mail, contact_log, phone note, family notification |
| `external.mixed_course_email` `[Rev B]` | offer | course-level e-mail on a non-plan course of an ALE student |
| `external.record_system_reopen_minutes` `[Rev B]` | 30 | focus instead of reopen |

Every change to policy writes a `policy.changed` event and triggers a full re-evaluation.

### 3.1 Configuration tiers `[Rev A]`

| Tier | Owner | Examples | Editable by | Locked? |
| --- | --- | --- | --- | --- |
| T0 regime definitions `[Rev B]` | the product, from WAC/RCW text with citation and effective date, **per regime** | for `wa_ale`: school week = Sun–Sat with ≥ 3 school days; weekly contact; monthly evaluation with direct personal contact; K-8 parent participation; 20 consecutive school days; three consecutive months → course-of-study decision; evidence fields date/method/subject; count-day rule | nobody | yes; shown with the citation; changes need a product release. **They apply only to subjects that resolve `required` for the regime (§2.11); T0 carries no default applicability, so running the app in Washington assigns nothing to ALE.** |
| T0 regime scope `[Rev B]` | the product | the regime's scope text with citation, used to tell administrators what evidence places a subject inside it | nobody | informational; the district assigns programs to regimes in T1 (until it does, AP-03 shows one configuration task) |
| T1 District | district ALE administrator | qualifying types; attendance-course counting; justification codes; plan due days and day-0; consecutive-month pause; MPR window and unsatisfactory rule; who confirms; whether the district form satisfies "communicated"; passing grade; 15/20-day thresholds; calendar; retention | oversight role, reason required, event, re-scan | teachers cannot override; a program may tighten, never loosen |
| T2 Program (e.g. iPAL) | program lead | External-ID token layout; attendance-course patterns; course prefix; school/counselor codes; e-mail templates and policy text; Contact Watch ladder; graduation date; district-form mapping; CSV header mappings; sources imported; advisor source | oversight role | overrides product defaults, never T1 |
| T3 Teacher preference | each staff member | at-risk weekday for own reminders (earlier than T1 only); queue grouping and filters; signature; snooze default ≤ cap; Downloads watcher | the user | never affects findings, confidence or reports |

Precedence T0 > T1 > T2 > product defaults, with T3 only for keys marked `scope: teacher`. Storage:
`product-defaults.json` (shipped, versioned) → tenant package JSON (T2) → district settings table in SQLite (T1,
signed by the oversight login) → per-user settings (T3). `policy_version` = hash of the merged T0–T2 values and is
stamped on every finding and event. Every explanation prints each value with its tier badge.

---

## 4. Phase 1 rules

Common attributes: **Trigger** lists events; every rule also runs on `daily` (first launch each school day) and on
`calendar_change`/`policy_change`; `[Rev A]` a `task_event` re-runs only `closes_when` for the affected student.
**Required data** names sources that must not be `stale`/`missing`; otherwise the
rule emits `DH-gap` instead of a student finding, and every finding carries the confidence level of §2.7.
`[Rev B]` **Applicability gate**: before `evaluate()`, the engine resolves every regime in the rule's `regimes`
for the rule's `guard` subject; `required` → evaluate; `unknown` → AP-01 once per subject (not per rule);
`not_required` → nothing. Classification of each rule (universal / ALE-enrollment / course / program /
configurable) and the guard column are in `COMMAND-CENTER-APPLICABILITY-MODEL.md` §7. In short: WC-*, MP-*,
IP-*, RS-04 and DH-04 are `wa_ale` student-guarded; PR-* and RS-01..03, DH-01/03/05/06 are `core`; DH-01 requires
the ALE sources only while at least one student resolves `required` or `unknown` for `wa_ale`; WAC citations
print only on findings whose subject is in the regime.
`[Rev A]` **Required week**: a school week (≥ 3 school days) is *required* for a student only if the plan was
active on at least `contact.min_enrolled_school_days_in_week` of its school days (enrollment episode, §2.1); weeks
with fewer than three school days are neither met nor missed, and whether they interrupt a streak is
`contact.streak_skips_non_school_weeks`. Weeks before `plan_start` (fallback: earliest course start, flagged) and
after a withdrawal are not required. During a new-student grace window no WC finding is shown; RS-01 carries the
welcome contact. **Who can complete** is the task owner unless stated (advisor
of record; oversight roles may reassign). Priorities are severity classes; the numeric order is in §5.

### 4.1 Weekly contact (WC)

**WC-01 No qualifying contact recorded for a completed week** `[Rev A: record + acknowledgment, not a contact task]`
- Trigger: `import:ale_log`, `ale_sync`, `import:edgenuity` (attendance completions), `daily`.
- Required data: ALE log with horizon ≥ the week's Saturday; calendar.
- Conditions: week `w` is a *required week* for the student; no contact with `qualifies = true` (verified or pending)
  and `week_key = w`; no exception covering `w`; no acknowledgment for `w`.
- Priority: contact; urgency from weeks elapsed. Need: **acknowledge** (one step per week).
- Action created: step "Acknowledge week of {w} — {name}" with exactly three outcomes: *Contact happened — log it*
  (late evidence, opens contact_log dated inside `w`), *Justified* (typed exception with window), *Missed — no
  justification* (acknowledged). Multi-select acknowledgment on the student page records one event per week.
- Evidence shown: the week's contacts with type and why each does or does not qualify ("Teacher Initiated is
  outbound only"); last qualifying contact; attendance-course status that week; the student's unreviewed,
  acknowledged and justified weeks this year; the policy list of qualifying types with tier badge.
- Who can complete: advisor of record / any certificated staff with the student on their caseload.
- Completion criteria: an outcome is recorded. A qualifying contact dated inside `w` arriving later resolves the
  record by data (`resolved_by_data`, fact "logged n days after"); an earlier acknowledgment is kept with
  `superseded_by` and WC-03's count recomputes. A contact dated in a later week never closes `w`.
- Source: WAC 392-550-020 (definitions), 392-550-025/-030 (weekly contact), 392-550-065 (evidence: date,
  method, subject); district policy on qualifying types.
- Judgment required: yes — the outcome is the teacher's determination; detection is automatic and worded as
  "no qualifying contact recorded".

**WC-02 Weekly contact at risk (current week)**
- Trigger: `daily` from `policy.contact.at_risk_weekday`; imports.
- Required data: ALE log fresh (else shown as "unverified" rather than at risk).
- Conditions: current week is a *required week*; today ≥ at-risk weekday; no qualifying contact (verified or
  pending) this week; no exception; `[Rev A]` student not in a grace window.
- Priority: contact, urgency = due end of week. Need: **contact**.
- Action: step "Reach {name} this week" with contact_log, draft_email, record_exception, open_student_evidence.
- Evidence shown: days left in the week; last qualifying contact; scheduled items (attendance course status).
- Completion: qualifying contact this week (auto; a pending app contact closes it at Warning until verified) or
  exception; when the week ends without one, WC-01 opens for that week (same week key).
- Source: same as WC-01.
- Judgment: no.

**WC-03 Second consecutive / third cumulative missed week (conference + screener + data-based plan)**
- Trigger: after WC-01 evaluation.
- Required data: ALE log fresh; exceptions.
- Conditions: `[Rev A]` weeks the teacher acknowledged as *Missed — no justification* reach 2 consecutive or 3
  cumulative in the enrollment episode. Unreviewed weeks never count; reports show them as "unreviewed".
  Non-school weeks between two acknowledged weeks do not break the run when
  `contact.streak_skips_non_school_weeks` is true (the packet prints which rule applied). Need: **plan**.
- Priority: legal_deadline (district must hold a conference and develop a data-based intervention plan).
- Action: task "Conference + screener + intervention plan — {name}" with actions write_plan (kind: contact),
  record_family_notification, draft_email, delegate (counselor).
- Evidence shown: the missed weeks with their dates; justification status per week; prior notifications;
  Contact Watch step (the district ladder: reach out / meeting / archive) shown as "district practice" beside
  the WAC step.
- Who: advisor of record; conference may involve counselor/admin (delegation recorded).
- Completion: a plan of kind `contact` saved with participants and a conference date, plus a
  family-notification evidence (the same evidence satisfies WC-04); or exception (student status change). If a
  later-arriving contact drops the count below the threshold before the step is started, it is cancelled with
  reason; a started plan stays open with a "trigger changed" banner for the teacher to close.
- Source: WAC 392-550-040, 392-550-045 (board policy justifications); district Contact Watch ladder.
- Judgment: yes.

**WC-04 Parent notification after an acknowledged missed week** `[Rev A]`
- Trigger: a week acknowledged *Missed — no justification*.
- Conditions: student active; no `family_notification` evidence covering week `w`.
- Priority: contact. Need: **notify_family** (one step per case; the step lists every acknowledged week not yet
  covered, and one notification evidence covers all of them).
- Action: step "Inform parent/guardian — no contact week(s) of {w…}" with draft_email (guardian template),
  phone note, record_family_notification; "no guardian contact on file" shows a record-guardian-contact sub-action.
- Evidence shown: guardian e-mail/phone on file (or "none on file" as a data task), the missed week facts.
- Completion: family-notification evidence for `w` (direct personal contact with parent per WAC), or exception.
- Source: WAC 392-550-040(1) (inform parents by direct personal contact when weekly contact is missed without
  valid justification).
- Judgment: partial (content of the notification).

**WC-05 15–19 school days without a qualifying contact** `[Rev A: one finding with WC-06 as tier 20+; author certification is not verified in Phase 1 and the explanation says so]`
- Trigger: `daily`, imports.
- Required data: ALE log fresh; calendar.
- Conditions: school days since the last qualifying contact (anchor = `plan_start` when there has never been one)
  between `policy.contact.school_days_warn` and `school_days_exclude − 1`. Need: **contact**.
- Priority: contact, urgency rising daily.
- Action: task "Contact before day 20 — {name} ({n} school days)"; actions contact_log, draft_email, phone note.
- Evidence shown: the count with its calendar derivation (which closures were skipped), last contact, next
  count day and that the count *may affect* enrollment reporting on it (the enrollment office decides).
- Completion: qualifying contact (auto).
- Source: WAC 392-121-182 (20 consecutive school days); district count-day calendar (392-121-119).
- Judgment: no.

**WC-06 20+ school days without a qualifying contact (tier 20+ of WC-05)** `[Rev A]`
- Conditions: school days since last qualifying contact ≥ `school_days_exclude`; the WC-05 finding escalates in
  place (`tier = 20+`, one `escalated` event), it is not a second task.
- Priority: legal_deadline.
- Action: task "20+ school days without contact — {name}: contact, then confirm resumed participation" with
  contact_log, record_exception (status change), delegate (enrollment office notification).
- Evidence shown: as WC-05 plus the count days passed since day 20; a note that under WAC 392-121-182 the student
  may not be claimable until a certificated teacher makes contact and participation resumes — the enrollment
  office determines the count.
- Completion: qualifying contact, then the step waits on *resumed participation*, verified by the first gradebook
  entry after the contact (evidence) or ticked by the teacher with a note (judgment); or status change.
- Source: WAC 392-121-182.
- Judgment: yes (resumed participation).

**WC-07 Outreach without reply (follow-up)**
- Trigger: `email_sent`/Teacher-Initiated contact recorded.
- Conditions: outbound contact on day D; no qualifying (inbound/two-way) contact within
  `policy.contact.followup_school_days`; week not yet satisfied.
- Priority: contact (low).
- Action: task "Second attempt — {name} (e-mail {D} unanswered)"; actions phone note, guardian e-mail, contact_log.
- Evidence shown: the outbound record (subject, recipients), days since.
- Completion: qualifying contact, or the week is satisfied by other means (auto), or exception.
- Source: district practice; supports WC-01.
- Judgment: no.

**WC-08 Contact record missing WAC evidence fields**
- Trigger: `import:ale_log`, app contact recorded.
- Conditions: a qualifying contact lacks `method` or `subject` (empty note), or `with_whom = parent_only` for a
  student in grade > 8 while being the only contact of its week.
- Priority: `[Rev A]` housekeeping inside the student case (rises to contact if it is the week's only qualifying
  contact); never in the "Fix data first" group. Need: **housekeeping**. With
  `contact.require_subject_to_qualify = true` the contact does not qualify and the week reads "unverified pending
  subject".
- Action: step "Complete contact record — {date}, {type}" with actions edit_in_ale (opens ALE), add_subject (app-side
  annotation stored as evidence).
- Evidence shown: the row, the missing field, why it matters (WAC 392-550-065 evidence list).
- Completion: field present on the next pull, or app-side annotation saved.
- Source: WAC 392-550-065.
- Judgment: no.

### 4.2 Progress and activity (PR)

**PR-01 No course activity**
- Trigger: `import:edgenuity`, `daily`.
- Required data: Edgenuity fresh.
- Conditions: active student; `[Rev A]` inactivity is computed only over enrollments that are `active`, not
  expired, not complete and not the attendance course; a null `last_gradebook_entry` anchors on the course start
  ("no work submitted since start"). `max_inactive_days ≥ policy.activity.warn_days` (warn) or school days since the
  anchor ≥ `activity.act_school_days` (act); no grace/exception; student not new (< 5 school days). Need:
  progress_outreach (warn) / **contact** (act).
- Priority: progress (warn) / contact (act).
- Action: task "No activity {n} days — {name}" with draft_email (no-activity template), contact_log, phone note.
- Evidence shown: per course last gradebook entry, active time, progress; last qualifying contact.
- Completion: a gradebook entry after the task opened (auto on next import) or a qualifying contact + note; or exception.
- Source: district policy (10-day/no-activity); supports WAC weekly contact.
- Judgment: no.

**PR-02 Pacing deterioration**
- Trigger: `import:edgenuity`.
- Required data: at least two snapshots within `pacing.window_days + 7`.
- Conditions: `[Rev A]` enrollment active and not expired; pacing fell by ≥ `pacing.drop_points` within the window,
  or the bucket moved down one class with a drop ≥ `pacing.bucket_move_min_drop`; **and** the resulting bucket is
  `watch` or worse (a student still on pace is not a finding). `weekly_rate = (progress_now − progress at the
  earliest snapshot in the window) ÷ school weeks between`, both snapshots named. Need: **progress_outreach**.
- Priority: progress.
- Action: task "Pacing dropped in {course} ({from} → {to})" with draft_email (behind-pace template), contact_log,
  open_student_evidence.
- Evidence shown: the two snapshots, projected finish vs target date, minutes/day needed (Edgenuity daily goal if
  the report was fetched).
- Completion: pacing recovers to within `drop_points` of the earlier value (auto), or a contact + note, or 14 days
  with acknowledgment.
- Source: district practice.
- Judgment: no.

**PR-03 Course expiring or expired**
- Trigger: `import:edgenuity`, `daily`.
- Conditions: expired: `target_date < today` and progress < 100; expiring: target within `course.expiring_days`
  and `projected_finish > target_date` (or bucket ≤ watch).
- Priority: progress; expired with grade < passing = contact.
- Action: task "Target date {passed|in n days} — {course}" with draft_email (expired template), contact_log,
  mark_done_with_note ("extension requested in Edgenuity").
- Evidence shown: target date, progress, projected finish, remaining work estimate, grade.
- Completion: course completed or target date moved (auto on import); or note "extension requested" with date.
- Source: district practice; WSLP timelines (WAC 392-550-025).
- Judgment: partial (extension decision).

**PR-04 New-student start check (day 5 / day 10)**
- Trigger: `daily`, imports.
- Conditions: `[Rev A]` per enrollment: `school_day_index(start_date, today)` (inclusive) ≥ 5 and progress 0 (day 5);
  or ≥ 10 and progress < `newstudent.min_progress` (day 10). A course added later gets its own check. Day-5 lines
  live inside the RS-01 checklist for new students.
- Priority: progress; day 10 = contact.
- Action: task "Start check — {name} (day {n})" with draft_email (course-start template), contact_log.
- Evidence shown: start dates, progress per course, whether the WSLP checklist is complete, contacts so far.
- Completion: progress threshold met (auto), or contact + note.
- Source: district 10 %-in-10-days policy (tenant e-mail policy text); WAC 392-121-182 participation evidence.
- Judgment: no.

**PR-05 Ready to grade out**
- Conditions: progress ≥ 100 and no ungraded work.
- Priority: housekeeping.
- Action: task "Grade out {course} in Edgenuity, record final in ALE" (checklist).
- Evidence shown: progress, grade, assignment status.
- Completion: course gone from the next import (auto) or note.
- Source: district process.
- Judgment: no. `[Rev A]` When the export lacks an assignment-status column the finding is *Incomplete*:
  "100 % complete; grading status unknown".

**PR-06 Senior projected to finish after graduation (optional, T2 `program.graduation_date`)** `[Rev A]`
- Conditions: student flagged senior; any active course with `projected_finish > program.graduation_date`.
- Priority: progress. Need: progress_outreach.
- Evidence shown: the projection with its two snapshots and rate, the graduation date with its tier badge.
- Completion: projection on or before graduation (auto), or counselor note.
- Judgment: yes (counselor); the finding is a projection and is worded as one.

### 4.3 Monthly progress (MP)

**MP-P Proposal rules (declared)** `[Rev A]` — proposals appear only inside the packet, never on queue cards or in
report counts, and are always labelled "proposed". *Judged weeks* for month M = the student's required weeks whose
Saturday falls in M and that are complete as of the scan (printed by date). Each proposal lists the facts it used.

- `[Rev B note]` *Parity with the shipped MPR module:* 0.2.46's `MPR.evaluate` grades the summary in four levels
  (On Target / Adequate but Needs Improvement / Unsatisfactory / No Progress) using average progress, the largest
  pacing gap, the count of courses below passing and the count of expired courses, with thresholds from the MPR
  settings. MP-P1 must be restated with those four levels and inputs before shadow comparison
  (`COMMAND-CENTER-BRAIN-V1-MIGRATION-MAP.md` §2); the three-level text below is superseded by that restatement.
- **MP-P1 Progress summary** over active courses (expired courses included with a flag when
  `mpr.include_expired_courses`): *On Target* if every course is `on_pace`; *No Progress* if the average progress
  is below `mpr.no_progress_avg` and every course is below `on_pace`, or (when a prior-month snapshot exists) no
  course gained ≥ `mpr.min_month_gain` points since the last evaluation; otherwise *Adequate / Needs Improvement*.
  A student with no judged weeks or no prior snapshot gets "not proposed — {reason}".
- **MP-P2 Communication** over judged weeks: *Met* when every judged week has a qualifying contact; *Needs
  Improvement* when exactly one lacks one; *Unsatisfactory* when two or more lack one; *No Communication* when none
  has one. Unreviewed, acknowledged and justified weeks are listed; justified weeks are excluded from the
  denominator.
- **MP-P3 Overall** per `mpr.unsatisfactory_rule`: `both` = Unsatisfactory only when P1 is No Progress **and** P2 is
  Unsatisfactory or No Communication; `either` = when either is; `progress` = P1 alone. The packet prints "would
  change if …" for the nearest boundary.

**MP-01 Monthly evaluation due / missing**
- Trigger: `daily`; `import:ale_log`; MPR window opens (last `mpr.window_working_days` working days).
- Required data: Edgenuity fresh; ALE log for the month (weeks missing → data gap shown inside the packet, not
  silence).
- Conditions: `[Rev A]` student with ≥ `mpr.min_judged_weeks_required` judged weeks in month M (a withdrawn student
  still qualifies; the packet flags "withdrawn {date} — partial month" and offers an *evaluation not required*
  exception per D-9); no `evaluation` in state ≥ `confirmed` for M; today inside or after the window.
  Need: **evaluate** (sub-steps: direct contact → confirm → form → communicate).
- Priority: legal_deadline (due = last working day of the month; overdue after).
- Action: task "Monthly evaluation — {name} ({M})" with open_mpr_packet.
- Evidence shown: the packet summary (proposed determinations, weeks met, direct contact present, trend since last
  month), what is missing (no DPC this month, contact-log week not pulled).
- Who: certificated teacher of record (or school-based support staff for online-only plans where district policy
  allows — configurable).
- Completion: evaluation confirmed **and** recorded (submitted or teacher-confirmed), with a DPC linked **or** a
  `no_dpc_attestation` `[Rev A]`, and communication recorded per MP-02 (the same step). A stale Edgenuity source
  does not block confirmation but requires the teacher to tick "confirm using course data as of {date}", which is
  stored on the evaluation. Recording after the next count day is printed as a fact.
- Source: WAC 392-550-030 (monthly evaluation with DPC), RCW 28A.232.010; WAC 392-121-182 (prior-month evaluation
  before count day).
- Judgment: **yes — the determination**. Brain only proposes.

**MP-02 Evaluation communicated (student; parent for K-8)**
- Trigger: evaluation confirmed.
- Conditions: `communicated_to.student` missing, or grade ≤ `mpr.parent_grade_max` and `communicated_to.parent` missing.
- Priority: legal_deadline; `[Rev A]` due = `add_school_days(confirmed_at, mpr.communicate_within_school_days)`.
  Sub-step of the evaluate step (student) / notify_family step (parent).
- Action: "Share {M} evaluation with {student / parent}" with draft_email (evaluation summary), record_family_notification.
- Evidence shown: the confirmed determination, guardian contact on file.
- Completion: communication evidence recorded (the Laserfiche submission may satisfy this when the district
  form notifies the family — policy flag).
- Source: WAC 392-550-030.
- Judgment: no.

**MP-03 Evaluation lacks direct personal contact**
- Trigger: packet build.
- Conditions: no qualifying two-way contact in month M for an active student.
- Priority: contact. `[Rev A]` Runs only when MP-01 is required for M. While M is open it is the first sub-step of
  the evaluate step and disables *Confirm selected* for the row; after M ends it becomes a packet flag and the
  teacher may confirm with a `no_dpc_attestation` listing the outreach attempts. Need: **contact**.
- Action: "Direct contact needed for the {M} evaluation — {name}" with contact_log, draft_email, phone note.
- Evidence shown: contacts this month by type and why none qualifies.
- Completion: qualifying contact in M (auto).
- Source: WAC 392-550-030 ("must include direct personal contact").
- Judgment: no.

### 4.4 Intervention (IP)

**IP-01 Intervention plan due (5 school days)**
- Trigger: evaluation confirmed unsatisfactory (or "failed to follow the plan" flag).
- Conditions: `[Rev A]` the student has no plan in state `open` or `checkpoint_due`; when one exists the month's duty
  is IP-03 (a new version of that plan) and the 5-school-day deadline attaches to the version. Day 0 = the
  confirmation date of the evaluation version that triggered it (a revised determination re-anchors and the
  derivation prints both dates); an evaluation known only from ALE status uses the observed date, labelled.
- Priority: legal_deadline; due = `add_school_days(evaluation_date, plan.due_school_days)`.
- Action: task "Write intervention plan — {name} (due {date})" with write_plan (draft pre-filled from the packet),
  record_family_notification, delegate.
- Evidence shown: the evaluation, the behind courses with daily-goal math, previous plan (if any) and its
  checkpoint result, consecutive-unsatisfactory count, parent-participation requirement (grade ≤ 8).
- Who: certificated teacher of record.
- Completion: plan saved with strategies, at least one WAC option, participants (parent when required), checkpoint
  date; optional ALE write. Family notification is IP-05. `[Rev A]` Each pre-filled section must be edited or
  explicitly accepted; the plan records which sections were accepted unedited. A save after the due date stores
  `late_by_school_days`. If the triggering determination is revised to satisfactory: a step not started is cancelled
  with reason; an open plan stays open with a "trigger revised" banner and the teacher closes it.
- Source: WAC 392-550-030, 392-550-020 (intervention plan definition).
- Judgment: **yes — plan content**.

**IP-02 Checkpoint review due**
- Trigger: plan saved; `daily`.
- Conditions: `checkpoint_date ≤ today` and `checkpoint_result = not_reviewed`.
- Priority: legal_deadline (overdue after the date).
- Action: task "Checkpoint review — {name}" with record_checkpoint (shows goal vs current numbers), write_plan (revise).
- Evidence shown: goal, progress/grade/contacts since the plan date, snapshots.
- Completion: checkpoint result recorded (on/not on track/goal void — revise) with a note; `[Rev A]` a goal whose
  course is `gone` is shown as such and never computed as "not on track"; optional ALE goal review.
- Source: district practice implementing "implemented" (WAC 392-550-030); ALE progress-monitoring goals.
- Judgment: yes.

**IP-03 Second consecutive unsatisfactory month — plan review**
- Trigger: evaluation confirmed unsatisfactory with `consecutive_unsat_months = 2`.
- Conditions: policy `plan.escalate_month2`; break-month pause per policy.
- Priority: legal_deadline.
- Action: task "Review and revise the intervention plan — {name} (2nd month)" with write_plan (new version), record_family_notification.
- Evidence shown: both evaluations (each month's confirmed determination and version), the plan, checkpoint results,
  what changed, `[Rev A]` and the break-pause rule applied to the consecutive count.
- Completion: a new plan version saved with participants.
- Source: WAC 392-550-025/-030 (documented intervention efforts across consecutive months).
- Judgment: yes.

**IP-04 Third consecutive unsatisfactory month — course of study decision**
- Trigger: `consecutive_unsat_months = 3`.
- Priority: legal_deadline.
- Action: task "Course-of-study decision required — {name}" with record_decision (new plan / program change /
  removal from ALE), delegate (admin/counselor), record_family_notification.
- Evidence shown: the three evaluations, all plan versions and checkpoints, contacts, family involvement.
- Completion: `course_of_study_decision` recorded with date and participants; if a new plan, WSLP task created.
- Source: WAC 392-550-025 ("no more than three consecutive calendar months … course of study … may include removal").
- Judgment: yes.

**IP-05 Family notification of plan**
- Trigger: plan saved.
- Conditions: `family_notified_at` null; always for grade ≤ 8 (parent must participate), policy for 9–12.
- Priority: contact.
- Action: task "Notify family of intervention plan — {name}" with draft_email (plan summary), phone note.
- Completion: family-notification evidence.
- Source: WAC 392-550-030 (parent participation K-8); district practice.
- Judgment: no.

### 4.5 Roster and plan (RS)

**RS-01 New student on roster**
- Trigger: `import:edgenuity`, `import:ale_enrollment`.
- Conditions: `first_seen_import = latest`, or `[Rev A]` a new enrollment episode after a closed one ("returning
  student": the gap weeks are neither met nor missed, streaks and the consecutive-month count reset per
  `contact.reset_counters_on_reenrollment`, history stays visible with the episode boundary drawn).
- Priority: housekeeping (becomes contact after the first school week).
- Action: task "Welcome + setup — {name}" checklist: welcome e-mail, WSLP checklist started, attendance course
  present, contact method on file; grace window offered (policy).
- Completion: checklist ticked or 10 school days elapsed with a note.
- Source: district onboarding; WAC 392-550-025 (plan before first count day).
- Judgment: no.

**RS-02 Student missing from the latest import / status changed**
- Conditions: present in the previous import, absent now (or ALE status → closed/dropped while Edgenuity active,
  or the reverse).
- Priority: data.
- Action: task "Confirm status — {name}" with record_exception (withdrawn / transferred / archived in Edgenuity /
  import error).
- Evidence shown: both sources' status and dates.
- Completion: status confirmed. `[Rev A]` Outcomes *withdrawn / transferred / archived* cancel the student's open
  steps with the reason (MP-01 for the partial month stays, flagged); *import error* cancels nothing and the next
  import clears the finding. While unconfirmed, the student's other steps are `waiting: status confirmation` and
  their findings are *Cannot Evaluate*.
- Source: WAC 392-121-182 (enrollment detail); reconciliation.
- Judgment: partial.

**RS-03 Advisor or teacher changed**
- Conditions: the advisor of record (`program.advisor_source`, default ALE) differs from the previous import.
  `[Rev A]` If the Edgenuity token and the ALE advisor disagree with each other, RS-03 emits a data finding
  "advisor mismatch" and nothing moves until it is resolved.
- Priority: housekeeping.
- Action: reassign open steps (event with old/new owner; completed events keep the old owner), step "Confirm
  caseload change" for the new advisor.
- Completion: acknowledgment.
- Judgment: no.

**RS-04 WSLP checklist incomplete**
- Trigger: `daily`.
- Conditions: any required WSLP element unchecked ≥ 10 school days after `plan_start`, or a course added after the
  last checklist update.
- Priority: housekeeping (legal_deadline if the next count day is within 5 school days and the checklist is empty).
- Action: task "Update WSLP checklist — {name}".
- Completion: checklist complete or "plan updated in ALE" note with date.
- Source: WAC 392-550-025 required elements; OSPI ALE Self-Assessment.
- Judgment: yes (the plan content).

### 4.6 Data health (DH)

**DH-01 Source stale or missing** — Edgenuity older than `data.edgenuity_stale_school_days`, ALE log older than
`data.ale_log_stale_days`, enrollment older than 30 days, no calendar for the current year. Priority: data
(blocks dependent rules, which show "unverified" instead of firing). Action: task "Import {source}" with the
one-click importer / Edgenuity export window. Completion: fresh import. Judgment: no.

**DH-02 ALE sync failed** — three consecutive failed pulls or contact verification pending > 24 h. Action: task
for the user (reconnect) and, if repeated, the admin. Completion: successful pull.

**DH-03 Import anomaly** — roster shrank > `roster.drop_threshold_pct`; duplicate SIDs (`[Rev A]` in an Edgenuity
file one SID per course row is normal; the check is two `User ID`s or two names under one SID, or a repeated SID
in an ALE enrollment file); name differs between sources for one SID (warn, with both values and a "same
student — confirm" action; never auto-merge); the same name under two SIDs (warn "possible duplicate person");
SID missing from External
ID; dates outside the school year; pacing outside −100…100; progress > 100; file older than the current dashboard;
Excel-style dates detected in an ALE log; header set unknown. Severity per check: `block` (unknown headers,
duplicate SIDs with conflicting names, roster shrink) or `warn`. Blocked imports are stored, not applied, until the
user confirms "apply anyway" (event recorded). Judgment: no.

**DH-04 Contact-log week not pulled** — a school week in the current or evaluated month has no ALE pull covering
it. Action: task "Pull contact log for week of {w}" (or import the CSV). WC rules for that week emit "unverified".

**DH-05 Silent-failure watchdog** — backup older than 24 h while the app was open; a module global missing after
load; calendar `last_day` passed; `[Rev A]` system clock behind the last recorded event (scan refuses to run).
Action: admin task. (Prevents the class of failures found in the audit.)

**DH-06 Evidence disappeared** `[Rev A]` — a contact that resolved a finding is absent from two consecutive pulls,
or an app-written contact is never seen in ALE (`verification_state → unverified`). Action: anomaly shown on the
student page with *accept (reopen the finding)* / *keep (the evidence stands, with a note)*. The finding is never
reopened silently.

**AP-01 Applicability unknown / AP-02 Applicability conflict / AP-03 Regime unassigned** `[Rev B]` — see §2.11.
Severity data; never legal; one configuration task per cause for the oversight role; the student stays visible
with universal findings and a *Request mapping* action; heuristic hints (course prefix, teacher list, school) are
attached as suggestions marked "not used".

### 4.7 Rule summary table

| Rule | Severity | Judgment | Auto-resolves on data |
| --- | --- | --- | --- |
| WC-01 week without recorded contact | contact | yes (outcome) | yes (late evidence) |
| WC-02 at risk | contact | no | yes |
| WC-03 2nd/3rd missed week | legal_deadline | yes | no |
| WC-04 parent notification | contact | partial | no |
| WC-05 15–19 school days | contact | no | yes |
| WC-06 20+ school days (tier of WC-05) | legal_deadline | yes | partial |
| WC-07 follow-up | contact | no | yes |
| WC-08 evidence fields | housekeeping | no | yes |
| PR-01 no activity | progress/contact | no | yes |
| PR-02 pacing drop | progress | no | yes |
| PR-03 expiring/expired | progress | partial | yes |
| PR-04 new-student check | progress/contact | no | yes |
| PR-05 grade out | housekeeping | no | yes |
| PR-06 senior projection (optional) | progress | yes | yes |
| MP-01 evaluation due | legal_deadline | **yes** | no |
| MP-02 communicated | legal_deadline | no | no |
| MP-03 no DPC this month | contact | no | yes |
| IP-01 plan due | legal_deadline | **yes** | no |
| IP-02 checkpoint | legal_deadline | yes | no |
| IP-03 month 2 | legal_deadline | yes | no |
| IP-04 month 3 | legal_deadline | yes | no |
| IP-05 family notified | contact | no | no |
| RS-01..04 roster/plan | housekeeping/data | partial | partial |
| DH-01..06 data health | data | no (DH-06: accept) | yes |
| AP-01..03 applicability `[Rev B]` | data | no (administrator configures) | yes |

---

## 5. Priority and ordering

`priority = severity_weight × urgency × exposure`, computed per task and stored with its components.

| Severity | Weight |
| --- | --- |
| legal_deadline | 100 |
| contact | 60 |
| progress | 30 |
| housekeeping | 10 |
| data | 40 (data tasks sort into their own "Fix data first" group at the top) |

Urgency: overdue 3.0 (+0.1 per school day overdue, max 4.0); due today 2.0; due this week 1.5; no date 1.0.
Exposure: 1.0 + 0.2 × consecutive missed weeks + 0.3 × consecutive unsatisfactory months + 0.2 × expired courses
+ 0.2 if senior + 0.1 if new student, capped at 2.5.

Ties: earlier due date, then student name. `[Rev A]` The queue renders **cases** (§2.6a): a case's priority is the
maximum of its steps, so exposure components do not stack across steps; steps inside a case follow dependency
order. The ordering function is pure and unit-tested with the synthetic dataset. The per-student `risk_score`
mentioned in §2.2 is removed from Phase 1 (its weights were never defined); case priority orders students.

---

## 6. Import → Data Health pipeline

1. **Receive** (picker, drag-drop, Downloads watcher, ALE sync). Hash the file; refuse an identical hash already applied.
2. **Sniff** headers → import kind and column mapping (tenant `csv_mappings` first, then built-in aliases). Unknown → blocked with the detected headers shown.
3. **Parse** into staging rows with the shared parsers (dates local, percentages, times).
4. **Checks** (DH-03) → `checks_json`; compute `health`.
5. **Preview** to the user: counts, health, what will change (students added/removed, advisor changes, snapshot date vs current).
6. **Apply** (or "apply anyway" with a reason): write `import`, `student`, `enrollment`, `course_snapshot` / `contact` rows; update `source_status`; emit `import.completed`.
7. **Scan** (§7.3) runs automatically after apply.

The "older file" rule stays: a snapshot older than the current one is stored as history and does not become the live view;
`[Rev A]` the Data strip says so ("stored as history — live view unchanged, 9/25 is newer"). An identical file hash
is refused with the time it was first applied.

---

## 7. Teacher workflow

```
Import ─▶ Data Health ─▶ Automatic Scan ─▶ Today's Work ─▶ Student Evidence ─▶ Action ─▶ Completion ─▶ Audit History
```

### 7.1 Import
The teacher drops the Edgenuity export (or the Downloads watcher offers it) and, when available, the ALE files
(or ALE sync pulls them). The import screen shows one row per source with freshness. Nothing else is required
to start the day.

### 7.2 Data Health
Immediately after apply, the Data Health strip shows each source's state and any DH tasks. A `blocked` import
never changes the dashboard silently; a `warn` shows what to look at. Rules that depend on a stale source show
"unverified" badges rather than firing.

### 7.3 Automatic Scan
Runs after every apply, on first launch each school day, and on calendar/policy change, in the utility process.
Steps: rebuild derived fields → evaluate every rule for every active subject → reconcile findings (open new,
touch existing, resolve vanished with the reason) → create/update tasks → compute priorities → write
`scan.completed` with counts and input hashes. A scan of 60 students × 25 rules must finish under two seconds.

### 7.4 Today's Work
The queue (wireframe §8.2). Groups: *Fix data first* (DH), *Legal deadlines*, *Contact*, *Progress*,
*Housekeeping*, then *Waiting* (snoozed) and *Done today*. Each card: student, the top task title, the "why" line,
due date with derivation on hover, primary action button, secondary actions in a menu. Filters follow the
dashboard's who-filters (school/counselor/advisor/teacher) `[Rev B]` plus a *Regime* facet; the scope bar shows
"n ALE · n CR · n unconfirmed"; each card header carries a regime badge and the enrollment breakdown ("2 ALE · 1
CR"); a collapsed *Needs configuration* group lists `unknown` students with their universal findings; a CR-only
caseload shows no legal or contact groups and no weekly-contact language. The Today card and Reminder Center
become views of the same steps.

### 7.5 Student Evidence
Opening a card shows the student page: header (status, advisor, plan dates, contact method), the open tasks,
and the evidence timeline (contacts by week, snapshots, evaluations, plans, notes, exceptions, e-mails), plus the
monthly packet when an evaluation is open. Every fact carries its source and timestamp. The MPR packet section
lists: courses (progress/target/gap/grade/last activity/target date/projected finish), trend since last month,
contacts by week with qualifying marks, attendance-course weeks, previous evaluation and plan, missing items;
`[Rev B]` only `R-scope` enrollments enter the proposals, and enrollments resolved `not_required` are listed under
"other enrollments (not in the ALE plan)". A CR-only student has no packet; a mixed teacher's packet list shows
them under a collapsed "not evaluated (no ALE plan)" heading with the count.

### 7.6 Action
`[Rev B]` **External Action Policy.** Actions that touch outside systems are abstract ids
(`communication.compose_email`, `communication.open_outlook`, `contact.record_local`, `contact.queue_evidence`,
`contact.open_record_system`) resolved through T2 provider descriptors; ALE is named in exactly one place, the
`contact_record_system` descriptor. The policy table `(regime, context, applicability) → [{action, mode:
auto|offer|never|fallback}]` decides what follows a communication. The roster ✉ button (and the AI and
smart-template e-mail paths, which today compose, open the mail client and open the ALE student page 250 ms later
for every student) becomes a composite: compose with a context (`student` or `course`) → open the mail client →
record the e-mail locally (always) → documentation post-action per policy: ALE-tracked student → `queue_evidence:
auto` (the existing ALE queue dialog, pre-filled; the ALE page opens only as a fallback when the queue provider is
unavailable); not ALE → nothing beyond the local record, with the reason shown; course-level e-mail about a
non-plan course of an ALE student → `offer` (one-click chip); unknown applicability → `offer` with a warning chip
and the configuration task, never silent. A record-system window opened for the same student within
`external.record_system_reopen_minutes` is focused, not reopened. Every decision writes `external_action.decided`
with the policy row, the applicability resolution and the outcome, and the student timeline prints "ALE opened
because… / ALE not opened because…". Full behaviour table: `COMMAND-CENTER-APPLICABILITY-MODEL.md` §5–§6.

Actions run the existing mechanisms: contact_log runs `contact.queue_evidence` (today: the ALE queue pre-filled
with type, date, note; returns the ALE contact id after verification); draft_email opens the preview modal (the
Email Advisory flow) with a grounded draft and records recipients, subject, body hash and time; write_plan opens the plan editor pre-filled from the packet;
record_exception asks for a typed reason and window; open_mpr_packet shows proposals with **Confirm** per row;
`[Rev A]` there is no "confirm all": a row becomes selectable for **Confirm selected (n)** only after its facts were
expanded in this session and only when every line is *Reliable*; each confirmation is its own event. The
pre-filled district form (Laserfiche at Pasco, T2) opens after confirmation. Judgment-required
tasks show the badge and never auto-complete.

### 7.7 Completion
A task closes by evidence (linked automatically when the action returns one), by data (the next scan sees the
condition gone; state `resolved_by_data` with the resolving fact), by exception (typed, with window), or
manually with a note (allowed only for housekeeping and progress tasks; contact and legal tasks require
evidence or exception). Snooze needs a reason, is capped, and `[Rev A]` never passes a legal due date. Every
transition is an event.

### 7.8 Audit History
Per student: the timeline with a "what changed since" selector and an **Audit Ready** button that generates the
packet (PDF + manifest + CSV slices, hashes) for a date range. `[Rev B]` Packet sections are regime-driven: an ALE
student gets the compliance sections; a CR-only student gets enrollment history, communications, progress
snapshots and change log under the header "no ALE requirements applied ({program}, district v{n})"; a mixed student
gets both with the enrollment breakdown; every packet prints the applicability resolution used and the AP findings
open in the period. The exceptions report computes ALE columns over ALE-tracked students only and adds *CR students*
and *unknown applicability* columns. Per caseload: the exception report (per advisor:
open/overdue by severity, evidence-gap rate, students at 15–19 / 20+ school days, evaluations unrecorded, plans
overdue). Program: chain verification status, scan history, policy and calendar change log.

### 7.9 State machines

Task: `open → in_progress → {done | resolved_by_data | exception | cancelled}`; `open|in_progress → waiting →
open` (on `waiting_until`); any closed state `→ open` on `reopened` (with reason; `[Rev A]` no time limit — an
auditor's question in May may reopen a September item; a finding closed by data reopens only through DH-06).

Evaluation: `not_started → packet_ready → confirmed → form_opened → submitted → recorded`; `packet_ready`
refreshes on data change until `confirmed`; `confirmed → packet_ready` only by the teacher ("re-evaluate", event).

Plan: `due → open → checkpoint_due → open (revised) | closed_success | closed_escalated | closed_status_change`;
`[Rev A]` after `closed_escalated` (IP-04) a new plan needs a new trigger; a revised trigger determination puts an
open plan in `open (trigger revised)` for the teacher to close.

---

## 8. Text wireframes

Widths are indicative; the app's existing visual identity (header, tiles, Records List) stays. New screens use
the same card language.

### 8.1 Import & Data Health

```
┌─ Data ───────────────────────────────────────────────────────────────────────────────────────┐
│ Source                 Last update            Health     Action                                │
│ Edgenuity export       Fri 9/25 8:02 (today)  ● fresh    [Import file] [Open Edgenuity export]  │
│ ALE contact log        Thu 9/24 (ALE sync)    ● fresh    [Pull now]  next auto pull 10:30       │
│ ALE enrollment         Mon 9/21               ● fresh    [Pull now]                              │
│ Students report        Fri 9/11               ○ aging    [Import file]   (e-mails/birthdays)     │
│ School calendar        2026–27 · 2 questions  ● ok       [Answer]                                │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Last import: EdgenuityEnrollments_09_25_2026.csv · 35 rows · 12 students · applied 8:02         │
│ ⚠ 1 warning: ALE_Contact_Log.csv has Excel-style dates (9/23/2026) — parsed as dates, OK.        │
│ ✔ Checks passed: headers, duplicate IDs, date range, roster size (12 → 12), pacing range.       │
│ [View check details]                                                                            │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
Blocked example:
│ ✖ Not applied: EdgenuityEnrollments_09_26_2026.csv — roster shrank 12 → 4 (67 %).                │
│   This usually means a filtered export. Re-export without filters, or [Apply anyway…] (reason).  │
```

### 8.2 Today's Work (queue)

```
┌─ Today's Work · Advisor GH · Fri Sep 25 (week of 9/20, 4 school days left in Sept window) ────┐
│ Scope: [All schools ▾] [All counselors ▾] [Advisor GH ▾] [All teachers ▾] [Regime: all ▾]  ↻ 8:03 │
│ 4 ALE · 0 CR · 0 unconfirmed                                                            [Rev B]   │
│ 1 data · 2 legal deadlines · 3 contact · 2 progress · 1 housekeeping · 1 waiting · 3 done today │
├─ FIX DATA FIRST ─────────────────────────────────────────────────────────────────────────────┤
│ ▲ Contact log for week of 9/13 was not pulled — weekly-contact checks for that week are          │
│   unverified for 12 students.                                     [Pull now] [Import CSV]        │
├─ LEGAL DEADLINES ────────────────────────────────────────────────────────────────────────────┤
│ ● Dawson, Kayla  412004 · gr 12 · senior                                      DUE TODAY 9/25    │
│   Intervention plan due — Unsatisfactory evaluation on 9/18.                                      │
│   Why: 9/18 + 5 school days = 9/25 (Labor Day already passed; no closures skipped).              │
│   Plan: not started. Draft prepared from the packet.                          ⚖ judgment          │
│   [Write plan ▸]   [Plan already in ALE]  [⋯ delegate · snooze · evidence]                        │
│ ● Espinoza, Luis  412005 · gr 10                                              OVERDUE 2 days     │
│   19 school days without a qualifying contact — tier 20+ on Mon 9/28; may affect the 10/1 count.   │
│   Why: last student-type contact Email 8/29; 19 school days since (skipped 9/7). A Parent contact   │
│   on 9/19 does not count (with_whom = parent only). · WC-05 v1 · T1 v3 · as of 9/25 08:00 · Reliable│
│   [Contact + log ▸]  [Record exception]  [⋯]                                                       │
├─ CONTACT ────────────────────────────────────────────────────────────────────────────────────┤
│ ● Chen, Marcus  412003 · gr 11                                    case · 5 steps · OVERDUE        │
│   Contact: no qualifying contact this week (Thu passed); 16 school days since Phone 9/2;           │
│   no course activity 11 school days; e-mail 9/20 unanswered.  Teacher Initiated 9/20 is outbound. │
│   Acknowledge weeks 9/6 and 9/13 (unreviewed) — WC-03 review opens if both are marked missed.      │
│   [Contact + log ▸] [Acknowledge 2 weeks] [Draft e-mail] [⋯]   · WC-05 v1 · T1 v3 · Reliable      │
│ ● Hale, Jordan  412008 · gr 11                                    case · 2 steps                  │
│   Contact: no qualifying contact this week. Acknowledge week of 9/13 (unreviewed); last qualifying │
│   contact Email 9/12 (week of 9/6).      [Contact + log ▸] [Acknowledge] [⋯] · WC-02 v1 · Reliable │
│ ○ Foster, Emma  412006 · gr 9 · new 9/21                                       grace until 10/18  │
│   Welcome + setup checklist (RS-01): welcome contact, WSLP started, attendance course, contact      │
│   method on file · start check day 5: 0 % in both courses.            [Checklist ▸] [Contact] [⋯] │
├─ PROGRESS ───────────────────────────────────────────────────────────────────────────────────┤
│ ○ Johnson, Aaliyah 412010   Pacing dropped in Algebra 2 A (−6.0 → −12.0 since 9/18); projected   │
│   finish 2/9 vs target 1/22.                                   [Draft e-mail] [Contact] [⋯]        │
│ ○ Baker, Priya 412002       No course activity 8 days (Geometry A last entry 9/17).               │
├─ HOUSEKEEPING ───────────────────────────────────────────────────────────────────────────────┤
│ ○ Gutierrez, Sofia 412007   Ready to grade out: Economics 98.5 %, no ungraded work.  [Checklist]  │
├─ WAITING (1) ▸    DONE TODAY (3) ▸                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Student Evidence

```
┌─ Chen, Marcus · 412003 · TH GH · gr 11 · Chiawana HS ───────────────────────────────────────┐
│ ALE plan active 8/24 → 6/10 · advisor GARCIA · student e-mail on file · guardian on file          │
│ Case priority 312 (contact step: 16 school days, no activity 11 school days) · confidence Reliable │
│ Eval Sept: not started (packet ready)                                                              │
├─ Open steps (5) ─────────────────────────────────────────────────────────────────────────────┤
│ ● Acknowledge week of 9/6 — no qualifying contact recorded               unreviewed [Acknowledge] │
│ ● Acknowledge week of 9/13 — no qualifying contact recorded              unreviewed [Acknowledge] │
│ ● Contact — this week · 16 school days since 9/2 · no activity 11 school days · 9/20 e-mail      │
│   unanswered (WC-02, WC-05, PR-01, WC-07)                                            [Contact]    │
│ ● September evaluation — window 9/24–9/30 (MP-01)                                  ⚖ [Packet]    │
│ ○ Progress outreach — Algebra 2 A −29.4 → −35.4, Chemistry A −25.0 → −31.0 (PR-02)   [Draft]      │
├─ Weeks (Sun–Sat) ───────────────────────────────────────────────────────────────────────────┤
│ 8/30 ✔ Email 9/2 (GARCIA)   9/6 ✖ —   9/13 ✖ (Teacher Initiated 9/20 does not count)   9/20 ◔ in progress │
├─ Courses (import 9/25) ─────────────────────────────────────────────────────────────────────┤
│ Algebra 2 A   3.0 % / target 38.4 (−35.4)  grade 52.0  last entry 9/10  target 1/22  proj. —      │
│ Chemistry A   5.5 % / target 36.5 (−31.0)  grade 58.0  last entry 9/10  target 1/22  proj. —      │
│ Attendance    20 % · missing this week (last activity 9/10)                                        │
├─ Timeline ───────────────────────────────────────────────────────────────────────────────────┤
│ 9/25 08:03  scan      case updated: 5 steps (WC-01 ×2 unreviewed, WC-02, WC-05 16d, PR-01, PR-02)  │
│ 9/24 10:30  ALE sync  contact log pulled (weeks 9/13, 9/20)                                        │
│ 9/20        contact   Teacher Initiated e-mail — "Pacing check-in" (outbound; does not qualify)    │
│ 9/18 14:12  import    EdgenuityEnrollments_09_18: pacing −29.4 → −35.4 (Algebra 2 A)               │
│ 9/02        contact   Phone with student — "Weekly check-in" (qualifies)                            │
│ [Show all ▾]   [Audit Ready packet ▸]   [Add note]   [Record exception]                            │
├─ September evaluation packet (proposed) ─────────────────────────────────────────────────────┤
│ Progress summary: NO PROGRESS (avg 4.3 % < 10, behind in all)   Communication: UNSATISFACTORY     │
│ (1 of 3 judged weeks met)   Direct contact this month: Phone 9/2 ✔                                │
│ [Open packet ▸]                                                                                   │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 8.4 Action: Contact + log

```
┌─ Log contact — Chen, Marcus ─────────────────────────────────────────────────────────────────┐
│ Date [9/25/2026]  Type [Phone ▾] (qualifies ✔)   With [Student ▾]   Method [phone]              │
│ Subject (required for WAC evidence) [Weekly check-in: pacing plan for Algebra 2 A, Chemistry A]  │
│ Notes [ 🎤 voice ]  ________________________________________________________________________     │
│ This closes: WC-01 week of 9/20 (in progress). It does NOT close week of 9/13 (past).             │
│ ⓘ Written to ALE only after you confirm in the Windows dialog; verified on the next pull.         │
│ [Save to ALE queue]   [Cancel]                                                                   │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 8.5 Action: MPR packet

```
┌─ September 2026 evaluations · Advisor GH · window 9/24–9/30 · 4 working days left ──────────┐
│ Student            Proposed summary        Proposed comm.     Direct contact   Trend    Status     │
│ Alvarez, Diego     On Target [F1..F4]      Met (3/3)          Teams 9/23 ✔     ▲ +4.2   [Confirm]  │
│ Baker, Priya       Adequate/Needs Impr.    Met (3/3)          Phone 9/24 ✔     ▼ −1.1   [Confirm]  │
│ Chen, Marcus       No Progress             Unsatisfactory     Phone 9/2 ✔      ▼ −6.0   [Review ▸] │
│ Johnson, Aaliyah   Adequate/Needs Impr.    Met (3/3)          Email 9/23 ✔     ▼ −6.0   [Confirm]  │
│ [☐ reviewed] per row · [Confirm selected (0)]  (rows enable after expanding; Chen: not selectable)  │
├─ Chen, Marcus — review ──────────────────────────────────────────────────────────────────────┤
│ Proposed: Unsatisfactory (rule: both progress and communication unsatisfactory; policy = both).    │
│ Would change if: one more qualifying contact this week → Needs Improvement (still Unsatisfactory   │
│ overall under "both"? no → Satisfactory).                                                          │
│ Progress summary  ( ) On Target ( ) Adequate (•) No Progress   ← your determination               │
│ Communication     ( ) Met ( ) Needs improvement (•) Unsatisfactory                                 │
│ Narrative draft (cites [F#]; edit freely):                                                          │
│ "Monthly Progress Review for September with Marcus, by phone on 9/2 [F7]. Challenges: Algebra 2 A  │
│  35.4 % behind [F2] …"                                                                              │
│ ⚖ Confirming Unsatisfactory creates: intervention plan due 10/2 (+5 school days), checkpoint       │
│   10/9, family notification task.                                                                   │
│ [Confirm determination]  [Open pre-filled form ▸] (enabled after confirm)  [I submitted it]        │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 8.6 Completion / exception

```
┌─ Record exception — Hale, Jordan · week of 9/13 ────────────────────────────────────────────┐
│ Reason [Arranged absence ▾]  (district justification code AA-2)                                  │
│ Applies to [week of 9/13 ▾] … [week of 9/13 ▾]   Note [Family travel, approved by counselor 9/10] │
│ This suppresses WC-01 for the selected weeks and does not count toward consecutive/cumulative.    │
│ Recorded by Helen Garcia · visible in the audit packet.                                           │
│ [Record]  [Cancel]                                                                                │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 8.7 Audit History / Audit Ready

```
┌─ Audit Ready — Chen, Marcus · 8/24/2026 → 9/25/2026 ────────────────────────────────────────┐
│ Sections: [✔] Enrollment history  [✔] Weekly contacts (date/method/subject/who)  [✔] Evaluations  │
│           [✔] Interventions  [✔] Course progress snapshots  [✔] Communications  [✔] Change log     │
│ Missing evidence (will be listed in the packet): 2 weeks without qualifying contact (9/6, 9/13);   │
│   September evaluation not recorded; WSLP checklist 9/14 items unchecked.                          │
│ Output: AuditPacket_412003_2026-08-24_2026-09-25.zip (PDF + manifest.json + CSV) · hashes           │
│ [Generate]                                                                                         │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 8.8 Administrator exceptions

```
┌─ Program exceptions · September · oversight view ───────────────────────────────────────────┐
│ Advisor  Students  Contacted this wk  Overdue legal  Contact steps  Evidence gaps  15–19d  20+d  Evals unrecorded │
│ (each count shows confirmed / unverified / cannot-evaluate; weeks unreviewed are listed, never "missed")  [Rev A] │
│ GH       4         75 %               1              2              1             1       1     4                 │
│ STA      4         50 %               1              1              0             0       1     4                 │
│ KL       4         100 %              0              0              0             1       0     4                 │
│ [Export report] [Names ▾ (oversight roles only)]   Chain verified 8:03 ✔ · last scan 8:03           │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Non-functional requirements

- **Determinism and testability:** rules and priority are pure functions; a scan records input hashes; the
  synthetic dataset in `qa/sample-data` is the golden fixture. `[Rev A]` The expected outputs are the golden run G1
  and the per-rule matrix in `COMMAND-CENTER-BRAIN-V1-VALIDATION.md` §9 (as-of 2026-09-25, test calendar with
  Labor Day 9/7): Chen WC-01 ×2 (unreviewed), WC-02, WC-05 (16 school days), WC-07, PR-01 (act), PR-02 ×2, MP-01,
  proposal No Progress / Unsatisfactory 1/3; Espinoza WC-01 ×3, WC-02, WC-05 at 19 school days (tier 20+ on 9/28),
  WC-08, PR-01, PR-02 ×2, MP-01, MP-03; Hale WC-01, WC-02; Foster RS-01 + PR-04 day 5, no WC (grace), MP-01 not
  required until 9/27; Dawson PR-03 (severity progress, grade 71); Baker and Johnson PR-02 ×2; Kowalski none
  (Physics −4.9 is on pace); Ibarra excluded. Tests compare `(rule_id, sid, subject_key, confidence, tier)` sets and
  proposal tuples, never UI text, and assert that forbidden words never appear in automatic text.
- **Performance:** scan < 2 s for 100 students; queue render < 300 ms; packet generation < 10 s per student.
- **Privacy:** no network calls from Brain; drafts by the local model use fact ids and are labelled; exports
  redact free-text notes unless included on purpose; event log holds references, not note bodies.
- **Migration:** shared helpers first (calendar, sid, classifier), then the SQLite model with a one-way sync from
  the legacy stores, then rules one at a time while the old panels remain until parity; a feature switch per
  staff member (the existing feature-access mechanism) turns the queue on.
- **Roles:** advisor/teacher see their caseload; oversight roles see the exception report and names; readonly
  sees nothing editable. Reassignment and delegation are events.
- **Explainability:** every finding stores `facts_json` and the rule version; the UI never shows a warning without
  the facts, the rule name, the policy values and the citation.

## 10. Open decisions for the district (must be set before Phase 1 ships)

1. Qualifying contact types and whether attendance-course completion counts (policy default from current practice).
2. Day-0 counting for the 5-school-day plan deadline; whether breaks pause the consecutive-month counter.
3. Board-policy justification codes for missed weeks.
4. The evaluation window (last five working days) and whether a late evaluation counts for the prior month.
5. Whether the Laserfiche submission satisfies "communicated to the family".
6. Who may confirm evaluations for online-only plans (support staff vs certificated).
7. Retention period for events and packets (SOS schedule).
8. `[Rev A]` School days allowed to communicate a confirmed evaluation (`mpr.communicate_within_school_days`, default 3).
9. `[Rev A]` Partial-month evaluations: minimum judged weeks for a required evaluation (default 1) and whether a
   withdrawn student's final month is evaluated.
10. `[Rev A]` Whether non-school weeks interrupt a consecutive missed-week run (default: they do not).
11. `[Rev A]` Whether counters reset when a student re-enrolls after a closed plan (default: yes).
12. `[Rev A]` Whether expired courses count in the progress proposal (default: yes, flagged).
13. `[Rev A]` Whether a contact without a subject qualifies for the weekly requirement (default: yes, with an
    evidence-gap step).
14. `[Rev B]` Which programs are Washington ALE programs, with authoritative defaults, and whether an ALE-plan
    student's untagged Edgenuity courses are plan courses by default.
15. `[Rev B]` Whether the district's credit-recovery practice gets its own regime rules (for example a no-activity
    outreach ladder) and whether Contact Watch binds to it.
16. `[Rev B]` The External Action Policy rows for the district's record system, in particular the mode for
    course-level e-mails on non-plan courses (default `offer`).

## 11. Revision A changelog `[Rev A]`

Applied 2026-09-25 from `research/COMMAND-CENTER-BRAIN-V1-VALIDATION.md` (documentation only, no code):
guiding rule 6 (confidence and language); WC-01 as a missed-week record with an acknowledgment step and three
outcomes; WC-03/WC-04 driven by acknowledged weeks only; WC-05/WC-06 merged into one tiered finding with corrected
wording; MP-P1..P3 proposal rules and judged weeks declared; MP-01/02/03 restructured as one evaluate step with an
after-month attestation path; IP-01 no longer duplicates IP-03; subject keys per rule; case/step model (§2.6a);
confidence levels, source states and horizons, `verification_state`; configuration tiers (§3.1) and new policy
keys; extended audit event schema, correction protocol and integrity statement; confirm-selected instead of bulk
confirm; RS-03 mismatch rule and RS-02 outcomes; PR-01 scope and null anchor; PR-02 resulting-bucket and
minimum-drop conditions; PR-04 per enrollment; PR-06 optional senior projection; required-week rule, non-school
weeks, re-enrollment episodes; DH-06 evidence-disappeared anomaly; risk score removed; snooze cap at legal due
dates; reopen without time limit; `explain_json` schema; corrected golden expectations; district decisions 8–13.

## 12. Revision B changelog `[Rev B]`

Applied 2026-09-25 from `research/COMMAND-CENTER-APPLICABILITY-MODEL.md` (documentation only, no code): guiding
rules 7–8 (rule exists ≠ rule applies; explicit records only); §2.11 regime and applicability model with levels
L2–L6, resolution order, conflict and expired-override handling, student aggregate and `applicability_json`;
registry fields `regimes` and `guard`; finding state `resolved_by_applicability`; T0 split into per-regime
definitions and scope with no default applicability; policy keys for program assignment, course mapping, external
systems and the External Action Policy; the applicability gate in §4; AP-01..03; Today's Work regime facet, badges
and "Needs configuration" group; MPR packet `R-scope` enrollments; Audit Ready and exceptions report per regime;
the roster e-mail composite action with `auto / offer / never` documentation post-actions and decision events;
district decisions 14–16.
