(function (global) {
  'use strict';

  function create(library) {
    const pointIds = library.points.map(point => point.id);
    const questionIds = library.questions.map(question => question.id);
    const drillBank = new Map(library.drillQuestions.map(question => [question.id, question]));

    return {
      restore(value) {
        const progress = global.CLabEngine.validateImport(value, pointIds, questionIds);
        progress.drill = global.CLabDrill.restore(value.drill, drillBank);
        return progress;
      },
      backup(progress) {
        return { ...progress, sourceHash: library.sourceHash, exportedAt: new Date().toISOString() };
      }
    };
  }

  global.CLabProgress = { create };
})(typeof window === 'undefined' ? globalThis : window);
