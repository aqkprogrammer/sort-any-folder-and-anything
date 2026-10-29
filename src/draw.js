// Procedural thumbnails. The demo library is drawn entirely with canvas — no image assets.
// Every drawer has the signature (ctx, S, R) where S is the square size and R a seeded rng.

export const H = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
export function vgrad(c, S, stops, y0 = 0, y1 = S) { const g = c.createLinearGradient(0, y0, 0, y1); stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col)); c.fillStyle = g; c.fillRect(0, y0, S, y1 - y0); }
export function circle(c, x, y, r, fill) { c.beginPath(); c.arc(x, y, Math.max(0, r), 0, Math.PI * 2); c.fillStyle = fill; c.fill(); }
export function ell(c, x, y, rx, ry, rot, fill) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); }
export function rr(c, x, y, w, h, r, fill) { c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill(); }
export function poly(c, pts, fill) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fillStyle = fill; c.fill(); }

const SKINS = ['#f3cfb3', '#e8b896', '#d39b74', '#b07650', '#8a5534', '#f6dccb'];
const HAIRS = ['#2a1d18', '#4a2e20', '#7a4a2a', '#c99a5b', '#e6c27a', '#1c1c22', '#a0522d', '#d9a3b8'];

/* ======================= photos ======================= */
export function drawSelfie(c, S, R) {
  const h = R.r(0, 360);
  vgrad(c, S, [H(h, 55, 86), H(h + 35, 50, 72)]);
  for (let i = 0; i < 6; i++) circle(c, R.r(0, S), R.r(0, S * .6), R.r(S * .03, S * .1), H(h + R.r(-50, 50), 90, 96, .45));
  const skin = R.pick(SKINS), hair = R.pick(HAIRS), shirt = H(R.r(0, 360), R.r(25, 60), R.r(30, 70));
  const x = S * R.r(.4, .6), y = S * R.r(.4, .47), fr = S * R.r(.16, .2);
  if (R.chance(.5)) rr(c, x - fr * 1.12, y - fr * .3, fr * 2.24, fr * 2.3, fr * .8, hair);
  ell(c, x, S * 1.05, S * .4, S * .32, 0, shirt);
  rr(c, x - fr * .32, y + fr * .5, fr * .64, fr * 1.1, fr * .2, skin);
  circle(c, x, y - fr * .15, fr * 1.08, hair);
  circle(c, x, y, fr, skin);
  ell(c, x + fr * .18, y - fr * .68, fr * .98, fr * .42, -.25, hair);
  if (R.chance(.28)) { rr(c, x - fr * .75, y - fr * .15, fr * .62, fr * .34, fr * .14, '#1d1b22'); rr(c, x + fr * .13, y - fr * .15, fr * .62, fr * .34, fr * .14, '#1d1b22'); }
  else { circle(c, x - fr * .36, y + fr * .02, fr * .09, 'rgba(40,25,20,.75)'); circle(c, x + fr * .36, y + fr * .02, fr * .09, 'rgba(40,25,20,.75)'); }
  circle(c, x - fr * .55, y + fr * .32, fr * .16, 'rgba(240,110,130,.25)'); circle(c, x + fr * .55, y + fr * .32, fr * .16, 'rgba(240,110,130,.25)');
  c.strokeStyle = 'rgba(120,40,40,.65)'; c.lineWidth = S * .014; c.lineCap = 'round';
  c.beginPath(); c.arc(x, y + fr * .3, fr * .26, .2 * Math.PI, .8 * Math.PI); c.stroke();
}

export function drawFood(c, S, R) {
  c.fillStyle = R.pick(['#efe7dc', '#e2cfb5', '#c7a07a', '#f4f1ec', '#d9d3cc', '#a8c3b8', '#2f2a28']); c.fillRect(0, 0, S, S);
  c.strokeStyle = 'rgba(0,0,0,.06)'; c.lineWidth = S * .01;
  for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(0, R.r(0, S)); c.bezierCurveTo(S * .3, R.r(0, S), S * .7, R.r(0, S), S, R.r(0, S)); c.stroke(); }
  const x = S * R.r(.42, .58), y = S * R.r(.42, .58), v = R.int(0, 2), o = S * .03;
  if (v === 1) {
    circle(c, x + o, y + o, S * .31, 'rgba(0,0,0,.1)'); circle(c, x, y, S * .31, '#fbfaf7'); circle(c, x, y, S * .21, '#fff');
    circle(c, x, y, S * .17, '#7b4a2a'); circle(c, x, y, S * .13, '#9a6238');
    const hc = '#f1dfc6', k = S * .045; circle(c, x - k, y - k * .4, k * 1.05, hc); circle(c, x + k, y - k * .4, k * 1.05, hc); poly(c, [x - k * 2, y - k * .1, x + k * 2, y - k * .1, x, y + k * 2], hc);
    rr(c, x + S * .2, y - S * .03, S * .1, S * .06, S * .03, '#fff');
    if (R.chance(.6)) { ell(c, S * .18, S * .2, S * .13, S * .07, -.6, '#e0a35a'); ell(c, S * .18, S * .2, S * .09, S * .045, -.6, '#f0c07a'); }
  } else if (v === 2) {
    circle(c, x + o, y + o, S * .33, 'rgba(0,0,0,.1)'); circle(c, x, y, S * .33, R.pick(['#fde4ec', '#fff', '#e8f1ff']));
    rr(c, x - S * .17, y - S * .1, S * .34, S * .22, S * .04, '#f5d3a6'); rr(c, x - S * .17, y - S * .1, S * .34, S * .07, S * .04, R.pick(['#f48fb1', '#ce93d8', '#fff59d', '#a5d6a7']));
    for (let i = 0; i < 3; i++) circle(c, x - S * .1 + i * S * .1, y - S * .12, S * .03, '#e53950');
  } else {
    const pal = R.pick([['#7cb342', '#9ccc65', '#e53935', '#ffca28', '#fff3e0'], ['#f4511e', '#ff8a65', '#fff', '#33691e', '#212121'], ['#ffb74d', '#fff176', '#8d6e63', '#aed581', '#ef5350']]);
    circle(c, x + o, y + o, S * .38, 'rgba(0,0,0,.1)'); circle(c, x, y, S * .38, '#fdfcfa'); circle(c, x, y, S * .29, '#f3f0ea');
    for (let i = 0; i < 9; i++) { const a = R.r(0, 6.28), d = R.r(0, S * .17); circle(c, x + Math.cos(a) * d, y + Math.sin(a) * d, R.r(S * .04, S * .08), R.pick(pal)); }
    rr(c, x + S * .41, y - S * .3, S * .03, S * .55, S * .015, '#b8b2ad');
  }
}

export function drawTravel(c, S, R) {
  const pal = R.pick([
    { sky: ['#ffcf9e', '#ff9a8b', '#d77fa1'], sun: '#fff3c4', sea: ['#6d6ea8', '#3e4a85'] },
    { sky: ['#8ec5ff', '#d6ecff'], sun: '#fffbe6', sea: ['#2aa7c9', '#11698e'] },
    { sky: ['#2b2d5c', '#c06c84', '#f8b195'], sun: '#ffd7a8', sea: ['#3b3560', '#1d1b3a'] },
    { sky: ['#fbd3e9', '#bbd2ff'], sun: '#fff', sea: ['#7fb7d6', '#4a86b3'] }]);
  const hz = S * R.r(.55, .66);
  vgrad(c, S, pal.sky, 0, hz);
  const sx = S * R.r(.25, .75); circle(c, sx, hz - S * R.r(.05, .25), S * R.r(.07, .12), pal.sun);
  vgrad(c, S, pal.sea, hz, S);
  c.fillStyle = 'rgba(255,255,255,.45)'; for (let i = 0; i < 6; i++) c.fillRect(sx - S * R.r(.02, .1), hz + S * (.04 + i * .05), S * R.r(.05, .2), S * .012);
  const sil = 'rgba(25,18,35,.85)', v = R.int(0, 2);
  if (v === 0) {
    const px = S * R.pick([.18, .82]); c.strokeStyle = sil; c.lineWidth = S * .03; c.beginPath(); c.moveTo(px, S); c.quadraticCurveTo(px + S * .06, S * .6, px + S * .02, S * .32); c.stroke();
    for (let i = 0; i < 6; i++) ell(c, px + S * .02 + Math.cos(i * 1.05) * S * .08, S * .32 + Math.sin(i * 1.05) * S * .03, S * .11, S * .025, i * 1.05, sil);
  } else if (v === 1) {
    let x = 0; while (x < S) { const w = S * R.r(.06, .12), hh = S * R.r(.08, .3); c.fillStyle = sil; c.fillRect(x, hz - hh, w, hh); x += w + 1; }
  } else {
    poly(c, [S * .45, hz - S * .02, S * .62, hz - S * .02, S * .58, hz + S * .03, S * .49, hz + S * .03], sil); poly(c, [S * .53, hz - S * .03, S * .53, hz - S * .24, S * .62, hz - S * .03], '#fff');
  }
}

function ridge(c, S, R, base, amp, col) {
  c.fillStyle = col; c.beginPath(); c.moveTo(0, S); c.lineTo(0, base - amp * R.r(0, .4)); let x = 0, k = 0;
  while (x < S) { x += R.r(S * .08, S * .2); k++; c.lineTo(x, base - (k % 2 ? amp * R.r(.6, 1) : amp * R.r(0, .35))); }
  c.lineTo(S, S); c.closePath(); c.fill();
}
export function drawNature(c, S, R) {
  const golden = R.chance(.3);
  vgrad(c, S, golden ? ['#ffd59e', '#ffe9c7', '#fff6e5'] : ['#7fbfff', '#cfe9ff', '#eef7ff']);
  if (golden || R.chance(.5)) circle(c, S * R.r(.2, .8), S * R.r(.15, .35), S * .08, golden ? '#fff2cf' : '#ffffffcc');
  const g = R.r(95, 160);
  ridge(c, S, R, S * .55, S * .25, golden ? '#c9a6b8' : H(215, 25, 72));
  ridge(c, S, R, S * .68, S * .2, H(g, 30, golden ? 48 : 52));
  ridge(c, S, R, S * .82, S * .12, H(g, 38, golden ? 32 : 34));
  if (R.chance(.5)) vgrad(c, S, ['#9fd3f0', '#5ca6cf'], S * .86, S);
  for (let i = 0; i < 7; i++) { const x = R.r(0, S), b = S * R.r(.86, 1.02), h = S * R.r(.12, .24); poly(c, [x, b - h, x - h * .32, b, x + h * .32, b], H(g, 40, 18)); }
}

export function drawSpace(c, S, R) {
  c.fillStyle = R.pick(['#efe3d3', '#e8d9c8', '#dfe5da', '#f1e1dc', '#e9e4ee', '#e6d2bf']); c.fillRect(0, 0, S, S);
  c.fillStyle = 'rgba(120,90,70,.18)'; c.fillRect(0, S * .78, S, S * .22);
  const wx = S * R.r(.1, .3), ww = S * R.r(.3, .4), wy = S * .12, wb = S * .66, wr = ww / 2;
  c.beginPath(); c.moveTo(wx, wb); c.lineTo(wx, wy + wr); c.arc(wx + wr, wy + wr, wr, Math.PI, 0); c.lineTo(wx + ww, wb); c.closePath();
  const g = c.createLinearGradient(0, wy, 0, wb); g.addColorStop(0, '#cfe8ff'); g.addColorStop(1, '#fff6e6'); c.fillStyle = g; c.fill();
  c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = S * .015; c.stroke(); c.beginPath(); c.moveTo(wx + wr, wy); c.lineTo(wx + wr, wb); c.stroke();
  c.save(); c.globalAlpha = .25;
  for (let i = 0; i < 3; i++) { const o = S * (.45 + i * .12); poly(c, [o, S * .35, o + S * .06, S * .35, o + S * .3, S, o + S * .22, S], '#fff'); } c.restore();
  const px = S * R.r(.72, .84);
  rr(c, px - S * .08, S * .62, S * .16, S * .18, S * .03, R.pick(['#c96f4a', '#e9e4dc', '#3a3a3a']));
  for (let i = 0; i < 6; i++) ell(c, px + R.r(-.12, .12) * S, S * R.r(.38, .6), S * .035, S * .1, R.r(-1, 1), H(R.r(95, 140), 40, R.r(28, 42)));
  if (R.chance(.6)) rr(c, S * .05, S * .66, S * .5, S * .16, S * .05, R.pick(['#f4eee6', '#b8a089', '#8ba18a', '#d9b9a8']));
}

export function drawPet(c, S, R) {
  vgrad(c, S, [H(R.r(0, 360), 40, 88), H(R.r(0, 360), 30, 80)]);
  const fur = R.pick(['#e0a96d', '#4a3b33', '#f2f0eb', '#9a9a9a', '#c97b3d', '#2b2b2b', '#f5d7a8']), dark = 'rgba(0,0,0,.25)';
  const x = S * R.r(.42, .58), y = S * R.r(.42, .5), r = S * .21, cat = R.chance(.5);
  ell(c, x, S * 1.02, S * .36, S * .3, 0, fur);
  if (cat) {
    poly(c, [x - r * .95, y - r * .35, x - r * .75, y - r * 1.25, x - r * .2, y - r * .85], fur); poly(c, [x + r * .95, y - r * .35, x + r * .75, y - r * 1.25, x + r * .2, y - r * .85], fur);
    poly(c, [x - r * .8, y - r * .5, x - r * .7, y - r * 1.0, x - r * .38, y - r * .8], 'rgba(240,140,160,.5)'); poly(c, [x + r * .8, y - r * .5, x + r * .7, y - r * 1.0, x + r * .38, y - r * .8], 'rgba(240,140,160,.5)');
  }
  circle(c, x, y, r, fur);
  if (!cat) { ell(c, x - r * .9, y - r * .05, r * .3, r * .6, .3, dark); ell(c, x + r * .9, y - r * .05, r * .3, r * .6, -.3, dark); ell(c, x, y + r * .45, r * .5, r * .38, 0, 'rgba(255,255,255,.35)'); }
  circle(c, x - r * .38, y - r * .08, r * .13, '#1d1b22'); circle(c, x + r * .38, y - r * .08, r * .13, '#1d1b22');
  circle(c, x - r * .34, y - r * .13, r * .045, '#fff'); circle(c, x + r * .42, y - r * .13, r * .045, '#fff');
  ell(c, x, y + r * .28, r * .13, r * .09, 0, cat ? '#e88a9a' : '#2b2226');
}

export function drawDesk(c, S, R) {
  vgrad(c, S, [R.pick(['#eae4f2', '#e7efe9', '#f3e6dc', '#e2e8f0']), '#f7f4f1']);
  c.fillStyle = R.pick(['#c49a6c', '#e8dccb', '#8b6b52', '#f2f2f2']); c.fillRect(0, S * .66, S, S * .34);
  const x = S * R.r(.3, .42);
  rr(c, x - S * .02, S * .24, S * .46, S * .32, S * .03, '#2f2b33');
  const scr = c.createLinearGradient(x, S * .26, x + S * .42, S * .54); scr.addColorStop(0, R.pick(['#6a5acd', '#2d7ff9', '#e0609b', '#1f8a70'])); scr.addColorStop(1, '#14121a');
  rr(c, x, S * .26, S * .42, S * .28, S * .02, scr);
  for (let i = 0; i < 5; i++) rr(c, x + S * .04 + R.r(0, .04) * S, S * (.3 + i * .045), S * R.r(.1, .28), S * .018, S * .01, H(R.r(0, 360), 70, 75, .8));
  poly(c, [x - S * .06, S * .67, x + S * .5, S * .67, x + S * .46, S * .58, x - S * .02, S * .58], '#c8c6cc');
  rr(c, S * .06, S * .52, S * .12, S * .14, S * .03, R.pick(['#fff', '#f2b5c9', '#2b2226']));
  if (R.chance(.6)) for (let i = 0; i < 5; i++) ell(c, S * .87 + R.r(-.04, .04) * S, S * R.r(.38, .55), S * .025, S * .08, R.r(-1, 1), H(120, 35, 35));
}

export function drawNotes(c, S, R) {
  c.fillStyle = R.pick(['#5d4a3c', '#3c3f46', '#d9cfc4', '#7a8f87']); c.fillRect(0, 0, S, S);
  c.save(); c.translate(S / 2, S / 2); c.rotate(R.r(-.14, .14));
  rr(c, -S * .34 + S * .02, -S * .42 + S * .03, S * .68, S * .86, S * .03, 'rgba(0,0,0,.25)');
  rr(c, -S * .34, -S * .42, S * .68, S * .86, S * .03, R.pick(['#fffdf6', '#fff', '#fdf3c8']));
  rr(c, -S * .26, -S * .34, S * .32, S * .05, S * .01, '#2b2226');
  for (let i = 0; i < 9; i++) { const y = -S * .24 + i * S * .065; if (R.chance(.15)) rr(c, -S * .27, y - S * .01, S * .4, S * .04, S * .01, 'rgba(255,214,0,.55)'); rr(c, -S * .26, y, S * R.r(.3, .5), S * .018, S * .005, 'rgba(60,60,70,.45)'); }
  c.restore();
}

export function drawScreenshot(c, S, R) {
  const dark = R.chance(.35), bg = dark ? '#16151a' : '#fbfbfd', fg = dark ? '#2a2930' : '#eceaf0', acc = R.pick(['#2d7ff9', '#e0609b', '#25d366', '#8b5cf6', '#ff7a45']);
  c.fillStyle = bg; c.fillRect(0, 0, S, S);
  rr(c, S * .06, S * .04, S * .14, S * .03, S * .01, dark ? '#888' : '#333'); rr(c, S * .74, S * .04, S * .2, S * .03, S * .01, dark ? '#888' : '#333');
  const v = R.int(0, 3);
  if (v === 0) { for (let i = 0; i < 6; i++) { const me = R.chance(.5), w = S * R.r(.3, .6), y = S * (.14 + i * .14); rr(c, me ? S * .94 - w : S * .06, y, w, S * .1, S * .05, me ? acc : fg); } }
  else if (v === 1) {
    circle(c, S * .12, S * .16, S * .05, acc); rr(c, S * .2, S * .14, S * .3, S * .03, S * .01, fg);
    const g = c.createLinearGradient(0, S * .24, S, S * .7); g.addColorStop(0, H(R.r(0, 360), 60, 70)); g.addColorStop(1, H(R.r(0, 360), 60, 55)); c.fillStyle = g; c.fillRect(0, S * .24, S, S * .46);
    for (let i = 0; i < 3; i++) rr(c, S * .06, S * (.76 + i * .07), S * R.r(.4, .85), S * .035, S * .01, fg);
  } else if (v === 2) {
    c.fillStyle = dark ? '#22262b' : '#ece7dc'; c.fillRect(0, S * .1, S, S * .9);
    c.strokeStyle = dark ? '#3a3f47' : '#fff'; c.lineWidth = S * .04; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(0, R.r(.1, 1) * S); c.lineTo(S, R.r(.1, 1) * S); c.stroke(); }
    c.fillStyle = 'rgba(120,190,120,.4)'; c.fillRect(S * R.r(0, .5), S * R.r(.2, .6), S * .3, S * .2);
    const px = S * R.r(.3, .7), py = S * R.r(.35, .65); circle(c, px, py, S * .07, '#e5484d'); circle(c, px, py, S * .025, '#fff');
    rr(c, S * .05, S * .78, S * .9, S * .17, S * .04, bg);
  } else {
    rr(c, S * .06, S * .12, S * .45, S * .06, S * .01, dark ? '#eee' : '#222');
    for (let i = 0; i < 6; i++) { const y = S * (.24 + i * .12); rr(c, S * .06, y, S * .07, S * .07, S * .02, H(R.r(0, 360), 70, 60)); rr(c, S * .17, y + S * .02, S * R.r(.3, .5), S * .03, S * .01, fg); rr(c, S * .78, y + S * .01, S * .14, S * .05, S * .025, i % 2 ? acc : fg); }
  }
}

export function drawHobby(c, S, R) {
  vgrad(c, S, [H(R.r(0, 360), 45, 80), H(R.r(0, 360), 40, 64)]);
  if (R.chance(.6)) {
    const x = S * R.r(.4, .55), y = S * R.r(.45, .55), r = S * .38;
    circle(c, x + S * .02, y + S * .03, r, 'rgba(0,0,0,.2)'); circle(c, x, y, r, '#141216');
    c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = S * .008; for (let k = .45; k < 1; k += .08) { c.beginPath(); c.arc(x, y, r * k, 0, 6.3); c.stroke(); }
    circle(c, x, y, r * .32, R.pick(['#e0609b', '#f2a65a', '#6fb3a5', '#f5e663'])); circle(c, x, y, r * .05, '#141216');
    c.strokeStyle = '#ddd'; c.lineWidth = S * .025; c.beginPath(); c.moveTo(S * .92, S * .08); c.lineTo(S * .78, S * .5); c.stroke();
  } else {
    c.fillStyle = '#141216'; c.fillRect(0, S * .35, S, S * .65);
    const w = S / 9; for (let i = 0; i < 9; i++) rr(c, i * w + 1, S * .38, w - 2, S * .58, S * .01, '#fafafa');
    [1, 2, 4, 5, 6].forEach(i => rr(c, i * w - w * .3, S * .38, w * .6, S * .34, S * .01, '#141216'));
  }
}

// "Probably junk" — pocket shots (nearly black) and badly blurred frames.
export function drawPocket(c, S, R) {
  vgrad(c, S, ['#050406', H(R.r(0, 360), 20, 6), '#020203']);
  for (let i = 0; i < 3; i++) circle(c, R.r(0, S), R.r(0, S), S * R.r(.1, .3), `rgba(255,255,255,${R.r(.01, .03)})`);
}

export function drawVideoBadge(c, S, R) {
  const g = c.createLinearGradient(0, S * .55, 0, S); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)'); c.fillStyle = g; c.fillRect(0, S * .55, S, S * .45);
  circle(c, S / 2, S / 2, S * .14, 'rgba(255,255,255,.88)'); poly(c, [S * .46, S * .42, S * .46, S * .58, S * .585, S * .5], '#2b2226');
  if (R) {
    const sec = R.int(3, 180); c.font = `700 ${Math.round(S * .1)}px Inter,system-ui`; c.fillStyle = '#fff'; c.textAlign = 'right'; c.textBaseline = 'alphabetic';
    c.fillText(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, S * .92, S * .92);
  }
}

/* ======================= documents ======================= */
export const FAMILY_COLOR = {
  pdf: '#e5484d', word: '#2b6cde', text: '#6b7280', sheet: '#1f9d55', slide: '#e8743b', code: '#7c3aed', archive: '#a16207',
  installer: '#475569', design: '#db2777', font: '#0f766e', ebook: '#9333ea', audio: '#f59e0b', other: '#64748b',
};

export function drawTypeBadge(c, S, label, color) {
  const fs = Math.round(S * .1); c.font = `700 ${fs}px Inter,system-ui`;
  const w = c.measureText(label).width + S * .08;
  rr(c, S * .06, S * .8, w, S * .14, S * .04, color);
  c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(label, S * .1, S * .875);
}

function page(c, S, R, bg = '#eef0f4') {
  c.fillStyle = bg; c.fillRect(0, 0, S, S);
  rr(c, S * .16 + S * .015, S * .06 + S * .02, S * .68, S * .88, S * .02, 'rgba(0,0,0,.12)');
  rr(c, S * .16, S * .06, S * .68, S * .88, S * .02, '#fff');
}
const lines = (c, S, R, y0, n, x = .22, w = [.3, .55], gap = .045, col = 'rgba(70,70,90,.35)') => {
  for (let i = 0; i < n; i++) rr(c, S * x, S * (y0 + i * gap), S * R.r(w[0], w[1]), S * .014, S * .005, col);
};

export function drawInvoice(c, S, R) {
  page(c, S, R); const acc = R.pick(['#2d7ff9', '#111', '#e0609b', '#1f9d55', '#ff7a45']);
  rr(c, S * .22, S * .12, S * .16, S * .05, S * .01, acc); rr(c, S * .58, S * .12, S * .2, S * .03, S * .005, '#222');
  lines(c, S, R, .22, 3, .22, [.15, .25], .03);
  for (let i = 0; i < 6; i++) { const y = S * (.38 + i * .055); c.fillStyle = i % 2 ? '#f6f7f9' : '#fff'; c.fillRect(S * .2, y, S * .6, S * .05); rr(c, S * .22, y + S * .018, S * R.r(.2, .3), S * .014, 1, 'rgba(70,70,90,.4)'); rr(c, S * .68, y + S * .018, S * .08, S * .014, 1, 'rgba(70,70,90,.6)'); }
  rr(c, S * .52, S * .74, S * .28, S * .08, S * .015, acc); rr(c, S * .56, S * .772, S * .2, S * .02, 1, '#fff');
}
export function drawContract(c, S, R) {
  page(c, S, R, '#f2efe9');
  rr(c, S * .34, S * .11, S * .32, S * .03, S * .005, '#222');
  for (let p = 0; p < 4; p++) lines(c, S, R, .19 + p * .15, 3, .22, [.48, .56], .035);
  c.strokeStyle = '#1d3d8f'; c.lineWidth = S * .012; c.beginPath(); c.moveTo(S * .5, S * .86);
  for (let i = 0; i < 6; i++) c.quadraticCurveTo(S * (.53 + i * .04), S * (i % 2 ? .8 : .9), S * (.55 + i * .04), S * .85); c.stroke();
}
export function drawCV(c, S, R) {
  page(c, S, R, '#eaeef3'); const acc = R.pick(['#0f766e', '#7c3aed', '#c2457e', '#2b6cde']);
  c.fillStyle = acc; c.fillRect(S * .16, S * .06, S * .2, S * .88);
  circle(c, S * .26, S * .2, S * .06, R.pick(['#f3cfb3', '#d39b74', '#8a5534']));
  lines(c, S, R, .32, 6, .19, [.08, .13], .04, 'rgba(255,255,255,.7)');
  rr(c, S * .42, S * .12, S * .3, S * .04, S * .005, '#222'); lines(c, S, R, .2, 2, .42, [.2, .3], .03);
  for (let s = 0; s < 3; s++) { rr(c, S * .42, S * (.32 + s * .2), S * .14, S * .02, 1, acc); lines(c, S, R, .36 + s * .2, 3, .42, [.25, .36], .035); }
}
export function drawTicket(c, S, R) {
  vgrad(c, S, [H(R.r(190, 260), 50, 85), H(R.r(190, 260), 40, 75)]);
  const acc = R.pick(['#c2457e', '#2d7ff9', '#e5484d', '#0f766e']);
  rr(c, S * .08, S * .26, S * .84, S * .48, S * .05, '#fff');
  c.fillStyle = acc; c.beginPath(); c.roundRect(S * .08, S * .26, S * .84, S * .11, [S * .05, S * .05, 0, 0]); c.fill();
  c.font = `800 ${Math.round(S * .1)}px Inter,system-ui`; c.fillStyle = '#222'; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  c.fillText(R.pick(['IST', 'LHR', 'LIS', 'DXB', 'JFK', 'CDG']), S * .14, S * .52); c.textAlign = 'right'; c.fillText(R.pick(['NRT', 'BCN', 'LHE', 'AMS', 'SFO']), S * .66, S * .52);
  c.strokeStyle = '#999'; c.setLineDash([S * .02, S * .015]); c.lineWidth = S * .008; c.beginPath(); c.moveTo(S * .72, S * .3); c.lineTo(S * .72, S * .72); c.stroke(); c.setLineDash([]);
  for (let i = 0; i < 14; i++) c.fillRect(S * (.76 + i * .011), S * .44, S * R.r(.003, .007), S * .2);
  lines(c, S, R, .58, 2, .14, [.2, .4], .04);
}
export function drawStatement(c, S, R) {
  page(c, S, R); const acc = R.pick(['#0b3d91', '#006a4e', '#8b1e3f']);
  circle(c, S * .27, S * .14, S * .04, acc); rr(c, S * .33, S * .125, S * .2, S * .03, S * .005, acc);
  rr(c, S * .22, S * .22, S * .56, S * .1, S * .015, '#f2f5fb'); rr(c, S * .26, S * .25, S * .2, S * .02, 1, '#555'); rr(c, S * .6, S * .245, S * .14, S * .035, 1, acc);
  for (let i = 0; i < 9; i++) { const y = S * (.38 + i * .05); rr(c, S * .22, y, S * .1, S * .014, 1, '#aaa'); rr(c, S * .36, y, S * R.r(.15, .25), S * .014, 1, '#bbb'); rr(c, S * .68, y, S * .1, S * .014, 1, R.chance(.4) ? '#e5484d' : '#1f9d55'); }
}
export function drawGenericDoc(c, S, R) {
  page(c, S, R, R.pick(['#eef0f4', '#f3eee8', '#e9eef2']));
  rr(c, S * .22, S * .13, S * .36, S * .04, S * .005, '#222');
  lines(c, S, R, .22, 4, .22, [.4, .56], .04);
  if (R.chance(.5)) { const g = c.createLinearGradient(0, S * .42, 0, S * .6); g.addColorStop(0, H(R.r(0, 360), 50, 75)); g.addColorStop(1, H(R.r(0, 360), 50, 60)); c.fillStyle = g; c.fillRect(S * .22, S * .42, S * .56, S * .18); }
  else lines(c, S, R, .42, 4, .22, [.4, .56], .04);
  lines(c, S, R, .64, 5, .22, [.4, .56], .045);
}
export function drawSheet(c, S, R) {
  c.fillStyle = '#fff'; c.fillRect(0, 0, S, S);
  c.fillStyle = '#1f9d55'; c.fillRect(0, 0, S, S * .1);
  const cw = S / 5, rh = S * .075;
  c.fillStyle = '#e8f5ee'; c.fillRect(0, S * .1, S, rh);
  c.strokeStyle = '#d8dde3'; c.lineWidth = S * .005;
  for (let x = 0; x <= S; x += cw) { c.beginPath(); c.moveTo(x, S * .1); c.lineTo(x, S); c.stroke(); }
  for (let y = S * .1; y <= S; y += rh) { c.beginPath(); c.moveTo(0, y); c.lineTo(S, y); c.stroke(); }
  for (let r = 1; r < 11; r++) for (let k = 0; k < 5; k++) if (R.chance(.7)) rr(c, k * cw + S * .02, S * .1 + r * rh + S * .025, cw * R.r(.3, .8), S * .025, 1, k === 0 ? '#555' : R.chance(.1) ? '#e5484d' : '#9aa3ad');
  if (R.chance(.5)) for (let i = 0; i < 4; i++) { const h = S * R.r(.08, .2); c.fillStyle = '#1f9d55aa'; c.fillRect(S * (.6 + i * .08), S * .9 - h, S * .05, h); }
}
export function drawSlide(c, S, R) {
  vgrad(c, S, ['#2a2730', '#1b1920']);
  const bg = H(R.r(0, 360), 55, R.r(50, 65));
  rr(c, S * .06, S * .22, S * .88, S * .5, S * .02, bg);
  rr(c, S * .12, S * .3, S * .4, S * .06, S * .01, '#fff'); rr(c, S * .12, S * .4, S * .3, S * .025, 1, 'rgba(255,255,255,.7)');
  for (let i = 0; i < 4; i++) { const h = S * R.r(.08, .22); rr(c, S * (.56 + i * .08), S * .66 - h, S * .05, h, 1, 'rgba(255,255,255,.85)'); }
  for (let i = 0; i < 4; i++) rr(c, S * (.06 + i * .225), S * .78, S * .2, S * .11, S * .01, i ? '#3a3640' : bg);
}
export function drawCode(c, S, R) {
  c.fillStyle = '#1e1b26'; c.fillRect(0, 0, S, S);
  rr(c, 0, 0, S, S * .08, 0, '#16141c'); [0, 1, 2].forEach(i => circle(c, S * (.05 + i * .05), S * .04, S * .015, ['#ff5f57', '#febc2e', '#28c840'][i]));
  const cols = ['#c792ea', '#82aaff', '#c3e88d', '#f78c6c', '#89ddff', '#ffcb6b'];
  for (let i = 0; i < 13; i++) {
    const y = S * (.12 + i * .065); rr(c, S * .04, y, S * .04, S * .02, 1, '#4a4658');
    let x = S * (.12 + R.int(0, 3) * .04); const n = R.int(1, 4);
    for (let k = 0; k < n && x < S * .9; k++) { const w = S * R.r(.06, .2); rr(c, x, y, w, S * .022, 1, R.pick(cols)); x += w + S * .02; }
  }
}
export function drawArchive(c, S, R) {
  vgrad(c, S, ['#f6efe2', '#ead9bd']);
  rr(c, S * .2, S * .14, S * .6, S * .7, S * .06, '#c9a46a'); rr(c, S * .2, S * .14, S * .6, S * .14, S * .06, '#b48a4c');
  for (let i = 0; i < 9; i++) rr(c, S * (.46 + (i % 2) * .04), S * (.16 + i * .04), S * .04, S * .025, 1, '#5b4524');
  rr(c, S * .44, S * .52, S * .12, S * .14, S * .02, '#5b4524'); rr(c, S * .47, S * .56, S * .06, S * .05, S * .01, '#c9a46a');
}
export function drawInstaller(c, S, R) {
  vgrad(c, S, ['#eef1f6', '#d7dde7']);
  rr(c, S * .2, S * .2, S * .6, S * .6, S * .14, '#c9cfd8'); rr(c, S * .22, S * .22, S * .56, S * .56, S * .12, '#e9edf2');
  circle(c, S * .5, S * .5, S * .16, H(R.r(0, 360), 60, 55)); circle(c, S * .5, S * .5, S * .05, '#e9edf2');
  poly(c, [S * .64, S * .62, S * .82, S * .62, S * .73, S * .74], '#2b2226'); rr(c, S * .705, S * .48, S * .05, S * .15, 2, '#2b2226');
}
export function drawDesign(c, S, R) {
  c.fillStyle = '#2c2c2c'; c.fillRect(0, 0, S, S);
  c.fillStyle = '#383838'; c.fillRect(0, 0, S * .2, S); for (let i = 0; i < 7; i++) rr(c, S * .03, S * (.08 + i * .07), S * .13, S * .025, 1, '#5a5a5a');
  rr(c, S * .28, S * .14, S * .64, S * .72, S * .01, '#fff');
  circle(c, S * .48, S * .4, S * .12, H(R.r(0, 360), 80, 60)); rr(c, S * .56, S * .46, S * .26, S * .2, S * .03, H(R.r(0, 360), 80, 65));
  poly(c, [S * .36, S * .78, S * .5, S * .56, S * .64, S * .78], H(R.r(0, 360), 70, 55));
  c.strokeStyle = '#0d99ff'; c.lineWidth = S * .008; c.strokeRect(S * .55, S * .45, S * .28, S * .22);
}
export function drawFont(c, S, R) {
  vgrad(c, S, ['#fdfbf7', '#efe9df']);
  c.fillStyle = '#2b2226'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `${R.pick(['400', '700'])} ${Math.round(S * .42)}px ${R.pick(['Georgia', '"Instrument Serif"', 'Inter', 'Courier New'])}`; c.fillText('Aa', S / 2, S * .44);
  c.font = `500 ${Math.round(S * .06)}px Inter,system-ui`; c.fillStyle = '#8a7f85'; c.fillText('ABCDEFG abcdefg', S / 2, S * .7);
}
export function drawAudio(c, S, R, voice = false) {
  vgrad(c, S, voice ? ['#fff4e6', '#ffe0bd'] : [H(R.r(240, 330), 60, 62), H(R.r(180, 240), 60, 45)]);
  const n = 26, w = S * .7 / n, col = voice ? '#f59e0b' : 'rgba(255,255,255,.9)';
  for (let i = 0; i < n; i++) { const h = S * (.05 + Math.abs(Math.sin(i * .7 + R.r(0, 3))) * R.r(.08, .3)); rr(c, S * .15 + i * w, S * .5 - h / 2, w * .6, h, w * .3, col); }
  if (voice) { rr(c, S * .44, S * .12, S * .12, S * .2, S * .06, '#2b2226'); c.strokeStyle = '#2b2226'; c.lineWidth = S * .015; c.beginPath(); c.arc(S * .5, S * .24, S * .1, 0, Math.PI); c.stroke(); }
  else { circle(c, S * .78, S * .22, S * .05, '#fff'); rr(c, S * .82, S * .08, S * .015, S * .15, 1, '#fff'); }
}
export function drawGenericFile(c, S, R, label = '?', color = '#64748b') {
  vgrad(c, S, ['#f4f2f5', '#e5e1e8']);
  c.beginPath(); c.moveTo(S * .28, S * .12); c.lineTo(S * .6, S * .12); c.lineTo(S * .74, S * .26); c.lineTo(S * .74, S * .86); c.lineTo(S * .28, S * .86); c.closePath();
  c.fillStyle = '#fff'; c.fill(); poly(c, [S * .6, S * .12, S * .74, S * .26, S * .6, S * .26], '#d9d4dc');
  c.font = `800 ${Math.round(S * (label.length > 4 ? .1 : .13))}px Inter,system-ui`; c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label.toUpperCase().slice(0, 6), S * .51, S * .56);
}

// Renders a mini page of real text (txt/md/code/csv) for files from disk.
export function drawTextPreview(c, S, text, family) {
  const codeLike = family === 'code', sheet = family === 'sheet';
  c.fillStyle = codeLike ? '#1e1b26' : '#fff'; c.fillRect(0, 0, S, S);
  c.font = `${Math.max(6, Math.round(S * .055))}px ui-monospace,Menlo,monospace`; c.textAlign = 'left'; c.textBaseline = 'top';
  c.fillStyle = codeLike ? '#c3e88d' : '#333';
  const rows = text.split(/\r?\n/).slice(0, 18);
  rows.forEach((row, i) => {
    if (sheet) { row.split(/[,;\t]/).slice(0, 4).forEach((cell, k) => c.fillText(cell.slice(0, 7), S * (.04 + k * .24), S * (.05 + i * .065))); }
    else c.fillText(row.slice(0, 30), S * .05, S * (.05 + i * .065));
  });
}
