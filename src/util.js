// Small shared helpers: DOM, math, seeded random, formatting, storage.

export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rnd = (a, b) => a + Math.random() * (b - a);
export const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const nextFrame = () => new Promise(r => requestAnimationFrame(r));

export function makeRng(seed) {
  let a = seed >>> 0;
  const f = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  return { f, r: (x, y) => x + f() * (y - x), int: (x, y) => Math.floor(x + f() * (y - x + 1)), pick: arr => arr[Math.floor(f() * arr.length)], chance: p => f() < p };
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

export function fmtBytes(n) {
  if (!n) return '0 MB';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n >= 100 || i < 2 ? Math.round(n) : n.toFixed(1)} ${u[i]}`;
}

export const ext = name => { const i = name.lastIndexOf('.'); return i > 0 ? name.slice(i + 1).toLowerCase() : ''; };

// localStorage can throw (private windows, blocked storage) — never let that break the app.
export const store = {
  get(k, d) { try { const v = localStorage.getItem('ps:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ps:' + k, JSON.stringify(v)); } catch { } },
};

// Tiny IndexedDB key/value store (used to cache AI embeddings between sessions).
let dbp = null;
function db() {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open('photo-sorter', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
export const idb = {
  async get(key) { try { const d = await db(); return await new Promise(r => { const q = d.transaction('kv').objectStore('kv').get(key); q.onsuccess = () => r(q.result); q.onerror = () => r(undefined); }); } catch { return undefined; } },
  async set(key, val) { try { const d = await db(); await new Promise(r => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(val, key); t.oncomplete = r; t.onerror = r; }); } catch { } },
};

let toastTimer = 0;
export function toast(msg, ms = 3800) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

export function countUp(el, to, fmt = n => Math.round(n).toLocaleString(), dur = 1300) {
  const from = el._v || 0, s = performance.now(); el._v = to;
  const step = n => { const k = clamp((n - s) / dur, 0, 1); el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

export const FOLDER_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/></svg>';
