import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCourse } from '../scripts/course-parse.ts';
import { loadPracticeBank } from '../scripts/practice-bank.ts';
import { createQuestions as questionsA } from '../scripts/questions-a.ts';
import { createQuestions as questionsB } from '../scripts/questions-b.ts';
import { courseSource } from '../scripts/course-source.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = fs.readFileSync(courseSource, 'utf8');
const {points} = parseCourse(raw);
const practice = loadPracticeBank(root, points);
const questions = [...questionsA(points, practice), ...questionsB(points, practice)];

test('every point has exactly one baseline and one transfer exercise', () => {
  assert.equal(points.length, 1087);
  assert.equal(questions.length, points.length * 2);
  assert.equal(new Set(questions.map(question => question.id)).size, questions.length);
  for (const point of points) {
    const pair = questions.filter(question => question.pointId === point.id);
    assert.deepEqual(pair.map(question => question.stage).sort(), ['a', 'b'], `point ${point.id}`);
    assert.notEqual(pair[0].prompt, pair[1].prompt, `point ${point.id}`);
  }
});

test('practice prompts and answers are well formed', () => {
  for (const question of questions) {
    assert.ok(question.prompt.length > 12, `${question.id} prompt too short`);
    assert.ok(question.explanation.trim() && question.hint.trim(), `${question.id} missing copy`);
    assert.ok(!/上题|下一题|如图所示|【填空】/.test(question.prompt), `${question.id} depends on shuffled context`);
    if (question.kind === 'choice') {
      assert.ok(question.options.length >= 2);
      assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < question.options.length);
      assert.equal(new Set(question.options).size, question.options.length);
    } else {
      const answers = Array.isArray(question.answer) ? question.answer : [question.answer];
      assert.ok(answers.length && answers.every(answer => typeof answer === 'string' && answer.trim()), `${question.id} bad answer`);
    }
  }
});
