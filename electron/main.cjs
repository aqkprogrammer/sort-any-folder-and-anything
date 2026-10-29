// Photo Sorter — macOS desktop shell (Electron).
// Serves the same web app over app://, gives it native file access through a small IPC bridge,
// renders previews with Quick Look (qlmanage), lives in the menu bar and can auto-sort new downloads.

const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, Tray, Menu, nativeImage, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const { execFile } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { Readable } = require('node:stream');

const ROOT = path.join(__dirname, '..');
const SETTINGS = () => path.join(app.getPath('userData'), 'settings.json');
const PHOTOS_ORIGINALS = path.join(os.homedir(), 'Pictures', 'Photos Library.photoslibrary', 'originals');
const MEDIA_TYPES = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.pdf': 'application/pdf' };

let win = null, tray = null, quitting = false, watcher = null;
let settings = { autoSort: false };
const allowed = new Set(); // folders the user picked — the only places files are read from or moved within
const readOnly = new Set([path.join(os.homedir(), 'Pictures', 'Photos Library.photoslibrary')]);

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'localfile', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

/* ---------- helpers ---------- */
const inside = (p, root) => { const r = path.relative(root, p); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
const isAllowed = p => [...allowed].some(root => inside(path.resolve(p), root));
const isReadOnly = p => [...readOnly].some(root => inside(path.resolve(p), root));
const allow = dir => { allowed.add(path.resolve(dir)); return dir; };
const loadSettings = () => { try { settings = { ...settings, ...JSON.parse(fs.readFileSync(SETTINGS(), 'utf8')) }; } catch { } };
const saveSettings = () => fsp.writeFile(SETTINGS(), JSON.stringify(settings, null, 2)).catch(() => { });
const skipDir = n => n.startsWith('.') || n === 'Sorted' || n === 'node_modules' || n.endsWith('.app') || n.endsWith('.photoslibrary');
const skipFile = n => n.startsWith('.') || n === 'Icon\r' || /\.(crdownload|download|part|partial)$/i.test(n);

async function scan(dir, max = 10000) {
  if (!isAllowed(dir)) return { error: 'Folder not allowed' };
  const base = path.dirname(dir), files = [];
  async function walk(d, depth) {
    let list; try { list = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      if (files.length >= max) return;
      const abs = path.join(d, e.name);
      if (e.isDirectory()) { if (!skipDir(e.name) && depth < 6) await walk(abs, depth + 1); continue; }
      if (!e.isFile() || skipFile(e.name)) continue;
      try { const st = await fsp.stat(abs); files.push({ abs, rel: path.relative(base, abs), name: e.name, size: st.size, mtime: st.mtimeMs }); } catch { }
    }
  }
  await walk(dir, 0);
  return { files, truncated: files.length >= max };
}

async function freePath(dir, name) {
  const ext = path.extname(name), stem = path.basename(name, ext);
  for (let i = 1; i < 1000; i++) {
    const p = path.join(dir, i === 1 ? name : `${stem} (${i})${ext}`);
    try { await fsp.access(p); } catch { return p; }
  }
  throw new Error('No free name for ' + name);
}

async function move(from, destDir, newName) {
  if (!isAllowed(from) || !isAllowed(destDir)) return { error: 'Outside the chosen folder' };
  if (isReadOnly(from) || isReadOnly(destDir)) return { error: 'The Photos library is read-only' };
  await fsp.mkdir(destDir, { recursive: true });
  const to = await freePath(destDir, newName || path.basename(from));
  try { await fsp.rename(from, to); }
  catch (e) {
    if (e.code !== 'EXDEV') return { error: e.message };
    await fsp.copyFile(from, to, fs.constants.COPYFILE_EXCL);
    if ((await fsp.stat(to)).size !== (await fsp.stat(from)).size) return { error: 'Copy check failed' };
    await fsp.unlink(from);
  }
  return { path: to };
}

async function removeEmptyDirs(dir) {
  if (!isAllowed(dir) || path.basename(dir) !== 'Sorted') return;
  const walk = async d => {
    let list; try { list = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of list) if (e.isDirectory()) await walk(path.join(d, e.name));
    try { await fsp.rmdir(d); } catch { } // only succeeds when empty
  };
  await walk(dir);
}

// Quick Look thumbnails: renders HEIC/RAW/Office/iWork/PSD/etc. Limited to 3 at a time.
let qlRunning = 0; const qlQueue = [];
function quickLook(abs, size = 352) {
  return new Promise(resolve => {
    const run = async () => {
      qlRunning++;
      const out = await fsp.mkdtemp(path.join(os.tmpdir(), 'ps-ql-'));
      execFile('/usr/bin/qlmanage', ['-t', '-s', String(size), '-o', out, abs], { timeout: 10000 }, async () => {
        let buf = null;
        try { const f = (await fsp.readdir(out)).find(n => n.endsWith('.png')); if (f) buf = await fsp.readFile(path.join(out, f)); } catch { }
        fsp.rm(out, { recursive: true, force: true });
        qlRunning--; qlQueue.shift()?.(); resolve(buf);
      });
    };
    if (!isAllowed(abs)) return resolve(null);
    qlRunning < 3 ? run() : qlQueue.push(run);
  });
}

// Serves local files to the renderer with HTTP Range support (needed to seek in videos).
async function serveLocal(req) {
  const p = decodeURIComponent(new URL(req.url).pathname.slice(1));
  if (!isAllowed(p)) return new Response('Forbidden', { status: 403 });
  let st; try { st = await fsp.stat(p); } catch { return new Response('Not found', { status: 404 }); }
  const type = MEDIA_TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream';
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  if (m) {
    const start = m[1] ? +m[1] : 0, end = m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
    return new Response(Readable.toWeb(fs.createReadStream(p, { start, end })), { status: 206, headers: { 'Content-Type': type, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes' } });
  }
  return new Response(Readable.toWeb(fs.createReadStream(p)), { headers: { 'Content-Type': type, 'Content-Length': String(st.size), 'Accept-Ranges': 'bytes' } });
}

/* ---------- auto-sort new downloads ---------- */
function watchDownloads() {
  watcher?.close(); watcher = null;
  if (!settings.autoSort) return;
  const dir = allow(app.getPath('downloads')), seen = new Set(), timers = new Map();
  const check = async name => {
    const abs = path.join(dir, name);
    try {
      const a = await fsp.stat(abs); if (!a.isFile() || skipFile(name) || seen.has(abs)) return;
      await new Promise(r => setTimeout(r, 1500));
      const b = await fsp.stat(abs); if (b.size !== a.size) return schedule(name); // still downloading
      seen.add(abs);
      win?.webContents.send('new-file', { abs, rel: path.join(path.basename(dir), name), name, size: b.size, mtime: b.mtimeMs, root: dir });
    } catch { }
  };
  const schedule = name => { clearTimeout(timers.get(name)); timers.set(name, setTimeout(() => check(name), 1000)); };
  watcher = fs.watch(dir, (_ev, name) => { if (name && !skipFile(name)) schedule(name); });
}

/* ---------- window, tray ---------- */
function trayIcon() {
  // 16pt folder glyph drawn into a raw BGRA bitmap @2x and used as a template image (adapts to dark menu bars).
  const W = 32, buf = Buffer.alloc(W * W * 4);
  const set = (x, y) => { const i = (y * W + x) * 4; buf[i + 3] = 255; };
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const body = x >= 3 && x <= 28 && y >= 9 && y <= 26 && !(x >= 6 && x <= 25 && y >= 12 && y <= 23);
    const tab = x >= 3 && x <= 13 && y >= 6 && y <= 9;
    const spark = (x - 16) ** 2 + (y - 18) ** 2 <= 9;
    if (body || tab || spark) set(x, y);
  }
  const img = nativeImage.createFromBitmap(buf, { width: W, height: W, scaleFactor: 2 });
  img.setTemplateImage(true); return img;
}

function buildTrayMenu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Photo Sorter', click: showWindow },
    { label: 'Sort my Downloads now', click: () => { showWindow(); win.webContents.send('command', 'load-downloads'); } },
    { type: 'separator' },
    { label: 'Auto-sort new downloads', type: 'checkbox', checked: settings.autoSort, click: m => { settings.autoSort = m.checked; saveSettings(); watchDownloads(); } },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' },
  ]));
}

function showWindow() { if (!win) createWindow(); win.show(); win.focus(); }

function createWindow() {
  win = new BrowserWindow({
    width: 1480, height: 940, minWidth: 980, minHeight: 700, show: false, title: 'Photo Sorter',
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 14 }, backgroundColor: '#f7f1f4',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.loadURL('app://bundle/index.html');
  win.once('ready-to-show', () => win.show());
  win.on('close', e => { if (!quitting && tray) { e.preventDefault(); win.hide(); } });
  win.on('closed', () => { win = null; });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
}

/* ---------- IPC ---------- */
ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], buttonLabel: 'Sort this folder' });
  return r.canceled ? null : allow(r.filePaths[0]);
});
ipcMain.handle('downloads-path', () => allow(app.getPath('downloads')));
ipcMain.handle('photos-path', async () => {
  try { await fsp.access(PHOTOS_ORIGINALS, fs.constants.R_OK); await fsp.readdir(PHOTOS_ORIGINALS); return allow(PHOTOS_ORIGINALS); }
  catch { return { error: 'macOS blocked access to the Photos library. Give Photo Sorter “Full Disk Access” in System Settings → Privacy & Security, then try again.' }; }
});
ipcMain.handle('scan', (_e, dir, max) => scan(dir, max));
ipcMain.handle('quicklook', (_e, abs, size) => quickLook(abs, size));
ipcMain.handle('move', (_e, from, destDir, name) => move(from, destDir, name).catch(err => ({ error: err.message })));
ipcMain.handle('remove-empty-dirs', (_e, dir) => removeEmptyDirs(dir));
ipcMain.handle('reveal', (_e, abs) => { if (isAllowed(abs)) shell.showItemInFolder(abs); });
ipcMain.handle('notify', (_e, title, body) => { if (Notification.isSupported()) new Notification({ title, body, silent: true }).show(); });

/* ---------- smoke test (npm run smoke) — exercises scan/move/undo/Quick Look without a window ---------- */
async function smoke() {
  const dir = allow(await fsp.mkdtemp(path.join(os.tmpdir(), 'ps-smoke-')));
  await fsp.mkdir(path.join(dir, 'nested'));
  await fsp.writeFile(path.join(dir, 'Invoice 42.txt'), 'Invoice. Subtotal 10. VAT 2. Total due 12.');
  await fsp.writeFile(path.join(dir, 'nested', 'notes.md'), '# notes');
  await fsp.writeFile(path.join(dir, '.DS_Store'), 'x');
  const s = await scan(dir);
  const moved = await move(path.join(dir, 'Invoice 42.txt'), path.join(dir, 'Sorted', 'Invoices & receipts'));
  const clash = await fsp.writeFile(path.join(dir, 'Invoice 42.txt'), 'second').then(() => move(path.join(dir, 'Invoice 42.txt'), path.join(dir, 'Sorted', 'Invoices & receipts')));
  const back = await move(moved.path, dir);
  await fsp.unlink(clash.path); await removeEmptyDirs(path.join(dir, 'Sorted'));
  const ql = await quickLook(path.join(dir, 'nested', 'notes.md'), 128);
  const outside = await move(path.join(os.homedir(), 'nope.txt'), dir);
  const result = { scanned: s.files.map(f => f.rel), moved: path.relative(dir, moved.path), clashRenamed: path.basename(clash.path), restored: path.relative(dir, back.path),
    sortedRemoved: !fs.existsSync(path.join(dir, 'Sorted')), quickLookPng: !!ql && ql.slice(1, 4).toString() === 'PNG', outsideBlocked: !!outside.error };
  console.log('SMOKE ' + JSON.stringify(result));
  await fsp.rm(dir, { recursive: true, force: true });
  app.exit(Object.values(result).every(v => v && v.length !== 0) ? 0 : 1);
}

app.whenReady().then(async () => {
  loadSettings();
  if (process.argv.includes('--smoke')) return smoke();
  protocol.handle('app', req => {
    const p = path.normalize(path.join(ROOT, decodeURIComponent(new URL(req.url).pathname)));
    return inside(p, ROOT) ? net.fetch(pathToFileURL(p).toString()) : new Response('Forbidden', { status: 403 });
  });
  protocol.handle('localfile', serveLocal);
  if (process.argv.includes('--tour')) return require('./tour.cjs')(path.join(ROOT, 'docs', 'screenshots'));
  tray = new Tray(trayIcon()); tray.setToolTip('Photo Sorter'); buildTrayMenu();
  createWindow(); watchDownloads();
  app.on('activate', showWindow);
});
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
