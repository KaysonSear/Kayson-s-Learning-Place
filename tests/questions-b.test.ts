import type { Point } from '../src/types.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createQuestions} from '../scripts/questions-b.ts';
import {courseSource} from '../scripts/course-source.ts';

const raw=fs.readFileSync(courseSource,'utf8');
const headings=[...raw.matchAll(/^(#{2,4}) (.+)\r?$/gm)];
const points: Pick<Point,'id'|'title'|'chapter'|'markdown'>[]=[];let chapter=0;
headings.forEach((match,index)=>{
  if(match[1]==='##'&&/^\d{2} /.test(match[2]))chapter=Number(match[2].slice(0,2));
  const p=match[1]==='####'&&/^(\d+)\. (.*)/.exec(match[2]);
  if(p)points.push({id:+p[1],title:p[2],chapter,markdown:raw.slice(match.index+match[0].length,headings[index+1]?.index??raw.length).trim()});
});
const questions=createQuestions(points);
const item=(id: string)=>questions.find(q=>q.id===id)!;
const answers=(id: string)=>{const q=item(id);return q.kind==='choice'?[q.options[q.answer]]:q.kind==='input'?(Array.isArray(q.answer)?q.answer:[q.answer]):q.answer.map(String);};
const accepts=(id: string,expected: string | number)=>assert.ok(answers(id).includes(String(expected)),`${id} should accept ${expected}`);

test('late-course points have distinct authored baseline and transfer tasks',()=>{
  const latePoints = points.filter(point => point.chapter >= 11);
  assert(latePoints.length >= 577);
  assert.equal(questions.length,latePoints.length*2);
  assert.equal(new Set(questions.map(q=>q.id)).size,questions.length);
  for(const {id} of latePoints){
    assert.ok(item(`p${id}-a`),`missing A${id}`);assert.ok(item(`p${id}-b`),`missing B${id}`);
    assert.notEqual(item(`p${id}-a`).prompt,item(`p${id}-b`).prompt);
  }
  for(const q of questions){
    assert.ok(q.prompt.length>12);assert.ok(q.explanation);assert.ok(q.hint);
    assert.ok(!/上题|下一题|如图所示/.test(q.prompt),`${q.id} depends on shuffled context`);
    assert.ok(!q.prompt.includes('【填空】'),`${q.id} still uses a source-cloze fallback`);
    if(q.kind==='choice'){assert.equal(q.options.length>=2,true);assert.ok(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<q.options.length);}
    else assert.ok(answers(q.id).every(a=>typeof a==='string'&&a.trim().length>0));
  }
});

test('bit-model transfer values independently agree with finite-width arithmetic',()=>{
  accepts('p490-b',2**5-1);accepts('p491-b',128);accepts('p496-b',-128+1);
  accepts('p528-b',(0b1100&0b1010).toString(2).padStart(4,'0'));
  accepts('p529-b',(0b1100|0b1010).toString(2).padStart(4,'0'));
  accepts('p530-b',(0b1100^0b1010).toString(2).padStart(4,'0'));
  accepts('p531-b',2^3);accepts('p539-b',2^3);accepts('p540-b',8|2);accepts('p541-b',15&~4);accepts('p542-b',9^8);
  accepts('p561-b',Math.floor(29/4));accepts('p562-b',29%4);
  accepts('p558-b',`0x${(0xc0*2%256).toString(16)}`);
  accepts('p567-b',`0x${((0xffffffff<<1)>>>0).toString(16)}`);
});

test('recursive transfer expectations match independent small mathematical models',()=>{
  accepts('p630-b',3**3);accepts('p640-b',[1,2,3,4].reduce((a,b)=>a+b,0));
  accepts('p641-b',[1,2,3,4].reduce((a,b)=>a*b,1));
  accepts('p642-b',[1,2,3].reduce((a,b)=>a+b*b,0));accepts('p643-b',[1,2,3].reduce((a,b)=>a+b**3,0));
  accepts('p649-b',[3,2,1].join(' '));accepts('p650-b',[1,2,3].join(' '));
  accepts('p654-b',[...'407'].reduce((a,b)=>a+Number(b),0));accepts('p657-b',String(1000).length);
  accepts('p660-b',[...'70707'].filter(x=>x==='7').length);
  accepts('p665-b',[2,1,2,2].filter(x=>x===2).length);
});

test('stream counts, math, and macro expansions retain exact interface meanings',()=>{
  accepts('p859-b',8-1);accepts('p870-b',String(1234).length);accepts('p881-b',4*3);accepts('p884-b',4*2);
  accepts('p890-b',7);accepts('p893-b',18);accepts('p916-b',5+2);accepts('p917-b',10-2);
  accepts('p965-b',Math.floor(-2.3));accepts('p967-b',Math.ceil(-2.3));accepts('p970-b',3**2);
  accepts('p1040-b',3*2+2);accepts('p1041-b',1+2*1+2);accepts('p1042-b',3*1+2);
});
