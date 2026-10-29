// The only bridge between the web app and the Mac. Every call is validated again in main.cjs.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  downloadsPath: () => ipcRenderer.invoke('downloads-path'),
  photosLibraryPath: () => ipcRenderer.invoke('photos-path'),
  scan: (dir, max) => ipcRenderer.invoke('scan', dir, max),
  quickLook: (abs, size) => ipcRenderer.invoke('quicklook', abs, size),
  move: (from, destDir, name) => ipcRenderer.invoke('move', from, destDir, name),
  removeEmptyDirs: dir => ipcRenderer.invoke('remove-empty-dirs', dir),
  reveal: abs => ipcRenderer.invoke('reveal', abs),
  notify: (title, body) => ipcRenderer.invoke('notify', title, body),
  fileUrl: abs => 'localfile://f/' + encodeURIComponent(abs),
  onNewFile: cb => ipcRenderer.on('new-file', (_e, f) => cb(f)),
  onCommand: cb => ipcRenderer.on('command', (_e, c) => cb(c)),
});
