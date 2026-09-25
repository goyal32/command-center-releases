// Buttons stage 3 could not find by text (CSS-uppercased labels) + the MPR wizard + print brief
const L = require('./lib');
(async () => {
  const ctx = await L.launch(); const { app, win, log } = ctx;
  await L.setSize(app, 1600, 950);
  await L.signIn(ctx);
  const notes = []; const note = (k, v) => { notes.push([k, v]); console.log('NOTE', k, '::', String(v).replace(/\n{2,}/g, '\n').slice(0, 3000)); };
  const errCount = () => log.errors.length;
  async function topText() {
    return win.evaluate(() => {
      const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 150 && r.height > 80 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
      let c = Array.from(document.querySelectorAll('body *')).filter(el => vis(el) && !el.hasAttribute('data-qa-seen') && !/^(ipal-toast-stack|ipal-recon-fab|ipal-recon-badge)$/.test(el.id || ''));
      c = c.filter(el => !c.some(o => o !== el && o.contains(el)));
      c.sort((a, b) => (b.getBoundingClientRect().width * b.getBoundingClientRect().height) - (a.getBoundingClientRect().width * a.getBoundingClientRect().height));
      const t = c[0]; return t ? '[' + t.id + ' .' + String(t.className).slice(0, 40) + ']\n' + (t.innerText || '').replace(/[ \t]+/g, ' ').trim().slice(0, 3000) : 'NO NEW PANEL';
    });
  }
  async function mark() { await win.evaluate(() => { const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; document.querySelectorAll('[data-qa-seen]').forEach(el => el.removeAttribute('data-qa-seen')); document.querySelectorAll('body *').forEach(el => { if (vis(el)) el.setAttribute('data-qa-seen', '1'); }); }); }
  async function closeAll() { for (let i = 0; i < 3; i++) { await win.keyboard.press('Escape'); await win.waitForTimeout(300); const r = await win.evaluate(() => { const vis = el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; }; const btns = Array.from(document.querySelectorAll('button, [role=button], a')).filter(vis).filter(b => /^(×|✕|✖|x|close|done|close & return)$/i.test((b.textContent || '').trim()) || /^close/i.test(b.title || '') || /close/i.test(b.getAttribute('aria-label') || '')); const fb = btns.filter(b => { let e = b; while (e && e !== document.body) { const cs = getComputedStyle(e); if (cs.position === 'fixed' && parseInt(cs.zIndex || '0', 10) >= 40) return true; e = e.parentElement; } return false; }); if (fb.length) { fb[fb.length - 1].click(); return 'clicked'; } return 'none'; }); await win.waitForTimeout(400); if (r === 'none') break; } }
  async function open(sel, name, wait = 1800) {
    const before = errCount(); await mark();
    const el = await win.$(sel); if (!el) { note('MISSING:' + name, sel); return; }
    try { await el.click({ timeout: 4000 }); } catch (e) { await el.evaluate(b => b.click()); }
    await win.waitForTimeout(wait);
    await L.shot(win, name);
    note('PANEL:' + name, (await topText()) + '\n[new errors: ' + (errCount() - before) + ']');
    await closeAll();
  }
  await open('#ipal-rem-btn', '90-reminders', 2500);
  await open('#ipal-msg-btn', '91-messages');
  await open('#ipal-cal-btn', '92-calendar');
  await open('#ipal-diag-trigger-btn', '93-diagnostics');
  await open('#ipal-copy-view-link-btn', '94-copy-link', 800);
  await open('#ipal-eoy-btn', '95-eoy', 2500);
  note('96-print', 'skipped: #print-report-btn calls window.print(), which opens the native print dialog (blocks automation)');
  // MPR wizard
  const mpr = await win.evaluate(() => ({ hasMPR: !!window.MPR, allowed: typeof window.__ipalAleSyncAllowed === 'function' ? window.__ipalAleSyncAllowed() : 'n/a', btn: !!Array.from(document.querySelectorAll('button')).find(b => /Monthly Reports/.test(b.textContent)) }));
  note('mpr-availability', JSON.stringify(mpr));
  if (mpr.hasMPR) { await mark(); await win.evaluate(() => window.MPR.open()); await win.waitForTimeout(4000); await L.shot(win, '97-mpr-wizard'); note('PANEL:mpr', await topText()); await L.shot(win, '97-mpr-wizard', true); await closeAll(); }
  // student tools by title
  await open('button[title="Printable one-page student brief"]', '98-print-brief', 2000);
  await open('button[title^="Draft a WAC-compliant reply"]', '99-checkin-reply', 2000);
  await open('button[title="Show contact history"]', '100-contact-history', 1500);
  // course click
  await open('button:has-text("Algebra 1 A")', '101-course', 1500);
  // user menu items
  const menu = await win.evaluate(() => Array.from(document.querySelectorAll('#ipal-desktop-menu button, #ipal-desktop-menu a')).map(b => b.textContent.trim()).join(' | '));
  note('user-menu-items', menu);
  const downloads = []; win.on('download', d => downloads.push(d.suggestedFilename()));
  await open('button:has-text("Export Excel (Color)")', '102-export', 3000);
  note('downloads', JSON.stringify(downloads));
  L.dump({ ...log, notes }, 'stage6');
  console.log('PAGE ERRORS:', log.errors.length, '\n' + log.errors.join('\n---\n'));
  console.log('CONSOLE ERR/WARN:', log.console.filter(l => !/Security Warning|ERR_CERT/.test(l)).slice(0, 40).join('\n'));
  await app.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
