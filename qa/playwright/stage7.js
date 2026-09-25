// Do report windows open in the desktop app? (EOY, Leadership print, PLC print, student brief all use window.open('', '_blank'))
const L = require('./lib');
(async () => {
  const ctx = await L.launch(); const { app, win, log } = ctx;
  await L.setSize(app, 1600, 950);
  await L.signIn(ctx);
  const notes = []; const note = (k, v) => { notes.push([k, v]); console.log('NOTE', k, '::', String(v).slice(0, 1500)); };
  const wins = () => app.windows().length;
  note('windows-before', wins());
  const direct = await win.evaluate(() => { try { const w = window.open('', '_blank'); const r = w ? 'WindowProxy' : 'null'; try { if (w) { w.document.write('<p>test</p>'); w.close(); } } catch (e) { return r + ' (write failed: ' + e.message + ')'; } return r; } catch (e) { return 'threw: ' + e.message; } });
  note('window.open-empty-blank', direct);
  await win.waitForTimeout(800);
  note('windows-after-direct', wins());
  const eoy = await win.$('#ipal-eoy-btn'); if (eoy) { await eoy.click(); await win.waitForTimeout(3000); note('windows-after-eoy', wins()); note('toasts-after-eoy', await win.evaluate(() => (document.getElementById('ipal-toast-stack') || {}).innerText || '')); }
  for (const w of app.windows()) { if (w !== win) { try { note('report-window-title', await w.title()); note('report-window-text', (await w.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 600)); await w.close(); } catch (e) { note('report-window-err', e.message); } } }
  const brief = await win.$('button[title="Printable one-page student brief"]'); if (brief) { await brief.click(); await win.waitForTimeout(2500); note('windows-after-brief', wins()); note('toasts-after-brief', await win.evaluate(() => (document.getElementById('ipal-toast-stack') || {}).innerText || '')); }
  L.dump({ ...log, notes }, 'stage7');
  console.log('PAGE ERRORS:', log.errors.length, '\n' + log.errors.join('\n---\n'));
  await app.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
