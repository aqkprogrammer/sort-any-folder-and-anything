// Photo Sorter — app orchestration: loading, classifying, sorting choreography, views,
// search, drag-to-correct, moving files and the desktop bridge.

import { $, $$, clamp, rnd, esc, shuffle, fmtBytes, store, toast, countUp, sleep, FOLDER_SVG } from './util.js';
import { folderSet, customFolder, classifyRule } from './folders.js';
import { analyzeEntry, findDuplicates, junkReason, hamming } from './analyze.js';
import { buildDemo } from './demo.js';
import { Engine } from './engine.js';
import { AI } from './ai.js';
import { rainbowLayout, timelineLayout, MapView } from './views.js';
import * as Files from './files.js';

const board = $('#board'), pileArea = $('#pileArea'), stage = $('#stage'), desktop = window.desktop || null;
const engine = new Engine($('#layer'));
const ai = new AI();
const S = {
  mode: 'demo', source: null, items: [], folders: [], cards: {}, phase: 'boot', view: 'folders',
  aiOn: false, vectors: null, custom: store.get('custom', []), corrections: store.get('corrections', {}),
  lastOrder: null, moves: null, search: null, arranged: null, landed: 0, made: 0, dupes: 0, freed: 0,
};
const mapView = new MapView($('#mapView'), { urlOf: it => urlOf(it), onOpen: list => openList('Near here', list) });

const keyOf = it => S.mode === 'demo' ? `demo:v2:${it.id}` : `${it.path}|${it.size}|${it.mtime}`;
function urlOf(it) { return it._url ??= URL.createObjectURL(it.preview); }

/* =========================================================
   Status, stats, sound, theme
   ========================================================= */
let statusAt = 0;
function setStatus(text, kind = '', force = true) {
  const now = performance.now(); if (!force && now - statusAt < 40) return; statusAt = now;
  $('#statusText').textContent = text; $('#status').className = 'status ' + kind;
}
const progress = p => { $('#progress').style.width = clamp(p, 0, 1) * 100 + '%'; };

function showStats() {
  const real = S.items.filter(i => i.dupOf == null), n = k => real.filter(i => k.includes(i.kind)).length;
  countUp($('#sTotal'), S.items.length); countUp($('#sPhotos'), n(['photo'])); countUp($('#sMedia'), n(['video', 'audio'])); countUp($('#sDocs'), n(['doc']));
  $('#sFolders').textContent = S.made; $('#sDupes').textContent = S.dupes; $('#sFree').textContent = fmtBytes(S.freed);
}

let actx = null, soundOn = false, lastTick = 0;
const SPK_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
const SPK_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path d="M16 10l4 4M20 10l-4 4"/></svg>';
const SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760];
function tick(freq) {
  if (!soundOn) return; const n = performance.now(); if (n - lastTick < 30) return; lastTick = n;
  actx ??= new AudioContext(); const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine'; o.frequency.value = freq; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.045, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + .12);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + .13);
}
const chord = () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => { lastTick = 0; tick(f); }, i * 90));

const THEMES = ['auto', 'light', 'dark'];
const THEME_ICON = {
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
};
let theme = store.get('theme', 'auto');
function applyTheme() {
  if (theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
  $('#themeBtn').innerHTML = THEME_ICON[theme]; $('#themeBtn').title = `Theme: ${theme}`;
  if (S.view === 'map') mapView.show(S.items, isDark());
}
const isDark = () => theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);

/* =========================================================
   Folders + classification
   ========================================================= */
const customs = () => S.custom.map(customFolder);
const smart = () => S.mode === 'demo' || S.aiOn;
const hasFolder = id => S.folders.some(f => f.id === id);

function computeFolders() { S.folders = folderSet(smart(), customs(), S.mode !== 'demo'); }

function classifyOne(item) {
  if (item.dupOf != null) return { cat: 'dupes', reason: item.dupReason };
  const fix = S.corrections[keyOf(item)];
  if (fix && hasFolder(fix)) return { cat: fix, reason: 'You put this here' };
  const junk = junkReason(item);
  if (junk) return { cat: 'junk', reason: junk };
  const rule = classifyRule(item, { smart: S.mode === 'demo', custom: customs() });
  const byRule = rule.cat === 'shots' || rule.cat === 'v-screen';
  if (S.aiOn && S.vectors && item.emb && !byRule && (item.kind === 'photo' || item.kind === 'video')) {
    const cands = S.folders.filter(f => f.prompts && f.kinds.includes(item.kind));
    const r = ai.classify(item, cands, S.vectors); if (r) return r;
  }
  if (hasFolder(rule.cat)) return rule;
  return { cat: item.kind === 'video' ? 'v-other' : item.kind === 'photo' ? 'rawimg' : 'other', reason: rule.reason };
}
function classifyAll() { for (const it of S.items) Object.assign(it, classifyOne(it)); }

function buildCards() {
  S.cards = {};
  for (const id of ['photoFolders', 'mediaFolders', 'docFolders']) $('#' + id).innerHTML = '';
  const host = { photo: $('#photoFolders'), media: $('#mediaFolders'), docs: $('#docFolders') };
  for (const f of S.folders) {
    const el = f.id === 'dupes' ? $('#dupesCard') : document.createElement('div');
    el.className = 'folder' + (f.id === 'dupes' ? ' dupes' : '') + (f.custom ? ' custom' : '');
    el.dataset.id = f.id;
    el.innerHTML = `<div class="fhead">${FOLDER_SVG}<img alt=""><span class="fname">${esc(f.name)}</span><span class="count">0</span></div><div class="thumbs"></div>`;
    if (f.id !== 'dupes') host[f.section].append(el);
    S.cards[f.id] = { f, el, thumbs: el.querySelector('.thumbs'), countEl: el.querySelector('.count'), members: [], n: 0, rect: null, ts: 18, bump: 0 };
  }
}

/* =========================================================
   Geometry
   ========================================================= */
const boardRect = () => board.getBoundingClientRect();
function rel(el, b = boardRect()) { const r = el.getBoundingClientRect(); return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height }; }

function slotPos(t) {
  const c = t.card, { x, y, w, h } = c.rect, ts = c.ts, g = 3;
  const cols = Math.max(1, Math.floor((w + g) / (ts + g))), rows = Math.max(1, Math.floor((h + g) / (ts + g))), max = cols * rows;
  const idx = c.members.indexOf(t), over = idx >= max, j = t.jit, i = over ? j.slot % max : idx;
  return { x: x + (i % cols) * (ts + g) + ts / 2 + (over ? j.dx : 0), y: y + Math.floor(i / cols) * (ts + g) + ts / 2 + (over ? j.dy : 0), r: over ? j.r : j.r * .25, s: ts / engine.T };
}

function targetFor(t) {
  if (S.view === 'map') return null;
  if (S.view !== 'folders') { const p = S.arranged?.pos.get(t); return p ? { x: p.x, y: p.y, r: 0, s: p.ts / engine.T } : null; }
  if (S.search) { const p = S.search.pos.get(t); if (p) return { x: p.x, y: p.y, r: 0, s: p.ts / engine.T }; }
  return t.card ? slotPos(t) : null;
}

function measure() {
  const b = boardRect(), p = rel(pileArea, b);
  engine.setPile(p.x + p.w / 2, p.y + p.h / 2, Math.max(60, Math.min(p.w * .98, p.h) / 2 * .9));
  for (const c of Object.values(S.cards)) { c.rect = rel(c.thumbs, b); c.ts = clamp((c.rect.h - 3) / 2, 9, 20); }
  if (S.view === 'rainbow' || S.view === 'timeline') {
    const r = { x: 0, y: 0, w: b.width, h: b.height };
    S.arranged = (S.view === 'rainbow' ? rainbowLayout : timelineLayout)(engine.tiles, r);
    $('#viewLabels').innerHTML = S.arranged.labels;
  }
  if (S.search) S.search.pos = searchLayout(S.search.hits);
}

// Moves every tile to wherever it belongs now (after resize, view change, search…)
function relayout(animate) {
  measure();
  const n = engine.tiles.length, now = performance.now();
  engine.tiles.forEach((t, i) => {
    if (t.state === 'drag') return;
    const target = targetFor(t);
    t.ta = S.view === 'map' ? 0 : (S.search && !S.search.pos.has(t)) ? .1 : 1;
    if (!target) {
      if (t.state === 'rest') animate ? engine.at(now + i * (500 / n), m => engine.toPile(t, { now: m, lift: .3 })) : (t.state = 'pile');
      return;
    }
    if (t.state === 'fly' && !animate) engine.retarget(t, target);
    else if (animate) engine.at(now + i * (500 / n), m => engine.flyTo(t, target, { now: m, dur: rnd(650, 1050), lift: .35 }));
    else engine.snap(t, target);
  });
}

/* =========================================================
   Board lifecycle
   ========================================================= */
function setBusy(on, text = '') {
  $('#loading').classList.toggle('hidden', !on); $('#loadingText').textContent = text;
  ['sortBtn', 'resetBtn', 'aiBtn', 'loadBtn'].forEach(id => $('#' + id).disabled = on);
}

async function startBoard(statusMsg) {
  S.phase = 'intro'; S.landed = S.made = S.dupes = S.freed = 0; S.search = null; S.moves = null; S.lastOrder = null;
  setView('folders', false); clearSearch(false);
  computeFolders(); buildCards();
  if (S.aiOn) await embedAll();
  classifyAll();
  setBusy(true, 'Preparing textures…');
  await engine.setItems(S.items, p => progress(p));
  setBusy(false); progress(0);
  relayout(false); showStats();
  $('#sortLabel').textContent = 'Sort'; $('#caption').textContent = 'a total mess'; $('#hint').style.opacity = 1;
  $('#resetBtn').disabled = true; $('#sortBtn').disabled = true; updateTools();
  setStatus('Scanning…', 'busy');
  await sleep(1500);
  S.phase = 'pile'; $('#sortBtn').disabled = false; setStatus(statusMsg);
}

async function loadDemo() {
  S.mode = 'demo'; S.source = null; revokeAll();
  $('#libName').textContent = 'Downloads'; $('#libWord').textContent = 'folder';
  setBusy(true, 'Drawing a messy Downloads folder…');
  S.items = await buildDemo();
  findDuplicates(S.items);
  setBusy(false);
  await startBoard(`${S.items.length} demo files in a pile — ready to sort`);
}

async function loadSource(src) {
  if (!src) return;
  if (!src.entries.length) { toast('That folder has no files in it.'); return; }
  S.mode = 'real'; S.source = src; revokeAll();
  $('#libName').textContent = src.name; $('#libWord').textContent = src.readOnly ? 'library' : 'folder';
  if (src.truncated) toast(`Showing the first ${src.entries.length.toLocaleString()} files.`);
  setBusy(true, `Reading 0 / ${src.entries.length}…`); setStatus('Reading files…', 'busy');
  const items = new Array(src.entries.length); let done = 0, next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < src.entries.length) {
      const i = next++, entry = src.entries[i];
      try { items[i] = Object.assign(await analyzeEntry(entry), { id: i, entry }); }
      catch (e) { console.warn(e); }
      if (++done % 5 === 0 || done === src.entries.length) { $('#loadingText').textContent = `Reading ${done.toLocaleString()} / ${src.entries.length.toLocaleString()}…`; progress(done / src.entries.length); }
    }
  }));
  S.items = items.filter(Boolean);
  setBusy(true, 'Looking for duplicates…'); await sleep(30);
  findDuplicates(S.items);
  setBusy(false);
  await startBoard(`${S.items.length.toLocaleString()} files from “${src.name}” in a pile — ready to sort`);
}

function revokeAll() { for (const it of S.items) { if (it._url) URL.revokeObjectURL(it._url); if (it._full) URL.revokeObjectURL(it._full); } }

/* =========================================================
   Sorting
   ========================================================= */
function startSort(order) {
  if (S.phase !== 'pile' || !engine.tiles.length) return;
  clearSearch(true);
  S.phase = 'sorting'; S.landed = S.made = S.dupes = S.freed = 0; S.sortStart = performance.now();
  for (const c of Object.values(S.cards)) { c.members = []; c.n = 0; c.countEl.textContent = '0'; c.el.classList.remove('live', 'has-cover'); }
  $('#sortBtn').classList.add('running'); $('#sortLabel').textContent = 'Sorting'; $('#sortBtn').disabled = true; $('#resetBtn').disabled = true;
  setViewsEnabled(false); stage.classList.add('sorting'); $('#caption').textContent = 'sorting it out…'; $('#hint').style.opacity = 0;
  measure();
  const tiles = order || shuffle([...engine.tiles]); S.lastOrder = tiles;
  const gap = clamp(4600 / tiles.length, .35, 24), t0 = performance.now() + 350;
  tiles.forEach((t, i) => engine.at(t0 + i * gap, now => launch(t, now)));
}

function launch(t, now) {
  const card = S.cards[t.item.cat] || S.cards.other;
  t.card = card; card.members.push(t);
  t.jit = { slot: Math.floor(Math.random() * 1e6), dx: rnd(-5, 5), dy: rnd(-4, 4), r: rnd(-14, 14) };
  t.landed = false;
  engine.flyTo(t, slotPos(t), { now, onLand: land });
  setStatus(`${card.f.name}  ←  ${t.item.name}`, 'busy', false);
}

function land(t) {
  if (t.landed || S.phase !== 'sorting') return;
  t.landed = true;
  const c = t.card; c.n++; c.countEl.textContent = c.n;
  if (c.n === 1) { c.el.classList.add('live'); if (c.f.id !== 'dupes') $('#sFolders').textContent = ++S.made; }
  if (c.f.id === 'dupes') $('#sDupes').textContent = ++S.dupes;
  if (c.f.id === 'dupes' || c.f.id === 'junk') { S.freed += t.item.size || 0; $('#sFree').textContent = fmtBytes(S.freed); }
  const now = performance.now();
  if (now - c.bump > 160) { c.bump = now; c.el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }], { duration: 240 }); }
  tick(SCALE[Object.keys(S.cards).indexOf(c.f.id) % SCALE.length]);
  progress(++S.landed / engine.tiles.length);
  if (S.landed === engine.tiles.length) finishSort();
}

function finishSort() {
  S.phase = 'sorted';
  const secs = ((performance.now() - S.sortStart) / 1000).toFixed(1);
  $('#sortBtn').classList.remove('running'); $('#sortLabel').textContent = 'Sorted'; $('#resetBtn').disabled = false;
  stage.classList.remove('sorting'); $('#caption').textContent = 'all sorted ✦'; setViewsEnabled(true);
  setStatus(`Sorted ${engine.tiles.length.toLocaleString()} files into ${S.made} folders in ${secs}s`, 'done');
  Object.values(S.cards).forEach((c, i) => {
    setCover(c);
    setTimeout(() => c.el.animate([{ boxShadow: '0 0 0 0 rgba(224,96,155,0)' }, { boxShadow: '0 0 0 4px rgba(224,96,155,.25)' }, { boxShadow: '0 0 0 0 rgba(224,96,155,0)' }], { duration: 700 }), i * 45);
  });
  updateTools(); chord();
}

// Folder cover = the sharpest photo/video in it.
function setCover(c) {
  const best = c.members.filter(t => t.item.decoded).sort((a, b) => (b.item.sharp || 0) - (a.item.sharp || 0))[0];
  c.el.classList.toggle('has-cover', !!best);
  if (best) c.el.querySelector('.fhead img').src = urlOf(best.item);
}

function messItUp(then) {
  if (S.phase !== 'sorted') return;
  clearSearch(false); setView('folders', false);
  S.phase = 'pile'; S.landed = S.made = S.dupes = S.freed = 0; engine.clearQueue();
  for (const c of Object.values(S.cards)) { c.members = []; c.n = 0; c.countEl.textContent = '0'; c.el.classList.remove('live', 'has-cover'); }
  showStats(); progress(0);
  const now = performance.now();
  engine.tiles.forEach(t => { t.card = null; engine.at(now + Math.random() * 500, m => engine.toPile(t, { now: m, dur: rnd(700, 1100) })); });
  $('#sortBtn').disabled = false; $('#sortLabel').textContent = 'Sort'; $('#resetBtn').disabled = true;
  $('#caption').textContent = 'a total mess'; $('#hint').style.opacity = 1; updateTools();
  setStatus(`${engine.tiles.length.toLocaleString()} files in a pile — ready to sort`);
  if (then) setTimeout(then, 1400);
}

// Re-run classification and re-sort (used after AI on/off and custom folder changes).
async function resort() {
  const wasSorted = S.phase === 'sorted';
  if (wasSorted) messItUp();
  computeFolders(); buildCards(); classifyAll(); measure();
  if (wasSorted) setTimeout(() => startSort(), 1400);
}

/* =========================================================
   Drag-to-correct + reassignment
   ========================================================= */
function reassign(t, to, { learn = true, delay = 0 } = {}) {
  const from = t.card; if (!from || from === to) return;
  from.members.splice(from.members.indexOf(t), 1); from.n--; from.countEl.textContent = from.n;
  to.members.push(t); to.n++; to.countEl.textContent = to.n; to.el.classList.add('live');
  t.card = to; t.item.cat = to.f.id; t.item.reason = 'You moved this here';
  if (to.f.id !== 'dupes') t.item.dupOf = null;
  if (learn) { S.corrections[keyOf(t.item)] = to.f.id; store.set('corrections', S.corrections); }
  const now = performance.now() + delay;
  engine.at(now, m => engine.flyTo(t, slotPos(t), { now: m, dur: 700, lift: .5 }));
  from.members.forEach(o => { if (o.state === 'rest') engine.flyTo(o, slotPos(o), { dur: 380, lift: 0 }); });
  if (from.n === 0) from.el.classList.remove('live');
  setCover(from); setCover(to);
}

function teach(t, to) {
  const from = t.card; reassign(t, to);
  if (!ai.ready || !t.item.emb) { toast(`Moved to ${to.f.name}. I'll remember this file.`); return; }
  ai.learn(t.item, to.f.id);
  const similar = ai.similar(t.item, from.members.map(m => m.item), .9);
  similar.forEach((it, i) => { const o = engine.tiles.find(x => x.item === it); if (o) reassign(o, to, { delay: 250 + i * 90 }); });
  toast(similar.length ? `Learned! Also moved ${similar.length} similar file${similar.length > 1 ? 's' : ''} to ${to.f.name}.` : `Learned — similar files will go to ${to.f.name} from now on.`);
}

let press = null;
board.addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.target.closest('.map-view,.loading')) return;
  const b = boardRect(), x = e.clientX - b.left, y = e.clientY - b.top;
  const t = S.view !== 'map' ? engine.hit(x, y, t => t.state === 'rest' && t.alpha > .5) : null;
  press = { x: e.clientX, y: e.clientY, t, dragging: false };
});
window.addEventListener('pointermove', e => {
  const b = boardRect(), x = e.clientX - b.left, y = e.clientY - b.top;
  engine.mouse = { x, y, on: S.phase === 'pile' && !S.search && e.target.closest?.('#pileArea') != null };
  if (!press?.t) return;
  if (!press.dragging && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 5 && S.phase === 'sorted' && S.view === 'folders' && !S.search && press.t.card) {
    press.dragging = true; engine.startDrag(press.t); document.body.style.cursor = 'grabbing';
  }
  if (press.dragging) {
    engine.moveDrag(x, y);
    $$('.folder.drop').forEach(el => el.classList.remove('drop'));
    document.elementFromPoint(e.clientX, e.clientY)?.closest('.folder')?.classList.add('drop');
  }
});
window.addEventListener('pointerup', e => {
  if (!press) return;
  const p = press; press = null; document.body.style.cursor = '';
  if (p.dragging) {
    const t = engine.endDrag(), el = document.querySelector('.folder.drop');
    $$('.folder.drop').forEach(x => x.classList.remove('drop'));
    const to = el && S.cards[el.dataset.id];
    if (to && to !== t.card) teach(t, to); else engine.flyTo(t, slotPos(t), { dur: 450, lift: 0 });
    return;
  }
  if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 5) return;
  if (p.t) { openItem(p.t.item, p.t.card ? p.t.card.members.map(m => m.item) : [p.t.item]); return; }
  const card = e.target.closest?.('.folder');
  if (card && S.view === 'folders') { openFolder(card.dataset.id); return; }
  if (e.target.closest?.('#pileArea') && S.phase === 'pile') { const b = boardRect(); engine.stir(e.clientX - b.left, e.clientY - b.top); }
});

/* =========================================================
   Views
   ========================================================= */
function setViewsEnabled(on) { $$('#views button').forEach(b => b.disabled = !on); }
function setView(v, animate = true) {
  if (S.view === v) return;
  S.view = v; board.dataset.view = v;
  $$('#views button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  if (v !== 'folders') clearSearch(false);
  if (v === 'map') mapView.show(S.items, isDark()).catch(e => toast(e.message)); else mapView.hide();
  if (v === 'folders') $('#viewLabels').innerHTML = '';
  if (engine.tiles.length) relayout(animate);
}
$('#views').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setView(b.dataset.view); });

/* =========================================================
   Search
   ========================================================= */
function searchLayout(hits) {
  const b = boardRect(), p = rel(pileArea, b), n = hits.length;
  const ts = clamp(Math.sqrt(p.w * p.h * .5 / Math.max(1, n)), 22, 58), g = 6, cols = Math.max(1, Math.floor((p.w * .92) / (ts + g)));
  const rows = Math.ceil(n / cols), x0 = p.x + (p.w - Math.min(n, cols) * (ts + g)) / 2, y0 = p.y + (p.h - rows * (ts + g)) / 2 + 12;
  return new Map(hits.map((t, i) => [t, { x: x0 + (i % cols) * (ts + g) + ts / 2, y: y0 + Math.floor(i / cols) * (ts + g) + ts / 2, ts }]));
}

async function runSearch(q) {
  q = q.trim(); if (!q) { clearSearch(true); return; }
  if (S.phase === 'sorting' || S.phase === 'intro') return;
  setView('folders', false);
  // whole-word-start matching ("cat" finds "Cat.jpg", not "education"); filler words ignored
  const STOP = new Set(['a', 'an', 'the', 'of', 'my', 'in', 'on', 'and', 'with', 'photo', 'photos', 'picture']);
  const words = q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w && !STOP.has(w));
  const res = words.map(w => new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'iu'));
  const textHit = it => { if (!res.length) return false; const hay = `${it.name.replace(/[_\-.]/g, ' ')} ${it.text || ''} ${S.cards[it.cat]?.f.name || ''}`; return res.every(r => r.test(hay)); };
  const found = new Map();
  for (const it of S.items) if (textHit(it)) found.set(it, 1);
  let how = 'name & text';
  if (ai.ready && S.aiOn) {
    const ranked = await ai.search(q, S.items);
    const top = ranked[0]?.score ?? 0;
    ranked.filter(r => r.score >= Math.max(.21, top - .035)).slice(0, 40).forEach(r => found.set(r.item, r.score));
    how = 'AI + text';
  }
  const hits = engine.tiles.filter(t => found.has(t.item)).slice(0, 120);
  S.search = { q, hits, pos: searchLayout(hits) };
  $('#searchLabel').textContent = hits.length ? `${hits.length} match${hits.length > 1 ? 'es' : ''} for “${q}” · ${how}` : `Nothing found for “${q}”${ai.ready ? '' : ' — turn on AI sorting to search inside photos'}`;
  $('#searchLabel').classList.remove('hidden'); $('#searchClear').classList.remove('hidden');
  $('#caption').style.opacity = 0;
  relayout(true);
}
function clearSearch(animate) {
  const had = !!S.search; S.search = null;
  $('#searchLabel').classList.add('hidden'); $('#searchClear').classList.add('hidden'); $('#caption').style.opacity = 1;
  if (had && engine.tiles.length) relayout(animate);
}
$('#searchForm').addEventListener('submit', e => { e.preventDefault(); runSearch($('#searchInput').value); $('#searchInput').blur(); });
$('#searchClear').onclick = () => { $('#searchInput').value = ''; clearSearch(true); };

/* =========================================================
   AI
   ========================================================= */
async function embedAll() {
  const items = S.items.filter(i => (i.kind === 'photo' || i.kind === 'video') && i.decoded && !i.emb);
  if (!items.length) return;
  setBusy(true, `AI is looking at your photos… 0 / ${items.length}`); setStatus('AI is looking at your photos & videos…', 'busy');
  await ai.embedItems(S.items, keyOf, p => { $('#loadingText').textContent = `AI is looking at your photos… ${Math.round(p * S.items.length).toLocaleString()} / ${S.items.length.toLocaleString()}`; progress(p); });
  progress(0);
  computeFolders(); S.vectors = await ai.folderVectors(S.folders);
  setBusy(false);
}

async function toggleAI() {
  const btn = $('#aiBtn');
  if (S.aiOn) { S.aiOn = false; btn.classList.remove('on'); $('#aiLabel').textContent = 'AI sorting'; await resort(); toast('AI sorting off — using file types, names and colours.'); return; }
  if (S.phase === 'sorting' || S.phase === 'intro') return;
  btn.classList.add('loading');
  try {
    if (!ai.ready) {
      setStatus('Downloading the AI model (once, ~150 MB)…', 'busy');
      await ai.load(p => { $('#aiLabel').textContent = `AI ${Math.round(p * 100)}%`; });
    }
    S.aiOn = true; $('#aiLabel').textContent = 'AI on';
    await embedAll();
    btn.classList.add('on');
    await resort();
    setStatus('AI sorting on — photos & videos sorted by what they show', 'done');
    toast('AI on. Drag a tile to another folder to teach it.');
  } catch (e) {
    console.error(e); S.aiOn = false; setBusy(false); $('#aiLabel').textContent = 'AI sorting';
    toast('AI could not start: ' + e.message, 6000); setStatus('AI unavailable', '');
  } finally { btn.classList.remove('loading'); }
}
$('#aiBtn').onclick = toggleAI;

/* custom folders */
function renderCustom() {
  $('#customList').innerHTML = S.custom.map((n, i) => `<span>✦ ${esc(n)}<button data-i="${i}" aria-label="Remove ${esc(n)}">✕</button></span>`).join('');
}
$('#folderForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('#folderName').value.trim(); if (!name || S.custom.includes(name)) return;
  if (S.phase === 'sorting' || S.phase === 'intro') return;
  S.custom.push(name); store.set('custom', S.custom); $('#folderName').value = ''; renderCustom();
  computeFolders(); if (S.aiOn) S.vectors = await ai.folderVectors(S.folders);
  await resort();
  toast(S.aiOn ? `Created “${name}” — the AI is filling it.` : `Created “${name}”. Documents mentioning it go there; turn on AI sorting to match photos too.`, 5000);
});
$('#customList').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b || S.phase === 'sorting') return;
  S.custom.splice(+b.dataset.i, 1); store.set('custom', S.custom); renderCustom(); await resort();
});

/* =========================================================
   Folder modal + lightbox
   ========================================================= */
let modalList = [];
function openList(title, items, sub = '', cover = null) {
  modalList = items;
  $('#mTitle').textContent = title; $('#mSub').textContent = sub || `${items.length.toLocaleString()} file${items.length === 1 ? '' : 's'}`;
  $('#mCover').classList.toggle('hidden', !cover); if (cover) $('#mCover').src = cover;
  $('#mGrid').innerHTML = items.length ? items.slice(0, 2000).map((it, i) => `<figure data-i="${i}"><img src="${urlOf(it)}" alt="" loading="lazy"><figcaption title="${esc(it.path || it.name)}">${esc(it.name)}</figcaption></figure>`).join('') : '<div class="empty">Nothing in here yet.</div>';
  $('#lightbox').classList.add('hidden');
  $('#modal').classList.add('open'); $('#modal').setAttribute('aria-hidden', 'false');
}
function openFolder(id) {
  const c = S.cards[id]; if (!c) return;
  let list = c.members.map(t => t.item), preview = !list.length;
  if (preview) list = S.items.filter(i => i.cat === id);
  const best = c.members.length ? c.el.querySelector('.fhead img').src : null;
  openList(c.f.name, list, preview ? (list.length ? `${list.length} files will land here — hit Sort` : 'Empty folder') : null, c.el.classList.contains('has-cover') ? best : null);
}
$('#mGrid').addEventListener('click', e => { const f = e.target.closest('figure'); if (f) openItem(modalList[+f.dataset.i], modalList); });

async function openItem(it, list = [it]) {
  if (!$('#modal').classList.contains('open')) openList(S.cards[it.cat]?.f.name || 'File', list);
  const lb = $('#lightbox'), media = $('#lbMedia'); lb.classList.remove('hidden');
  media.innerHTML = `<img src="${urlOf(it)}" alt="">`;
  $('#lbName').textContent = it.name;
  const meta = [
    ['Folder', S.cards[it.cat]?.f.name || it.cat], ['Why', it.reason || '—'], ['Size', fmtBytes(it.size)],
    ['Date', it.date ? it.date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'],
    it.w ? ['Dimensions', `${it.w} × ${it.h}`] : null, it.duration ? ['Length', `${Math.round(it.duration)} s`] : null,
    it.pages ? ['Pages', it.pages] : null, it.gps ? ['Location', `${it.gps.lat.toFixed(3)}, ${it.gps.lon.toFixed(3)}`] : null,
    it.sharp != null && it.kind === 'photo' ? ['Sharpness', Math.round(it.sharp)] : null, ['Path', it.entry?.abs || it.path],
  ].filter(Boolean);
  $('#lbMeta').innerHTML = meta.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  const sel = $('#lbMove'), t = engine.tiles.find(x => x.item === it);
  const options = S.folders.filter(f => f.id === 'dupes' || f.kinds.includes(it.kind));
  sel.innerHTML = options.map(f => `<option value="${f.id}" ${f.id === it.cat ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
  sel.disabled = !(t?.card && S.phase === 'sorted');
  sel.onchange = () => { if (t?.card) { teach(t, S.cards[sel.value]); openItem(it, list); } };
  $('#lbReveal').classList.toggle('hidden', !(desktop && it.entry?.abs));
  $('#lbReveal').onclick = () => desktop.reveal(it.entry.abs);
  // full-size original for real files the browser can show
  if (it.entry && Files.isPreviewable(it.name)) {
    try {
      const file = await it.entry.getFile(); if (it._full) URL.revokeObjectURL(it._full); it._full = URL.createObjectURL(file);
      const k = it.family === 'pdf' ? 'pdf' : it.kind;
      media.innerHTML = k === 'video' ? `<video src="${it._full}" controls autoplay muted playsinline></video>` : k === 'audio' ? `<div><img src="${urlOf(it)}" alt=""><audio src="${it._full}" controls style="width:100%;margin-top:12px"></audio></div>`
        : k === 'pdf' ? `<iframe src="${it._full}" title="${esc(it.name)}"></iframe>` : it.family === 'text' ? `<pre>${esc((await file.slice(0, 50000).text()))}</pre>` : `<img src="${it._full}" alt="">`;
    } catch { }
  } else if (it.text && it.kind === 'doc') media.innerHTML = `<div style="display:grid;gap:12px;width:100%;height:100%;grid-template-rows:auto 1fr"><img src="${urlOf(it)}" alt="" style="max-height:200px;justify-self:center"><pre>${esc(it.text)}</pre></div>`;
}
$('#lbBack').onclick = () => $('#lightbox').classList.add('hidden');
const closeModal = () => { $('#modal').classList.remove('open'); $('#modal').setAttribute('aria-hidden', 'true'); $('#lbMedia').innerHTML = ''; };
$('#mClose').onclick = closeModal;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

/* =========================================================
   Moving files
   ========================================================= */
function plan() { return engine.tiles.filter(t => t.card).map(t => ({ entry: t.item.entry, folder: t.card.f.name })).filter(p => p.entry); }

function updateTools() {
  const sorted = S.phase === 'sorted', src = S.source;
  $('#replayBtn').classList.toggle('hidden', !sorted);
  $('#applyBtn').classList.toggle('hidden', !(sorted && src?.canMove && !S.moves));
  $('#undoBtn').classList.toggle('hidden', !S.moves);
  $('#exportBtn').classList.toggle('hidden', !(sorted && src && !src.canMove && !src.readOnly));
}

$('#applyBtn').onclick = async () => {
  const p = plan(); if (!p.length) return;
  const folders = new Set(p.map(x => x.folder)).size;
  if (!confirm(`Move ${p.length.toLocaleString()} files into ${folders} folders inside “${S.source.name}/Sorted”?\n\nNothing is deleted or overwritten, and you can undo this until you close the app.`)) return;
  setBusy(true, 'Moving files…');
  try {
    S.moves = await Files.applyMoves(S.source, p, x => { $('#loadingText').textContent = `Moving files… ${Math.round(x * 100)}%`; progress(x); });
    toast(`Moved ${p.length.toLocaleString()} files into “${S.source.name}/Sorted”.`, 5000);
    setStatus(`Moved ${p.length.toLocaleString()} files on disk`, 'done');
  } catch (e) { console.error(e); toast('Could not move files: ' + e.message, 6000); }
  setBusy(false); progress(0); updateTools();
};
$('#undoBtn').onclick = async () => {
  if (!S.moves) return;
  setBusy(true, 'Putting files back…');
  try { await Files.undoMoves(S.moves, x => progress(x)); S.moves = null; toast('Every file is back where it was.'); setStatus('Moves undone', 'done'); }
  catch (e) { console.error(e); toast('Undo stopped: ' + e.message, 6000); }
  setBusy(false); progress(0); updateTools();
};
$('#exportBtn').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([Files.shellScript(S.source.name, plan())], { type: 'text/x-shellscript' })); a.download = 'sort-files.sh'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('sort-files.sh downloaded — it only prints what it would do unless you run it with DRY_RUN=0.', 5000);
};
$('#replayBtn').onclick = () => { const order = S.lastOrder; messItUp(() => startSort(order)); };

/* =========================================================
   Loading menu
   ========================================================= */
const loadMenu = $('#loadMenu');
$('#loadBtn').onclick = e => { e.stopPropagation(); loadMenu.classList.toggle('open'); $('#folderMenu').classList.remove('open'); };
$('#addFolderBtn').onclick = e => { e.stopPropagation(); $('#folderMenu').classList.toggle('open'); loadMenu.classList.remove('open'); if ($('#folderMenu').classList.contains('open')) $('#folderName').focus(); };
$('#folderMenu').addEventListener('click', e => e.stopPropagation());
document.addEventListener('click', () => { loadMenu.classList.remove('open'); $('#folderMenu').classList.remove('open'); });
loadMenu.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return; loadMenu.classList.remove('open');
  if (S.phase === 'sorting' || S.phase === 'intro') return;
  const kind = b.dataset.load;
  try {
    if (kind === 'demo') return await loadDemo();
    if (desktop) return await loadSource(await Files.desktopFolder(kind));
    if (Files.canWriteInBrowser()) {
      setStatus('Choose a folder…', 'busy');
      return await loadSource(await Files.pickBrowserFolder(n => setStatus(`Found ${n.toLocaleString()} files…`, 'busy')));
    }
    $('#picker').click();
  } catch (err) {
    if (err?.name !== 'AbortError') { console.error(err); toast(err.message || String(err), 6000); }
    setStatus(S.phase === 'pile' ? 'Ready to sort' : 'Ready', '');
  }
});
$('#picker').onchange = e => { if (e.target.files.length) loadSource(Files.fromFileList(e.target.files)); e.target.value = ''; };

/* =========================================================
   Desktop bridge: auto-sort new downloads
   ========================================================= */
async function onNewDownload(f) {
  const entry = Files.desktopEntry(f), item = Object.assign(await analyzeEntry(entry), { id: S.items.length ? Math.max(...S.items.map(i => i.id)) + 1 : 0, entry });
  const twin = S.items.find(o => o.hash && item.hash && o.kind === item.kind && hamming(o.hash, item.hash) <= 3 && Math.abs(o.size - item.size) < 1024);
  if (twin) { item.dupOf = twin.id; item.dupReason = `Same as ${twin.name}`; }
  if (S.aiOn && ai.ready && item.decoded && (item.kind === 'photo' || item.kind === 'video')) await ai.embedItems([item], keyOf);
  const showing = S.mode === 'real' && S.source?.dir === f.root;
  if (!showing) computeFolders();
  Object.assign(item, classifyOne(item));
  const folder = (S.folders.find(x => x.id === item.cat) || { name: 'Other files' }).name;
  if (showing) {
    S.items.push(item);
    const b = boardRect(), t = await engine.addItem(item, { x: b.width / 2, y: -40 });
    if (S.phase === 'sorted') { const c = S.cards[item.cat]; t.card = c; c.members.push(t); t.jit = { slot: Math.random() * 1e6 | 0, dx: rnd(-5, 5), dy: rnd(-4, 4), r: rnd(-14, 14) }; c.n++; c.countEl.textContent = c.n; c.el.classList.add('live'); engine.flyTo(t, slotPos(t), { dur: 1300 }); }
    else engine.toPile(t, { dur: 1100 });
    showStats();
  }
  const r = await desktop.move(f.abs, `${f.root}/Sorted/${folder}`);
  if (!r.error) { entry.abs = r.path; entry.url = desktop.fileUrl(r.path); desktop.notify(`Sorted ${item.name}`, `→ ${folder}  ·  ${item.reason || ''}`); }
}

/* =========================================================
   Keyboard + boot
   ========================================================= */
document.addEventListener('keydown', e => {
  if (e.target.closest('input,textarea,select')) { if (e.key === 'Escape') e.target.blur(); return; }
  if (e.key === 'Escape') { if (!$('#lightbox').classList.contains('hidden')) $('#lightbox').classList.add('hidden'); else if ($('#modal').classList.contains('open')) closeModal(); else if (S.search) $('#searchClear').click(); }
  else if (e.code === 'Space') { e.preventDefault(); S.phase === 'sorted' ? messItUp() : startSort(); }
  else if (e.key === 'r') messItUp();
  else if (e.key === '/') { e.preventDefault(); $('#searchInput').focus(); }
  else if ('1234'.includes(e.key) && S.phase !== 'sorting') setView(['folders', 'rainbow', 'timeline', 'map'][+e.key - 1]);
});
$('#sortBtn').onclick = () => startSort();
$('#resetBtn').onclick = () => messItUp();
$('#themeBtn').onclick = () => { theme = THEMES[(THEMES.indexOf(theme) + 1) % 3]; store.set('theme', theme); applyTheme(); };
$('#soundBtn').innerHTML = SPK_OFF;
$('#soundBtn').onclick = () => { soundOn = !soundOn; $('#soundBtn').innerHTML = soundOn ? SPK_ON : SPK_OFF; if (soundOn) { actx ??= new AudioContext(); actx.resume(); tick(880); } };
let rz = 0; addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => engine.tiles.length && relayout(false)); });
document.fonts?.ready.then(() => engine.tiles.length && relayout(false));

(async function boot() {
  applyTheme(); renderCustom();
  if (desktop) {
    document.body.classList.add('desktop'); $('#envBadge').textContent = 'MAC APP'; $('#folderHint').textContent = 'Moves files natively, with undo';
    desktop.onNewFile(f => onNewDownload(f).catch(e => console.error('auto-sort failed', e)));
    desktop.onCommand(c => { if (c === 'load-downloads' && S.phase !== 'sorting') Files.desktopFolder('downloads').then(loadSource).catch(e => toast(e.message)); });
  } else $('#folderHint').textContent = Files.canWriteInBrowser() ? 'Can move files, with undo' : 'Read-only here — exports a script';
  await engine.init();
  // handy for debugging in DevTools, and used by the screenshot tour (npm run screenshots)
  window.__sorter = { S, engine, ai, startSort, setView, runSearch, clearSearch, openFolder, openItem, closeModal, toggleAI, setTheme: t => { theme = t; applyTheme(); } };
  await loadDemo();
})().catch(e => { console.error(e); setStatus('Something went wrong — see the console', ''); toast(String(e.message || e), 8000); });
