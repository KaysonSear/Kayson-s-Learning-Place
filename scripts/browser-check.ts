import {chromium} from '@playwright/test';
import type {Locator, Page} from '@playwright/test';
import type {Library, Progress} from '../src/types.ts';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const D: Library=JSON.parse(fs.readFileSync(path.join(root,'content/library.json'),'utf8'));
const url=pathToFileURL(path.join(root,'dist/C-Lab.html')).href;
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={time:new Date().toISOString(),target:'Windows Chrome + Android-like Chromium touch emulation (not physical Android)',checks:[] as string[],errors:[] as string[],externalRequests:[] as string[]};
function ok(name: string){report.checks.push(name);console.log('PASS',name);}
async function assertIntegerTable(feedback: Locator) {
  const prose = feedback.locator('.feedback-prose');
  assert.equal(await prose.locator('thead th').count(), 4);
  assert.equal(await prose.locator('tbody tr').count(), 5);
  assert.equal(await prose.locator('tbody tr').first().locator('td').count(), 4);
  assert.equal(await prose.locator('tbody tr').first().locator('td code').first().innerText(), 'signed char');
  assert.match(await prose.locator('p').first().innerText(), /至少容纳的范围/);
  assert.match(await prose.locator('table + p').innerText(), /<limits\.h>/);
}

async function assertTableScrolls(tab: Page) {
  const scrollable = await tab.locator('.feedback-prose table').evaluate(table => {
    table.scrollLeft = table.scrollWidth;
    return table.scrollWidth > table.clientWidth && table.scrollLeft > 0;
  });
  assert(scrollable);
  assert.equal(await tab.evaluate(() => document.documentElement.scrollWidth), 360);
}
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
await context.setOffline(true);
const page=await context.newPage();
page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))report.externalRequests.push(r.url());});
try{
  await page.goto(url);await page.waitForSelector('#drill-prompt');
  assert.equal(await page.title(),"Kayson's Learning Place");
  assert.equal(await page.evaluate(()=>window.CLabDebug!.counts.points),1064);ok('file:// launch while offline opens the drill');
  assert.equal(await page.locator('.brand').getAttribute('aria-label'),"Kayson's Learning Place");
  assert.match(await page.locator('.brand').innerText(),/^K\s*ayson's\s*Learning Place$/);
  assert.equal(await page.locator('.field-tab.active').innerText(),'Coding · C');
  assert.equal(await page.locator('.field-tab:disabled').count(),2);
  assert.equal(await page.getByText('从理解').count(),0);
  assert.match(decodeURIComponent((await page.locator('link[rel=icon]').getAttribute('href'))!),/>K<\/text>/);ok('brand, Field tabs and drill-first landing');
  await page.screenshot({path:path.join(root,'tests/home-desktop.png')});
  for (const legacy of ['home','quiz']) { await page.evaluate(h=>location.hash=h,legacy);await page.waitForSelector('#drill-prompt'); }
  assert.equal(await page.locator('.main-nav [data-nav=drill].active').count(),1);ok('legacy home and quiz routes open the drill');
  await page.evaluate(()=>location.hash='point-770');await page.waitForSelector('.reading-layout');
  assert(await page.locator('.prose pre').count()>0);ok('full original code reading');
  await page.evaluate(()=>location.hash='point-77');await page.waitForSelector('.reading-layout table');
  assert(!(await page.locator('.reading-layout').innerText()).includes('<code>'));
  assert.equal(await page.locator('.reading-layout td code', {hasText:/^\|\|$/}).count(),1);
  await page.evaluate(()=>location.hash='point-634');await page.waitForSelector('.reading-layout');
  assert.equal(await page.locator('.reading-layout strong', {hasText:'调用栈（Call Stack）'}).count(),1);
  assert(!(await page.locator('.reading-layout').innerText()).includes('**'));
  ok('table pipes and CJK bold render without Markdown residue');
  await page.evaluate(()=>location.hash='chapter-7');await page.waitForSelector('.cluster-group');assert(await page.locator('svg').count()>0);ok('embedded linked knowledge SVGs');
  await page.evaluate(()=>location.hash='knowledge');await page.waitForSelector('#knowledge-search');await page.locator('#knowledge-search').fill('realloc');
  assert(await page.locator('.point-row').count()>0);assert((await page.locator('.point-row').count())<70);ok('whole-source search');
  await page.evaluate(()=>location.hash='lab-pointers');await page.waitForSelector('[data-lab-action=move]');
  await page.locator('[data-lab-action=move][data-value="1"]').click();await page.locator('[data-lab-action=move][data-value="1"]').click();await page.locator('[data-lab-action=read]').click();await page.locator('[data-lab-action=move][data-value="1"]').click();await page.locator('[data-lab-action=read]').click();
  assert.match(await page.locator('.lab-status').innerText(),/未定义行为/);assert((await page.evaluate(()=>window.CLabDebug!.getState())).labs.pointers);ok('pointer boundary stops value and awards separate lab badge');
  await page.getByRole('button',{name:'本机已保存'}).click();const downloadPromise=page.waitForEvent('download');await page.locator('#settings-dialog [data-action=export]').click();const download=await downloadPromise;const downloadPath=await download.path();const saved: Progress=JSON.parse(fs.readFileSync(downloadPath!,'utf8'));assert(saved.drill&&saved.labs.pointers);ok('progress export with drill and labs');
  await page.locator('#import-file').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{')});await page.waitForFunction(()=>!!document.querySelector('#import-error')?.textContent);assert.match(await page.locator('#import-error').innerText(),/JSON/);ok('invalid import keeps current state');
  await page.locator('#import-file').setInputFiles({name:'progress.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await page.waitForSelector('#confirm-import');await page.locator('#confirm-import').click();assert.deepEqual((await page.evaluate(()=>window.CLabDebug!.getState())).labs,saved.labs);ok('validated import roundtrip');
  const beforeDrill = await page.evaluate(() => window.CLabDebug!.getState());
  await page.evaluate(() => location.hash = 'drill');
  assert.match(await page.locator('.drill .eyebrow').innerText(), /第 1 题/);
  assert.equal(await page.locator('[data-drill-choice]:enabled').count(), 4);
  const jumpTo = async (number: number) => {
    await page.locator('#drill-number').fill(String(number));
    await page.locator('#drill-jump').getByRole('button').click();
  };
  await jumpTo(1065);
  assert.match(await page.locator('#drill-error').innerText(), /1064/);
  await jumpTo(1064);
  const lastChoice = D.drillQuestions.at(-1)!.answer;
  await page.locator(`[data-drill-choice="${lastChoice}"]`).press('Enter');
  assert.match(await page.locator('#drill-feedback').innerText(), /回答正确/);
  assert.equal(await page.locator('#drill-feedback .button-row a').getAttribute('href'), '#point-1064');
  await page.waitForFunction(() => document.activeElement?.id === 'drill-feedback');
  await page.keyboard.press('Enter');
  assert.match(await page.locator('.drill .eyebrow').innerText(), /第 1 题/);
  ok('drill jumps to original id, grades with keyboard, and wraps to the unanswered start');
  await page.locator('#drill-mode').selectOption('random');
  await jumpTo(288);
  assert.match(await page.locator('.drill .eyebrow').innerText(), /第 288 题 · 随机位置/);
  const question288 = D.drillQuestions[287];
  await page.locator(`[data-drill-choice="${(question288.answer + 1) % question288.options.length}"]`).click();
  assert.match(await page.locator('#drill-feedback').innerText(), /回答错误/);
  assert.equal(await page.locator('[data-drill-choice]:enabled').count(), 0);
  const duringDrill = await page.evaluate(() => window.CLabDebug!.getState());
  assert.deepEqual(duringDrill.points, beforeDrill.points);
  assert.deepEqual(duringDrill.session, beforeDrill.session);
  assert.deepEqual(duringDrill.history, beforeDrill.history);
  await page.reload(); await page.waitForFunction(() => !!window.CLabDebug);
  assert.deepEqual((await page.evaluate(() => window.CLabDebug!.getState())).drill, duringDrill.drill);
  assert.match(await page.locator('.drill-stats').innerText(), /已答 2 \/ 1064 · 答对 1 · 正确率 50%/);
  ok('random drill order and first answers survive reload without affecting mastery');
  await page.getByRole('button',{name:'本机已保存'}).click();
  const drillDownload = page.waitForEvent('download');
  await page.locator('#settings-dialog [data-action=export]').click();
  const drillBackup: Progress = JSON.parse(fs.readFileSync((await (await drillDownload).path())!,'utf8'));
  assert.deepEqual(drillBackup.drill, duringDrill.drill);
  for (const [fixture, expected] of [[saved, {}], [drillBackup, duringDrill.drill!.answers]]) {
    await page.locator('#import-file').setInputFiles({name:'progress.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
    await page.locator('#confirm-import').click();
    assert.deepEqual((await page.evaluate(() => window.CLabDebug!.getState())).drill!.answers, expected);
    if (fixture === saved) await page.getByRole('button',{name:'本机已保存'}).click();
  }
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#drill-restart').click();
  assert.deepEqual((await page.evaluate(() => window.CLabDebug!.getState())).drill, duringDrill.drill);
  ok('drill backup roundtrip, legacy import, and canceled reset');
  await page.reload(); await page.waitForFunction(() => !!window.CLabDebug);
  assert.equal(await page.locator('.main-nav .nav-badge').innerText(),'1');
  await page.locator('#drill-mix').check();
  assert.equal((await page.evaluate(() => window.CLabDebug!.getState())).settings.mixMistakes, true);
  await page.locator('#drill-next').click();
  for (let i = 0; i < 3; i++) {
    const id = Number((await page.locator('.drill .eyebrow').innerText()).match(/第 (\d+) 题/)![1]);
    await page.locator(`[data-drill-choice="${D.drillQuestions[id - 1].answer}"]`).click();
    await page.locator('#drill-next').click();
  }
  await page.waitForSelector('[data-mixed-review]');
  assert.match(await page.locator('.drill .eyebrow').innerText(), /错题回顾 · 第 288 题/);
  await page.locator(`[data-drill-choice="${question288.answer}"]`).click();
  assert.match(await page.locator('[data-mistake-note]').innerText(), /1 \/ 3/);
  await page.locator('#drill-next').click();
  assert.equal(await page.locator('[data-mixed-review]').count(), 0);
  ok('random drill mixes one mistake after every three new questions');
  await page.evaluate(() => location.hash = 'mistakes');
  assert.match(await page.locator('[data-mistake="288"]').innerText(), /连对 1 \/ 3/);
  await page.locator('[data-action=mistakes-start]').click();
  for (const expected of [/2 \/ 3/, /移出错题本/]) {
    assert.match(await page.locator('.drill .eyebrow').innerText(), /第 288 题/);
    await page.locator(`[data-drill-choice="${question288.answer}"]`).click();
    assert.match(await page.locator('[data-mistake-note]').innerText(), expected);
    await page.locator('#drill-next').click();
  }
  assert.match(await page.locator('.mistakes h2').innerText(), /已清空/);
  assert.equal(await page.locator('.main-nav .nav-badge').count(), 0);
  ok('mistake-book practice removes a question after three consecutive correct answers in any mode');
  await page.evaluate(() => location.hash = 'drill');await page.waitForSelector('#drill-mode');
  const legacyDrill = {
    mode: 'random', order: D.points.map(point => point.id).reverse(), current: 31,
    answers: { 1: 2, 2: 1, 25: 1, 31: 0 }, finished: false
  };
  const legacyBackup = { ...saved, drill: legacyDrill };
  const expectedLegacyChoices = { 1: 'main', 2: 'void', 25: '有符号整数类型', 31: '必相等' };
  async function assertMigrated(tab: Page) {
    await tab.waitForFunction(() => !!window.CLabDebug);
    const restored = await tab.evaluate(() => window.CLabDebug!.getState().drill);
    assert(restored);
    assert.equal(restored.optionVersion, 2);
    assert.equal(restored.current, 31);
    assert.deepEqual(restored.order, legacyDrill.order);
    for (const [id, text] of Object.entries(expectedLegacyChoices)) {
      assert.equal(D.drillQuestions[Number(id) - 1].options[restored.answers[Number(id)]], text);
    }
    assert.match(await tab.locator('.drill-stats').innerText(), /已答 4 \/ 1064 · 答对 2 · 正确率 50%/);
    return restored;
  }
  await page.getByRole('button',{name:'本机已保存'}).click();
  await page.locator('#import-file').setInputFiles({name:'old-drill.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacyBackup))});
  await page.locator('#confirm-import').click();
  const migrated = await assertMigrated(page);
  await page.reload(); await page.waitForFunction(() => !!window.CLabDebug);
  assert.deepEqual(await assertMigrated(page), migrated);
  ok('legacy two- and three-option backups preserve both correct and incorrect choices');
  const legacyContext = await browser.newContext();
  await legacyContext.setOffline(true);
  const legacyPage = await legacyContext.newPage();
  await legacyPage.addInitScript(backup => localStorage.setItem('c-micro-lab-v1', JSON.stringify(backup)), legacyBackup);
  await legacyPage.goto(`${url}#drill`);
  assert.deepEqual(await assertMigrated(legacyPage), migrated);
  assert.equal(await legacyPage.evaluate(() => JSON.parse(localStorage.getItem('c-micro-lab-v1')!).drill.optionVersion), 2);
  await legacyContext.close();
  ok('existing local progress migrates and saves with the new option version');
  await page.locator('#drill-mode').selectOption('sequence');
  await jumpTo(57);
  await page.locator(`[data-drill-choice="${D.drillQuestions[56].answer}"]`).click();
  assert(await page.locator('#drill-feedback p math').count() >= 3);
  assert(!(await page.locator('#drill-feedback').innerText()).includes('$'));
  ok('inline math in drill explanations renders as formulas');
  await jumpTo(29);
  const integerQuestion = D.drillQuestions[28];
  await page.locator(`[data-drill-choice="${integerQuestion.answer}"]`).click();
  await assertIntegerTable(page.locator('#drill-feedback'));
  await page.locator('#drill-next').click();
  assert.match(await page.locator('.drill .eyebrow').innerText(), /第 30 题/);
  await jumpTo(29);
  await page.locator('#drill-feedback .button-row a').click();
  assert.match(await page.locator('.reading-head h1').innerText(), /标准最低整数范围/);
  await page.locator('[data-action=drill-point]').click();
  await page.waitForFunction(() => location.hash === '#drill');
  assert.match(await page.locator('.drill .eyebrow').innerText(), /第 29 题/);
  ok('desktop drill feedback preserves the #29 table, paragraphs, and point-to-drill navigation');
  const mobile=await browser.newContext({viewport:{width:360,height:800},deviceScaleFactor:1,isMobile:true,hasTouch:true});await mobile.setOffline(true);const m=await mobile.newPage();m.on('pageerror',e=>report.errors.push(e.message));
  await m.goto(url);
  for(const hash of ['drill','mistakes','knowledge','chapter-7','point-770','progress','labs',...['build','types','expressions','control','calls','arrays','pointers','strings','formats','parse','bits','sort','struct','resources','streams','math'].map(id=>'lab-'+id)]){
    await m.evaluate(h=>location.hash=h,hash);await m.waitForTimeout(25);
    const overflow=await m.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));assert(overflow.scroll<=overflow.client+1,`${hash} overflows: ${JSON.stringify(overflow)}`);
  }ok('360px touch layout: all 16 labs and knowledge/progress views fit');
  await m.evaluate(()=>location.hash='drill');await m.waitForSelector('#drill-prompt');await m.screenshot({path:path.join(root,'tests/home-mobile.png'),fullPage:true});
  await m.evaluate(()=>location.hash='mistakes');await m.waitForSelector('.mistakes');assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth),360);ok('mobile drill landing and mistake book layout');
  await m.evaluate(()=>location.hash='lab-pointers');await m.waitForSelector('.lab-canvas');await m.screenshot({path:path.join(root,'tests/lab-mobile.png'),fullPage:true});
  await m.setViewportSize({width:768,height:1024});assert(await m.evaluate(()=>document.documentElement.scrollWidth<=768));ok('768px tablet layout');
  await m.setViewportSize({width:360,height:800});
  await m.locator('.bottom-nav a[href="#drill"]').tap();
  for (let choice = 0; choice < 4; choice++) {
    assert.equal(await m.locator('[data-drill-choice]:enabled').count(), 4);
    assert.equal(await m.evaluate(() => document.documentElement.scrollWidth), 360);
    await m.locator(`[data-drill-choice="${choice}"]`).tap();
    if (choice === 0) {
      assert.equal(await m.locator('#drill-feedback .feedback-prose').count(), 0);
      assert.equal(await m.locator('#drill-feedback > p').last().innerText(), D.drillQuestions[0].explanation);
    }
    await m.locator('#drill-next').tap();
  }
  assert.match(await m.locator('.drill .eyebrow').innerText(), /第 5 题/);
  await m.locator('#drill-number').fill('29');
  await m.locator('#drill-jump').getByRole('button').tap();
  await m.locator(`[data-drill-choice="${integerQuestion.answer}"]`).tap();
  await assertIntegerTable(m.locator('#drill-feedback'));
  await assertTableScrolls(m);
  await m.locator('#drill-next').tap();
  assert.match(await m.locator('.drill .eyebrow').innerText(), /第 30 题/);
  ok('mobile table scrolls horizontally inside drill feedback without widening the page');
  await m.setViewportSize({width:768,height:1024});
  assert(await m.evaluate(() => document.documentElement.scrollWidth <= 768));
  ok('drill fits 360px mobile and 768px tablet and advances by touch');
  await mobile.close();
  const blocked=await browser.newContext();await blocked.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('unavailable','SecurityError');}});});const b=await blocked.newPage();await b.goto(url);await b.waitForFunction(() => !!window.CLabDebug);assert(await b.locator('#storage-warning').isVisible());await b.waitForSelector('[data-drill-choice]');ok('unavailable local storage still permits learning');await blocked.close();
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);ok('no JavaScript exceptions or external HTTP requests');
}catch(error){report.errors.push(error instanceof Error ? error.stack ?? error.message : String(error));throw error;}finally{fs.writeFileSync(path.join(root,'tests/browser-report.json'),JSON.stringify(report,null,2));await browser.close();}
