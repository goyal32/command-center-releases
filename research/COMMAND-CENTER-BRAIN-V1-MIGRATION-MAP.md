# Command Center 0.2.46 → Brain v1 — Implementation and Migration Map

**Status:** documentation and analysis only. Prepared 2026-09-25 from the unpacked, executed 0.2.46 runtime
(`Command-Center-Setup-0.2.46.exe` → `app.asar` + `app-html/Command_center_universal_v120.html`), the QA audit, and
the four research documents. No production code was modified; no application file was committed. Nothing here is
permission to implement.

**How to read the runtime references.** The HTML app is one 53,000-line file made of a core `<script>` (referred
to as *core*) followed by 95 `<script id="ipal-…">` modules; module ids below are those `id` attributes. Main-process
files are named by their path inside the asar. Line numbers are deliberately omitted: the private source may be
split into files or differ in layout. Function and key names are the runtime's; they are the stable handles.

---

## 1. Map of the existing app

### 1.1 Runtime shape

| Layer | Facts from 0.2.46 |
| --- | --- |
| Electron main | `main.js` (window, single-instance lock, quit/backup hooks, admin/audit windows), `preload.js` (exposes `window.desktop.{auth, users, roles, schools, audit, settings, provision, license, ale, edg, mpr, messages, importWatch, display, app, backup, config, feature, district, data, ai, voice}`), `src/ipc.js` (all `ipcMain.handle` channels, role guards), `src/session.js`, `src/storage/{StorageAdapter, SqliteAdapter, migrations}.js`, `src/aleSync.js`, `src/aleApproval.js`, `src/edgenuity.js`, `src/laserfiche.js`, `src/importWatch.js`, `src/backup.js`, `src/featureAccess.js`, `src/districtSync.js`, `src/messages.js`, `src/updater.js`/`updateGuard.js`, `src/config.js`, `src/dbkey.js`, `src/license.js`, `src/provision.js`, `src/logger.js`, `src/displayFit.js`, `src/voice.js`, `src/ai/{AiProvider, LocalLlamaProvider}.js`, `src/auth/{registry, LocalPasswordProvider, GoogleAuthProvider}.js`; renderer pages `renderer/{login, admin, audit}.html`. |
| SQLite (encrypted, main process) | Migration v1: `districts`, `schools`, `roles`, `users`, `user_roles`, `audit_log(id, ts, district_id, user_id, username, event_type, detail_json)`, `app_settings(district_id, key, value_json)`, `backups`; v2: `mirror_records(scope, k, v, updated_at)` — the streamed copy of every `ipal_*` localStorage key and IndexedDB record; v3: roles `facilitator`, `director`. `schema_migrations` tracks versions. |
| Renderer IndexedDB | `ipal_command_center_history` (stores `edgenuity_imports` 90-day retention, `ale_snapshots` 60-day, `snapshots` keyed by `snapshot_date`), `ipal_ale_enrollment_v1`, `ipal_course_enrollment_v1`, `ipal_interventions_v1`, `ipal_wslp_v1`, `ipal_audit_archive_v1`, `ipal_iep_store_v1`. |
| Renderer localStorage (main keys) | `ipal_latest_dashboard_import_v1` (+ `_meta_v1`), `ipal_ale_contacts_v1` (enrollment/contact info by SID), `ipal_ale_contact_log_v1`, `ipal_cn_contact_log_v1`, `ipal_ale_log_imported_at`, `ipal_attendance_rows_v1`, `ipal_attendance_state_v1`, `ipal_contact_watch_v1`, `ipal_cw_return_seen_v1`, `ipal_worklist_done_v1`, `ipal_rem_prefs_v1`, `ipal_today_prev_v1`, `ipal_today_prose_v1`, `ipal_leadership_prev_v1`, `ipal_alenew_{filters,marks}_v1`, `ipal_att_newstudent_done_v1`, `ipal_mpr_{me,settings}_v1`, `ipal_user_calendar_v1`, `ipal_tenant_overrides_v1`, `ipal.recon.*`, `ipal.disable.*` (per-module kill switches). |
| Config | `TENANT_CONFIG` block in module `ipal-tenant-config-v1` (calendars, csv conventions incl. `course_prefix_strip` and `cr_teachers`, `ale_url_template`, `ale_sync`, `mpr` incl. `laserficheUrl`, e-mail policy text), overridable by `config:tenantOverridesSync` → `ipal_tenant_overrides_v1`; main-process `config.json` in userData. |

### 1.2 Area map

Format: *Current file → function/area → current responsibility → Brain v1 replacement or adapter.*

**Edgenuity imports**
- core → `csvUpload` change handler → reads the Course Enrollments CSV, parses rows, sets the dashboard row set, calls `updateDashboard()`; persists the live set to `ipal_latest_dashboard_import_v1`, history to `edgenuity_imports`, and (via `autoSaveWeeklySnapshotSilently` / `saveWeeklySnapshot`) to `snapshots`; `restoreLatestDashboardImport()` on start → **adapter**: the same handler feeds the Brain import pipeline (§3) in parallel; Brain's `import`, `course_snapshot` rows are written by a new `brain:import` IPC; the legacy row set stays the UI source until `brain.todayWork`.
- `ipal-edgenuity-snapshots-v77-16-20` → `importAll`, `putSnapshot`, `guessDateFromFilename`, `parseCSV`, `extractSid`, `buildAdvisorMap` → bulk back-fill of historical exports into `snapshots` → **adapter**: back-fill writes Brain snapshots too (same file hash rule).
- `ipal-edgfresh-v157`, `src/edgenuity.js` (`createEdgenuity`, `edg:open/export/status/progressReport`), `src/importWatch.js` (`sniffType`, `candidateFor`, `import-watch:read`), `ipal-iwatch-v136` (`__ipalImportWatchOffer`) → embedded Edgenuity window, human-click export, Downloads watcher offer → **keep**; they become `received_via` values on Brain's `import` row.
- `ipal-import-diagnostics-v135`, `ipal-recon-diff-v77-23-00-script` (`normalizeCourse`, `isCrTeacher`, track `cr|ic`) → header diagnostics and Edgenuity↔ALE course reconciliation → **adapter**: diagnostics become DH-03 checks; the reconciliation match becomes the L5 *hint* source (never the decision) in the applicability resolver.

**ALE enrollment import / sync**
- core → `aleContactsUpload` handler, `restoreAleFromStorage()` → parses the ALE student-enrollment CSV into `ipal_ale_contacts_v1` (e-mails, advisor, plan status/dates) → **adapter**: also writes Brain `student` fields and the L4 applicability statements (plan active window).
- `ipal-course-enroll-v77-16` (`parseCsv`, IndexedDB `ipal_course_enrollment_v1`) → ALE course-enrollment report → **adapter**: the L5 statements (course in plan) and `enrollment` linkage.
- `src/aleSync.js` (`createAleSync`: `sync`, `login`, `autoLogin`, `weekRows`, `contactLogWeeks`, `mprStatus`, `lpCourses`, `capture`; exports `weekOf`, `schoolYearStart`, `normaliseWeek`, `parseCsv`, `usToIso`, `CONTACT_TYPES`, `INTERVENTION_*`), `ipal-ale-sync-v144` (bookmarklet agent, `importBundle`, `mergeCsv`, `aleNameMismatch`, `edgExport`), IPC `ale:*` → pulls contact log (this week + previous), course enrollment, student enrollment, week plans from the ALE site session → **keep** as the `ale_sync` provider of `received_via`; Brain records the pull time as the coverage horizon.

**ALE contacts**
- core → `__parseAleContactLog`, `__aleContactDateTs` (QA-fix), `ipal_ale_contact_log_v1`, `ale_snapshots`, `__getAleContactByStudentNumber`, `__aleLastContactByStudentNumber` → parses the contact-log CSV, keeps last-contact per student → **replace** with Brain `contact` rows (one normaliser, `dedupe_key`, `qualifies`, `week_key`, `verification_state`); legacy structures rebuilt from Brain rows during coexistence.
- `ipal-ale-queue-v145` (`__ipalAleQueueAdd/Open/Status`, `recordMailto`, `__ipalEmailOpened`, `__ipalMailto`, `polishNote`, `sendSelected`, `pullWindow`), `src/aleApproval.js` (`createAleApproval`: Windows confirm dialog per batch, TTL, name-mismatch check), IPC `ale:approveContacts`, `ale:logContact`, `ale:checkContact`, `ale:verifyNow` → the confirmable queue that writes contacts to ALE and verifies on the next pull → **keep**; this *is* the `contact.queue_evidence` provider `ale_queue`.
- `ipal-autolog-v128` → auto-logs app e-mails into the queue → **adapter**: becomes the `contact.record_local` step plus `queue_evidence` per External Action Policy.
- `ipal-voice-v152`, `src/voice.js` → voice notes into contact text → **keep**.

**Roster / student matching**
- core → External ID tokenisation (`extId.split(/\s+/)` → counselor, advisor, SID), name splitting (`cleanToken`, `__cleanNameToken`), `ipal-name-cleanup-v77-22-00-script`, `ipal-roster-v153` (`mergeRoster`, `nameToSid`, `normEmail`, `looksLikeStudentsReport`, Students report import), `ipal-recon-diff` name/course matching, `src/aleApproval.nameMismatch` → several independent SID/name normalisers → **replace** with one `sid`/name normaliser (spec §2.1) exposed to legacy modules as the same function names (shim).

**Blue roster e-mail icon, AI e-mail, smart templates, ALE window** — see §7 (shared handler).
- core → `buildStudentMailto`, `openMailtoInNewTab`, `openMailtoKeepAppOpen`, `__captureReturnContext`, `openAleStudentWindow` (named window, `TENANT_CONFIG.ale_url_template`), `__recordWeeklyEmailClick` (Sunday week key, app-side e-mail history), `__generateAiStudentEmail` (locked AI path), `__openSmartTemplateEmail`/`__buildPreferredSmartMailto` (Smart Attention templates), e-mail fix modules 004–011/018/023 (`buildBulkPolicyMailto` and quick-view bodies), `ipal-advisory-email-v141` (preview modal), `ipal-bulk-email-hard-fix-script` → **adapter** (§7).

**Weekly contact detection**
- core → `__aleHasNoRecentContact` (original), overridden by `ipal-missing-contact-final-v6-script` and again by `ipal-contact-week-fix-script` (`thisWeekStart`, `parseLocalDate`, `installMergeHook`, `__aleLogLoaded`), consumed by quick views (`ipal-missing-contact-sync-v4/authoritative-v5`, `ipal-digest-no-contact-repair-script`), `ipal-contact-banner-v25`, worklist, Ask, Today → **replace** with WC-01/02 findings; `__aleHasNoRecentContact(sid)` remains as a shim that reads the Brain finding during coexistence and is compared in shadow mode.
- core → `__recordWeeklyEmailClick` → an app-side "contacted by e-mail this week" signal → **adapter**: becomes an `email_record` contact with `direction = outbound` (never qualifying on its own).

**Contact Watch**
- `ipal-contact-watch-v143` (`compute`, `steps`, `graceWindows`, `graceMaxWeeks`, `needsAction`, `decisionLine`, `citation`, `sundayOf`, `weekChips`, `announceReturned`, `audit`, store `ipal_contact_watch_v1`, `ipal_cw_return_seen_v1`) → the district ladder (reach out → meeting → archive) over missed weeks with grace windows → **adapter**: reads WC-01 acknowledged weeks and exceptions from Brain instead of recomputing; its ladder becomes the `wa_ale` (or `credit_recovery`, per D-15) practice steps inside the case; UI kept.

**MPR**
- `ipal-mpr-v146` (`window.MPR`: `evaluate` (summary/comm/status thresholds from `ipal_mpr_settings_v1`), `judged`, `schoolWeeks`, `qualifies`, `weekState`, `consecutiveUnsat`, `deadlineText`, `schoolDaysFrom`, `isWorkingDay`, `lastWorkingDays`, `narrativeHtml`, `openForm`, `subscribeFilled/Submitted`, `recordEvaluation`, `ledger*`, `sendInterventionToAle`, `interventionPayload`, `reviewCheckpoint`, `window.ProgressReport`), `src/laserfiche.js` (`createLaserfiche`: fill script, submit watcher, `mpr:openForm`), IPC `ale:mprStatus`, `ale:addIntervention`, `ale:interventionForm/Goals`, `ale:approveIntervention/GoalReview`, `ipal-feature-access-v161.wrapMpr` → proposal, narrative, form fill, submission watch, intervention write to ALE → **adapter**: `evaluate` becomes the MP-P rules (note: the shipped module has a four-level summary — On Target / Adequate but Needs Improvement / Unsatisfactory / No Progress; the spec's MP-P1 must adopt the four levels, see §2 parity item), the form fill and ALE intervention writes stay as providers; drafts move from memory to the `evaluation` table (fixes audit M10).

**Interventions**
- `ipal-mpr-v146` (`ledgerPatchPlan`, `reviewCheckpoint`, `sendInterventionToAle`), IndexedDB `ipal_interventions_v1` (also read by Today and Leadership), `src/aleSync.js` (`addInterventionUnlocked`, `updateIntervention`, `addInterventionGoalUnlocked`, `updateInterventionGoalUnlocked`, `INTERVENTION_STRATEGY`), `ipal-wac-v129` (`isSchoolDay`, `addSchoolDays`, WAC panel) → plan entry, goal review, ALE write → **adapter**: `plan`/`plan_version` tables become the record; the ALE write is a provider; the WAC panel reads Brain deadlines.

**Today / worklist**
- `ipal-today-v151` (`buildFacts`, `bucketOf`, `contactDaysOf`, `daysSince`, `runAction`, `moduleCounts`, `ipal_today_prev_v1`, `ipal_today_prose_v1`), `ipal-worklist-v122` (`compute`, `loadDone/saveDone`, `ipal_worklist_done_v1`), `ipal-ask-v125`, `ipal-daily-summary-v29`, `ipal-att-newstudents-v163` (`__ipalTodayExtraFacts`) → three independent "what should I do today" computations → **replace** with the case/step queue when `brain.todayWork` is on; until then Today and worklist become read-only *views* of steps behind the flag, and their own computations run in shadow.

**Reminders**
- `ipal-reminders-v138` (`computeCounts`, `visibleItems`, `untilFor`, `openEvals`, `ipal_rem_prefs_v1`) → reminder center over evaluations/contacts → **adapter**: a view of steps filtered by need; prefs stay T3.

**Snapshots / trends**
- core → `snapshots` store, `saveWeeklySnapshot`, `autoSaveWeeklySnapshotSilently` (QA-fix M19), Weekly Snapshot compare; `ipal-edgenuity-snapshots`; `ipal-leadership-v155` (`delta`, `byCause`, `ipal_leadership_prev_v1`); `ipal-quickwins-v130` (reads `edgenuity_imports`) → **replace** trend math with `course_snapshot` + classifier `weekly_rate`; compare screens read Brain snapshots.

**School calendar**
- `ipal-tenant-config-v1` (`calendar` 2025-26 legacy block, `school_calendar` 2026-27), `ipal-school-calendar-v147` (`isSchoolDay`, `isSchoolWeek`, `schoolDaysInWeek`, `questions`, `ipal_user_calendar_v1`), `ipal-lifecycle-script` (calendar modal, PDF/OCR extraction), `ipal-fm-script` (`isSchoolDay`), `ipal-wac-v129` (`isSchoolDay`, `addSchoolDays`), `ipal-hs-policy-fix-v22` (`businessDaysBetween`, `isWorkingDay`, `isHoliday`), `ipal-mpr-v146` (`isWorkingDay`, `schoolDaysFrom`, `lastWorkingDays`), `src/aleSync.js` (`weekOf`, `schoolYearStart`), `src/edgenuity.js` (`schoolYearStart`) → **replace** with the single `school_calendar` service; each legacy function becomes a one-line shim over it (audit C3 `deriveLegacyCalendar` is the first step of this).

**Student / advisor ownership**
- core (External ID tokens → counselor/advisor codes; `advisorFilter`), `ipal-mpr-v146` (`advisorTokenOf`, `detectMyAdvisor`, `ipal_mpr_me_v1`), `ipal-ale-queue-v145` (`advisorOf`, `advisorCodes`, `myCode`), `ipal-edgenuity-snapshots` (`buildAdvisorMap`), `ipal-roster-v153`, `ipal-filter-organization-script`, `ipal-saved-views-v1` → **replace** with `student.advisor_code/advisor_name/teacher_of_record` + `program.advisor_source`; RS-03 mismatch rule.

**Login / roles**
- `renderer/login.html`, `src/auth/*`, `src/session.js` (`hasRole`, `requireRole`), `src/ipc.js` guards, `ipal-session-guard-v26`, `ipal-roles-v148` (`__ipalRole`, pilot roles), `src/featureAccess.js` + `ipal-feature-access-v161` (per-user feature rules, `feature:list/mine/set`) → **keep**; Brain adds flags to the same feature-access mechanism (§5) and uses the session username as `actor`.

**Audit / history**
- SQLite `audit_log` via `audit:log/list/listTypes`, `renderer/audit.html`, `ipal-audit-panel-v77-16-7`, `ipal_audit_archive_v1`, `ipal-history-redesign-v36` (History screen; audit M7 UTC shift), `ipal-telemetry-v127`, Contact Watch `audit()` → **adapter**: `audit_log` stays and is mirrored into the hash-chained `event` table (spec §2.9); History reads `event`.

**Backups**
- `src/backup.js` (`createBackup`, `maybeAutoBackup`, `gatherRendererBundleJson`, `applyRendererRestore`), IPC `backup:run/list`, main-process quit hooks (QA-fix M12/M13), `ipal-storage-migration-v1` (`backupToIndexedDB`, `trimLocalStorage`), `ipal-sqlite-mirror-v134` (`data:mirrorWrite/Load/Status`, `__ipalMirrorFlush`) → **keep**; Brain tables live in the same SQLite file so `.ccbackup` covers them; the backup manifest gains the event-chain head hash.

---

## 2. Duplicated logic (migration risks)

Each row is a concept computed independently today; Brain must own one implementation and the others must become
shims that call it, verified by shadow comparison before removal.

| Concept | Independent implementations in 0.2.46 | Risk |
| --- | --- | --- |
| **Weekly contact met / missing** | core `__aleHasNoRecentContact` → overridden twice (`missing-contact-final-v6`, `contact-week-fix`); `ipal-digest-no-contact-repair-script`; `ipal-contact-banner-v25.getCounts`; `ipal-contact-watch-v143.compute` (own `fromLog`, `sundayOf`, grace); `ipal-mpr-v146.weekState/qualifies`; `ipal-today-v151.contactDaysOf`; `ipal-worklist-v122.compute`; `ipal-attendance-v139.evaluateRow` (attendance-course week, Monday-based); `__recordWeeklyEmailClick` (e-mail counts as contact in the app but not in ALE) | High: five answers to "was Chen contacted this week" (audit M11/M1). |
| **Dates / weeks** | `__getWeekStartSunday` (core), `startOfWeekMon` (module `anon-013`), `mondayOfThisWeek` (attendance), `sundayOf` (Contact Watch), `thisWeekStart` (contact-week-fix), `weekOf`/`normaliseWeek` (`aleSync.js`), `todayLocal` / `todayDate` / `ymd` in eight modules; date parsing `parseLocalDate`, `parseDate` ×6, `usToIso` ×2, `__aleContactDateTs` | High: Sunday vs Monday weeks; UTC shift (audit M7); string-sorted dates (C2). |
| **Course status (expired / complete / archived)** | core row filters (`isExpired` computed inline in at least three places, midnight vs now — audit M2), `ipal-bulk-archive-v77-16`, `ipal-other-courses-v42-script`, `ipal-eoy-closeout-script`, `ipal-year-archive-v123`, Leadership `courseFacts` | Medium. |
| **Behind / on-pace classification** | core `bucket` labels (On Pace / Watch List / Starting to Struggle / Significantly Behind / Extremely Behind) and quick views in `__POLICY_SORTS`; `ipal-hs-policy-fix-v22.rowMatchesQuickView`; `ipal-plc-view-script` (−20/−30 reasons); `ipal-digest-no-contact-repair` (`pacing < -5`); `ipal-today-v151.bucketOf`; `ipal-mpr-v146.evaluate` (`adequateGap`, `unsatisfactoryGap`, `noProgressAvg`, `failing`, `expired`); Leadership `byCause`; audit M1 lists four "behind" definitions | High: the MPR proposal and the dashboard disagree on the same student. |
| **School-day / working-day arithmetic** | `isSchoolDay` ×3 (`school-calendar-v147`, `fm-script`, `wac-v129`), `addSchoolDays` (wac), `businessDaysBetween`/`isWorkingDay`/`isHoliday` (hs-policy), MPR `isWorkingDay`/`schoolDaysFrom`/`lastWorkingDays`, and two calendars (`calendar` stale 2025-26 vs `school_calendar`; audit C3) | High: deadlines and 15/20-day counts differ by module. |
| **Advisor / owner** | External ID token position (core), ALE `advisor` field (`ipal_ale_contacts_v1`), `advisorTokenOf` (MPR), `advisorOf` (queue), `buildAdvisorMap` (snapshots), `detectMyAdvisor` (`ipal_mpr_me_v1`), `cr_teachers` (recon) | Medium: caseload views disagree after an advisor change. |
| **Active student** | core `Enrollment Status` handling (audit M3: archived rows leak into quick views), ALE `learning_plan_status`, `ipal-ale-new-v142` (new-student detection from ALE vs Edgenuity SIDs), `ipal-att-newstudents-v163`, bulk-archive, year-archive | Medium. |
| **Monthly progress** | `ipal-mpr-v146.evaluate` (the only full implementation), Reminders `computeCounts` (which months are due), Leadership `evaluations unrecorded`, Today `moduleCounts` | Medium: "due" computed three ways. |
| **CSV parsing** | `parseCsv`/`parseCSV` in six modules plus `aleSync.parseCsv` | Low but wasteful; one parser with the header-alias table. |
| **SID from External ID / name cleaning** | core, snapshots `extractSid`, roster `nameToSid`, queue `sidByName`, MPR `sidOf`, Contact Watch `sidOf`, attendance `sidOf` | Medium: name-only matching in three modules. |

**Parity item for the spec.** The shipped `MPR.evaluate` grades the summary in four levels and treats "expired ≥ 1"
and "failing ≥ 2" as Unsatisfactory; the spec's MP-P1 (Revision A) has three levels. Before shadow mode, MP-P1 must be
restated with the four levels and the same inputs (avg progress, max gap, failing count, expired count) so that the
comparison is like-for-like; policy keys `mpr.adequate_gap`, `mpr.unsatisfactory_gap`, `mpr.no_progress_avg`,
`mpr.comm_met_days` map one-to-one onto today's `ipal_mpr_settings_v1`.

---

## 3. Database migration plan (additive)

Principles: Brain tables are added in new migration versions (`migrations.js` v4+), prefixed `brain_`, in the same
encrypted SQLite file, so `.ccbackup`, `dbkey.js` and the restore path cover them unchanged. No existing table is
altered or dropped. `mirror_records` keeps streaming the legacy stores; Brain reads the legacy stores only through
the **one-way sync** (§3.3), never the other way, until a flag flips a screen to Brain-authoritative.

### 3.1 Migration v4 — normalised model and import health

| Table | Purpose (spec section) | Key columns |
| --- | --- | --- |
| `brain_import` | §2.10 | id, kind, file_name, file_hash (unique with kind), file_size, received_via, snapshot_date, horizon_ts, rows_total/accepted/rejected/deduped, header_profile_json, checks_json, health, applied, supersedes_import_id, imported_at, imported_by |
| `brain_source_status` | §2.10 | source (pk), last_import_id, last_ok_at, horizon_ts, state, age_school_days, message, updated_at |
| `brain_student` | §2.1 | sid (pk), name, first_name, last_name, edg_user_id, grade_level, school_key, counselor_code, advisor_code, advisor_name, teacher_of_record, student_email, guardian_email, guardian_name, counselor_email, dob, plan_status, plan_start, plan_end, enrollment_status, first_seen_import, last_seen_import, flags_json, episode_no, updated_at |
| `brain_enrollment` | §2.2 | id, sid, course_name, course_key, teacher, is_attendance_course, start_date, target_date, status, first_seen_import, last_seen_import |
| `brain_course_snapshot` | §2.2 | import_id, enrollment_id (pk pair), progress, target_progress, pacing, overall_grade, actual_grade, relative_grade, last_gradebook_entry, active_seconds, assignment_status, complete |
| `brain_contact` | §2.3 | id, sid, contact_date, contact_ts, recorded_at, type, direction, qualifies, method, subject, with_whom, author, author_is_certificated, source, source_ref, notes_hash, week_key, dedupe_key (unique), verification_state |
| `brain_contact_note` | §2.3 | contact_id (pk), text (exportable separately) |
| `brain_evidence` | §2.3 | id, kind, sid, at, by, ref_table, ref_id, summary, hash, task_id |
| `brain_policy_version` | §3 / §3.1 | version_hash (pk), merged_json, tiers_json, created_at, created_by, reason |
| `brain_calendar_version` | §2.8 | version (pk), year, closures_json, uncertain_json, source, created_at |

### 3.2 Migration v5 — applicability, rules, cases

| Table | Purpose | Key columns |
| --- | --- | --- |
| `brain_regime` | APPLICABILITY §2.4 | id (pk), name, cite, scope_text, version, requires_contact_documentation, contact_record_system |
| `brain_applicability_statement` | APPLICABILITY §2.4 | id, regime_id, level, subject_kind, subject_key, state, authoritative, source, effective_from, effective_to, reason, set_by, set_at, version, superseded_by |
| `brain_finding` | §2.7 | id, rule_id, rule_version, policy_version, calendar_version, sid, subject_key, tier, confidence, confidence_json, applicability_json, facts_json, explain_json, state, first_seen_run, last_seen_run, resolved_by, suppressed_by; unique (rule_id, sid, subject_key) |
| `brain_case` | §2.6a | id, sid, opened_at, closed_at, owner, priority, priority_json, confidence |
| `brain_step` | §2.6a | id, case_id, need, need_key, title, why, priority, due_date, state, owner, waiting_until, waiting_reason; unique (case_id, need, need_key) |
| `brain_task` | §2.6 | id, finding_id, step_id, rule_id, sid, title, why, priority, priority_json, due_date, due_derivation, owner, state, actions_json, evidence_kinds_json, closed_by_evidence_id, closed_at, closed_by, judgment_required |
| `brain_task_event` | §2.6 | id, task_id, type, actor, ts, note |
| `brain_deadline` | §2.8 | id, kind, anchor_date, offset, due_date, derivation, calendar_version, owner_table, owner_id |
| `brain_scan` | §7.3 | id, started_at, finished_at, trigger, input_hashes_json, policy_version, calendar_version, counts_json, mode (shadow / live) |

### 3.3 Migration v6 — evaluations, plans, events

| Table | Purpose | Key columns |
| --- | --- | --- |
| `brain_evaluation` | §2.4 | sid, month (pk pair), version, packet_json, packet_hash, packet_at, judged_weeks_json, proposed_summary, proposed_comm, proposed_status, confirmed_summary, confirmed_comm, confirmed_status, confirmed_by, confirmed_at, dpc_contact_id, no_dpc_attestation_json, communicated_to_json, narrative_draft, narrative_final, form_opened_at, form_submitted_at, submission_source, ale_mpr_done, state |
| `brain_evaluation_version` | E-11 | id, sid, month, version, snapshot_json, reason, by, at |
| `brain_plan` | §2.5 | id, sid, trigger_month, evaluation_version, evaluation_date, due_date, checkpoint_date, meeting_date, late_by_school_days, strategies, wac_options_json, goal_json, participants_json, family_notified_at, implementation_evidence_json, checkpoint_result, checkpoint_reviewed_at, ale_intervention_id, consecutive_unsat_months, escalation, course_of_study_decision_json, state |
| `brain_plan_version` | §2.5 | id, plan_id, version, diff_json, by, at, reason |
| `brain_event` | §2.9 | seq (pk autoincrement), recorded_at, happened_at, actor, actor_role, session_id, source, type, sid, before_json, after_json, payload_json, rule_version, policy_version, calendar_version, app_version, override, override_of_json, reason, supersedes_seq, prev_hash, hash; triggers reject UPDATE/DELETE |
| `brain_shadow_diff` | §4 | id, scan_id, concept, sid, subject_key, legacy_value_json, brain_value_json, classification, reviewed_by, reviewed_at, disposition |
| `brain_external_action` | APPLICABILITY §6 | id, at, actor, action, provider, mode, context, sid, applicability_json, policy_row_id, policy_version, dedupe, outcome, reason |

### 3.4 One-way sync from legacy stores (coexistence)

A renderer-side `brain-sync` module (new, behind `brain.normalization`) subscribes to the same mutation hook the
SQLite mirror already uses (`ipal-sqlite-mirror-v134` intercepts localStorage/IndexedDB writes) and forwards the
affected legacy record to a new IPC `brain:ingest` with the store name and key. The main process maps:

| Legacy store | Brain target |
| --- | --- |
| `ipal_latest_dashboard_import_v1` + `edgenuity_imports` | `brain_import` (kind edgenuity) → `brain_student`, `brain_enrollment`, `brain_course_snapshot` |
| `snapshots` (weekly) | `brain_course_snapshot` (dated), for history only |
| `ipal_ale_contacts_v1` / `ipal_ale_enrollment_v1` | `brain_student` ALE fields; L4 applicability statements |
| `ipal_course_enrollment_v1` | `brain_enrollment` ↔ plan course link; L5 statements |
| `ipal_ale_contact_log_v1` / `ale_snapshots` / ALE sync bundles | `brain_contact` (source ale_log / ale_sync) |
| ALE queue items (`ipal-ale-queue`) | `brain_contact` with `verification_state = pending` (source app) |
| `__recordWeeklyEmailClick` history / advisory e-mail records | `brain_contact` type `email_sent`, direction outbound |
| `ipal_attendance_rows_v1` | attendance-course snapshots |
| `ipal_interventions_v1` | `brain_plan` (imported as version 1, `source = migration`) |
| `ipal_contact_watch_v1` (grace windows, steps) | exceptions of kind `grace_*` and Contact Watch step evidence |
| `ipal_user_calendar_v1` + `TENANT_CONFIG.school_calendar` | `brain_calendar_version` |
| `ipal_mpr_settings_v1` + `TENANT_CONFIG` + tenant overrides | `brain_policy_version` (T1/T2 merge) |
| `audit_log` | `brain_event` (mirrored, `source = migration`) |

The sync is idempotent (same file hash / dedupe key → no new rows) and is replayable: a "rebuild Brain from legacy"
admin action truncates `brain_*` data tables (never `brain_event`) and replays. Until `brain.todayWork` is on, no
legacy screen reads Brain; until it is off again, nothing in Brain writes back to legacy stores.

---

## 4. Shadow mode

**Goal:** prove Brain on real caseloads with zero visible change. Legacy computations stay authoritative; Brain runs
the same inputs in the background and records where it disagrees.

**Mechanism**

1. `brain.ruleEngine` on with `brain.mode = shadow` (default on first enablement). The utility-process scan runs after
   every legacy import/sync event and on first launch each school day, exactly as the live scan would, and writes
   `brain_scan` rows with `mode = shadow` and every finding with `state = shadow`. Shadow findings never create
   cases, steps, tasks, deadlines or events visible to teachers; they never trigger external actions.
2. A **comparison harness** (main process, same tick as the scan) asks the renderer for the legacy answers through a
   read-only IPC `brain:legacyProbe` that returns, per student in scope: `__aleHasNoRecentContact(sid)`, the
   dashboard `bucket` per course, the quick-view membership for each key in `__POLICY_SORTS`, `MPR.evaluate` outputs
   for the current month, Contact Watch `needsAction/steps`, Today card facts, Reminders counts, and the legacy
   calendar answers for `isSchoolDay/addSchoolDays` over the next 30 days. These are pure reads of existing globals.
3. Each pair is written to `brain_shadow_diff` with a **classification** from a fixed list: `match`,
   `brain_stricter`, `brain_looser`, `different_reason`, `legacy_undefined` (legacy has no answer), `brain_gated`
   (Brain withheld because confidence or applicability), `date_math`, `week_boundary`, `archived_row`, `expired_now_vs_midnight`,
   `qualifying_type`, `unknown`. Classification is automatic where the cause is evident from the explain_json (for
   example a different week key) and `unknown` otherwise.
4. **Where it is reviewed:** a hidden admin screen "Brain shadow report" (behind `brain.ruleEngine`, oversight roles
   only) lists diffs by concept and classification with counts per day, drill-down to a student with both
   explanations side by side, and a **disposition** per diff or per class: `brain_correct` (legacy bug; link to the
   QA audit item), `legacy_correct` (Brain bug; creates a fix ticket reference), `both_acceptable`, `needs_policy`
   (a district decision from spec §10). Dispositions are events.
5. **Exit criteria** to leave shadow for a concept: over ten consecutive school days, zero unreviewed diffs and every
   reviewed diff dispositioned `brain_correct` or `both_acceptable`; `date_math` and `week_boundary` classes must be
   zero (those are the audit's C2/C3/M7 class and must be fixed, not accepted). The criteria are checked per concept
   (weekly contact, buckets, calendar, MPR, contact watch, today), so screens can flip independently in §5.
6. **Fixture replay:** the same harness runs against `qa/sample-data` in the Playwright stage so the diff report is
   also produced in CI with the golden expectations from the validation report §9; a diff there fails the build.

**Logging rules:** shadow diffs hold student ids, values and rule ids, never note text; the shadow report export is
gated like the exceptions report; shadow rows are pruned after 90 days once dispositioned.

---

## 5. Feature flags

Flags use the existing per-user feature-access mechanism (`src/featureAccess.js`, `feature:list/mine/set`, the
`ipal-feature-access-v161` renderer gate) for **who** sees a change, plus a district-level default in
`app_settings` (`brain.flags` key) for **whether** a capability exists. A flag is on for a user only if the district
default allows it and the user rule allows it. Every flag change is an audit row today and a `brain_event` later.

| Flag | What it enables | Depends on | Default in the release that introduces it | Kill switch effect |
| --- | --- | --- | --- | --- |
| `brain.normalization` | migrations v4, one-way sync, `brain_*` model filled; nothing visible | — | on (district), invisible | sync stops; tables remain; nothing else changes |
| `brain.dataHealth` | Data strip with source freshness and DH-01/03/04 checks shown on the import screen; blocked-import preview | normalization | off; pilot users | strip hidden; imports behave as before (the older-file rule already exists) |
| `brain.applicability` | regime tables, first-run administrator wizard (§6), applicability resolver available to the engine; badges in scope bar | normalization | off; admin only until confirmed | resolver returns `unknown` for everything and the engine treats every rule as gated → no Brain compliance output; legacy unaffected |
| `brain.ruleEngine` | scans; `brain.mode = shadow | live` | normalization, applicability | on in shadow for the district, no user visibility | scans stop; shadow tables remain |
| `brain.cases` | case/step engine over live findings; the Today card, worklist and Reminders read steps (still rendered by the old modules) | ruleEngine live for the concept | off; pilot users | modules fall back to their own compute functions (kept as shims) |
| `brain.todayWork` | the new queue screen replaces the Today card + worklist panel for the user | cases | off; pilot users | old Today card returns; steps persist |
| `brain.externalActions` | External Action Policy drives the e-mail entry points and contact_log (§7) | applicability confirmed | off until the wizard is confirmed; then `compat` mode | handlers revert to today's three-step behaviour |
| `brain.mpr` | evaluation table, MP-P proposals shown in the MPR module, confirm-selected, attestation, persisted drafts | ruleEngine live (MPR concept), cases | off; pilot advisors | MPR module uses its own `evaluate` (kept) and memory drafts |
| `brain.interventions` | plan/plan_version tables, IP-01..05 steps, checkpoint review, ALE write via provider | mpr | off; pilot advisors | ledger falls back to `ipal_interventions_v1` (kept in sync one-way) |
| `brain.auditReady` | event chain verification, Audit Ready packet, History reads events | normalization | off; oversight roles | packets unavailable; History reads `audit_log` |
| `brain.exceptionsReport` | program exceptions view with confirmed / unverified / cannot-evaluate columns | cases, applicability | off; oversight roles one release after advisors | Leadership module continues |

Guard rails: a flag cannot be turned on for a user while its dependencies are off (the setter refuses with a
message); every flag has a `since` and a note (already supported by `featureAccess.set`); the admin screen shows
the shadow exit criteria per concept next to the flag that depends on it; the first release of each visible flag
targets named pilot users (`feature:set` per username), never "everyone".

---

## 6. Applicability migration for existing iPAL installs

**Constraints:** do not classify everyone as ALE silently; do not leave everyone `unknown` forever; use tenant and
program information only to *suggest*; require administrator confirmation; record it.

**Trigger:** first launch after the release that carries `brain.applicability`, for a user with an oversight role
(admin/director/facilitator). Advisors see nothing until it is confirmed except a one-line notice on the Data strip:
"Program setup pending — ask your administrator" (only when `brain.dataHealth` is on).

**Suggested profile** is computed from explicit existing data only and shown with its evidence:

| Suggestion | Evidence used | Not used |
| --- | --- | --- |
| Program "iPAL" exists and is a Washington ALE program | `TENANT_CONFIG.policy_text.regulation` = "Washington State ALE", `ale_url_template`, `ale_sync` enabled, `mpr.laserficheUrl`, the presence of ALE enrollment/contact-log imports | — |
| Students with an active ALE learning plan (from `ipal_ale_contacts_v1` / `ipal_ale_enrollment_v1`) → L4 `required` statements | the district's own ALE enrollment record | school name, advisor |
| Courses listed in the ALE course-enrollment report → L5 `required` | the district's own ALE course record | course prefix |
| Edgenuity courses **not** in any ALE plan whose name carries the `CR` prefix or whose teacher is in `cr_teachers` → **proposed** `credit_recovery` mapping rows, unchecked by default | shown as *hints* | never applied without a tick |
| Students with Edgenuity rows and no ALE record → listed as "unconfirmed (n)" | — | — |

**Wizard (three screens, documentation-level wireframe)**

```
┌─ Program setup (1 of 3) — Which of your programs follow Washington ALE rules? ─────────────┐
│ We found one program in this install:  iPAL                                                   │
│ Evidence: ALE site configured (learnpsd.psd1.org), ALE sync on, monthly-report form on file,   │
│ 11 students with an active ALE learning plan in your last ALE enrollment import (9/24).        │
│ ( • ) iPAL follows Washington ALE (WAC 392-550)   — students with an active ALE plan are ALE-  │
│       tracked; untagged courses of an ALE-plan student count as plan courses: [✓] (recommended)│
│ (   ) iPAL does not follow Washington ALE                                                      │
│ (   ) Decide per student/course (everything stays "unconfirmed" until mapped)                  │
│ [Next]                                                                                         │
├─ (2 of 3) — Courses that look like credit recovery (not in any ALE plan) ─────────────────────┤
│ These 6 Edgenuity courses are not listed in any student's ALE plan. Hints are shown; nothing   │
│ is applied unless you tick it.                                                                 │
│ [ ] CR 26-27 Algebra 1 (2 students) — hint: "CR" prefix                                        │
│ [ ] CR 26-27 English 10 (1) — hint: "CR" prefix; teacher in the credit-retrieval list          │
│ [ ] IC 26-27 Financial Literacy (1) — no hint                                                  │
│ Tag ticked courses as: [Credit recovery (no ALE contact rules) ▾]                              │
│ [Next]                                                                                         │
├─ (3 of 3) — Confirm ───────────────────────────────────────────────────────────────────────┤
│ Result: 11 ALE-tracked students · 0 CR-only students · 2 unconfirmed students (no ALE record)  │
│ Unconfirmed students appear under "Needs configuration" and get no ALE deadlines.              │
│ Reason for the record [initial program setup after upgrade to 0.2.5x]                          │
│ Confirmed by ADMIN on 9/28 08:12 — written to configuration (district v1) and to the audit log │
│ [Confirm]  [Do this later]                                                                     │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

**On confirm:** L2/L3 statements are written with `source = district_config`, `set_by`, `reason`, `version 1`; a
`brain_policy_version` row is created; an `audit_log` row and a `brain_event` (`applicability.confirmed`, with the
before state `unassigned`) are written; the resolver goes live; the External Action Policy leaves `compat` mode
(§7). "Do this later" keeps `regime unassigned` (AP-03) and re-offers the wizard on each oversight login, with the
notice above for advisors. Nothing in the wizard reads or writes production data before the confirm click.

**Upgrade of an install that already has ALE data but no oversight user:** the wizard is offered to the first
`admin` login (the desktop already has an admin for user management); until then the state is AP-03.

---

## 7. Blue e-mail migration

### 7.1 The shared handler today

All three entry points end in the same sequence inside core:

| Entry point | Compose | Then |
| --- | --- | --- |
| Roster envelope (Records List row; also Smart-Attention "Open selected template email" through `__openSmartTemplateEmail`) | `buildStudentMailto(name, sid, rowsForStudent)` (teacher-filter aware) or `__buildPreferredSmartMailto(data, tone, templateId)` | `openMailtoInNewTab(mailto)` → `setTimeout(openAleStudentWindow(sid), 250)` → `__recordWeeklyEmailClick(name, sid)` |
| AI e-mail (locked block `__generateAiStudentEmail`) | POST to the personal backend → `__extractAiEmailResult` → recipients from `__getAleContactByStudentNumber` → `buildMailtoUrl` | `__captureReturnContext` → `openMailtoKeepAppOpen(mailto)` → `setTimeout(openAleStudentWindow(sid), 250)` → `__recordWeeklyEmailClick` |
| Advisory e-mail preview (`ipal-advisory-email-v141`) and bulk/quick-view e-mails (modules 004–011, 018, 023) | template bodies, BCC handling | `__ipalMailto` / `__ipalEmailOpened(url, via)` (wrapped by `ipal-ale-queue-v145.recordMailto` to auto-log into the ALE queue); bulk paths do not open ALE |

`openAleStudentWindow` is the single function that opens ALE; it reads `TENANT_CONFIG.ale_url_template` and reuses
the named window. `__recordWeeklyEmailClick` is the single place that records the app-side e-mail contact.

### 7.2 Adapter design

Introduce one renderer module, `ipal-external-actions` (new id), loaded after the ALE queue module, exposing:

```
window.__ccExternal = {
  composeContext(el)                // 'student' | 'course:<enrollmentKey>' from the button's data attributes
  shouldOpenRecordSystem(ctx)       // → { decision: 'auto'|'offer'|'never'|'compat', provider, why, applicability, policyRow }
  afterCommunication(ctx, mailto)   // records evidence, applies the decision, writes the decision event
}
```

Wiring, in order of least intrusion:

1. **Compose and mail-client behaviour unchanged.** `buildStudentMailto`, `__buildPreferredSmartMailto`, the AI
   backend call, `openMailtoInNewTab`, `openMailtoKeepAppOpen` and `__captureReturnContext` are not touched.
2. **Replace the three `setTimeout(openAleStudentWindow(sid), 250)` sites** with
   `__ccExternal.afterCommunication(ctx, mailto)`. The AI block is "locked" in the source; the change is confined to
   the one post-send line and must be approved explicitly per its own comment.
3. **`__recordWeeklyEmailClick`** is called from inside `afterCommunication` (so the app-side record continues to
   exist) and additionally writes a `brain_contact` of type `email_sent` when `brain.normalization` is on.
4. **`shouldOpenRecordSystem(ctx)`** evaluates, in order: flag `brain.externalActions` off → `compat`; applicability
   not yet confirmed (AP-03) → `compat`; otherwise the policy row for `(regime, context, applicability)` from the
   spec's §7.6 / APPLICABILITY §5.3, then the reopen dedupe (`record_system_reopen_minutes`), then the T3 downgrade
   (`auto` → `offer` only).
5. **`compat` decision** reproduces today's behaviour exactly: open the named ALE window after 250 ms for every
   student, and record the decision event with `mode = compat` and `why = "applicability not configured"`. This is the
   backward-compatibility guarantee: until the wizard is confirmed, nothing about the button changes except that
   the decision is now logged.
6. **`auto`** → `window.__ipalAleQueueAdd(prefilled)` (existing queue) instead of the raw ALE page; `open_record_system`
   only when `__ipalAleQueueStatus()` reports the queue provider unavailable (desktop bridge down). **`offer`** → the
   existing return-context banner gains a chip "Log in ALE ▸" bound to the same queue call; **`never`** → nothing
   beyond the local record, with the why line on the banner.
7. The provider descriptor replaces the direct read of `TENANT_CONFIG.ale_url_template`: `openAleStudentWindow` becomes
   a thin call to `provider.openStudent(sid)`; the tenant key stays as the `ale` descriptor's `student_url_template`
   so existing tenant files keep working.
8. Bulk paths (`buildBulkPolicyMailto` and the advisory modal) route through `afterCommunication` with
   `context = bulk` → `queue_evidence: offer` as a batch of ALE-tracked recipients; they never open windows.

Shadow behaviour for this adapter: with `brain.externalActions` off, `shouldOpenRecordSystem` still runs and logs
what it *would* have decided (`mode = shadow`), so the first weeks of data show how often ALE would have been
skipped or offered per teacher before anyone's button changes.

---

## 8. Release sequence

Small releases ordered by the dependency graph (validation report §10). Version numbers are placeholders; the
repository's actual versioning decides. Each release must ship with its rollback path already tested.

| Release | Code area touched | Visible teacher change | Migration | Regression risk | Tests needed | Rollback |
| --- | --- | --- | --- | --- | --- | --- |
| **0.2.47 — QA fixes** | HTML core + 8 modules (the 29-hunk patch), `main.js`, `src/laserfiche.js`, `renderer/login.html` | Bugs fixed only: no false "Resume" card at start, correct ALE dates, current calendar everywhere, correct bulk e-mail bodies, snapshot compare works, MPR narrative without panel warnings | none | Low–medium: core script order changed (restore calls moved to the end); one-line function comment lesson | `qa/playwright/smoke.js` 15 assertions; per-module `new Function` syntax check; stages 1–9 | Reinstall 0.2.46 (no schema change) |
| **0.2.48 — Shared primitives (invisible)** | new renderer helpers: calendar service (one `isSchoolDay/addSchoolDays/weekOf`), date parsers, SID/name normaliser, CSV parser with alias table; legacy functions become shims | none | none | Medium: shims must return identical values; week-start (Sunday vs Monday) differences surface here | Unit tests over the fixture calendar (validation §9 date cases); shadow comparison of shim vs original for one release (log only) | `ipal.disable.*`-style switch per shim (existing kill-switch pattern) |
| **0.2.49 — Normalised model + Data Health (opt-in strip)** | `migrations.js` v4, `brain:ingest` IPC, `brain-sync` renderer module, Data strip UI behind `brain.dataHealth` | Pilot users: Data strip with freshness and import checks; blocked-import preview; everyone else: none | v4 additive; first-run rebuild from legacy stores (replayable) | Low: writes only to new tables; strip is read-only | Ingest idempotency (same hash twice); fixture imports produce the expected row counts; DH-03 cases; backup/restore round-trip with new tables | Flag off; tables stay; v4 is never rolled back (additive) |
| **0.2.50 — Applicability + admin wizard** | v5 regime/statement tables, resolver, wizard (oversight only), compat mode in the e-mail adapter (log-only) | Oversight users: wizard; advisors: a pending notice only | v5 additive; wizard writes statements on confirm | Low: no rule output yet | Resolver unit tests (APPLICABILITY §10 fixtures); wizard writes exactly the expected statements and events; "do this later" leaves AP-03 | Flag off → resolver returns unknown; statements kept |
| **0.2.51 — Rule engine in shadow** | utility-process scan, rule registry with DH/WC/PR/RS rules, confidence engine, `brain_shadow_diff`, legacy probe IPC, shadow report screen (oversight) | none (shadow report visible to oversight only) | none beyond v5 | Low for teachers; performance risk (scan < 2 s) | Golden run G1 in CI; probe returns without touching UI state; diff classification tests; scan timing on 100 students | Flag `brain.ruleEngine` off |
| **0.2.52 — Cases + external actions (pilot)** | case/step engine (v5 tables), Today card / worklist / Reminders read steps behind `brain.cases`; `ipal-external-actions` adapter live behind `brain.externalActions` (after wizard) | Pilot advisors: same screens, fed by steps; e-mail button now logs to the ALE queue for ALE students and skips ALE for CR students with a why line | none | Medium: the three e-mail sites change; the AI locked block is touched | Playwright: envelope/AI/smart paths for ALE, CR, mixed, unknown fixtures; dedupe of windows; compat mode identical to 0.2.46 | Flags off → modules use their own compute; e-mail sites revert to compat (still logged) |
| **0.2.53 — Today's Work queue (pilot)** | new queue screen behind `brain.todayWork`; acknowledgment/exception flows; WC-03/04 | Pilot advisors: new queue replaces the Today card | none | Medium: new UI | Wireframe smoke; acknowledgment outcomes; forbidden-word test on automatic text | Flag off → Today card returns; steps persist |
| **0.2.54 — MPR on Brain (pilot)** | v6 evaluation tables, MP-P rules (four-level parity), packet, confirm-selected, attestation, persisted drafts; `MPR.evaluate` kept as shim | Pilot advisors: proposals labelled, per-row confirm, drafts survive restarts | v6 additive; existing ledger imported as version 1 | Medium: the Laserfiche fill/submit path is unchanged but the state machine is new | MPP-* and MP01-* cases; form fill Playwright (existing harness skips `window.print`); parity diff between `MPR.evaluate` and MP-P over the fixture | Flag off → module's own evaluate and memory drafts |
| **0.2.55 — Interventions on Brain (pilot)** | plan/plan_version, IP-01..05, checkpoint, ALE write via provider | Pilot advisors: plan deadlines with derivations, checkpoint step | none beyond v6 | Medium | IP* cases; ALE intervention write unchanged (approval dialog) | Flag off → ledger path |
| **0.2.56 — Audit events + Audit Ready + exceptions report** | `brain_event` chain (v6), History reads events, packet generator, exceptions report with confidence columns | Oversight: packets and report; advisors: History shows the same items with sources | `audit_log` mirrored into events | Low–medium: packet generation performance | Chain verify; packet reproducibility from a fixture DB; redaction tests | Flags off; events remain (append-only) |
| **0.2.57 — Default-on for advisors** | flag defaults | All advisors: queue, Data strip, e-mail policy | none | Medium: support load | Full stage 1–9 + smoke on the new defaults | Per-user flag off (feature access), district default off |

Rules for the sequence: never ship a visible change and a schema migration for the same concept in one release
(schema first, invisible; UI next); each migration is additive and never rolled back; every pilot release names its
pilot users in the release note; a release that touches the locked AI block or the ALE approval dialog needs the
owner's explicit sign-off recorded in the PR.

---

## 9. What must not be rewritten (wrap or adapt)

| Working today | Why keep | How Brain uses it |
| --- | --- | --- |
| Encrypted SQLite, `dbkey.js`, migrations runner, `.ccbackup` create/restore, auto-backup | proven data safety path | Brain tables live inside it; manifest gains the chain head hash |
| Local auth, sessions, roles, IPC role guards, admin/audit windows | security boundary | `actor`, `actor_role`, flags per user |
| Feature-access mechanism (`featureAccess.js` + renderer gate) | already the app's progressive-rollout tool | all `brain.*` flags |
| ALE sync agent (bookmarklet + `aleSync.js`), ALE queue with the Windows approval dialog and verification | the only compliant write path into ALE and the district's accepted practice | `contact.queue_evidence` provider `ale_queue`; horizons from pull times |
| Laserfiche fill/submit watcher (`laserfiche.js`) | the district form process works | evaluation `form_opened_at` / `form_submitted_at` events |
| Embedded Edgenuity window, human-click export, Downloads watcher | the compliant export path | `received_via` values |
| Advisory e-mail preview modal, templates, BCC handling, voice notes | teachers rely on them daily | compose providers |
| Records List, dashboard tiles, filters, saved views, theme, header, display-fit | the app's identity (audit requirement) | unchanged; badges and a regime facet added |
| Import diagnostics, header sniffing, tenant CSV mappings | good first line of defence | DH-03 checks |
| Contact Watch UI and its district ladder | teachers know it | reads Brain acknowledgments; keeps its screens |
| MPR wizard UI, narrative generator, progress-report PDF | mature | proposals and drafts come from Brain; UI stays |
| Local AI provider (node-llama-cpp) and `ai:prompt` IPC | privacy-preserving | narrative drafts with fact ids |
| Staff messages, district sync (OneDrive), updater with guard, license | orthogonal, stable | untouched |
| SQLite mirror of renderer stores | the bridge Brain's one-way sync hooks into | the mutation hook |

What is *replaced* (behind flags, after shadow parity): the five weekly-contact computations, the four "behind"
definitions, the three calendars, the three "today" computations, in-memory MPR drafts, per-module CSV parsers and
SID/name normalisers. What is *retired* last: the direct-`mailto` bulk paths without preview (audit UX finding).

---

## 10. Source-repository checklist (before the first change)

When the private source repository is attached, the next session verifies, in order, and records the answers at
the top of its first PR:

1. **Source ↔ 0.2.46 correspondence.** Build the HTML and asar from the repo at the tag/commit claimed to be 0.2.46;
   compare `app-html/Command_center_universal_v120.html` and `resources/app.asar` contents (file list and hashes
   after normalising line endings) against the extracted installer. Note any module present in one and not the
   other. Confirm the 29-hunk QA patch applies with `patch -p1 --dry-run` against the repo layout (paths may differ:
   the patch labels are `a/app-html/...`, `a/main.js`, `a/src/laserfiche.js`, `a/renderer/login.html`).
2. **Package and build setup.** `package.json` scripts, electron-builder (or forge) config, target Electron version
   (runtime: 36.9.5), `better-sqlite3-multiple-ciphers` prebuild step (runtime: 12.11.1), `node-llama-cpp` and
   `@huggingface/transformers` native/binary handling, `allowScripts`, whether the HTML is built or hand-edited,
   any bundler/minifier, Node version pins, lockfile presence and integrity.
3. **SQLite schema.** `src/storage/migrations.js` has exactly versions 1–3 as in the runtime; the migration runner's
   behaviour on a newer DB file with an older app (downgrade guard) — needed before v4 ships; the encryption key
   derivation in `dbkey.js` and where the key lives.
4. **Code signing.** Windows signing certificate handling (CI secret, not in repo), `signAndEditExecutable`, whether
   unsigned builds are used for QA; SmartScreen implications for pilot builds.
5. **Installer configuration.** NSIS options (per-user vs per-machine, `oneClick`, upgrade path preserving userData),
   `updater.js` feed URL and `updateGuard.js` rules (the releases repo is the feed), app id, protocol handlers.
6. **Existing tests.** What test runner exists (none was visible in the runtime); how the `qa/playwright` harness
   maps onto the repo (`CC_SRC`, `CC_DATA`, `QA_ADMIN_*`), whether CI exists and where it runs Windows builds.
7. **Dependency versions.** Exact versions vs the runtime (`electron-updater` 6.8.9, `adm-zip` 0.5.18, `better-sqlite3`
   12.2.0 alongside the multiple-ciphers fork — confirm which one is actually loaded); known CVEs; vendor copies of
   the CDN scripts (the runtime loads Tailwind/others from CDNs; the QA runtime replaced them with local copies).
8. **Production assets.** Tenant config file(s) for Pasco/iPAL: where `TENANT_CONFIG` is authored, whether other
   tenants exist, the school-calendar source of truth, e-mail templates, Laserfiche form URL, logos.
9. **Environment and secrets boundaries.** Confirm no credentials, ALE cookies, Google OAuth secrets, license keys
   or student data are in the repo; where `config.json`, the feature-access file and provision exports live at
   runtime; what the AI backend URL default is (the locked block posts to `localhost:3000`); telemetry endpoints.
10. **Release process.** How a version is bumped and tagged, how release notes are written, who publishes to the
    releases repo, the smoke gate (the QA `smoke.js` should become the gate), rollback practice for a bad release,
    and whether the district has a pilot channel.

---

## FIRST 10 IMPLEMENTATION STEPS ONCE SOURCE REPO IS AVAILABLE

Each step is one PR, independently testable and revertable, and none changes what a teacher sees except step 1.

1. **Verify and apply the QA patch (0.2.47).** Run the checklist §10 items 1–3, apply
   `qa/fixes/*.patch` with `--dry-run` then for real, run the module syntax check and `smoke.js`, build the
   installer with the existing process, tag. Rollback: reinstall 0.2.46.
2. **Add the golden fixtures and CI gate.** Copy `qa/sample-data` and `qa/playwright` into the repo's test layout;
   make `smoke.js` and the module-global assertion a required check; add the expected-output JSON skeleton from the
   validation report §9 (empty until the engine exists). Rollback: remove the CI job.
3. **Introduce the calendar service as a shim target.** Add one module `ipal-brain-calendar` exposing
   `isSchoolDay/addSchoolDays/schoolDaysBetween/weekOf/isSchoolWeek/countDays` built from `TENANT_CONFIG.school_calendar`
   plus `ipal_user_calendar_v1`; make the three `isSchoolDay` and the MPR/hs-policy working-day helpers delegate to
   it behind `ipal.disable.braincal` kill switch; log (console + audit) any call where the shim and the original
   disagree for one release. Tests: validation §9 date cases. Rollback: kill switch.
4. **Introduce the SID/name/date/CSV normalisers** the same way (`ipal-brain-normalize`), with the six `parseCsv`
   copies and the SID extractors delegating; disagreement logging as in step 3. Rollback: kill switch.
5. **Migration v4 + `brain:ingest` + one-way sync**, flag `brain.normalization` (district default on, invisible).
   Tests: ingest idempotency, fixture row counts, backup/restore round-trip. Rollback: flag off (tables stay).
6. **Data strip behind `brain.dataHealth`** for named pilot users, with DH-01/03/04 checks and the blocked-import
   preview; no rule output. Tests: DH cases. Rollback: flag off.
7. **Migration v5 + applicability resolver + admin wizard** behind `brain.applicability`; e-mail adapter in
   log-only compat mode (`shouldOpenRecordSystem` computes and records, the three sites still open ALE exactly as
   today). Tests: resolver fixtures, wizard statements/events, "later" path. Rollback: flag off.
8. **Rule engine in shadow** (`brain.ruleEngine`, mode shadow): DH, WC-01/02/05/06, PR-01..05, RS-01..03 with
   confidence; legacy probe IPC; shadow diff table and oversight report. Tests: golden run G1 in CI; scan < 2 s on
   100 students. Rollback: flag off.
9. **Case/step engine feeding the existing Today card, worklist and Reminders** for pilot users
   (`brain.cases`), with the modules' own compute kept as fallback; e-mail adapter live for the same users
   (`brain.externalActions`) after their district confirmed the wizard. Tests: §6.2 worked example; envelope/AI/
   smart paths on ALE, CR, mixed and unknown fixtures; window dedupe; compat parity. Rollback: flags off.
10. **MP-P parity + evaluation table** (`brain.mpr`, pilot): restate MP-P1 with the four-level summary, run
    `MPR.evaluate` and MP-P side by side in the shadow diff for a month of fixture dates, then show proposals and
    persist drafts for pilot advisors with confirm-selected. Tests: MPP-*, MP01-*, parity diff = 0 on the fixture.
    Rollback: flag off (module evaluate and memory drafts return).
