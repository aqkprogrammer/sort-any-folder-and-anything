// Folder definitions, file-type families and the rule-based classifiers.
// The AI classifier (CLIP) lives in ai.js and only refines photos/videos and custom folders.

import { ext } from './util.js';

const FAMILIES = {
  photo: 'jpg jpeg png gif webp heic heif avif bmp tif tiff dng cr2 cr3 nef arw raf orf rw2',
  video: 'mov mp4 m4v avi mkv webm 3gp',
  audio: 'mp3 wav m4a aac flac ogg aiff aif opus',
  pdf: 'pdf',
  word: 'doc docx pages rtf odt',
  text: 'txt md markdown log',
  sheet: 'xls xlsx csv numbers ods tsv',
  slide: 'ppt pptx key odp',
  code: 'js mjs cjs ts tsx jsx py rb go rs java kt swift c cpp h cs php html css scss json xml yaml yml toml sh sql ipynb',
  archive: 'zip rar 7z tar gz tgz bz2 xz',
  installer: 'dmg pkg exe msi apk deb ipa',
  design: 'psd ai sketch fig xd svg indd',
  font: 'ttf otf woff woff2',
  ebook: 'epub mobi azw3',
};
const EXT_FAMILY = {};
for (const [fam, list] of Object.entries(FAMILIES)) for (const e of list.split(' ')) EXT_FAMILY[e] = fam;

export function familyOf(name, mime = '') {
  const f = EXT_FAMILY[ext(name)];
  if (f) return f;
  if (mime.startsWith('image/')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('text/')) return 'text';
  return 'other';
}
export const kindOf = fam => (fam === 'photo' || fam === 'video' || fam === 'audio') ? fam : 'doc';
export const sectionOf = kind => kind === 'photo' ? 'photo' : kind === 'doc' ? 'docs' : 'media';

/* ---------- folder sets ---------- */
// prompts are used by CLIP; folders without prompts are filled by rules only.
const P = (id, name, kinds, prompts = null) => ({ id, name, section: kinds.includes('photo') ? 'photo' : kinds.includes('doc') ? 'docs' : 'media', kinds, prompts });

export const SMART_PHOTO = [
  P('selfies', 'Selfies & portraits', ['photo'], ['a selfie', 'a portrait photo of a person', 'a close-up photo of a face']),
  P('food', 'Food & cafés', ['photo'], ['a photo of food', 'a plate of food', 'a cup of coffee', 'a dessert']),
  P('travel', 'Travel & vibe', ['photo'], ['a travel photo', 'a beach at sunset', 'a city skyline', 'a famous landmark']),
  P('nature', 'Nature', ['photo'], ['a landscape photo of mountains', 'a forest', 'nature scenery', 'flowers in a field']),
  P('spaces', 'Aesthetic spaces', ['photo'], ['an interior design photo', 'a cozy room with a window', 'a cafe interior', 'architecture']),
  P('pets', 'Pets', ['photo'], ['a photo of a cat', 'a photo of a dog', 'a cute pet']),
  P('wfh', 'Work from home', ['photo'], ['a laptop on a desk', 'a home office desk setup', 'a computer workspace']),
  P('notes', 'Photos of docs', ['photo'], ['a photo of a document', 'a handwritten note', 'a printed receipt', 'a page of text']),
  // Screenshots are found by name/shape, not by the AI: CLIP mistakes flat graphics for app UIs.
  P('shots', 'Screenshots', ['photo']),
  P('junk', 'Probably junk', ['photo']),
];
export const COLOR_PHOTO = [
  P('shots', 'Screenshots', ['photo']),
  P('green', 'Greens & nature', ['photo']),
  P('blue', 'Blue skies & sea', ['photo']),
  P('warm', 'Golden & warm', ['photo']),
  P('pink', 'Pinks & purples', ['photo']),
  P('night', 'Night & moody', ['photo']),
  P('bright', 'Bright & minimal', ['photo']),
  P('bw', 'Black & white', ['photo']),
  P('rawimg', 'Other image formats', ['photo']),
  P('junk', 'Probably junk', ['photo']),
];
export const SMART_MEDIA = [
  P('v-talk', 'Talking & vlogs', ['video'], ['a person talking to the camera', 'a selfie video', 'a portrait of a person']),
  P('v-travel', 'Travel clips', ['video'], ['travel footage', 'a beach', 'a city street', 'mountains and nature']),
  P('v-hobby', 'Hobby & music clips', ['video'], ['a musical instrument', 'a vinyl record', 'food being cooked', 'a pet playing']),
  P('v-screen', 'Screen recordings', ['video']),
  P('a-music', 'Music & audio', ['audio']),
  P('a-voice', 'Voice memos', ['audio']),
];
export const COLOR_MEDIA = [
  P('v-vert', 'Vertical clips', ['video']),
  P('v-horiz', 'Horizontal clips', ['video']),
  P('v-screen', 'Screen recordings', ['video']),
  P('v-other', 'Other videos', ['video']),
  P('a-music', 'Music & audio', ['audio']),
  P('a-voice', 'Voice memos', ['audio']),
];
export const DOCS = [
  P('invoices', 'Invoices & receipts', ['doc']),
  P('contracts', 'Contracts & legal', ['doc']),
  P('cvs', 'CVs & resumes', ['doc']),
  P('tickets', 'Tickets & bookings', ['doc']),
  P('finance', 'Bank & finance', ['doc']),
  P('docs', 'Documents', ['doc']),
  P('sheets', 'Spreadsheets', ['doc']),
  P('slides', 'Presentations', ['doc']),
  P('code', 'Code & data', ['doc']),
  P('archives', 'Archives', ['doc']),
  P('installers', 'Installers', ['doc']),
  P('design', 'Design & fonts', ['doc']),
  P('other', 'Other files', ['doc']),
];
export const DUPES = { id: 'dupes', name: 'Duplicates', section: 'stage', kinds: [] };

// smart = semantic photo/video folders (demo ground truth or AI). Otherwise colour/shape based.
// Real folders sorted "smart" (AI on) also get catch-alls for files the AI can't read.
export function folderSet(smart, custom = [], real = false) {
  const photo = smart ? [...SMART_PHOTO.slice(0, -1), ...(real ? [COLOR_PHOTO[8]] : []), SMART_PHOTO.at(-1)] : COLOR_PHOTO;
  const media = smart ? [...SMART_MEDIA.slice(0, 4), ...(real ? [COLOR_MEDIA[3]] : []), ...SMART_MEDIA.slice(4)] : COLOR_MEDIA;
  return [...custom, ...photo, ...media, ...DOCS, DUPES];
}
export const customFolder = name => ({
  id: 'c-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, section: 'photo', kinds: ['photo', 'video', 'doc'], custom: true,
  prompts: [`a photo of ${name}`, name, `${name} picture`],
  keywords: name.toLowerCase().split(/[^a-z0-9à-ÿ]+/).filter(w => w.length > 2),
});

/* ---------- rule-based classifiers ---------- */
const TOPICS = [
  ['tickets', /boarding pass|e-?ticket|booking (ref|reference|confirmation)|itinerary|\bflight\b|reservation|check-?in|\bgate\b|hotel confirmation|train ticket|pnr/g],
  ['invoices', /invoice|receipt|order (#|no|number)|subtotal|amount due|\bvat\b|tax invoice|payment received|total due|bill to|qty/g],
  ['finance', /bank statement|statement period|account (number|balance)|\biban\b|opening balance|closing balance|transactions|payslip|salary|tax return|\bw-?2\b|\b1099\b|portfolio/g],
  ['contracts', /agreement|contract|hereby|terms and conditions|the parties|\bnda\b|non-disclosure|\blease\b|signature|witness|governing law/g],
  ['cvs', /\bresume\b|résumé|curriculum vitae|\bcv\b|work experience|\beducation\b|\bskills\b|references available/g],
];

export function docTopic(text) {
  const t = text.toLowerCase(); let best = null, bestN = 0;
  for (const [id, re] of TOPICS) { const n = (t.match(re) || []).length; if (n > bestN) { best = id; bestN = n; } }
  return bestN >= 2 ? { id: best, hits: bestN } : null;
}

const FAMILY_FOLDER = { pdf: 'docs', word: 'docs', text: 'docs', ebook: 'docs', sheet: 'sheets', slide: 'slides', code: 'code', archive: 'archives', installer: 'installers', design: 'design', font: 'design', other: 'other' };
const FAMILY_LABEL = { pdf: 'PDF', word: 'Word-type document', text: 'text file', ebook: 'e-book', sheet: 'spreadsheet', slide: 'presentation', code: 'code / data file', archive: 'archive', installer: 'installer', design: 'design file', font: 'font', other: 'unrecognised type' };

// Returns {cat, reason}. `custom` folders are matched by keywords for documents.
export function classifyRule(item, { smart, custom = [] } = {}) {
  const name = item.name, low = name.toLowerCase();
  if (item.kind === 'doc') {
    const text = name.replace(/[_\-.]/g, ' ') + ' ' + (item.text || '');
    for (const c of custom) { const hit = c.keywords.find(k => text.toLowerCase().includes(k)); if (hit) return { cat: c.id, reason: `Mentions “${hit}”` }; }
    if (['pdf', 'word', 'text'].includes(item.family)) {
      const t = docTopic(text);
      if (t) return { cat: t.id, reason: `Text reads like ${DOCS.find(d => d.id === t.id).name.toLowerCase()} (${t.hits} clues)` };
    }
    return { cat: FAMILY_FOLDER[item.family] || 'other', reason: `File type: ${FAMILY_LABEL[item.family] || item.family}` };
  }
  if (item.kind === 'audio') {
    return /record|voice|memo|audio note|whatsapp audio|\bptt\b|dictation/i.test(name)
      ? { cat: 'a-voice', reason: 'Name looks like a voice recording' } : { cat: 'a-music', reason: 'Audio file' };
  }
  if (item.kind === 'video') {
    if (/screen ?record|bildschirmaufnahme/i.test(low)) return { cat: 'v-screen', reason: 'Name says screen recording' };
    if (smart) return { cat: item.truth || 'v-talk', reason: 'Demo file — drawn as this kind of picture' };
    if (!item.w) return { cat: 'v-other', reason: 'Could not read video size' };
    return item.h > item.w ? { cat: 'v-vert', reason: `Vertical ${item.w}×${item.h}` } : { cat: 'v-horiz', reason: `Horizontal ${item.w}×${item.h}` };
  }
  // photo
  if (/screen ?shot|screenshot|снимок|bildschirmfoto/i.test(low)) return { cat: 'shots', reason: 'Name says screenshot' };
  if (ext(name) === 'png' && item.w && Math.max(item.w / item.h, item.h / item.w) >= 1.9) return { cat: 'shots', reason: 'Phone-screen-shaped PNG' };
  if (smart) return { cat: item.truth || 'selfies', reason: 'Demo file — drawn as this kind of picture' };
  const st = item.stats;
  if (!st) return { cat: 'rawimg', reason: 'This browser can’t decode the format' };
  if (st.lum < .24) return { cat: 'night', reason: `Dark overall (brightness ${(st.lum * 100) | 0}%)` };
  if (st.sat < .09) return { cat: 'bw', reason: 'Almost no colour' };
  if (st.lum > .74 && st.sat < .25) return { cat: 'bright', reason: 'Bright and pale' };
  const h = st.hist, sum = (...ix) => ix.reduce((a, i) => a + h[i], 0);
  const scores = { warm: sum(11, 0, 1, 2), green: sum(3, 4, 5), blue: sum(6, 7, 8), pink: sum(9, 10) };
  const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  return { cat: top, reason: `Mostly ${{ warm: 'warm/golden', green: 'green', blue: 'blue', pink: 'pink/purple' }[top]} tones` };
}
