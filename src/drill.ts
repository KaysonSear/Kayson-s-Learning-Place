import { isObject } from './engine.ts';
import type { DrillMode, DrillQuestion, DrillRound } from './types.ts';

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

export function start(ids: Iterable<number>, mode: DrillMode = 'sequence'): DrillRound {
  const order = makeOrder(ids, mode);
  return { mode, order, current: order[0], answers: {}, finished: false, optionVersion: OPTION_VERSION };
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
  return true;
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
  const ids = [...bank.keys()];
  if (value.mode !== 'sequence' && value.mode !== 'random' || !Array.isArray(value.order) ||
      value.order.length !== ids.length || new Set(value.order).size !== ids.length ||
      !value.order.every((id: unknown): id is number => typeof id === "number" && bank.has(id)) || typeof value.current !== "number" || !bank.has(value.current) ||
      !value.answers || typeof value.answers !== 'object' || Array.isArray(value.answers) ||
      typeof value.finished !== 'boolean') throw Error('刷题进度格式无效。');
  const order = value.order;
  if (value.mode === 'sequence' && order.some((id, i) => i > 0 && id <= order[i - 1])) {
    throw Error('刷题顺序无效。');
  }
  const answers: Record<number, number> = {};
  for (const [key, choice] of Object.entries(value.answers)) {
    if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0) throw Error("刷题答案格式无效。");
    const question = bank.get(Number(key));
    const restoredChoice = version === 1 ? question?.legacyOptionMap?.[choice] : choice;
    if (!question || String(question.id) !== key || restoredChoice === undefined ||
        !Number.isInteger(restoredChoice) || restoredChoice < 0 || restoredChoice >= question.options.length) {
      throw Error('刷题答案格式无效。');
    }
    answers[Number(key)] = restoredChoice;
  }
  if (value.finished && Object.keys(answers).length !== ids.length) throw Error('刷题完成记录无效。');
  return { mode: value.mode, order: [...value.order], current: value.current, answers, finished: value.finished, optionVersion: OPTION_VERSION };
}
