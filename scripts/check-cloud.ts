import assert from 'node:assert/strict';
import { once } from 'node:events';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { start } from '../src/drill.ts';
import { fresh } from '../src/engine.ts';
import type { Library } from '../src/types.ts';

const root = fileURLToPath(new URL('../',import.meta.url));
const wrangler = path.join(root,'node_modules','wrangler','bin','wrangler.js');
const database = fs.mkdtempSync(path.join(os.tmpdir(),'clab-cloud-check-'));
const server = net.createServer();
await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const port = address.port;
await new Promise<void>(resolve => server.close(() => resolve()));
const base = 'http://127.0.0.1:' + port;
const fixturePassword = 'local-e2e-fixture-v1';
const library: Library = JSON.parse(fs.readFileSync(path.join(root,'dist-cloud','library.json'),'utf8'));
const authPath = '/api/progress';
const authRequest = (route: string, options: RequestInit = {}) => fetch(base + route, {...options, redirect:'manual'});

function localWorker(password: string) {
  const worker = spawn(process.execPath, [wrangler,'dev','--local','--port',String(port),'--persist-to',database,'--var','SITE_PASSWORD:' + password], {cwd:root, stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  let log = '';
  worker.stdout.on('data',chunk => { log = (log + String(chunk)).slice(-14000); });
  worker.stderr.on('data',chunk => { log = (log + String(chunk)).slice(-14000); });
  return {
    async ready() {
      for (let count = 0; count < 80 && worker.exitCode === null; count++) {
        try { if ((await authRequest('/login')).status === 200) return; } catch {}
        await wait(250);
      }
      throw Error('Local Worker failed to start: ' + log);
    },
    async stop() {
      if (worker.exitCode === null && worker.signalCode === null) {
        const exited = once(worker,'exit');
        worker.kill();
        await exited;
      }
    }
  };
}

async function login(page: Page) {
  await page.goto(base);
  await page.getByLabel('站点密码').fill(fixturePassword);
  const loginResponse = page.waitForResponse(response => response.url() === base + '/login' && response.request().method() === 'POST');
  await page.getByRole('button',{name:'登录',exact:true}).click();
  assert.equal((await loginResponse).status(),303);
  await page.locator('#storage-status').waitFor();
}

async function openDrill(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto(base + '/#drill');
  await page.locator('#drill-prompt').waitFor();
  return page;
}

async function refreshSync(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

async function main() {
  execFileSync(process.execPath,[wrangler,'d1','migrations','apply','DB','--local','--persist-to',database], {cwd:root,stdio:'pipe',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  const worker = localWorker(fixturePassword);
  let cookie = '';
  try {
    await worker.ready();
    for (const route of ['/','/index.html','/library.json']) assert.equal((await authRequest(route)).headers.get('location'),'/login');
    const cloudAssets = fs.readdirSync(path.join(root,'dist-cloud','assets'));
    for (const file of cloudAssets) assert.equal((await authRequest('/assets/' + file)).headers.get('location'),'/login');
    assert.equal((await authRequest(authPath)).status,401);
    assert.equal((await authRequest('/login',{method:'POST',headers:{Origin:'https://other.invalid'},body:'password=incorrect'})).status,403);
    console.log('PASS Worker protects document, course data, assets and API');

    const browser = await chromium.launch({channel:'chrome'});
    try {
      const a = await browser.newContext(), b = await browser.newContext();
      let left = await a.newPage();
      const right = await b.newPage();
      await login(left);
      await login(right);
      const stored = (await a.cookies()).find(c => c.name === '__Host-clab-session');
      assert(stored?.httpOnly && stored.secure && stored.sameSite === 'Lax');
      assert(stored.expires - Date.now()/1000 > 29*86400);
      cookie = stored.name + '=' + stored.value;
      await left.getByRole('button',{name:'初始化云端'}).click();

      const draft = fresh();
      const round = start(library.drillQuestions.map(q => q.id));
      const {roundId: _roundId, optionVersion: _optionVersion, ...legacyRound} = round;
      const seed = {...draft,drill:legacyRound};
      await left.locator('#import-file').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});
      await left.locator('#confirm-import').waitFor();
      assert.match(await left.locator('#import-preview').innerText(), /当前第 1 题/);
      const empty = await authRequest(authPath,{headers:{cookie}});
      assert.deepEqual(await empty.json(),{initialized:false});
      await left.locator('#confirm-import').click();
      await left.getByRole('button',{name:'云端已同步'}).waitFor();
      await refreshSync(right);
      await right.getByRole('button',{name:'云端已同步'}).waitFor();
      const again = await authRequest('/api/progress/initialize',{method:'POST',headers:{cookie,Origin:base,'Content-Type':'application/json'},body:JSON.stringify(seed)});
      assert.equal(again.status,409);
      console.log('PASS previewed legacy backup initializes the cloud exactly once');

      await left.close();
      await right.close();
      left = await openDrill(a);
      const rightDrill = await openDrill(b);
      const correct = library.drillQuestions[0].answer;
      const dropSync = (route: import('@playwright/test').Route) => route.abort('internetdisconnected');
      const progressRequests = /\/api\/progress(?:\?.*)?$/;
      await a.route(progressRequests, dropSync);
      await a.setOffline(true);
      await left.locator(`[data-drill-choice="${(correct + 1) % 4}"]`).click();
      assert.match(await left.locator('#drill-feedback').innerText(), /回答错误/);
      await left.waitForFunction(() => new Promise<boolean>(resolve => {
        const request = indexedDB.open('c-micro-lab-cloud-v1',1);
        request.onsuccess = () => {
          const db = request.result;
          const count = db.transaction('pending').objectStore('pending').count();
          count.onsuccess = () => { db.close(); resolve(count.result > 0); };
        };
      }));
      // Unload the app while still offline: closing first would lift the emulation before scripts stop and let the queue sync.
      await left.goto('about:blank');
      await left.close();
      const beforeRight = await authRequest(authPath,{headers:{cookie}});
      assert.deepEqual((await beforeRight.json() as {operations:unknown[]}).operations, []);
      await rightDrill.locator(`[data-drill-choice="${correct}"]`).click();
      await expect(rightDrill.locator('#drill-feedback h2')).toHaveText('回答正确');
      await expect.poll(async () => {
        const result = await authRequest(authPath,{headers:{cookie}});
        const body = await result.json() as {operations:{change:{drill?:{answer?:{answer:{correct:boolean}}}}}[]};
        return body.operations.map(op => op.change.drill?.answer?.answer.correct).filter(x => x !== undefined);
      }).toEqual([true]);
      await rightDrill.getByRole('button',{name:'云端已同步'}).waitFor();
      await a.unroute(progressRequests, dropSync);
      await a.setOffline(false);
      left = await openDrill(a);
      await left.waitForFunction(() => window.CLabDebug?.getState().drillAttempts?.length === 2);
      await expect(left.locator('#drill-feedback h2')).toHaveText('回答正确');
      assert.match(await left.locator('.drill-stats').innerText(), /答对 1/);
      await refreshSync(rightDrill);
      await rightDrill.waitForFunction(() => window.CLabDebug?.getState().drillAttempts?.length === 2);
      console.log('PASS offline answer survives closing the tab; both attempts sync and first server answer scores');

      const replay = {id:'33333333-3333-4333-8333-333333333333',change:{time:Date.now(),settings:{textSize:1.2}}};
      const options = {method:'POST',headers:{cookie,Origin:base,'Content-Type':'application/json'},body:JSON.stringify([replay])};
      assert.equal((await authRequest(authPath,options)).status,200);
      const repeated = await authRequest(authPath,options);
      const payload = await repeated.json() as {operations:{id:string}[]};
      assert.equal(payload.operations.filter(op => op.id === replay.id).length,1);
      assert.equal((await authRequest(authPath,{...options,headers:{...options.headers,Origin:'https://other.invalid'}})).status,403);
      console.log('PASS repeated operations are idempotent and foreign-origin writes are blocked');
    } finally { await browser.close(); }
  } finally { await worker.stop(); }

  const rotated = localWorker('local-e2e-fixture-v2');
  try {
    await rotated.ready();
    assert.equal((await authRequest(authPath,{headers:{cookie}})).status,401);
    let limited: Response | undefined;
    for (let i=0; i<10 && !limited; i++) {
      const response = await authRequest('/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/x-www-form-urlencoded'},body:'password=incorrect'});
      if (response.status === 429) limited = response;
      else assert.equal(response.status,401);
    }
    assert(limited?.headers.get('Retry-After'));
    console.log('PASS password rotation revokes existing sessions and login throttles repeated failures');
  } finally { await rotated.stop(); }
}

await main();
