import { answerInfo, isDrillAnswer } from './drill.ts';
import { isObject, record, validateImport } from './engine.ts';
import { REVIEW_ROUND } from './mistakes.ts';
import type { CloudChange, CloudOperation, DrillPosition } from './cloud-types.ts';
import type { DrillQuestion, Progress } from './types.ts';

export const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function prepareSeed(progress: Progress, bank: ReadonlyMap<number, DrillQuestion>): Progress {
  const seed = structuredClone(progress);
  const drill = seed.drill;
  if (drill) {
    drill.roundId ??= '00000000-0000-4000-8000-000000000001';
    drill.answerInfo ??= {};
    for (const [id, choice] of Object.entries(drill.answers)) {
      const question = bank.get(Number(id));
      const answer = question && answerInfo(question, choice);
      if (answer) drill.answerInfo[Number(id)] ??= answer;
    }
  }
  return seed;
}

export function createChange(previous: Progress, next: Progress, bank: ReadonlyMap<number, DrillQuestion>): CloudOperation | null {
  const change: CloudChange = {time:next.updatedAt};
  if (!equal(previous.session, next.session)) change.session = next.session;
  if (next.history.length > previous.history.length) change.attempts = next.history.slice(previous.history.length);
  if (next.rounds > previous.rounds) change.completedRounds = next.rounds - previous.rounds;
  if (next.lastPoint !== previous.lastPoint) change.lastPoint = next.lastPoint;
  const labs = Object.fromEntries(Object.entries(next.labs).filter(([id, time]) => previous.labs[id] !== time));
  if (Object.keys(labs).length) change.labs = labs;
  if (next.settings.reduceMotion !== previous.settings.reduceMotion) (change.settings ??= {}).reduceMotion = next.settings.reduceMotion;
  if (next.settings.textSize !== previous.settings.textSize) (change.settings ??= {}).textSize = next.settings.textSize;
  if (!!next.settings.mixMistakes !== !!previous.settings.mixMistakes) (change.settings ??= {}).mixMistakes = !!next.settings.mixMistakes;
  const added = next.drillAttempts?.slice(previous.drillAttempts?.length ?? 0) ?? [];
  const review = [...added].reverse().find(attempt => attempt.roundId === REVIEW_ROUND);
  if (review) change.review = {questionId:review.questionId, answer:{optionId:review.optionId, revision:review.revision, correct:review.correct, label:review.label, correctLabel:review.correctLabel}};

  const round = next.drill;
  const before = previous.drill;
  if (round) {
    round.roundId ??= before?.roundId ?? crypto.randomUUID();
    const position = {mode:round.mode, current:round.current, finished:round.finished};
    if (round.roundId !== before?.roundId) {
      change.drill = {roundId:round.roundId, start:{...position, order:round.order}};
    } else {
      const order = !equal(round.order, before.order) ? round.order : undefined;
      if (order || before.mode !== round.mode || before.current !== round.current || before.finished !== round.finished) {
        change.drill = {roundId:round.roundId, position:{...position, ...(order ? {order} : {})}};
      }
      const questionId = round.current;
      if (Object.hasOwn(round.answers, questionId) && !Object.hasOwn(before.answers, questionId)) {
        const question = bank.get(questionId);
        const answer = round.answerInfo?.[questionId] ?? (question && answerInfo(question, round.answers[questionId]));
        if (answer) (change.drill ??= {roundId:round.roundId}).answer = {questionId, answer};
      }
    }
  }
  return Object.keys(change).length > 1 ? {id:crypto.randomUUID(), change} : null;
}

export function applyOperation(state: Progress, operation: CloudOperation, bank: ReadonlyMap<number, DrillQuestion>) {
  const {change} = operation;
  for (const entry of change.attempts ?? []) {
    const at = Math.max(entry.time, state.points[entry.pointId]?.last ?? 0);
    record(state, {id:entry.questionId, pointId:entry.pointId, stage:entry.stage, revision:entry.revision}, entry, at);
    state.history[state.history.length - 1] = entry;
  }
  if (change.session !== undefined) state.session = structuredClone(change.session);
  state.rounds += change.completedRounds ?? 0;
  for (const [id, time] of Object.entries(change.labs ?? {})) state.labs[id] = Math.min(state.labs[id] ?? time, time);
  Object.assign(state.settings, change.settings);
  if (change.lastPoint !== undefined) state.lastPoint = change.lastPoint;
  state.updatedAt = Math.max(state.updatedAt, change.time);
  if (change.review) (state.drillAttempts ??= []).push({...change.review.answer, questionId:change.review.questionId, roundId:REVIEW_ROUND, operationId:operation.id});

  const update = change.drill;
  if (!update) return;
  if (update.start && state.drill?.roundId !== update.roundId) {
    state.drill = {...update.start, order:[...update.start.order], roundId:update.roundId, optionVersion:2, answers:{}};
  }
  if (update.answer) {
    const {questionId, answer} = update.answer;
    (state.drillAttempts ??= []).push({...answer, questionId, roundId:update.roundId, operationId:operation.id});
    if (state.drill?.roundId === update.roundId && state.drill.order.includes(questionId) && !Object.hasOwn(state.drill.answers, questionId)) {
      state.drill.answers[questionId] = bank.get(questionId)?.optionIds?.indexOf(answer.optionId) ?? -1;
      (state.drill.answerInfo ??= {})[questionId] = answer;
    }
  }
  const round = state.drill;
  const position = update.position;
  if (round?.roundId !== update.roundId || !position) return;
  if (position.order && position.order.length === round.order.length) {
    const existing = new Set(round.order);
    if (position.order.every(id => existing.has(id))) {
      round.order = [...position.order];
      round.mode = position.mode;
    }
  }
  if (round.order.includes(position.current)) round.current = position.current;
  round.finished = position.finished && Object.keys(round.answers).length === round.order.length;
}

export function createOperationDecoder(pointIds: number[], questionIds: string[], bank: ReadonlyMap<number, DrillQuestion>) {
  const points = new Set(pointIds);
  const validPoint = (value: unknown): value is number => typeof value === 'number' && points.has(value);

  function readPosition(raw: unknown): DrillPosition {
    if (!isObject(raw) || raw.mode !== 'sequence' && raw.mode !== 'random' || !validPoint(raw.current) ||
        !bank.has(raw.current) || typeof raw.finished !== 'boolean') throw Error('无效刷题位置。');
    const {order} = raw;
    if (order !== undefined && (!Array.isArray(order) || !order.length || order.length > bank.size ||
        !order.every((id: unknown): id is number => validPoint(id) && bank.has(id)) ||
        new Set(order).size !== order.length || !order.includes(raw.current) ||
        raw.mode === 'sequence' && order.some((id, i) => i > 0 && id <= order[i - 1]))) throw Error('无效刷题顺序。');
    return {mode:raw.mode, current:raw.current, finished:raw.finished, ...(order ? {order} : {})};
  }

  function readAnswer(raw: unknown) {
    if (!isObject(raw) || !validPoint(raw.questionId) || !isDrillAnswer(raw.answer)) throw Error('无效刷题答案。');
    const answer = raw.answer;
    const q = bank.get(raw.questionId);
    if (!q) throw Error('刷题题目不存在。');
    const index = q.optionIds?.indexOf(answer.optionId) ?? -1;
    const expected = q.revision === answer.revision ? answerInfo(q, index) : undefined;
    if (q.revision === answer.revision && !expected) throw Error('刷题选项不存在。');
    return {questionId:q.id, answer:expected ?? {optionId:answer.optionId, revision:answer.revision, correct:answer.correct, label:answer.label, correctLabel:answer.correctLabel}};
  }

  return (value: unknown): CloudOperation => {
    if (!isObject(value) || !validId(value.id) || !isObject(value.change)) throw Error('无效同步操作。');
    const raw = value.change;
    if (typeof raw.time !== 'number' || !Number.isFinite(raw.time) || raw.time < 0 || raw.time > 8640000000000000 ||
        raw.attempts !== undefined && (!Array.isArray(raw.attempts) || raw.attempts.length > 3) ||
        raw.completedRounds !== undefined && raw.completedRounds !== 1 ||
        raw.lastPoint !== undefined && raw.lastPoint !== null && !validPoint(raw.lastPoint)) throw Error('无效同步进度。');
    const change: CloudChange = {time:raw.time};
    if (raw.session !== undefined || raw.attempts !== undefined || raw.labs !== undefined) {
      const checked = validateImport({schemaVersion:1, points:{}, history:raw.attempts ?? [], session:raw.session, labs:raw.labs}, pointIds, questionIds);
      if (raw.session !== undefined) change.session = checked.session;
      if (raw.attempts !== undefined) change.attempts = checked.history;
      if (raw.labs !== undefined) change.labs = checked.labs;
    }
    if (raw.completedRounds === 1) change.completedRounds = 1;
    if (raw.lastPoint !== undefined) change.lastPoint = raw.lastPoint;
    if (raw.settings !== undefined) {
      const settings = raw.settings;
      if (!isObject(settings) || settings.reduceMotion !== undefined && typeof settings.reduceMotion !== 'boolean' ||
          settings.mixMistakes !== undefined && typeof settings.mixMistakes !== 'boolean' ||
          settings.textSize !== undefined && settings.textSize !== 1 && settings.textSize !== 1.1 && settings.textSize !== 1.2) throw Error('无效设置。');
      change.settings = {reduceMotion:settings.reduceMotion, textSize:settings.textSize};
      if (settings.reduceMotion === undefined) delete change.settings.reduceMotion;
      if (settings.textSize === undefined) delete change.settings.textSize;
      if (typeof settings.mixMistakes === 'boolean') change.settings.mixMistakes = settings.mixMistakes;
    }
    if (raw.drill !== undefined) {
      const update = raw.drill;
      if (!isObject(update) || !validId(update.roundId)) throw Error('无效刷题轮次。');
      const drill: NonNullable<CloudChange['drill']> = {roundId:update.roundId};
      if (update.start !== undefined) {
        const start = readPosition(update.start);
        if (!start.order || start.finished) throw Error('无效刷题开局。');
        drill.start = {...start, order:start.order};
      }
      if (update.position !== undefined) drill.position = readPosition(update.position);
      if (update.answer !== undefined) drill.answer = readAnswer(update.answer);
      change.drill = drill;
    }
    if (raw.review !== undefined) change.review = readAnswer(raw.review);
    if (Object.keys(change).length < 2) throw Error('空同步操作。');
    return {id:value.id, change};
  };
}
