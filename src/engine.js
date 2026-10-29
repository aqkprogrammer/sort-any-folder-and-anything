// WebGL tile renderer (PixiJS). Thumbnails are packed into texture atlases so 10,000+ files
// animate in a handful of draw calls. The engine only knows about motion; app.js decides where
// each tile should go.

import { Application, Container, Sprite, Texture, Rectangle, CanvasSource } from 'https://cdn.jsdelivr.net/npm/pixi.js@8.6.6/dist/pixi.min.mjs';
import { clamp, lerp, rnd, easeInOut } from './util.js';

const ATLAS_W = 2048;
const pot = n => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

export class Engine {
  constructor(host) {
    this.host = host; this.tiles = []; this.queue = []; this.textures = [];
    this.mouse = { x: -1e4, y: -1e4, on: false };
    this.T = 34; this.IMG = 88; this.pile = { cx: 0, cy: 0, R: 200 };
    this.drag = null;
  }

  async init() {
    this.app = new Application();
    await this.app.init({ resizeTo: this.host, backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true, preference: 'webgl' });
    this.app.canvas.className = 'gl';
    this.host.append(this.app.canvas);
    this.layers = { pile: new Container(), rest: new Container(), fly: new Container(), drag: new Container() };
    Object.values(this.layers).forEach(l => this.app.stage.addChild(l));
    this.app.ticker.add(() => this.step(performance.now()));
  }

  get renderer() { return this.app.renderer.name || (this.app.renderer.type === 1 ? 'webgl' : 'webgpu'); }

  /* ---------- textures ---------- */
  async buildTextures(items, onProgress) {
    const IMG = this.IMG, CELL = IMG + 8, PER_ROW = Math.floor(ATLAS_W / CELL), PER_ATLAS = PER_ROW * Math.floor(ATLAS_W / CELL);
    const out = new Array(items.length), bw = Math.max(2, IMG * .035), rad = IMG * .22;
    for (let a = 0; a < items.length; a += PER_ATLAS) {
      const chunk = items.slice(a, a + PER_ATLAS), rows = Math.ceil(chunk.length / PER_ROW);
      const canvas = document.createElement('canvas'); canvas.width = chunk.length < PER_ROW ? pot(chunk.length * CELL) : ATLAS_W; canvas.height = pot(rows * CELL);
      const ctx = canvas.getContext('2d'), frames = [];
      for (let i = 0; i < chunk.length; i += 48) {
        const bmps = await Promise.all(chunk.slice(i, i + 48).map(it => createImageBitmap(it.preview).catch(() => null)));
        bmps.forEach((bmp, k) => {
          const n = i + k, x = (n % PER_ROW) * CELL + 4, y = Math.floor(n / PER_ROW) * CELL + 4;
          ctx.save(); ctx.shadowColor = 'rgba(70,25,45,.3)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
          ctx.beginPath(); ctx.roundRect(x, y, IMG, IMG, rad); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
          if (bmp) { ctx.save(); ctx.beginPath(); ctx.roundRect(x + bw, y + bw, IMG - 2 * bw, IMG - 2 * bw, rad - bw); ctx.clip(); ctx.drawImage(bmp, x + bw, y + bw, IMG - 2 * bw, IMG - 2 * bw); ctx.restore(); bmp.close(); }
          frames.push(new Rectangle(x - 4, y - 4, CELL, CELL));
        });
        onProgress?.((a + i + 48) / items.length);
      }
      const source = new CanvasSource({ resource: canvas, autoGenerateMipmaps: true, scaleMode: 'linear' });
      this.textures.push(source);
      frames.forEach((frame, k) => { out[a + k] = new Texture({ source, frame }); });
    }
    return out;
  }

  async setItems(items, onProgress) {
    for (const t of this.tiles) t.sprite.destroy();
    for (const s of this.textures) s.destroy();
    this.tiles = []; this.textures = []; this.queue = [];
    this.IMG = items.length <= 2500 ? 88 : 56;
    const tex = await this.buildTextures(items, onProgress);
    const now = performance.now(), w = this.host.clientWidth;
    const order = items.map((_, i) => i).sort(() => Math.random() - .5);
    for (let i = 0; i < items.length; i++) {
      const sp = new Sprite(tex[i]); sp.anchor.set(.5); sp.visible = false;
      const t = { item: items[i], sprite: sp, x: rnd(0, w), y: rnd(-160, -20), r: rnd(-60, 60), s: 1, vx: 0, vy: 0,
        a: Math.random() * Math.PI * 2, rf: Math.sqrt(Math.random()), hr: rnd(-28, 28), ph: Math.random() * 6.28,
        state: 'pile', alpha: 1, ta: 1, activeAt: now + order[i] * Math.min(4, 1500 / items.length) };
      sp.tile = t; this.layers.pile.addChild(sp); this.tiles.push(t);
    }
    this.layoutPile();
    return this.tiles;
  }

  async addItem(item, from) {
    const [tex] = await this.buildTextures([item]);
    const sp = new Sprite(tex); sp.anchor.set(.5);
    const t = { item, sprite: sp, x: from.x, y: from.y, r: rnd(-20, 20), s: 1.6, vx: 0, vy: 0, a: Math.random() * 6.28, rf: Math.sqrt(Math.random()), hr: rnd(-28, 28), ph: Math.random() * 6.28, state: 'rest', alpha: 0, ta: 1, activeAt: 0 };
    sp.tile = t; this.layers.rest.addChild(sp); this.tiles.push(t); this.homeOf(t);
    return t;
  }

  /* ---------- geometry ---------- */
  setPile(cx, cy, R) { Object.assign(this.pile, { cx, cy, R }); this.layoutPile(); }
  layoutPile() {
    const { R } = this.pile, n = Math.max(1, this.tiles.length);
    this.T = clamp(Math.sqrt(Math.PI * R * R * 2.3 / n), 9, 46);
    this.tiles.forEach(t => this.homeOf(t));
  }
  homeOf(t) { const { cx, cy, R } = this.pile; t.hx = cx + Math.cos(t.a) * t.rf * R * 1.06; t.hy = cy + Math.sin(t.a) * t.rf * R * .98; }

  /* ---------- scheduling ---------- */
  at(time, fn) {
    const q = this.queue; let lo = 0, hi = q.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (q[m].at <= time) lo = m + 1; else hi = m; }
    q.splice(lo, 0, { at: time, fn });
  }
  clearQueue() { this.queue = []; }

  /* ---------- motion ---------- */
  // target: {x,y,r,s} in board pixels; s is relative to the pile tile size T.
  flyTo(t, target, { dur, onLand, pile = false, lift = 1, now = performance.now() } = {}) {
    const dist = Math.hypot(target.x - t.x, target.y - t.y);
    t.tw = { x0: t.x, y0: t.y, r0: t.r, s0: t.s, x1: target.x, y1: target.y, r1: target.r ?? 0, s1: target.s ?? 1,
      cx: (t.x + target.x) / 2 + rnd(-50, 50) * lift, cy: Math.min(t.y, target.y) - rnd(40, 140) * lift, t0: now, dur: dur ?? clamp(560 + dist * .85, 650, 1350), onLand, pile };
    t.state = 'fly'; this.layers.fly.addChild(t.sprite);
  }
  retarget(t, target) { if (t.state === 'fly' && t.tw) Object.assign(t.tw, { x1: target.x, y1: target.y, s1: target.s ?? t.tw.s1, r1: target.r ?? t.tw.r1 }); }
  snap(t, target) { Object.assign(t, { x: target.x, y: target.y, r: target.r ?? 0, s: target.s ?? 1, state: 'rest' }); this.layers.rest.addChild(t.sprite); }
  toPile(t, opts = {}) { this.flyTo(t, { x: t.hx, y: t.hy, r: t.hr, s: 1 }, { ...opts, pile: true }); }

  stir(x, y) {
    for (const t of this.tiles) {
      if (t.state !== 'pile') continue;
      const dx = t.x - x, dy = t.y - y, d = Math.hypot(dx, dy) || 1;
      if (d < 180) { const f = (180 - d) / 180 * 26; t.vx += dx / d * f + rnd(-6, 6); t.vy += dy / d * f + rnd(-6, 6); t.r += rnd(-40, 40); }
    }
  }

  hit(x, y, pred = () => true) {
    for (const layer of [this.layers.fly, this.layers.rest]) {
      const ch = layer.children;
      for (let i = ch.length - 1; i >= 0; i--) {
        const t = ch[i].tile, half = this.T * t.s / 2 + 2;
        if (t.alpha > .3 && Math.abs(x - t.x) < half && Math.abs(y - t.y) < half && pred(t)) return t;
      }
    }
    return null;
  }

  startDrag(t) { this.drag = { t, x: t.x, y: t.y }; t.state = 'drag'; this.layers.drag.addChild(t.sprite); }
  moveDrag(x, y) { if (this.drag) { this.drag.x = x; this.drag.y = y; } }
  endDrag() { const d = this.drag; this.drag = null; return d?.t; }

  step(now) {
    const q = this.queue;
    while (q.length && q[0].at <= now) q.shift().fn(now);
    const T = this.T, IMG = this.IMG, time = now / 1000, m = this.mouse;
    for (const t of this.tiles) {
      const sp = t.sprite;
      if (t.activeAt > now) { sp.visible = false; continue; }
      if (t.state === 'pile') {
        let dx = t.hx + Math.sin(time * .9 + t.ph) * 1.6, dy = t.hy + Math.cos(time * .7 + t.ph) * 1.6;
        if (m.on) { const mx = t.x - m.x, my = t.y - m.y, d = Math.hypot(mx, my) || 1; if (d < 120) { const f = (120 - d) / 120; dx += mx / d * f * f * 60; dy += my / d * f * f * 60; } }
        t.vx = (t.vx + (dx - t.x) * .07) * .8; t.vy = (t.vy + (dy - t.y) * .07) * .8;
        t.x += t.vx; t.y += t.vy; t.r += (t.hr - t.r) * .08; t.s += (1 - t.s) * .15;
      } else if (t.state === 'fly') {
        const w = t.tw, k = clamp((now - w.t0) / w.dur, 0, 1), e = easeInOut(k), u = 1 - e;
        t.x = u * u * w.x0 + 2 * u * e * w.cx + e * e * w.x1; t.y = u * u * w.y0 + 2 * u * e * w.cy + e * e * w.y1;
        t.r = lerp(w.r0, w.r1, e); t.s = lerp(w.s0, w.s1, e) + Math.sin(Math.PI * k) * .35;
        if (k >= 1) {
          t.tw = null;
          if (w.pile) { t.state = 'pile'; t.vx = t.vy = 0; this.layers.pile.addChild(sp); }
          else { t.state = 'rest'; this.layers.rest.addChild(sp); }
          w.onLand?.(t);
        }
      } else if (t.state === 'drag' && this.drag?.t === t) {
        t.x += (this.drag.x - t.x) * .35; t.y += (this.drag.y - t.y) * .35; t.s += (Math.max(1.3, 44 / T) - t.s) * .2; t.r += (-6 - t.r) * .2;
      } else if (t.state === 'rest' && t.s > 0 && t.restS != null) { t.s += (t.restS - t.s) * .2; }
      t.alpha += (t.ta - t.alpha) * .15;
      sp.visible = t.alpha > .01;
      if (!sp.visible) continue;
      sp.position.set(t.x, t.y); sp.rotation = t.r * Math.PI / 180; sp.scale.set(T * t.s / IMG); sp.alpha = t.alpha;
    }
  }
}
