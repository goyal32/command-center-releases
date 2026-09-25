# MPR status vocabulary — trace through the 0.2.46 runtime

**Status:** documentation only (no code changed). Traced 2026-09-25 in the unpacked, executed 0.2.46 runtime
(`app-html/Command_center_universal_v120.html` modules and `app.asar` main-process files). Line numbers are omitted
on purpose; function and field names are the stable handles.

## 1. The labels

There are **three separate dropdown vocabularies**, not one. All three are hard-coded string literals.

| Field (Laserfiche form control) | Command Center key | Exact labels, in the order the app's wizard offers them |
| --- | --- | --- |
| **Progress Summary** (`Field18`) | `progress_summary` / `ev.summary` | `On Target` · `Adequate, but Needs Improvement` · `Unsatisfactory` · `No Progress` |
| **Communication Requirement Status** (`Field19`) | `communication_status` / `ev.comm` | `Weekly Requirements Met` · `Needs Improvement` · `Unsatisfactory` · `No Communication` |
| **Progress Status** (`Field9`) | `progress_status` / `ev.status` | `Satisfactory` · `Unsatisfactory` |

Related form fields the app fills: `Field24` Month (month name), `Field28` Meeting Method (default `Email`),
`Field10-0` Intervention Plan Needed (checkbox), `Field12` Intervention Date, `RTFEditor-Field14` Meeting
Narrative, `RTFEditor-Field17` progress-report notes, `Field21` PDF attachment, `Field5` student number (read-only
check).

Note the word `Unsatisfactory` appears in all three vocabularies with three different meanings (a summary tier, a
communication tier, and the overall determination). "Needs Improvement" appears in two with different prefixes.

## 2. Where they are defined

| Location | What is defined |
| --- | --- |
| Module `ipal-mpr-v146`, `evaluate(s)` | The four summary tiers and four communication tiers as literals, chosen by thresholds; the overall status `Satisfactory` / `Unsatisfactory` from `settings.unsatisfactoryRule` (`both` default, `either`, `progress`). |
| Module `ipal-mpr-v146`, `settings` defaults | `unsatisfactorySummaries: ['Unsatisfactory', 'No Progress']`, `unsatisfactoryComms: ['Unsatisfactory', 'No Communication']` (which tiers count as "bad" for the overall status); thresholds `adequateGap 5`, `unsatisfactoryGap 10`, `noProgressAvg 10`, `passingGrade 70`, `commMetDays 7`, `commNeedsDays 14`, `commUnsatDays 20`; merged with `TENANT_CONFIG.mpr` (which only sets `windowWorkingDays`, `holidays`, `unsatisfactoryRule`, `laserficheUrl`) and `ipal_mpr_settings_v1`. The label lists themselves are **not** configurable anywhere. |
| Module `ipal-mpr-v146`, wizard detail HTML | The three `<select>` option lists (the order shown in §1), pre-selected from `evaluate()` or the teacher's edit. |
| Core script, `generateMPRComment(courses)` | A **second, older, independent implementation** of the same summary and communication tiers with the same literals (comment in source: "v48: Progress Summary using OFFICIAL iPAL ALE Learning Plan labels (matches the dropdown fields on the official form)"). Same thresholds as the module's defaults but hard-coded (10 / 5 / 2 failing / expired counts; 7 / 14 / 20 days), and its communication tier uses only *days since last contact*, never judged weeks. It renders the "MPR comment" box on the dashboard when a student is selected. It does not feed the form. |
| `src/laserfiche.js`, `FILL_SCRIPT` | No vocabulary of its own: `setSelect(id, value)` picks the option whose `value` **or trimmed text** equals the string it is given. The form's option text is therefore the authority; the app's literals must match it exactly. |
| `src/laserfiche.js`, `WATCH_SCRIPT` | Reads back the **selected option text** of `Field9`, `Field18`, `Field19` (and month, method, intervention flag/date) when the teacher clicks Submit, and reports them to the app. |
| `src/aleSync.js`, `INTERVENTION_STATUS` | `{2: 'Level 1', 3: 'Level 2', 4: 'Level 3'}` — an unrelated ALE vocabulary for intervention records. |

## 3. Every function/module that uses the labels

| Module / file | Function | Use |
| --- | --- | --- |
| `ipal-mpr-v146` | `evaluate` | Produces `summary`, `comm`, `status`, `intervention = status === 'Unsatisfactory'`. |
| | `narrativeHtml` | Chooses recommendation text by `ev.summary` (`On Target`, `Adequate, but Needs Improvement`, …) and prints `ev.comm` in the challenges list. |
| | `openForm` | Builds the Laserfiche payload: `progress_status`, `progress_summary`, `communication_status`, `meeting_method`, `intervention_needed`, `intervention_date`, narrative and notes HTML, PDF; stores `state.prepared[sid] = {month, status, summary, comm}`. |
| | `afterFilled` | Audit row `mpr.prepared` with `{sid, month, status, summary, comm}`. |
| | `applySubmitted` | Takes the **read-back option text** from the form (`r.progress_status`, `r.progress_summary`, `r.communication_status`) and overwrites the app's edits and `prepared` record with what the teacher actually submitted; marks `mpr_done`; calls `finalize`. |
| | `finalize` | `finalStatus = prepared.status || 'Satisfactory'`; audit row `mpr.recorded`; calls `recordEvaluation`; toast tells the teacher to create the plan within 5 school days when `Unsatisfactory`. |
| | `recordEvaluation` | **Maps** `'Unsatisfactory' → 'unsatisfactory'`, anything else → `'satisfactory'`, and saves through `window.__ipalWac.saveEvaluation(student, result, month)`. Summary and communication tiers are **not** stored here. |
| | `consecutiveUnsat` | Counts consecutive months whose ledger `result === 'unsatisfactory'`, seeded by the current `'Unsatisfactory'` status. |
| | `detailHtml` / wizard | The three `<select>` lists; the "send plan to ALE" button appears when status is `Unsatisfactory` or the ledger month is `'unsatisfactory'`. |
| | `interventionPayload`, `sendInterventionToAle` | Sends to ALE: `status: String(opts.status || 2)` (ALE's Level code, default Level 1), `strategy` id 1–4, dates, manager. **No MPR label is sent.** |
| | `watchSubmitted` / ALE poll | `api.ale.mprStatus(month)` → rows with `mpr_done` derived from ALE's `contact_count > 0`; used only to finalize drafts. |
| `ipal-wac-v129` | `saveEvaluation`, `__ipalWac` | Stores `{key: sid|YYYY-MM, sid, name, month, result: 'satisfactory'|'unsatisfactory', evaluatedAt, evaluatedBy, plan}` in IndexedDB `ipal_interventions_v1` store `records`; its own panel has ✓ Satisfactory / ✗ Unsatisfactory buttons that write the same lowercase values; consecutive-month logic and summary counts use `result === 'unsatisfactory'`. |
| `ipal-today-v151`, `ipal-leadership-v155` | ledger readers | Read `ipal_interventions_v1` for plan/unsatisfactory facts (lowercase `result`). |
| Core | `generateMPRComment` | Dashboard MPR comment box (independent evaluator, §2). |
| Core (snapshot compare) | auto-compare cards | A card literally titled `No Progress` meaning "no change between snapshots" — a **name collision**, not the MPR tier. |
| `src/laserfiche.js` | fill / watch scripts, `mpr.submit_clicked`, `mpr.form_submitted` audit rows | Pass the strings through; audit rows carry `progress_status` only. |

## 4. Origin of the vocabulary

- The **Progress Summary**, **Communication Requirement Status** and **Progress Status** labels originate in the
  district's Laserfiche form (`forms.psd1.org/Forms/ALEMonthlyReport`). Evidence: the core comment says the tiers
  "match the dropdown fields on the official form"; the fill script matches on option text and reports `skipped`
  when no option matches; the watch script reads option text back; the app has no configuration for the label
  strings. Command Center's contribution is the **thresholds** that propose which option to pre-select, not the
  option set.
- **ALE** contributes nothing to this vocabulary. What the app reads from ALE for the MPR is `mpr_done`
  (`contact_count > 0` for the month), last contact, and learning-plan id; what it writes to ALE for interventions
  uses ALE's own `Level 1/2/3` status codes and strategy ids.
- The **lowercase** `satisfactory` / `unsatisfactory` ledger values are Command Center's own internal vocabulary
  (WAC module), derived from the form's Progress Status.

## 5. Mappings between label sets (all found)

| From | To | Where | Nature |
| --- | --- | --- | --- |
| summary ∈ `unsatisfactorySummaries` and/or comm ∈ `unsatisfactoryComms` | `progress_status` `Unsatisfactory` / `Satisfactory` | `evaluate`, per `unsatisfactoryRule` | Proposal only; teacher can override in the wizard; overwritten by whatever the form reports at submit |
| `progress_status` `Unsatisfactory` | ledger `result: 'unsatisfactory'`; everything else → `'satisfactory'` | `recordEvaluation` | **Lossy**: summary and comm tiers are not persisted; a status left blank on the form becomes `Satisfactory` (`prepared.status || 'Satisfactory'`) |
| `progress_status` `Unsatisfactory` | `intervention_needed = true` (form checkbox) | `evaluate` → `openForm` | Direct |
| form option **text** (read back) | app `edits` / `prepared` | `applySubmitted` | Identity, but the source of truth flips from the app's proposal to the form's text |
| app plan checkbox (`contact/goals/course/lab`) | ALE `strategy` 4/1/2/3; ALE `status` 2/3/4 = Level 1/2/3 | `interventionPayload` | Unrelated to MPR labels |

No mapping converts the four-tier summary or the four-tier communication label into any other label set; they
travel verbatim to the form and back.

## 6. What is written or sent where

| Destination | Values |
| --- | --- |
| **Laserfiche form** (via `mpr:openForm` → `FILL_SCRIPT`) | `progress_status` (Field9), `progress_summary` (Field18), `communication_status` (Field19), month, meeting method, intervention flag/date, narrative HTML, notes HTML, PDF. Exact strings from §1. The teacher submits the form; the app only observes. |
| **ALE** | Nothing from the MPR labels. Interventions: `status` Level code, `strategy` id, dates, manager, learning-plan id (via the approval dialog). Contacts: type id, date, description. |
| **Local ledger** (`ipal_interventions_v1` / `records`) | `result: 'satisfactory' | 'unsatisfactory'`, month, evaluator, plan. |
| **SQLite `audit_log`** | `mpr.prepared` `{status, summary, comm}`, `mpr.recorded` `{status, how}`, `mpr.submit_clicked` `{progress_status}`, `mpr.form_submitted` `{progress_status, how}`. Only `mpr.prepared` keeps the tier labels. |
| **Renderer memory** | `state.prepared`, `state.edits`, `state.filled` (drafts; lost on restart — audit M10). |

## 7. Conclusions for Brain v1

1. **Preserve the external vocabulary verbatim.** The three option sets are the district form's; Brain must emit
   them byte-for-byte (including the comma and capitalisation in `Adequate, but Needs Improvement`), keep them
   distinct per field, and treat them as a T2 *form mapping* (the form owner may change option text) rather than as
   product constants. No evidence supports changing them.
2. **Fix the spec's MP-P rules to the four-tier summary and the four-tier communication set** with the shipped
   thresholds and inputs, so shadow comparison is like-for-like.
3. **Do not lose the tiers on record.** The current ledger keeps only `satisfactory/unsatisfactory`; the
   `evaluation` table must keep summary, communication and status (proposed and confirmed) plus what the form
   reported back.
4. **Treat the form read-back as the record of what was submitted**, separate from what Brain proposed and what the
   teacher confirmed in the app; a difference between confirmed and submitted is a fact to show, not to hide.
5. **Never default a blank status to Satisfactory.** `finalize` does (`prepared.status || 'Satisfactory'`); Brain
   must record "not stated on the form" and keep the evaluation in `form_opened` until a status is known.
6. **Retire the core `generateMPRComment` duplicate** behind the same flag as `brain.mpr` (it disagrees with the
   module on communication, using days-since-contact instead of judged weeks) and rename the snapshot-compare card
   away from `No Progress` to avoid the collision.
7. **Intervention "level" is ALE's field, not an MPR tier**; keep it in the plan model as `ale_status_code` with the
   `Level 1/2/3` labels from `aleSync.INTERVENTION_STATUS`.
