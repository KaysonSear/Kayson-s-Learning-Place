import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOperation } from '../src/cloud-progress.ts';
import { fresh } from '../src/engine.ts';
import { mistakeBook } from '../src/mistakes.ts';
import { createProgressFiles } from '../src/progress.ts';
import type { CloudOperation } from '../src/cloud-types.ts';
import type { DrillQuestion } from '../src/types.ts';

const epoch = 'cloze-test';
const makeQuestion = (id: number): DrillQuestion => ({
  id, options: ['a', 'b', 'c', 'd'], answer: 1, prompt: 'test ____', explanation: 'test', legacyOptionMap: [0, 1, 2, 3],
  optionIds: ['a', 'b', 'c', 'd'].map(value => value.repeat(24)), revision: 'e'.repeat(24)
});
const bank = new Map([[1, makeQuestion(1)]]);
const files = createProgressFiles({
  points: [{id: 1}],
  questions: [],
  drillQuestions: [...bank.values()],
  sourceHash: 'x',
  epoch
});

test('old progress keeps only lab marks and settings', () => {
  const old = fresh();
  old.points[1] = {base: null, transfer: null, attempts: 3, reviewStep: 1, due: 1, needsWork: false};
  old.history.push({questionId: 'p1-a', pointId: 1, stage: 'a', correct: true, assisted: false, skipped: false, time: 1});
  old.labs.pointers = 123;
  old.settings.textSize = 1.2;
  old.rounds = 4;
  const restored = files.restore(old);
  assert.deepEqual(restored.points, {});
  assert.deepEqual(restored.history, []);
  assert.equal(restored.session, null);
  assert.equal(restored.lastPoint, null);
  assert.equal(restored.rounds, 0);
  assert.equal(restored.drill, null);
  assert.deepEqual(restored.drillAttempts, []);
  assert.deepEqual(restored.labs, {pointers: 123});
  assert.equal(restored.settings.textSize, 1.2);
  assert.equal(restored.epoch, epoch);
});

test('progress from the current epoch keeps its learning data', () => {
  const current = fresh();
  current.epoch = epoch;
  current.points[1] = {base: null, transfer: null, attempts: 2, reviewStep: 0, due: 1, needsWork: false};
  current.labs.pointers = 456;
  const restored = files.restore(current);
  assert.deepEqual(restored.points, current.points);
  assert.deepEqual(restored.labs, {pointers: 456});
  assert.equal(restored.epoch, epoch);
});

test('cloud operations from another epoch only move lab marks and settings', () => {
  const state = fresh();
  state.epoch = epoch;
  const operation: CloudOperation = {
    id: '11111111-1111-4111-8111-111111111111',
    change: {
      time: 50,
      epoch: 'old-epoch',
      labs: {pointers: 50},
      settings: {textSize: 1.1},
      lastPoint: 1,
      completedRounds: 1,
      attempts: [{questionId: 'p1-a', pointId: 1, stage: 'a' as const, correct: true, assisted: false, skipped: false, time: 50}],
      review: {questionId: 1, answer: {optionId: 'b'.repeat(24), revision: 'e'.repeat(24), correct: true, label: 'b', correctLabel: 'b'}}
    }
  };
  applyOperation(state, operation, bank);
  assert.deepEqual(state.labs, {pointers: 50});
  assert.equal(state.settings.textSize, 1.1);
  assert.equal(state.lastPoint, null);
  assert.equal(state.rounds, 0);
  assert.deepEqual(state.history, []);
  assert.equal((state.drillAttempts ?? []).length, 0);
});

test('mistake book ignores answers recorded against an older revision', () => {
  const attempts = [
    {optionId: 'a'.repeat(24), revision: 'd'.repeat(24), correct: false, label: 'a', correctLabel: 'b', questionId: 1, roundId: '11111111-1111-4111-8111-111111111111', operationId: '22222222-2222-4222-8222-222222222222'}
  ];
  assert.equal(mistakeBook(attempts).size, 1);
  assert.equal(mistakeBook(attempts, bank).size, 0);
});
