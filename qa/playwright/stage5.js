// Verification of the patched build: startup restore, date sorting, snapshot label, no JS errors
const L = require('./lib');
(async () => {
  const ctx = await L.launch(); const { app, win, log } = ctx;
  await L.setSize(app, 1600, 950);
  await L.signIn(ctx);
  const notes = []; const note = (k, v) => { notes.push([k, v]); console.log('NOTE', k, '::', String(v).slice(0, 2500)); };
  const st = async () => win.evaluate(() => ({ rows: (window.__ipalAllRows || []).length, empty: !document.getElementById('empty-state').classList.contains('hidden'), dash: !document.getElementById('dashboard-content').classList.contains('hidden'), resume: !!Array.from(document.querySelectorAll('button')).find(b => /^Resume$/.test(b.textContent.trim())), stats: ['stat-total','stat-behind','stat-risk'].map(i => i + '=' + document.getElementById(i).textContent).join(' ') }));
  note('startup-state', JSON.stringify(await st()));
  await L.shot(win, '80-startup-fixed', false);
  // Excel-format dates must sort correctly now
  console.log('ale log excel', await L.importFile(win, '#ale-log-upload', ['ALE_Contact_Log_excel_dates.csv'], 'ipal:ale-log-imported'));
  await win.waitForTimeout(2500);
  note('pills-excel-dates-fixed', await win.evaluate(() => Array.from(document.querySelectorAll('#sections-wrapper tr.student-header-row, #sections-wrapper .student-header-row')).map(r => (r.innerText || '').replace(/\s+/g, ' ').replace(/⚠.*$/, '').trim().slice(0, 80)).join('\n')));
  await win.selectOption('#quick-view-select', 'missing-weekly-contact'); await win.waitForTimeout(1200);
  note('missing-weekly-contact-excel-fixed', await win.evaluate(() => document.getElementById('sections-wrapper').innerText.replace(/\s+/g, ' ').slice(0, 60) + ' | ' + Array.from(document.querySelectorAll('#sections-wrapper button')).map(b => b.textContent.trim()).filter(t => /^[A-Z][a-z]+, /.test(t)).join('; ')));
  await win.selectOption('#quick-view-select', ''); await win.waitForTimeout(800);
  console.log('ale log iso', await L.importFile(win, '#ale-log-upload', ['ALE_Contact_Log.csv'], 'ipal:ale-log-imported'));
  await win.waitForTimeout(1500);
  note('today-fixed', await win.evaluate(() => (document.getElementById('ipal-today') || {}).innerText));
  // snapshot comparison label: save snapshot then import the older file (worse pacing) -> should read "worsened"; then newer -> improved
  const save = await win.$('#save-snapshot-btn'); if (save) { await save.click(); await win.waitForTimeout(800); }
  console.log('import older', await L.importFile(win, '#csv-upload', ['EdgenuityEnrollments_09_11_2026.csv'], 'ipal:edgenuity-imported'));
  await win.waitForTimeout(1500);
  note('snapshot-banner-after-older', await win.evaluate(() => ((document.getElementById('snapshot-alert-banner') || {}).innerText || '').replace(/\s+/g, ' ').slice(0, 600)));
  console.log('import newest', await L.importFile(win, '#csv-upload', ['EdgenuityEnrollments_09_25_2026.csv'], 'ipal:edgenuity-imported'));
  await win.waitForTimeout(1500);
  note('snapshot-banner-after-newest', await win.evaluate(() => { window.__snapshotDetailsExpanded = true; try { renderSnapshotComparison(); } catch (e) {} return ((document.getElementById('snapshot-alert-banner') || {}).innerText || '').replace(/\s+/g, ' ').slice(0, 900); }));
  await L.shot(win, '81-snapshot-fixed', false);
  // email bodies for the previously-empty quick views
  const bodies = await win.evaluate(() => ['expired-date', 'no-contact-20', 'graded-out', 'ten-day-check'].map(k => k + ' => ' + (window.__getEmailSubject ? window.__getEmailSubject(k) : '?') + ' :: ' + (typeof __policyCommonMessage === 'function' ? __policyCommonMessage(k).split('\n').slice(2, 3).join(' ') : window.__policyCommonMessage(k).split('\n').slice(2, 3).join(' '))).join('\n'));
  note('email-bodies-fixed', bodies);
  note('calendar-derived', await win.evaluate(() => JSON.stringify({ sy: window.TENANT_CONFIG.calendar.schoolYear, end: window.TENANT_CONFIG.calendar.calendarEnd, closures: window.TENANT_CONFIG.calendar.singleDayClosures.length })));
  L.dump({ ...log, notes }, 'stage5');
  console.log('PAGE ERRORS:', log.errors.length, '\n' + log.errors.join('\n---\n'));
  console.log('CONSOLE ERR/WARN:', log.console.filter(l => !/Security Warning|ERR_CERT/.test(l)).slice(0, 40).join('\n'));
  await app.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
