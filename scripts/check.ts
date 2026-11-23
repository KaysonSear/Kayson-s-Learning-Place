import type { Library } from '../src/types.ts';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {courseSource} from './course-source.ts';
import crypto from 'node:crypto';
import {normalizeQuoteText} from './cloze-bank.ts';
import {hasMath, plainInline} from './markdown.ts';
import {PROGRESS_EPOCH} from '../src/epoch.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const D: Library=JSON.parse(fs.readFileSync(path.join(root,'content/library.json'),'utf8'));
const html=fs.readFileSync(path.join(root,'dist/C-Lab.html'),'utf8');
const ids=new Set(),prompts=new Map(),duplicates: [string,string][]=[];
const MARKER=/\{\{([^{}\n]{1,200})\}\}/g;

assert.equal(D.epoch, PROGRESS_EPOCH);
assert(D.points.length>=1087);assert.equal(D.chapters.length,19);assert(D.clusters.length>=120);
assert.equal(D.questions.length,D.points.length*2);assert(D.counts.diagrams>=190);
assert.equal(D.drillQuestions.length, D.points.length);
assert.equal(new Set(D.drillQuestions.map(q => q.prompt)).size, D.points.length);

function visibleText(htmlText: string) {
  return htmlText.replace(/<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>|<math[\s\S]*?<\/math>|<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ');
}

for (const [index, question] of D.drillQuestions.entries()) {
  const point = D.points[index];
  assert.equal(question.id, point.id);
  const blanks = question.blankCount ?? 0;
  assert(blanks >= 1 && blanks <= 3, `drill ${question.id} blank count`);
  assert.equal((question.prompt.match(/____/g) || []).length, blanks, `drill ${question.id} blanks`);
  assert(!question.prompt.includes('{{') && !question.prompt.includes('}}'), `drill ${question.id} markers`);
  assert(question.quote && question.note?.trim() && question.excerpt?.trim(), `drill ${question.id} source copy`);
  const markers = [...question.quote!.matchAll(MARKER)].map(match => match[1]);
  assert.equal(markers.length, blanks, `drill ${question.id} quote markers`);
  const filled = question.quote!.replace(MARKER, (_, content: string) => content);
  assert(normalizeQuoteText(point.markdown).includes(normalizeQuoteText(filled)), `drill ${question.id} is not verbatim source`);
  assert(normalizeQuoteText(point.markdown).includes(normalizeQuoteText(question.excerpt!)), `drill ${question.id} excerpt not in source`);
  assert(normalizeQuoteText(question.excerpt!).includes(normalizeQuoteText(filled)), `drill ${question.id} excerpt misses the blank`);
  const correct = markers.map(marker => plainInline(marker));
  assert.equal(question.options[question.answer], blanks === 1 ? correct[0] : correct.join('; '), `drill ${question.id} correct label`);
  assert.equal(question.options.length, 4);
  assert.equal(new Set(question.options).size, question.options.length);
  assert(Number.isInteger(question.answer) && question.options[question.answer]);
  for (const option of question.options) {
    if (blanks === 1) continue;
    const parts = option.split('; ');
    assert.equal(parts.length, blanks, `drill ${question.id} option parts: ${option}`);
    assert(parts.every(part => part.trim()), `drill ${question.id} empty option part`);
  }
  assert(question.legacyOptionMap.length >= 2 && question.legacyOptionMap.length <= 4);
  assert.equal(new Set(question.legacyOptionMap).size, question.legacyOptionMap.length);
  assert(question.legacyOptionMap.every(index => Number.isInteger(index) && index >= 0 && index < 4));
  assert(question.promptHtml?.trim() && question.excerptHtml?.trim() && question.explanationHtml?.trim(), `drill ${question.id} missing rendered HTML`);
  for (const rendered of [question.promptHtml!, question.excerptHtml!, question.explanationHtml!]) {
    assert(!rendered.includes('katex-error'), `drill ${question.id} invalid formula`);
    assert(!/<(?:script|iframe|object)\b/i.test(rendered), `drill ${question.id} unsafe HTML`);
    const visible = visibleText(rendered);
    for (const [name, re] of [['wiki link',/\[\[|\]\]/],['escaped tag',/&lt;\/?code/],['math',/\$/]] as const) {
      assert(!re.test(visible), `drill ${question.id} rendered ${name} residue`);
    }
  }
  const hasSourceMath = hasMath(question.note ?? '') || hasMath(question.excerpt ?? '');
  assert.equal(question.explanationHtml!.includes('<math'), hasSourceMath, `drill ${question.id} math rendering mismatch`);
  assert(question.explanation.startsWith(question.note!), `drill ${question.id} explanation missing note`);
}

for(let n=1;n<=D.points.length;n++){
  const p=D.points[n-1];assert.equal(p.id,n);assert(p.markdown.trim()&&p.html.trim());
  const pair=D.questions.filter(q=>q.pointId===n);assert.equal(pair.length,2,`point ${n}`);assert.deepEqual(pair.map(q=>q.stage).sort(),['a','b']);assert.notEqual(pair[0].prompt,pair[1].prompt);
}
for(const q of D.questions){
  assert(!ids.has(q.id),`duplicate id ${q.id}`);ids.add(q.id);
  assert(q.prompt?.trim()&&q.explanation?.trim()&&q.hint?.trim(),`incomplete ${q.id}`);assert(['choice','input','order','match'].includes(q.kind));
  if(q.kind==='choice'){assert(q.options?.length>=2);assert(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<q.options.length);assert.equal(new Set(q.options).size,q.options.length);}
  else if(q.kind==='order'||q.kind==='match'){assert(q.options?.length>=2&&Array.isArray(q.answer));assert.equal(q.answer.length,q.kind==='order'?q.options.length:q.items.length);assert(q.answer.every(i=>Number.isInteger(i)&&i>=0&&i<q.options.length));if(q.kind==='order')assert.equal(new Set(q.answer).size,q.options.length);}
  else assert(typeof q.answer==='string'&&q.answer.trim()||Array.isArray(q.answer)&&q.answer.length&&q.answer.every(a=>typeof a==='string'&&a.trim()),`bad answer ${q.id}`);
  const key=q.prompt.replace(/\s+/g,'');if(prompts.has(key))duplicates.push([prompts.get(key),q.id]);else prompts.set(key,q.id);
  assert(!q.prompt.includes('【填空】'),`generic source-cloze ${q.id}`);
  assert.equal(!!q.explanationHtml, /\$[^$\n]+\$/.test(q.explanation), `explanation math not rendered: ${q.id}`);
  if(q.explanationHtml){assert(!q.explanationHtml.includes('katex-error')&&!q.explanationHtml.includes('$'),`invalid explanation formula: ${q.id}`);assert(!/<(?:script|iframe|object)\b/i.test(q.explanationHtml),`unsafe explanation ${q.id}`);}
}
for(const q of D.drillQuestions){
  const key=q.prompt.replace(/\s+/g,'');if(prompts.has(key))duplicates.push([String(prompts.get(key)),String(q.id)]);else prompts.set(key,String(q.id));
}
for(const item of [...D.points,...D.chapters,...D.clusters,...D.extras]){
  const visible=visibleText(item.html);
  for(const [name,re] of [['escaped tag',/&lt;\/?code/],['bold',/\*\*/],['wiki link',/\[\[|\]\]/],['math',/\$/]] as const)
    assert(!re.test(visible),`${item.title} shows unrendered Markdown (${name})`);
  assert(!item.html.includes('katex-error'),`invalid formula: ${item.title}`);
  for(const m of item.html.matchAll(/href="#point-(\d+)"/g))assert(D.points.some(p=>p.id===Number(m[1])));
  assert(!/<(?:script|iframe|object)\b/i.test(item.html),`unsafe source ${item.title}`);
}
assert(!/<(?:script|link)[^>]+(?:src|href)=["']https?:/i.test(html),'external script/style');
assert(!/<img[^>]+src=["']https?:/i.test(html),'external media');
const raw=fs.readFileSync(courseSource);assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),D.sourceHash,'build source changed');
const report={...D.counts,epoch:D.epoch,bytes:Buffer.byteLength(html),uniquePrompts:prompts.size,duplicatePrompts:duplicates,sourceHash:D.sourceHash,originalUnchanged:true,validatedAt:new Date().toISOString()};
fs.writeFileSync(path.join(root,'tests/content-report.json'),JSON.stringify(report,null,2));
if(duplicates.length)console.warn('Review duplicate prompts:',JSON.stringify(duplicates));
console.log(JSON.stringify(report,null,2));
