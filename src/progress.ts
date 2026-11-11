import { validateImport, isObject } from './engine.ts';
import { restore as restoreDrill } from './drill.ts';
import type { Library, Progress } from './types.ts';


export function createProgressFiles(library: Library) {
  const pointIds = library.points.map(point => point.id);
  const questionIds = library.questions.map(question => question.id);
  const drillBank = new Map(library.drillQuestions.map(question => [question.id, question]));

  return {
    restore(value: unknown) {
      const progress = validateImport(value, pointIds, questionIds);
      progress.drill = restoreDrill(isObject(value) ? value.drill : undefined, drillBank);
      return progress;
    },
    backup(progress: Progress) {
      return { ...progress, sourceHash: library.sourceHash, exportedAt: new Date().toISOString() };
    }
  };
}
