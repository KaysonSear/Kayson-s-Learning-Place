import { answerInfo } from './drill.ts';
import type { DrillAnswer, DrillAttempt } from './cloud-types.ts';
import type { DrillQuestion, Progress } from './types.ts';

/** Round id under which mistake-book practice (standalone or mixed into a drill round) is logged. */
export const REVIEW_ROUND = '00000000-0000-4000-8000-00000000000a';
export const CLEAR_STREAK = 3;
export const MIX_EVERY = 3;

/**
 * Derives the mistake book from the append-only attempt log: a wrong answer adds the question
 * (or resets its streak), and CLEAR_STREAK consecutive correct answers in any mode remove it.
 * Map order follows when each question was last answered wrong.
 */
export function mistakeBook(attempts: readonly DrillAttempt[] = []) {
  const book = new Map<number, number>();
  for (const attempt of attempts) {
    if (!attempt.correct) {
      book.delete(attempt.questionId);
      book.set(attempt.questionId, 0);
    } else if (book.has(attempt.questionId)) {
      const streak = book.get(attempt.questionId)! + 1;
      if (streak >= CLEAR_STREAK) book.delete(attempt.questionId); else book.set(attempt.questionId, streak);
    }
  }
  return book;
}

export function recordAttempt(progress: Progress, questionId: number, answer: DrillAnswer, roundId: string) {
  (progress.drillAttempts ??= []).push({...answer, questionId, roundId, operationId:crypto.randomUUID()});
}

export function pickMistake(book: ReadonlyMap<number, number>, exclude?: number, random = Math.random) {
  const ids = [...book.keys()];
  const choices = ids.length > 1 ? ids.filter(id => id !== exclude) : ids;
  return choices.length ? choices[Math.floor(random() * choices.length)] : undefined;
}

/** Older progress kept drill answers only on the round; rebuild the attempt log so earlier mistakes appear. */
export function backfillAttempts(progress: Progress, bank: ReadonlyMap<number, DrillQuestion>) {
  const round = progress.drill;
  if (progress.drillAttempts !== undefined || !round) return;
  const roundId = round.roundId ?? '00000000-0000-4000-8000-000000000001';
  const attempts: DrillAttempt[] = [];
  for (const [key, choice] of Object.entries(round.answers)) {
    const id = Number(key);
    const question = bank.get(id);
    const answer = round.answerInfo?.[id] ?? (question && answerInfo(question, choice));
    if (answer) attempts.push({...answer, questionId:id, roundId, operationId:crypto.randomUUID()});
  }
  if (attempts.length) progress.drillAttempts = attempts;
}
