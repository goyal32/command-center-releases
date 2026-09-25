# Command Center Brain v1 — Adversarial Validation

**Status:** review only. Prepared 2026-09-25 against `research/COMMAND-CENTER-BRAIN-V1-SPEC.md` (commit 2513d87).
No production code was read, modified, or built for this document. Reviewer hats: senior engineer, Washington ALE
program administrator, ALE teacher/advisor, QA engineer, privacy/security reviewer.

**How to read this.** Section 1 lists the problems that would make Phase 1 fail in front of a teacher or an auditor;
each carries a student scenario and the revision that removes it. Sections 2–9 are the detailed audits the request
asked for. Section 10 is the consolidated change list; the ones marked **applied** were written into the spec
(documentation only) in the same commit as this report, under the spec's new "Revision A" changelog.

**Fixture conventions used in every scenario.** As-of date Friday 2026-09-25 unless stated. Test calendar: school
days Monday–Friday from 2026-08-24, one closure (Labor Day 2026-09-07). School weeks are Sunday–Saturday:
week 8/23, 8/30, 9/6, 9/13, 9/20 (current). Students are the twelve synthetic students in `qa/sample-data`
(412001 Alvarez … 412012 Lopez). All school-day counts below were computed against that calendar, not estimated;
the spec's wireframe figure "23 school days" for Espinoza is wrong (it is 19 on 9/25 and 20 on Monday 9/28), which
is itself finding C-11 below: no count may appear in the UI or a test unless the calendar service produced it.

---

## 1. Critical specification problems

Each item: what the spec says, why it fails, the scenario, the fix. "Applied" means the spec was changed.

**C-1. Past-week WC-01 tasks can never be completed.** WC-01 creates a task "Contact {name} — week of {w}" for a
*completed* week, and its completion criteria are a late-logged contact inside that week, an exception, or the
student leaving. A teacher cannot go back and make contact inside a week that has ended. *Scenario:* Chen misses
weeks 9/6 and 9/13. On 9/25 the teacher calls Marcus, logs a Phone contact dated 9/25, and sees the two "Contact
Chen — week of 9/6 / 9/13" tasks still open, still overdue, and rising in priority every day. By November the
advisor has thirty unclosable tasks and stops trusting the queue. *Fix (applied):* a completed week without a
qualifying contact is a **missed-week record**, not a "contact" task. The one task it creates is "Acknowledge
week of {w}" with exactly three outcomes: *Contact happened — log it* (late evidence), *Justified* (typed
exception), *Missed — no justification* (acknowledged). The acknowledgment is also the human-judgment point that
fixes C-2. Contact-now work lives on the current week only (WC-02) and on the student case (§6).

**C-2. "Unjustified" is inferred by the software, then drives legal actions.** WC-03 counts "unjustified missed
weeks (WC-01 findings without exception)" and WC-04 fires a parent-notification duty under WAC 392-550-040 "after
an unjustified missed week". Absence of an exception row is not a determination that no valid justification
exists; the teacher may know the student was hospitalized and simply not have recorded it yet. The software would
be telling a parent, and later an auditor, that contact was "missed without valid justification" on its own
authority. *Scenario:* Hale's family travel was approved by the counselor on 9/10; the exception is not entered;
on Monday 9/21 WC-04 tells the advisor to inform the guardian of an unjustified missed week and the Program
exceptions report counts it against the advisor. *Fix (applied):* the engine only ever states "no qualifying
contact recorded". A week counts toward WC-03 and triggers WC-04 only after the teacher acknowledges it as
*Missed — no justification* (C-1). Until acknowledged, the week is "unreviewed" and appears as such in every
report. Language rule added to the spec's guiding rules.

**C-3. Monthly-evaluation deadlock after month end.** MP-03 "blocks MP-01 from opening the form" when the month has
no direct personal contact, and MP-01 completes only when MP-02 communication is also recorded. Once September
ends, no contact can be dated in September, so an MP-01 for a student who could not be reached is blocked forever,
while its priority grows daily as a legal deadline. *Scenario:* Espinoza (no student contact all September, one
parent-only contact 9/19). On 10/1 the teacher must still record the evaluation (WAC requires it, and the count day
needs the prior-month evaluation), but the packet will not open. *Fix (applied):* MP-03 blocks bulk/one-click
confirmation only; after the month ends it becomes a **packet flag**. The teacher may confirm with an explicit
attestation "no direct personal contact was achieved this month; attempts: [linked outreach records]" which is
stored on the evaluation, shown in the packet and the audit output, and never hidden. MP-02 becomes a step inside
the evaluation case rather than a second open task (see C-6).

**C-4. The evaluation proposal logic is not specified.** `proposed_summary` and `proposed_comm` come "from rules
(today's MPR module logic)". A rule that is not written down is neither explainable nor deterministic, and the
judged-week set (which weeks belong to September) is undefined, so "1 of 3 weeks met" cannot be reproduced.
*Scenario:* the week 9/20–9/26 ends on Saturday 9/26; on Friday 9/25 the packet says 3 judged weeks, on Sunday 9/27
it says 4, and two teachers confirming on different days get different proposals for the same student with no
visible reason. *Fix (applied):* §4.3.0 in the spec now declares the proposal rules (MP-P1 progress, MP-P2
communication, MP-P3 overall) with thresholds as policy keys, and defines *judged weeks* = completed school weeks
whose Saturday falls in the month and that end on or after the student's `plan_start`. The packet prints the judged
weeks by date.

**C-5. Episodic rules have no idempotency key, so findings churn.** A finding is idempotent on `(rule_id, sid,
subject_key)` but `subject_key` is defined only for weeks and months. PR-01 (no activity), PR-02 (pacing drop),
PR-03 (expiry), WC-05/06 (day counts) and WC-07 (follow-up) would either collide (one finding forever, reopened
each time) or duplicate (a new finding per scan). *Scenario:* Baker goes inactive 9/1–9/9, works 9/10, goes inactive
again 9/17–9/25. With key = sid the second episode silently *reopens* the first task including its old snooze and
notes; with key = scan id she gets a new task every morning. *Fix (applied):* the spec's §2.7 now defines the
subject key per rule (episode anchors: last gradebook entry date, last qualifying contact date, enrollment id +
target date, outbound record id, snapshot pair).

**C-6. One underlying problem fans out into up to nine tasks.** For a student who has simply not been reached, the
spec fires WC-01 (per week), WC-02, WC-03, WC-04 (per week), WC-05 or WC-06, WC-07, PR-01 (act tier), MP-03 and,
after the evaluation, IP-05 and MP-02. The queue "groups by student" visually but the tasks remain separate, each
with its own state, snooze and completion. *Scenario:* Chen on 9/25: WC-01 ×2, WC-04 ×2, WC-02, WC-03, WC-05,
WC-07, PR-01, PR-02 ×2, MP-01, MP-03 = 13 open tasks, of which one phone call would satisfy six. *Fix:* the
**student case** model in §6 of this document (applied to the spec as §2.6a): findings stay individual; the teacher
sees one case with ordered *steps* keyed by need (contact, acknowledge, evaluate, plan, notify family, progress
outreach, housekeeping, data), and one action closes every finding whose completion criterion it satisfies.

**C-7. IP-01 and IP-03 both fire on the second unsatisfactory month.** IP-01's condition is "no plan in state ≥ open
for `(sid, trigger_month)`"; month 2 is a new trigger month, so IP-01 fires a fresh "write plan" task alongside
IP-03's "revise plan". *Scenario:* Chen unsatisfactory in September (plan written 10/1) and October: on 11/2 the
advisor sees "Write intervention plan — due 11/6" and "Review and revise the intervention plan (2nd month)" for the
same student. *Fix (applied):* IP-01 fires only when the student has no plan in state `open`/`checkpoint_due`;
when one exists, the month-2 duty is IP-03 (new version of the existing plan) and the 5-school-day deadline attaches
to that version.

**C-8. Data confidence is binary and coverage is not modelled.** Rules see a source as fresh or not. A contact-log
pull made Wednesday 9/23 at 10:30 cannot verify a call made Thursday 9/24, yet "fresh" (≤ 7 days) lets WC-02 state
"no contact yet this week" on Friday, and lets WC-01 state "no qualifying contact" for a week that ended after the
pull. Contacts queued in the app but not yet verified by a pull are not modelled at all. *Scenario:* the advisor
logs a Teams call with Hale on Thursday via the ALE queue; the sync fails silently; on Friday the queue says Hale
has no contact this week and the exception report counts him. *Fix (applied):* the four-level confidence model in
§5 of this document (Reliable / Warning / Incomplete / Cannot Evaluate) with a **coverage horizon** per source and a
`verification_state` on contacts. Findings carry confidence; wording is fixed per level.

**C-9. Pasco-specific configuration is presented as product defaults.** The policy table is headed "Default
(Pasco)"; External-ID token positions, Laserfiche, the Contact Watch ladder, the attendance-course pattern, counselor
codes and e-mail policy text appear inside rule definitions. A second district would inherit Pasco's compliance
posture silently. *Fix (applied as §3.1 in the spec, designed in §7 here):* four configuration tiers with
precedence and locking; every value carries its tier badge in the UI.

**C-10. The audit event model is thinner than an auditor needs and its integrity claim is overstated.** Events lack
explicit before/after values, a reason, the source of the change (import, UI, sync, AI draft, system), the rule /
policy / calendar versions in force, and `happened_at` separate from `recorded_at`. The hash chain is protected by
SQLite triggers that anyone holding the database key can drop, and there is no external anchor, so "append-only" is
a convenience, not a guarantee. *Fix (applied as §2.9 changes):* the extended event schema in §7 of this document
(here: audit-log review), a correction protocol that supersedes rather than edits, and an honest integrity
statement with a weekly head-hash anchor written into the backup manifest and printed on every Audit Ready packet.

**C-11. WC-05/WC-06 overclaim.** They are described as "school days without certificated-teacher contact" and the
WC-06 text says the student "is excluded from the count". Phase 1 cannot know whether the contact author is
certificated (`author_is_certificated` is a Phase 2 field), and the enrollment-count decision belongs to the
district's enrollment office, not the advisor's desktop. *Fix (applied):* wording changed to "qualifying contact
(author certification not verified in Phase 1)" and "may affect the enrollment count; enrollment office decides";
the count is always calendar-derived and displayed with its derivation.

**C-12. Bulk "Confirm all On Target + Met" invites rubber-stamping.** A single click that records ten
teacher determinations is the exact thing the spec promises not to do. *Fix (applied):* a per-row checkbox
"reviewed" that is enabled only after the row's facts have been expanded once in this session, then "Confirm
selected (n)". Rows with any finding below Reliable confidence cannot be selected. Each confirmation is its own event.

**C-13. RS-03 reassigns a caseload from data that can disagree with itself.** The advisor comes from the Edgenuity
External ID token *and* from the ALE `advisor` field. When they differ, auto-reassignment moves open work to whoever
the last import happened to name. *Fix (applied):* if the sources disagree, RS-03 emits a data finding "advisor
mismatch" and nothing moves; the authoritative source is a program-configuration key (default: ALE advisor of record).

**C-14. PR-01 counts inactivity across courses that cannot have activity.** `max_inactive_days` spans all
enrollments, including expired and completed ones, and `last_gradebook_entry` may be null (Foster has never
submitted). *Scenario:* Dawson works daily in Precalculus but her expired US History B course has no entry since
9/15; PR-01 says "No activity 10 days". *Fix (applied):* inactivity is computed over enrollments with status
`active`, not expired and not complete; a null entry anchors on the course start date and is labelled "no work
submitted since start".

**C-15. Partial weeks and non-school weeks are undefined.** Enrolment on a Friday, withdrawal on a Wednesday, and a
Thanksgiving week with two school days all fall through WC-01's "completed school week on or after plan_start".
*Fix (applied):* a week is *required* for a student only if it is a school week and the student's plan was active on
at least `contact.min_enrolled_school_days_in_week` (default 3) of its school days; weeks with fewer than three
school days are not school weeks and neither count as met nor missed; whether a non-week breaks a consecutive streak
is a district key (default: it does not break it).

**C-16. `resolved_by_data` findings reopen silently.** If a contact that closed WC-01 later disappears from the ALE
pull (deleted or edited in ALE), the next scan re-detects the week and reopens the task with no explanation.
*Fix (applied):* re-detection of a finding closed by data is a **data anomaly** (DH-06 "evidence disappeared")
shown on the student page; the finding reopens only when the teacher accepts the anomaly.

---

## 2. Important improvements (non-blocking)

- **I-1 Espinoza-style parent-only contact.** A "Parent" contact for a grade-10 student is currently only an
  evidence-field gap (WC-08). It should also be shown inside the contact step as "1 non-qualifying contact this
  week (Parent)", so the teacher sees the attempt was made.
- **I-2 PR-02 fires for students who are still on pace.** Every student in the three-file fixture lost 6 pacing
  points over 14 days; Alvarez (+7.5 → +1.5) would get a "pacing dropped" task. Applied: PR-02 requires the
  resulting bucket to be `watch` or worse, and excludes expired enrollments.
- **I-3 PR-04 is keyed on the earliest course start.** A course added on 9/14 to a student enrolled 8/24 never gets
  a start check. Applied: PR-04 runs per enrollment (key = enrollment id).
- **I-4 WC-08 lands in "Fix data first".** A missing subject on one of Alvarez's contacts is not a reason to push
  legal deadlines down the screen. Applied: WC-08 is severity `housekeeping` inside the student case, rising to
  `contact` only when it is the week's only qualifying contact.
- **I-5 Risk score weights are unspecified** (§2.2 "single weighted score … see §5", but §5 defines task priority,
  not risk). Either define it or drop it from Phase 1. Recommendation: drop; the case priority already orders students.
- **I-6 `dedupe_key = sid|date|type|author` merges two real phone calls on one day.** Applied: the key includes the
  note hash; identical rows are deduplicated with a count, differing rows are kept.
- **I-7 Time zone.** ALE timestamps carry no offset. Applied: they are parsed as local wall time and never converted
  (the audit's History-screen UTC shift is exactly this bug).
- **I-8 Snooze on legal-deadline tasks.** The spec caps snooze at 5 days with a reason but does not prevent snoozing
  past a legal due date. Applied: `waiting_until` may not exceed the task's due date for `legal_deadline` severity.
- **I-9 Reopen window.** "Any closed state → open on `reopened` … only within 30 days" would prevent reopening an
  evaluation-related task an auditor questions in May. Applied: no time limit; reopening requires a reason and is an
  event.
- **I-10 Contact "with_whom" is inferred from the type label.** A Phone contact could be with a parent. Keep the
  inference but make it editable on the app side and store the edit as evidence (already partly there for `method`).
- **I-11 Grace for new students is offered by RS-01 "policy" but WC-02 shows Foster as "at risk … grace period
  active — not counted" (wireframe 8.2).** Decide one: if grace applies, no WC-02 card at all; show grace on the
  student page. Applied: no WC card during grace; the case shows a "welcome contact" step from RS-01 instead.
- **I-12 Priority component `exposure` counts consecutive missed weeks while WC-03 also exists.** Acceptable, but
  document that the case priority is the max task priority so double counting does not stack.
- **I-13 Scan trigger `task_event`.** Re-running every rule on every task event will make the queue flicker.
  Applied: task events re-run only `closes_when` for the affected student.
- **I-14 The "older file" rule needs a visible outcome.** Importing an older Edgenuity export is stored as history;
  the Data Health strip must say "stored as history, live view unchanged (9/25 is newer)". Applied to §6 text.
- **I-15 Guardian data for K-8 rules.** `mpr.parent_grade_max = 8` and IP participants require a guardian record; the
  fixture has no K-8 students. Add one to the golden fixture (see §8, fixture student 412013).

## 3. Edge cases — required Brain v1 behaviour

Format: situation → what Brain v1 must do → what it must **not** do. "Case" refers to the student case (§6).

| # | Situation | Required behaviour | Must not |
| --- | --- | --- | --- |
| E-1 | **Student enrolls Friday** (plan_start Fri 9/25) | Week 9/20 is not a *required* week (1 enrolled school day < 3). RS-01 opens the welcome/setup step; grace (if policy) starts Monday 9/28. Week 9/27 is the first required week. Student page shows "first required week: 9/27". | Fire WC-01 for 9/20 on Sunday; count 9/20 in any streak; start PR-04's day count before 9/25. |
| E-2 | **Student withdraws midweek** (ALE `dropped_date` Wed 9/23, Edgenuity still active) | RS-02 "Confirm status" (sources disagree). Week 9/20: enrolled Mon–Wed = 3 school days → required under the default policy; shown as "partial (withdrew 9/23)". All other open steps go to `waiting: status confirmation`. On confirmation *withdrawn*: open steps cancelled with reason, September evaluation stays required with a "withdrawn 9/23 — partial month" flag and an *evaluation not required* exception available (district decision D-4). | Silently drop the student from the queue; leave WC tasks accruing overdue days; delete history. |
| E-3 | **Course starts after the ALE enrollment** (plan 8/24, course added 9/14) | Weeks 8/23–9/6 still require contact (the plan was active). PR-04 keyed per enrollment runs the day-5/day-10 check from 9/14. RS-04 flags "course added after last WSLP update". Inactivity anchor for that course = 9/14. | Treat the student as new again for WC grace; count pre-course weeks as missed for progress reasons. |
| E-4 | **Multiple Edgenuity courses** | Enrollment-scoped rules (PR-01..05) produce one finding per course; the case shows one *progress outreach* step listing all courses; the contact step's talking points list every course finding. MPR packet lists all courses. | Create one task per course per rule in the queue. |
| E-5 | **One course expired, others active** (Dawson: US History B target 9/15, Precalculus active) | PR-03 (expired) for US History B only. PR-01/PR-02 ignore the expired enrollment. The MPR packet includes the expired course with an "expired 9/15" flag; whether it counts in the progress proposal is policy `mpr.include_expired_courses` (default true, flagged). | Report "no activity" for the whole student because the expired course has none. |
| E-6 | **Contact occurs Sunday** (9/20) | `week_key = 9/20`: it satisfies the week 9/20–9/26 (WAC 392-550-020 defines the school week as Sunday through Saturday). Shown with weekday in the evidence. | Assign it to the previous week; drop it because it is not a school day. |
| E-7 | **Duplicate rows in the contact log** | Identical `(sid, date, type, author, notes_hash)` → one contact, `rows_deduped` counted in the import card. Same key with different notes → two contacts, both kept, flagged "same day, same type" in the evidence (a real second call is possible). | Silently drop rows that differ; double-count a week. |
| E-8 | **Contact has a date but no subject/notes** | It qualifies for the week (policy `contact.require_subject_to_qualify`, default false). WC-08 opens a housekeeping step "add subject"; the evidence line reads "counts — WAC evidence incomplete (no subject)". Audit packet lists it under "evidence gaps". In strict mode it does not qualify and the week is "unverified pending subject". | Exclude it silently; include it silently. |
| E-9 | **Excel-formatted dates** (`9/23/2026`, `9/23/26`, serial `46288`) | Parse M/D/YYYY and M/D/YY (20YY) as local dates; convert serials 30000–60000 with the 1899-12-30 epoch; DH-03 `warn` "Excel-style dates detected — parsed"; every contact from such a file carries confidence *Warning* until a native export replaces it (same file hash logic). Ambiguous D/M values (day ≤ 12) are noted in the check details. | Sort dates as strings (audit C2); reject the file. |
| E-10 | **Late-imported contact record** (pull on 9/29 adds a Phone contact dated 9/16) | WC-01 missed-week record 9/13 → `resolved_by_data` with the resolving fact and "logged 13 days after the contact date" shown as a fact (not a judgment). If the week had been acknowledged *Missed — no justification*, the acknowledgment stays in history with a `superseded_by` link; WC-03's count recomputes; a WC-03 step not yet started is cancelled with reason; a started plan is left open with a banner "trigger changed — teacher decides". WC-04 notification already sent stays as evidence. | Delete the acknowledgment; retroactively remove a sent notification; leave WC-03 open with a stale count. |
| E-11 | **Teacher changes an MPR determination** (confirmed Unsatisfactory 9/30, revised to Adequate/Met 10/2) | "Re-evaluate" requires a reason; a new `evaluation_version` is appended; the packet keeps both. IP-01 not started → cancelled with reason; plan already open → stays open with "trigger revised" banner, closing is the teacher's decision. `consecutive_unsat_months` recomputes. If the revision goes the other way (Satisfactory → Unsatisfactory on 10/2), IP-01 day 0 = the revised confirmation date 10/2, derivation shows both dates. | Overwrite `confirmed_*`; recompute the plan deadline from the original date without saying so. |
| E-12 | **Intervention completed after the deadline** (plan saved day 7) | Plan saved; task `done`; `late_by_school_days = 2` stored on the plan and printed in the packet and the exceptions report. `plan.created_at` is system time; `plan.meeting_date` (when the conference happened) is a separate teacher-entered field; both shown. | Backdate; hide lateness; refuse the save. |
| E-13 | **Course dropped after an intervention** (plan goal targets Algebra 2 A, course `gone` on 10/12) | IP-02 checkpoint shows "goal course no longer enrolled (gone since import 10/12)" with outcomes *goal void — revise plan* / *not on track* / *on track (other evidence)*. Plan stays open. | Auto-close the plan or the checkpoint; compute "not on track" from a missing course. |
| E-14 | **Student changes advisor** | Both sources agree on the new advisor → RS-03 reassigns open steps (event with old/new owner), the new advisor gets "Confirm caseload change"; completed events keep the old owner. Sources disagree → data finding "advisor mismatch (Edgenuity token GH, ALE STA)", nothing moves; authoritative source per program config. Evaluation in progress: the owner at confirmation time is recorded. | Reassign on one source; lose the previous advisor's in-progress notes. |
| E-15 | **Student changes school** | `school_key` and counselor change; filters follow; no compliance effect; the timeline records "school changed (Pasco HS → Chiawana HS) per ALE enrollment 10/5". | Reset counters or grace. |
| E-16 | **Student returns after withdrawal** (closed 9/10, active again 10/19 with a new plan_start) | Same `sid`, new *enrollment episode*. Weeks 9/13–10/11 are "not enrolled" (neither met nor missed). Streaks and `consecutive_unsat_months` reset per policy `contact.reset_counters_on_reenrollment` (default true); prior history stays visible with the episode boundary drawn. RS-01 fires as "returning student". | Count the gap weeks as missed; merge episodes silently. |
| E-17 | **Incomplete import** (rows rejected, or a file truncated mid-write) | `rows_rejected > 0` → `warn` with the rows listed; students whose rows were rejected get *Incomplete* confidence on rules that need them. Roster shrink beyond `roster.drop_threshold_pct` or a CSV that ends mid-row → `blocked`, stored, not applied. | Apply a truncated file and then cancel tasks for the "missing" students. |
| E-18 | **Stale Edgenuity export** (last file 9/18, today 9/25) | Source `aging` at 2–3 school days, `stale` after 3. PR-* findings: *Warning* while aging, *Cannot Evaluate* when stale (no student task; one DH-01 task "Import Edgenuity export"). MPR packet shows "course data as of 9/18 (5 school days old)"; confirmation requires ticking "confirm using data as of 9/18". | State a pacing or activity fact without its as-of date. |
| E-19 | **Missing ALE contact file** (never imported or sync failing) | WC-*, MP-03: *Cannot Evaluate* → no student contact findings, one DH-01/DH-02 task. Student pages read "Weekly contact cannot be checked — ALE contact log missing since {date}". App-recorded contacts (queue, check-ins) still display with `verification_state = unverified` and may be counted at *Warning* if policy allows. MPR communication proposal is blank ("not proposed — contact evidence unavailable"). | Say "No weekly contact"; count the student in the exceptions report's 15–19/20+ columns (show "unverified: n" instead). |
| E-20 | **Mismatched student names** (same SID, "Chen, Marcus" vs "Chen, Marc") | DH-03 `warn` "name differs between Edgenuity and ALE" with both values; student page shows both; a "same student — confirm" action records evidence. Last-name mismatch beyond a similarity threshold → `warn` escalated in the check details but still not blocking. Same name with two different SIDs → two students, "possible duplicate person" warning. | Auto-merge; auto-rename; block the whole import for one student. |
| E-21 | **Duplicate student IDs** | Edgenuity rows repeat the SID per course — that is normal. Two different `User ID`s or two different names under one SID in one file → `block` (join key broken). ALE enrollment with the same SID twice → `block` unless the rows are identical. | Pick the first row and continue. |
| E-22 | **School holiday inside a five-school-day deadline** (evaluation 9/25, closure 10/2) | `add_school_days(9/25, 5)` = 10/5; derivation "9/25 + 5 school days, skipping Fri 10/2 (closure) → Mon 10/5". If 10/2 is an *uncertain* calendar day not yet answered, the deadline shows "10/2 or 10/5 — answer the calendar question", confidence *Warning*, DH task to answer. | Compute with calendar days; pick one silently. |
| E-23 | **Winter/spring break crossing a deadline** (evaluation 12/18, break 12/21–1/1) | Deadline = 1/8 with the break named in the derivation. Weeks with < 3 school days are not school weeks: neither met nor missed; the streak is not broken by them (district key). Consecutive *months* follow the calendar; whether December/January pause the counter is `plan.consecutive_pause_over_breaks` and the packet states which rule was applied. | Count break weeks as missed; break a streak by a non-week without saying so. |
| E-24 | **Summer enrollment** (plan_start 7/6, no school days in the calendar) | No school weeks → no WC findings; Data Health shows "calendar has no school days for 7/6–8/23"; if the district runs a summer term, the calendar must include it (DH-01 "calendar covers the plan period" check). Count days do not exist in summer. | Treat July as one long missed streak; extrapolate school days. |
| E-25 | **Senior with an approaching graduation deadline** (Gutierrez, gr 12, graduation 6/10) | Phase 1 as specified: senior adds +0.2 exposure; PR-03 checks each course's target date. Recommended addition (applied as optional PR-06): "projected finish {date} is after graduation {date}" for any course whose `projected_finish > program.graduation_date`, severity progress, judgment: counselor. | Present a graduation-risk statement as anything but a projection with its inputs. |

Additional cases found while testing the above:

| # | Situation | Required behaviour |
| --- | --- | --- |
| E-26 | **Contact logged in the app, ALE write pending or failed** | `verification_state: pending` → the week shows "contact recorded in Command Center 9/24 — not yet verified in ALE"; WC-02 does not fire; confidence *Warning*; after 24 h pending → DH-02. Verified on the next pull → `verified`. Missing from two consecutive pulls → `unverified` and DH-06 evidence anomaly. |
| E-27 | **Import applied twice** (same file hash) | Refused with "already applied 9/25 8:02". Same content, different file name → applied as a new import with `rows_changed = 0` and a note. |
| E-28 | **Calendar changed after deadlines were computed** (district adds a closure) | `calendar_version` bumps; every deadline with an anchor after the change date is recomputed; each change is an event with old/new due date; tasks whose due date moved show "due date changed by calendar update". |
| E-29 | **Policy changed mid-month** (qualifying types widened) | Full re-scan under the new policy version; findings resolved by the policy change are closed with `resolved_by_policy` and the old policy version; the audit packet prints the policy version in force on each finding. |
| E-30 | **Two staff on one machine** (shared laptop) | Every event carries the app login; a switch of user mid-session ends the session (existing app login). Tasks owned by advisor A are visible to B only if B's role allows. |
| E-31 | **Clock skew / laptop date wrong** | If `now` is earlier than the last event's `at`, the scan refuses to run and shows "system clock is behind the last recorded event (9/25 08:03)". Deadlines never use a `now` earlier than the last import. |

---

## 4. Rule conflict audit

### 4.1 Same underlying problem, several rules

| Underlying problem | Rules that fire | Scenario | Resolution (applied) |
| --- | --- | --- | --- |
| Student not reached | WC-01 (per past week), WC-02, WC-03, WC-04 (per week), WC-05/06, WC-07, PR-01 act tier, MP-03, later IP-05/MP-02 | Chen 9/25: 9 findings, one need | All map to case need **contact** (one step) plus **acknowledge** (one step per unreviewed week) plus **notify family** (one step, content lists every reason). WC-03 stays its own **plan** step. |
| Course behind | PR-02 per course, PR-03 per course, classifier bucket in MPR proposal | Johnson: 2 courses, 3 findings | One **progress outreach** step; PR-03 expired courses listed first. |
| Evaluation month | MP-01, MP-02, MP-03, IP-01 (after), IP-05 (after) | Espinoza October | One **evaluate** case step with sub-steps DPC → confirm → form → communicate; plan steps open only after confirmation. |
| New student | RS-01, PR-04, WC-02 (grace), RS-04 | Foster | RS-01 owns the student until day 10; PR-04 and RS-04 are checklist lines inside it. |
| Source stale | DH-01 plus every dependent rule "unverified" | Edgenuity 9/18 | DH-01 is the only task; dependent findings are *Cannot Evaluate* and produce nothing. |

### 4.2 Duplicate teacher tasks

- WC-04 per missed week (two parent notifications for two weeks) → one *notify family* step covering all
  acknowledged weeks; the notification evidence links to each week.
- WC-03 requires a family-notification evidence and WC-04 does too → the same evidence satisfies both (evidence
  may close several findings).
- IP-01 and IP-03 on month 2 (C-7).
- MP-01 completion depends on MP-02 while MP-02 is also a task (C-3).
- WC-05 → WC-06 threshold crossing created a second task while the first resolved → one finding with `tier`
  (15–19 / 20+) that upgrades in place, one event "escalated to 20+".
- DH-01 for the same source across scans: idempotent on `(source, last_import_id)`.

### 4.3 Contradictory priorities

- WC-08 (severity `data`, weight 40) sorted into "Fix data first" *above* legal deadlines (I-4). Fixed.
- `data` weight 40 > `progress` 30 but data tasks are in their own group; the weight only matters inside the group.
  Documented.
- WC-04 is `contact` (60) while the WC-03 conference that subsumes it is `legal_deadline` (100): the notification would
  sort below the plan it must precede. Fixed by ordering steps *within* a case by dependency, not by weight.
- PR-01 "act" tier says severity `contact` for a progress condition: keep, but the step is *contact*, so it merges.
- MP-02 `legal_deadline` for a communication step after the evaluation is confirmed on the last day: due date = the
  evaluation due date can already be past at creation. Fixed: MP-02 due = `add_school_days(confirmed_at, 3)`
  (policy `mpr.communicate_within_school_days`, district decision D-8).

### 4.4 Circular workflows

- MP-03 blocks MP-01 after the month ends (C-3). Fixed.
- WC-06 completion requires "resumed participation" which requires the student to work, which the teacher cannot
  cause; combined with `legal_deadline` weight the task tops the queue for weeks. Fixed: after the contact is made
  the step moves to `waiting: resumed participation (checked on each import)` and auto-verifies on the first
  gradebook entry after the contact; the teacher tick remains available as an override with a note.
- Plan → checkpoint → revise → checkpoint with no exit while the student stays unsatisfactory: intended (WAC), but
  IP-04 must cap it at month 3 with the course-of-study decision; after `closed_escalated` a *new* plan requires a
  new trigger. Documented in the plan state machine.

### 4.5 Rules that could reopen completed tasks

- WC-01 after a contact disappears from ALE (C-16). Fixed via DH-06.
- PR-01 re-firing after `resolved_by_data` when the student goes idle again: correct behaviour, but it must be a *new*
  episode (C-5), never `reopened`.
- IP-02: `checkpoint_result` set, then the teacher revises the plan → a new checkpoint date; the old checkpoint
  finding stays resolved (key = plan version + checkpoint date).
- Policy change re-scan: may resolve or open findings but never `reopen`; a finding closed by policy that becomes
  true again under a later policy is a new finding with the new policy version.
- RS-02 "import error" confirmation must **not** cancel tasks (the student is still there); only *withdrawn/
  transferred/archived* cancel. Applied.

### 4.6 Conditions that depend on data that may not exist

| Rule | Missing data | Behaviour (applied) |
| --- | --- | --- |
| WC-01/02/05/06 | `plan_start` (no ALE enrollment import) | Fallback: earliest course `start_date`; evidence line "ALE plan start unknown — using course start 8/26"; confidence *Warning*. |
| WC-01 | `with_whom`, `method` (type not in the policy map) | Unknown type → does not qualify, listed as "type 'X' not in the qualifying list"; DH-03 warn "unknown contact type" so the district can extend the map. |
| WC-04, IP-05, MP-02 | guardian e-mail/phone | Step shows "no guardian contact on file" with a *record guardian contact* sub-action; completion by phone note is allowed. |
| WC-05/06 | certification of the author | Not evaluable in Phase 1; wording adjusted (C-11). |
| PR-01 | `last_gradebook_entry` null | Anchor on course start (C-14). |
| PR-02 | fewer than two snapshots in the window | Rule does not run; the student page shows "trend: not enough history (1 import)". |
| PR-03 | `weekly_rate` null | "expiring" branch uses bucket only; "projected finish: n/a (rate ≤ 0)". |
| PR-05 | `Assignment Status` column absent | "no ungraded work" cannot be checked → finding at *Incomplete* confidence: "100 % complete; grading status unknown (column missing in this export)". |
| MP-01/MP-P | previous month's snapshot absent (first month) | Trend "n/a — first evaluation"; No Progress proposal uses the absolute threshold only. |
| IP-01 | `evaluation_date` when the evaluation was recorded via ALE status only | Day 0 = the date the ALE status was observed, labelled "observed"; district decision D-2 note. |
| RS-04 | WSLP checklist data (app-side only) | If the checklist feature is off for the tenant, RS-04 is disabled by configuration, not by silence. |
| DH-04 | Coverage of a pull | Coverage horizon = pull `snapshot_date` (file date or pull time); weeks ending after it are *Incomplete*. |

### 4.7 False positives (found and fixed)

- Enrolls Friday → WC-01 (E-1). Fixed by required-week rule.
- Expired course drives PR-01 (C-14). Fixed.
- PR-02 on a student still on pace (I-2). Fixed.
- PR-02 bucket-move on a 0.1-point change across a boundary (Baker Biology −4.9 → −5.0). Applied: bucket move alone
  fires only with a drop ≥ `pacing.bucket_move_min_drop` (default 3).
- WC-02 during grace (I-11). Fixed.
- MP-03 for a student whose evaluation is not required this month (Foster, enrolled 9/21). Applied: MP-03 runs only
  when MP-01 is required for the month.
- WC-07 after an outbound e-mail when the reply arrived by a channel ALE does not record: unavoidable; the step is
  low priority and the teacher's *contact happened — log it* outcome closes it in one click.
- DH-03 "duplicate SIDs" on a normal Edgenuity file (E-21). Fixed by defining the check.

### 4.8 False negatives (found and fixed)

- Student withdrawn in ALE but still active in Edgenuity: `is_active` false → no MP-01 for the partial month (E-2).
  Fixed: MP-01 considers `enrolled_days_in_month ≥ 1 school week` regardless of current status.
- Contact typed "Phone" but with a parent (I-10): counts as qualifying though WAC wants student contact. Mitigation:
  editable `with_whom`, and a packet line "contacts assumed with student unless marked".
- Non-school week inside a streak: the streak silently continued or broke depending on implementation (C-15). Fixed by
  policy key.
- Late evaluation recorded in October for September: MP-01 for September closes, but WAC 392-121-182 needs the
  prior-month evaluation *before the count day*. Applied: the packet and the exceptions report show "recorded after
  the October count day (10/1)" as a fact.
- WC-06 when the last contact predates the calendar's first day (student enrolled in August with no contact ever):
  the count anchors on `plan_start`, not on a null contact date. Applied.

## 5. Human-judgment audit and the revised data-confidence model

### 5.1 Where the spec could convert a data signal into an educator determination

| Location | What happens | Class | Change (applied) |
| --- | --- | --- | --- |
| WC-01 → WC-03/WC-04 | "Unjustified" inferred from a missing exception | **Must require educator confirmation** | Acknowledgment outcomes (C-1, C-2). |
| WC-06 text | "the student is excluded from the count" | Must require confirmation (and belongs to the enrollment office) | Wording "may affect the count; enrollment office decides". |
| MP proposals | `proposed_status: satisfactory/unsatisfactory` shown on the queue card and the exceptions report before confirmation | Safe **draft** only if labelled; the report must not count proposals as determinations | Proposals appear only inside the packet, never on cards or in counts; the exceptions report has "evaluations unrecorded", never "proposed unsatisfactory". |
| Bulk confirm | One click confirms many | Must require confirmation per student | C-12. |
| Plan draft "pre-filled from the packet" | A draft could be saved unchanged | Safe draft; save requires the teacher to have edited or explicitly accepted each pre-filled section | "Accept section" toggles; the saved plan records which sections were accepted unedited (fact for the audit). |
| Narrative draft (local AI) | Draft text with fact ids | Safe draft | Already labelled; add: the final narrative stores a diff against the draft so an auditor can see the teacher's authorship. |
| RS-03 reassignment | Data moves ownership | Safe automatic detection; **movement** needs confirmation when sources disagree | C-13. |
| RS-02 cancellation of tasks | Data-confirmed status cancels work | Safe after the teacher's status confirmation | "import error" outcome does not cancel (§4.5). |
| WC-06 "resumed participation" | Teacher tick | Correct (judgment) | Add the data-verified path (§4.4) as *evidence*, the tick remains the determination. |
| PR-03 "extension requested" | Teacher note | Correct | — |
| `failing` label | grade < 70 | Safe detection, but the word "failing" on a card reads as a determination | Cards say "grade 52 (below 70)"; the word "failing" is reserved for the teacher's narrative. |
| IP-04 "course-of-study decision required" | Count of confirmed determinations | Safe detection (all three inputs were teacher determinations) | — |
| `consecutive_unsat_months` with break pause | Policy-driven count | Safe detection; the packet must print the pause rule used | Added to packet contents. |
| WC-08 "does not count (parent only)" | Type-derived `with_whom` | Safe detection with an editable field | I-10. |
| Auto-resolve on data | Finding closes when the condition disappears | Safe for facts (contact appeared, progress reached); unsafe for judgments | Judgment-required findings never auto-resolve (already), and *acknowledged* weeks never auto-resolve except via E-10. |

Classification summary:

- **Safe automatic detection:** presence/absence of qualifying contact rows for a covered week; school-day counts;
  pacing, grade and activity facts; course expiry; roster differences; source freshness; evidence-field gaps;
  deadline arithmetic; the count of teacher-confirmed determinations.
- **Safe recommendation/draft:** e-mail drafts; evaluation *proposals* inside the packet; plan drafts; narrative
  drafts; ordering of the queue; suggested exception reasons; talking points.
- **Must require educator confirmation:** that a missed week was unjustified; every monthly determination; plan
  content and participants; checkpoint result; course-of-study decision; "resumed participation"; whether a partial
  month needs an evaluation; ownership changes when sources disagree; applying a blocked import.

### 5.2 Confidence levels for findings

Every finding and every packet line carries one of four levels, computed by the rule engine from the sources the rule
declared in `required_data` and from per-student anomalies. The level decides wording, whether a task is created,
and what the reports count.

| Level | Definition | Task created? | Counted in reports? | Wording pattern |
| --- | --- | --- | --- | --- |
| **Reliable** | Every required source is `fresh`; its coverage horizon is on or after the end of the subject period; no `warn` anomaly touches this student; no pending/unverified app contact for the period. | Yes | Yes | "No qualifying contact recorded for the week of 9/13 (contact log pulled 9/24 10:30)." |
| **Warning** | A required source is `aging` (past fresh, inside the stale threshold), **or** a non-blocking anomaly touches this student (Excel dates, name mismatch, rejected sibling rows), **or** an app-recorded contact for the period is pending verification, **or** the derivation used a fallback (plan start from course start, uncertain calendar day). | Yes, badge "verify" | Yes, in a separate "unverified" column | "No qualifying contact found — contact log is 4 days old (pulled 9/21); a Teams call logged in Command Center 9/24 is awaiting ALE verification." |
| **Incomplete** | The required source exists but its coverage horizon ends before the subject period ends (a pull on Wed 9/23 for a week ending Sat 9/26), or an optional field the rule needs is absent (assignment status column, guardian e-mail). | Only informational steps (no legal/contact task) | Counted as "not yet evaluable" | "Contact evidence for the week of 9/20 is not yet available (last pull 9/23 covers through Wednesday)." |
| **Cannot Evaluate** | A required source is `stale`, `missing` or `failed`; or the student is absent from the latest import pending RS-02; or the calendar does not cover the period; or the last scan failed for this student. | No student task; one DH task per source | Counted only as "cannot evaluate: n" | "Weekly contact cannot be checked — the ALE contact log has not been pulled since 9/14 (limit 7 days). Import or pull it to evaluate." |

Rules:

1. A rule never emits a student finding below *Incomplete*; at *Cannot Evaluate* the DH rule speaks instead.
2. Confidence is monotone in the pipeline: a case's confidence is the minimum of its steps; the MPR packet's
   confirmation controls are disabled per row when any line is *Cannot Evaluate*, and "Confirm selected" is disabled
   for rows with any *Warning* line until the teacher opens the row (per-row confirm remains allowed with the
   warning printed on the evaluation).
3. The exceptions report shows three numbers per cell: confirmed / unverified / cannot-evaluate. It never blends them.
4. Every level is stored on the finding with the facts that produced it (`confidence_json`: source states, horizons,
   anomalies, fallbacks) so the audit packet can print why a line was marked Warning on the day.
5. Source states and horizons (policy, all shown on the Data strip):

| Source | fresh | aging | stale | Coverage horizon |
| --- | --- | --- | --- | --- |
| Edgenuity export | snapshot_date = today or the previous school day | 2–3 school days | > 3 school days | snapshot_date (activity facts are as-of that date) |
| ALE contact log | pulled today or yesterday | 2–7 days | > 7 days | pull time (contacts after it are unknown) |
| ALE enrollment | ≤ 7 days | 8–30 days | > 30 days | pull time (status changes after it are unknown) |
| Students report | ≤ 30 days | 31–90 days | > 90 days | n/a (contact details only) |
| School calendar | current year present, no unanswered questions | unanswered uncertain days | year missing / `last_day` passed | the dates it defines |

6. A **pending app contact** (queued to ALE, not yet seen in a pull) is displayed as evidence with its state, prevents
   WC-02 from firing for that week, and downgrades the week's confidence to *Warning* until verified. Two pulls without
   it → `unverified`, DH-06 anomaly, the week returns to its data-only state.
7. **Language rules** (enforced by the rule's `explanation` templates, reviewed in tests): the words "missed",
   "unjustified", "excluded", "failing", "unsatisfactory" never appear in an automatic finding; automatic text uses
   "no qualifying contact recorded", "not acknowledged", "may affect the count", "grade below 70", "proposed".

---

## 6. Task deduplication design: the student case

### 6.1 Model (applied to the spec as §2.6a)

`case` — one open case per student at a time (a closed case is history; a new case opens on the next finding).

| Field | Notes |
| --- | --- |
| `id`, `sid`, `opened_at`, `closed_at` | A case closes when it has no open steps. |
| `priority`, `priority_json` | Max of its steps' priorities (§5 of the spec); the components list which step set it. |
| `confidence` | Minimum over steps. |
| `owner` | Advisor of record; steps may be delegated individually. |

`step` — the unit of work shown to a teacher, keyed by `(case_id, need, need_key)`.

| Need | Findings that map to it | need_key | Primary action | Closes when |
| --- | --- | --- | --- | --- |
| **data** | DH-* touching the student, RS-02 | source / anomaly | Import / Pull / Confirm status | The DH finding resolves |
| **acknowledge** | WC-01 missed-week record | week | Acknowledge (3 outcomes) | Outcome recorded |
| **contact** | WC-02, WC-05, WC-06, WC-07, PR-01 (act), MP-03, RS-01 welcome contact | none (one per case) | Contact + log | A qualifying contact dated on/after the step opened appears (verified or pending) |
| **notify family** | WC-04 (acknowledged weeks), IP-05, MP-02 (parent) | month | Draft to guardian / phone note | Family-notification evidence recorded after the step opened; the evidence links every finding it covers |
| **evaluate** | MP-01 with sub-steps DPC → confirm → form → communicate (MP-03, MP-02 student) | month | Open packet | Evaluation `recorded` and communication recorded |
| **plan** | IP-01, IP-03, WC-03 (plan part) | plan version | Write plan | Plan version saved with required elements |
| **review** | IP-02, IP-04 | plan version + checkpoint date / month 3 | Record checkpoint / decision | Result recorded |
| **progress outreach** | PR-02, PR-03, PR-04 (day 10), PR-06 | none | Draft e-mail | Contact + note, or data resolves every finding, or 14 days with a note |
| **housekeeping** | PR-05, RS-03, RS-04, WC-08, PR-04 (day 5) | finding | Checklist / note | Per finding |

Ordering inside a case is by dependency, then priority: data → acknowledge → contact → evaluate → plan → notify
family → review → progress outreach → housekeeping. Rationale: a contact often produces the evidence the later steps
need, and the evaluation must precede the plan.

### 6.2 The worked example

Student on 9/25 with: missing contact (week 9/13, unreviewed), 9 days inactive, 27 % behind in one course,
September evaluation overdue (window open, not confirmed), intervention required (August evaluation was
unsatisfactory and no plan exists).

Findings (all kept individually): WC-01(9/13), WC-02(9/20), PR-01(episode 9/16), PR-02(course A), MP-01(2026-09),
MP-03(2026-09), IP-01(plan for 2026-08, overdue).

**Not five tasks. One case, four steps:**

1. **Acknowledge week of 9/13** — 1 click (outcome).
2. **Contact + log** — why: "no contact this week (Thu passed); no course activity 9 days; needed as this month's
   direct personal contact". Talking points: course A 27 % behind. One log entry closes WC-02, PR-01 (with the
   entry as evidence), MP-03, and supplies the DPC for MP-01. The dialog states "This closes: 3 findings; supplies:
   direct contact for the September evaluation." 1 action (already the app's ALE queue dialog).
3. **September evaluation** — packet already carries the new contact; confirm; form; communicate. 1 confirm + 1
   form + 1 communication evidence (the form submission may satisfy it under D-5).
4. **Intervention plan (overdue since 9/4)** — write plan, family notification as a sub-line. 1 save + 1 notification.

Clicks that the spec as written would have required: 5 separate task opens, 5 completions, 2 parent notifications,
plus the unclosable week-9/13 contact task. Clicks under the case design: 1 + 1 + 3 + 2 = 7 for the whole student,
each producing evidence.

### 6.3 Rules for the engine

- A finding belongs to exactly one step; a step may hold many findings; the step's *why* text is the concatenation of
  the findings' one-line reasons, most severe first.
- Closing a step never closes a finding whose completion criterion is not met; the finding moves to the next scan's
  step of the same need (e.g. a "contact" step closed by a pending contact keeps WC-05 open at *Warning* until
  verification).
- Snooze applies to a step; legal-deadline findings inside it cap the snooze (I-8).
- Delegation applies to a step; the case owner keeps visibility.
- Cross-student dedup: DH tasks are program-level, one per `(source, last_import_id)`, listed once in "Fix data
  first" with the count of students affected.
- The Today card, Reminder Center, Contact Watch and the queue all read `step`; nothing else creates work.

---

## 7. Configuration hierarchy and audit-log review

### 7.1 Configuration tiers (applied as §3.1 of the spec)

| Tier | Owner | Examples | Editable in app by | Locked? |
| --- | --- | --- | --- | --- |
| **T0 Washington / state** | The product (from WAC/RCW text, with citation and effective date) | School week = Sun–Sat with ≥ 3 school days; weekly contact required; monthly evaluation with direct personal contact; parent participation for K-8 evaluation/plan; 20 consecutive school days; 3 consecutive months → course-of-study decision; evidence fields date/method/subject; count-day dates rule | Nobody | Yes; shown with the citation; changing requires a product release and a changelog line |
| **T1 District** | District ALE administrator | Qualifying contact types and whether attendance-course completion counts; justification codes; plan due school days and day-0 rule; consecutive-month pause over breaks; MPR window and unsatisfactory rule; who may confirm evaluations; whether the district form satisfies "communicated"; passing grade; warn/exclude day thresholds (15/20); calendar; retention | Oversight role, with a reason; every change is an event and triggers a re-scan | Teachers cannot override; a value may be *tightened* by a program (e.g. warn at 12 days) but not loosened |
| **T2 Program** (iPAL) | Program lead | External-ID token layout; attendance-course name patterns; course-name prefix; counselor/school codes; e-mail templates and policy text; Contact Watch ladder; graduation date; Laserfiche form mapping; CSV header mappings; which sources the program imports | Oversight role | Overrides product defaults, never T1 |
| **T3 Teacher preference** | Each staff member | At-risk weekday for their own reminders (may be earlier than district, not later); queue grouping and filters; e-mail signature; snooze default (≤ district cap); Downloads watcher on/off | The user | Never affects findings, confidence, or reports |

Precedence: T0 wins over everything; then T1; then T2; then product defaults; T3 only where a key is marked
`scope: teacher`. Storage: `product-defaults.json` (shipped, versioned) → tenant JSON (T2, versioned in the tenant
package) → district settings table in SQLite (T1, signed by the oversight login, versioned) → per-user settings (T3).
Every rule explanation prints each policy value with its tier badge ("qualifying types: T1 district, v3, changed
8/15 by ADMIN"). `policy_version` = hash of the merged T0–T2 values, stored on every finding and event.

Pasco-specific items to move out of the general spec into T2: the "(Pasco)" defaults column, `TH GH` token examples,
Laserfiche, Contact Watch, "IC 26-27" prefix, Chiawana/Pasco HS, counselor initials, the 10 %-in-10-days e-mail text.

### 7.2 Audit event model — review

Required capture vs. the spec:

| Requirement | Spec §2.9 | Change (applied) |
| --- | --- | --- |
| Who | `actor` | Add `actor_role` and `session_id`; `actor = system` events name the trigger (`scan`, `import`, `sync`) |
| When | `at` | Split into `recorded_at` (system clock, monotone with `seq`) and `happened_at` (teacher-entered date for late-logged actions); flag when `recorded_at − happened_at` > 1 day |
| Original value / new value | only `payload_json` | Explicit `before_json`, `after_json` for every mutating event |
| Source | — | `source: ui | import:<id> | ale_sync | ai_draft | system | migration` |
| Rule version | on `finding` only | `rule_version`, `policy_version`, `calendar_version`, `app_version` on every scan- or rule-produced event |
| Manual override | — | `override: bool` with `override_of` (the automatic value) whenever a teacher replaces a proposal or forces a state |
| Reason | — | `reason` required for: exception, re-evaluate, reopen, apply-anyway, snooze, delegate, cancel, correction |
| Corrections | "corrections append" | `supersedes_seq`: a correction event points at the event it replaces; the read model uses the latest non-superseded event; the packet prints both |

Correction protocol (no deletion, ever):

1. Contact/evidence entered wrongly → `evidence.corrected` with `supersedes_seq`, `before`, `after`, `reason`; the
   old row is marked `voided_by` and still exportable.
2. Import applied wrongly → never edit its rows; apply a `supersedes_import_id` import (or "revoke import" event) that
   rebuilds the derived state; snapshots from the revoked import are hidden from the live view, present in history.
3. Determination changed → new `evaluation_version` (E-11).
4. Policy or calendar changed → new version; findings resolved by the change are closed with the old version stamped.

Integrity statement (to be printed in the product's documentation, applied to the spec): the chain detects accidental
corruption and casual edits. It does **not** protect against a user who holds the database key and drops the
triggers. Mitigations in Phase 1: (a) weekly `verify_chain()`; (b) the head hash and `seq` are written into every
backup manifest and printed on every Audit Ready packet, so an auditor can compare packets from different dates; (c)
the chain includes `seq`, `recorded_at` and `prev_hash`; (d) optional Phase 2: the district oversight login receives
the head hash by e-mail weekly. Nothing here is described as tamper-proof.

Privacy review of the event payload: it holds references and hashes, not note bodies (good); `summary` strings on
evidence contain student names — acceptable inside the encrypted database, but the exceptions report export and the
audit packet must redact free text unless the oversight role ticks "include notes". Events must never hold e-mail
bodies; the e-mail record holds the body hash and recipients. Retention follows D-7.

## 8. Explainability audit

The evidence panel must answer "Why is this student here?" with: data used, dates, values, rule triggered, source
system, last import timestamp, policy/rule in force, what was automatic, what needs judgment. The spec's `finding`
holds `facts_json` and `explanation`; that is not enough to guarantee every field. Applied: a fixed `explain_json`
schema on every finding:

```
{ rule: {id, version, name, cite},
  subject: {sid, key, period: {from, to}},
  facts: [{label, value, as_of, source: {system, import_id, imported_at, ref}}],
  derivations: [{label, text, calendar_version}],
  policy: [{key, value, tier, version}],
  confidence: {level, reasons: []},
  automatic: [..what the engine concluded..],
  judgment: [..what the teacher must decide, with the outcomes offered..] }
```

Per-rule check (✔ = fully explainable from Phase 1 data; ◐ = explainable with a stated limitation; ✖ = cannot be
explained as written → changed):

| Rule | Status | Gap and change |
| --- | --- | --- |
| WC-01 | ✔ | Facts: the week's contacts with type/qualifies/reason; policy list; horizon. |
| WC-02 | ✔ | Adds "days left in week" and the at-risk weekday's tier (T3 if the teacher moved it earlier). |
| WC-03 | ✔ after C-2 | Explanation lists the acknowledged weeks with who acknowledged them and when. |
| WC-04 | ✔ after C-2 | Same; plus guardian contact on file with its source. |
| WC-05 / WC-06 | ◐ | Count derivation with skipped closures ✔; certification unknown → stated in `confidence.reasons` (C-11). |
| WC-07 | ◐ | Needs the outbound record id and recipients; the app's e-mail record has them; a Teacher-Initiated ALE row has no recipients → "reply channel unknown" stated. |
| WC-08 | ✔ | The row, the empty field, the WAC list. |
| PR-01 | ✔ after C-14 | Per-course last entry, anchor rule used (entry vs start), calendar and school-day counts, courses excluded (expired/attendance) named. |
| PR-02 | ◐ → ✔ | `weekly_rate` and `projected_finish` were undefined math. Applied: `weekly_rate = (progress_now − progress_earliest_in_window) ÷ school_weeks_between`, both snapshots named; projection printed as "at the last 2-week rate". |
| PR-03 | ✔ | Target date, progress, projection with its inputs or "n/a". |
| PR-04 | ✔ after I-3 | Per enrollment start date and the index count. |
| PR-05 | ◐ | Depends on the assignment-status column; states "grading status unknown" when absent. |
| PR-06 (optional) | ✔ | Projection inputs and the program graduation date (T2). |
| MP-01 | ✖ → ✔ | Proposal logic undeclared (C-4). Now MP-P1..P3 with judged weeks listed by date. |
| MP-02 | ✔ | Confirmed determination, recipient, evidence. |
| MP-03 | ✔ | Month's contacts and why each does not qualify as DPC. |
| IP-01 | ✔ | Evaluation ref, day-0 rule (T1), calendar derivation. |
| IP-02 | ✔ | Goal vs current values with both snapshot dates. |
| IP-03 / IP-04 | ◐ → ✔ | Consecutive count must print each month's determination and the break-pause rule applied. Applied. |
| IP-05 | ✔ | Plan version, participants, K-8 requirement (T0). |
| RS-01 | ✔ | First-seen import id and time. |
| RS-02 | ✔ | Both sources' status and dates. |
| RS-03 | ✔ after C-13 | Both advisor values, the authoritative source (T2). |
| RS-04 | ◐ | Depends on app-side checklist data; explanation names the unchecked elements and the WAC list. |
| DH-01..06 | ✔ | Source, last import, threshold (T1), horizon. |
| Risk score (§2.2) | ✖ | Weights undefined; removed from Phase 1 (I-5). |

Wireframe additions (applied): every card's "Why" line ends with "· rule WC-05 v1 · policy T1 v3 · data as of
9/25 08:02 · Reliable"; hovering a value shows its source row.

---

## 9. Acceptance-test matrix

### 9.1 Golden run G1 (whole-caseload expectations)

Inputs: `EdgenuityEnrollments_09_11/09_18/09_25_2026.csv` (applied in date order), `ALE_Student_Enrollment.csv`,
`ALE_Contact_Log.csv` (ISO dates), `Students_09_25_2026.csv`; test calendar (school days Mon–Fri from 8/24/2026,
closure 9/7); as-of Friday 2026-09-25 09:00; all sources imported 9/25 08:00 (contact-log horizon 9/25 08:00);
policy = product defaults with Pasco T2; grace = 4 weeks for new students. Every count below is calendar-derived.

| SID | Student | Expected findings (rule: key → confidence) | Case steps | MP-P proposal (Sept, as of 9/25) |
| --- | --- | --- | --- | --- |
| 412001 | Alvarez | none | none | On Target · Met 3/3 · DPC Teams 9/23 |
| 412002 | Baker | PR-02: Geometry A (−1.2→−7.2, on_pace→watch) R; PR-02: Biology A (−0.1→−6.1) R | progress outreach | Adequate/NI · Met 3/3 · DPC 9/23 |
| 412003 | Chen | WC-01: 9/6 R (unreviewed); WC-01: 9/13 R; WC-02: 9/20 R (Teacher Initiated 9/20 listed non-qualifying); WC-05: anchor 9/2 → 16 school days R; WC-07: outbound 9/20, 3 school days, no reply R; PR-01: episode 9/10 → 11 school days, act R; PR-02 ×2 (Algebra 2 A −29.4→−35.4; Chemistry A −25.0→−31.0) R; MP-01: 2026-09 R | acknowledge ×2, contact, evaluate, progress outreach | No Progress (avg 4.25 < 10; all behind) · Unsatisfactory 1/3 (weeks 8/30 ✔, 9/6 ✖, 9/13 ✖) · DPC Phone 9/2 |
| 412004 | Dawson | PR-03: US History B expired 9/15 (81.0 %, grade 71.0 ≥ 70 → severity progress) R | progress outreach | Adequate/NI (US History B −19.0, expired flag) · Met 3/3 · DPC Zoom 9/22 |
| 412005 | Espinoza | WC-01: 8/30, 9/6, 9/13 R; WC-02: 9/20 R; WC-05: anchor 8/29 → 19 school days (tier 15–19) R; WC-08: Parent 9/19 sole contact of week, grade 10 R; PR-01: episode 8/28 → 19 school days, act R; PR-02 ×2 (English 9 A −10.3→−16.3; Physical Science A −8.0→−14.0) R; MP-01 R; MP-03 R | acknowledge ×3, contact, evaluate, progress outreach, housekeeping | No Progress (avg 5.0) · No Communication 0/3 · DPC none |
| 412006 | Foster | RS-01: first seen 9/25 import (plan 9/21) R; PR-04: Algebra 1 A day 5, 0 % R; PR-04: Health day 5, 0 % R. No WC (grace to 10/18). No MP-01 (0 judged weeks; `mpr.min_judged_weeks` = 1). | housekeeping (RS-01 checklist incl. PR-04 lines) | not required (partial month) |
| 412007 | Gutierrez | none (Economics 98.5 % < 100 → no PR-05) | none | On Target · Met · DPC 9/23 |
| 412008 | Hale | WC-01: 9/13 R; WC-02: 9/20 R. No WC-05 (10 school days since 9/12). No PR-01 (attendance course excluded). | acknowledge, contact | On Target · Needs Improvement 2/3 · DPC Phone 9/5 |
| 412009 | Ibarra | none; student `archived`, plan `closed`, excluded from all rules; no RS-02 (sources agree) | none | not evaluated (inactive) |
| 412010 | Johnson | PR-02 ×2 (English 11 A −3.5→−9.5; Algebra 2 A −6.0→−12.0) R; sub-line "no student e-mail on file" on the step | progress outreach | Adequate/NI · Met · DPC 9/23 |
| 412011 | Kowalski | none (Physics A −4.9 is `on_pace`: boundary −5 exclusive) | none | On Target · Met · DPC 9/23 |
| 412012 | Lopez | none | none | On Target · Met · DPC 9/25 |

Program-level: DH none (all fresh). Exceptions report row for advisor GH (Alvarez, Baker, Chen, Johnson): 4 students,
contacted this week 3/4 (Chen no), evaluations unrecorded 4, 15–19 days: 1 (Chen), 20+: 0, unverified: 0,
cannot-evaluate: 0.

G1 on **Monday 9/28** (same files, contact log re-pulled 9/28 08:00): Espinoza WC-05 → tier 20+ (WC-06) in place, one
`escalated` event; Chen WC-05 = 17; Hale/Chen/Espinoza WC-01 for week 9/20 open (unreviewed); judged weeks = 4
(8/30 … 9/20): Chen 1/4, Hale 2/4 → Unsatisfactory (≥ 2 missed), Foster MP-01 now required (1 judged week).

### 9.2 Per-rule cases

Setup is a delta from G1. As-of 9/25 unless stated. Expected: finding present/absent, confidence, and the visible
consequence. Case ids are stable so an implementation can name its tests after them.

**Weekly contact**

| Case | Setup | Expected |
| --- | --- | --- |
| WC01-P | G1, Hale | Finding WC-01 key 9/13, Reliable, step *acknowledge* with 3 outcomes. |
| WC01-N | G1, Dawson | No WC-01 (Zoom every week). |
| WC01-M | Remove ALE enrollment import | Hale WC-01 9/13 still fires, Warning, fact "plan start unknown — using course start 8/26". |
| WC01-B1 | Contact on Sat 9/12 23:59 (Hale) | Counts for week 9/6, not 9/13 → WC-01 9/13 fires. |
| WC01-B2 | Contact on Sun 9/13 (Hale) | Counts for week 9/13 → no finding. |
| WC01-B3 | Foster plan_start Fri 9/25, as-of Sun 9/27 | Week 9/20 not required (1 enrolled school day); no WC-01. |
| WC01-B4 | Thanksgiving week (2 school days), Chen no contact, as-of 11/30 | Week is not a school week: neither met nor missed; streak unchanged. |
| WC01-S | ALE log last pulled 9/14, as-of 9/25 | Cannot Evaluate for weeks 9/13 and later; DH-01 task; student text "cannot be checked". Week 9/6 still Reliable (horizon 9/14 ≥ 9/12). |
| WC01-L | Late contact 9/16 for Hale arrives 9/29 after acknowledgment "missed" | Finding `resolved_by_data`; acknowledgment kept with `superseded_by`; WC-03 count recomputed. |
| WC02-P | G1, Chen | WC-02 9/20 fires Friday (≥ Thursday). |
| WC02-N | G1, Alvarez | No WC-02 (Teams 9/23). |
| WC02-B | As-of Wed 9/23, Chen | No WC-02 (before at-risk weekday). |
| WC02-Pending | Chen contact queued in app 9/24, not yet pulled | No WC-02; week shows "pending verification"; Warning. |
| WC02-Grace | G1, Foster | No WC-02 (grace). |
| WC03-P | Chen: acknowledge 9/6 and 9/13 as missed | WC-03 fires (2 consecutive), legal_deadline, step *plan*. |
| WC03-N | Chen: 9/6 acknowledged missed, 9/13 exception | No WC-03. |
| WC03-Cum | Hale: 9/13 missed; 10/4 missed; 10/25 missed (non-consecutive), as-of 11/2 | WC-03 fires (3 cumulative). |
| WC03-M | Weeks unreviewed | No WC-03; report shows "2 weeks unreviewed". |
| WC03-Break | Chen misses 12/13, break weeks 12/20 and 12/27 (< 3 school days), misses 1/3 | Streak = 2 with default `streak_skips_non_school_weeks = true`; = 1 if false. Both asserted. |
| WC04-P | Chen 9/6 acknowledged missed | WC-04 step *notify family* listing week 9/6; guardian e-mail from ALE. |
| WC04-N | Exception recorded | No WC-04. |
| WC04-M | Johnson (no guardian e-mail in fixture variant) | Step opens with "no guardian contact on file"; phone-note completion allowed. |
| WC04-Dup | Chen 9/6 and 9/13 both acknowledged | One step, two findings, one evidence closes both. |
| WC05-P | G1, Chen | 16 school days, tier 15–19, derivation names 9/7. |
| WC05-N | G1, Hale | 10 → none. |
| WC05-B1 | Espinoza as-of 9/25 | 19 → tier 15–19. |
| WC05-B2 | Espinoza as-of 9/28 | 20 → tier 20+ (WC-06) in place; `escalated` event; same finding id. |
| WC05-M | Student with no contact ever, plan_start 8/24, as-of 9/25 | Anchor 8/24 → 23 school days → 20+. |
| WC05-S | ALE log stale | Cannot Evaluate; no count shown; report column "unverified". |
| WC06-Resume | Espinoza contact 9/29 then gradebook entry 9/30 | Step → waiting (resumed participation) → auto-verified 9/30 with evidence; teacher tick still offered. |
| WC07-P | Chen | Outbound 9/20, 3 school days elapsed 9/23, no reply → fires. |
| WC07-N | Alvarez Teacher Initiated 9/20 + Teams 9/23 | No WC-07. |
| WC07-B | As-of 9/22 | Not yet (2 school days). |
| WC08-P | Espinoza Parent 9/19 | Fires (sole contact of week, grade 10), housekeeping → contact. |
| WC08-N | Contact with subject | None. |
| WC08-Strict | `contact.require_subject_to_qualify = true`, Alvarez Teams 9/23 with empty notes | Week 9/20 "unverified pending subject"; WC-02 does not fire; WC-08 fires. |

**Progress**

| Case | Setup | Expected |
| --- | --- | --- |
| PR01-P | G1, Chen | Episode 9/10; 11 school days → act; courses listed; attendance course excluded. |
| PR01-N | G1, Baker | None (last entry 9/23). |
| PR01-M | Foster (null entries) | Anchor 9/21; 4 school days → none; page shows "no work submitted since start". |
| PR01-B | Student last entry 9/18 as-of 9/25 (7 calendar days, 5 school days) | Warn tier fires at 7 calendar days; act tier not yet. |
| PR01-Exp | Dawson | None (expired course excluded; Precalculus 9/22). |
| PR01-S | Edgenuity last 9/18, as-of 9/25 | Cannot Evaluate (stale > 3 school days); DH-01. |
| PR01-Episode | Baker inactive 9/1–9/9, active 9/10, inactive 9/17→ | Two findings with different keys; the first `resolved_by_data`; never `reopened`. |
| PR02-P | G1, Johnson | Two findings, drops 6.0 within 14-day window, buckets watch/struggling. |
| PR02-N1 | G1, Alvarez | None (still on_pace after the drop). |
| PR02-N2 | Only 09_25 imported | None; page "trend: not enough history". |
| PR02-B1 | Kowalski Physics −4.9 | None (on_pace boundary). |
| PR02-B2 | Baker Biology −4.9 → −5.0 (synthetic) | None (bucket move with drop 0.1 < 3). |
| PR02-B3 | Course −4.0 → −7.0 | Fires (bucket move, drop 3.0 = threshold). |
| PR02-Exp | Dawson US History B | Excluded. |
| PR03-P | Dawson | Expired 9/15; severity progress (grade 71 ≥ 70). |
| PR03-B1 | Grade 69.9 | Severity contact. |
| PR03-B2 | Target date = today | Not expired (strict <). |
| PR03-Expiring | Target 10/8, projected finish 11/2 | Expiring fires (14-day window). |
| PR03-N | Progress 100 | None. |
| PR03-M | `weekly_rate` null (one snapshot) | Expiring branch uses bucket only; projection "n/a". |
| PR04-P | Foster | Day 5, both courses 0 % → fires per enrollment. |
| PR04-Day10 | Foster as-of 10/2, progress 4 % | Day 10 fires (< 10 %); severity contact. |
| PR04-N | Foster progress 12 % by day 10 | None. |
| PR04-B | As-of 9/24 (index 4) | None. |
| PR04-Late course | Alvarez course added 9/14 | Day-5 check on 9/18 for that enrollment only. |
| PR05-P | Course 100 %, assignment status empty | Fires, housekeeping. |
| PR05-N | Gutierrez 98.5 % | None. |
| PR05-M | Column absent | Incomplete: "grading status unknown". |
| PR06-P (optional) | Gutierrez Government rate 1 %/week, graduation 6/10 | Projection after graduation → fires, judgment counselor. |

**Monthly evaluation**

| Case | Setup | Expected |
| --- | --- | --- |
| MP01-P | G1, Chen as-of 9/25 | Fires (window 9/24–9/30 open). |
| MP01-N | Evaluation `recorded` for 2026-09 | None. |
| MP01-B1 | As-of 9/23 | Not yet (before window). |
| MP01-B2 | As-of 10/1 | Overdue; urgency 3.0. |
| MP01-Partial | Foster as-of 9/25 / 9/27 | Not required (0 judged weeks) / required (1). |
| MP01-Withdrawn | Espinoza dropped 9/23 | Still required (≥ 1 judged week), flag "withdrawn 9/23", exception available. |
| MP01-S | Edgenuity stale | Packet opens; progress lines Cannot Evaluate; confirm requires "using data as of 9/18". |
| MP01-Late | Recorded 10/6 for September | Closed; fact "recorded after count day 10/1" printed. |
| MPP-Comm | Chen / Hale / Espinoza / Alvarez as-of 9/25 | 1/3 Unsatisfactory / 2/3 Needs Improvement / 0/3 No Communication / 3/3 Met. As-of 9/27: 1/4, 2/4 (→ Unsatisfactory), 0/4, 4/4. |
| MPP-Prog | Chen / Baker / Alvarez / Foster | No Progress / Adequate / On Target / not proposed (new). |
| MPP-Overall | Chen (No Progress + Unsatisfactory), Hale (On Target + NI) under `both` | Unsatisfactory / Satisfactory. Under `either`: Unsatisfactory / Satisfactory (NI is not Unsatisfactory). |
| MP02-P | Chen confirmed 9/30 | Step communicate; due `add_school_days(9/30, 3)` = 10/5. |
| MP02-K8 | 412013 grade 8 confirmed | Parent required. |
| MP02-Form | D-5 = true, form submitted | Auto-satisfied with the submission as evidence. |
| MP03-P | Espinoza | Fires; contacts listed with reasons. |
| MP03-N | Chen | None (Phone 9/2). |
| MP03-AfterMonth | Espinoza as-of 10/1 | Packet flag + attestation path; confirm allowed with attestation; no bulk. |
| MP03-NotRequired | Foster 9/25 | None. |
| MP-Bulk | Confirm selected with Alvarez (Reliable) and Chen (Warning line) | Alvarez selectable after expanding; Chen not selectable. |
| MP-Revise | Chen Unsat 9/30 → Adequate 10/2 | New version; IP-01 cancelled (not started) with reason; event with before/after. |

**Intervention**

| Case | Setup | Expected |
| --- | --- | --- |
| IP01-P | Chen Unsat confirmed Fri 9/25 | Due 10/2; derivation "9/25 + 5 school days → 10/2". |
| IP01-Holiday | Same with closure 10/2 | Due 10/5, derivation names 10/2. |
| IP01-Break | Confirmed 12/18, break 12/21–1/1 | Due 1/8. |
| IP01-N | Plan open already (month 2) | No IP-01; IP-03 instead. |
| IP01-M | Evaluation via ALE status only | Day 0 = observed date, labelled. |
| IP01-Late | Plan saved 10/6 | `late_by_school_days = 2` stored and printed. |
| IP02-P | Checkpoint 10/9 reached, not reviewed | Fires. |
| IP02-Gone | Goal course `gone` | Outcome set includes "goal void". |
| IP02-N | Reviewed | None. |
| IP03-P | Chen Unsat Sept and Oct | IP-03 fires; IP-01 does not. |
| IP03-Pause | Unsat Nov, December skipped by policy, Unsat Jan | Count = 2 with pause on; 1 with pause off (Dec had no evaluation) — both asserted, rule printed. |
| IP04-P | Three consecutive | Fires; decision outcomes. |
| IP05-P | Plan saved, K-8 | Fires; parent required. |
| IP05-N | Grade 11, policy off for 9–12 | None. |

**Roster, plan, data health**

| Case | Setup | Expected |
| --- | --- | --- |
| RS01-P | Foster | Fires with checklist. |
| RS01-Return | Ibarra active again 10/19 | Fires as returning; episode boundary; counters reset by policy. |
| RS02-P | Chen absent from 09_26 file (others present) | Fires "Confirm status"; steps → waiting. |
| RS02-Import error | Outcome "import error" | Nothing cancelled; next import clears. |
| RS02-Withdrawn | Outcome "withdrawn" | Steps cancelled with reason; MP-01 stays with flag. |
| RS03-Agree | Token and ALE both change GH → STA | Reassigned; events. |
| RS03-Disagree | Token GH, ALE STA | Data finding; nothing moves. |
| RS04-P | Course added after checklist update | Fires. |
| DH01-Fresh/Aging/Stale | Edgenuity 9/25 / 9/23 / 9/18, as-of 9/25 | ok / aging (Warning on PR findings) / stale (Cannot Evaluate + task). |
| DH02-P | Three failed pulls | Fires. |
| DH03-Shrink | 09_26 file with 4 students | Blocked; not applied; "apply anyway" needs a reason and writes an event. |
| DH03-Dup | Two names under one SID | Blocked. |
| DH03-Excel | `ALE_Contact_Log_excel_dates.csv` | Warn; dates parsed correctly (Chen Phone = 9/2 not "9/2" string sort); contacts Warning. |
| DH03-Serial | Contact date `46288` | Parsed to 2026-09-23; warn. |
| DH03-Older | Import 09_18 after 09_25 | Stored as history; live view unchanged; message shown. |
| DH03-SameHash | Re-import 09_25 | Refused with the prior time. |
| DH04-P | Pull horizon 9/23, as-of 9/25 | Week 9/20 Incomplete; task "pull". |
| DH05-P | Backup > 24 h while open | Admin task. |
| DH06-P | Contact that closed WC-01 absent from two pulls | Anomaly; finding not reopened until accepted. |
| CLOCK | System date 9/24 after events at 9/25 | Scan refuses; message. |

### 9.3 Fixture additions required (documentation of gen.py changes, not implemented)

- 412013 "Martinez, Leo", grade 8, guardian on file, weekly contacts, August evaluation Unsatisfactory confirmed
  8/31 with plan saved 9/4 (checkpoint 9/18 reviewed on track): exercises MP-02 parent, IP-05, IP-02 negative.
- 412014 "Nguyen, Tran", grade 10, plan_start Fri 9/25: exercises E-1.
- Contact-log variants: duplicate rows (E-7), empty notes (E-8), serial date (E-9), late 9/16 row in a second file
  (E-10), Sunday 9/13 row (E-6).
- Edgenuity variants: 09_26 with Chen absent (RS-02), a file with a second name under 412003 (DH-03), a file without
  the Assignment Status column (PR05-M), a 09_18-only run (PR02-N2), a course added 9/14 for Alvarez (PR04-Late).
- Calendar variants: closure 10/2; uncertain day 10/2; Thanksgiving week; winter break.
- All expected outputs above are to be encoded as JSON next to the fixtures once the rule engine exists; the tests
  compare `(rule_id, sid, subject_key, confidence, tier)` sets and the packet's proposal tuple, never UI text.

## 10. Implementation dependency graph (build order)

No implementation is proposed here; this is the order in which the pieces can be built *safely*, with the gate that
must pass before the next piece starts. Each gate is a test suite against the fixtures in §9, not a demo.

```
L0  Test harness + fixtures + test calendar        (gate: G1 inputs load; expected-output JSON exists)
 │
L1  Shared primitives
 ├─ school_calendar service (is_school_day, add_school_days, week_of, count_days, versions)
 ├─ sid / name normaliser; date parsers (ISO, M/D/YYYY, M/D/YY, serial)
 └─ configuration layer (T0–T3 merge, policy_version, tier badges)
        (gate: every derivation in §9 reproduces; IP01-Holiday/Break, WC01-B*, DH03-Excel/Serial)
 │
L2  Audit event log (extended schema, chain, verify_chain, correction protocol)
        (gate: every later write path emits events; chain verifies; corrections supersede)
        — built BEFORE any model write so no state ever exists without its event
 │
L3  Normalised data model (student, enrollment, course_snapshot, contact, evidence, import, source_status)
    + import pipeline with health checks and the older-file rule
        (gate: DH01/03/04 cases; E-7/E-9/E-17/E-20/E-21; RS-02 detection; no legacy store is read)
 │
L4  Evidence store + confidence engine (source states, horizons, verification_state, anomaly linkage)
        (gate: WC01-S, WC02-Pending, DH04-P, MP01-S produce the right levels and wording)
 │
L5  Rule engine core (registry, pure evaluate, subject keys, reconcile, explain_json)
    then rules in this order, each with its §9 rows green before the next:
    DH-01..06 → WC-01/02 → WC-05/06 → PR-01/03/04/05 → PR-02 → WC-07/08 → RS-01..04
        (gate: G1 finding set equal to §9.1 minus MP/IP/WC-03/04)
 │
L6  Case + step engine (needs, dedup, ordering, snooze caps, delegation, resolved_by_data, DH-06)
        (gate: §6.2 worked example yields four steps; PR01-Episode; WC05-B2 in-place escalation)
 │
L7  Acknowledgment + exception flows (WC-01 outcomes) → WC-03 / WC-04
        (gate: WC03-*, WC04-*; language rules test: forbidden words absent from automatic text)
 │
L8  Deadline engine (derivations, calendar_version recompute, E-22/E-23/E-28)
        (gate: deadlines table matches §9 for every anchor)
 │
L9  Today's Work UI (queue over steps; Data strip; student evidence page; explain panel)
        (gate: Playwright smoke: every card shows rule/policy/as-of/confidence; no module global missing)
 │
L10 Monthly evaluation (evaluation model + versions, MP-P proposals, packet, MP-01/02/03, confirm-selected, attestation)
        (gate: MPP-*, MP01-*, MP03-AfterMonth, MP-Revise; the packet is reproducible from the event log)
 │
L11 Intervention workflow (plan, versions, IP-01..05, checkpoint, escalation, E-11/E-12/E-13)
        (gate: IP* rows; IP01-N shows no duplicate with IP-03)
 │
L12 Audit Ready packet + exceptions report + Program view (redaction, head-hash on packet, unverified columns)
        (gate: packet regenerated from a fixture DB byte-identical apart from timestamps; report never shows proposals)
 │
L13 Migration switch (per-staff feature access; legacy panels read-only; one-way sync retired)
```

What must exist before what, stated as dependencies:

| Component | Cannot be built safely until |
| --- | --- |
| Any rule | calendar service, configuration layer, event log, normalised model, confidence engine, fixtures with expected outputs |
| WC-03 / WC-04 | the acknowledgment flow (their inputs are teacher outcomes, not data) |
| PR-02 | at least two applied snapshots per enrollment and the snapshot-window helper |
| Case/step engine | every Phase 1 rule's `need` mapping declared (it is, in §6.1) and subject keys fixed (C-5) |
| Deadline engine | calendar versions and the event log (every recompute is an event) |
| Today's Work | steps (never findings) and the explain panel schema |
| MPR packet | evaluation versions, MP-P rules, confidence per line, contact evidence store |
| IP-01 | evaluation `confirmed` events with `evaluation_date`; deadline engine |
| Audit Ready | everything above plus the redaction policy (D-7) |
| Migration switch | parity tests: legacy Today card counts vs. step counts on the same fixture |

Things that should *not* be started in Phase 1 because their inputs do not exist: `author_is_certificated`
(staff table), risk score, Imagine API pulls, WSLP minutes/FTE, OneRoster.

---

## 11. Recommended revisions to Brain v1

Applied to `COMMAND-CENTER-BRAIN-V1-SPEC.md` (Revision A, documentation only) — see the spec's §11 changelog:

1. Guiding rule 6 (confidence and language) added; "unjustified/missed/excluded/failing" banned from automatic text.
2. WC-01 redefined as a missed-week record with an *acknowledge* step and three outcomes (C-1, C-2).
3. WC-03/WC-04 count acknowledged weeks only; WC-04 is one step per case (C-2, §4.2).
4. WC-05/WC-06 merged into one tiered finding with in-place escalation; wording corrected; anchor fallback to
   `plan_start` (C-11, WC05-M).
5. MP-01/02/03 restructured as one *evaluate* step with sub-steps; after-month attestation path; MP-02 due rule
   (C-3, §4.3).
6. MP-P1..P3 proposal rules and judged weeks declared (C-4).
7. Subject keys per rule (C-5).
8. Case/step model added as §2.6a with the need table (C-6).
9. IP-01 condition changed; IP-03 owns month 2 (C-7).
10. Confidence model (§2.7 `confidence`, §2.10 source states and horizons, `verification_state` on contacts) (C-8).
11. Configuration tiers §3.1; "Default (Pasco)" relabelled as T2 examples (C-9).
12. Event schema extended; correction protocol; integrity statement; head-hash anchor (C-10).
13. Confirm-selected replaces bulk confirm; plan-draft section acceptance recorded (C-12, §5.1).
14. RS-03 mismatch rule; RS-02 "import error" outcome does not cancel (C-13, §4.5).
15. PR-01 scope (active, non-expired, non-attendance enrollments; null anchor) (C-14).
16. Required-week rule, non-school weeks, streak policy key, re-enrollment episode reset (C-15, E-16).
17. DH-06 evidence-disappeared anomaly (C-16).
18. PR-02 requires resulting bucket ≤ watch and `bucket_move_min_drop`; excludes expired (I-2, §4.7).
19. PR-04 per enrollment (I-3). WC-08 severity (I-4). Risk score removed from Phase 1 (I-5).
20. Contact dedupe key includes the note hash; local-time parsing rule (I-6, I-7).
21. Snooze cap at the legal due date; reopen without time limit but with reason (I-8, I-9).
22. No WC card during grace (I-11); task-event scans limited to `closes_when` (I-13); older-file message (I-14).
23. `explain_json` schema and card footer (§8).
24. PR-06 senior projection added as optional (E-25).
25. Golden expectations in §9 replaced by a pointer to this document's §9 with corrected numbers (Espinoza 19/20,
    Chen 16, PR-02 set, Foster MP-01 not required on 9/25).
26. Open district decisions extended: D-8 communicate-within days; D-9 partial-month evaluation threshold; D-10
    streak across non-school weeks; D-11 counter reset on re-enrollment; D-12 include expired courses in the
    progress proposal; D-13 strict subject requirement.

Not applied (needs a district or product decision first):

- Whether attendance-course completion counts as a qualifying contact (D-1) — the fixtures assume it does not.
- Whether a Phase 1 release should ship the exceptions report to oversight roles at all before the confidence
  columns are proven on real data for one month (recommend: advisor view first, oversight view one release later).
- Retention and redaction defaults (D-7).

Residual risks after Revision A:

- The acknowledgment step adds one click per missed week per student. On a caseload with chronic non-contact this is
  real work; it is also exactly the record WAC 392-550-040 expects the district to have. Mitigation: multi-select
  acknowledgment on the student page with one reason, recorded as one event per week.
- `with_whom` and `method` are inferred from ALE type labels; the district's type list must be mapped once (T1) and
  the unknown-type warning must be visible, or the weekly rule quietly ignores a valid type.
- The confidence model depends on knowing a pull's horizon; the ALE CSV export has no timestamp inside the file, so
  the import time is used. A teacher importing a week-old CSV on Friday would get "fresh". Mitigation: ask for the
  export date on manual CSV import when the file's modification time is older than one day, and record it.
