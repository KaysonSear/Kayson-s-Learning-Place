import type { AuthoredExercise, Point, Question } from '../src/types.ts';
import { plainBlock } from './markdown.ts';
import type { PracticeBank, PracticeRowB } from './practice-bank.ts';

/**
 * Chapters 11–19. A is an authored baseline task (content/practice/b-a),
 * B is an authored transfer scenario (content/practice/b-b).
 * Multiple accepted short answers are separated by ;; in the authoring files.
 */
function asExercise(entry: PracticeRowB): AuthoredExercise {
  const answers = entry.answer;
  if (answers.length === 1 && (answers[0] === 'Y' || answers[0] === 'N')) {
    return {...entry, kind: 'choice', options: ['是', '否'], answer: answers[0] === 'Y' ? 0 : 1};
  }
  const pairs = [...entry.prompt.matchAll(/[“「]([^”」]+)[”」](?:或|还是)[“「]([^”」]+)[”」]/g)];
  const pair = pairs.find(match => answers.includes(match[1]) || answers.includes(match[2]));
  if (pair) {
    const options = [pair[1], pair[2]];
    return {...entry, kind: 'choice', options, answer: options.findIndex(option => answers.includes(option))};
  }
  return {...entry, kind: 'input'};
}

export function createQuestions(points: Point[], bank: PracticeBank): Question[] {
  return points.filter(point => point.chapter >= 11).flatMap(point => {
    const authoredB = bank.transfer.get(point.id);
    if (!authoredB) throw new Error(`Missing authored transfer exercise for point ${point.id}`);
    const entry = bank.baseline.get(point.id);
    if (!entry) throw new Error(`Missing authored baseline exercise for point ${point.id}`);
    const explanation = plainBlock(point.markdown).slice(0, 900) || point.title;
    const a: Question = {
      id: `p${point.id}-a`,
      pointId: point.id,
      stage: 'a',
      ...asExercise(entry),
      explanation,
      hint: '先核对题设条件与类型，再按规则处理这个具体情况。'
    };
    return [a, {
      id: `p${point.id}-b`,
      pointId: point.id,
      stage: 'b',
      ...asExercise(authoredB),
      explanation,
      hint: '把题设的条件代入规则；先核对类型、有效范围和操作前提，再填写结果。'
    }];
  });
}
