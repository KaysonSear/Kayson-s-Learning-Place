import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOperation, createChange, createOperationDecoder } from '../src/cloud-progress.ts';
import { answer, answerInfo, start } from '../src/drill.ts';
import { fresh } from '../src/engine.ts';
import { backfillAttempts, mistakeBook, pickMistake, recordAttempt, REVIEW_ROUND } from '../src/mistakes.ts';
import { createProgressFiles } from '../src/progress.ts';
import type { DrillQuestion } from '../src/types.ts';

const makeQuestion = (id: number): DrillQuestion => ({
  id, options:['a','b','c','d'], answer:1, prompt:'test ____', explanation:'test', legacyOptionMap:[1,0],
  optionIds:['a','b','c','d'].map(x => x.repeat(24)), revision:'e'.repeat(24)
});
const bank = new Map([1, 2, 3].map(id => [id, makeQuestion(id)]));
const round = '11111111-1111-4111-8111-111111111111';
const grade = (id: number, correct: boolean) => answerInfo(bank.get(id)!, correct ? 1 : 0)!;

function log(...entries: [number, boolean, string?][]) {
  const progress = fresh();
  for (const [id, correct, roundId = round] of entries) recordAttempt(progress, id, grade(id, correct), roundId);
  return progress;
}

test('a wrong answer adds the question; three consecutive correct answers remove it', () => {
  assert.deepEqual([...mistakeBook(log([1,false]).drillAttempts)], [[1,0]]);
  assert.deepEqual([...mistakeBook(log([1,false],[1,true],[1,true]).drillAttempts)], [[1,2]]);
  assert.equal(mistakeBook(log([1,false],[1,true],[1,true],[1,true]).drillAttempts).size, 0);
});

test('a wrong answer in the middle resets the streak', () => {
  const book = mistakeBook(log([1,false],[1,true],[1,true],[1,false],[1,true],[1,true]).drillAttempts);
  assert.deepEqual([...book], [[1,2]]);
});

test('correct answers on questions outside the book are ignored', () => {
  assert.equal(mistakeBook(log([2,true],[2,true]).drillAttempts).size, 0);
  assert.equal(mistakeBook(undefined).size, 0);
});

test('drill rounds and mistake-book practice count toward the same streak', () => {
  const book = mistakeBook(log([1,false],[1,true,REVIEW_ROUND],[1,true],[1,true,REVIEW_ROUND]).drillAttempts);
  assert.equal(book.size, 0);
});

test('book order follows the latest wrong answer and picking avoids the previous question', () => {
  const book = mistakeBook(log([1,false],[2,false],[1,false]).drillAttempts);
  assert.deepEqual([...book.keys()], [2,1]);
  for (let i = 0; i < 20; i++) assert.equal(pickMistake(book, 1), 2);
  assert.equal(pickMistake(new Map([[3,0]]), 3), 3);
  assert.equal(pickMistake(new Map()), undefined);
});

test('older progress without an attempt log rebuilds mistakes from the current round', () => {
  const progress = fresh();
  progress.drill = start(bank.keys());
  for (const [id, choice] of [[progress.drill.current, 0]] as const) answer(progress.drill, bank.get(id)!, choice);
  backfillAttempts(progress, bank);
  assert.equal(progress.drillAttempts?.length, 1);
  assert.deepEqual([...mistakeBook(progress.drillAttempts).keys()], [progress.drill.current]);

  const files = createProgressFiles({points:[1,2,3].map(id => ({id})), questions:[], drillQuestions:[...bank.values()], sourceHash:'x'});
  const legacy = structuredClone(progress) as Partial<typeof progress>;
  delete legacy.drillAttempts;
  const restored = files.restore(legacy);
  assert.equal(mistakeBook(restored.drillAttempts).size, 1);
  const kept = files.restore({...progress, drillAttempts:[]});
  assert.equal(kept.drillAttempts?.length, 0);
});

test('mistake-book answers and the mix setting sync as operations', () => {
  const decode = createOperationDecoder([1,2,3], [], bank);
  const previous = fresh(), next = structuredClone(previous);
  recordAttempt(next, 2, grade(2, false), REVIEW_ROUND);
  next.settings.mixMistakes = true;
  const op = createChange(previous, next, bank);
  assert(op?.change.review);
  const decoded = decode(JSON.parse(JSON.stringify(op)));
  const replica = fresh();
  applyOperation(replica, decoded, bank);
  assert.equal(replica.settings.mixMistakes, true);
  assert.deepEqual([...mistakeBook(replica.drillAttempts)], [[2,0]]);
  assert.equal(replica.drillAttempts?.[0].roundId, REVIEW_ROUND);
  assert.throws(() => decode({id:op.id, change:{time:0, review:{questionId:9, answer:grade(2, true)}}}));
  assert.throws(() => decode({id:op.id, change:{time:0, settings:{mixMistakes:'yes'}}}));
});
