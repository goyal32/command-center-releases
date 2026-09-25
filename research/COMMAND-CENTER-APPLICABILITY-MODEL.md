# Command Center Brain v1 — Rule Applicability and Mixed-Program Model

**Status:** documentation only. Prepared 2026-09-25 against `COMMAND-CENTER-BRAIN-V1-SPEC.md` (Revision A) and
`COMMAND-CENTER-BRAIN-V1-VALIDATION.md`. No production code was changed. The spec receives Revision B (marked
`[Rev B]`) and the validation report a new §12 in the same commit.

**The gap.** Brain v1 assumed every active student on the roster is in a Washington ALE learning plan. Real
caseloads are mixed: some staff carry credit-recovery (CR) enrollments that are not ALE, some carry both, and one
student can hold an ALE plan and a non-ALE course at the same time. Command Center today has two heuristics for this
(the `CR 25-26` / `IC 25-26` course-name prefix in the reconciliation module and a `cr_teachers` list in the tenant
config), and it uses them only to match courses, never to decide whether a rule applies. Neither a prefix, a school
name nor a teacher assignment proves anything about legal scope, so neither may decide applicability. This document
adds the missing layer: **a rule exists** (it is in the registry) is a different fact from **a rule applies here**
(to this student, this enrollment, on this date), and the second fact must come from explicit configuration and
enrollment records with a recorded source and version.

---

## 1. Concepts

| Term | Meaning |
| --- | --- |
| **Regime** | A named body of workflow requirements. Phase 1 regimes: `core` (product-universal), `wa_ale` (Washington ALE, WAC 392-550 / 392-121-182), `credit_recovery` (district credit-recovery practice, no statutory contact rule), `none` (tracked for history only). A district may add regimes in T1; the product ships `core` and `wa_ale`. |
| **Subject** | What a rule evaluates: a student (student-scoped rules), an enrollment (course-scoped rules), the caseload or the system. |
| **Applicability** | For a `(regime, subject, date)`: `required`, `not_required`, or `unknown`, with the deciding level, the records used, their versions and a one-line explanation. |
| **Applicability gate** | The check the rule engine performs before `evaluate()`: a rule runs for a subject only when every regime the rule belongs to resolves to `required`; `unknown` produces an applicability finding instead; `not_required` produces nothing. |
| **Level** | Where an applicability fact can come from (§2). Levels are ordered from broad to specific; specific always wins. |
| **Override** | An administrator's explicit applicability decision for one student or enrollment, with reason and validity window. |
| **External Action Policy** | The table that decides which outside systems an action touches (mail client, contact-record system) given the regime, the context and the applicability state (§6). |

Guiding rules added to Brain v1 (`[Rev B]` rule 7 and 8):

7. Every rule declares its regimes; the engine never evaluates a regime-bound rule for a subject whose applicability
   is not `required`, and never treats `unknown` as `not_required` or as `required`.
8. Applicability is decided from explicit records (district, program, enrollment, override), never from a course
   name, a school name, a teacher's name or the fact that the app runs in Washington. Heuristics may *suggest* a
   mapping to an administrator; they never decide.

---

## 2. Applicability hierarchy

Levels, from broadest to most specific. Each level can contribute one of the three states, or `silent` (no
statement). The resolver walks from the most specific level to the broadest and stops at the first non-silent
statement, with the two exceptions in §2.2.

| # | Level | Who sets it | What it can say | Tier |
| --- | --- | --- | --- | --- |
| L1 | **Jurisdiction / regime scope** | the product, from the regulation's own scope text with citation | *Definition* of who is inside the regime ("a student enrolled in an ALE course per WAC 392-550-020 through a district ALE program"). It never asserts that any particular subject is inside; it defines what evidence would place one inside. | T0 |
| L2 | **District** | district ALE administrator | Which regimes exist; for each program the district runs, the default state and whether that default is *authoritative* (may fill an `unknown`) or *advisory* (may only suggest). Example: "Program iPAL: `wa_ale` required by default, authoritative; program CR-Lab: `wa_ale` not_required by default, authoritative; program Summer Bridge: unknown (must be set per enrollment)". | T1 |
| L3 | **School / program profile** | program lead | Assigns students and courses to a program by explicit lists or explicit source fields (an ALE program code in the enrollment file, an Edgenuity course catalogue tag), never by name pattern. Can tighten (add a regime) but not loosen a T1 authoritative default. | T2 |
| L4 | **Student enrollment record** | district source system (ALE enrollment report: learning-plan status, start/end) | "This student has an active ALE learning plan from date A to B." This is explicit district data about the student's membership in the regime. | data |
| L5 | **Course / enrollment record** | district source system (ALE course-enrollment report listing the plan's courses) or an explicit course-mapping table (T2, keyed by course key, with `regime`, `set_by`, `version`) | "This Edgenuity enrollment is a course of the student's ALE plan" or "this course is tagged credit_recovery: not in the plan". | data / T2 |
| L6 | **Administrator override** | oversight role | Any state for one student or one enrollment, with reason, effective window and version; the only level allowed to override L4/L5 data. | T1 (record) |
| L7 | **Teacher role** | — | Never decides applicability. It decides *who sees and completes* the resulting work and which sub-actions are offered (a non-certificated support user cannot confirm an evaluation). If a teacher believes a mapping is wrong they raise a *mapping request* that lands in the administrator's configuration queue. | T3 (visibility only) |

### 2.1 Resolution order

For subject `S` (enrollment `e` of student `s`), regime `R`, date `d`:

1. **L6 override** covering `S` and `d` → its state. (An override on the student covers all of the student's
   enrollments unless an enrollment-level override exists.)
2. **L5 enrollment record**: `e` is listed in the student's ALE course-enrollment report for a plan active on `d`
   → `required`; `e` carries an explicit course-mapping tag for `R` → that tag's state.
3. **L4 student record**: for *student-scoped* subjects, an active ALE learning plan on `d` → `required`; a
   closed/dropped plan → `not_required` for dates outside the plan window. For *enrollment-scoped* subjects L4
   alone is not enough (the student may be in the plan while this course is not): it yields `unknown` with the
   hint "student has an ALE plan; course membership not confirmed", unless the T1 default for the program is
   authoritative (`all enrollments of an ALE-plan student are plan courses unless tagged otherwise`).
4. **L3 program profile** default for the program the student/course is explicitly assigned to.
5. **L2 district** default for that program, if `authoritative`; if `advisory`, the result is `unknown` with the
   advisory shown as a suggestion.
6. Otherwise `unknown`.

### 2.2 Two exceptions to "most specific wins"

- **Conflict → unknown.** If two explicit records at the same or adjacent levels disagree (L4 says the plan is
  active, L5 says the course is tagged `not_required`; or the ALE course-enrollment report lists the course while the
  mapping table says CR), the resolver returns `unknown` with both records listed and opens a configuration task
  (§7). An L6 override resolves it.
- **Expired override → unknown, not fallthrough.** When an override's window ends, the resolver does not silently
  revert to data; it returns `unknown` with "override expired {date}" until an administrator renews or clears it.

### 2.3 Student-level aggregate

Student-scoped rules (WC, MP, IP, WC-03/04, RS-04) use the student's applicability for `R`, which is:
`required` if the student has any enrollment `required` under `R` on `d` or an L4 record says so; `not_required` if
every enrollment is `not_required` and no L4 record says otherwise; `unknown` otherwise. The set of enrollments in
scope for the student's regime work (`R-scope enrollments`) is the subset resolved `required`; enrollments resolved
`not_required` are shown as "other enrollments (not in the {R} plan)" and never enter the regime's packets or
proposals; `unknown` enrollments are listed as "membership unconfirmed" and are excluded from proposals while the
student still receives the regime's contact rules (a plan is a plan regardless of which courses are confirmed).

### 2.4 Data model `[Rev B]` (spec §2.11)

`regime`: `{id, name, cite, scope_text, version, requires_contact_documentation: bool, contact_record_system: id|null}`.

`applicability_statement` — one row per explicit statement, append-only:

| Field | Notes |
| --- | --- |
| `id`, `regime_id` | |
| `level` | enum L2..L6 |
| `subject_kind`, `subject_key` | `program`, `school`, `student` (sid), `enrollment` (enrollment id), `course_key` |
| `state` | required / not_required / unknown |
| `authoritative` | bool (L2/L3 defaults only) |
| `source` | `district_config`, `program_config`, `ale_enrollment_import:<id>`, `ale_course_enrollment_import:<id>`, `course_mapping_table`, `override` |
| `effective_from`, `effective_to` | dates; open-ended allowed |
| `reason`, `set_by`, `set_at`, `version` | required for overrides and for changes to defaults |
| `superseded_by` | corrections append |

`applicability_resolution` — computed per scan and stored on every finding, task, packet and external-action event
as `applicability_json`:

```
{ regime: "wa_ale", subject: {kind, key}, date, state: "required|not_required|unknown",
  decided_at: "L5", statements: [{id, level, state, source, version}],
  conflicts: [...], hints: [{kind: "course_prefix", value: "CR 26-27", text: "suggests credit recovery; not used"}],
  explanation: "Required: Algebra 2 A is listed in Marcus Chen's ALE plan (ALE course-enrollment report 9/24, plan active 8/24–6/10)." }
```

Statements from imports are rebuilt from each import (the import id is the version); configuration statements
carry the T1/T2 `policy_version`. The resolver is a pure function of the statements, the date and the subject, so a
resolution is reproducible from the audit log.

---

## 3. Correcting the T0 model

Revision A's T0 tier read as "Washington/state rules, locked, apply". That would run ALE rules against every
student on a Washington machine. Revision B splits T0 into two things:

- **T0-definitions** (unchanged content, corrected meaning): the constants of a regime *when it applies*: the
  school-week definition, weekly contact, monthly evaluation with direct personal contact, K-8 parent participation,
  20 consecutive school days, three consecutive months, evidence fields, count-day rule. Locked; cited; versioned by
  product release. They belong to the `wa_ale` regime, not to the product.
- **T0-scope** (new): the regime's scope text with citation, used only to tell administrators what evidence places a
  subject inside the regime. It has *no default applicability*. The product ships with `wa_ale` present in the
  registry and **no** program assigned to it; a district must state in T1 which programs are ALE programs. Until it
  does, every subject resolves `unknown` for `wa_ale`, every ALE-bound rule is gated, and Data Health shows one
  configuration task: "No program is assigned to the Washington ALE regime — set district defaults".

Consequences written into the spec: the `core` regime carries the universal rules (§7); `credit_recovery` ships as
an empty regime a district may populate with its own practice rules (no WAC citations); "Default (T2 example:
Pasco)" now includes `programs: {iPAL: {wa_ale: required, authoritative}}` as the *example* that makes the golden
fixtures behave as before.

---

## 4. Mixed caseloads

Applicability is computed per subject, so a caseload is just the union. The behaviours that must hold:

| Situation | Today's Work | Data Health | Rules | Reports |
| --- | --- | --- | --- | --- |
| **Teacher with only ALE students** | As Revision A; a regime badge "ALE" on every case header is shown once in the scope bar, not per card. | ALE sources required (contact log, enrollment). | All `wa_ale` + `core`. | Exceptions report as designed. |
| **Teacher with only non-ALE / CR students** | No ALE sections; groups are *Fix data*, *Progress*, *Housekeeping*, and any `credit_recovery` practice rules the district enabled. No "weekly contact" language anywhere. | ALE contact log and ALE enrollment are **not required** for this caseload: DH-01 for those sources is suppressed with the note "no ALE-tracked students in scope". The ALE sync button is hidden or marked optional. | `core` only (+ `credit_recovery` if configured). WC/MP/IP never appear. | The exceptions report shows this advisor with denominator 0 for ALE columns and a "CR: n students" column; they are not counted as non-compliant. |
| **Teacher with both** | Cases carry a regime badge per student (ALE / CR / mixed / unconfirmed). Filters gain a *Regime* facet. Legal-deadline and contact groups contain ALE students only; CR students appear in progress and housekeeping. A collapsed "Needs configuration (n)" group lists unknowns. | ALE sources required because at least one ALE-tracked student exists; the stale-source banner names how many students it affects ("affects 4 of 9 students"). | Per subject. | Denominators per column are the ALE-tracked count; CR and unknown counted separately. |
| **Student with only ALE-tracked enrollments** | As Revision A. | — | All. | — |
| **Student with only non-ALE enrollments** | Card without contact/legal steps; progress outreach and housekeeping only; the e-mail action follows the `not_required` policy row (§5). | — | `core`. | Excluded from ALE columns. |
| **Student with mixed active enrollments** (ALE plan with courses A, B; CR course C not in the plan) | One case. Contact, evaluate, plan and notify-family steps exist because the student has an active plan. The MPR packet and PR-based proposals include A and B only; C is listed under "other enrollments (not in the ALE plan)". Progress outreach for C is a `core` step and its e-mail is course-level (§5). | — | Student-scoped `wa_ale` rules run; enrollment-scoped rules run for A and B under `wa_ale` and for C under `core` (PR-01..03 run for C without WAC citations). | The student counts once in ALE columns. |
| **Student with unknown applicability** | Card in "Needs configuration" with the universal findings still visible; no contact/legal steps; an explanation of what is missing and a *Request mapping* action. | A configuration task for the oversight role, one per distinct cause, listing the students affected. | `core` only; `wa_ale` rules emit AP-01 (§7) once per student, not per rule. | Counted in "unknown". |

Grouping rule for the queue: a student appears once, in the group of the highest-priority step; the regime badge
and the enrollment breakdown ("2 ALE · 1 CR") are on the card header so a teacher never has to guess why a CR
student has no contact step.

---

## 5. The blue e-mail button, separated

### 5.1 Current behaviour (from the 0.2.46 source)

The roster ✉ icon, the AI e-mail path and the smart-template path all do the same three things in one handler:
build the message, open the mail client (a `mailto:` handed to Outlook via the desktop shell, with the app kept in
front), and 250 ms later open the ALE student page in a named browser window (reused if already open), then record
the click as an app-side "weekly e-mail" contact. There is no notion of why ALE opens; it opens for every student
including ones with no ALE plan, and it is the only place where the ALE page opens automatically.

### 5.2 Target architecture

The button becomes a **composite action** made of independent, individually policy-gated actions:

```
compose ──▶ open mail client ──▶ record e-mail evidence (local, always)
                                   └─▶ documentation post-action (per External Action Policy):
                                         auto | offer | never  ×  { queue_evidence | open_record_system }
```

- **Compose** takes a *context*: `student` (the message is about the student's overall status) or `course`
  (the message is about one enrollment; the template and the facts come from that course). The context is set by
  where the button lives (roster row = student; course row / progress-outreach step = course) and is stored on
  the e-mail record.
- **Open mail client** is unconditional once a message exists (this is the communication).
- **Record e-mail evidence** always writes the app-side e-mail record (recipients, subject, body hash, context,
  time). It is `core` behaviour and never depends on ALE.
- **Documentation post-action** is decided by the External Action Policy row for `(regime, context,
  applicability)`. `queue_evidence` opens the app's existing ALE queue dialog pre-filled (type Email, today, the
  subject as the WAC subject) and lets the teacher confirm, after which the sync verifies it; `open_record_system`
  opens the student's page in the record system (today's behaviour). Modes: `auto` (happens without asking), `offer`
  (a one-click chip on the return banner "Log this e-mail in ALE ▸", dismissable, remembered per e-mail), `never`.

### 5.3 Behaviour table

| Context | Student applicability for `wa_ale` | Enrollment applicability (course context) | Mail client | Documentation post-action | Why line shown on the return banner |
| --- | --- | --- | --- | --- | --- |
| Student-level e-mail | required | — | opens | `queue_evidence: auto` (ALE queue dialog pre-filled); `open_record_system` only as fallback when the queue provider is unavailable | "ALE queue opened: Chen has an active ALE plan (ALE enrollment 9/24). This e-mail can count as this week's contact once logged." |
| Student-level e-mail | not_required | — | opens | `never`; e-mail recorded locally | "ALE not opened: no ALE plan for this student (program CR-Lab, district default, v3)." |
| Student-level e-mail | unknown | — | opens | `offer` with a warning chip; AP-01 configuration task exists or is created | "ALE not opened automatically: applicability unknown — student has Edgenuity courses but no ALE enrollment record and program 'Summer Bridge' has no default. [Log in ALE anyway] [Request mapping]" |
| Course-level e-mail | required | required (course in the plan) | opens | `queue_evidence: auto` | "ALE queue opened: Algebra 2 A is in the ALE plan." |
| Course-level e-mail | required (mixed student) | not_required (CR course) | opens | `offer` (default policy `mixed_course_email = offer`) | "ALE not opened automatically: this e-mail is about Financial Literacy, which is not in the ALE plan. It is still a communication with an ALE student — [Log as ALE contact] if you discussed the plan." |
| Course-level e-mail | required | unknown (membership unconfirmed) | opens | `offer` | "Course membership in the ALE plan is unconfirmed; [Log in ALE] [Request mapping]." |
| Course-level e-mail | not_required | not_required | opens | `never` | as student-level not_required |
| Any | any | any, when the record system window was opened for this student within `external.record_system_reopen_minutes` (default 30) | opens | `open_record_system` focuses the existing window instead of reopening; `queue_evidence` still runs when `auto` | "ALE window already open (focused)." |
| Bulk e-mail (many students) | mixed | — | opens once | `queue_evidence: offer` as a batch list of the ALE-tracked recipients only; never opens n windows | "12 recipients: 8 ALE-tracked (log as contacts ▸), 3 CR, 1 unknown." |

Rules that keep both failure modes away:

- **No repeated windows.** `open_record_system` is deduplicated per student per session window; the named-window
  reuse that exists today is kept and extended with a focus-instead-of-reopen check.
- **No silent suppression.** Every `never` and every `offer` decision writes an `external_action.decided` event
  and shows its why line on the return banner; `unknown` is never mapped to `never`, always to `offer` with the
  warning chip and the configuration task.
- **Teacher preference cannot turn a `required/auto` into `never`.** A T3 preference may downgrade `auto` to
  `offer` (some teachers prefer to log after the call); the e-mail is still recorded and the offer persists on
  the student page until acted on or dismissed with a reason.

---

## 6. External Action Policy (reusable model)

The rule engine and the UI refer to abstract action ids; providers are configuration.

**Actions**

| Action id | Meaning | Providers (T2 `external_systems`) |
| --- | --- | --- |
| `communication.compose_email` | Build a message from a template and facts, with a context | in-app composer (preview modal), AI draft (local model), legacy direct `mailto` |
| `communication.open_outlook` | Hand a message to the user's mail client | desktop shell `mailto:` (Outlook), preview-then-mailto |
| `contact.open_record_system` | Open the subject's page in the district's contact-record system | `ale_web` (URL template with `{sid}`), future: any URL template, or `none` |
| `contact.queue_evidence` | Put a contact record into the record system through a confirmable queue and verify it later | `ale_queue` (existing bookmarklet agent + sync verification), future: `api`, `csv_export`, `local_only` |
| `contact.record_local` | Always-on local evidence record | built-in |

**Record-system descriptor** (T2): `{id: "ale", name: "ALE Management", student_url_template, queue_provider:
"ale_queue", verify_via: "ale_sync", evidence_fields: ["date","method","subject"]}`. A district using another
system supplies its own descriptor; a district with none sets `contact_record_system: null` and every
`contact.*` post-action resolves to `local_only`.

**Policy table** (T1, with T2 defaults), rows keyed by `(regime, context, applicability)` → ordered list of
`{action, mode}`:

```
wa_ale, student, required      → compose, open_outlook, record_local, queue_evidence:auto, open_record_system:fallback
wa_ale, course,  required      → same
wa_ale, course,  not_required  → compose, open_outlook, record_local, queue_evidence:offer     (mixed student)
wa_ale, *,       unknown       → compose, open_outlook, record_local, queue_evidence:offer+warn, config_task
core,   *,       *             → compose, open_outlook, record_local
credit_recovery, *, required   → compose, open_outlook, record_local          (district may add queue_evidence:offer)
```

A regime whose `requires_contact_documentation` is false never gets `contact.*` rows beyond `record_local`. The
same table drives the contact_log action on steps (a *contact* step for an ALE student runs `queue_evidence:auto`;
for a CR student the step does not exist), the phone-note action and the family-notification action, so ALE is
referenced in exactly one place: the record-system descriptor.

**Decision event** (`external_action.decided`, on every invocation): `{action, provider, mode, context,
applicability_json, policy_row_id, policy_version, dedupe: null|"window_focused"|"already_offered", outcome:
opened|offered|skipped|fallback, reason}`. The student page's timeline shows these as "ALE opened because…" /
"ALE not opened because…" lines, and the Audit Ready packet includes them in the communications section.

---

## 7. Phase 1 rule review with applicability guards

Classification: **universal** (regime `core`, applies to every active subject), **ALE-enrollment** (regime
`wa_ale`, student-scoped, gated on the student's plan), **course/enrollment** (regime `wa_ale` gated per
enrollment, or `core` per enrollment), **program** (regime `credit_recovery` or other district practice, off unless
configured), **configurable** (regime chosen by T1). The guard column is what the engine checks before
`evaluate()`; `[Rev B]` adds a `regimes` and `guard` field to every registry entry.

| Rule | Class | Regimes | Guard (subject must resolve `required`) | Notes |
| --- | --- | --- | --- | --- |
| WC-01 no contact recorded (week) | ALE-enrollment | wa_ale | student | Required weeks are computed from the ALE plan window (L4). |
| WC-02 at risk (current week) | ALE-enrollment | wa_ale | student | |
| WC-03 acknowledged weeks threshold | ALE-enrollment | wa_ale | student | |
| WC-04 parent notification | ALE-enrollment | wa_ale | student | |
| WC-05/06 school-day count | ALE-enrollment | wa_ale | student | Counts anchor on the plan window, not the first Edgenuity course. |
| WC-07 outreach without reply | configurable | wa_ale (default); district may enable for credit_recovery as practice | student | Without `wa_ale` the wording drops "weekly contact" and the WAC cite. |
| WC-08 evidence fields | ALE-enrollment | wa_ale | student (contact author's subject) | Only contacts for ALE-tracked students are checked for WAC fields. |
| PR-01 no activity | universal, course-scoped | core (+ wa_ale wording when the enrollment is in the plan) | enrollment active | The "act" tier maps to a *contact* step only when the student is ALE-tracked; otherwise to progress outreach. |
| PR-02 pacing drop | universal, course-scoped | core | enrollment active | |
| PR-03 expiring/expired | universal, course-scoped | core | enrollment active | The WSLP citation appears only for plan courses. |
| PR-04 start check | universal, course-scoped | core | enrollment active | The 10 %-in-10-days text is T2 program text; the WAC 392-121-182 cite only for plan courses. |
| PR-05 grade out | universal, course-scoped | core | enrollment active | |
| PR-06 senior projection | program (optional) | core | enrollment active, program graduation date set | |
| MP-P1..P3 proposals | ALE-enrollment | wa_ale | student; only `R-scope` enrollments enter P1 | Non-plan courses listed separately, never averaged in. |
| MP-01 evaluation due | ALE-enrollment | wa_ale | student | Judged weeks from the plan window. |
| MP-02 communicated | ALE-enrollment | wa_ale | student | |
| MP-03 no direct contact | ALE-enrollment | wa_ale | student | |
| IP-01..05 intervention | ALE-enrollment | wa_ale | student (and an existing evaluation) | A CR-only student can never receive an intervention-plan deadline from Brain; district CR practice may define its own plan rule under `credit_recovery`. |
| RS-01 new student | universal | core | student active | The welcome checklist's "WSLP started" line appears only when `wa_ale` is required; unknown students get "confirm program" instead. |
| RS-02 missing / status changed | universal | core | student | Also fires when the ALE plan record disappears for a student whose enrollments are still `required` by mapping (a conflict). |
| RS-03 advisor changed | universal | core | student | |
| RS-04 WSLP checklist | ALE-enrollment | wa_ale | student | |
| DH-01 source stale | universal, source-scoped | core | a source is required only if any subject in scope needs it: ALE log/enrollment required iff ≥ 1 student resolves `required` or `unknown` for wa_ale | A CR-only caseload is never asked for ALE files. |
| DH-02 ALE sync failed | configurable | core when the record system is `ale` | same as DH-01 | |
| DH-03 import anomaly | universal | core | — | |
| DH-04 week not pulled | ALE-enrollment | wa_ale | ≥ 1 ALE-tracked student | |
| DH-05 watchdog | universal | core | — | |
| DH-06 evidence disappeared | universal | core | — | |
| **AP-01 applicability unknown** `[Rev B]` | universal | core | student or enrollment resolves `unknown` for any regime with rules | One finding per subject per cause; creates a configuration task for the oversight role and a visible "needs configuration" state; never a compliance failure. |
| **AP-02 applicability conflict** `[Rev B]` | universal | core | two explicit statements disagree | Same handling; lists both records. |
| **AP-03 regime unassigned** `[Rev B]` | universal, system | core | a regime with rules has no program assigned in T1 | Single program-level configuration task. |

Views and modules:

| View | Behaviour under the gate |
| --- | --- |
| **Today's Work** | Renders steps only; a CR-only caseload has no legal/contact groups; badges and the "Needs configuration" group as §4; the scope bar shows regime counts. |
| **Contact Watch** (district ladder) | Bound to `wa_ale` by default (its steps are the district's contact practice under the WAC duty). A district may bind it to `credit_recovery` as practice; then its text loses WAC citations. Never shown for `not_required` students. |
| **MPR** (packet, proposals, form) | Only students resolved `required` for `wa_ale`; the packet lists `R-scope` enrollments and, separately, "other enrollments"; the district form mapping is T2. A mixed teacher's September packet list shows CR students under a collapsed "not evaluated (no ALE plan)" heading with the count, so nobody wonders where they went. |
| **Audit Ready** | Sections are regime-driven: an ALE student's packet has the compliance sections; a CR-only student's packet has enrollment history, communications, progress snapshots and change log, with the header "no ALE requirements applied (program CR-Lab, district v3)"; a mixed student's packet has both, with the enrollment breakdown. Every packet prints the applicability resolution used and the AP findings that were open in the period. |
| **Administrator exceptions** | Columns are computed over ALE-tracked students only; extra columns *CR students* and *unknown applicability* per advisor; a row-level warning when unknowns exceed a threshold ("4 unknown — configure program defaults"). |
| **Data Health** | Source requirements derived as DH-01 above; a first-run "regime setup" card until T1 assigns programs. |
| **Reminder Center / Today card** | Views of steps; nothing else to gate. |
| **E-mail actions** (all five entry points) | Go through the External Action Policy (§6); the legacy direct-mailto path is retired or wrapped. |

---

## 8. Unknown must not become No

When applicability cannot be determined for a subject and regime:

1. No regime-bound rule evaluates; no compliance finding, no legal deadline, no count in a compliance column.
2. One **AP-01** finding per subject per *cause* is created, stating precisely what is missing, chosen from a
   closed list so the text is testable: `no_program_assignment`, `program_default_advisory_only`,
   `no_ale_enrollment_record`, `course_membership_unconfirmed`, `conflicting_statements`, `override_expired`,
   `regime_unassigned`. The explanation names the records consulted and the one action that resolves it.
3. The right task goes to the right person: configuration causes → oversight role's configuration queue (one task
   per cause with the affected students listed); data causes (`no_ale_enrollment_record` when the ALE enrollment
   source is stale or missing) → DH-01 for the source; `course_membership_unconfirmed` → a mapping task that can
   be fulfilled either by importing the ALE course-enrollment report or by an administrator tagging the course.
4. The teacher still sees the student (universal findings, "needs configuration" badge) and can *request mapping*
   with a note, which is an event and appears in the oversight queue.
5. Heuristic hints (course prefix, teacher list, school) are attached to the AP-01 finding as **suggestions** for
   the administrator ("course prefix CR suggests credit recovery") and are marked "not used for the decision".
6. Reports show `unknown` as its own number. A packet generated for an unknown-state period says so on its cover.
7. Confidence: an `unknown` applicability is a fifth reason for *Cannot Evaluate* on the regime's rules, and it is
   reported under "cannot evaluate: applicability" separately from source staleness.

---

## 9. Explainability

Every finding, step, packet line and external-action event carries `applicability_json` (§2.4). The evidence
panel's "Why does this rule apply to this student?" section is rendered from it:

```
Applies: Washington ALE (wa_ale) — required
  decided at L5 (course in ALE plan): ALE course-enrollment report 9/24 (import #318) lists "Algebra 2 A";
  plan active 8/24/2026 – 6/10/2027 (ALE enrollment report 9/24, import #317);
  program iPAL: wa_ale required by default (district config v3, authoritative) — not needed, more specific record used.
  overrides: none. conflicts: none.
  hints not used: course prefix "IC 26-27".
```

For external actions the timeline line is generated from the decision event:

- "ALE queue opened (auto) — Chen is ALE-tracked (L4 plan active; policy row wa_ale/student/required v3)."
- "ALE not opened — Okafor has no ALE plan (program CR-Lab: not_required, district config v3, authoritative). E-mail recorded locally."
- "ALE offered, not opened — this e-mail is about Financial Literacy (course tagged credit_recovery by ADMIN 8/30, v2); Petrov's ALE plan covers Algebra 2 A and Chemistry A."
- "ALE not opened automatically — applicability unknown (no ALE enrollment record; program 'Summer Bridge' has no default). Configuration task #41 open since 9/22."
- "ALE window focused, not reopened — opened 12 minutes ago for this student."

Stored with each decision: `policy_row_id`, `policy_version` (hash of merged T1/T2), the statement ids and import
ids used, `regime.version`, and the app version. Changing a default or an override re-resolves and re-scans; findings
that stop applying are closed with `resolved_by_applicability` and the old resolution stamped, never deleted.

---

## 10. Documentation-only fixtures

To be added to `qa/sample-data/gen.py` and the expected-output JSON when the engine exists (not implemented here).
Program configuration for the fixture: district v3 with programs `iPAL` (`wa_ale` required, authoritative),
`CR-Lab` (`wa_ale` not_required, authoritative), `Summer Bridge` (no default, advisory hint "usually not ALE").
Course-mapping table: `financial literacy` → `credit_recovery` (set by ADMIN 8/30, v2). External systems: `ale`
descriptor as today.

| SID | Student | Setup | Expected applicability | Expected findings (as-of 9/25) | External action on ✉ |
| --- | --- | --- | --- | --- | --- |
| 412003 | Chen (existing) | ALE plan active; both courses listed in the ALE course-enrollment report | student required (L4); Algebra 2 A, Chemistry A required (L5) | as Revision A golden run | student-level: queue_evidence auto; course-level (Algebra 2 A): auto |
| 412015 | Okafor, Ada — **CR-only** | Program CR-Lab by explicit program assignment; two Edgenuity courses (`CR 26-27 Algebra 1`, `CR 26-27 English 10`); no ALE enrollment record; no contacts anywhere; last gradebook entry 9/8; pacing −18 | student not_required (L3/L2 authoritative); both enrollments not_required | PR-01 (episode 9/8, warn/act → progress outreach, no contact step), PR-02 if history; **no WC, MP, IP, RS-04, DH-04**; not counted in ALE columns | student-level: Outlook only, e-mail recorded locally, why line "no ALE plan (program CR-Lab)"; ALE never opens |
| 412016 | Petrov, Nina — **mixed** | ALE plan active 8/24; ALE course-enrollment lists Algebra 2 A and Chemistry A; third Edgenuity course `Financial Literacy` tagged credit_recovery; weekly contacts present; Financial Literacy 12 days inactive | student required (L4); Algebra 2 A, Chemistry A required (L5); Financial Literacy not_required (L5 mapping) | PR-01 for Financial Literacy → progress outreach (core), no contact step from it; MP-P over the two plan courses only; packet lists Financial Literacy under "other enrollments"; no WC (contacts present) | student-level: auto; course-level on Financial Literacy: **offer** with the why line; course-level on Algebra 2 A: auto |
| — | **Mixed teacher caseload** (advisor STA: Dawson, Espinoza, Foster, Kowalski + Okafor) | as above | — | Today's Work for STA: legal/contact groups contain Espinoza only (Dawson has no findings); Okafor appears in Progress with badge CR; scope bar "4 ALE · 1 CR · 0 unconfirmed"; DH-01 for ALE sources required (4 ALE students); exceptions row STA: ALE denominator 4, CR 1, unknown 0 | — |
| 412017 | Quinn, Sam — **unknown program** | Edgenuity rows in program Summer Bridge (explicit assignment); no ALE enrollment record; no course tags | student unknown (L2 advisory only); enrollments unknown | AP-01 (`no_ale_enrollment_record` + `program_default_advisory_only`) once; configuration task for oversight listing Quinn; PR-* run as core; **no WC/MP/IP**; card in "Needs configuration"; counted as unknown | student-level: Outlook opens; **offer + warning chip**; why line names the two missing facts; never silently skipped |
| 412018 | Reyes, Tomas — **administrator override** | ALE enrollment record says plan active 8/24; override by ADMIN 9/15: `not_required`, reason "plan paperwork withdrawn, re-enrolling 10/5", window 9/15–10/4 | student not_required (L6) through 10/4; from 10/5: **unknown** (`override_expired`) until renewed/cleared, then required if the plan record still stands | 9/25: no WC/MP/IP; the override, reason and window printed on the student page and in Audit Ready; 10/5: AP-01 `override_expired` + configuration task; when cleared: WC weeks from 10/5 only (weeks under the override are "not required (override)") | 9/25: Outlook only, why line cites the override; 10/5: offer + warning |
| — | **Course-specific e-mail** (Petrov, Financial Literacy row) | as 412016 | — | e-mail record with `context = course:Financial Literacy` | offer; if the teacher accepts, the ALE queue is pre-filled with type Email and subject from the message; decision event `mode = offer, outcome = opened_by_user` |
| — | **Student-level e-mail** (Petrov roster row) | as 412016 | — | e-mail record `context = student` | auto queue_evidence; `open_record_system` not opened (queue provider available); second click within 30 minutes → queue again, no second ALE window |
| — | **Conflict** (Okafor gets an ALE enrollment record in a later import while CR-Lab says not_required) | — | student **unknown** (`conflicting_statements`) | AP-02; configuration task; no WC/MP/IP until resolved | offer + warning |

Invariant assertions for the test suite:

- For every subject with a statement `not_required` at L5 or L6, the set of `wa_ale` findings is empty across all
  as-of dates in the fixture year (property test over the calendar).
- For every subject resolved `unknown`, no finding with `severity = legal_deadline` exists and no `contact` step
  exists; exactly one AP finding per cause exists.
- For every e-mail decision event, `outcome = skipped` implies `applicability.state = not_required` (never
  `unknown`), and `state = unknown` implies `mode = offer` with `warn = true`.
- No `external_action.decided` event names a provider except through the record-system descriptor id.
- `open_record_system` events for the same student within `record_system_reopen_minutes` have
  `dedupe = window_focused`.

---

## 11. Changes applied to the other documents `[Rev B]`

- Spec: guiding rules 7–8; new §2.11 (regime, applicability statements, resolution, `applicability_json`); §2.7
  registry gains `regimes` and `guard`; §3.1 T0 split into definitions and scope, program assignment keys, external
  systems and External Action Policy keys; §4 common attributes gain the gate; AP-01..03 added to §4.6; §7.4 queue
  grouping and badges; §7.6 e-mail composite action; §8.2 wireframe scope bar; §10 decisions 14–16; §11 changelog.
- Validation report: new §12 "Applicability" with acceptance cases AP-* and the mixed-caseload invariants, and a
  note in §1 that C-9 (Pasco defaults) is now resolved through regimes rather than only through tiers.
