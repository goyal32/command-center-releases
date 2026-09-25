const L = require('./lib');
(async () => {
  const ctx = await L.launch(); const { app, win, log } = ctx;
  await L.setSize(app, 1600, 950);
  await L.signIn(ctx);
  const resume = await win.$('button:has-text("Resume")'); if (resume) { await resume.click(); await win.waitForTimeout(2500); }
  const notes = []; const note = (k, v) => { notes.push([k, v]); console.log('NOTE', k, '::', String(v).slice(0, 2000)); };
  // re-import ALE log with ISO dates (real ALE format) and compare pills
  console.log('ale log iso', await L.importFile(win, '#ale-log-upload', ['ALE_Contact_Log.csv'], 'ipal:ale-log-imported'));
  await win.waitForTimeout(2500);
  const pills = async () => win.evaluate(() => Array.from(document.querySelectorAll('#sections-wrapper tr.student-header-row, #sections-wrapper .student-header-row')).map(r => (r.innerText || '').replace(/\s+/g, ' ').replace(/⚠.*$/, '').trim().slice(0, 90)).join('\n'));
  note('pills-iso-dates', await pills());
  await win.selectOption('#quick-view-select', 'missing-weekly-contact'); await win.waitForTimeout(1200);
  note('missing-weekly-contact-iso', await win.evaluate(() => document.getElementById('sections-wrapper').innerText.replace(/\s+/g, ' ').slice(0, 120)));
  await win.selectOption('#quick-view-select', ''); await win.waitForTimeout(800);
  note('today-iso', await win.evaluate(() => (document.getElementById('ipal-today') || {}).innerText));
  console.log('ale log excel', await L.importFile(win, '#ale-log-upload', ['ALE_Contact_Log_excel_dates.csv'], 'ipal:ale-log-imported'));
  await win.waitForTimeout(2500);
  note('pills-excel-dates', await pills());
  await win.selectOption('#quick-view-select', 'missing-weekly-contact'); await win.waitForTimeout(1200);
  note('missing-weekly-contact-excel', await win.evaluate(() => document.getElementById('sections-wrapper').innerText.replace(/\s+/g, ' ').slice(0, 120)));
  await win.selectOption('#quick-view-select', ''); await win.waitForTimeout(800);
  // back to ISO for the remaining stages
  console.log('ale log iso again', await L.importFile(win, '#ale-log-upload', ['ALE_Contact_Log.csv'], 'ipal:ale-log-imported'));
  await win.waitForTimeout(1500);
  // responsiveness
  for (const [w, h] of [[1920, 1080], [1536, 864], [1366, 768], [1280, 720], [1024, 768]]) {
    await L.setSize(app, w, h); await win.waitForTimeout(1500);
    const m = await win.evaluate(() => { const se = document.scrollingElement; const hdr = document.querySelector('header') || document.body.firstElementChild; const r = hdr.getBoundingClientRect(); const overflow = Array.from(document.querySelectorAll('body *')).filter(el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.right > window.innerWidth + 2 && getComputedStyle(el).position !== 'fixed'; }).slice(0, 5).map(el => (el.tagName + '#' + el.id + '.' + String(el.className).slice(0, 40))); return { inner: window.innerWidth + 'x' + window.innerHeight, scrollW: se.scrollWidth, hScroll: se.scrollWidth > window.innerWidth + 2, headerH: Math.round(r.height), zoom: window.devicePixelRatio, overflow }; });
    note('size-' + w + 'x' + h, JSON.stringify(m));
    await L.shot(win, '70-size-' + w + 'x' + h);
  }
  await L.setSize(app, 1366, 768);
  // student view at laptop size + print preview of student brief
  const first = await win.$('button:has-text("Alvarez, Diego")'); if (first) { await first.click(); await win.waitForTimeout(1500); await L.shot(win, '71-student-1366', true); }
  L.dump({ ...log, notes }, 'stage4');
  console.log('PAGE ERRORS:', log.errors.length, '\n' + log.errors.join('\n---\n'));
  console.log('CONSOLE ERR/WARN:', log.console.filter(l => !/Security Warning|ERR_CERT/.test(l)).slice(0, 40).join('\n'));
  await app.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
