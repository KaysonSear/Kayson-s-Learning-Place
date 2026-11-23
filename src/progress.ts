import { fresh, validateImport, isObject } from './engine.ts';
import { isDrillAnswer, restore as restoreDrill } from './drill.ts';
import { backfillAttempts } from './mistakes.ts';
import type { DrillQuestion, Progress } from './types.ts';

/** A progress state with every learning record cleared, keeping only lab marks and settings. */
export function resetLearning(value: Pick<Progress, 'labs' | 'settings'>, epoch: string): Progress {
  const progress = fresh();
  progress.labs = {...value.labs};
  progress.settings = {...progress.settings, ...value.settings};
  progress.epoch = epoch;
  return progress;
}

/** Clear learning data when `value` comes from a different question-bank epoch. */
export function sanitizeProgress(value: Progress, epoch: string): Progress {
  if (value.epoch === epoch) return value;
  return resetLearning(value, epoch);
}

export function createProgressFiles(library: {
  points: {id: number}[];
  questions: {id: string}[];
  drillQuestions: DrillQuestion[];
  sourceHash: string;
  epoch: string;
}) {
  const pointIds = library.points.map(point => point.id);
  const questionIds = library.questions.map(question => question.id);
  const drillBank = new Map(library.drillQuestions.map(question => [question.id, question]));
  const epoch = library.epoch;

  return {
    restore(value: unknown) {
      const raw = isObject(value) ? value : {};
      if (raw.epoch !== epoch) {
        // Old progress cannot be matched to the renumbered bank. Keep only labs and settings,
        // then validate those through the same import path.
        const keep = {
          schemaVersion: 1,
          updatedAt: Date.now(),
          points: {},
          history: [],
          labs: isObject(raw.labs) ? raw.labs : {},
          settings: isObject(raw.settings) ? raw.settings : undefined,
          session: null,
          lastPoint: null,
          rounds: 0
        };
        const clean = validateImport(keep, pointIds, questionIds);
        clean.epoch = epoch;
        clean.drill = null;
        clean.drillAttempts = [];
        return clean;
      }

      const progress = validateImport(value, pointIds, questionIds);
      progress.epoch = epoch;
      progress.drill = restoreDrill(raw.drill, drillBank);
      if (raw.drillAttempts !== undefined) {
        if (!Array.isArray(raw.drillAttempts) || raw.drillAttempts.length > 200000) throw Error('刷题历史格式无效。');
        progress.drillAttempts = raw.drillAttempts.flatMap((attempt: unknown) => {
          if (!isObject(attempt) || typeof attempt.operationId !== 'string' || !/^[a-f0-9-]{36}$/.test(attempt.operationId) ||
              typeof attempt.roundId !== 'string' || !/^[a-f0-9-]{36}$/.test(attempt.roundId) || typeof attempt.questionId !== 'number' ||
              !drillBank.has(attempt.questionId) || !isDrillAnswer(attempt)) throw Error('刷题历史格式无效。');
          // A question edited after this answer was recorded no longer grades against it.
          if (attempt.revision !== drillBank.get(attempt.questionId)?.revision) return [];
          return [{
            operationId: attempt.operationId, roundId: attempt.roundId, questionId: attempt.questionId, optionId: attempt.optionId,
            revision: attempt.revision, correct: attempt.correct, label: attempt.label, correctLabel: attempt.correctLabel
          }];
        });
      }
      backfillAttempts(progress, drillBank);
      return progress;
    },
    backup(progress: Progress) {
      return {...progress, sourceHash: library.sourceHash, exportedAt: new Date().toISOString()};
    }
  };
}
