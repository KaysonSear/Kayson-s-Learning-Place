import type { Point, Question } from '../src/types.ts';
import { plainBlock } from './markdown.ts';
import type { PracticeBank } from './practice-bank.ts';

/** Chapters 1–10: each point has an authored baseline (A) and transfer (B) prompt in content/practice/a. */
export function createQuestions(points: Point[], bank: PracticeBank): Question[] {
  return points.filter(point => point.chapter <= 10).flatMap(point => {
    const row = bank.a.get(point.id);
    if (!row) throw Error('Missing authored pair for point ' + point.id);
    const excerpt = plainBlock(point.markdown).slice(0, 900) || point.title;
    return (['a', 'b'] as const).map((stage): Question => {
      const prompt = stage === 'a' ? row.promptA : row.promptB;
      const expected = stage === 'a' ? row.answerA : row.answerB;
      const binary = expected === 'Y' || expected === 'N';
      return {
        id: `p${point.id}-${stage}`,
        pointId: point.id,
        stage,
        prompt,
        ...(binary
          ? {kind: 'choice' as const, options: ['是', '否'], answer: expected === 'Y' ? 0 : 1}
          : {kind: 'input' as const, answer: expected.includes('~') ? expected.split('~') : expected}),
        explanation: `${binary ? (expected === 'Y' ? '成立。' : '不成立。') : `参考答案：${expected.split('~')[0]}。`} ${excerpt}`,
        hint: '回顾本题所用规则：' + point.title + '。先区分对象、类型、返回值及调用前提。'
      };
    });
  });
}
