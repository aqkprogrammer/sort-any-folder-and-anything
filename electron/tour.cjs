// Scripted walkthrough that captures the README screenshots: npm run screenshots
const { BrowserWindow, app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

module.exports = async function tour(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const win = new BrowserWindow({ width: 1512, height: 945, show: false, paintWhenInitiallyHidden: true, backgroundColor: '#f7f1f4',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, backgroundThrottling: false } });
  await win.loadURL('app://bundle/index.html');
  const js = code => win.webContents.executeJavaScript(code, true);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const until = async (cond, ms = 240000) => { const t = Date.now(); while (!(await js(cond))) { if (Date.now() - t > ms) throw new Error('timeout: ' + cond); await sleep(300); } };
  const shot = async name => { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(outDir, name + '.png'), img.resize({ width: 1600, quality: 'best' }).toPNG()); console.log('captured', name); };

  await until("window.__sorter && __sorter.S.phase === 'pile'");
  await js("localStorage.clear(); __sorter.S.corrections = {}; __sorter.setTheme('dark')");
  await sleep(1200); await shot('01-pile');
  await js('__sorter.startSort()'); await sleep(1700); await shot('02-sorting');
  await until("__sorter.S.phase === 'sorted'"); await sleep(1200); await shot('03-sorted');
  await js("__sorter.setView('rainbow')"); await sleep(2200); await shot('04-rainbow');
  await js("__sorter.setView('timeline')"); await sleep(2200); await shot('05-timeline');
  await js("__sorter.setView('map')"); await sleep(5000); await shot('06-map');
  await js("__sorter.setView('folders')"); await sleep(1500);
  await js("document.querySelector('#searchInput').value = 'invoice'; __sorter.runSearch('invoice')"); await sleep(2200); await shot('07-search');
  await js("document.querySelector('#searchInput').value = ''; __sorter.clearSearch(true)"); await sleep(1500);
  await js("__sorter.openFolder('invoices'); const S = __sorter.S; __sorter.openItem(S.cards.invoices.members[0].item, S.cards.invoices.members.map(m => m.item))"); await sleep(1200); await shot('08-details');
  await js('__sorter.closeModal()'); await js("__sorter.setTheme('light')"); await sleep(1200); await shot('09-light');
  await js("__sorter.setTheme('dark')");
  if (!process.argv.includes('--no-ai')) {
    await js('__sorter.toggleAI()');
    await until("document.querySelector('#aiBtn').classList.contains('on') && __sorter.S.phase === 'sorted'", 600000);
    await sleep(1500);
    await js("document.querySelector('#searchInput').value = 'a cat'; __sorter.runSearch('a cat')"); await sleep(2500); await shot('10-ai-search');
  }
  app.exit(0);
};
