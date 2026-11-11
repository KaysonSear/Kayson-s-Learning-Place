import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {courseSource} from './course-source.mjs';
import crypto from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const D=JSON.parse(fs.readFileSync(path.join(root,'content/library.json'),'utf8'));
const html=fs.readFileSync(path.join(root,'dist/C-Lab.html'),'utf8');
const ids=new Set(),prompts=new Map(),duplicates=[];
assert.equal(D.points.length,1064);assert.equal(D.chapters.length,19);assert.equal(D.clusters.length,118);assert.equal(D.questions.length,2128);assert.equal(D.counts.diagrams,190);
assert.equal(D.drillQuestions.length, D.points.length);
assert.equal(new Set(D.drillQuestions.map(q => q.prompt)).size, D.points.length);
for (const [index, question] of D.drillQuestions.entries()) {
  assert.equal(question.id, D.points[index].id);
  assert.equal((question.prompt.match(/____/g) || []).length, 1);
  assert(question.explanation.trim());
  assert.equal(question.options.length, 4);
  assert.equal(new Set(question.options).size, question.options.length);
  assert(Number.isInteger(question.answer) && question.options[question.answer]);
  assert(question.legacyOptionMap.length >= 2 && question.legacyOptionMap.length <= 4);
  assert.equal(new Set(question.legacyOptionMap).size, question.legacyOptionMap.length);
  assert(question.legacyOptionMap.every(index => Number.isInteger(index) && index >= 0 && index < 4));
}
for(let n=1;n<=1064;n++){
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
}
for(const item of [...D.points,...D.chapters,...D.clusters,...D.extras]){
  assert(!item.html.includes('katex-error'),`invalid formula: ${item.title}`);
  for(const m of item.html.matchAll(/href="#point-(\d+)"/g))assert(D.points.some(p=>p.id===Number(m[1])));
  assert(!/<(?:script|iframe|object)\b/i.test(item.html),`unsafe source ${item.title}`);
}
assert(!/<(?:script|link)[^>]+(?:src|href)=["']https?:/i.test(html),'external script/style');
assert(!/<img[^>]+src=["']https?:/i.test(html),'external media');
const raw=fs.readFileSync(courseSource);assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),D.sourceHash,'build source changed');
const report={...D.counts,bytes:Buffer.byteLength(html),uniquePrompts:prompts.size,duplicatePrompts:duplicates,sourceHash:D.sourceHash,originalUnchanged:true,validatedAt:new Date().toISOString()};
fs.writeFileSync(path.join(root,'tests/content-report.json'),JSON.stringify(report,null,2));
if(duplicates.length)console.warn('Review duplicate prompts:',JSON.stringify(duplicates));
console.log(JSON.stringify(report,null,2));
