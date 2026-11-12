import test from 'node:test';
import assert from 'node:assert/strict';
import * as drill from '../src/drill.ts';
import type { DrillQuestion } from '../src/types.ts';
const ids = Array.from({ length: 1064 }, (_, index) => index + 1);
const bank = new Map<number, DrillQuestion>(ids.map(id => [id, { id, prompt:'', explanation:'', answer:0, legacyOptionMap:[0,1], options: ['correct', 'distractor'] }]));

test('a sequential round goes through all 1064 questions before completion', () => {
  const round = drill.start(ids);
  for (const id of ids) {
    assert.equal(round.current, id);
    assert.equal(round.finished, false);
    assert(drill.answer(round, bank.get(id)!, 0));
    assert(!drill.answer(round, bank.get(id)!, 1));
    drill.next(round);
  }
  assert(round.finished);
  assert.equal(Object.keys(round.answers).length, 1064);
});

test('jump uses original ids and next wraps without losing unanswered questions', () => {
  const round = drill.start(ids);
  assert(!drill.jump(round, 0));
  assert(drill.jump(round, 1064));
  assert(drill.answer(round, bank.get(1064)!, 0));
  drill.next(round);
  assert.equal(round.current, 1);
  assert(!round.finished);
  drill.changeMode(round, 'random');
  assert.equal(round.current, 1);
  assert.deepEqual([...round.order].sort((a, b) => a - b), ids);
  assert(drill.jump(round, 288));
  const position = round.order.indexOf(288);
  assert(drill.answer(round, bank.get(288)!, 1));
  const expected = [...round.order.slice(position + 1), ...round.order.slice(0, position)].find(id => id !== 1064);
  drill.next(round);
  assert.equal(round.current, expected);
  drill.changeMode(round, 'sequence');
  assert.deepEqual(round.order, ids);
  assert.deepEqual(round.answers, { 288: 1, 1064: 0 });
});

test('backup keeps random order, pointer and recorded choices, and rejects invalid records', () => {
  const round = drill.start(ids, 'random');
  drill.jump(round, 288);
  drill.answer(round, bank.get(288)!, 1);
  assert.deepEqual(drill.restore(JSON.parse(JSON.stringify(round)), bank), round);
  assert.equal(drill.restore(undefined, bank), null);
  assert.throws(() => drill.restore({ ...round, current: 1065 }, bank));
  assert.throws(() => drill.restore({ ...round, order: [...round.order.slice(1), round.order[1]] }, bank));
  assert.throws(() => drill.restore({ ...round, answers: { 288: 2 } }, bank));
  assert.throws(() => drill.restore({ ...round, finished: true }, bank));
});

test('option display order is a seeded permutation that varies between appearances', () => {
  const seen = new Map<string, number>();
  for (let i = 0; i < 1000; i++) {
    const order = drill.displayOrder(4, 'round-' + i + ':57');
    assert.deepEqual([...order].sort(), [0, 1, 2, 3]);
    seen.set(order.join(), (seen.get(order.join()) ?? 0) + 1);
  }
  assert.equal(seen.size, 24);
  assert(Math.min(...seen.values()) > 15 && Math.max(...seen.values()) < 70);
  assert.deepEqual(drill.displayOrder(4, 'same'), drill.displayOrder(4, 'same'));
  assert.deepEqual(drill.displayOrder(2, 'x').sort(), [0, 1]);
});
