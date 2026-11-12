import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '@playwright/test';
import { createProgressFiles } from '../src/progress.ts';
import type { Library, Progress } from '../src/types.ts';

const output = fileURLToPath(new URL('../dist-cloud/', import.meta.url));
const library: Library = JSON.parse(fs.readFileSync(path.join(output, 'library.json'), 'utf8'));
const mime: Record<string, string> = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json'};
const server = createServer((request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!/^(?:index\.html|library\.json|assets\/[\w.-]+)$/.test(relative)) {
    response.writeHead(404).end();
    return;
  }
  const filename = path.join(output, relative);
  if (!fs.existsSync(filename)) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {'Content-Type': mime[path.extname(filename)] + '; charset=utf-8'});
  fs.createReadStream(filename).pipe(response);
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = 'http://127.0.0.1:' + address.port;

function stable(progress: Progress) {
  const {updatedAt: _updatedAt, ...record} = progress;
  return record;
}

try {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch(engine === chromium ? {channel:'chrome'} : {});
    try {
      for (const width of [360, 768, 1440]) {
        const touch = width < 900;
        const context = await browser.newContext({viewport:{width, height:850}, isMobile:touch, hasTouch:touch, acceptDownloads:true});
        try {
          const page = await context.newPage();
          const errors: string[] = [];
          page.on('pageerror', error => errors.push(error.message));
          const libraryResponse = page.waitForResponse(response => response.url() === base + '/library.json' && response.ok());
          await page.goto(base + '/#drill');
          await libraryResponse;
          await page.locator('#drill-prompt').waitFor();
          assert.equal(await page.locator('[data-drill-choice]:enabled').count(), 4);
          const choice = page.locator('[data-drill-choice]').nth(library.drillQuestions[0].answer);
          if (touch) await choice.tap(); else await choice.press('Enter');
          assert.match(await page.locator('#drill-feedback h2').innerText(), /回答正确/);
          await page.locator('#drill-next').click();
          await page.reload();
          assert.match(await page.locator('.drill .eyebrow').innerText(), /第 2 题/);
          for (const [hash, selector] of [['home','.drill'], ['mistakes','.mistakes'], ['knowledge','#knowledge-search'], ['point-29','.reading-layout'], ['lab-pointers','.lab-canvas'], ['progress','.metrics']]) {
            await page.evaluate(value => location.hash = value, hash);
            await page.locator(selector).waitFor();
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), engine.name() + ' ' + width + ' ' + hash);
          }
          assert.deepEqual(errors, []);
          console.log('PASS ' + engine.name() + ' ' + width + 'px · HTTP assets, navigation, answering and resume');

          const backupPath = process.env.C_LAB_VERIFY_BACKUP;
          if (backupPath && engine === chromium && width === 1440) {
            const files = createProgressFiles(library);
            const expected = files.restore(JSON.parse(fs.readFileSync(backupPath, 'utf8')));
            async function importFile(file: string) {
              await page.locator('#storage-status').click();
              await page.locator('#import-file').setInputFiles(file);
              await page.locator('#confirm-import').click();
            }
            await importFile(backupPath);
            const restored = await page.evaluate(() => window.CLabDebug!.getState());
            assert.deepEqual(stable(restored), stable(expected));
            await page.locator('#storage-status').click();
            const pending = page.waitForEvent('download');
            await page.locator('#settings-dialog [data-action=export]').click();
            const exported = await (await pending).path();
            assert(exported);
            assert.deepEqual(stable(files.restore(JSON.parse(fs.readFileSync(exported, 'utf8')))), stable(expected));
            await page.locator('[data-action=close-settings]').click();
            await importFile(exported);
            await page.reload();
            await page.waitForFunction(() => !!window.CLabDebug);
            assert.deepEqual(stable(await page.evaluate(() => window.CLabDebug!.getState())), stable(expected));
            console.log('PASS private Windows backup: preview, import, export, reimport and reload');
          }
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  }
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
}
