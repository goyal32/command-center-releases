const L = require('./lib');
(async () => {
  const ctx = await L.launch(); const { app, win, log } = ctx;
  await L.setSize(app, 1600, 950);
  await L.shot(win, '00-login');
  await L.signIn(ctx);
  await L.shot(win, '01-empty-dashboard', true);
  // what does a brand-new teacher see? dump visible header buttons
  const ui = await win.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    return Array.from(document.querySelectorAll('button, select, a[onclick], [role=button]')).filter(vis).map(el => ({ tag: el.tagName, id: el.id || '', text: (el.innerText || el.value || el.title || '').replace(/\s+/g, ' ').trim().slice(0, 60), title: (el.title || '').slice(0, 80) }));
  });
  console.log('VISIBLE CONTROLS BEFORE IMPORT:', ui.length); ui.forEach(u => console.log('  ', u.tag, u.id, '|', u.text, u.title ? '| ' + u.title : ''));
  // imports: oldest first for history
  for (const f of ['EdgenuityEnrollments_09_11_2026.csv', 'EdgenuityEnrollments_09_18_2026.csv', 'EdgenuityEnrollments_09_25_2026.csv']) {
    console.log('import', f, await L.importFile(win, '#csv-upload', [f], 'ipal:edgenuity-imported'));
  }
  console.log('ale enrollment', await L.importFile(win, '#ale-contacts-upload', ['ALE_Student_Enrollment.csv'], 'ipal:ale-imported'));
  console.log('ale log', await L.importFile(win, '#ale-log-upload', ['ALE_Contact_Log.csv'], 'ipal:ale-log-imported'));
  const hasStudentsInput = await win.$('#ipal-students-report-input');
  if (hasStudentsInput) console.log('students report', await L.importFile(win, '#ipal-students-report-input', ['Students_09_25_2026.csv'], 'ipal:roster-imported', 8000));
  await win.waitForTimeout(4000);
  await L.shot(win, '02-after-import', true);
  const stats = await win.evaluate(() => ['stat-total','stat-enrollment-count','stat-grade','stat-behind','stat-behind-perc','stat-risk','stat-progress'].map(id => id + '=' + (document.getElementById(id) || {}).textContent).join(' | '));
  console.log('STATS:', stats);
  const ui2 = await win.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    return Array.from(document.querySelectorAll('button, select, a[onclick], [role=button], input[type=checkbox]')).filter(vis).map(el => ({ tag: el.tagName, id: el.id || '', text: (el.innerText || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 70), title: (el.title || '').slice(0, 90), opts: el.tagName === 'SELECT' ? Array.from(el.options).map(o => o.value + ':' + o.text.trim()).slice(0, 40) : undefined }));
  });
  console.log('VISIBLE CONTROLS AFTER IMPORT:', ui2.length); ui2.forEach(u => console.log('  ', u.tag, u.id, '|', u.text, u.title ? '| ' + u.title : '', u.opts ? '\n      opts: ' + u.opts.join(' ; ') : ''));
  const today = await win.evaluate(() => (document.getElementById('ipal-today') || {}).innerText);
  console.log('TODAY CARD:\n', today);
  L.dump(log, 'stage1');
  console.log('PAGE ERRORS:', log.errors.length, '\n' + log.errors.join('\n---\n'));
  console.log('CONSOLE ERR/WARN:', log.console.length, '\n' + log.console.slice(0, 40).join('\n'));
  console.log('MAIN:', log.main.join('\n'));
  await app.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
