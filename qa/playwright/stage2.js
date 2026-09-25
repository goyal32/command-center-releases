const L = require('./lib');
const fs = require('fs');
(async () => {
  const ctx = await L.launch(); const { app, win, log } = ctx;
  await L.setSize(app, 1600, 950);
  await L.signIn(ctx);
  const notes = [];
  const note = (k, v) => { notes.push([k, v]); console.log('NOTE', k, '::', String(v).slice(0, 1500)); };
  // 1. what does a returning teacher see? Is data restored?
  const st = async () => win.evaluate(() => ({ rows: (window.dashboardData || []).length, empty: !document.getElementById('empty-state').classList.contains('hidden'), dash: !document.getElementById('dashboard-content').classList.contains('hidden'), resume: !!Array.from(document.querySelectorAll('button')).find(b => /^Resume$/.test(b.textContent.trim())) }));
  note('returning-state-before-resume', JSON.stringify(await st()));
  const resume = await win.$('button:has-text("Resume")');
  if (resume) { await resume.click(); await win.waitForTimeout(2500); note('after-resume', JSON.stringify(await st())); }
  await L.shot(win, '10-after-resume', false);
  // 2. status filter works now?
  const statusBtn = await win.$('#status-multiselect-btn');
  if (statusBtn) { await statusBtn.click(); await win.waitForTimeout(600); note('status-menu', await win.evaluate(() => (document.getElementById('status-multiselect-menu') || {}).innerText)); await L.shot(win, '11-status-menu'); await win.keyboard.press('Escape'); }
  // 3. quick views
  const qv = await win.$$eval('#quick-view-select option', os => os.map(o => o.value).filter(Boolean));
  for (const v of qv) {
    await win.selectOption('#quick-view-select', v); await win.waitForTimeout(1200);
    const info = await win.evaluate(() => { const w = document.getElementById('sections-wrapper'); const names = Array.from(document.querySelectorAll('#sections-wrapper tr.student-header-row, #sections-wrapper .student-header-row')).length; return { headers: names, textLen: (w && w.innerText || '').length, first: (w && w.innerText || '').replace(/\s+/g, ' ').slice(0, 300) }; });
    note('quickview:' + v, JSON.stringify(info));
    await L.shot(win, '12-qv-' + v.replace(/[^a-z0-9-]/gi, '_'));
  }
  await win.selectOption('#quick-view-select', ''); await win.waitForTimeout(800);
  // 4. group modes
  for (const g of ['studentSummary', 'Course Name', 'Name', 'advisor', 'Student Grade Level', 'none']) {
    await win.selectOption('#group-select', g); await win.waitForTimeout(1200);
    note('group:' + g, await win.evaluate(() => (document.getElementById('sections-wrapper') || {}).innerText.replace(/\s+/g, ' ').slice(0, 400)));
    await L.shot(win, '13-group-' + g.replace(/\W/g, '_'));
  }
  // 5. filters: advisor GH, teacher Ortiz, counselor MG, school chiawana, search
  await win.selectOption('#advisor-filter', 'GH'); await win.waitForTimeout(1000);
  note('advisor-GH-stats', await win.evaluate(() => ['stat-total','stat-behind','stat-risk','stat-grade','stat-progress'].map(i => i + '=' + document.getElementById(i).textContent).join(' ')));
  await L.shot(win, '14-advisor-GH', true);
  await win.selectOption('#advisor-filter', 'all');
  await win.selectOption('#teacher-filter', 'Ortiz'); await win.waitForTimeout(1000);
  note('teacher-Ortiz-stats', await win.evaluate(() => ['stat-total','stat-behind','stat-risk'].map(i => i + '=' + document.getElementById(i).textContent).join(' ')));
  await win.selectOption('#teacher-filter', 'all');
  await win.selectOption('#school-filter', 'chiawana'); await win.waitForTimeout(1000);
  note('school-chiawana-stats', await win.evaluate(() => ['stat-total','stat-behind','stat-risk'].map(i => i + '=' + document.getElementById(i).textContent).join(' ')));
  await win.selectOption('#school-filter', 'all');
  await win.fill('#table-search', 'chen'); await win.waitForTimeout(1000);
  note('search-chen', await win.evaluate(() => ['stat-total','stat-enrollment-count'].map(i => i + '=' + document.getElementById(i).textContent).join(' ')));
  await win.fill('#table-search', ''); await win.waitForTimeout(800);
  await win.check('#ale-no-contact-filter'); await win.waitForTimeout(1000);
  note('ale-no-contact-filter', await win.evaluate(() => ['stat-total'].map(i => i + '=' + document.getElementById(i).textContent).join(' ') + ' | ' + Array.from(document.querySelectorAll('#sections-wrapper button')).map(b => b.textContent.trim()).filter(t => /,/.test(t)).join(';')));
  await win.uncheck('#ale-no-contact-filter'); await win.waitForTimeout(800);
  // 6. sorts
  for (const s of ['risk-desc', 'grade-asc', 'pacing-asc', 'expired-date', 'no-activity-7', 'missing-weekly-contact', 'no-contact-20', 'new-start-10', 'name-asc']) {
    await win.selectOption('#sort-select', s); await win.waitForTimeout(1000);
    note('sort:' + s, await win.evaluate(() => Array.from(document.querySelectorAll('#sections-wrapper button')).map(b => b.textContent.trim()).filter(t => /^[A-Z][a-z]+, /.test(t)).slice(0, 14).join(' | ')));
  }
  await L.shot(win, '15-sorted-name', true);
  L.dump({ ...log, notes }, 'stage2');
  console.log('PAGE ERRORS:', log.errors.length, '\n' + log.errors.join('\n---\n'));
  console.log('CONSOLE ERR/WARN:', log.console.length, '\n' + log.console.filter(l => !/Security Warning|ERR_CERT/.test(l)).slice(0, 40).join('\n'));
  await app.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
