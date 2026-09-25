// Final smoke test for a patched build: fresh profile -> first-run admin -> import synthetic data -> assertions.
const L = require('./lib');
const path = require('path');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok  ', m); };
(async () => {
  const ctx = await L.launch(); const { app, win, log } = ctx;
  await L.setSize(app, 1600, 950);
  await L.signIn(ctx);
  const fresh = await win.evaluate(() => !!document.getElementById('empty-state') && !document.getElementById('empty-state').classList.contains('hidden'));
  if (fresh) {
    for (const f of ['EdgenuityEnrollments_09_11_2026.csv', 'EdgenuityEnrollments_09_18_2026.csv', 'EdgenuityEnrollments_09_25_2026.csv']) assert((await L.importFile(win, '#csv-upload', [f], 'ipal:edgenuity-imported')) === 'event', 'imported ' + f);
    assert((await L.importFile(win, '#ale-contacts-upload', ['ALE_Student_Enrollment.csv'], 'ipal:ale-imported')) === 'event', 'imported ALE enrollment');
    assert((await L.importFile(win, '#ale-log-upload', ['ALE_Contact_Log_excel_dates.csv'], 'ipal:ale-log-imported')) === 'event', 'imported ALE contact log (Excel-style dates)');
    await win.waitForTimeout(3000);
  }
  // restart the app: the dashboard must come back by itself (C1)
  await app.close();
  const ctx2 = await L.launch(); const win2 = ctx2.win;
  await L.setSize(ctx2.app, 1600, 950);
  await L.signIn(ctx2);
  await win2.waitForTimeout(2500);
  const st = await win2.evaluate(() => ({ rows: (window.__ipalAllRows || []).length, resume: !!Array.from(document.querySelectorAll('button')).find(b => /^Resume$/.test(b.textContent.trim())), dash: !document.getElementById('dashboard-content').classList.contains('hidden'), mpr: !!window.MPR, today: !!document.getElementById('ipal-today'), cw: typeof window.__ipalContactWatchStatus === 'function', total: document.getElementById('stat-total').textContent }));
  assert(st.dash && st.rows > 0 && !st.resume, 'dashboard restored on launch without the Resume card (' + st.rows + ' rows, ' + st.total + ' students)');
  assert(st.mpr, 'MPR module loaded (window.MPR)');
  assert(st.today && st.cw, 'Today card and Contact Watch modules loaded');
  const pills = await win2.evaluate(() => Array.from(document.querySelectorAll('#sections-wrapper .student-header-row')).map(r => r.innerText.replace(/\s+/g, ' ')).filter(t => /Alvarez/.test(t))[0] || '');
  assert(/CONTACTED THIS WEEK/i.test(pills) && !/NO CONTACT THIS WEEK/i.test(pills), 'Excel-style ALE dates sort correctly (Alvarez contacted this week)');
  await win2.selectOption('#quick-view-select', 'missing-weekly-contact'); await win2.waitForTimeout(1200);
  const missing = await win2.evaluate(() => Array.from(document.querySelectorAll('#sections-wrapper button')).map(b => b.textContent.trim()).filter(t => /^[A-Z][a-z]+, /.test(t)));
  assert(missing.length === 5, 'Missing Weekly Contact lists the 5 real misses: ' + missing.join('; '));
  await win2.selectOption('#quick-view-select', '');
  const cal = await win2.evaluate(() => window.TENANT_CONFIG.calendar.schoolYear.label + ' / ' + window.TENANT_CONFIG.calendar.calendarEnd);
  assert(/2026-2027 \/ 2027-06-18/.test(cal), 'calendar derived from school_calendar: ' + cal);
  const subj = await win2.evaluate(() => window.__getEmailSubject('no-contact-20') + ' | ' + window.__policyCommonMessage('graded-out').split('\n')[2].slice(0, 60));
  assert(/Urgent: Weekly Contact Required \| Great news/.test(subj), 'bulk e-mail subject/body fixed: ' + subj);
  await win2.evaluate(() => window.MPR.open()); await win2.waitForTimeout(3000);
  const mprText = await win2.evaluate(() => (document.getElementById('mprPanel') || {}).innerText || '');
  assert(/MPR window/.test(mprText) || /Monthly/i.test(mprText), 'MPR wizard opens');
  await L.shot(win2, 'smoke-final');
  const errs = log.errors.concat(ctx2.log.errors);
  const warn = ctx2.log.console.filter(l => /restore failed/i.test(l));
  assert(errs.length === 0, 'no uncaught page errors across both launches');
  assert(warn.length === 0, 'no "restore failed" warnings');
  await ctx2.app.close();
  console.log('SMOKE PASSED');
})().catch(e => { console.error('SMOKE FAILED', e.message); process.exit(1); });
