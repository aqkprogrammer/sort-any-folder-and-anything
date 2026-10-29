// Turns a file into an item: preview thumbnail, colour stats, perceptual hash, sharpness,
// EXIF date/GPS and (for documents) extracted text. Everything runs locally in the page.

import { familyOf, kindOf } from './folders.js';
import { ext } from './util.js';
import { drawVideoBadge, drawTypeBadge, drawTextPreview, drawGenericFile, drawAudio, FAMILY_COLOR } from './draw.js';

export const PREVIEW = 176;
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/';
const EXIFR = 'https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.esm.mjs';

const newCanvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const toBlob = c => new Promise(r => c.toBlob(r, 'image/jpeg', .85));

export function drawCover(ctx, src, sw, sh, S, top = false) {
  const s = Math.max(S / sw, S / sh);
  ctx.drawImage(src, (S - sw * s) / 2, top ? 0 : (S - sh * s) / 2, sw * s, sh * s);
}

/* ---------- pixel analysis ---------- */
const work = newCanvas(64), wctx = work.getContext('2d', { willReadFrequently: true });

export function analyzeCanvas(src) {
  // colour stats (32×32)
  wctx.clearRect(0, 0, 64, 64); wctx.drawImage(src, 0, 0, 32, 32);
  const px = wctx.getImageData(0, 0, 32, 32).data;
  let L = 0, Sa = 0, n = 0, hx = 0, hy = 0, cw = 0; const hist = new Array(12).fill(0);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)); let h = 0;
    if (d) { h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
    L += l; Sa += s; n++; hist[Math.floor(h / 30) % 12] += d;
    hx += Math.cos(h * Math.PI / 180) * d; hy += Math.sin(h * Math.PI / 180) * d; cw += d;
  }
  const stats = { lum: L / n, sat: Sa / n, hist, hue: (Math.atan2(hy, hx) * 180 / Math.PI + 360) % 360, chroma: cw / n };

  // pixel fingerprint: 24×24 RGB, used to confirm duplicates the hash flags
  wctx.drawImage(src, 0, 0, 24, 24);
  const f = wctx.getImageData(0, 0, 24, 24).data, sig = new Uint8Array(1728);
  for (let i = 0, k = 0; i < f.length; i += 4) { sig[k++] = f[i]; sig[k++] = f[i + 1]; sig[k++] = f[i + 2]; }

  // dHash (9×8 → 64 bits, stored as two uint32)
  wctx.drawImage(src, 0, 0, 9, 8);
  const d = wctx.getImageData(0, 0, 9, 8).data, gray = i => d[i * 4] * .299 + d[i * 4 + 1] * .587 + d[i * 4 + 2] * .114;
  let hi = 0, lo = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const bit = gray(y * 9 + x) > gray(y * 9 + x + 1) ? 1 : 0, k = y * 8 + x;
    if (k < 32) hi = (hi | (bit << k)) >>> 0; else lo = (lo | (bit << (k - 32))) >>> 0;
  }

  // sharpness: variance of the Laplacian on a 64×64 grey image
  wctx.drawImage(src, 0, 0, 64, 64);
  const g = wctx.getImageData(0, 0, 64, 64).data, G = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) G[i] = g[i * 4] * .299 + g[i * 4 + 1] * .587 + g[i * 4 + 2] * .114;
  let sum = 0, sum2 = 0, m = 0;
  for (let y = 1; y < 63; y++) for (let x = 1; x < 63; x++) {
    const i = y * 64 + x, v = 4 * G[i] - G[i - 1] - G[i + 1] - G[i - 64] - G[i + 64];
    sum += v; sum2 += v * v; m++;
  }
  const sharp = sum2 / m - (sum / m) ** 2;
  return { stats, hash: [hi, lo], sharp, sig };
}

const pop = x => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; };
export const hamming = (a, b) => pop(a[0] ^ b[0]) + pop(a[1] ^ b[1]);
const SCREENY = /screen ?shot|screenshot|screen ?record/i;
const sigDiff = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]); return d / a.length; };

/* ---------- junk + duplicates ---------- */
export const SHARP_MIN = 60;
export function junkReason(item) {
  if (item.kind !== 'photo' || !item.stats) return null;
  if (item.stats.lum < .06) return 'Nearly black — looks like a pocket shot';
  if (item.sharp < SHARP_MIN && item.stats.chroma > .02) return `Very blurry (sharpness ${Math.round(item.sharp)})`;
  return null;
}

// Groups exact copies and near-duplicates; the sharpest/largest file in each group is kept.
export function findDuplicates(items) {
  const parent = items.map((_, i) => i), find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const why = new Map(), base = n => n.toLowerCase().replace(/\.[^.]+$/, '').replace(/(\s*\(\d+\)|\s+copy(\s*\d+)?|[\s_-]\d)$/, '');
  const byKey = new Map();
  items.forEach((it, i) => {
    const k = it.size + '|' + base(it.name);
    if (byKey.has(k)) { parent[find(i)] = find(byKey.get(k)); why.set(i, 'Exact copy'); } else byKey.set(k, i);
  });
  const vis = items.map((it, i) => [it, i]).filter(([it]) => it.hash && (it.kind === 'photo' || it.kind === 'video'));
  for (let a = 0; a < vis.length; a++) for (let b = a + 1; b < vis.length; b++) {
    const [A, i] = vis[a], [B, j] = vis[b];
    if (A.kind !== B.kind) continue;
    const dist = hamming(A.hash, B.hash);
    if (dist > 8 || !A.sig || !B.sig) continue;
    // Re-saved copies differ by <1.5 per channel; screenshots of the same app often differ by 2–4,
    // so screenshots/recordings only count when they are effectively identical.
    const diff = sigDiff(A.sig, B.sig), screeny = SCREENY.test(A.name) || SCREENY.test(B.name);
    const same = diff < 1.5, near = !screeny && dist <= 6 && diff < 3;
    if ((same || near) && find(i) !== find(j)) { parent[find(j)] = find(i); if (!why.has(j)) why.set(j, same ? 'Same picture (re-saved copy)' : `Near-duplicate (${Math.round(100 - diff * 4)}% alike)`); }
  }
  const groups = new Map();
  items.forEach((_, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); });
  let n = 0;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    // keep: a file without a " copy"/" (1)" suffix, then the sharpest, then the largest
    const copyish = it => /(\s*\(\d+\)|\s+copy(\s*\d+)?|\s\d)$/i.test(it.name.replace(/\.[^.]+$/, '')) ? 1 : 0;
    g.sort((x, y) => copyish(items[x]) - copyish(items[y]) || Math.round(items[y].sharp || 0) - Math.round(items[x].sharp || 0) || items[y].size - items[x].size);
    const keep = items[g[0]];
    for (const i of g.slice(1)) { items[i].dupOf = keep.id; items[i].dupReason = `${why.get(i) || why.get(g[0]) || 'Duplicate'} of ${keep.name}`; n++; }
  }
  return n;
}

/* ---------- decoders ---------- */
async function decodeImage(file) {
  try { const b = await createImageBitmap(file); return { src: b, w: b.width, h: b.height, close: () => b.close() }; }
  catch {
    // SVG and a few others only decode through <img>
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.src = url; await img.decode();
      return { src: img, w: img.naturalWidth || PREVIEW, h: img.naturalHeight || PREVIEW, close: () => URL.revokeObjectURL(url) };
    } catch { URL.revokeObjectURL(url); return null; }
  }
}

function decodeVideo(fileOrUrl) {
  return new Promise(res => {
    const own = typeof fileOrUrl !== 'string', v = document.createElement('video'), url = own ? URL.createObjectURL(fileOrUrl) : fileOrUrl; let done = false;
    const finish = ok => {
      if (done) return; done = true;
      let frame = null;
      if (ok && v.videoWidth) { frame = newCanvas(v.videoWidth > v.videoHeight ? 320 : 180, v.videoWidth > v.videoHeight ? 180 : 320); try { frame.getContext('2d').drawImage(v, 0, 0, frame.width, frame.height); } catch { frame = null; } }
      res({ frame, w: v.videoWidth, h: v.videoHeight, duration: v.duration });
      if (own) URL.revokeObjectURL(url); v.removeAttribute('src'); v.load();
    };
    v.muted = true; v.playsInline = true; v.preload = 'metadata';
    v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 3); };
    v.onseeked = () => finish(true); v.onerror = () => finish(false); setTimeout(() => finish(!!v.videoWidth), 6000);
    v.src = url;
  });
}

let pdfjsP = null;
async function pdfPreview(file) {
  pdfjsP ??= import(PDFJS + 'pdf.min.mjs').then(m => { m.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs'; return m; });
  const pdfjs = await pdfjsP;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  try {
    const page = await doc.getPage(1), vp0 = page.getViewport({ scale: 1 }), scale = (PREVIEW * 2) / vp0.width, vp = page.getViewport({ scale });
    const c = newCanvas(Math.ceil(vp.width), Math.ceil(vp.height)), ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    let text = '';
    for (let p = 1; p <= Math.min(2, doc.numPages); p++) { const tc = await (await doc.getPage(p)).getTextContent(); text += tc.items.map(i => i.str).join(' ') + ' '; }
    return { canvas: c, text: text.slice(0, 6000), pages: doc.numPages };
  } finally { doc.destroy(); }
}

// Minimal ZIP reader for .docx/.xlsx/.pptx text (uses the built-in DecompressionStream).
async function officeText(file, family) {
  if (file.size > 40e6) return '';
  const want = family === 'word' ? /^word\/document\.xml$/ : family === 'sheet' ? /^xl\/sharedStrings\.xml$/ : /^ppt\/slides\/slide\d+\.xml$/;
  const buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer);
  let e = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) return '';
  const count = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const hits = [], td = new TextDecoder();
  for (let k = 0; k < count && dv.getUint32(p, true) === 0x02014b50; k++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = td.decode(buf.subarray(p + 46, p + 46 + nl)); if (want.test(name)) hits.push({ name, method, csize, lo });
    p += 46 + nl + xl + cl;
  }
  hits.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  let out = '';
  for (const h of hits.slice(0, 4)) {
    const s = h.lo + 30 + dv.getUint16(h.lo + 26, true) + dv.getUint16(h.lo + 28, true), raw = buf.subarray(s, s + h.csize);
    const data = h.method === 0 ? raw : new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    out += td.decode(data).replace(/<\/w:p>|<\/a:p>|<\/si>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/[ \t]+/g, ' ') + '\n';
    if (out.length > 6000) break;
  }
  return out.slice(0, 6000);
}

let audioCtx = null;
async function audioWave(file, S) {
  if (file.size > 30e6) return null;
  audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
  const buf = await audioCtx.decodeAudioData(await file.arrayBuffer()), ch = buf.getChannelData(0);
  const c = newCanvas(S), ctx = c.getContext('2d'), n = 40, step = Math.floor(ch.length / n);
  const g = ctx.createLinearGradient(0, 0, S, S); g.addColorStop(0, '#2b2340'); g.addColorStop(1, '#5a3a6a'); ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < n; i++) {
    let peak = 0; for (let k = i * step; k < (i + 1) * step; k += 64) peak = Math.max(peak, Math.abs(ch[k]));
    const h = Math.max(2, peak * S * .55), x = S * .08 + i * (S * .84 / n);
    ctx.fillStyle = `hsl(${320 - i * 3},80%,70%)`; ctx.beginPath(); ctx.roundRect(x, S * .5 - h / 2, S * .84 / n * .6, h, 2); ctx.fill();
  }
  return { canvas: c, duration: buf.duration };
}

let exifrP = null;
async function readExif(file) {
  try {
    exifrP ??= import(EXIFR).then(m => m.default);
    const ex = await (await exifrP).parse(file, { tiff: true, exif: true, gps: true, xmp: false, icc: false, iptc: false, jfif: false, ihdr: false });
    if (!ex) return {};
    const date = ex.DateTimeOriginal || ex.CreateDate || ex.ModifyDate;
    return { date: date instanceof Date && !isNaN(date) ? date : null, gps: Number.isFinite(ex.latitude) && Number.isFinite(ex.longitude) ? { lat: ex.latitude, lon: ex.longitude } : null };
  } catch { return {}; }
}

/* ---------- main entry ---------- */
// entry: { name, size, mtime, path, getFile(): Promise<File>, url?, quickLook?(): Promise<Blob|null> }
// Files are only read when a preview needs their bytes, so huge installers/archives are never loaded.
export async function analyzeEntry(entry) {
  const family = familyOf(entry.name, entry.type || ''), kind = kindOf(family);
  const item = { name: entry.name, path: entry.path, size: entry.size, mtime: entry.mtime, family, kind, date: new Date(entry.mtime || Date.now()), gps: null, text: '' };
  const S = PREVIEW, out = newCanvas(S), ctx = out.getContext('2d');
  let drawn = false, analyzed = false;
  let fileP = null; const getFile = () => (fileP ??= entry.getFile());

  const fromQuickLook = async () => {
    if (!entry.quickLook) return false;
    const blob = await entry.quickLook(); if (!blob) return false;
    const d = await decodeImage(blob); if (!d) return false;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S, S); drawCover(ctx, d.src, d.w, d.h, S, kind === 'doc'); d.close(); return true;
  };

  try {
    if (kind === 'photo') {
      const d = await decodeImage(await getFile());
      if (d) { item.w = d.w; item.h = d.h; drawCover(ctx, d.src, d.w, d.h, S); d.close(); drawn = true; }
      else drawn = await fromQuickLook();
      if (drawn) { Object.assign(item, analyzeCanvas(out)); analyzed = true; }
      Object.assign(item, Object.fromEntries(Object.entries(await readExif(await getFile())).filter(([, v]) => v)));
    } else if (kind === 'video') {
      const v = await decodeVideo(entry.url || await getFile()); item.w = v.w; item.h = v.h; item.duration = v.duration;
      if (v.frame) { drawCover(ctx, v.frame, v.frame.width, v.frame.height, S); drawn = true; }
      else drawn = await fromQuickLook();
      if (drawn) { Object.assign(item, analyzeCanvas(out)); analyzed = true; drawVideoBadge(ctx, S, null); }
      if (drawn && Number.isFinite(v.duration)) { const s = Math.round(v.duration); ctx.font = `700 ${Math.round(S * .1)}px Inter,system-ui`; ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.fillText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, S * .92, S * .92); }
    } else if (kind === 'audio') {
      const w = await audioWave(await getFile(), S).catch(() => null);
      if (w) { ctx.drawImage(w.canvas, 0, 0); item.duration = w.duration; drawn = true; }
    } else if (family === 'pdf') {
      const p = await pdfPreview(await getFile()).catch(() => null);
      if (p) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S, S); drawCover(ctx, p.canvas, p.canvas.width, p.canvas.height, S, true); item.text = p.text; item.pages = p.pages; drawn = true; }
    } else if (family === 'text' || family === 'code' || (family === 'sheet' && /csv|tsv/.test(ext(entry.name)))) {
      const t = await (await getFile()).slice(0, 20000).text(); item.text = t.slice(0, 6000); drawTextPreview(ctx, S, t, family); drawn = true;
    } else if (['word', 'sheet', 'slide'].includes(family) && /x$/.test(ext(entry.name))) {
      item.text = await officeText(await getFile(), family).catch(() => '');
      if (!(drawn = await fromQuickLook()) && item.text) { drawTextPreview(ctx, S, item.text, family === 'sheet' ? 'sheet' : 'text'); drawn = true; }
    } else if (family === 'design' && ext(entry.name) === 'svg') {
      const d = await decodeImage(await getFile()); if (d) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S, S); drawCover(ctx, d.src, d.w, d.h, S); d.close(); drawn = true; }
    }
    if (!drawn && kind === 'doc') drawn = await fromQuickLook();
  } catch (err) { console.warn('analyze failed', entry.name, err); }

  if (!drawn) {
    const label = ext(entry.name) || '?';
    if (kind === 'audio') drawAudio(ctx, S, { r: (a, b) => (a + b) / 2 + Math.random() }, /record|voice|memo/i.test(entry.name));
    else drawGenericFile(ctx, S, null, label, FAMILY_COLOR[family] || FAMILY_COLOR.other);
    if (kind === 'video') drawVideoBadge(ctx, S, null);
  }
  if (kind === 'doc' && drawn) drawTypeBadge(ctx, S, (ext(entry.name) || family).toUpperCase().slice(0, 5), FAMILY_COLOR[family] || FAMILY_COLOR.other);
  if (!analyzed && (kind === 'doc' || kind === 'audio')) Object.assign(item, { stats: analyzeCanvas(out).stats });
  item.decoded = analyzed;
  item.preview = await toBlob(out);
  return item;
}
