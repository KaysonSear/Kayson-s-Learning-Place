import { validateImport, isObject } from './engine.ts';
import { isDrillAnswer, restore as restoreDrill } from './drill.ts';
import type { DrillQuestion, Progress } from './types.ts';


export function createProgressFiles(library: {points:{id:number}[]; questions:{id:string}[]; drillQuestions:DrillQuestion[]; sourceHash:string}) {
  const pointIds = library.points.map(point => point.id);
  const questionIds = library.questions.map(question => question.id);
  const drillBank = new Map(library.drillQuestions.map(question => [question.id, question]));

  return {
    restore(value: unknown) {
      const progress = validateImport(value, pointIds, questionIds);
      progress.drill = restoreDrill(isObject(value) ? value.drill : undefined, drillBank);
      if (isObject(value) && value.drillAttempts !== undefined) {
        if (!Array.isArray(value.drillAttempts) || value.drillAttempts.length > 200000) throw Error('刷题历史格式无效。');
        progress.drillAttempts = value.drillAttempts.map((attempt: unknown) => {
          if (!isObject(attempt) || typeof attempt.operationId !== 'string' || !/^[a-f0-9-]{36}$/.test(attempt.operationId) ||
              typeof attempt.roundId !== 'string' || !/^[a-f0-9-]{36}$/.test(attempt.roundId) || typeof attempt.questionId !== 'number' ||
              !drillBank.has(attempt.questionId) || !isDrillAnswer(attempt)) throw Error('刷题历史格式无效。');
          return {operationId:attempt.operationId, roundId:attempt.roundId, questionId:attempt.questionId, optionId:attempt.optionId,
            revision:attempt.revision, correct:attempt.correct, label:attempt.label, correctLabel:attempt.correctLabel};
        });
      }
      return progress;
    },
    backup(progress: Progress) {
      return { ...progress, sourceHash: library.sourceHash, exportedAt: new Date().toISOString() };
    }
  };
}
