// remaining verification: snapshot label, email bodies/subjects, mailto capture, derived calendar
const L = require('./lib');
(async () => {
  const ctx = await L.launch(); const { app, win, log } = ctx;
  await L.setSize(app, 1600, 950);
  await L.signIn(ctx);
  const notes = []; const note = (k, v) => { notes.push([k, v]); console.log('NOTE', k, '::', String(v).slice(0, 3000)); };
  note('startup-state', await win.evaluate(() => JSON.stringify({ rows: (window.__ipalAllRows || []).length, resume: !!Array.from(document.querySelectorAll('button')).find(b => /^Resume$/.test(b.textContent.trim())) })));
  // snapshot: save (JS click, the button may be off-screen), import older (worse pacing) -> "worsened"; newest -> "improved"
  await win.evaluate(() => { const b = document.getElementById('save-snapshot-btn'); if (b) b.click(); }); await win.waitForTimeout(800);
  console.log('older', await L.importFile(win, '#csv-upload', ['EdgenuityEnrollments_09_11_2026.csv'], 'ipal:edgenuity-imported')); await win.waitForTimeout(1200);
  note('snapshot-after-older', await win.evaluate(() => { window.__snapshotDetailsExpanded = true; try { renderSnapshotComparison(); } catch (e) {} return ((document.getElementById('snapshot-alert-banner') || {}).innerText || '').replace(/\s+/g, ' ').slice(0, 700); }));
  console.log('newest', await L.importFile(win, '#csv-upload', ['EdgenuityEnrollments_09_25_2026.csv'], 'ipal:edgenuity-imported')); await win.waitForTimeout(1200);
  note('snapshot-after-newest', await win.evaluate(() => { window.__snapshotDetailsExpanded = true; try { renderSnapshotComparison(); } catch (e) {} return ((document.getElementById('snapshot-alert-banner') || {}).innerText || '').replace(/\s+/g, ' ').slice(0, 700); }));
  await L.shot(win, '81-snapshot-fixed');
  note('email-bodies-fixed', await win.evaluate(() => ['expired-date', 'no-contact-20', 'graded-out', 'ten-day-check', 'extremely-behind'].map(k => k + ' => [' + window.__getEmailSubject(k) + '] ' + window.__policyCommonMessage(k).split('\n').slice(2, 3).join(' ').slice(0, 140)).join('\n')));
  note('calendar-derived', await win.evaluate(() => JSON.stringify({ sy: window.TENANT_CONFIG.calendar.schoolYear, end: window.TENANT_CONFIG.calendar.calendarEnd, closures: window.TENANT_CONFIG.calendar.singleDayClosures.length, breaks: Object.keys(window.TENANT_CONFIG.calendar.breakWeeks) })));
  // mailto capture: Email Student (Alvarez) and Email Advisory (GH)
  await app.evaluate(() => { global.__opened = []; });
  await win.evaluate(() => { const b = document.querySelector('button[title="Email Student"]'); if (b) b.click(); }); await win.waitForTimeout(2500);
  await L.shot(win, '82-email-student');
  note('email-student-overlay', await win.evaluate(() => { const o = document.querySelector('.smart-alert-overlay, #ipal-advmail-overlay.show, [id*=email][class*=show]'); return o ? (o.innerText || '').replace(/\s+/g, ' ').slice(0, 400) : 'none'; }));
  await win.keyboard.press('Escape'); await win.waitForTimeout(500);
  await win.selectOption('#advisor-filter', 'GH'); await win.waitForTimeout(1500);
  await win.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find(x => /Email Advisory/.test(x.textContent)); if (b) b.click(); }); await win.waitForTimeout(2000);
  await L.shot(win, '83-email-advisory');
  note('email-advisory-modal', await win.evaluate(() => { const o = document.getElementById('ipal-advmail-overlay'); return o ? (o.innerText || '').replace(/\s+/g, ' ').slice(0, 900) : 'none'; }));
  await win.evaluate(() => { const o = document.getElementById('ipal-advmail-overlay'); if (!o) return; const b = Array.from(o.querySelectorAll('button')).find(x => /Open in Outlook|Send|Open/i.test(x.textContent)); if (b) b.click(); }); await win.waitForTimeout(1500);
  const opened = await app.evaluate(() => global.__opened);
  note('mailto-opened', JSON.stringify(opened.map(u => { try { return decodeURIComponent(u); } catch (e) { return u; } }).map(u => u.slice(0, 1200)), null, 1));
  L.dump({ ...log, notes }, 'stage5b');
  console.log('PAGE ERRORS:', log.errors.length, '\n' + log.errors.join('\n---\n'));
  console.log('CONSOLE ERR/WARN:', log.console.filter(l => !/Security Warning|ERR_CERT/.test(l)).slice(0, 40).join('\n'));
  await app.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
