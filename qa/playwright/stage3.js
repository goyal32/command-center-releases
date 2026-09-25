const L = require('./lib');
(async () => {
  const ctx = await L.launch(); const { app, win, log } = ctx;
  await L.setSize(app, 1600, 950);
  await L.signIn(ctx);
  const resume = await win.$('button:has-text("Resume")'); if (resume) { await resume.click(); await win.waitForTimeout(2500); }
  const notes = []; const note = (k, v) => { notes.push([k, v]); console.log('NOTE', k, '::', String(v).replace(/\n{2,}/g, '\n').slice(0, 2500)); };
  const errCount = () => log.errors.length + log.console.filter(l => /^\[error\]/.test(l) && !/ERR_CERT/.test(l)).length;
  const IGNORE = /^(ipal-toast-stack|ipal-recon-fab|ipal-recon-badge|ipal-today)$/;
  async function markSeen() { await win.evaluate(() => { const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; }; document.querySelectorAll('body *').forEach(el => { if (vis(el)) el.setAttribute('data-qa-seen', '1'); else el.removeAttribute('data-qa-seen'); }); }); }
  async function overlayText() {
    return win.evaluate((IGNORE_SRC) => {
      const IGNORE = new RegExp(IGNORE_SRC);
      const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 150 && r.height > 80 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
      let cands = Array.from(document.querySelectorAll('body *')).filter(el => vis(el) && !el.hasAttribute('data-qa-seen') && !IGNORE.test(el.id || ''));
      // keep only outermost new elements
      cands = cands.filter(el => !cands.some(o => o !== el && o.contains(el)));
      cands.sort((a, b) => (b.getBoundingClientRect().width * b.getBoundingClientRect().height) - (a.getBoundingClientRect().width * a.getBoundingClientRect().height));
      const top = cands[0];
      return top ? { id: top.id, cls: String(top.className).slice(0, 60), pos: getComputedStyle(top).position, text: (top.innerText || '').replace(/[ \t]+/g, ' ').trim().slice(0, 3000), n: cands.length } : null;
    }, IGNORE.source);
  }
  async function closeAll() {
    for (let i = 0; i < 3; i++) {
      await win.keyboard.press('Escape'); await win.waitForTimeout(300);
      const closed = await win.evaluate(() => {
        const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
        const btns = Array.from(document.querySelectorAll('button, [role=button], a')).filter(vis).filter(b => /^(×|✕|✖|x|close|✕ close|× close|done)$/i.test((b.textContent || '').trim()) || /close/i.test(b.getAttribute('aria-label') || '') || /^close/i.test(b.title || ''));
        const fixedBtns = btns.filter(b => { let e = b; while (e && e !== document.body) { const cs = getComputedStyle(e); if (cs.position === 'fixed' && parseInt(cs.zIndex || '0', 10) >= 40) return true; e = e.parentElement; } return false; });
        if (fixedBtns.length) { fixedBtns[fixedBtns.length - 1].click(); return 'clicked'; }
        return 'none';
      });
      await win.waitForTimeout(400);
      if (closed === 'none') break;
    }
  }
  async function openBy(label, shotName, opts = {}) {
    const before = errCount();
    await markSeen();
    const el = await win.$(`button:has-text("${label}")`);
    if (!el) { note('MISSING:' + label, 'button not found'); return; }
    try { await el.click({ timeout: 4000 }); } catch (e) { try { await el.evaluate(b => b.click()); note('JSCLICK:' + label, e.message.slice(0, 120)); } catch (e2) { note('CLICKFAIL:' + label, e2.message.slice(0, 200)); return; } }
    await win.waitForTimeout(opts.wait || 1800);
    const ov = await overlayText();
    await L.shot(win, shotName);
    note('PANEL:' + label, (ov ? ('[' + ov.id + ' .' + ov.cls + ']\n' + ov.text) : 'NO OVERLAY DETECTED') + '\n[new errors: ' + (errCount() - before) + ']');
    if (opts.extra) await opts.extra();
    await closeAll();
    const after = await overlayText();
    if (after && ov && after.id === ov.id && after.pos === 'fixed') note('STUCK:' + label, 'overlay still open after Escape/close: ' + after.id);
    await win.evaluate(() => document.querySelectorAll('[data-qa-seen]').forEach(el => el.removeAttribute('data-qa-seen')));
  }
  // header/tool panels
  await openBy("📋 Today’s Worklist", '20-worklist');
  await openBy('📋 Monthly Evaluations', '21-monthly-evals');
  await openBy('📜 WSLP Checker', '22-wslp');
  await openBy('🗓 Attendance', '23-attendance', { wait: 2500 });
  await openBy('📋 Contact Watch', '24-contact-watch', { wait: 2500 });
  await openBy('📝 Monthly Reports', '25-mpr', { wait: 3500 });
  await openBy('Advisor Weekly Digest', '26-digest', { wait: 2000 });
  await openBy('History & Trends', '27-history', { wait: 3000 });
  await openBy('Show charts', '28-charts', { wait: 1500 });
  await openBy('✨ Ask', '29-ask');
  await openBy('📤 ALE queue', '30-ale-queue');
  await openBy('🔄 ALE sync', '31-ale-sync');
  await openBy('🏛 District Overview', '32-district-overview');
  await openBy('📇 Contacts & Birthdays', '33-roster');
  await openBy('⚙️ Data Setup', '34-data-setup');
  await openBy('🔔 REMINDERS', '35-reminders', { wait: 2500 });
  await openBy('💬 MESSAGES', '36-messages');
  await openBy('📅 CALENDAR', '37-calendar');
  await openBy('🎓EOY CLOSE-OUT', '38-eoy', { wait: 2500 });
  await openBy('⚙️ DIAGNOSTICS', '39-diag');
  await openBy('👤 Helen Garcia', '40-user-menu');
  await openBy('Import IEPs', '41-iep');
  await openBy('All Statuses', '42-status');
  await openBy('＋ Save current view', '43-save-view');
  await openBy('🔗 COPY VIEW LINK', '44-copy-link');
  const fab = await win.$('#ipal-recon-fab'); if (fab) { await fab.click(); await win.waitForTimeout(2000); const ov = await overlayText(); await L.shot(win, '45-recon'); note('PANEL:recon', ov ? ov.text : 'none'); await closeAll(); }
  // student-level tools on first student
  await openBy('Alvarez, Diego', '50-student-view', { wait: 2000, extra: async () => { note('STUDENT-VIEW', await win.evaluate(() => ['student-profile-banner', 'mpr-comment-container', 'stat-total', 'stat-behind'].map(i => i + ': ' + ((document.getElementById(i) || {}).innerText || '').replace(/\s+/g, ' ').slice(0, 1200)).join('\n'))); } });
  // back to full list
  const back = await win.$('button:has-text("Back")') || await win.$('button:has-text("All Students")') || await win.$('button:has-text("Clear")'); note('student-view-back-button', back ? await back.textContent() : 'none found');
  await win.evaluate(() => { try { if (typeof window.clearStudentView === 'function') window.clearStudentView(); else if (typeof window.resetAllFilters === 'function') window.resetAllFilters(); } catch (e) {} }); await win.waitForTimeout(1000);
  await openBy('🕘', '51-student-history', { wait: 2000 });
  await openBy('⚠', '52-smart-attention');
  await openBy('🖨', '53-brief');
  await openBy('▾', '54-contact-history');
  await openBy('✍️ Check-In Draft Reply', '55-checkin-reply');
  await openBy('✨', '56-ai');
  // emails: capture mailto
  await app.evaluate(() => { global.__opened = []; });
  await openBy('✉ Email Student', '57-email-student');
  await win.selectOption('#advisor-filter', 'GH'); await win.waitForTimeout(1200);
  await openBy('✉ Email Advisory', '58-email-advisory');
  await win.selectOption('#advisor-filter', 'all'); await win.waitForTimeout(800);
  const opened = await app.evaluate(() => global.__opened); note('MAILTO-OPENED', JSON.stringify(opened.map(u => decodeURIComponent(u).slice(0, 1500)), null, 1));
  // course click
  await openBy('Algebra 1 A', '59-course-click', { wait: 1500 });
  // exports: capture downloads
  const dls = [];
  win.on('download', d => dls.push(d.suggestedFilename()));
  await openBy('Export Excel (Color)', '60-export-excel', { wait: 3000 });
  await openBy('EXPORT EXCEL (COLOR)', '61-export-excel2', { wait: 3000 });
  await openBy('Save Snapshot', '62-save-snapshot');
  note('DOWNLOADS', JSON.stringify(dls));
  L.dump({ ...log, notes }, 'stage3');
  console.log('PAGE ERRORS:', log.errors.length, '\n' + log.errors.join('\n---\n'));
  console.log('CONSOLE ERR/WARN:', log.console.length, '\n' + log.console.filter(l => !/Security Warning|ERR_CERT/.test(l)).slice(0, 60).join('\n'));
  await app.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
