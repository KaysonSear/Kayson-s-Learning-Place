import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOperation, createChange, createOperationDecoder, prepareSeed } from '../src/cloud-progress.ts';
import { answer, restore, start } from '../src/drill.ts';
import { fresh, record } from '../src/engine.ts';
import type { DrillQuestion } from '../src/types.ts';

const makeQuestion = (id: number): DrillQuestion => ({
  id, options:['a','b','c','d'], answer:1, prompt:'test', explanation:'test', legacyOptionMap:[1,0],
  optionIds:['a','b','c','d'].map(x => x.repeat(24)), revision:'e'.repeat(24)
});
const question = makeQuestion(1);
const bank = new Map([[1,question]]);
const decode = createOperationDecoder([1], ['p1-a','p1-b'], bank);
const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';

test('concurrent drill answers retain both events and preserve the first score', () => {
  const seed = fresh();
  seed.drill = start([1]);
  const a = structuredClone(seed), b = structuredClone(seed);
  assert(answer(a.drill!, question, 1));
  assert(answer(b.drill!, question, 0));
  const left = createChange(seed,a,bank), right = createChange(seed,b,bank);
  assert(left && right);
  applyOperation(seed, decode({...left, id:first}), bank);
  applyOperation(seed, decode({...right, id:second}), bank);
  assert.equal(seed.drill!.answers[1], 1);
  assert.equal(seed.drill!.answerInfo?.[1].correct, true);
  assert.deepEqual(seed.drillAttempts?.map(a => a.correct), [true,false]);
});

test('new rounds use the new catalog and old round answers cannot reactivate a previous round', () => {
  const original = fresh();
  original.drill = start([1]);
  const other = structuredClone(original);
  assert(answer(other.drill!, question, 0));
  const late = createChange(original,other,bank);
  assert(late);
  const expanded = new Map([...bank, [2,makeQuestion(2)]]);
  assert.deepEqual(restore(original.drill, expanded)?.order, [1]);
  const restarted = {...original, drill:start(expanded.keys())};
  const restart = createChange(original,restarted,expanded);
  assert(restart?.change.drill?.start);
  applyOperation(original,restart,expanded);
  applyOperation(original,late,expanded);
  assert.deepEqual(original.drill?.order, [1,2]);
  assert.deepEqual(original.drill?.answers, {});
  assert.equal(original.drillAttempts?.length, 1);
});

test('legacy and current selections survive option reordering with their recorded grade', () => {
  const legacyIds = {1:[question.optionIds![1],question.optionIds![0]], 2:question.optionIds!};
  const altered = {...question, options:['b','a','d','c'], optionIds:['b','a','d','c'].map(x=>x.repeat(24)), answer:0, legacyOptionIds:legacyIds};
  const modified = new Map([[1,altered]]);
  const legacy = {...start([1]), answers:{1:0}, optionVersion:undefined};
  assert.equal(restore(legacy,modified)?.answers[1],0);
  const v2 = {...legacy, optionVersion:2, answers:{1:1}};
  assert.equal(restore(v2,modified)?.answers[1],0);
  const progress = fresh();
  progress.drill = {...start([1]),answers:{1:1}};
  const seed = prepareSeed(progress,bank);
  const restored = restore(seed.drill,modified);
  assert.equal(restored?.answers[1],0);
  assert.equal(restored?.answerInfo?.[1].correct,true);
});

test('practice evidence, settings, lab marks and resume position are rebuilt from operations', () => {
  const previous = fresh(), next = structuredClone(previous);
  const question = {id:'p1-a',pointId:1,stage:'a',revision:'f'.repeat(24)} as const;
  record(next,question,{correct:true},next.updatedAt);
  next.lastPoint = 1;
  next.rounds = 1;
  next.labs.pointers = next.updatedAt;
  next.settings.textSize = 1.2;
  const op = createChange(previous,next,bank);
  assert(op);
  applyOperation(previous,decode(op),bank);
  assert.deepEqual(previous,next);
  assert.throws(() => decode({id:first,change:{time:0,drill:{roundId:second,position:{mode:'random',order:[2],current:2,finished:false}}}}));
});
