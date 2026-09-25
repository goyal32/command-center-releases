'use strict';
/**
 * Command Center Desktop — main process.
 * App lifecycle, window creation, storage/auth wiring, IPC registration.
 */

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, dialog, Menu, shell, screen, Notification, ipcMain } = require('electron');
// 0.2.41: persistent log (<userData>/logs/main.log) from the very first line — every
// console.log/warn/error below is also written there ("Help > Open log folder").
const logger = require('./src/logger');
try { logger.init(path.join(app.getPath('userData'), 'logs')); } catch (_e) { /* logging must never stop the app */ }
console.log('[main] ---- start v' + app.getVersion() + ' packaged=' + app.isPackaged + ' pid=' + process.pid + ' ----');
const updateGuard = require('./src/updateGuard');
const displayFit = require('./src/displayFit');
// Windows routes toast notifications by AppUserModelID; it must match the
// installer's appId or packaged builds show no notification at all.
if (process.platform === 'win32') { try { app.setAppUserModelId('com.commandcenter.desktop'); } catch (_e) { /* ignore */ } }
const { loadConfig, readConfigJson } = require('./src/config');
const { SqliteAdapter } = require('./src/storage/SqliteAdapter');
const registry = require('./src/auth/registry');
const { registerIpcHandlers } = require('./src/ipc');
const session = require('./src/session');
const backup = require('./src/backup');
const { initAutoUpdate } = require('./src/updater');
const { LocalLlamaProvider } = require('./src/ai/LocalLlamaProvider');
const licenseMod = require('./src/license');
const importWatch = require('./src/importWatch');
const messagesMod = require('./src/messages');

/** Per-session staff-messages watcher (started on login, stopped on logout). */
let messagesWatcher = null;

/** v0.2.36: ALE auto-sync (read-only report pulls; src/aleSync.js). */
const { createAleSync } = require('./src/aleSync');
let aleSync = null;
/** v0.2.37: Edgenuity in-app window / one-click export / progress PDF, and the Laserfiche MPR pre-fill window. */
const { createEdgenuity } = require('./src/edgenuity');
const { createLaserfiche } = require('./src/laserfiche');
const { createVoice } = require('./src/voice');
let edgenuity = null;
let laserfiche = null;
function startPortals() {
  try {
    const electron = require('electron');
    edgenuity = createEdgenuity({
      config, userDataDir: app.getPath('userData'), electron,
      onAudit: (t, d) => { try { auditEvent(t, d); } catch (_e) { /* best effort */ } },
      onStatus: (s) => { try { if (mainWindow && !mainWindow.isDestroyed() && session.current()) mainWindow.webContents.send('edg:status', s); } catch (_e) { /* best effort */ } },
    });
    laserfiche = createLaserfiche({
      config, electron,
      onAudit: (t, d) => { try { auditEvent(t, d); } catch (_e) { /* best effort */ } },
      onFilled: (r) => { try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('mpr:filled', r); } catch (_e) { /* best effort */ } },
      onSubmitClicked: (r) => { try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('mpr:submitClicked', r); } catch (_e) { /* best effort */ } },
      onSubmitted: (r) => { try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('mpr:submitted', r); } catch (_e) { /* best effort */ } },
    });
  } catch (err) { console.warn('[portals] not started:', err.message); }
}
/** B3: same role rule as ipc.js aleGate — who may receive / drive the ALE pilot. */
function aleRoleOk(s) {
  if (!s) return false;
  const roles = Array.isArray((config.aleSync || {}).roles) && config.aleSync.roles.length ? config.aleSync.roles : ['admin'];
  try { return roles.some((r) => session.hasRole(s, r)); } catch (_e) { return false; }
}
/** B3: an app user signed in — bind ALE state + portal cookie stores to them and auto-sign-in with THEIR saved ALE login. */
function portalsLogin(s) {
  if (!s) return;
  try { if (aleSync) { aleSync.setOwner(s.username, s.displayName); if (aleRoleOk(s)) setTimeout(() => { try { aleSync.autoLogin().catch(() => {}).then(pushAleStatus, pushAleStatus); } catch (_e) { /* best effort */ } }, 3000); } } catch (_e) { /* best effort */ }
  try { if (edgenuity) edgenuity.setUser(s.userId); } catch (_e) { /* best effort */ }
  try { if (laserfiche) laserfiche.setUser(s.userId); } catch (_e) { /* best effort */ }
}
/** Tell the page the ALE status changed (after the auto sign-in) so the 🔄 pill does not wait for its 5-minute timer. */
function pushAleStatus() {
  try { if (mainWindow && !mainWindow.isDestroyed() && aleSync && aleRoleOk(session.current())) mainWindow.webContents.send('ale:statusChanged', aleSync.status()); } catch (_e) { /* best effort */ }
}
/** B3: app logout — sign out of ALE, close the portal windows, forget in-memory ALE data. Saved logins stay on disk, bound to their owner. */
function portalsLogout() {
  try { if (aleSync) aleSync.onAppLogout(); } catch (_e) { /* best effort */ }
  try { if (edgenuity) { edgenuity.stop(); edgenuity.setUser(null); } } catch (_e) { /* best effort */ }
  try { if (laserfiche) { laserfiche.stop(); laserfiche.setUser(null); } } catch (_e) { /* best effort */ }
}
function startAleSync() {
  try {
    const { safeStorage } = require('electron');
    aleSync = createAleSync({
      config,
      userDataDir: app.getPath('userData'),
      safeStorage,
      onAudit: (type, detail) => { try { auditEvent(type, detail); } catch (_e) { /* best effort */ } },
      onSnapshot: (bundle) => {
        try {
          // B3: only a signed-in app user WITH the pilot role receives the pull (same rule as the ALE IPC gate)
          if (mainWindow && !mainWindow.isDestroyed() && aleRoleOk(session.current())) {
            mainWindow.webContents.send('ale:snapshot', bundle);
          }
        } catch (_e) { /* best effort */ }
      },
    });
    // B3: the remembered ALE login is used only after the app user who saved it signs in (see portalsLogin), never at boot.
  } catch (err) {
    console.warn('[ale-sync] not started:', err.message);
    aleSync = null;
  }
}

/** v0.2.29: fold a private duplicate of the sync folder back into the shared one (see districtSync.healRoot). */
function healDistrictSync() {
  try {
    const s = session.current();
    if (!s) return;
    districtSync.setCurrentUser(s.username);
    const r = districtSync.healRoot({ config, username: s.username });
    if (r.healed) {
      console.log('[district-sync] healed:', r.actions.join('; '));
      try { auditEvent('district_sync.healed', { actions: r.actions }); } catch (_e) { /* best effort */ }
    }
  } catch (err) {
    console.warn('[district-sync] heal failed:', err.message);
  }
}

// v0.2.40: while signed in and NOT connected, look for the shared folder every 30 s
// (marker file / other staff's activity anywhere under OneDrive) and connect the
// moment it appears — the teacher adds the shortcut and never has to restart.
let messagesConnectTimer = null;
function pushMessagesStatus() {
  try {
    if (mainWindow && !mainWindow.isDestroyed() && session.current()) mainWindow.webContents.send('messages:statusChanged', messagesMod.status(config));
  } catch (_e) { /* best effort */ }
}
function messagesConnectTick() {
  try {
    const s = session.current();
    if (!s) return;
    if (messagesWatcher) return; // connected — nothing to do
    districtSync.setCurrentUser(s.username);
    const found = districtSync.discover(config, { username: s.username });
    if (found && messagesMod.enabled(config)) {
      console.log('[messages] shared folder connected:', found.path, '(' + found.how + ')');
      try { auditEvent('district_sync.connected', { how: found.how }); } catch (_e) { /* best effort */ }
      startMessagesWatch();
      writeDistrictActivity(); // show up in colleagues' rosters right away, not an hour later
      pushMessagesStatus();
    }
  } catch (err) { console.warn('[messages] connect check failed:', err.message); }
}
function startMessagesConnectLoop() {
  if (messagesConnectTimer) return;
  messagesConnectTimer = setInterval(messagesConnectTick, 30 * 1000);
  if (messagesConnectTimer.unref) messagesConnectTimer.unref();
}
function stopMessagesConnectLoop() {
  try { if (messagesConnectTimer) clearInterval(messagesConnectTimer); } catch (_e) { /* ignore */ }
  messagesConnectTimer = null;
}

function startMessagesWatch() {
  stopMessagesWatch();
  const s = session.current();
  if (!s) return;
  try { districtSync.setDistrictKey(installedDistrictKey()); } catch (_e) { /* optional */ }
  districtSync.setCurrentUser(s.username);
  try { districtSync.discover(config, { username: s.username }); } catch (_e) { /* optional */ }
  healDistrictSync();
  startMessagesConnectLoop();
  if (!messagesMod.enabled(config)) return;
  try { messagesMod.pruneOwn({ config, username: s.username }); } catch (_e) { /* best effort */ }
  messagesWatcher = messagesMod.watch({
    config,
    username: s.username,
    onNew: (rec) => {
      try {
        if (mainWindow && !mainWindow.isDestroyed() && session.current()) {
          mainWindow.webContents.send('messages:new', rec);
        }
      } catch (_e) { /* best effort */ }
      notifyNewMessage(rec);
    },
  });
}

/** OS-level notification (Windows toast + sound) for a staff message. */
function notifyNewMessage(rec) {
  try {
    if (!Notification.isSupported()) return;
    const who = (rec.from && rec.from.displayName) || 'Staff message';
    const stu = rec.student && rec.student.name ? `[${rec.student.name}] ` : '';
    const n = new Notification({
      title: `💬 ${who} — Command Center`,
      body: (stu + String(rec.text || '')).slice(0, 200),
      silent: false,
    });
    n.on('click', () => {
      try {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('messages:open', rec);
      } catch (_e) { /* best effort */ }
    });
    n.show();
  } catch (err) {
    console.warn('[messages] notification failed:', err.message);
  }
}

function stopMessagesWatch() {
  try { if (messagesWatcher) messagesWatcher.stop(); } catch (_e) { /* ignore */ }
  messagesWatcher = null;
  if (!session.current()) stopMessagesConnectLoop(); // signed out: stop looking
}
const { getDbEncryptionKey } = require('./src/dbkey');
const districtSync = require('./src/districtSync');

let mainWindow = null;
let storage = null;
let config = null;
/** True once a pending DB restore was swapped in during this boot. */
let restoreAppliedAtBoot = false;
/** The 24h auto-backup check runs once per process, after the first login. */
let autoBackupChecked = false;
/** Modal admin child windows, keyed by page name. */
const adminWindows = { admin: null, audit: null };

/**
 * Open (or focus) a modal admin child window. Role-checked in the main
 * process — the menu items are also disabled for non-admins, this is the
 * backstop.
 * @param {'admin'|'audit'} kind
 */
function openAdminWindow(kind) {
  const s = session.current();
  if (!s || !session.hasRole(s, 'admin')) return;
  const existing = adminWindows[kind];
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return;
  }
  const win = new BrowserWindow({
    width: kind === 'audit' ? 1080 : 960,
    height: 720,
    parent: mainWindow || undefined,
    modal: true,
    show: false,
    title: kind === 'admin' ? 'User Management' : 'Audit Log',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    adminWindows[kind] = null;
  });
  wireWindowWebContents(win);
  win.loadFile(path.join(__dirname, 'renderer', kind === 'admin' ? 'admin.html' : 'audit.html'));
  adminWindows[kind] = win;
}

function closeAdminWindows() {
  for (const key of Object.keys(adminWindows)) {
    const win = adminWindows[key];
    if (win && !win.isDestroyed()) win.close();
    adminWindows[key] = null;
  }
}

// ---------------------------------------------------------------- license ---
// District licensing (src/license.js): evaluated at boot and re-checked with
// the vendor's revoked.json every 12 hours. Locked = sign-in refused (the
// IPC login handler enforces it); data on disk is never touched.

let licenseEval = { status: 'unlicensed' };
let revokedIds = [];

function revokedCachePath() {
  return path.join(app.getPath('userData'), 'revoked-cache.json');
}

function loadRevokedCache() {
  try {
    const data = JSON.parse(fs.readFileSync(revokedCachePath(), 'utf8'));
    return Array.isArray(data.revoked) ? data.revoked.map(String) : [];
  } catch (_e) {
    return [];
  }
}

/** Key of the district this install was set up for (null before setup). */
function installedDistrictKey() {
  try {
    const list = storage && storage.districts ? storage.districts.list() : [];
    return list.length ? list[0].key : null;
  } catch (_e) {
    return null;
  }
}

function evaluateLicenseNow() {
  licenseEval = licenseMod.evaluate({
    license: (config && config.license) || null,
    revokedIds,
    districtKey: installedDistrictKey(),
  });
  return licenseEval;
}

/** Called by IPC right after provisioning stores a license — evaluate it now, not at the next 12h tick. */
function onLicenseChanged() {
  evaluateLicenseNow();
  refreshLicense().catch(() => {});
}

async function refreshLicense() {
  try {
    if (!config || !config.license) return; // unlicensed installs never lock
    const ids = await licenseMod.fetchRevokedIds(config.licenseRevocationUrl);
    if (ids !== null) {
      // Successful fetch REPLACES the cache (so un-revoking works); a failed
      // fetch (null) keeps the last known list and never clears anything.
      revokedIds = ids;
      try {
        fs.writeFileSync(revokedCachePath(), JSON.stringify({ revoked: ids, fetchedAt: new Date().toISOString() }));
      } catch (_e) { /* cache is best-effort */ }
    }
    const before = licenseEval.status;
    evaluateLicenseNow();
    const lockedNow = ['expired', 'revoked', 'invalid'].includes(licenseEval.status);
    if (lockedNow && session.current()) {
      console.log(`[license] state ${before} -> ${licenseEval.status}; signing out`);
      auditEvent('license.locked', { status: licenseEval.status, licenseId: config.license.id || null });
      await doLogout();
    }
  } catch (err) {
    console.error('[license] refresh failed (ignored):', err.message);
  }
}

/** Menu "Logout" — mirrors the auth:logout IPC flow. */
async function doLogout() {
  const was = session.current();
  if (was) {
    try {
      storage.audit.log({
        districtId: was.districtId,
        userId: was.userId,
        username: was.username,
        eventType: 'logout',
        detail: { via: 'menu' },
      });
    } catch (err) {
      console.error('[audit] failed to write audit row:', err.message);
    }
    session.logout();
  }
  portalsLogout();
  await navigate('login');
}

/** Write an audit row for the current session, best effort. */
function auditEvent(eventType, detail) {
  try {
    const s = session.current();
    storage.audit.log({
      districtId: s ? s.districtId : null,
      userId: s ? s.userId : null,
      username: s ? s.username : null,
      eventType,
      detail,
    });
  } catch (err) {
    console.error('[audit] failed to write audit row:', err.message);
  }
}

/**
 * File → "Back Up Now…". Save-dialog defaulting to <userData>/backups, then
 * one .ccbackup with the SQLite DB + the HTML app's renderer bundle.
 * Also invocable from the renderer via the backup:run IPC channel.
 */
async function doBackupNow() {
  const s = session.current();
  if (!s) return { ok: false, error: 'Not signed in.', code: 'EAUTH' };
  const defaultDir = backup.backupsDir(app.getPath('userData'));
  fs.mkdirSync(defaultDir, { recursive: true });
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Back Up Now',
    defaultPath: path.join(defaultDir, `CommandCenter-Backup-${backup.tsStamp()}${backup.BACKUP_EXT}`),
    filters: [{ name: 'Command Center Backup', extensions: ['ccbackup'] }],
  });
  if (canceled || !filePath) return { ok: false, error: 'Canceled.', code: 'ECANCELED' };
  try {
    const result = await backup.createBackup({
      storage,
      win: mainWindow,
      filePath,
      kind: 'manual',
      username: s.username,
      appVersion: app.getVersion(),
    });
    storage.backups.record({ userId: s.userId, filePath, kind: 'manual' });
    auditEvent('backup.run', { filePath, kind: 'manual', rendererData: result.hasRendererData });
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Backup complete',
      message: 'Backup saved.',
      detail:
        `${filePath}\n\nIncluded: SQLite database` +
        (result.hasRendererData
          ? ' + dashboard data (localStorage and IndexedDB).'
          : '. Dashboard data was not included (the Command Center page is not loaded).'),
    });
    return { ok: true, filePath, rendererData: result.hasRendererData };
  } catch (err) {
    console.error('[backup] manual backup failed:', err);
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Backup failed',
      message: 'Could not create the backup.',
      detail: err.message,
    });
    return { ok: false, error: err.message, code: 'EINTERNAL' };
  }
}

/**
 * File → "Restore from Backup…" (admin only). Renderer bundle is applied
 * live; the SQLite file is staged and swapped in on the next launch.
 */
async function doRestoreFromBackup() {
  const s = session.current();
  if (!s || !session.hasRole(s, 'admin')) return;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Restore from Backup',
    defaultPath: backup.backupsDir(app.getPath('userData')),
    filters: [{ name: 'Command Center Backup', extensions: ['ccbackup'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths || !filePaths.length) return;
  const sourcePath = filePaths[0];

  let contents;
  try {
    contents = backup.readBackupFile(sourcePath);
  } catch (err) {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Restore failed',
      message: 'This file is not a valid Command Center backup.',
      detail: err.message,
    });
    return;
  }

  const m = contents.manifest;
  const choice = dialog.showMessageBoxSync(mainWindow, {
    type: 'warning',
    buttons: ['Cancel', 'Restore'],
    defaultId: 0,
    cancelId: 0,
    title: 'Restore from Backup',
    message: 'Restore Command Center from this backup?',
    detail:
      `File: ${sourcePath}\n` +
      `Created: ${m.ts || 'unknown'}${m.username ? ` by ${m.username}` : ''}\n` +
      `Contains: SQLite database${contents.rendererJson ? ' + dashboard data' : ''}\n\n` +
      'This REPLACES current data. Dashboard data is restored immediately; ' +
      'the user/audit database is swapped in on the next launch.',
  });
  if (choice !== 1) return;

  try {
    backup.stageDatabaseRestore({
      userDataDir: app.getPath('userData'),
      dbBuffer: contents.dbBuffer,
      sourcePath,
    });
    let rendererStats = null;
    if (contents.rendererJson) {
      rendererStats = await backup.applyRendererRestore(mainWindow, contents.rendererJson);
    }
    auditEvent('backup.restore', {
      filePath: sourcePath,
      manifestTs: m.ts || null,
      rendererData: !!contents.rendererJson,
      rendererError: rendererStats && rendererStats.error ? rendererStats.error : null,
      dbStaged: true,
    });
    const restart = dialog.showMessageBoxSync(mainWindow, {
      type: 'info',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Restore staged',
      message: 'Restore is ready.',
      detail:
        (contents.rendererJson
          ? rendererStats && rendererStats.error
            ? `Dashboard data was NOT applied (${rendererStats.error}).\n`
            : 'Dashboard data has been restored.\n'
          : 'This backup contains no dashboard data.\n') +
        'The user/audit database will be swapped in the next time Command Center starts.',
    });
    if (restart === 0) {
      app.relaunch();
      app.quit();
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reload();
    }
  } catch (err) {
    console.error('[backup] restore failed:', err);
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Restore failed',
      message: 'Could not restore from this backup.',
      detail: err.message,
    });
  }
}

/**
 * Post-login scheduled backup: once per process, if the backups table shows
 * nothing within 24h, write a silent auto backup and prune to the newest 14.
 */
/** config.json backup.intervalHours as milliseconds (default 6h). */
function autoBackupIntervalMs() {
  const hours = Number(config && config.backup && config.backup.intervalHours);
  return Number.isFinite(hours) && hours > 0 ? hours * 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
}

/**
 * Run one due-checked auto backup (no-op when the newest backup is younger
 * than `intervalMs`). Shared by the post-login check, the hourly re-check,
 * and the window-close backup.
 * @param {number} intervalMs due threshold
 * @returns {Promise<void>}
 */
function runAutoBackup(intervalMs) {
  const s = session.current();
  // QA-fix: on the sign-in page there is no renderer data to bundle — a backup written then is a DB-only
  // file that counts against `keep`, postpones the next real backup by a full interval and can prune real ones.
  if (!s) return Promise.resolve();
  return backup
    .maybeAutoBackup({
      storage,
      win: mainWindow,
      userDataDir: app.getPath('userData'),
      username: s ? s.username : null,
      appVersion: app.getVersion(),
      intervalMs,
      keep: Number(config && config.backup && config.backup.keep) || undefined,
    })
    .then((result) => {
      if (!result) return; // not due
      storage.backups.record({ userId: s ? s.userId : null, filePath: result.filePath, kind: 'auto' });
      auditEvent('backup.auto', { filePath: result.filePath, rendererData: result.hasRendererData });
      console.log('[backup] auto backup written:', result.filePath);
    })
    .catch((err) => console.error('[backup] auto backup failed:', err.message));
}

function scheduleAutoBackupCheck() {
  if (autoBackupChecked) return;
  autoBackupChecked = true;
  // Small delay so the just-loaded dashboard finishes its own boot work.
  setTimeout(() => runAutoBackup(autoBackupIntervalMs()), 2000);
  // Long-running sessions: the old behavior checked ONCE per process, so an
  // app left open for days never wrote a new backup. Re-check every hour;
  // maybeAutoBackup's due-check makes the no-op case a single DB read.
  setInterval(() => runAutoBackup(autoBackupIntervalMs()), 60 * 60 * 1000);
  // District Sync heartbeat: first write shortly after the dashboard loads,
  // then hourly. No-op unless config.districtSync.folder is set.
  setTimeout(writeDistrictActivity, 15000);
  setInterval(writeDistrictActivity, 60 * 60 * 1000);
}

/**
 * Gather the renderer's counts-only compliance summary (null on the login
 * page) and write this user's District Sync activity file. Never throws.
 */
async function writeDistrictActivity() {
  try {
    if (!districtSync.enabled(config)) return;
    const s = session.current();
    if (!s) return;
    let summary = null;
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        summary = await mainWindow.webContents.executeJavaScript(
          '(async function(){' +
            ' if (typeof window.__ipalActivitySummary !== "function") return null;' +
            ' try { return await window.__ipalActivitySummary(); } catch(e){ return null; }' +
            '})()',
          true
        );
      }
    } catch (_e) { /* login page / page busy — heartbeat still written */ }
    healDistrictSync();
    // owner's machine only (config.districtSync.createFolder): drop the marker so staff apps recognise the folder
    try { if (districtSync.ensureMarker(config, { owner: s.username, name: config.districtSync && config.districtSync.folder })) console.log('[district-sync] marker written'); } catch (_e) { /* optional */ }
    districtSync.writeActivity({
      config,
      username: s.username,
      displayName: s.displayName,
      roles: (s.roles || []).map((r) => r && r.role).filter(Boolean),
      appVersion: app.getVersion(),
      summary,
    });
  } catch (err) {
    console.warn('[district-sync] activity write failed:', err.message);
  }
}

// ------------------------------------------------------------ display zoom ---
// 0.2.42: per-DISPLAY zoom (src/displayFit.js). Chromium's zoomFactor is per
// page, so it is re-applied on every load AND whenever the window moves to a
// different screen, is resized, or a screen's size/scale changes. 'auto' fits
// the window's own content area (width first, with a height guard); a Ctrl +/-
// choice is remembered for THAT kind of screen only (config.json
// display.zoomByDisplay["1920x1080@1.25"]) and Ctrl+0 / "Auto-Fit" returns
// that screen to automatic. The page is told each time (display:fit) so it can
// show a one-line hint and switch to its compact layout.

const ZOOM_MIN = displayFit.ZOOM_MIN;
const ZOOM_MAX = displayFit.ZOOM_MAX;
const ZOOM_STEP = displayFit.STEP;
let lastFit = null; // { key, zoom, mode }

function currentDisplay(win) {
  try { return screen.getDisplayMatching(win.getBounds()); } catch (_e) { return null; }
}
function currentDisplayKey(win) { return displayFit.displayKey(currentDisplay(win)); }
function contentSize(win) {
  try { const [width, height] = win.getContentSize(); return { width, height }; } catch (_e) { return { width: 1400, height: 900 }; }
}
function ensureDisplaySetting(win) {
  const key = win ? currentDisplayKey(win) : 'unknown';
  const m = displayFit.migrateLegacy(config.display, key);
  if (m.changed) { config.display = m.setting; persistDisplaySetting(); logger.info('[zoom] display setting migrated to per-screen', JSON.stringify(config.display)); }
  return key;
}
function effectiveZoom(win) {
  if (!win || win.isDestroyed()) return 1;
  const key = ensureDisplaySetting(win);
  return displayFit.resolveZoom(config.display, key, contentSize(win)).zoom;
}
function zoomMode(win) {
  if (!win || win.isDestroyed()) return 'auto';
  return displayFit.resolveZoom(config.display, ensureDisplaySetting(win), contentSize(win)).mode;
}
/** renderer/login.html is a small centred card built for 100 % — the dashboard's zoom would shrink it (seen at 70 %). */
function isLoginPage(win) {
  try { return /[\\/]renderer[\\/]login\.html/i.test(String(win.webContents.getURL() || '')); } catch (_e) { return false; }
}
function applyZoom(win, why) {
  if (!win || win.isDestroyed()) return;
  try {
    if (isLoginPage(win)) { try { win.webContents.setZoomFactor(1); } catch (_e) { /* mid-navigation */ } return; }
    const key = ensureDisplaySetting(win);
    const size = contentSize(win);
    const r = displayFit.resolveZoom(config.display, key, size);
    const d = currentDisplay(win);
    try { win.webContents.setZoomFactor(r.zoom); } catch (_e) { /* page may be mid-navigation */ }
    const changed = !lastFit || lastFit.key !== key || lastFit.zoom !== r.zoom || lastFit.mode !== r.mode;
    lastFit = { key, zoom: r.zoom, mode: r.mode };
    if (changed) logger.info('[zoom] ' + (why || 'apply') + ' screen=' + key + ' content=' + size.width + 'x' + size.height + ' zoom=' + r.zoom + ' (' + r.mode + ')');
    try {
      win.webContents.send('display:fit', { zoom: r.zoom, mode: r.mode, key, changed, screen: d ? { width: d.bounds.width, height: d.bounds.height, scaleFactor: d.scaleFactor } : null, content: size });
    } catch (_e) { /* best effort */ }
  } catch (err) {
    console.error('[zoom] apply failed:', err.message);
  }
}
function persistDisplaySetting() {
  try {
    const { cfg } = readConfigJson(config.configPath);
    cfg.display = config.display;
    fs.writeFileSync(config.configPath, JSON.stringify(cfg, null, 2));
  } catch (err) {
    console.error('[zoom] could not persist zoom setting:', err.message);
  }
}
/** value: number (manual for THIS screen) | 'auto' (this screen back to automatic). */
function saveZoomSetting(value) {
  const key = mainWindow && !mainWindow.isDestroyed() ? ensureDisplaySetting(mainWindow) : 'unknown';
  const by = Object.assign({}, (config.display && config.display.zoomByDisplay) || {});
  if (value === 'auto') delete by[key]; else by[key] = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(value) || 1));
  config.display = Object.assign({}, config.display, { zoom: 'auto', zoomByDisplay: by });
  persistDisplaySetting();
}
function adjustZoom(delta) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const next = displayFit.stepZoom(effectiveZoom(mainWindow), delta);
  saveZoomSetting(next);
  applyZoom(mainWindow, 'manual');
  refreshMenu(); // update the "Current zoom" indicator
}
function autoFitZoom() { saveZoomSetting('auto'); applyZoom(mainWindow, 'auto-fit'); refreshMenu(); }

// ---- window placement memory (userData/window-state.json) ----
function windowStatePath() { return path.join(app.getPath('userData'), 'window-state.json'); }
function readWindowState() { try { return JSON.parse(fs.readFileSync(windowStatePath(), 'utf8')); } catch (_e) { return null; } }
let saveStateTimer = null;
function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(() => {
    try {
      if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
      const prev = readWindowState() || {};
      const st = { maximized: win.isMaximized(), bounds: win.isMaximized() ? (prev.bounds || win.getNormalBounds()) : win.getBounds(), savedAt: new Date().toISOString() };
      fs.writeFileSync(windowStatePath(), JSON.stringify(st, null, 2));
    } catch (_e) { /* best effort */ }
  }, 400);
}
/** After a monitor is unplugged the window can be left on a screen that no longer exists. */
function keepOnScreen(win) {
  try {
    if (!win || win.isDestroyed()) return;
    if (displayFit.visibleOn(win.getBounds(), screen.getAllDisplays(), 200)) return;
    const p = displayFit.placeWindow({ displays: screen.getAllDisplays(), cursor: screen.getCursorScreenPoint() });
    logger.info('[window] off-screen after a display change; moving to ' + JSON.stringify(p.bounds));
    win.setBounds(p.bounds); if (p.maximize) win.maximize();
  } catch (_e) { /* best effort */ }
}

/** Rebuild the application menu to match the current session's roles. */
function refreshMenu() {
  const s = session.current();
  const isAdmin = !!(s && session.hasRole(s, 'admin'));
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Back Up Now…',
          enabled: !!s,
          click: () => {
            doBackupNow().catch((err) => console.error('[main] backup failed:', err));
          },
        },
        {
          label: 'Restore from Backup…',
          enabled: isAdmin,
          click: () => {
            doRestoreFromBackup().catch((err) => console.error('[main] restore failed:', err));
          },
        },
        {
          label: 'Open Backups Folder',
          click: () => {
            const dir = backup.backupsDir(app.getPath('userData'));
            fs.mkdirSync(dir, { recursive: true });
            shell.openPath(dir).catch((err) => console.error('[main] openPath failed:', err));
          },
        },
        { type: 'separator' },
        {
          label: 'Logout',
          enabled: !!s,
          click: () => {
            doLogout().catch((err) => console.error('[main] logout failed:', err));
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: 'Admin',
      submenu: [
        {
          label: 'User Management…',
          enabled: isAdmin,
          click: () => openAdminWindow('admin'),
        },
        {
          label: 'Audit Log…',
          enabled: isAdmin,
          click: () => openAdminWindow('audit'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: `Current zoom: ${mainWindow && !mainWindow.isDestroyed() ? Math.round(effectiveZoom(mainWindow) * 100) : 100}%${mainWindow && !mainWindow.isDestroyed() && zoomMode(mainWindow) === 'manual' ? ' (set by you for this screen)' : ' (auto-fit to this screen)'}`,
          enabled: false,
        },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => adjustZoom(ZOOM_STEP) },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => adjustZoom(-ZOOM_STEP) },
        {
          label: 'Auto-Fit to This Screen',
          accelerator: 'CmdOrCtrl+0',
          click: () => autoFitZoom(),
        },
        {
          label: 'Actual Size (100%)',
          click: () => { saveZoomSetting(1); applyZoom(mainWindow, 'manual'); refreshMenu(); },
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        // 0.2.41: what is this machine running, and when did it last look for an update? (readable in a screenshot)
        (() => {
          const u = updaterCtl ? updaterCtl.getState() : null;
          let when = '';
          try { if (u && u.lastCheckAt) when = ' · ' + new Date(u.lastCheckAt).toLocaleString(); } catch (_e) { /* ignore */ }
          return { label: `Version ${app.getVersion()} — update check: ${u ? u.lastResult : 'not started'}${when}`, enabled: false };
        })(),
        { label: 'Check for updates now', enabled: !!(updaterCtl && updaterCtl.enabled), click: () => { try { updaterCtl.checkNow(); } catch (_e) { /* silent */ } } },
        { label: 'Install downloaded update…', enabled: !!(updaterCtl && updaterCtl.getState().downloadedVersion), click: () => { try { updaterCtl.installDownloaded(); } catch (_e) { /* silent */ } } },
        { type: 'separator' },
        { label: 'Repair Command Center…', click: () => { showRepairDialog(['repair requested from the Help menu'], { fatal: false }); } },
        { label: 'Create desktop shortcut', enabled: process.platform === 'win32' && app.isPackaged, click: () => { const ok = createDesktopShortcut(); dialog.showMessageBox(mainWindow, { type: ok ? 'info' : 'warning', title: 'Desktop shortcut', message: ok ? 'The Command Center shortcut is on your desktop.' : 'The shortcut could not be created.', detail: ok ? 'To pin it to Start or the taskbar: right-click the shortcut and choose "Pin to Start" or "Pin to taskbar" (Windows does not let apps do that for you).' : 'See Help > Open log folder for details.' }); } },
        { label: 'Open log folder', click: () => { try { shell.openPath(logger.logDir() || app.getPath('userData')); } catch (_e) { /* best effort */ } } },
        { type: 'separator' },
        {
          label: 'About Command Center',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Command Center',
              message: 'Command Center Desktop',
              detail:
                `Version ${app.getVersion()}\n` +
                'Electron desktop wrapper for the Command Center school dashboard.\n' +
                (s ? `Signed in as ${s.displayName} (${s.roles.map((r) => r.role).join(', ')})` : 'Not signed in.'),
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * Version-change audit: app_settings keeps the version that last ran; when it
 * differs from app.getVersion() (i.e. an update was applied), write an
 * 'app.updated' audit row {from, to}. The setting is district-independent in
 * spirit — the adapter's app_settings PK is (district_id, key), so we store
 * it under the FIRST district's id, which is stable for this single-district
 * deployment. Before any district exists (fresh install) there is nothing to
 * compare, so it is a no-op until first-run setup creates one.
 */
function auditVersionChange() {
  try {
    const first = storage.districts.list()[0];
    if (!first) return;
    const KEY = 'app.lastRunVersion';
    const previous = storage.settings.get(first.id, KEY);
    const current = app.getVersion();
    if (previous && previous !== current) {
      storage.audit.log({
        districtId: first.id,
        userId: null,
        username: null,
        eventType: 'app.updated',
        detail: { from: previous, to: current },
      });
      console.log(`[main] app updated: v${previous} -> v${current}`);
    }
    if (previous !== current) storage.settings.set(first.id, KEY, current);
  } catch (err) {
    console.error('[main] version-change audit failed:', err.message);
  }
}

/**
 * Behaviors every app window needs but Electron doesn't provide by default:
 *
 * 1. External links: the HTML app opens emails with location.href='mailto:…'
 *    and has ordinary web links. In Electron that is a NAVIGATION — it tore
 *    the user away from the app (triggering the close-confirm guard) and
 *    never reached the mail client. Hand anything that isn't the app's own
 *    file:// pages to the OS instead. window.open() with a real external URL
 *    gets the same treatment, while the app's print-report windows
 *    (window.open('') + document.write) keep working in-app.
 *
 * 2. Right-click menu: Electron has NO built-in context menu, so selected
 *    text had no Copy. Show a native Cut/Copy/Paste menu based on what was
 *    right-clicked.
 */
function wireWindowWebContents(win) {
  const wc = win.webContents;

  // v0.2.36: every mailto the page opens (single or bulk BCC) is echoed back
  // to the page as 'mail:opened' so the ALE review queue can record who was
  // emailed and about what. Main never parses or stores the addresses.
  const notifyMail = (url) => {
    try { if (/^mailto:/i.test(url) && !wc.isDestroyed() && session.current()) wc.send('mail:opened', { url, at: new Date().toISOString() }); } catch (_e) { /* best effort */ }
  };

  wc.on('will-navigate', (event, url) => {
    if (!/^file:/i.test(url)) {
      event.preventDefault();
      if (/^(mailto|tel|https?):/i.test(url)) {
        notifyMail(url);
        shell.openExternal(url).catch((err) => console.error('[main] openExternal failed:', err.message));
      }
    }
  });

  wc.setWindowOpenHandler(({ url }) => {
    // Empty/about:blank = the app's own print-report windows — allow.
    if (!url || url === 'about:blank' || /^(file|blob|data):/i.test(url)) {
      return { action: 'allow' };
    }
    if (/^(mailto|tel|https?):/i.test(url)) {
      notifyMail(url);
      shell.openExternal(url).catch((err) => console.error('[main] openExternal failed:', err.message));
    }
    return { action: 'deny' };
  });

  wc.on('context-menu', (_event, params) => {
    const template = [];
    if (params.isEditable) {
      template.push(
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll' }
      );
    } else if (params.selectionText && params.selectionText.trim()) {
      template.push({ role: 'copy' });
    }
    if (template.length) {
      Menu.buildFromTemplate(template).popup({ window: win });
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    title: 'Command Center',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  // 0.2.42: open where the person is working (remembered bounds if still on a
  // screen, else the screen under the mouse), maximized on small screens.
  try {
    const p = displayFit.placeWindow({ displays: screen.getAllDisplays(), cursor: screen.getCursorScreenPoint(), saved: readWindowState() });
    mainWindow.setBounds(p.bounds);
    if (p.maximize) mainWindow.maximize();
    logger.info('[window] placed (' + p.reason + ') ' + JSON.stringify(p.bounds) + (p.maximize ? ' maximized' : ''));
  } catch (_e) { /* sizing is best-effort */ }
  mainWindow.once('ready-to-show', () => { mainWindow.show(); applyZoom(mainWindow, 'ready'); });
  // Display zoom — zoomFactor is per-page in Chromium, so re-apply after every
  // navigation/reload, and re-fit whenever the window changes screen or size.
  mainWindow.webContents.on('did-finish-load', () => applyZoom(mainWindow, 'load'));
  let refitTimer = null;
  const refit = (why) => { clearTimeout(refitTimer); refitTimer = setTimeout(() => { applyZoom(mainWindow, why); refreshMenu(); }, 180); saveWindowState(mainWindow); };
  mainWindow.on('move', () => refit('move'));
  mainWindow.on('resize', () => refit('resize'));
  mainWindow.on('maximize', () => refit('maximize'));
  mainWindow.on('unmaximize', () => refit('unmaximize'));
  mainWindow.on('enter-full-screen', () => refit('full-screen'));
  mainWindow.on('leave-full-screen', () => refit('windowed'));
  const onDisplays = (why) => () => { keepOnScreen(mainWindow); refit(why); };
  screen.on('display-metrics-changed', onDisplays('display-metrics-changed'));
  screen.on('display-added', onDisplays('display-added'));
  screen.on('display-removed', onDisplays('display-removed'));
  // 0.2.41: ANY failed load of a local file gets the repair dialog with the failing path,
  // never a raw ERR_FAILED box. (-3 = ERR_ABORTED: a navigation we replaced ourselves.)
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    try {
      if (!isMainFrame || code === -3 || !/^file:/i.test(String(url || ''))) return;
      console.error('[main] did-fail-load', code, desc, url);
      showRepairDialog(['a page of the app could not be loaded (' + desc + ' ' + code + '): ' + url], { fatal: !session.current() });
    } catch (_err) { /* never throw from an event */ }
  });
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[main] render-process-gone', details && details.reason, details && details.exitCode);
  });
  // Zoom shortcuts that work no matter what (0.2.40): the menu bar is hidden
  // and its accelerators only matched Ctrl+= — not the "+" key (Ctrl+Shift+=),
  // not the numpad, and Ctrl+mouse-wheel was never handled at all.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return;
    const k = input.key, c = input.code;
    if (k === '=' || k === '+' || c === 'NumpadAdd') { event.preventDefault(); adjustZoom(ZOOM_STEP); }
    else if (k === '-' || k === '_' || c === 'NumpadSubtract') { event.preventDefault(); adjustZoom(-ZOOM_STEP); }
    else if (k === '0' || c === 'Numpad0') { event.preventDefault(); autoFitZoom(); }
  });
  mainWindow.webContents.on('zoom-changed', (_event, direction) => {
    if (direction === 'in') adjustZoom(ZOOM_STEP * 2);
    else if (direction === 'out') adjustZoom(-ZOOM_STEP * 2);
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  // Quit-time safety net: write a final backup while the page can still hand
  // over its data (before-quit is too late — the window is already gone).
  // Due threshold 1h so a close right after the periodic backup is a no-op.
  // Skipped during update-quits (the installer is already spawning) and
  // capped at 5s so a hung gather can never trap the user in the app.
  // Time-latch, not a boolean: if the user clicks X, then picks "Stay" in the
  // close-guard dialog, a boolean would silently skip the backup on every
  // later close. Within 60s the re-entrant close() passes straight through.
  let lastCloseBackupAt = 0;
  mainWindow.on('close', (e) => {
    if (Date.now() - lastCloseBackupAt < 60000) return;
    if (app.isQuittingForUpdate) return;
    if (config && config.backup && config.backup.backupOnQuit === false) return;
    lastCloseBackupAt = Date.now();
    e.preventDefault();
    const proceed = () => {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
      } catch (_) {}
    };
    Promise.race([
      // final backup + a fresh District Sync heartbeat, capped at 5s
      Promise.allSettled([runAutoBackup(60 * 60 * 1000), writeDistrictActivity()]),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]).then(proceed, proceed);
  });
  wireWindowWebContents(mainWindow);
  // The Command Center HTML app registers a beforeunload guard ("are you sure
  // you want to close?"). Browsers show a confirm dialog for that; Electron
  // instead SILENTLY refuses to close the window unless we handle this event.
  // Show a native confirm; choosing Close overrides the guard.
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    // Update-driven quit (updater.js sets this right before quitAndInstall):
    // the installer is already spawning — asking "Close Command Center?"
    // here blocked the quit and made NSIS fail on the running app's files.
    // Main-initiated navigation (logout/login page switches via navigate())
    // is likewise always intentional — never show the close dialog for it.
    if (app.isQuittingForUpdate || app.isNavigatingMainWindow || app.isQuitting) {
      event.preventDefault(); // allow the unload/close
      return;
    }
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['Stay', 'Close Command Center'],
      defaultId: 0,
      cancelId: 0,
      title: 'Close Command Center',
      message: 'Close Command Center?',
      detail: 'Your imported data is saved automatically in this app — nothing will be lost.',
    });
    if (choice === 1) event.preventDefault(); // preventing this event ALLOWS the close
  });
  return mainWindow;
}

/**
 * Navigate the main window. 'login' -> renderer/login.html,
 * 'app' -> config.appHtmlPath (the Command Center HTML application).
 */
async function navigate(page) {
  refreshMenu(); // keep menu enablement in sync with the session on every transition
  if (page === 'login') closeAdminWindows();
  if (!mainWindow) return;
  // Main-initiated page switches (logout -> login, login -> app) are always
  // intentional and lose no data (everything is persisted). Without this
  // flag the dashboard's beforeunload guard turned LOGOUT into a confusing
  // "Close Command Center?" dialog — and choosing "Stay" cancelled the page
  // switch AFTER the session was already cleared, wedging the app. The
  // will-prevent-unload handler auto-allows the unload while this is set.
  app.isNavigatingMainWindow = true;
  try {
    if (page === 'app') {
      if (!fs.existsSync(config.appHtmlPath)) {
        console.error('[main] appHtmlPath not found:', config.appHtmlPath);
        await mainWindow.loadFile(path.join(__dirname, 'renderer', 'login.html'), {
          query: { error: 'apphtml-missing' },
        });
        return;
      }
      await mainWindow.loadFile(config.appHtmlPath);
      scheduleAutoBackupCheck(); // 24h scheduled auto-backup, once per process
      startMessagesWatch(); // staff messages for the signed-in user
      maybeOfferDesktopShortcut(); // 0.2.41: shortcut gone? offer it once (7-day snooze)
    } else {
      stopMessagesWatch();
      await mainWindow.loadFile(path.join(__dirname, 'renderer', 'login.html'));
    }
  } finally {
    app.isNavigatingMainWindow = false;
  }
}

/**
 * Remove a STALE staged auto-update (staged version <= installed version).
 * How it happens: AV interrupts the silent update install, the user fixes it
 * by running the installer manually, but the staged marker survives — and
 * from then on every launch detours into a pointless silent re-install
 * instead of opening the app ("the icon does nothing"). Happened live with
 * 0.2.3 and again with 0.2.8. A staged NEWER version is left alone.
 */
function cleanStaleStagedUpdate() {
  try {
    const base = process.env.LOCALAPPDATA;
    if (!base) return;
    // electron-updater's cache folder is named from app-update.yml's
    // updaterCacheDirName (package "name", i.e. command-center-desktop-updater)
    // — NOT from productName ("Command Center"), which app.getName() returns.
    let cacheName = 'command-center-desktop-updater';
    try {
      const yml = fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8');
      const m = yml.match(/^updaterCacheDirName:\s*(.+)$/m);
      if (m && m[1].trim()) cacheName = m[1].trim();
    } catch (_e) { /* dev run or missing yml: use the default */ }
    const cacheDir = path.join(base, cacheName);
    const infoPath = path.join(cacheDir, 'pending', 'update-info.json');
    if (!fs.existsSync(infoPath)) return;
    const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
    const m = String(info.fileName || '').match(/(\d+)\.(\d+)\.(\d+)/);
    if (!m) return;
    const staged = [Number(m[1]), Number(m[2]), Number(m[3])];
    const cur = String(app.getVersion()).split('.').map(Number);
    const cmp = staged[0] - cur[0] || staged[1] - cur[1] || staged[2] - cur[2];
    if (cmp <= 0) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
      console.log(`[updater] removed stale staged update ${info.fileName} (installed: ${app.getVersion()})`);
    }
  } catch (err) {
    console.warn('[updater] stale-staging check failed:', err.message);
  }
}

// ------------------------------------------------ 0.2.41 repair / guards ---
// See src/updateGuard.js for the 2026-09-17 incident this answers.
let repairDialogShown = false;
let updaterCtl = null; // { checkNow, installDownloaded, getState } from initAutoUpdate

/** Run a cached, signature-verified installer (with its progress window) or open the download page. */
function repairNow() {
  try {
    const file = updateGuard.findCachedInstaller({});
    if (file) {
      const v = updateGuard.verifyInstaller(file, { minVersion: app.getVersion() });
      console.log('[repair] cached installer', file, JSON.stringify(v));
      if (v.ok) {
        updateGuard.markInstalling(app.getPath('userData'), { version: v.version, source: 'repair' });
        updateGuard.runInstaller(file);
        app.isQuittingForUpdate = true;
        setTimeout(() => app.quit(), 300);
        return 'installer';
      }
    } else console.log('[repair] no cached installer');
  } catch (err) { console.error('[repair] failed:', err.message); }
  try { shell.openExternal(updateGuard.RELEASES_URL); } catch (_e) { /* best effort */ }
  return 'download-page';
}

/** One plain dialog instead of a raw ERR_FAILED box. fatal=true quits afterwards. */
async function showRepairDialog(problems, { fatal = false } = {}) {
  if (repairDialogShown) return;
  repairDialogShown = true;
  console.error('[repair] dialog:', (problems || []).join(' | '));
  try {
    const parent = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() ? mainWindow : undefined;
    const { response } = await dialog.showMessageBox(parent, {
      type: 'warning',
      title: 'Command Center needs to be repaired',
      message: 'Command Center needs to be repaired',
      detail:
        'A file in the installation is missing or damaged. Your imported data and backups are safe — they live in ' +
        app.getPath('userData') + ' and are not touched by reinstalling.\n\n' +
        'Repair now: runs the newest installer already on this computer (if there is one), otherwise opens the download page.\n' +
        'Download installer: opens the download page — close Command Center, run the setup file, open Command Center.\n\n' +
        'Details: ' + ((problems || []).join('; ') || 'unknown'),
      buttons: ['Repair now', 'Download installer', 'Close'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    if (response === 0) {
      const how = repairNow();
      if (how === 'download-page') await dialog.showMessageBox(parent, { type: 'info', title: 'Download page opened', message: 'The download page is open in your browser.', detail: '1. Close Command Center.\n2. Run the setup file you download.\n3. Open Command Center.\n\nYour data is not lost by reinstalling.' });
      else return; // installer started; the app is quitting
    } else if (response === 1) {
      try { shell.openExternal(updateGuard.RELEASES_URL); } catch (_e) { /* best effort */ }
    }
  } catch (err) { console.error('[repair] dialog failed:', err.message); }
  repairDialogShown = false;
  if (fatal) app.quit();
}

/** Before anything else: wait out a running installer; verify the install. Returns 'quit' when the app must not continue. */
async function startupGuards() {
  const userData = app.getPath('userData');
  try {
    if (updateGuard.installingIsFresh(userData)) {
      const marker = updateGuard.readState(userData).installing || {};
      if (updateGuard.updateFinished(userData, app.getVersion())) {
        // 0.2.46: we ARE the version the installer was putting in place — the update is done, even though the
        // installer process that launched us may still be exiting. (0.2.41–0.2.45 turned this launch away.)
        console.log('[main] update to v' + marker.version + ' finished — this is v' + app.getVersion() + '; clearing the installing marker');
        updateGuard.clearInstalling(userData);
      } else if (updateGuard.installerRunning({})) {
        // an OLD version was started (shortcut / autostart) while the installer is still working: wait it out, then relaunch
        console.warn('[main] an installer is still running (target v' + (marker.version || '?') + ', this is v' + app.getVersion() + ') — waiting for it, then relaunching');
        const waitWin = showUpdateWaitWindow();
        const gone = await updateGuard.waitForInstaller({ maxMs: 4 * 60 * 1000, stepMs: 3000 });
        try { if (waitWin && !waitWin.isDestroyed()) waitWin.close(); } catch (_e) { /* ignore */ }
        if (gone) {
          console.log('[main] installer finished — relaunching Command Center');
          updateGuard.clearInstalling(userData);
          app.relaunch();
          return 'quit';
        }
        const r = await dialog.showMessageBox({ type: 'warning', title: 'Command Center is updating', buttons: ['Open anyway', 'Quit'], defaultId: 1, cancelId: 1, message: 'The update is taking longer than expected.', detail: 'An installer window still seems to be open after 4 minutes. If you can see it, let it finish and open Command Center afterwards. If there is no installer window, choose Open anyway.' });
        if (r.response !== 0) return 'quit';
        updateGuard.clearInstalling(userData);
      } else {
        updateGuard.clearInstalling(userData);
      }
    }
  } catch (err) { console.warn('[main] installer check failed:', err.message); }
  const check = updateGuard.selfCheck({ resourcesPath: process.resourcesPath, entryHtml: path.join(__dirname, 'renderer', 'login.html'), packaged: app.isPackaged });
  console.log('[main] self-check:', check.ok ? 'ok' : check.problems.join(' | '));
  if (!check.ok) { await showRepairDialog(check.problems, { fatal: true }); return 'quit'; }
  return 'ok';
}

/** 0.2.46: a small, closable "finishing the update" window shown while we wait for the installer (never a modal that exits). */
function showUpdateWaitWindow() {
  try {
    const w = new BrowserWindow({ width: 420, height: 170, resizable: false, minimizable: false, maximizable: false, title: 'Command Center is updating', autoHideMenuBar: true, backgroundColor: '#f8fafc', webPreferences: { sandbox: true, contextIsolation: true } });
    const html = '<!doctype html><meta charset="utf-8"><body style="margin:0;font:14px/1.5 Segoe UI,system-ui,sans-serif;color:#0f172a;background:#f8fafc;padding:22px 24px"><div style="font-weight:800;font-size:16px;margin-bottom:6px">Finishing the update…</div><div>Command Center will reopen by itself in about a minute. You can leave this window alone.</div><div style="margin-top:12px;color:#64748b;font-size:12px">If nothing happens after a few minutes, open Command Center from the desktop shortcut.</div></body>';
    w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    return w;
  } catch (_e) { return null; }
}

// ------------------------------------------------ 0.2.41 desktop shortcut ---
function desktopShortcutFile() { return updateGuard.desktopShortcutPath(app.getPath('desktop')); }
function createDesktopShortcut() {
  if (process.platform !== 'win32') return false;
  try {
    const file = desktopShortcutFile();
    const ok = shell.writeShortcutLink(file, fs.existsSync(file) ? 'replace' : 'create', { target: process.execPath, icon: process.execPath, iconIndex: 0, description: 'Command Center', appUserModelId: 'com.commandcenter.desktop' });
    console.log('[shortcut] desktop shortcut', ok ? 'written' : 'NOT written', file);
    return ok;
  } catch (err) { console.error('[shortcut] failed:', err.message); return false; }
}
let shortcutOfferedThisRun = false;
/** After sign-in: if the desktop shortcut is gone, offer it once (snooze 7 days; a new version asks again). */
function maybeOfferDesktopShortcut() {
  try {
    if (shortcutOfferedThisRun || !app.isPackaged || process.platform !== 'win32') return;
    shortcutOfferedThisRun = true;
    const userData = app.getPath('userData');
    const st = updateGuard.readState(userData);
    const exists = fs.existsSync(desktopShortcutFile());
    const offer = updateGuard.shouldOfferShortcut({ exists, snoozedUntil: st.shortcutSnoozedUntil, lastAskedVersion: st.shortcutAskedVersion, currentVersion: app.getVersion() });
    if (exists || !offer) { if (st.shortcutAskedVersion !== app.getVersion()) updateGuard.writeState(userData, { shortcutAskedVersion: app.getVersion() }); return; }
    setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      dialog.showMessageBox(mainWindow, { type: 'question', title: 'Desktop shortcut', message: 'Add a Command Center shortcut to your desktop?', detail: 'The shortcut is missing from your desktop. You can also add it any time from Help > Create desktop shortcut.', buttons: ['Add shortcut', 'Not now'], defaultId: 0, cancelId: 1, noLink: true })
        .then(({ response }) => {
          if (response === 0) createDesktopShortcut();
          updateGuard.writeState(userData, { shortcutAskedVersion: app.getVersion(), shortcutSnoozedUntil: response === 0 ? null : Date.now() + updateGuard.SHORTCUT_SNOOZE_MS });
        }).catch(() => {});
    }, 6000);
  } catch (err) { console.warn('[shortcut] offer failed:', err.message); }
}

// reachable before sign-in (the link on the sign-in screen) — it only opens our own dialog
ipcMain.handle('display:get', async () => { const w = mainWindow; if (!w || w.isDestroyed()) return null; return { zoom: effectiveZoom(w), mode: zoomMode(w), key: currentDisplayKey(w), content: contentSize(w) }; });
ipcMain.handle('display:setZoom', async (_e, payload) => {
  const v = payload && payload.value;
  if (v === 'auto') autoFitZoom();
  else if (v === 'in') adjustZoom(ZOOM_STEP);
  else if (v === 'out') adjustZoom(-ZOOM_STEP);
  else if (typeof v === 'number' && Number.isFinite(v)) { saveZoomSetting(v); applyZoom(mainWindow, 'manual'); refreshMenu(); }
  return { ok: true, zoom: effectiveZoom(mainWindow), mode: zoomMode(mainWindow) };
});
ipcMain.handle('app:repair', async () => { showRepairDialog(['repair requested from the sign-in screen'], { fatal: false }); return { ok: true }; });

async function boot() {
  if ((await startupGuards()) === 'quit') { app.quit(); return; }
  config = loadConfig();
  cleanStaleStagedUpdate();

  // A restore staged by "Restore from Backup…" is applied here, BEFORE the
  // live DB is opened (it cannot be swapped while better-sqlite3 holds it).
  restoreAppliedAtBoot = backup.applyPendingDatabaseRestore({
    userDataDir: app.getPath('userData'),
    dbPath: config.dbPath,
  });

  // Phase 2B: encrypt the database at rest. The key is random, DPAPI-bound
  // to this Windows profile (src/dbkey.js), and a pre-2B plaintext DB (or a
  // just-restored plaintext backup) is encrypted in place on open. Key
  // errors are fatal but carry recovery instructions — show them.
  let encryptionKey = null;
  let unencryptedFallback = false;
  if (!config.encryption || config.encryption.enabled !== false) {
    try {
      encryptionKey = getDbEncryptionKey(app.getPath('userData'));
      if (!encryptionKey) {
        // v0.2.37 (S10): never silent. The admin sees it, and it is in the audit trail.
        console.warn('[storage] OS keychain unavailable — database stays unencrypted');
        unencryptedFallback = true;
        try {
          dialog.showMessageBox({ type: 'warning', title: 'Command Center — database not encrypted', message: 'Windows could not provide the encryption key for this profile, so the student database on this computer is NOT encrypted.', detail: 'The app still works. Keep this computer locked and tell the Command Center admin. This warning appears at every start until Windows Data Protection is available again.', buttons: ['I understand'] }).catch(() => {});
        } catch (_e) { /* best effort */ }
      }
    } catch (err) {
      dialog.showErrorBox('Command Center — database locked', err.message);
      err.__shownToUser = true; // the global boot catch must not re-show it
      throw err;
    }
  }

  storage = new SqliteAdapter({ dbPath: config.dbPath, encryptionKey });
  await storage.init();
  if (unencryptedFallback) { try { auditEvent('storage.unencrypted_fallback', { reason: 'safeStorage unavailable' }); } catch (_e) { /* best effort */ } }

  if (restoreAppliedAtBoot) {
    auditEvent('backup.restore', { phase: 'applied', dbPath: config.dbPath });
  }

  registry.createProviders(config, storage);

  // Local AI backend (AiProvider interface — swap implementations here).
  const ai = new LocalLlamaProvider({ config, userDataDir: app.getPath('userData') });
  // Local speech-to-text for voice contact logging (Whisper via
  // @huggingface/transformers, model cached under <userData>/models/whisper).
  const voice = createVoice({ userDataDir: app.getPath('userData'), onAudit: auditEvent });

  // License: cached revocations first (works offline), fresh check ~20s in,
  // then every 12h — an app left open across its expiry date locks too.
  revokedIds = loadRevokedCache();
  evaluateLicenseNow();
  setTimeout(refreshLicense, 20 * 1000);
  setInterval(refreshLicense, 12 * 60 * 60 * 1000);

  startAleSync();
  startPortals();
  registerIpcHandlers({
    storage, config, navigate, runBackupNow: doBackupNow, ai, voice,
    getLicenseState: () => licenseEval,
    onLicenseChanged,
    aleSync, edgenuity, laserfiche,
    onSessionLogin: portalsLogin, onSessionLogout: portalsLogout,
    // v0.2.32: "Re-scan now" from the Messages panel — also restarts the
    // watcher if it is missing (e.g. the folder shortcut arrived after login)
    messagesRescan: () => {
      if (!messagesWatcher) startMessagesWatch();
      return messagesWatcher && typeof messagesWatcher.scanNow === 'function' ? messagesWatcher.scanNow() : null;
    },
  });

  auditVersionChange();

  createWindow();
  await navigate('login');

  // Auto-update (packaged builds only; first check ~30s after launch so it
  // never blocks startup; all failures are logged and swallowed).
  updaterCtl = initAutoUpdate({ win: mainWindow, config, onAudit: auditEvent, userDataDir: app.getPath('userData'), onStateChanged: () => { try { refreshMenu(); } catch (_e) { /* best effort */ } } });
  try { refreshMenu(); } catch (_e) { /* best effort */ }

  // Downloads watcher (config importWatch.enabled, default on): OS-event
  // driven — no polling, no scanning; when a recognized Edgenuity/ALE CSV
  // lands in Downloads, the page shows an "import this?" offer.
  // Electron resolves the REAL Downloads location (redirects/moved folders).
  try { importWatch.configureDownloadsDir(app.getPath('downloads')); } catch (_e) { /* default */ }
  importWatch.start({
    config,
    onCandidate: (candidate) => {
      try {
        if (mainWindow && !mainWindow.isDestroyed() && session.current()) {
          mainWindow.webContents.send('import-watch:candidate', candidate);
        }
      } catch (_e) { /* best effort */ }
    },
  });

  // AI warm-up (config ai.warmOnLaunch, default on): when the model is
  // already downloaded, load it into memory in the background a few seconds
  // after boot so the first ✨ AI click answers immediately instead of
  // paying the ~1GB model-load wait. Never triggers a download.
  if ((config.ai || {}).warmOnLaunch !== false) {
    setTimeout(async () => {
      try {
        if ((await ai.status()) !== 'ready') return; // no model file yet
        await ai.ensureReady();
        console.log('[ai] engine warmed at startup');
      } catch (err) {
        console.error('[ai] startup warm-up failed (ignored):', err.message);
      }
    }, 5000);
  }
}

// One running copy only. Two copies on the same profile fight over the browser
// database (the second gets "Internal error" on every IndexedDB write and can
// even mistake the locked store for "no data"). A second launch just brings the
// existing window to the front.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
    } catch (_e) { /* best effort */ }
  });
}
app.whenReady().then(boot).catch((err) => {
  console.error('[main] fatal boot error:', err);
  // Never die silently: a teacher double-clicking an app that quits with no
  // UI files a "the icon does nothing" ticket. Every fatal startup error gets
  // a plain-language dialog with the way out. (Errors that already showed
  // their own dialog — e.g. the db.key mismatch — set __shownToUser.)
  // 0.2.41: a page of the install that would not load is a REPAIR case, not a riddle.
  if (err && /ERR_(FAILED|FILE_NOT_FOUND|ACCESS_DENIED|INVALID_URL)/.test(String(err.message || '')) && /loading/i.test(String(err.message || ''))) {
    if (repairDialogShown) return; // did-fail-load already put the dialog up; it quits when answered
    showRepairDialog([String(err.message)], { fatal: true });
    return;
  }
  try {
    if (!err || !err.__shownToUser) {
      dialog.showErrorBox(
        'Command Center could not start',
        (err && err.message ? err.message : 'Unknown error') +
          '\n\nWhat to try: install the newest version of Command Center, then open it again. ' +
          'If it still fails, use File > Restore from Backup after installing. ' +
          'Reinstalling does not delete your imported data or backups.'
      );
    }
  } catch (_e) {}
  app.quit();
});

app.on('window-all-closed', () => {
  session.logout();
  portalsLogout();
  app.quit();
});

app.on('before-quit', () => {
  // QA-fix: an explicit quit (File > Exit, "Restart Now" after a restore) must not be second-guessed by the
  // page's beforeunload guard, and the database must stay OPEN until the window's close handler has written
  // the final backup — it used to be closed here, before the window closed, so that backup always failed
  // ("The database connection is not open") and choosing "Stay" left the app running with no database.
  app.isQuitting = true;
  try { if (aleSync) aleSync.stop(); } catch (_e) { /* best effort */ }
  try { if (edgenuity) edgenuity.stop(); } catch (_e) { /* best effort */ }
  try { if (laserfiche) laserfiche.stop(); } catch (_e) { /* best effort */ }
});

app.on('will-quit', async () => {
  try {
    if (storage) await storage.close();
  } catch (err) {
    console.error('[main] error closing storage:', err.message);
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && app.isReady()) {
    createWindow();
    navigate(session.current() ? 'app' : 'login');
  }
});
