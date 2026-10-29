// Generative sound design with the Web Audio API — no audio files.
// A small mixer (compressor + synthetic reverb) and a few instruments:
//   pluck  — glassy marimba note, one pitch per folder, panned to where the tile lands
//   bell   — vibraphone-like additive partials for chords and sparkles
//   whoosh — filtered noise sweep for tiles taking off / scattering
//   pad    — soft detuned swell under the final chord
//   tick / pop — tiny UI sounds

import { store, clamp } from './util.js';

// C major pentatonic across three octaves — any order of notes sounds pleasant.
const PENTA = [0, 2, 4, 7, 9];
export const noteFreq = i => 261.63 * Math.pow(2, (PENTA[i % 5] + 12 * Math.floor(i / 5)) / 12);

export class Sound {
  constructor() {
    this.on = store.get('sound', true);
    this.ctx = null; this.last = {}; this.voices = 0;
  }

  ensure() {
    if (!this.on) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain(); this.master.gain.value = .55;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = .003; comp.release.value = .2;
      this.master.connect(comp).connect(ctx.destination);
      // synthetic reverb: decaying stereo noise impulse
      const len = ctx.sampleRate * 2.4, ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
      this.verb = ctx.createConvolver(); this.verb.buffer = ir;
      this.wet = ctx.createGain(); this.wet.gain.value = .32; this.verb.connect(this.wet).connect(this.master);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const nd = this.noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setOn(on) { this.on = on; store.set('sound', on); if (on) this.ensure(); else this.ctx?.suspend(); }

  // limits how often a sound can fire (ms) so busy moments stay musical
  gate(name, ms) { const n = performance.now(); if (n - (this.last[name] || 0) < ms) return false; this.last[name] = n; return true; }

  out(pan = 0, send = .5) {
    const ctx = this.ctx, g = ctx.createGain(), p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(this.master);
    const s = ctx.createGain(); s.gain.value = send; p.connect(s); s.connect(this.verb);
    return g;
  }

  env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + attack + decay);
  }

  pluck(freq, { pan = 0, vel = 1, when = 0 } = {}) {
    const ctx = this.ensure(); if (!ctx || this.voices > 24) return;
    const t = ctx.currentTime + when, o = this.out(pan, .45), dur = .55;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(freq * 9, t); f.frequency.exponentialRampToValueAtTime(freq * 1.6, t + .25); f.connect(o);
    [[1, 'triangle', .5], [2.01, 'sine', .18], [4.02, 'sine', .07]].forEach(([m, type, a]) => {
      const osc = ctx.createOscillator(), g = ctx.createGain(); osc.type = type; osc.frequency.value = freq * m;
      this.env(g, t, a * .32 * vel, .004, dur / m); osc.connect(g).connect(f); osc.start(t); osc.stop(t + dur + .05);
    });
    this.voices++; setTimeout(() => this.voices--, (dur + when) * 1000 + 60);
  }

  bell(freq, { pan = 0, vel = 1, when = 0, len = 2.2 } = {}) {
    const ctx = this.ensure(); if (!ctx) return;
    const t = ctx.currentTime + when, o = this.out(pan, .7);
    [[1, .5, 1], [2.76, .18, .55], [5.4, .08, .3], [8.93, .04, .18]].forEach(([m, a, d]) => {
      const osc = ctx.createOscillator(), g = ctx.createGain(); osc.type = 'sine'; osc.frequency.value = freq * m;
      this.env(g, t, a * .25 * vel, .006, len * d); osc.connect(g).connect(o); osc.start(t); osc.stop(t + len + .1);
    });
  }

  whoosh({ from = 400, to = 2400, dur = .35, pan = 0, vel = 1, when = 0 } = {}) {
    const ctx = this.ensure(); if (!ctx) return;
    const t = ctx.currentTime + when, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), o = this.out(pan, .35), g = ctx.createGain();
    src.buffer = this.noise; src.loop = true; f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.18 * vel, t + dur * .35); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    src.connect(f).connect(g).connect(o); src.start(t, Math.random()); src.stop(t + dur + .05);
  }

  pad(freqs, { dur = 2.6, vel = 1 } = {}) {
    const ctx = this.ensure(); if (!ctx) return;
    const t = ctx.currentTime, o = this.out(0, .8), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400; f.connect(o);
    for (const fr of freqs) for (const det of [-7, 7]) {
      const osc = ctx.createOscillator(), g = ctx.createGain(); osc.type = 'sawtooth'; osc.frequency.value = fr; osc.detune.value = det;
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.022 * vel, t + .5); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      osc.connect(g).connect(f); osc.start(t); osc.stop(t + dur + .1);
    }
  }

  tick(vel = 1) {
    const ctx = this.ensure(); if (!ctx || !this.gate('tick', 25)) return;
    const t = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), o = this.out(0, .1);
    src.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 3500;
    g.gain.setValueAtTime(.12 * vel, t); g.gain.exponentialRampToValueAtTime(.0001, t + .03);
    src.connect(f).connect(g).connect(o); src.start(t, Math.random() * .5); src.stop(t + .04);
  }

  pop(up = true, vel = 1) {
    const ctx = this.ensure(); if (!ctx) return;
    const t = ctx.currentTime, osc = ctx.createOscillator(), g = ctx.createGain(), o = this.out(0, .25);
    osc.type = 'sine'; osc.frequency.setValueAtTime(up ? 380 : 900, t); osc.frequency.exponentialRampToValueAtTime(up ? 900 : 300, t + .09);
    this.env(g, t, .2 * vel, .004, .12); osc.connect(g).connect(o); osc.start(t); osc.stop(t + .16);
  }

  /* ---------- moments ---------- */
  land(folderIndex, pan) { if (this.gate('land', 34)) this.pluck(noteFreq(folderIndex % 12 + 3), { pan, vel: .8 + Math.random() * .3 }); }
  launch(pan) { if (this.gate('launch', 120)) this.whoosh({ from: 300 + Math.random() * 200, to: 1800 + Math.random() * 1200, dur: .28, pan, vel: .45 }); }
  sortStart() { this.whoosh({ from: 200, to: 3200, dur: .9, vel: .7 }); [0, 2, 4].forEach((n, i) => this.bell(noteFreq(n + 5), { when: .05 + i * .07, vel: .45, len: 1.4 })); }
  finish() {
    this.pad([130.81, 196, 261.63, 329.63], { vel: .9 });
    [0, 2, 4, 5, 7, 9].forEach((n, i) => this.bell(noteFreq(n + 5), { when: .08 * i, pan: (i / 5) * 1.2 - .6, vel: .7 }));
    this.bell(noteFreq(15), { when: .6, vel: .5, len: 3 });
  }
  scatter() { this.whoosh({ from: 3000, to: 220, dur: .8, vel: .8 }); for (let i = 0; i < 6; i++) this.pluck(noteFreq(14 - i * 2), { when: i * .05, pan: Math.random() * 2 - 1, vel: .4 }); }
  sparkle() { for (let i = 0; i < 7; i++) this.bell(noteFreq(10 + ((i * 3) % 8)), { when: i * .045, pan: Math.random() * 1.4 - .7, vel: .35, len: 1.2 }); }
  stir() { if (this.gate('stir', 200)) this.whoosh({ from: 900, to: 300, dur: .4, vel: .6 }); }
  pickUp() { this.pop(true, .9); }
  drop(ok) { ok ? (this.pluck(noteFreq(9), { vel: .9 }), this.pluck(noteFreq(11), { when: .07, vel: .7 })) : this.pop(false, .6); }
  open() { this.whoosh({ from: 600, to: 2600, dur: .25, vel: .35 }); this.pop(true, .5); }
  close() { this.whoosh({ from: 2200, to: 500, dur: .22, vel: .3 }); }
  view() { this.whoosh({ from: 400, to: 1600, dur: .5, vel: .5 }); }
}
