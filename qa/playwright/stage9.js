// snapshot compare label with a NEWER, worse file + locate the SyntaxError source
const L = require('./lib');
const { _electron } = require('playwright');
(async () => {
  const ctx = await L.launch(); const { app, win, log } = ctx;
  await win.addInitScript(() => {
    window.__qaSyntax = [];
    const origParse = JSON.parse;
    JSON.parse = function (t, r) { try { return origParse.call(JSON, t, r); } catch (e) { try { window.__qaSyntax.push({ kind: 'JSON.parse', msg: e.message, input: String(t).slice(0, 120), stack: String(e.stack || '').split('\n').slice(1, 4).join(' <- ') }); } catch (_) {} throw e; } };
    const OrigFn = window.Function;
    window.Function = function (...a) { try { return OrigFn.apply(this, a); } catch (e) { window.__qaSyntax.push({ kind: 'Function', msg: e.message, input: String(a[a.length - 1]).slice(0, 120) }); throw e; } };
    window.Function.prototype = OrigFn.prototype;
  });
  await L.setSize(app, 1600, 950);
  await L.signIn(ctx);
  const notes = []; const note = (k, v) => { notes.push([k, v]); console.log('NOTE', k, '::', String(v).slice(0, 2500)); };
  await win.waitForTimeout(3000);
  note('syntax-errors-at-load', JSON.stringify(await win.evaluate(() => window.__qaSyntax || []), null, 1));
  note('page-errors-so-far', log.errors.join(' | '));
  await win.evaluate(() => { const b = document.getElementById('save-snapshot-btn'); if (b) b.click(); }); await win.waitForTimeout(800);
  console.log('newer-worse', await L.importFile(win, '#csv-upload', ['EdgenuityEnrollments_09_27_2026.csv'], 'ipal:edgenuity-imported')); await win.waitForTimeout(1500);
  note('snapshot-after-newer-worse', await win.evaluate(() => { window.__snapshotDetailsExpanded = true; try { renderSnapshotComparison(); } catch (e) {} return ((document.getElementById('snapshot-alert-banner') || {}).innerText || '').replace(/\s+/g, ' ').slice(0, 900); }));
  await L.shot(win, '84-snapshot-worsened');
  note('syntax-errors-end', JSON.stringify(await win.evaluate(() => window.__qaSyntax || []), null, 1));
  L.dump({ ...log, notes }, 'stage9');
  console.log('PAGE ERRORS:', log.errors.length, log.errors.join(' | '));
  await app.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
