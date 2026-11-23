import fs from 'node:fs';
import path from 'node:path';
import type { Point } from '../src/types.ts';

export interface PracticeRowA {
  promptA: string;
  answerA: string;
  promptB: string;
  answerB: string;
}

export interface PracticeRowB {
  prompt: string;
  answer: string[];
}

export interface PracticeBank {
  a: Map<number, PracticeRowA>;
  baseline: Map<number, PracticeRowB>;
  transfer: Map<number, PracticeRowB>;
}

const BANNED = /【填空】|上题|下一题|如图所示/;

function filesIn(directory: string, chapters?: ReadonlySet<number>) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(name => name.endsWith('.txt')).sort().filter(name => {
    const match = /^ch(\d{2})/.exec(name);
    if (!match) throw Error(`${directory}/${name}: 文件名必须以 chNN 开头。`);
    return !chapters || chapters.has(Number(match[1]));
  }).map(name => path.join(directory, name));
}

function checkPrompt(prompt: string, file: string, line: number) {
  if (!prompt.trim()) throw Error(`${file}:${line} 题干不能为空。`);
  if (prompt.trim().length <= 12) throw Error(`${file}:${line} 题干过短：${prompt}`);
  if (BANNED.test(prompt)) throw Error(`${file}:${line} 题干含禁用表述：${prompt}`);
}

function checkAnswer(answer: string, file: string, line: number) {
  if (!answer.trim()) throw Error(`${file}:${line} 答案不能为空。`);
  if (answer.split(/;;|~/).some(part => !part.trim())) throw Error(`${file}:${line} 答案含空选项：${answer}`);
}

function readLines(directory: string, separator: '§' | '¦', fields: number, chapters?: ReadonlySet<number>) {
  const rows: {id: number; values: string[]; file: string; line: number}[] = [];
  for (const file of filesIn(directory, chapters)) {
    const relative = path.relative(process.cwd(), file);
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((raw, index) => {
      const line = index + 1;
      if (!raw.trim()) return;
      const values = raw.split(separator);
      if (values.length !== fields) throw Error(`${relative}:${line} 应有 ${fields} 个字段，实际 ${values.length} 个。`);
      const idText = values[0].trim();
      if (!/^\d+$/.test(idText)) throw Error(`${relative}:${line} 题号无效：${values[0]}`);
      rows.push({id: Number(idText), values: values.slice(1).map(value => value.trim()), file: relative, line});
    });
  }
  return rows;
}

export function loadPracticeBank(root: string, points: Point[], options: {chapter?: number; points?: ReadonlySet<number>} = {}): PracticeBank {
  const scope = options.points ?? (options.chapter === undefined ? undefined : new Set(points.filter(point => point.chapter === options.chapter).map(point => point.id)));
  const chapterScope = options.chapter !== undefined
    ? new Set([options.chapter])
    : options.points ? new Set(points.filter(point => options.points!.has(point.id)).map(point => point.chapter)) : undefined;
  const base = path.join(root, 'content', 'practice');
  const bank: PracticeBank = {a: new Map(), baseline: new Map(), transfer: new Map()};
  const prompts = new Map<string, string>();

  function addPrompt(prompt: string, where: string) {
    const key = prompt.replace(/\s+/g, ' ').trim();
    const previous = prompts.get(key);
    if (previous) throw Error(`${where} 的题干与 ${previous} 重复。`);
    prompts.set(key, where);
  }

  for (const row of readLines(path.join(base, 'a'), '§', 5, chapterScope)) {
    const [promptA, answerA, promptB, answerB] = row.values;
    checkPrompt(promptA, row.file, row.line);
    checkPrompt(promptB, row.file, row.line);
    checkAnswer(answerA, row.file, row.line);
    checkAnswer(answerB, row.file, row.line);
    addPrompt(promptA, `${row.file}:${row.line}`);
    addPrompt(promptB, `${row.file}:${row.line}`);
    if (bank.a.has(row.id)) throw Error(`${row.file}:${row.line} 题号 ${row.id} 重复。`);
    bank.a.set(row.id, {promptA, answerA, promptB, answerB});
  }

  for (const row of readLines(path.join(base, 'b-a'), '§', 3, chapterScope)) {
    const [prompt, answer] = row.values;
    checkPrompt(prompt, row.file, row.line);
    checkAnswer(answer, row.file, row.line);
    addPrompt(prompt, `${row.file}:${row.line}`);
    if (bank.baseline.has(row.id)) throw Error(`${row.file}:${row.line} 题号 ${row.id} 重复。`);
    bank.baseline.set(row.id, {prompt, answer: answer.split(';;').map(value => value.trim())});
  }

  for (const row of readLines(path.join(base, 'b-b'), '¦', 3, chapterScope)) {
    const [prompt, answer] = row.values;
    checkPrompt(prompt, row.file, row.line);
    checkAnswer(answer, row.file, row.line);
    addPrompt(prompt, `${row.file}:${row.line}`);
    if (bank.transfer.has(row.id)) throw Error(`${row.file}:${row.line} 题号 ${row.id} 重复。`);
    bank.transfer.set(row.id, {prompt, answer: answer.split(';;').map(value => value.trim())});
  }

  const target = scope ? points.filter(point => scope.has(point.id)) : points;
  const missing: string[] = [];
  for (const point of target) {
    if (point.chapter <= 10) {
      if (!bank.a.has(point.id)) missing.push(`${point.id}（${point.title}）A/B`);
    } else {
      if (!bank.baseline.has(point.id)) missing.push(`${point.id}（${point.title}）A`);
      if (!bank.transfer.has(point.id)) missing.push(`${point.id}（${point.title}）B`);
    }
  }
  if (missing.length) throw Error(`三题练习缺少 ${missing.length} 项：${missing.slice(0, 12).join('；')}${missing.length > 12 ? ' …' : ''}`);
  const pointIds = new Set(points.map(point => point.id));
  const chapters = new Map(points.map(point => [point.id, point.chapter]));
  const inScope = (id: number) => !scope || scope.has(id);
  for (const [id] of bank.a) if (inScope(id) && (!pointIds.has(id) || chapters.get(id)! > 10)) throw Error(`三题练习 a 组有多余题号 ${id}。`);
  for (const [id] of bank.baseline) if (inScope(id) && (!pointIds.has(id) || chapters.get(id)! <= 10)) throw Error(`三题练习 b-a 组有多余题号 ${id}。`);
  for (const [id] of bank.transfer) if (inScope(id) && (!pointIds.has(id) || chapters.get(id)! <= 10)) throw Error(`三题练习 b-b 组有多余题号 ${id}。`);

  return bank;
}
