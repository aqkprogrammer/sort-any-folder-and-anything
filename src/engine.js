// WebGL tile renderer (PixiJS). Thumbnails are packed into texture atlases so 10,000+ files
// animate in a handful of draw calls. The engine only knows about motion and effects; app.js
// decides where each tile should go.
//
// Motion is frame-rate independent (dt-scaled springs), the pile slowly swirls like a galaxy,
// flights follow arcs with a little spin, and landings settle with a damped wobble.
// A pooled particle system draws trails, landing sparks, click ripples and confetti.

import { Application, Container, Sprite, Texture, Rectangle, CanvasSource } from 'https://cdn.jsdelivr.net/npm/pixi.js@8.6.6/dist/pixi.min.mjs';
import { clamp, lerp, rnd, easeInOut } from './util.js';

const ATLAS_W = 2048;
const pot = n => 2 ** Math.ceil(Math.log2(Math.max(2, n)));
const MAX_PARTICLES = 1400;
const CONFETTI = [0xd4ff24, 0x1558c9, 0x3fd9ff, 0xffffff, 0x7aa2ff, 0xb8f000, 0x2f6fe8];

function makeTexture(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  return Texture.from(c);
}

export class Engine {
  constructor(host) {
    this.host = host; this.tiles = []; this.queue = []; this.textures = [];
    this.mouse = { x: -1e4, y: -1e4, on: false };
    this.T = 34; this.IMG = 88; this.pile = { cx: 0, cy: 0, R: 200 }; this.pileScale = 1; this.pileScaleTo = 1;
    this.drag = null; this.particles = []; this.free = []; this.last = 0; this.flying = 0;
    this.calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  async init() {
    this.app = new Application();
    await this.app.init({ resizeTo: this.host, backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true, preference: 'webgl' });
    this.app.canvas.className = 'gl';
    this.host.append(this.app.canvas);
    this.layers = { fxBack: new Container(), pile: new Container(), rest: new Container(), fly: new Container(), drag: new Container(), fxFront: new Container() };
    Object.values(this.layers).forEach(l => this.app.stage.addChild(l));
    this.tex = {
      dot: makeTexture(64, (c, s) => { const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, s, s); }),
      star: makeTexture(64, (c, s) => { c.translate(s / 2, s / 2); c.fillStyle = '#fff'; c.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? s * .09 : s * .48, a = i * Math.PI / 4; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); }),
      ring: makeTexture(256, (c, s) => { c.strokeStyle = '#fff'; c.lineWidth = s * .035; c.beginPath(); c.arc(s / 2, s / 2, s * .45, 0, Math.PI * 2); c.stroke(); }),
      confetti: makeTexture(32, (c, s) => { c.fillStyle = '#fff'; c.beginPath(); c.roundRect(s * .3, s * .15, s * .4, s * .7, s * .08); c.fill(); }),
    };
    this.app.ticker.add(() => this.step(performance.now()));
  }

  setDark(dark) { this.dark = dark; for (const p of this.particles) p.sp.blendMode = dark ? 'add' : 'normal'; }

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

  newTile(item, tex, x, y) {
    const sp = new Sprite(tex); sp.anchor.set(.5);
    const t = { item, sprite: sp, x, y, r: rnd(-60, 60), s: .2, vx: 0, vy: 0, a: Math.random() * Math.PI * 2, rf: Math.sqrt(Math.random()), hr: rnd(-28, 28),
      ph: Math.random() * 6.28, state: 'pile', alpha: 1, ta: 1, wob: 0, spin: 0, color: 0xd4ff24, activeAt: 0 };
    sp.tile = t; return t;
  }

  async setItems(items, onProgress) {
    for (const t of this.tiles) t.sprite.destroy();
    for (const s of this.textures) s.destroy();
    this.tiles = []; this.textures = []; this.queue = []; this.flying = 0;
    this.IMG = items.length <= 2500 ? 88 : 56;
    const tex = await this.buildTextures(items, onProgress);
    const now = performance.now(), { cx, cy } = this.pile, far = Math.max(this.host.clientWidth, this.host.clientHeight) * .7;
    const order = items.map((_, i) => i).sort(() => Math.random() - .5);
    for (let i = 0; i < items.length; i++) {
      const t = this.newTile(items[i], tex[i], 0, 0);
      // spiral in from a wide ring
      const a = t.a - 2.2; t.x = cx + Math.cos(a) * far; t.y = cy + Math.sin(a) * far * .7;
      t.sprite.visible = false; t.activeAt = now + order[i] * Math.min(4, 1500 / items.length);
      this.layers.pile.addChild(t.sprite); this.tiles.push(t);
    }
    this.layoutPile();
    return this.tiles;
  }

  async addItem(item, from) {
    const [tex] = await this.buildTextures([item]);
    const t = this.newTile(item, tex, from.x, from.y); t.state = 'rest'; t.s = 1.6; t.alpha = 0;
    this.layers.rest.addChild(t.sprite); this.tiles.push(t); this.homeOf(t);
    return t;
  }

  /* ---------- geometry ---------- */
  setPile(cx, cy, R) { Object.assign(this.pile, { cx, cy, R }); this.layoutPile(); }
  layoutPile() {
    const { R } = this.pile, n = Math.max(1, this.tiles.length);
    this.T = clamp(Math.sqrt(Math.PI * R * R * 2.3 / n), 9, 46);
    this.tiles.forEach(t => this.homeOf(t));
  }
  homeOf(t) {
    const { cx, cy, R } = this.pile, k = this.pileScale;
    t.hx = cx + Math.cos(t.a) * t.rf * R * 1.06 * k; t.hy = cy + Math.sin(t.a) * t.rf * R * .98 * k;
  }
  // pull the pile in (k<1) or let it breathe out; eases back to 1
  inhale(k = .55, holdMs = 380) { this.pileScaleTo = k; setTimeout(() => { this.pileScaleTo = 1; }, holdMs); }

  /* ---------- scheduling ---------- */
  at(time, fn) {
    const q = this.queue; let lo = 0, hi = q.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (q[m].at <= time) lo = m + 1; else hi = m; }
    q.splice(lo, 0, { at: time, fn });
  }
  clearQueue() { this.queue = []; }

  /* ---------- motion ---------- */
  // target: {x,y,r,s} in board pixels; s is relative to the pile tile size T.
  flyTo(t, target, { dur, onLand, pile = false, lift = 1, now = performance.now(), spin = rnd(-50, 50) } = {}) {
    const dist = Math.hypot(target.x - t.x, target.y - t.y);
    if (t.state !== 'fly') this.flying++;
    t.tw = { x0: t.x, y0: t.y, r0: t.r, s0: t.s, x1: target.x, y1: target.y, r1: target.r ?? 0, s1: target.s ?? 1,
      cx: (t.x + target.x) / 2 + rnd(-50, 50) * lift, cy: Math.min(t.y, target.y) - rnd(40, 140) * lift, t0: now, dur: dur ?? clamp(560 + dist * .85, 650, 1350), onLand, pile, spin: this.calm ? 0 : spin * lift };
    t.state = 'fly'; this.layers.fly.addChild(t.sprite);
  }
  retarget(t, target) { if (t.state === 'fly' && t.tw) Object.assign(t.tw, { x1: target.x, y1: target.y, s1: target.s ?? t.tw.s1, r1: target.r ?? t.tw.r1 }); }
  snap(t, target) { if (t.state === 'fly') this.flying--; Object.assign(t, { x: target.x, y: target.y, r: target.r ?? 0, s: target.s ?? 1, state: 'rest', tw: null }); this.layers.rest.addChild(t.sprite); }
  toPile(t, opts = {}) { this.flyTo(t, { x: t.hx, y: t.hy, r: t.hr, s: 1 }, { ...opts, pile: true }); }

  stir(x, y) {
    for (const t of this.tiles) {
      if (t.state !== 'pile') continue;
      const dx = t.x - x, dy = t.y - y, d = Math.hypot(dx, dy) || 1;
      if (d < 200) { const f = (200 - d) / 200 * 30; t.vx += dx / d * f + rnd(-6, 6); t.vy += dy / d * f + rnd(-6, 6); t.r += rnd(-50, 50); }
    }
    this.ripple(x, y, 0x4d8bff, 1.2); this.sparks(x, y, 0xd4ff24, 14, 5);
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

  startDrag(t) { if (t.state === 'fly') this.flying--; this.drag = { t, x: t.x, y: t.y }; t.state = 'drag'; t.tw = null; this.layers.drag.addChild(t.sprite); }
  moveDrag(x, y) { if (this.drag) { this.drag.x = x; this.drag.y = y; } }
  endDrag() { const d = this.drag; this.drag = null; return d?.t; }

  /* ---------- particles ---------- */
  emit(o) {
    if (this.calm && !o.force) return;
    let p = this.free.pop();
    if (!p) {
      if (this.particles.length >= MAX_PARTICLES) return;
      p = { sp: new Sprite(this.tex.dot) }; p.sp.anchor.set(.5); p.sp.blendMode = this.dark ? 'add' : 'normal'; this.particles.push(p);
    }
    const sp = p.sp; sp.texture = this.tex[o.tex || 'dot']; sp.tint = o.color ?? 0xffffff; sp.visible = true;
    (o.front === false ? this.layers.fxBack : this.layers.fxFront).addChild(sp);
    Object.assign(p, { x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, life: 0, max: o.life || 600, size: o.size || 10, grow: o.grow ?? 0,
      g: o.g || 0, drag: o.drag ?? .96, a0: o.alpha ?? 1, rot: o.rot || 0, vr: o.vr || 0, flip: o.flip || 0, alive: true });
  }
  sparks(x, y, color, n = 8, speed = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * rnd(.4, 1.2);
      this.emit({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, color, size: rnd(5, 11), life: rnd(380, 700), tex: i % 3 ? 'dot' : 'star', vr: rnd(-.2, .2), drag: .92, g: .04 });
    }
  }
  ripple(x, y, color = 0x4d8bff, scale = 1) { this.emit({ x, y, tex: 'ring', color, size: 30 * scale, grow: 5.5 * scale, life: 650, alpha: .7, drag: 1, force: true }); }
  confetti(w, h) {
    for (let i = 0; i < 170; i++) {
      this.emit({ x: rnd(w * .1, w * .9), y: rnd(-80, -10), vx: rnd(-2.5, 2.5), vy: rnd(1, 5), g: .09, drag: .985, color: CONFETTI[i % CONFETTI.length],
        tex: 'confetti', size: rnd(10, 18), life: rnd(2200, 3600), rot: rnd(0, 6), vr: rnd(-.25, .25), flip: rnd(.1, .3) });
    }
  }

  stepParticles(dt) {
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.life += dt * 16.67;
      const k = p.life / p.max;
      if (k >= 1) { p.alive = false; p.sp.visible = false; this.free.push(p); continue; }
      const dr = Math.pow(p.drag, dt);
      p.vx *= dr; p.vy = p.vy * dr + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.size += p.grow * dt;
      const sp = p.sp, sc = p.size / 64;
      sp.position.set(p.x, p.y); sp.rotation = p.rot;
      sp.scale.set(sc * (p.flip ? Math.cos(p.life * p.flip * .02) : 1), sc);
      sp.alpha = p.a0 * (k < .1 ? k * 10 : 1 - Math.pow(k, 2));
    }
  }

  /* ---------- frame ---------- */
  step(now) {
    const dt = clamp((now - (this.last || now)) / 16.67, 0, 3); this.last = now;
    const q = this.queue;
    while (q.length && q[0].at <= now) q.shift().fn(now);
    this.pileScale += (this.pileScaleTo - this.pileScale) * (1 - Math.pow(.88, dt));
    const T = this.T, IMG = this.IMG, time = now / 1000, m = this.mouse;
    const kSpring = 1 - Math.pow(1 - .07, dt), damp = Math.pow(.8, dt), swirl = this.calm ? 0 : .0016 * dt;
    const trailP = this.calm ? 0 : Math.min(.5, 26 / Math.max(1, this.flying));
    for (const t of this.tiles) {
      const sp = t.sprite;
      if (t.activeAt > now) { sp.visible = false; continue; }
      if (t.state === 'pile') {
        t.a += swirl * (1.25 - t.rf * .7); this.homeOf(t);
        let dx = t.hx + Math.sin(time * .9 + t.ph) * 1.6, dy = t.hy + Math.cos(time * .7 + t.ph) * 1.6;
        if (m.on) { const mx = t.x - m.x, my = t.y - m.y, d = Math.hypot(mx, my) || 1; if (d < 130) { const f = (130 - d) / 130; dx += mx / d * f * f * 64; dy += my / d * f * f * 64; } }
        t.vx = (t.vx + (dx - t.x) * kSpring) * damp; t.vy = (t.vy + (dy - t.y) * kSpring) * damp;
        t.x += t.vx * dt; t.y += t.vy * dt; t.r += (t.hr - t.r) * (1 - Math.pow(.92, dt)); t.s += (1 - t.s) * (1 - Math.pow(.85, dt));
      } else if (t.state === 'fly') {
        const w = t.tw, k = clamp((now - w.t0) / w.dur, 0, 1), e = easeInOut(k), u = 1 - e;
        t.x = u * u * w.x0 + 2 * u * e * w.cx + e * e * w.x1; t.y = u * u * w.y0 + 2 * u * e * w.cy + e * e * w.y1;
        t.r = lerp(w.r0, w.r1, e) + Math.sin(Math.PI * k) * w.spin; t.s = lerp(w.s0, w.s1, e) + Math.sin(Math.PI * k) * .38;
        if (Math.random() < trailP * dt && k > .05 && k < .95) this.emit({ x: t.x + rnd(-3, 3), y: t.y + rnd(-3, 3), color: t.color, size: T * t.s * rnd(.5, .9), life: rnd(260, 420), alpha: .45, front: false, drag: .9 });
        if (k >= 1) {
          t.tw = null; this.flying--;
          if (w.pile) { t.state = 'pile'; t.vx = t.vy = 0; this.layers.pile.addChild(sp); }
          else { t.state = 'rest'; t.wob = 1; this.layers.rest.addChild(sp); }
          w.onLand?.(t);
        }
      } else if (t.state === 'drag' && this.drag?.t === t) {
        const f = 1 - Math.pow(.65, dt);
        t.x += (this.drag.x - t.x) * f; t.y += (this.drag.y - t.y) * f; t.s += (Math.max(1.35, 46 / T) - t.s) * f * .6; t.r += (-6 - t.r) * f * .6;
        if (!this.calm && Math.random() < .35 * dt) this.emit({ x: t.x, y: t.y, color: 0x4d8bff, size: 14, life: 380, alpha: .5, front: false });
      }
      let s = t.s;
      if (t.wob > .005) { t.wob *= Math.pow(.9, dt); s *= 1 + .26 * t.wob * Math.sin((1 - t.wob) * 22); }
      t.alpha += (t.ta - t.alpha) * (1 - Math.pow(.85, dt));
      sp.visible = t.alpha > .01;
      if (!sp.visible) continue;
      sp.position.set(t.x, t.y); sp.rotation = t.r * Math.PI / 180; sp.scale.set(T * s / IMG); sp.alpha = t.alpha;
    }
    this.stepParticles(dt);
  }
}
