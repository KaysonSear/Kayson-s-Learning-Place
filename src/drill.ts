import { isObject } from './engine.ts';
import type { DrillMode, DrillQuestion, DrillRound } from './types.ts';
import type { DrillAnswer } from './cloud-types.ts';

const OPTION_VERSION = 2;

export function makeOrder(ids: Iterable<number>, mode: DrillMode, random = Math.random) {
  const order = [...ids].sort((a, b) => a - b);
  if (mode === 'random') {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  }
  return order;
}

/** Seeded permutation of option indexes, so a question's options appear in a new order each time it comes back. */
export function displayOrder(count: number, seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const random = () => {
    h = (h + 0x6D2B79F5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order = Array.from({length:count}, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export function start(ids: Iterable<number>, mode: DrillMode = 'sequence'): DrillRound {
  const order = makeOrder(ids, mode);
  return { mode, order, current: order[0], answers: {}, finished: false, optionVersion: OPTION_VERSION, roundId:crypto.randomUUID() };
}

export function changeMode(round: DrillRound, mode: DrillMode) {
  if (mode === round.mode) return;
  round.order = makeOrder(round.order, mode);
  round.mode = mode;
}

export function answer(round: DrillRound, question: DrillQuestion, choice: number) {
  if (round.finished || round.current !== question.id || Object.hasOwn(round.answers, question.id) ||
      !Number.isInteger(choice) || choice < 0 || choice >= question.options.length) return false;
  round.answers[question.id] = choice;
  const info = answerInfo(question, choice);
  if (info) (round.answerInfo ??= {})[question.id] = info;
  return true;
}

export function answerInfo(question: DrillQuestion, choice: number): DrillAnswer | undefined {
  const optionId = question.optionIds?.[choice];
  if (!optionId || !question.revision) return;
  return {optionId, revision:question.revision, correct:choice === question.answer, label:question.options[choice], correctLabel:question.options[question.answer]};
}

export function isDrillAnswer(value: unknown): value is DrillAnswer {
  return isObject(value) && typeof value.optionId === 'string' && /^[a-f0-9]{24}$/.test(value.optionId) &&
    typeof value.revision === 'string' && /^[a-f0-9]{24}$/.test(value.revision) && typeof value.correct === 'boolean' &&
    typeof value.label === 'string' && value.label.length <= 4000 && typeof value.correctLabel === 'string' && value.correctLabel.length <= 4000;
}

export function jump(round: DrillRound, id: number) {
  if (!round.order.includes(id)) return false;
  round.current = id;
  round.finished = false;
  return true;
}

export function next(round: DrillRound) {
  const position = round.order.indexOf(round.current);
  for (let offset = 1; offset <= round.order.length; offset++) {
    const id = round.order[(position + offset) % round.order.length];
    if (!Object.hasOwn(round.answers, id)) {
      round.current = id;
      return;
    }
  }
  round.finished = true;
}

export function restore(value: unknown, bank: ReadonlyMap<number, DrillQuestion>): DrillRound | null {
  if (value == null) return null;
  if (!isObject(value)) throw Error("刷题记录格式无效。");
  const version = value.optionVersion === undefined ? 1 : value.optionVersion;
  if (version !== 1 && version !== OPTION_VERSION) throw Error('刷题选项版本不受支持。');
  if (value.mode !== 'sequence' && value.mode !== 'random' || !Array.isArray(value.order) ||
      !value.order.length || new Set(value.order).size !== value.order.length ||
      !value.order.every((id: unknown): id is number => typeof id === "number" && bank.has(id)) || typeof value.current !== "number" || !value.order.includes(value.current) ||
      !value.answers || typeof value.answers !== 'object' || Array.isArray(value.answers) ||
      typeof value.finished !== 'boolean') throw Error('刷题进度格式无效。');
  const order = value.order;
  if (value.mode === 'sequence' && order.some((id, i) => i > 0 && id <= order[i - 1])) {
    throw Error('刷题顺序无效。');
  }
  const answers: Record<number, number> = {};
  const info: Record<number, DrillAnswer> = {};
  const orderIds = new Set(order);
  if (value.answerInfo !== undefined && !isObject(value.answerInfo)) throw Error('刷题判分记录格式无效。');
  for (const [key, choice] of Object.entries(value.answers)) {
    if (typeof choice !== "number" || !Number.isInteger(choice)) throw Error("刷题答案格式无效。");
    const question = bank.get(Number(key));
    if (!question || String(question.id) !== key || !orderIds.has(question.id)) throw Error('刷题答案格式无效。');
    const recorded = value.answerInfo?.[key];
    if (recorded !== undefined) {
      if (!isDrillAnswer(recorded)) throw Error('刷题判分记录格式无效。');
      info[question.id] = recorded;
      answers[question.id] = question.optionIds?.indexOf(recorded.optionId) ?? choice;
      continue;
    }
    const legacy = question.legacyOptionIds?.[version];
    const restoredChoice = legacy && question.optionIds ? question.optionIds.indexOf(legacy[choice]) : version === 1 ? question.legacyOptionMap[choice] : choice;
    const legacyOption = legacy?.[choice];
    const legacyGrade = question.legacyGrade;
    const label = restoredChoice >= 0 ? question.options[restoredChoice] : legacyOption && legacyGrade?.retired?.[legacyOption];
    if (legacyOption && legacyGrade && label !== undefined) {
      info[question.id] = {optionId:legacyOption, revision:legacyGrade.revision, correct:legacyOption === legacyGrade.correctId,
        label, correctLabel:legacyGrade.correctLabel};
      answers[question.id] = restoredChoice;
      continue;
    }
    if (!Number.isInteger(restoredChoice) || restoredChoice < 0 || restoredChoice >= question.options.length) throw Error('刷题答案格式无效。');
    answers[question.id] = restoredChoice;
  }
  if (value.finished && Object.keys(answers).length !== order.length) throw Error('刷题完成记录无效。');
  if (value.roundId !== undefined && (typeof value.roundId !== 'string' || !/^[a-f0-9-]{36}$/.test(value.roundId))) throw Error('刷题轮次编号无效。');
  return { mode: value.mode, order: [...order], current: value.current, answers, finished: value.finished, optionVersion: OPTION_VERSION,
    ...(value.roundId ? {roundId:value.roundId} : {}), ...(Object.keys(info).length ? {answerInfo:info} : {}) };
}
