'use strict';
/**
 * Laserfiche "ALE Monthly Report" pre-fill (main process).
 *
 * The district's Monthly Progress Report is a Laserfiche Forms process behind
 * Entra ID SSO. Nothing here logs in: the teacher signs in once inside the
 * in-app window (persistent partition), and this module only PRE-FILLS the
 * form fields from the payload the page hands it — the same fields the MPR
 * Fill bookmarklet in the handoff sets (ids verified 2026-09-09, form 1567).
 * It never clicks Submit and never touches the signature: the teacher reviews,
 * signs, and submits.
 *
 * v0.2.37: after the fill it also OBSERVES the teacher's own Submit click and
 * reads back the form's FINAL values (status, summary, communication, method,
 * intervention) — so a dropdown changed by hand before signing is what the
 * Command Center records. The form counts as submitted only when the page
 * then leaves the form (Laserfiche's thank-you page) within 60 s; a
 * validation error keeps the form open and nothing is reported.
 */

const PARTITION = 'persist:laserfiche';
const DEFAULT_URL = 'https://forms.psd1.org/Forms/ALEMonthlyReport';

const FILL_SCRIPT = `(function(p){
  function $(id){ return document.getElementById(id); }
  function setSelect(id, value){ var el=$(id); if(!el||value==null||value==='') return false; var opt=Array.prototype.slice.call(el.options).find(function(o){ return o.value===value||o.text.trim()===value; }); if(!opt) return false; el.value=opt.value; el.dispatchEvent(new Event('change',{bubbles:true})); return true; }
  function setText(id, value){ var el=$(id); if(!el||value==null) return false; el.value=value; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true; }
  function setRich(id, html){ var el=$(id); if(!el||!html) return false; el.innerHTML=html; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('keyup',{bubbles:true})); el.dispatchEvent(new Event('blur',{bubbles:true})); return true; }
  function setCheckbox(id, on){ var el=$(id); if(!el) return false; if(!!el.checked!==!!on) el.click(); return true; }
  function attachPdf(pdf){ var input=$('Field21'); if(!input||!pdf||!pdf.base64) return false; try { var bin=atob(pdf.base64), arr=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); var file=new File([arr], pdf.name||'Edgenuity-Progress-Report.pdf', {type:'application/pdf'}); var dt=new DataTransfer(); dt.items.add(file); input.files=dt.files; input.dispatchEvent(new Event('change',{bubbles:true})); return true; } catch(e){ return false; } }
  var sn = ($('Field5')||{}).value || '';
  if (!sn) return { ok:false, error:'form not ready' };
  if (p.student_number && String(p.student_number)!==String(sn)) return { ok:false, error:'form is for student '+sn+', payload is for '+p.student_number };
  var filled=[], skipped=[]; function mark(n,ok){ (ok?filled:skipped).push(n); }
  mark('Month', setSelect('Field24', p.month));
  mark('Meeting Method', setSelect('Field28', p.meeting_method));
  mark('Progress Status', setSelect('Field9', p.progress_status));
  mark('Intervention Plan Needed', setCheckbox('Field10-0', !!p.intervention_needed));
  if (p.intervention_needed) mark('Intervention Date', setText('Field12', p.intervention_date||''));
  mark('Meeting Narrative', setRich('RTFEditor-Field14', p.narrative_html));
  mark('Progress-report notes', setRich('RTFEditor-Field17', p.report_notes_html));
  mark('Progress Summary', setSelect('Field18', p.progress_summary));
  mark('Communication Requirement Status', setSelect('Field19', p.communication_status));
  mark('Edgenuity report PDF', attachPdf(p.pdf));
  ['Field24','Field28','Field9','Field18','Field19','RTFEditor-Field14','RTFEditor-Field17'].forEach(function(id){ var el=$(id); if(el) el.style.outline='2px solid #7c9cf5'; });
  var b=document.createElement('div'); b.style.cssText='position:fixed;left:12px;bottom:12px;z-index:2147483647;background:#fff;border:1px solid #343fb5;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.18);font:12px/1.4 Arial,sans-serif;color:#222;width:320px;padding:10px 12px;'; b.innerHTML='<b style="color:#343fb5">Command Center</b> filled: '+filled.join(', ')+(skipped.length?'. <span style="color:#a56a00">Not filled: '+skipped.join(', ')+'</span>':'')+'.<br><b>Review, sign, then Submit.</b>'; document.body.appendChild(b);
  return { ok:true, filled:filled, skipped:skipped, student_number:sn };
})(__PAYLOAD__)`;

/** Injected once after the fill: reports the final field values whenever the teacher clicks Submit. Observes only. */
const WATCH_SCRIPT = `(function(sn){
  if (window.__ccMprWatch) return true; window.__ccMprWatch = true;
  function $(id){ return document.getElementById(id); }
  function selText(id){ var el=$(id); if(!el) return ''; var o=el.options&&el.options[el.selectedIndex]; return o?o.text.trim():String(el.value||''); }
  function vals(){ return { student_number: sn||(($('Field5')||{}).value||''), month: selText('Field24'), meeting_method: selText('Field28'), progress_status: selText('Field9'), intervention_needed: !!(($('Field10-0')||{}).checked), intervention_date: (($('Field12')||{}).value||''), progress_summary: selText('Field18'), communication_status: selText('Field19') }; }
  function report(){ try { console.log('__CC_MPR_SUBMIT__' + JSON.stringify(vals())); } catch(e){} }
  document.addEventListener('click', function(e){ var el=e.target&&e.target.closest?e.target.closest('button,input[type=submit],input[type=button],a,div[role=button]'):null; if(!el) return; var label=(el.value||el.textContent||'').trim(); if(/^submit$/i.test(label)||/(^|\s)Submit(\s|$)/.test(el.className||'')) report(); }, true);
  document.addEventListener('submit', function(){ report(); }, true);
  return true;
})(__SN__)`;
const SUBMIT_MARK = '__CC_MPR_SUBMIT__';
/** true once the form is gone (thank-you page or the form fields left the DOM). */
const FORM_GONE_SCRIPT = '(function(){ var f=document.getElementById("Field5"); var t=(document.body&&document.body.innerText)||""; return !f || /thank you|has been submitted|submitted successfully/i.test(t); })()';

function createLaserfiche({ config, electron, onAudit, onFilled, onSubmitClicked, onSubmitted, submitWindowMs = 60000, pollMs = 1000 } = {}) {
  const cfg = Object.assign({ formUrl: DEFAULT_URL }, (config && config.mpr) || {});
  const { BrowserWindow } = electron || {};
  const formOrigin = (() => { try { return new URL(cfg.formUrl).origin; } catch (_e) { return 'https://forms.psd1.org'; } })();
  let win = null;
  // B3: one cookie store per app user (Entra ID session), so teachers sharing a Windows profile never share a Laserfiche login.
  let userKey = '';
  function partition() { return PARTITION + (userKey ? '-u' + userKey : ''); }
  function setUser(key) { const k = key == null ? '' : String(key).replace(/[^A-Za-z0-9_-]/g, ''); if (k === userKey) return; userKey = k; stop(); pending.clear(); clicked = null; watching = false; }
  const pending = new Map();   // student_number -> payload waiting for its form to render
  let clicked = null;          // { values, at } — the teacher's last Submit click, waiting for the page to leave the form
  let watching = false;
  function audit(t, d) { try { if (typeof onAudit === 'function') onAudit(t, d || null); } catch (_e) { /* never throw */ } }

  function ensureWindow() {
    if (win && !win.isDestroyed()) return win;
    win = new BrowserWindow({ width: 1000, height: 960, title: 'Monthly Progress Report — review, sign, submit (Command Center)', webPreferences: { partition: partition(), sandbox: true, contextIsolation: true, nodeIntegration: false } });
    win.setMenuBarVisibility(false);
    win.on('closed', () => { win = null; });
    win.webContents.on('did-finish-load', () => { tryFill().catch(() => {}); });
    // The watch script talks back through console.log (sandboxed page, no preload): "__CC_MPR_SUBMIT__{json}".
    win.webContents.on('console-message', (a, b, c) => {
      const msg = typeof c === 'string' ? c : (a && typeof a.message === 'string' ? a.message : (typeof b === 'string' ? b : ''));
      if (typeof msg !== 'string' || msg.indexOf(SUBMIT_MARK) !== 0) return;
      let values = null; try { values = JSON.parse(msg.slice(SUBMIT_MARK.length)); } catch (_e) { return; }
      onSubmitClick(values);
    });
    // Main-frame navigation away from the form after a Submit click = Laserfiche accepted it.
    win.webContents.on('did-navigate', () => { if (clicked) settle('navigated'); });
    return win;
  }
  async function waitForForm(wc, tries = 40) {
    for (let i = 0; i < tries; i++) {
      try {
        const sn = await wc.executeJavaScript('(function(){var e=document.getElementById("Field5");return e?String(e.value||""):"";})()', true);
        if (sn) return sn;
      } catch (_e) { /* navigating */ }
      await new Promise((r) => setTimeout(r, 500));
    }
    return '';
  }
  async function tryFill() {
    if (!win || win.isDestroyed()) return;
    const wc = win.webContents;
    const url = wc.getURL();
    let origin = ''; try { origin = new URL(url).origin; } catch (_e) { return; }
    if (origin !== formOrigin) return;                 // SSO hop, not the form
    if (!pending.size) return;
    const sn = await waitForForm(wc);
    if (!sn) return;
    const payload = pending.get(String(sn));
    if (!payload) return;
    pending.delete(String(sn));
    let result;
    try { result = await wc.executeJavaScript(FILL_SCRIPT.replace('__PAYLOAD__', () => JSON.stringify(payload))   /* QA-fix: a string replacement interprets $& $' $$ inside the narrative */, true); }
    catch (e) { result = { ok: false, error: e.message }; }
    audit('mpr.form_filled', { student_number: sn, ok: !!(result && result.ok), filled: result && result.filled ? result.filled.length : 0, skipped: result && result.skipped ? result.skipped : [], error: result && result.error });
    try { if (typeof onFilled === 'function') onFilled(Object.assign({ student_number: sn }, result || {})); } catch (_e) { /* best effort */ }
    if (result && result.ok) { try { await wc.executeJavaScript(WATCH_SCRIPT.replace('__SN__', JSON.stringify(String(sn))), true); watching = true; } catch (_e) { watching = false; } }
  }
  function onSubmitClick(values) {
    if (!values || !/^\d{5,9}$/.test(String(values.student_number || ''))) return;
    clicked = { values, at: Date.now() };
    audit('mpr.submit_clicked', { student_number: String(values.student_number), progress_status: values.progress_status || '' });
    try { if (typeof onSubmitClicked === 'function') onSubmitClicked(Object.assign({}, values)); } catch (_e) { /* best effort */ }
    pollFormGone();
  }
  // After a click the form must actually leave (thank-you page / fields gone) within the window; otherwise (validation error) nothing is reported.
  function pollFormGone() {
    const mine = clicked;
    const tick = async () => {
      if (!clicked || clicked !== mine) return;
      if (Date.now() - mine.at > submitWindowMs) { clicked = null; audit('mpr.submit_unconfirmed', { student_number: String(mine.values.student_number) }); return; }
      if (!win || win.isDestroyed()) return;
      let gone = false;
      try { gone = !!(await win.webContents.executeJavaScript(FORM_GONE_SCRIPT, true)); } catch (_e) { gone = false; }
      if (gone) { settle('form gone'); return; }
      setTimeout(tick, pollMs);
    };
    setTimeout(tick, pollMs);
  }
  function settle(how) {
    if (!clicked) return;
    const rec = Object.assign({}, clicked.values, { submitted_at: new Date().toISOString(), how });
    clicked = null; watching = false;
    audit('mpr.form_submitted', { student_number: String(rec.student_number), progress_status: rec.progress_status || '', how });
    try { if (typeof onSubmitted === 'function') onSubmitted(rec); } catch (_e) { /* best effort */ }
  }

  /** Open (or reuse) the form window for one student and pre-fill it when it renders. Never submits. */
  function openForm({ url, payload } = {}) {
    if (!BrowserWindow) return { ok: false, error: 'no window support' };
    if (!url || !String(url).startsWith(cfg.formUrl)) return { ok: false, error: 'form url must start with ' + cfg.formUrl };
    const p = payload || {};
    if (!/^\d{5,9}$/.test(String(p.student_number || ''))) return { ok: false, error: 'payload needs a 5-9 digit student_number' };
    pending.set(String(p.student_number), p);
    const w = ensureWindow();
    w.loadURL(url);
    w.focus();
    audit('mpr.form_opened', { student_number: String(p.student_number), month: p.month || '' });
    return { ok: true };
  }
  function stop() { try { if (win && !win.isDestroyed()) win.close(); } catch (_e) { /* ignore */ } }
  return { openForm, stop, setUser, partition, FILL_SCRIPT, WATCH_SCRIPT, PARTITION, formUrl: cfg.formUrl, _debug: { clicked: () => clicked, watching: () => watching } };
}

module.exports = { createLaserfiche, FILL_SCRIPT, WATCH_SCRIPT, FORM_GONE_SCRIPT, SUBMIT_MARK, DEFAULT_URL };
