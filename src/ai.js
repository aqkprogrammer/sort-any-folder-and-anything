// Main-thread side of the on-device AI: embedding cache, folder matching, search and
// learning from the user's drag-and-drop corrections.

import { idb, store } from './util.js';

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const mean = vs => { const m = new Float32Array(vs[0].length); vs.forEach(v => v.forEach((x, i) => m[i] += x)); const n = Math.hypot(...m) || 1; return m.map(x => x / n); };

export class AI {
  constructor() {
    this.worker = null; this.ready = false; this.loading = null; this.seq = 0; this.pending = new Map();
    this.textCache = new Map();
    this.examples = store.get('examples', []).map(e => ({ cat: e.cat, v: Float32Array.from(e.v) }));
  }

  call(type, payload = {}) {
    return new Promise((res, rej) => { const id = ++this.seq; this.pending.set(id, { res, rej }); this.worker.postMessage({ id, type, ...payload }); });
  }

  load(onProgress) {
    if (this.loading) return this.loading;
    this.worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
    const files = {};
    this.worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        files[data.file] = data; const all = Object.values(files);
        onProgress?.(all.reduce((a, f) => a + f.loaded, 0) / Math.max(1, all.reduce((a, f) => a + f.total, 0)));
        return;
      }
      const p = this.pending.get(data.id); if (!p) return; this.pending.delete(data.id);
      data.error ? p.rej(new Error(data.error)) : p.res(data.result);
    };
    this.worker.onerror = e => { for (const p of this.pending.values()) p.rej(new Error(e.message || 'AI worker failed')); this.pending.clear(); };
    this.loading = this.call('load').then(info => { this.ready = true; this.info = info; return info; })
      .catch(e => { this.loading = null; this.worker.terminate(); throw e; });
    return this.loading;
  }

  async embedTexts(texts) {
    const missing = texts.filter(t => !this.textCache.has(t));
    if (missing.length) (await this.call('texts', { texts: missing })).forEach((v, i) => this.textCache.set(missing[i], v));
    return texts.map(t => this.textCache.get(t));
  }

  // Adds item.emb to every photo/video. Cached in IndexedDB so a folder is only "seen" once.
  async embedItems(items, keyOf, onProgress) {
    const todo = [];
    for (const it of items) {
      if (it.emb || !(it.kind === 'photo' || it.kind === 'video') || !it.decoded) continue;
      const cached = await idb.get('emb:' + keyOf(it));
      if (cached) it.emb = cached; else todo.push(it);
    }
    let done = items.length - todo.length;
    for (let i = 0; i < todo.length; i += 8) {
      const batch = todo.slice(i, i + 8), vecs = await this.call('images', { blobs: batch.map(b => b.preview) });
      batch.forEach((it, k) => { it.emb = vecs[k]; idb.set('emb:' + keyOf(it), vecs[k]); });
      done += batch.length; onProgress?.(done / items.length);
    }
  }

  async folderVectors(folders) {
    const out = new Map();
    for (const f of folders) if (f.prompts) out.set(f.id, mean(await this.embedTexts(f.prompts)));
    return out;
  }

  // Picks the best folder among candidates. Corrections the user taught win when very similar.
  classify(item, candidates, vectors) {
    const allowed = new Set(candidates.map(f => f.id));
    let best = null, bestSim = -1;
    for (const ex of this.examples) { if (!allowed.has(ex.cat)) continue; const s = dot(item.emb, ex.v); if (s > bestSim) { bestSim = s; best = ex.cat; } }
    if (best && bestSim >= .9) return { cat: best, reason: `Looks like a photo you moved to this folder (${Math.round(bestSim * 100)}% similar)` };
    const scored = candidates.filter(f => vectors.has(f.id)).map(f => ({ f, s: dot(item.emb, vectors.get(f.id)) })).sort((a, b) => b.s - a.s);
    if (!scored.length) return null;
    const exps = scored.map(x => Math.exp(100 * (x.s - scored[0].s))), conf = exps[0] / exps.reduce((a, b) => a + b, 0);
    return { cat: scored[0].f.id, reason: `AI: best match “${scored[0].f.name}” (${Math.round(conf * 100)}% confident)` };
  }

  async search(query, items) {
    const [q] = await this.embedTexts([`a photo of ${query}`]);
    return items.filter(i => i.emb).map(item => ({ item, score: dot(item.emb, q) })).sort((a, b) => b.score - a.score);
  }

  learn(item, cat) {
    if (!item.emb) return;
    this.examples.push({ cat, v: item.emb });
    if (this.examples.length > 300) this.examples.shift();
    store.set('examples', this.examples.map(e => ({ cat: e.cat, v: Array.from(e.v, x => +x.toFixed(4)) })));
  }

  similar(item, items, min = .9) { return items.filter(o => o !== item && o.emb && dot(o.emb, item.emb) >= min); }
}
