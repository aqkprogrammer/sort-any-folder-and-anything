// Alternative arrangements of the same tiles: a colour mosaic, a timeline histogram and a map.

import { esc } from './util.js';

// Largest square size that fits n tiles in a w×h box.
function fit(n, w, h, max = 64) {
  for (let ts = max; ts >= 4; ts -= .5) {
    const g = Math.max(1, ts * .12), cols = Math.floor(w / (ts + g)), rows = Math.floor(h / (ts + g));
    if (cols * rows >= n) return { ts, g, cols, rows };
  }
  return { ts: 4, g: 1, cols: Math.floor(w / 5), rows: Math.floor(h / 5) };
}

export function rainbowLayout(tiles, r) {
  const colorful = [], grey = [];
  for (const t of tiles) (t.item.stats && t.item.stats.chroma > .05 && t.item.stats.sat > .12 ? colorful : grey).push(t);
  colorful.sort((a, b) => a.item.stats.hue - b.item.stats.hue || a.item.stats.lum - b.item.stats.lum);
  grey.sort((a, b) => (b.item.stats?.lum ?? 0) - (a.item.stats?.lum ?? 0));
  const all = [...colorful, ...grey], W = r.w - 20, Hh = r.h - 34, { ts, g, rows } = fit(all.length, W, Hh);
  const used = Math.ceil(all.length / rows) * (ts + g), x0 = r.x + (r.w - used) / 2, y0 = r.y + 6;
  const pos = new Map();
  all.forEach((t, i) => { const c = Math.floor(i / rows), k = i % rows; pos.set(t, { x: x0 + c * (ts + g) + ts / 2, y: y0 + k * (ts + g) + ts / 2, ts }); });
  return { pos, labels: `<div class="hue-bar" style="left:${x0}px;width:${used}px;top:${y0 + rows * (ts + g) + 8}px;bottom:auto"></div>` };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function timelineLayout(tiles, r) {
  const W = r.w - 20, Hh = r.h - 54, maxCols = Math.max(4, Math.floor(W / 44));
  const keyers = [
    d => [d.getFullYear() * 12 + d.getMonth(), `${MONTHS[d.getMonth()]} ’${String(d.getFullYear()).slice(2)}`],
    d => [d.getFullYear() * 4 + Math.floor(d.getMonth() / 3), `Q${Math.floor(d.getMonth() / 3) + 1} ’${String(d.getFullYear()).slice(2)}`],
    d => [d.getFullYear(), String(d.getFullYear())],
  ];
  let groups;
  for (const keyer of keyers) {
    groups = new Map();
    for (const t of tiles) { const d = t.item.date instanceof Date && !isNaN(t.item.date) ? t.item.date : new Date(0); const [k, label] = keyer(d); if (!groups.has(k)) groups.set(k, { label, tiles: [] }); groups.get(k).tiles.push(t); }
    if (groups.size <= maxCols) break;
  }
  const list = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
  const colW = W / list.length, maxN = Math.max(...list.map(g => g.tiles.length));
  let ts = 40, g = 4, per = 1;
  for (; ts > 3; ts -= .5) { g = Math.max(1, ts * .12); per = Math.max(1, Math.floor((colW - 6) / (ts + g))); if (Math.ceil(maxN / per) * (ts + g) <= Hh) break; }
  const pos = new Map(), bottom = r.y + r.h - 30; let labels = '';
  list.forEach((grp, i) => {
    const cx = r.x + 10 + (i + .5) * colW, width = per * (ts + g), x0 = cx - width / 2;
    grp.tiles.sort((a, b) => a.item.date - b.item.date);
    grp.tiles.forEach((t, k) => pos.set(t, { x: x0 + (k % per) * (ts + g) + ts / 2, y: bottom - Math.floor(k / per) * (ts + g) - ts / 2, ts }));
    const top = bottom - Math.ceil(grp.tiles.length / per) * (ts + g);
    labels += `<span style="left:${cx}px;top:${bottom + 6}px">${esc(grp.label)}</span><span style="left:${cx}px;top:${top - 18}px"><b>${grp.tiles.length}</b></span>`;
  });
  return { pos, labels };
}

/* ---------- map ---------- */
let leafletP = null;
function loadLeaflet() {
  leafletP ??= new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.append(css);
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload = () => res(window.L); s.onerror = () => rej(new Error('Map library failed to load')); document.head.append(s);
  });
  return leafletP;
}

export class MapView {
  constructor(el, { urlOf, onOpen }) { this.el = el; this.urlOf = urlOf; this.onOpen = onOpen; this.map = null; }
  async show(items, dark) {
    const L = await loadLeaflet();
    this.items = items.filter(i => i.gps);
    this.el.classList.remove('hidden');
    if (!this.map) {
      this.map = L.map(this.el, { worldCopyJump: true, zoomControl: true }).setView([25, 10], 2);
      this.layer = L.layerGroup().addTo(this.map);
      this.map.on('zoomend moveend', () => this.render());
      this.empty = Object.assign(document.createElement('div'), { className: 'map-empty' }); this.el.append(this.empty);
    }
    // Standard OpenStreetMap tiles (no API key); restyled with CSS filters for light/dark.
    this.tiles ??= L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(this.map);
    this.el.classList.toggle('dark', !!dark);
    this.empty.textContent = this.items.length ? '' : 'No files with GPS locations in this folder.';
    this.map.invalidateSize();
    if (this.items.length) this.map.fitBounds(L.latLngBounds(this.items.map(i => [i.gps.lat, i.gps.lon])).pad(.2), { maxZoom: 12 });
    this.render();
  }
  hide() { this.el.classList.add('hidden'); }
  render() {
    if (!this.map) return;
    const L = window.L, buckets = new Map();
    for (const it of this.items) {
      const p = this.map.latLngToLayerPoint([it.gps.lat, it.gps.lon]), k = `${Math.floor(p.x / 64)}:${Math.floor(p.y / 64)}`;
      if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(it);
    }
    this.layer.clearLayers();
    for (const list of buckets.values()) {
      const f = list[0], html = `<div class="pin"><img src="${this.urlOf(f)}" alt="">${list.length > 1 ? `<b>${list.length}</b>` : ''}</div>`;
      L.marker([f.gps.lat, f.gps.lon], { icon: L.divIcon({ className: 'pin-icon', html, iconSize: [46, 46], iconAnchor: [23, 23] }) })
        .on('click', () => this.onOpen(list)).addTo(this.layer);
    }
  }
}
