# Command Center Brain v1 — Functional Specification

**Status:** specification only (no code). Prepared 2026-09-25 from `research/COMMAND-CENTER-NEXT-GEN.md` and the
QA audit of Command Center 0.2.46. Phase 1 scope: everything here runs on data the app already has (Edgenuity
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

Derived per student: `worst_bucket`, `any_expired`, `failing_count`, `max_inactive_days`, `risk_score`
(single weighted score with its components; see §5).

### 2.3 Contact / evidence

`contact` — every interaction, regardless of source.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | id | |
| `sid` | text | |
| `contact_date` | date | Local; parsed from ISO or M/D/YYYY (audit C2) |
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
| `dedupe_key` | text, unique | `sid|date|type|author` |

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
| `waiting_until`, `waiting_reason` | date, text | Snooze; max per policy |
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
mark_done_with_note, delegate, snooze, open_student_evidence.

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
| `evaluate(ctx, subject) → Finding[]` | function | Pure; no I/O |
| `task_for(finding) → TaskSpec` | function | |
| `closes_when(ctx, finding) → bool` | function | Auto-resolution check |
| `evidence_shown(ctx, finding) → Fact[]` | function | The facts the UI lists |

`finding`: `{id, rule_id, rule_version, sid, subject_key (e.g. week or month), first_seen_run, last_seen_run,
facts_json, explanation, state: active|resolved|suppressed, suppressed_by (exception id)}`. A finding is
idempotent on `(rule_id, sid, subject_key)`.

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
| `actor` | text | Staff username or `system` |
| `type` | text | `import.completed`, `scan.completed`, `finding.opened`, `finding.resolved`, `task.*`, `evidence.added`, `evaluation.confirmed`, `plan.created`, `plan.version`, `exception.recorded`, `policy.changed`, `calendar.changed`, `packet.generated`, `ai.draft` |
| `sid` | text, nullable | |
| `payload_json` | json | Minimal facts; free text by reference |
| `prev_hash`, `hash` | text | `hash = sha256(prev_hash + canonical(payload))` |

SQLite triggers reject UPDATE and DELETE on `event`. A `verify_chain()` routine runs weekly and on packet
generation. Existing desktop audit rows (`audit` table) are kept and mirrored into `event`.

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
fresh|aging|stale|missing|failed`, `message`. Thresholds from policy (Edgenuity stale after 3 school days;
ALE log stale after 7 calendar days; enrollment stale after 30).

---

## 3. Policy settings (district-configurable, shown in every explanation)

| Key | Default (Pasco) | Used by |
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

Every change to policy writes a `policy.changed` event and triggers a full re-evaluation.

---

## 4. Phase 1 rules

Common attributes: **Trigger** lists events; every rule also runs on `daily` (first launch each school day) and on
`calendar_change`/`policy_change`. **Required data** names sources that must not be `stale`/`missing`; otherwise the
rule emits `DH-gap` instead of a student finding. **Who can complete** is the task owner unless stated (advisor
of record; oversight roles may reassign). Priorities are severity classes; the numeric order is in §5.

### 4.1 Weekly contact (WC)

**WC-01 Weekly contact missing (completed week)**
- Trigger: `import:ale_log`, `ale_sync`, `import:edgenuity` (attendance completions), `daily`.
- Required data: ALE log fresh; calendar.
- Conditions: student `is_active`; week `w` is a completed school week (≥3 school days) on or after `plan_start`;
  no contact with `qualifies = true` and `week_key = w`; no exception covering `w` (grace, arranged absence,
  district justification); not already resolved.
- Priority: contact; urgency from weeks elapsed (1 week = due now, 2+ = overdue).
- Action created: task "Contact {name} — week of {w}" with actions contact_log, draft_email, record_exception,
  open_student_evidence.
- Evidence shown: last qualifying contact (date, type, author); non-qualifying entries that week (with the
  reason they do not count, e.g. "Teacher Initiated is outbound only"); attendance-course status that week;
  streak (consecutive missed) and cumulative missed count for the year; the policy list of qualifying types.
- Who can complete: advisor of record / any certificated staff with the student on their caseload.
- Completion criteria: a qualifying contact dated inside week `w` appears (auto: `resolved_by_data`), or an
  exception covering `w` is recorded (`exception`), or the student becomes inactive (`cancelled`, reason).
  A contact dated in a later week does not close it; it closes the later week's finding.
- Source: WAC 392-550-020 (definitions), 392-550-025/-030 (weekly contact), 392-550-065 (evidence: date,
  method, subject); district policy on qualifying types.
- Judgment required: yes for whether an exception applies; no for detection.

**WC-02 Weekly contact at risk (current week)**
- Trigger: `daily` from `policy.contact.at_risk_weekday`; imports.
- Required data: ALE log fresh (else shown as "unverified" rather than at risk).
- Conditions: current week is a school week; today ≥ at-risk weekday; no qualifying contact yet this week; no
  exception.
- Priority: contact, urgency = due end of week.
- Action: task "Reach {name} this week"; actions as WC-01.
- Evidence shown: days left in the week; last qualifying contact; scheduled items (attendance course status).
- Completion: qualifying contact this week (auto) or exception; converts to WC-01 if the week ends without one.
- Source: same as WC-01.
- Judgment: no.

**WC-03 Second consecutive / third cumulative missed week (conference + screener + data-based plan)**
- Trigger: after WC-01 evaluation.
- Required data: ALE log fresh; exceptions.
- Conditions: unjustified missed weeks (WC-01 findings without exception) reach 2 consecutive or 3 cumulative
  in the school year for an active student.
- Priority: legal_deadline (district must hold a conference and develop a data-based intervention plan).
- Action: task "Conference + screener + intervention plan — {name}" with actions write_plan (kind: contact),
  record_family_notification, draft_email, delegate (counselor).
- Evidence shown: the missed weeks with their dates; justification status per week; prior notifications;
  Contact Watch step (the district ladder: reach out / meeting / archive) shown as "district practice" beside
  the WAC step.
- Who: advisor of record; conference may involve counselor/admin (delegation recorded).
- Completion: a plan of kind `contact` saved with participants and a conference date, plus a
  family-notification evidence; or exception (student status change).
- Source: WAC 392-550-040, 392-550-045 (board policy justifications); district Contact Watch ladder.
- Judgment: yes.

**WC-04 Parent notification after an unjustified missed week**
- Trigger: WC-01 finding survives one school day without exception.
- Conditions: student active; no `family_notification` evidence for week `w`.
- Priority: contact.
- Action: task "Inform parent/guardian — missed contact week of {w}" with draft_email (guardian template),
  phone note, record_family_notification.
- Evidence shown: guardian e-mail/phone on file (or "none on file" as a data task), the missed week facts.
- Completion: family-notification evidence for `w` (direct personal contact with parent per WAC), or exception.
- Source: WAC 392-550-040(1) (inform parents by direct personal contact when weekly contact is missed without
  valid justification).
- Judgment: partial (content of the notification).

**WC-05 Approaching count exclusion (15–19 school days without certificated-teacher contact)**
- Trigger: `daily`, imports.
- Required data: ALE log fresh; calendar.
- Conditions: school days since last qualifying contact between `policy.contact.school_days_warn` and
  `school_days_exclude − 1`.
- Priority: contact, urgency rising daily.
- Action: task "Contact before day 20 — {name} ({n} school days)"; actions contact_log, draft_email, phone note.
- Evidence shown: the count with its calendar derivation (which closures were skipped), last contact, next
  count day and whether the student would be excluded on it.
- Completion: qualifying contact (auto).
- Source: WAC 392-121-182 (20 consecutive school days); district count-day calendar (392-121-119).
- Judgment: no.

**WC-06 20+ school days without contact (count-day exclusion risk)**
- Conditions: school days since last qualifying contact ≥ `school_days_exclude`.
- Priority: legal_deadline.
- Action: task "20+ school days without contact — {name}: contact, then confirm resumed participation" with
  contact_log, record_exception (status change), delegate (enrollment office notification).
- Evidence shown: as WC-05 plus the count days already passed while excluded; a note that the student is
  excluded from the count until they meet a certificated teacher and resume participation.
- Completion: qualifying contact **and** the teacher ticks "resumed participation" (judgment), or status change.
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
- Priority: data (rises to contact if it is the week's only qualifying contact).
- Action: task "Complete contact record — {date}, {type}" with actions edit_in_ale (opens ALE), add_subject (app-side
  annotation stored as evidence).
- Evidence shown: the row, the missing field, why it matters (WAC 392-550-065 evidence list).
- Completion: field present on the next pull, or app-side annotation saved.
- Source: WAC 392-550-065.
- Judgment: no.

### 4.2 Progress and activity (PR)

**PR-01 No course activity**
- Trigger: `import:edgenuity`, `daily`.
- Required data: Edgenuity fresh.
- Conditions: active student; `max_inactive_days ≥ policy.activity.warn_days` (warn) or school days without a
  gradebook entry ≥ `activity.act_school_days` (act); no grace/exception; student not new (< 5 school days).
- Priority: progress (warn) / contact (act).
- Action: task "No activity {n} days — {name}" with draft_email (no-activity template), contact_log, phone note.
- Evidence shown: per course last gradebook entry, active time, progress; last qualifying contact.
- Completion: a gradebook entry after the task opened (auto on next import) or a qualifying contact + note; or exception.
- Source: district policy (10-day/no-activity); supports WAC weekly contact.
- Judgment: no.

**PR-02 Pacing deterioration**
- Trigger: `import:edgenuity`.
- Required data: at least two snapshots within `pacing.window_days + 7`.
- Conditions: pacing fell by ≥ `pacing.drop_points` within the window, or bucket moved down one class.
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
- Conditions: earliest course start ≤ 5 school days ago and progress 0 in all courses (day 5); or ≥ 10 school
  days and any course < `newstudent.min_progress` (day 10).
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
- Judgment: no.

### 4.3 Monthly progress (MP)

**MP-01 Monthly evaluation due / missing**
- Trigger: `daily`; `import:ale_log`; MPR window opens (last `mpr.window_working_days` working days).
- Required data: Edgenuity fresh; ALE log for the month (weeks missing → data gap shown inside the packet, not
  silence).
- Conditions: active student enrolled during month M; no `evaluation` in state ≥ `confirmed` for M; today inside
  or after the window.
- Priority: legal_deadline (due = last working day of the month; overdue after).
- Action: task "Monthly evaluation — {name} ({M})" with open_mpr_packet.
- Evidence shown: the packet summary (proposed determinations, weeks met, direct contact present, trend since last
  month), what is missing (no DPC this month, contact-log week not pulled).
- Who: certificated teacher of record (or school-based support staff for online-only plans where district policy
  allows — configurable).
- Completion: evaluation confirmed **and** recorded (submitted or teacher-confirmed), with a DPC linked and
  communication recorded per MP-02.
- Source: WAC 392-550-030 (monthly evaluation with DPC), RCW 28A.232.010; WAC 392-121-182 (prior-month evaluation
  before count day).
- Judgment: **yes — the determination**. Brain only proposes.

**MP-02 Evaluation communicated (student; parent for K-8)**
- Trigger: evaluation confirmed.
- Conditions: `communicated_to.student` missing, or grade ≤ `mpr.parent_grade_max` and `communicated_to.parent` missing.
- Priority: legal_deadline (same window as MP-01).
- Action: task "Share {M} evaluation with {student / parent}" with draft_email (evaluation summary), record_family_notification.
- Evidence shown: the confirmed determination, guardian contact on file.
- Completion: communication evidence recorded (the Laserfiche submission may satisfy this when the district
  form notifies the family — policy flag).
- Source: WAC 392-550-030.
- Judgment: no.

**MP-03 Evaluation lacks direct personal contact**
- Trigger: packet build.
- Conditions: no qualifying two-way contact in month M for an active student.
- Priority: contact (blocks MP-01 from opening the form).
- Action: task "Direct contact needed before {M} evaluation — {name}" with contact_log, draft_email, phone note.
- Evidence shown: contacts this month by type and why none qualifies.
- Completion: qualifying contact in M (auto).
- Source: WAC 392-550-030 ("must include direct personal contact").
- Judgment: no.

### 4.4 Intervention (IP)

**IP-01 Intervention plan due (5 school days)**
- Trigger: evaluation confirmed unsatisfactory (or "failed to follow the plan" flag).
- Conditions: no `plan` in state ≥ open for `(sid, trigger_month)`.
- Priority: legal_deadline; due = `add_school_days(evaluation_date, plan.due_school_days)`.
- Action: task "Write intervention plan — {name} (due {date})" with write_plan (draft pre-filled from the packet),
  record_family_notification, delegate.
- Evidence shown: the evaluation, the behind courses with daily-goal math, previous plan (if any) and its
  checkpoint result, consecutive-unsatisfactory count, parent-participation requirement (grade ≤ 8).
- Who: certificated teacher of record.
- Completion: plan saved with strategies, at least one WAC option, participants (parent when required), checkpoint
  date; optional ALE write. Family notification is IP-05.
- Source: WAC 392-550-030, 392-550-020 (intervention plan definition).
- Judgment: **yes — plan content**.

**IP-02 Checkpoint review due**
- Trigger: plan saved; `daily`.
- Conditions: `checkpoint_date ≤ today` and `checkpoint_result = not_reviewed`.
- Priority: legal_deadline (overdue after the date).
- Action: task "Checkpoint review — {name}" with record_checkpoint (shows goal vs current numbers), write_plan (revise).
- Evidence shown: goal, progress/grade/contacts since the plan date, snapshots.
- Completion: checkpoint result recorded (on/not on track) with a note; optional ALE goal review.
- Source: district practice implementing "implemented" (WAC 392-550-030); ALE progress-monitoring goals.
- Judgment: yes.

**IP-03 Second consecutive unsatisfactory month — plan review**
- Trigger: evaluation confirmed unsatisfactory with `consecutive_unsat_months = 2`.
- Conditions: policy `plan.escalate_month2`; break-month pause per policy.
- Priority: legal_deadline.
- Action: task "Review and revise the intervention plan — {name} (2nd month)" with write_plan (new version), record_family_notification.
- Evidence shown: both evaluations, the plan, checkpoint results, what changed.
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
- Conditions: `first_seen_import = latest`.
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
- Completion: status confirmed; open tasks for the student are cancelled with the reason.
- Source: WAC 392-121-182 (enrollment detail); reconciliation.
- Judgment: partial.

**RS-03 Advisor or teacher changed**
- Conditions: advisor token/ALE advisor differs from the previous import.
- Priority: housekeeping.
- Action: reassign open tasks (with event), task "Confirm caseload change".
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

**DH-03 Import anomaly** — roster shrank > `roster.drop_threshold_pct`; duplicate SIDs; SID missing from External
ID; dates outside the school year; pacing outside −100…100; progress > 100; file older than the current dashboard;
Excel-style dates detected in an ALE log; header set unknown. Severity per check: `block` (unknown headers,
duplicate SIDs with conflicting names, roster shrink) or `warn`. Blocked imports are stored, not applied, until the
user confirms "apply anyway" (event recorded). Judgment: no.

**DH-04 Contact-log week not pulled** — a school week in the current or evaluated month has no ALE pull covering
it. Action: task "Pull contact log for week of {w}" (or import the CSV). WC rules for that week emit "unverified".

**DH-05 Silent-failure watchdog** — backup older than 24 h while the app was open; a module global missing after
load; calendar `last_day` passed. Action: admin task. (Prevents the class of failures found in the audit.)

### 4.7 Rule summary table

| Rule | Severity | Judgment | Auto-resolves on data |
| --- | --- | --- | --- |
| WC-01 missing week | contact | exception only | yes |
| WC-02 at risk | contact | no | yes |
| WC-03 2nd/3rd missed week | legal_deadline | yes | no |
| WC-04 parent notification | contact | partial | no |
| WC-05 15–19 school days | contact | no | yes |
| WC-06 20+ school days | legal_deadline | yes | partial |
| WC-07 follow-up | contact | no | yes |
| WC-08 evidence fields | data | no | yes |
| PR-01 no activity | progress/contact | no | yes |
| PR-02 pacing drop | progress | no | yes |
| PR-03 expiring/expired | progress | partial | yes |
| PR-04 new-student check | progress/contact | no | yes |
| PR-05 grade out | housekeeping | no | yes |
| MP-01 evaluation due | legal_deadline | **yes** | no |
| MP-02 communicated | legal_deadline | no | no |
| MP-03 no DPC this month | contact | no | yes |
| IP-01 plan due | legal_deadline | **yes** | no |
| IP-02 checkpoint | legal_deadline | yes | no |
| IP-03 month 2 | legal_deadline | yes | no |
| IP-04 month 3 | legal_deadline | yes | no |
| IP-05 family notified | contact | no | no |
| RS-01..04 roster/plan | housekeeping/data | partial | partial |
| DH-01..05 data health | data | no | yes |

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

Ties: earlier due date, then student name. The queue groups by student, showing the highest task first with the
others collapsed, so a student with four findings is one card. The ordering function is pure and unit-tested with
the synthetic dataset.

---

## 6. Import → Data Health pipeline

1. **Receive** (picker, drag-drop, Downloads watcher, ALE sync). Hash the file; refuse an identical hash already applied.
2. **Sniff** headers → import kind and column mapping (tenant `csv_mappings` first, then built-in aliases). Unknown → blocked with the detected headers shown.
3. **Parse** into staging rows with the shared parsers (dates local, percentages, times).
4. **Checks** (DH-03) → `checks_json`; compute `health`.
5. **Preview** to the user: counts, health, what will change (students added/removed, advisor changes, snapshot date vs current).
6. **Apply** (or "apply anyway" with a reason): write `import`, `student`, `enrollment`, `course_snapshot` / `contact` rows; update `source_status`; emit `import.completed`.
7. **Scan** (§7.3) runs automatically after apply.

The "older file" rule stays: a snapshot older than the current one is stored as history and does not become the live view.

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
dashboard's who-filters (school/counselor/advisor/teacher). The Today card and Reminder Center become views of
the same tasks.

### 7.5 Student Evidence
Opening a card shows the student page: header (status, advisor, plan dates, contact method), the open tasks,
and the evidence timeline (contacts by week, snapshots, evaluations, plans, notes, exceptions, e-mails), plus the
monthly packet when an evaluation is open. Every fact carries its source and timestamp. The MPR packet section
lists: courses (progress/target/gap/grade/last activity/target date/projected finish), trend since last month,
contacts by week with qualifying marks, attendance-course weeks, previous evaluation and plan, missing items.

### 7.6 Action
Actions run the existing mechanisms: contact_log opens the ALE queue pre-filled (type, date, note) and returns
the ALE contact id; draft_email opens the preview modal (the Email Advisory flow) with a grounded draft and
records recipients, subject, body hash and time; write_plan opens the plan editor pre-filled from the packet;
record_exception asks for a typed reason and window; open_mpr_packet shows proposals with **Confirm** per row
(bulk confirm allowed only for On Target + Met), then opens the pre-filled Laserfiche form. Judgment-required
tasks show the badge and never auto-complete.

### 7.7 Completion
A task closes by evidence (linked automatically when the action returns one), by data (the next scan sees the
condition gone; state `resolved_by_data` with the resolving fact), by exception (typed, with window), or
manually with a note (allowed only for housekeeping and progress tasks; contact and legal tasks require
evidence or exception). Snooze needs a reason and is capped. Every transition is an event.

### 7.8 Audit History
Per student: the timeline with a "what changed since" selector and an **Audit Ready** button that generates the
packet (PDF + manifest + CSV slices, hashes) for a date range. Per caseload: the exception report (per advisor:
open/overdue by severity, evidence-gap rate, students at 15–19 / 20+ school days, evaluations unrecorded, plans
overdue). Program: chain verification status, scan history, policy and calendar change log.

### 7.9 State machines

Task: `open → in_progress → {done | resolved_by_data | exception | cancelled}`; `open|in_progress → waiting →
open` (on `waiting_until`); any closed state `→ open` on `reopened` (with reason; only within 30 days).

Evaluation: `not_started → packet_ready → confirmed → form_opened → submitted → recorded`; `packet_ready`
refreshes on data change until `confirmed`; `confirmed → packet_ready` only by the teacher ("re-evaluate", event).

Plan: `due → open → checkpoint_due → open (revised) | closed_success | closed_escalated | closed_status_change`.

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
│ Scope: [All schools ▾] [All counselors ▾] [Advisor GH ▾] [All teachers ▾]   Last scan 8:03 ↻   │
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
│   20+ school days without a qualifying contact (23) — count-day exclusion risk.                   │
│   Why: last student-type contact Email 8/29; 23 school days since (skipped 9/7). Next count day   │
│   10/1. A Parent contact on 9/19 does not count (with_whom = parent only).                        │
│   [Contact + log ▸]  [Record exception]  [⋯]                                                       │
├─ CONTACT ────────────────────────────────────────────────────────────────────────────────────┤
│ ● Chen, Marcus  412003 · gr 11                                    week of 9/13 · OVERDUE 1 wk    │
│   Weekly contact missing (2 consecutive weeks: 9/6, 9/13).                                        │
│   Why: no qualifying contact; Teacher Initiated e-mail 9/20 is outbound only. Streak 2 → WC-03  │
│   conference + plan task created.                                                                 │
│   [Contact + log ▸] [Draft e-mail] [Arranged absence] [⋯]                     + 2 more tasks ▾   │
│ ● Hale, Jordan  412008 · gr 11                                    week of 9/13 · OVERDUE 1 wk    │
│   Weekly contact missing. Last qualifying contact Email 9/12 (week of 9/6).                       │
│   [Contact + log ▸] [Draft e-mail] [⋯]                                                            │
│ ○ Foster, Emma  412006 · gr 9 · new 9/21                                       grace until 10/18  │
│   Reach this week (at risk: Thursday, no contact yet). Grace period active — not counted.         │
│   [Contact + log ▸] [⋯]                                                                           │
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
│ Risk 78 (contact gap 23d ×, extremely behind ×2, failing ×2)   Eval Sept: not started (packet ready)│
├─ Open tasks (3) ─────────────────────────────────────────────────────────────────────────────┤
│ ● WC-03 Conference + screener + plan (2 consecutive missed weeks)        due 9/30   ⚖ [Start]    │
│ ● WC-01 Weekly contact missing — week of 9/13                            overdue    [Contact]    │
│ ○ PR-01 No activity 15 days (Algebra 2 A, Chemistry A)                              [Draft]      │
├─ Weeks (Sun–Sat) ───────────────────────────────────────────────────────────────────────────┤
│ 8/30 ✔ Email 9/2 (GARCIA)   9/6 ✖ —   9/13 ✖ (Teacher Initiated 9/20 does not count)   9/20 ◔ in progress │
├─ Courses (import 9/25) ─────────────────────────────────────────────────────────────────────┤
│ Algebra 2 A   3.0 % / target 38.4 (−35.4)  grade 52.0  last entry 9/10  target 1/22  proj. —      │
│ Chemistry A   5.5 % / target 36.5 (−31.0)  grade 58.0  last entry 9/10  target 1/22  proj. —      │
│ Attendance    20 % · missing this week (last activity 9/10)                                        │
├─ Timeline ───────────────────────────────────────────────────────────────────────────────────┤
│ 9/25 08:03  scan      WC-03 opened (2 consecutive unjustified weeks)                               │
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
│ [Confirm all On Target + Met (1)]                                                                  │
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
│ Advisor  Students  Contacted this wk  Overdue legal  Contact tasks  Evidence gaps  15–19d  20+d  Evals unrecorded │
│ GH       4         75 %               1              2              1             1       1     4                 │
│ STA      4         50 %               1              1              0             0       1     4                 │
│ KL       4         100 %              0              0              0             1       0     4                 │
│ [Export report] [Names ▾ (oversight roles only)]   Chain verified 8:03 ✔ · last scan 8:03           │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Non-functional requirements

- **Determinism and testability:** rules and priority are pure functions; a scan records input hashes; the
  synthetic dataset in `qa/sample-data` is the golden fixture — each scenario student must produce a named set
  of findings (Chen: WC-01×2, WC-03, PR-01, MP proposal No Progress/Unsatisfactory; Foster: RS-01, grace, no WC;
  Dawson: PR-03 expired, IP-01 after an Unsatisfactory confirmation; Espinoza: WC-06, PR-01; Hale: WC-01;
  Ibarra: excluded as archived).
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
