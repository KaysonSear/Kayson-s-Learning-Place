import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine.ts';
import type { Exercise, Grade, Progress, QuestionRef, Session, Stage } from '../src/types.ts';
const T=new Date(2026,10,6,10,0,0).getTime();
const points=[1,2,3,4,5,6,7,38,215,765].map(id=>({id,chapter:id<10?1:id===38?2:id===215?7:15}));
const questions=points.flatMap(p=>(['a','b'] as const).map((stage): QuestionRef & Exercise=>({id:`p${p.id}-${stage}`,pointId:p.id,stage,kind:'choice',options:['正确','错误'],answer:0})));
const q=(id: number,stage: Stage='a')=>questions.find(x=>x.id===`p${id}-${stage}`)!;
const correct=(state: Progress,id=1,stage: Stage='a',time=T,extra: Partial<Grade>={})=>E.record(state,q(id,stage),{correct:true,...extra},time);
const clone=<T>(v: T): T=>structuredClone(v);
const validate=(v: unknown)=>E.validateImport(v,points.map(p=>p.id),questions.map(q=>q.id));
function session(queue=['p1-a','p2-a','p3-a']): Session {
  return {queue,index:0,answers:[],current:{value:null,assisted:false,submitted:false,everWrong:false},scope:{},started:T};
}

test('C grading keeps names and printed characters case-sensitive and rejects empty choices',()=>{
  const choice=q(1);
  for(const empty of [null,undefined,'',false,[],{}])assert.equal(E.grade(choice,empty),false);
  assert.equal(E.grade(choice,0),true);
  assert.equal(E.grade(choice,'0'),true);
  assert.equal(E.grade(choice,1),false);
  assert.equal(E.grade({kind:'input',answer:'EOF'},'eof'),false);
  assert.equal(E.grade({kind:'input',answer:"'A'"},"'a'"),false);
  assert.equal(E.grade({kind:'input',answer:'int *P'},'int *p'),false);
  assert.equal(E.grade({kind:'input',answer:['1 2 3','1,2,3']},' 1，2，3 '),true);
});

test('first-round diagnostic ordering is stable for arbitrary source order',()=>{
  const state=E.fresh();
  for(const ordered of [points,[...points].reverse(),[...points.slice(3),...points.slice(0,3)]]){
    assert.equal(Array.from(E.queue(state,ordered,questions,{now:T})).join(','),'p38-a,p215-a,p765-a');
  }
});

test('queue reserves two due points plus one unseen and prioritizes work needing repair',()=>{
  const state=E.fresh();
  for(const id of [1,2,3,4])correct(state,id);
  state.points[1].due=T-3000;
  state.points[2].due=T-1000;state.points[2].needsWork=true;
  state.points[3].due=T-2000;
  state.points[4].due=T+E.DAY;
  assert.equal(Array.from(E.queue(state,points,questions,{chapter:1,now:T})).join(','),'p2-a,p1-a,p5-a');
  assert.equal(Array.from(E.queue(state,points,questions,{pointId:4,now:T})).join(','),'p4-a');
  assert.equal(Array.from(E.queue(state,points,questions,{chapter:7,now:T})).join(','),'p215-a');
});

test('short queues fill from remaining due/new points without duplicates',()=>{
  const state=E.fresh();
  for(const id of [1,2,3]){correct(state,id);state.points[id].due=T-1;}
  const onlySeen=points.filter(p=>[1,2,3].includes(p.id));
  const result=Array.from(E.queue(state,onlySeen,questions,{now:T}));
  assert.equal(result.length,3);assert.equal(new Set(result).size,3);
  assert.equal(E.queue(state,points,questions,{pointId:999,now:T}).length,0);
});

test('same-day transfer attempt cannot establish migration evidence',()=>{
  const state=E.fresh();
  correct(state,1,'a',T);
  const due=state.points[1].due;
  correct(state,1,'b',T+60000);
  assert.equal(state.points[1].transfer,null);
  assert.equal(state.points[1].reviewStep,0);
  assert.equal(state.points[1].due,due);
  assert.equal(E.getEvidence(state,1),'独立通过');
  correct(state,1,'b',T+E.DAY);
  assert.equal(E.getEvidence(state,1),'迁移通过');
});

test('successful due reviews use 1, 3, 7, 14 day intervals and cap at 14 days',()=>{
  const state=E.fresh();
  correct(state,1,'a',T);
  let now=T+E.DAY;
  for(const interval of [1,3,7,14,14]){
    correct(state,1,'b',now);
    assert.equal(state.points[1].due-now,interval*E.DAY);
    now=state.points[1].due;
  }
  assert.equal(state.points[1].reviewStep,3);
});

test('same-day repetitions and early optional practice cannot skip spacing intervals',()=>{
  const state=E.fresh();
  correct(state,1,'a',T);
  correct(state,1,'b',T+E.DAY);
  const firstDue=state.points[1].due;
  correct(state,1,'b',T+E.DAY+1000);
  assert.equal(state.points[1].reviewStep,1);
  assert.equal(state.points[1].due,firstDue);
  correct(state,1,'b',firstDue);
  const secondDue=state.points[1].due;
  assert.equal(state.points[1].reviewStep,2);
  correct(state,1,'b',firstDue+E.DAY);
  assert.equal(state.points[1].due,secondDue);
  assert.equal(state.points[1].reviewStep,2);
});

test('hinted/wrong attempts and reopened same-day retries never establish independent evidence',()=>{
  for(const flags of [{correct:true,assisted:true},{correct:false},{correct:false,skipped:true}]){
    const state=E.fresh();
    E.record(state,q(1),flags,T);
    assert.equal(state.points[1].base,null);
    assert.equal(state.points[1].needsWork,true);
    const retry=correct(state,1,'a',T+1000);
    assert.equal(retry.assisted,true);
    assert.equal(state.points[1].base,null);
    correct(state,1,'a',T+E.DAY);
    assert.ok(state.points[1].base);
  }
});

test('a transfer answer exposed today must wait until another day for evidence',()=>{
  const state=E.fresh();
  correct(state,1,'a',T);
  E.record(state,q(1,'b'),{correct:false},T+E.DAY);
  correct(state,1,'b',T+E.DAY+1000);
  assert.equal(state.points[1].transfer,null);
  correct(state,1,'b',T+2*E.DAY);
  assert.ok(state.points[1].transfer);
});

test('errors retain prior evidence, reset review spacing and mark work due now',()=>{
  const state=E.fresh();correct(state,1,'a',T);correct(state,1,'b',T+E.DAY);
  E.record(state,q(1,'b'),{correct:false},T+2*E.DAY);
  assert.ok(state.points[1].base);assert.ok(state.points[1].transfer);
  assert.equal(state.points[1].needsWork,true);
  assert.equal(state.points[1].reviewStep,0);
  assert.equal(state.points[1].due,T+2*E.DAY);
  assert.equal(E.getEvidence(state,1),'待巩固');
});

test('progress round trip retains migration, current answer, scope and completed labs',()=>{
  const state=E.fresh();correct(state,1,'a',T);correct(state,1,'b',T+E.DAY);
  state.labs.pointers=T;state.settings={reduceMotion:true,textSize:1.2};state.rounds=3;
  state.session=session();state.session.scope={chapter:1};state.session.current.value=0;
  const restored=validate(clone(state));
  assert.deepEqual(clone(restored.points),clone(state.points));
  assert.deepEqual(clone(restored.history),clone(state.history));
  assert.deepEqual(clone(restored.session),clone(state.session));
  assert.equal(restored.labs.pointers,T);
  assert.equal(restored.settings.textSize,1.2);
  assert.equal(restored.rounds,3);
});

test('submitted and completed sessions survive export and import',()=>{
  const state=E.fresh();state.session=session(['p1-a']);
  state.session.current={value:0,assisted:false,submitted:true,everWrong:false,correct:true,skipped:false};
  assert.equal(validate(clone(state)).session!.current.correct,true);
  state.session.index=1;state.session.answers=[{questionId:'p1-a',pointId:1,correct:true,assisted:false,skipped:false}];
  state.session.current={value:null,assisted:false,submitted:false,everWrong:false};
  assert.equal(validate(clone(state)).session!.answers.length,1);
});

test('malformed top-level and nested progress is rejected rather than reaching the UI',()=>{
  for(const raw of [null,[],{}, {...E.fresh(),points:null},{...E.fresh(),history:[null]},{...E.fresh(),labs:[]},{...E.fresh(),settings:'bad'}])assert.throws(()=>validate(raw));
  const seed=E.fresh();correct(seed);
  for(const patch of [{attempts:-1},{attempts:1.5},{due:Infinity},{reviewStep:9},{needsWork:'false'},{base:{time:T,day:'2026-02-30'}},{transfer:{time:T,day:E.day(T)}}]){
    const raw=clone(seed);Object.assign(raw.points[1],patch);assert.throws(()=>validate(raw));
  }
  const mismatch=clone(seed);mismatch.history[0].pointId=2;assert.throws(()=>validate(mismatch));
  const wrongStage=clone(seed);wrongStage.history[0].stage='b';assert.throws(()=>validate(wrongStage));
});

test('malformed session arrays, current flags, answers and scope cannot crash quiz or finish views',()=>{
  const seed=E.fresh();seed.session=session();
  const mutations: ((session: Record<string, unknown> & {current: Record<string, unknown> | null | string | unknown[]}) => unknown)[]=[
    s=>s.current=null,
    s=>s.current=[],
    s=>s.current='bad',
    s=>delete (s.current as Record<string, unknown>).value,
    s=>(s.current as Record<string, unknown>).value={nested:'answer'},
    s=>(s.current as Record<string, unknown>).submitted='true',
    s=>s.current={...s.current as Record<string, unknown>,submitted:true},
    s=>s.answers=null,
    s=>s.answers=[null],
    s=>s.index=1,
    s=>s.queue=['p1-a','p1-a'],
    s=>s.scope='bad',
    s=>s.scope={chapter:20},
    s=>s.scope={pointId:999},
    s=>s.started=-1
  ];
  for(const mutate of mutations){const raw=clone(seed);mutate(raw.session as unknown as Parameters<typeof mutate>[0]);assert.throws(()=>validate(raw));}
});

test('an imported hint or wrong-attempt flag cannot lose its assisted status',()=>{
  const state=E.fresh();state.session=session();
  state.session.current={...state.session.current,showHint:true};
  assert.equal(validate(clone(state)).session!.current.assisted,true);
  state.session.current={...state.session.current,showHint:false,everWrong:true};
  assert.equal(validate(clone(state)).session!.current.assisted,true);
});
