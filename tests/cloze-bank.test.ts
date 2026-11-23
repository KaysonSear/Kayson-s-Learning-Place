import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCourse } from '../scripts/course-parse.ts';
import { createRenderer } from '../scripts/markdown.ts';
import { loadClozeBank, validateClozeEntry } from '../scripts/cloze-bank.ts';
import { courseSource } from '../scripts/course-source.ts';
import type { ClozeEntry } from '../scripts/cloze-bank.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = fs.readFileSync(courseSource, 'utf8');
const {chapters, clusters, points} = parseCourse(raw);
const renderer = createRenderer(chapters, clusters, points);
const point1 = points[0];

function entry(overrides: Partial<ClozeEntry> = {}): ClozeEntry {
  return {
    pointId: 1,
    quote: '在普通宿主环境中，运行环境调用 `{{main}}`，开始执行程序的主要逻辑。',
    options: [['main'], ['_start'], ['printf'], ['WinMain']],
    note: '标准宿主由运行库调用 main；_start 是更底层的启动入口。',
    ...overrides
  };
}

test('chapter 1 bank builds deterministic multi-option questions', () => {
  const first = loadClozeBank(root, points, renderer, {chapter: 1});
  const second = loadClozeBank(root, points, renderer, {chapter: 1});
  assert.equal(first.questions.length, 17);
  assert.deepEqual(first.questions.map(q => [q.optionIds, q.revision]), second.questions.map(q => [q.optionIds, q.revision]));
  for (const question of first.questions) {
    assert.ok((question.blankCount ?? 0) >= 1 && (question.blankCount ?? 0) <= 3);
    assert.equal((question.prompt.match(/____/g) || []).length, question.blankCount);
    assert.equal(question.options.length, 4);
    assert.ok(question.promptHtml && question.excerptHtml && question.explanationHtml);
    assert.ok(!question.promptHtml.includes('{{'));
  }
});

test('a quote must be a verbatim contiguous source span', () => {
  assert.doesNotThrow(() => validateClozeEntry(entry(), point1, 'test', 0));
  assert.throws(
    () => validateClozeEntry(entry({quote: '宿主环境调用 {{main}} 开始程序。'}), point1, 'test', 0),
    /不是原文的连续片段/
  );
});

test('multi-blank options need one part per blank', () => {
  const e = entry({
    quote: '自 C99 起，从初次调用的 `{{main}}` 末尾离开，等价于返回 `{{0}}`。',
    options: [['main'], ['main', '1'], ['普通函数', '0'], ['main', 'EXIT_FAILURE']],
    pointId: 4
  });
  assert.throws(() => validateClozeEntry(e, points[3], 'test', 0), /分量数/);
  const good = entry({
    quote: '自 C99 起，从初次调用的 `{{main}}` 末尾离开，等价于返回 `{{0}}`。',
    options: [['main', '0'], ['main', '1'], ['普通函数', '0'], ['main', 'EXIT_FAILURE']],
    pointId: 4
  });
  assert.doesNotThrow(() => validateClozeEntry(good, points[3], 'test', 0));
});

test('a blank cannot cross an inline-code boundary', () => {
  const e = entry({
    quote: '在普通宿主环境中，运行环境调用 {{`ma}}in`，开始执行程序的主要逻辑。',
    options: [['main'], ['_start'], ['printf'], ['WinMain']]
  });
  assert.throws(() => validateClozeEntry(e, point1, 'test', 0), /边界/);
});
