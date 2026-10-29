// A messy, made-up Downloads folder: photos, videos, audio and documents, all drawn on canvas.
// Photos/videos carry a "truth" label (what the drawing shows); everything else — junk, duplicates,
// document topics — is detected by the same analysis code used for real files.

import { makeRng } from './util.js';
import { PREVIEW, analyzeCanvas } from './analyze.js';
import { familyOf, kindOf } from './folders.js';
import * as D from './draw.js';

const PHOTOS = [
  ['selfies', 36, D.drawSelfie], ['food', 18, D.drawFood], ['travel', 22, D.drawTravel], ['nature', 22, D.drawNature],
  ['spaces', 15, D.drawSpace], ['pets', 16, D.drawPet], ['wfh', 18, D.drawDesk], ['notes', 10, D.drawNotes], ['shots', 34, D.drawScreenshot],
];
const VIDEOS = [['v-talk', 28, D.drawSelfie], ['v-travel', 18, D.drawTravel], ['v-hobby', 14, D.drawHobby], ['v-screen', 14, D.drawScreenshot]];

const T = {
  invoice: n => `INVOICE ${n}  Bill to: Studio Q  Qty  Description  Unit price  Subtotal 420.00  VAT 20% 84.00  Total due 504.00  Payment received, thank you.`,
  receipt: s => `${s} receipt  Order number 114-55-${Math.random().toString().slice(2, 7)}  Subtotal  Tax  Total  Payment received via card.`,
  contract: s => `${s}. This agreement is made between the parties hereby named. Terms and conditions apply. Governing law: England. Signature ______ Witness ______`,
  cv: s => `${s} — Resume. Work experience: Senior designer 2021–2026. Education: BSc Computer Science. Skills: Figma, React, research. References available on request.`,
  ticket: s => `${s}. Boarding pass. Flight TK1979 Gate B12 Seat 14A. Booking reference QX7P2L. Check-in closes 45 min before departure.`,
  hotel: s => `Hotel confirmation — ${s}. Reservation number 88231. Check-in 15:00, check-out 11:00. Itinerary attached.`,
  bank: s => `Bank statement ${s}. Statement period 1–30. Account number ****4821, IBAN GB29 NWBK. Opening balance 3,240.10. Transactions… Closing balance 2,980.55.`,
  payslip: s => `Payslip ${s}. Salary 4,200.00, tax 820.00, pension 210.00. Net pay 3,170.00. Account number ****1188.`,
  generic: s => `${s}. Notes and ideas for the next sprint: onboarding flow, launch plan, action items, open questions for the team.`,
};

const DOCS = [
  // [file name, text]
  ['Invoice_INV-2026-0142.pdf', T.invoice('INV-2026-0142'), D.drawInvoice], ['Invoice_INV-2026-0157.pdf', T.invoice('INV-2026-0157'), D.drawInvoice],
  ['Receipt-Apple-Store.pdf', T.receipt('Apple Store'), D.drawInvoice], ['Uber Receipt October.pdf', T.receipt('Uber trip'), D.drawInvoice],
  ['amazon-order-114-5591.pdf', T.receipt('Amazon order'), D.drawInvoice], ['electricity bill sep.pdf', T.invoice('Electricity'), D.drawInvoice],
  ['Rental_Agreement_2026.pdf', T.contract('Rental agreement'), D.drawContract], ['NDA - Acme Corp.docx', T.contract('Non-disclosure agreement (NDA)'), D.drawContract],
  ['Freelance contract signed.pdf', T.contract('Freelance services contract'), D.drawContract], ['Lease renewal.pdf', T.contract('Lease renewal'), D.drawContract],
  ['Resume_Final_v3.pdf', T.cv('Product designer'), D.drawCV], ['CV - Frontend Engineer.docx', T.cv('Frontend engineer'), D.drawCV], ['resume-2025.pdf', T.cv('Designer'), D.drawCV],
  ['Boarding Pass IST-LHR.pdf', T.ticket('Istanbul to London'), D.drawTicket], ['e-ticket TK1979.pdf', T.ticket('E-ticket'), D.drawTicket],
  ['Hotel confirmation Lisbon.pdf', T.hotel('Lisbon'), D.drawTicket], ['Train ticket Paris.pdf', T.ticket('Train ticket Paris'), D.drawTicket], ['Booking-Bali-villa.pdf', T.hotel('Bali villa'), D.drawTicket],
  ['Bank Statement Sep 2026.pdf', T.bank('September 2026'), D.drawStatement], ['Bank Statement Aug 2026.pdf', T.bank('August 2026'), D.drawStatement],
  ['Payslip_October.pdf', T.payslip('October'), D.drawStatement], ['Tax return 2025.pdf', 'Tax return 2025. Income, salary, deductions. Account number ****. Statement period 2025.', D.drawStatement],
  ['Meeting notes.docx', T.generic('Meeting notes'), D.drawGenericDoc], ['Project brief.pdf', T.generic('Project brief'), D.drawGenericDoc], ['README.md', '# Photo Sorter\nA tiny app that tidies folders.\n\n## Setup\nnpm install', D.drawGenericDoc],
  ['ideas.txt', 'ideas: rooftop dinner, learn piano, plant shelf, newsletter about design', D.drawGenericDoc], ['Chapter 3 draft.pages', '', D.drawGenericDoc], ['user-manual.pdf', 'User manual. Getting started, safety information, troubleshooting.', D.drawGenericDoc],
  ['Recipes I want to try.docx', 'Recipes: shakshuka, ramen, banana bread, pistachio cookies.', D.drawGenericDoc], ['The Design of Everyday Things.epub', '', D.drawGenericDoc],
  ['Budget 2026.xlsx', 'Budget, Rent, Groceries, Travel, Savings', D.drawSheet], ['expenses.csv', 'date,item,amount\n2026-10-02,coffee,4.50', D.drawSheet],
  ['Sales Q3.numbers', '', D.drawSheet], ['habit-tracker.xlsx', 'Habit, Mon, Tue, Wed', D.drawSheet], ['guest list.csv', 'name,plus one', D.drawSheet],
  ['Pitch deck v7.key', '', D.drawSlide], ['Quarterly review.pptx', 'Quarterly review: growth, retention, roadmap', D.drawSlide], ['Workshop slides.pptx', '', D.drawSlide], ['Portfolio 2026.pdf', '', D.drawSlide],
  ['index.html', '<!doctype html><html>…', D.drawCode], ['data.json', '{ "items": [] }', D.drawCode], ['scrape.py', 'import requests', D.drawCode], ['export.sql', 'SELECT * FROM orders;', D.drawCode], ['styles.css', 'body { margin: 0 }', D.drawCode], ['notebook.ipynb', '', D.drawCode],
  ['photos-backup.zip', '', D.drawArchive], ['project-final.zip', '', D.drawArchive], ['fonts.zip', '', D.drawArchive], ['logs.tar.gz', '', D.drawArchive], ['Archive (2).zip', '', D.drawArchive],
  ['Figma-arm64.dmg', '', D.drawInstaller], ['zoomusInstaller.pkg', '', D.drawInstaller], ['Docker.dmg', '', D.drawInstaller], ['Spotify.dmg', '', D.drawInstaller], ['googlechrome.dmg', '', D.drawInstaller],
  ['logo-final-FINAL.svg', '', D.drawDesign], ['poster.psd', '', D.drawDesign], ['app-mockup.fig', '', D.drawDesign], ['Inter-Variable.ttf', '', D.drawFont], ['Instrument Serif.otf', '', D.drawFont],
  ['invite.ics', '', null], ['contact.vcf', '', null], ['download (3).bin', '', null],
];
const AUDIO = [
  ['Track 01 - Sunrise.mp3', false], ['lofi beat 3.wav', false], ['podcast-ep42.mp3', false], ['demo song v2.m4a', false], ['Ambient rain.mp3', false], ['guitar loop.aiff', false],
  ['New Recording 12.m4a', true], ['Voice memo - app idea.m4a', true], ['WhatsApp Audio 2026-10-11.opus', true], ['New Recording 13.m4a', true], ['lecture recording.m4a', true],
];
const PLACES = [[38.72, -9.14], [41.01, 28.98], [35.68, 139.69], [-8.41, 115.19], [40.71, -74.0], [48.86, 2.35], [64.15, -21.94], [-33.92, 18.42], [25.2, 55.27], [31.55, 74.34], [46.56, 7.98], [51.18, -115.57]];

const newCanvas = () => { const c = document.createElement('canvas'); c.width = c.height = PREVIEW; return c; };
const toBlob = c => new Promise(r => c.toBlob(r, 'image/jpeg', .85));

export async function buildDemo() {
  const R = makeRng(20261029), items = [], S = PREVIEW, c = newCanvas(), ctx = c.getContext('2d');
  let id = 0, img = 4100;
  const pad = n => String(n).padStart(2, '0');
  const start = new Date(2025, 0, 1).getTime(), end = new Date(2026, 9, 28).getTime();
  const when = () => new Date(start + Math.pow(R.f(), .7) * (end - start));
  const mb = (a, b) => Math.round(R.r(a, b) * 1048576);

  const add = async (meta, draw) => {
    ctx.save(); ctx.clearRect(0, 0, S, S); draw(ctx); ctx.restore();
    const a = analyzeCanvas(c);
    const family = meta.family || familyOf(meta.name);
    const item = { id: id++, family, kind: kindOf(family), text: '', gps: null, path: 'Downloads/' + meta.name, ...meta, ...a, decoded: true, preview: await toBlob(c), src: { type: 'demo' } };
    item.mtime = item.date.getTime();
    items.push(item); return item;
  };

  for (const [truth, n, draw] of PHOTOS) for (let k = 0; k < n; k++) {
    img += R.int(1, 9); const date = when();
    const name = truth === 'shots' ? `Screenshot ${date.toISOString().slice(0, 10)} at ${pad(R.int(8, 23))}.${pad(R.int(0, 59))}.${pad(R.int(0, 59))}.png` : `IMG_${img}.${R.pick(['HEIC', 'HEIC', 'JPG'])}`;
    const gps = ['travel', 'nature', 'food', 'spaces'].includes(truth) || (truth === 'selfies' && R.chance(.4)) ? (([la, lo]) => ({ lat: la + R.r(-.05, .05), lon: lo + R.r(-.05, .05) }))(R.pick(PLACES)) : null;
    await add({ name, truth, date, gps, size: mb(1.2, 4.6), w: 4032, h: 3024 }, x => draw(x, S, R));
  }
  for (const [truth, n, draw] of VIDEOS) for (let k = 0; k < n; k++) {
    img += R.int(1, 9); const date = when(), vert = R.chance(.6);
    const name = truth === 'v-screen' ? `Screen Recording ${date.toISOString().slice(0, 10)} at ${pad(R.int(8, 23))}.${pad(R.int(0, 59))}.mov` : `IMG_${img}.MOV`;
    await add({ name, truth, date, size: mb(8, 180), w: vert ? 1080 : 1920, h: vert ? 1920 : 1080 }, x => { draw(x, S, R); D.drawVideoBadge(x, S, R); });
  }
  for (const [name, voice] of AUDIO) await add({ name, date: when(), size: mb(1, 12) }, x => D.drawAudio(x, S, R, voice));
  for (const [name, text, draw] of DOCS) {
    const family = familyOf(name), big = family === 'installer' ? mb(80, 600) : family === 'archive' ? mb(5, 900) : mb(.05, 5);
    await add({ name, text, date: when(), size: big }, x => {
      if (draw) draw(x, S, R); else D.drawGenericFile(x, S, R, name.split('.').pop(), D.FAMILY_COLOR.other);
      D.drawTypeBadge(x, S, name.split('.').pop().toUpperCase().slice(0, 5), D.FAMILY_COLOR[family] || D.FAMILY_COLOR.other);
    });
  }

  // Junk: pocket shots and blurry frames (detected later by analysis, not labelled here)
  for (let k = 0; k < 10; k++) {
    img += R.int(1, 5); const [truth, , draw] = R.pick(PHOTOS.slice(0, 7));
    await add({ name: `IMG_${img}.HEIC`, truth, date: when(), size: mb(1, 3), w: 4032, h: 3024 }, x => {
      if (k < 4) { D.drawPocket(x, S, R); return; }
      const tmp = newCanvas(); draw(tmp.getContext('2d'), S, R);
      x.filter = `blur(${R.r(5, 8).toFixed(1)}px)`; x.drawImage(tmp, -8, -8, S + 16, S + 16); x.filter = 'none';
    });
  }

  // Duplicates: exact copies + a few near-duplicates (re-saved / slightly brighter)
  const visual = items.filter(i => i.kind === 'photo' && i.sharp > 120 && !/screenshot/i.test(i.name));
  const copies = [];
  for (let k = 0; k < 20; k++) {
    const o = R.pick(visual); if (copies.includes(o)) { k--; continue; } copies.push(o);
    const near = k >= 15, dot = o.name.lastIndexOf('.');
    const bmp = await createImageBitmap(o.preview);
    await add({ name: near ? `IMG_${img += 3}.JPG` : o.name.slice(0, dot) + R.pick([' (1)', ' copy', ' 2']) + o.name.slice(dot), truth: o.truth, date: o.date, gps: o.gps, size: near ? Math.round(o.size * .7) : o.size, w: o.w, h: o.h },
      x => { if (near) { x.filter = 'brightness(1.01)'; x.drawImage(bmp, 0, 0); x.filter = 'none'; } else x.drawImage(bmp, 0, 0); });
    bmp.close();
  }
  return items;
}
