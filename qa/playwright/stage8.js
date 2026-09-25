// Where does "Unexpected token ')'" come from? Attach error listeners to every window and syntax-check inline scripts of report windows.
const L = require('./lib');
(async () => {
  const ctx = await L.launch(); const { app, win, log } = ctx;
  await L.setSize(app, 1600, 950);
  const childErrors = [];
  app.on('window', w => { w.on('pageerror', e => childErrors.push('[child ' + (w.url() || '').slice(0, 40) + '] ' + e.message)); w.on('console', m => { if (m.type() === 'error') childErrors.push('[child console] ' + m.text().slice(0, 200)); }); });
  await L.signIn(ctx);
  const notes = []; const note = (k, v) => { notes.push([k, v]); console.log('NOTE', k, '::', String(v).slice(0, 2000)); };
  async function checkReport(clickFn, name) {
    const before = log.errors.length, cBefore = childErrors.length;
    await clickFn(); await win.waitForTimeout(3000);
    const others = app.windows().filter(w => w !== win);
    for (const w of others) {
      try {
        const r = await w.evaluate(() => Array.from(document.scripts).map((s, i) => { if (s.src) return i + ': external ' + s.src; try { new Function(s.text); return i + ': ok (' + s.text.length + ' chars)'; } catch (e) { const m = String(e.message); return i + ': SYNTAX ' + m + ' | ' + s.text.slice(0, 200).replace(/\s+/g, ' '); } }).join('\n'));
        note(name + '-scripts', await w.title() + '\n' + r);
        await w.close();
      } catch (e) { note(name + '-err', e.message); }
    }
    note(name + '-errors', 'main page errors +' + (log.errors.length - before) + ' ' + log.errors.slice(before).join(' | ') + '; child errors +' + (childErrors.length - cBefore) + ' ' + childErrors.slice(cBefore).join(' | '));
  }
  await checkReport(async () => { const b = await win.$('#ipal-eoy-btn'); if (b) await b.click(); }, 'eoy');
  await checkReport(async () => { await win.evaluate(() => { const b = document.querySelector('button[title="Printable one-page student brief"]'); if (b) b.click(); }); }, 'brief');
  await checkReport(async () => { await win.evaluate(() => { if (window.__ipalLeadOpen) window.__ipalLeadOpen(); else { const s = document.getElementById('quick-view-select'); s.value = 'leadership'; s.dispatchEvent(new Event('change', { bubbles: true })); } }); await win.waitForTimeout(1500); await win.evaluate(() => { const b = Array.from(document.querySelectorAll('#ipal-lead-modal button')).find(x => /Print report/.test(x.textContent)); if (b) b.click(); }); }, 'leadership-print');
  L.dump({ ...log, notes, childErrors }, 'stage8');
  console.log('PAGE ERRORS:', log.errors.length, log.errors.join(' | '));
  await app.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
