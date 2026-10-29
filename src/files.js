// Where files come from and how they get moved.
//  • browser  — File System Access API (Chrome/Edge/Arc): can move files, with undo
//  • picker   — <input webkitdirectory> fallback (Safari/Firefox): read-only, exports a shell script
//  • desktop  — the Electron app (window.desktop bridge): native moves, Quick Look thumbnails
// Moves always go into a new "Sorted/<Folder>" directory inside the chosen folder and never overwrite.

import { ext } from './util.js';
import { familyOf } from './folders.js';

const MAX_FILES = 10000;
const skipDir = name => name.startsWith('.') || name === 'Sorted' || name === 'node_modules' || name.endsWith('.app') || name.endsWith('.photoslibrary');
const keepFile = name => !name.startsWith('.') && name !== 'Icon\r' && !name.endsWith('.crdownload') && !name.endsWith('.part');

export const canWriteInBrowser = () => typeof window.showDirectoryPicker === 'function';

export async function pickBrowserFolder(onCount) {
  const root = await window.showDirectoryPicker({ id: 'photo-sorter', mode: 'read' });
  const entries = [];
  async function walk(dir, prefix, depth) {
    for await (const [name, h] of dir.entries()) {
      if (entries.length >= MAX_FILES) return;
      if (h.kind === 'directory') { if (!skipDir(name) && depth < 6) await walk(h, `${prefix}${name}/`, depth + 1); continue; }
      if (!keepFile(name)) continue;
      const f = await h.getFile();
      entries.push({ name, size: f.size, mtime: f.lastModified, type: f.type, path: `${root.name}/${prefix}${name}`, handle: h, parent: dir, getFile: () => h.getFile() });
      if (entries.length % 50 === 0) onCount?.(entries.length);
    }
  }
  await walk(root, '', 0);
  return { kind: 'browser', name: root.name, root, entries, canMove: true, truncated: entries.length >= MAX_FILES };
}

export function fromFileList(list) {
  const files = [...list].filter(f => keepFile(f.name) && !f.webkitRelativePath.split('/').slice(1, -1).some(skipDir));
  const name = (files[0]?.webkitRelativePath || '').split('/')[0] || 'Selected';
  const entries = files.slice(0, MAX_FILES).map(f => ({ name: f.name, size: f.size, mtime: f.lastModified, type: f.type, path: f.webkitRelativePath || f.name, getFile: async () => f }));
  return { kind: 'picker', name, entries, canMove: false, truncated: files.length > MAX_FILES };
}

export async function desktopFolder(kind) {
  const d = window.desktop;
  const dir = kind === 'downloads' ? await d.downloadsPath() : kind === 'photos' ? await d.photosLibraryPath() : await d.pickFolder();
  if (!dir) return null;
  if (dir.error) throw new Error(dir.error);
  const res = await d.scan(dir, MAX_FILES);
  if (res.error) throw new Error(res.error);
  return { kind: 'desktop', name: dir.split('/').pop() || dir, dir, readOnly: kind === 'photos', canMove: kind !== 'photos',
    entries: res.files.map(desktopEntry), truncated: res.truncated };
}
export function desktopEntry(f) {
  const d = window.desktop, url = d.fileUrl(f.abs), fam = familyOf(f.name);
  return { name: f.name, size: f.size, mtime: f.mtime, path: f.rel, abs: f.abs, url,
    getFile: async () => new File([await (await fetch(url)).blob()], f.name, { lastModified: f.mtime }),
    // Quick Look renders HEIC, RAW, Office/iWork docs and more — anything Chromium can't decode itself.
    quickLook: (fam === 'photo' || fam === 'video' || ['word', 'sheet', 'slide', 'design', 'ebook', 'pdf'].includes(fam)) ? async () => { const b = await d.quickLook(f.abs, 352); return b ? new Blob([b], { type: 'image/png' }) : null; } : null };
}

/* ---------- moving ---------- */
async function freeName(dir, name) {
  const dot = name.lastIndexOf('.'), stem = dot > 0 ? name.slice(0, dot) : name, x = dot > 0 ? name.slice(dot) : '';
  for (let i = 1; i < 500; i++) {
    const cand = i === 1 ? name : `${stem} (${i})${x}`;
    try { await dir.getFileHandle(cand); } catch { return cand; }
  }
  throw new Error('No free file name for ' + name);
}

async function moveHandle(h, fromDir, fromName, toDir, toName) {
  if (typeof h.move === 'function') { await h.move(toDir, toName); return h; }
  // Fallback: copy, verify size, then remove the original.
  const src = await h.getFile(), nh = await toDir.getFileHandle(toName, { create: true }), w = await nh.createWritable();
  await w.write(src); await w.close();
  if ((await nh.getFile()).size !== src.size) throw new Error('Copy check failed for ' + fromName);
  await fromDir.removeEntry(fromName); return nh;
}

// plan: [{ entry, folder }] → returns a log usable by undoMoves
export async function applyMoves(source, plan, onProgress) {
  const log = [];
  if (source.kind === 'browser') {
    if (await source.root.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('Write permission was not granted');
    const sorted = await source.root.getDirectoryHandle('Sorted', { create: true }), dirs = {};
    for (const [i, { entry, folder }] of plan.entries()) {
      const to = dirs[folder] ??= await sorted.getDirectoryHandle(folder, { create: true });
      const toName = await freeName(to, entry.name);
      entry.handle = await moveHandle(entry.handle, entry.parent, entry.name, to, toName);
      log.push({ entry, fromDir: entry.parent, fromName: entry.name, toDir: to, toName });
      entry.parent = to; entry.name = toName;
      if (i % 10 === 0) onProgress?.(i / plan.length);
    }
    return { source, log, sorted };
  }
  if (source.kind === 'desktop') {
    for (const [i, { entry, folder }] of plan.entries()) {
      const r = await window.desktop.move(entry.abs, `${source.dir}/Sorted/${folder}`);
      if (r.error) throw new Error(r.error);
      log.push({ entry, from: entry.abs, to: r.path });
      entry.abs = r.path; entry.url = window.desktop.fileUrl(r.path);
      if (i % 10 === 0) onProgress?.(i / plan.length);
    }
    return { source, log };
  }
  throw new Error('This source is read-only');
}

export async function undoMoves(batch, onProgress) {
  const { source, log } = batch; let n = 0;
  for (const rec of [...log].reverse()) {
    if (source.kind === 'browser') {
      const name = await freeName(rec.fromDir, rec.fromName);
      rec.entry.handle = await moveHandle(rec.entry.handle, rec.toDir, rec.toName, rec.fromDir, name);
      rec.entry.parent = rec.fromDir; rec.entry.name = name;
    } else {
      const dir = rec.from.slice(0, rec.from.lastIndexOf('/')), r = await window.desktop.move(rec.to, dir, rec.from.split('/').pop());
      if (r.error) throw new Error(r.error);
      rec.entry.abs = r.path; rec.entry.url = window.desktop.fileUrl(r.path);
    }
    if (++n % 10 === 0) onProgress?.(n / log.length);
  }
  // Remove the now-empty Sorted folders (removeEntry refuses non-empty directories).
  if (source.kind === 'browser') {
    for await (const [name] of batch.sorted.entries()) { try { await batch.sorted.removeEntry(name); } catch { } }
    try { await source.root.removeEntry('Sorted'); } catch { }
  } else await window.desktop.removeEmptyDirs(`${source.dir}/Sorted`);
}

export function shellScript(sourceName, plan) {
  const q = s => "'" + String(s).replace(/'/g, "'\\''") + "'";
  const lines = ['#!/bin/bash', `# Photo Sorter — generated ${new Date().toLocaleString()}`,
    `# Dry run (only prints):   bash sort-files.sh "/path/to/${sourceName}"`,
    `# Really move the files:   DRY_RUN=0 bash sort-files.sh "/path/to/${sourceName}"`,
    '# Files are moved into a new "Sorted" folder inside it; nothing is overwritten or deleted.',
    'set -euo pipefail', `ROOT="\${1:?Pass the path to the ${sourceName} folder}"`, 'cd "$ROOT"', 'DRY_RUN="${DRY_RUN:-1}"',
    'm(){ if [ "$DRY_RUN" = "1" ]; then echo "would move: $1  ->  Sorted/$2/"; else mkdir -p "Sorted/$2"; if [ -e "$1" ]; then mv -n "$1" "Sorted/$2/"; fi; fi; }', ''];
  for (const { entry, folder } of plan) lines.push(`m ${q(entry.path.split('/').slice(1).join('/') || entry.name)} ${q(folder)}`);
  lines.push('', 'echo "Done."');
  return lines.join('\n') + '\n';
}

export const isPreviewable = name => ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'mp4', 'webm', 'mov', 'm4v', 'mp3', 'wav', 'm4a', 'pdf', 'txt', 'md'].includes(ext(name));
