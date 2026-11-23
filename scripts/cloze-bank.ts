import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { DrillQuestion, Point } from '../src/types.ts';
import { plainBlock, plainInline } from './markdown.ts';
import type { Renderer } from './markdown.ts';

const MARKER = /\{\{([^{}\n]{1,200})\}\}/g;
const MAX_BLANKS = 3;

export interface ClozeEntry {
  pointId: number;
  quote: string;
  options: string[][];
  note: string;
  excerpt?: string;
}

export interface ClozeFile {
  format: 'cloze-bank-v1';
  chapter: number;
  questions: ClozeEntry[];
}

export interface ClozeBank {
  questions: DrillQuestion[];
}

export function normalizeQuoteText(value: string) {
  return value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Maximal non-blank runs; a fenced code block counts as one run even across blank lines. */
export function splitBlocks(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: string[] = [];
  let buffer: string[] = [];
  let fence: string | null = null;
  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) blocks.push(text);
    buffer = [];
  };
  for (const line of lines) {
    const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      buffer.push(line);
      if (match && line.trim().startsWith(fence)) { fence = null; flush(); }
      continue;
    }
    if (match) { flush(); fence = match[1]; buffer.push(line); continue; }
    if (!line.trim()) { flush(); continue; }
    buffer.push(line);
  }
  flush();
  return blocks;
}

function spans(text: string, pattern: RegExp): [number, number][] {
  return [...text.matchAll(pattern)].flatMap(match => {
    const start = match.index ?? 0;
    return [[start, start + match[0].length] as [number, number]];
  });
}

function codeSpans(text: string): [number, number][] {
  const runs = [...text.matchAll(/`+/g)];
  const result: [number, number][] = [];
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    for (let j = i + 1; j < runs.length; j++) {
      if (runs[j][0].length !== run[0].length) continue;
      const start = run.index ?? 0;
      const end = (runs[j].index ?? 0) + runs[j][0].length;
      result.push([start, end]);
      i = j;
      break;
    }
  }
  return result;
}

function markerParts(quote: string) {
  return [...quote.matchAll(MARKER)].map(match => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    text: match[1]
  }));
}

function optionLabel(parts: string[], blankCount: number, plain = false) {
  const values = parts.map(part => plain ? part : plainInline(part));
  return blankCount === 1 ? (values[0] ?? '') : values.join('; ');
}

function shuffledOrder(count: number, seed: string) {
  const hash = createHash('sha256').update(seed).digest();
  const order = Array.from({length: count}, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = hash[i % hash.length] % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function fail(file: string, index: number, pointId: unknown, message: string): never {
  throw Error(`${file}: questions[${index}] (pointId ${String(pointId)}) ${message}`);
}

function divergence(source: string, quote: string) {
  let i = 0;
  while (i < source.length && i < quote.length && source[i] === quote[i]) i++;
  const from = Math.max(0, i - 50);
  return `第 ${i} 个字符起不同。原文：…${source.slice(from, i + 90)}… 题目：…${quote.slice(from, i + 90)}…`;
}

function blockForQuote(markdown: string, filled: string, file: string, index: number, pointId: unknown) {
  const want = normalizeQuoteText(filled);
  const blocks = splitBlocks(markdown);
  const matches = blocks.filter(block => normalizeQuoteText(block).includes(want));
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw Error(`${file}: questions[${index}] (pointId ${String(pointId)}) 题干不是原文的连续片段（空白归一化后仍不匹配）。`);
  }
  fail(file, index, pointId, `题干同时出现在 ${matches.length} 个原文块中，请提供 excerpt 指定要展示的原段。`);
}

export function validateClozeEntry(entry: ClozeEntry, point: Point, file: string, index: number) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail(file, index, '-', '题目必须是对象。');
  for (const key of Object.keys(entry)) if (!['pointId', 'quote', 'options', 'note', 'excerpt'].includes(key)) fail(file, index, entry.pointId, `未知字段 ${key}。`);
  if (!Number.isInteger(entry.pointId) || entry.pointId <= 0) fail(file, index, entry.pointId, 'pointId 必须是正整数。');
  if (typeof entry.quote !== 'string') fail(file, index, entry.pointId, 'quote 必须是字符串。');
  if (!Array.isArray(entry.options) || entry.options.length !== 4) fail(file, index, entry.pointId, '必须有 4 个选项。');
  if (typeof entry.note !== 'string' || !entry.note.trim()) fail(file, index, entry.pointId, 'note 不能为空。');
  if (entry.note.length > 800) fail(file, index, entry.pointId, 'note 过长（最多 800 字）。');
  if (entry.excerpt !== undefined && (typeof entry.excerpt !== 'string' || !entry.excerpt.trim())) fail(file, index, entry.pointId, 'excerpt 必须是非空字符串。');

  const parts = markerParts(entry.quote);
  if (!parts.length) fail(file, index, entry.pointId, '题干至少要有 1 个 {{…}} 空位。');
  if (parts.length > MAX_BLANKS) fail(file, index, entry.pointId, `空位最多 ${MAX_BLANKS} 个。`);
  const stripped = entry.quote.replace(MARKER, '');
  if (stripped.includes('{{') || stripped.includes('}}')) fail(file, index, entry.pointId, '题干含未配对的 {{ 或 }}；若原文本身有双花括号，请换一段或缩小挖空范围。');
  if (stripped.includes('____')) fail(file, index, entry.pointId, '原文片段里已有 ____，请换一段。');

  const filled = entry.quote.replace(MARKER, (_, content: string) => content);
  const normalizedSource = normalizeQuoteText(point.markdown);
  const normalizedFilled = normalizeQuoteText(filled);
  if (normalizedFilled.length < 8 || normalizedFilled.length > 800) fail(file, index, entry.pointId, '题干长度需在 8–800 字之间。');
  if (!normalizedSource.includes(normalizedFilled)) {
    fail(file, index, entry.pointId, `题干不是原文的连续片段。${divergence(normalizedSource, normalizedFilled)}`);
  }

  const codeRanges = codeSpans(entry.quote);
  const mathRanges = spans(entry.quote, /\$[^$]+\$/g);
  for (const marker of parts) {
    for (const [start, end] of codeRanges) {
      const overlaps = marker.start < end && marker.end > start;
      const inside = marker.start >= start && marker.end <= end;
      const contains = marker.start <= start && marker.end >= end;
      if (overlaps && !inside && !contains) fail(file, index, entry.pointId, '空位不能跨行内代码的边界。');
    }
    for (const [start, end] of mathRanges) {
      const overlaps = marker.start < end && marker.end > start;
      const contains = marker.start <= start && marker.end >= end;
      // A blank inside a formula would make KaTeX parse `____`; blank the whole formula instead.
      if (overlaps && !contains) fail(file, index, entry.pointId, '空位不要放在 $…$ 公式内部；请把整个公式一起挖空。');
    }
  }
  for (let i = 1; i < parts.length; i++) {
    if (!entry.quote.slice(parts[i - 1].end, parts[i].start).trim()) fail(file, index, entry.pointId, '两个空位之间必须有可见文字。');
  }

  const blankCount = parts.length;
  const prompt = entry.quote.replace(MARKER, '____');
  if ((prompt.match(/____/g) || []).length !== blankCount) fail(file, index, entry.pointId, '空位数量与 ____ 数量不一致。');

  const correctParts = parts.map(part => plainInline(part.text));
  const labels: string[] = [];
  entry.options.forEach((option, optionIndex) => {
    if (!Array.isArray(option) || option.length !== blankCount) fail(file, index, entry.pointId, `options[${optionIndex}] 的分量数应等于空位数 ${blankCount}。`);
    option.forEach((part, partIndex) => {
      if (typeof part !== 'string' || !part.trim()) fail(file, index, entry.pointId, `options[${optionIndex}][${partIndex}] 不能为空。`);
      if (part.length > 240) fail(file, index, entry.pointId, `options[${optionIndex}][${partIndex}] 过长。`);
      if (blankCount > 1 && part.includes(';')) fail(file, index, entry.pointId, `多空题的选项分量不能含分号：${JSON.stringify(part)}。`);
    });
    labels.push(optionLabel(option, blankCount));
  });
  if (new Set(labels).size !== labels.length) fail(file, index, entry.pointId, '四个选项去重后不唯一。');
  if (optionLabel(correctParts, blankCount, true) !== labels[0]) fail(file, index, entry.pointId, 'options[0] 必须与空位原文完全一致。');
  if (entry.options.slice(1).some(option => option.every((part, i) => plainInline(part) === correctParts[i]))) fail(file, index, entry.pointId, '干扰项不能与正确项相同。');

  const excerpt = entry.excerpt ?? blockForQuote(point.markdown, filled, file, index, entry.pointId);
  const normalizedExcerpt = normalizeQuoteText(excerpt);
  if (!normalizedSource.includes(normalizedExcerpt)) fail(file, index, entry.pointId, 'excerpt 不是原文中的连续片段。');
  if (!normalizedExcerpt.includes(normalizedFilled)) fail(file, index, entry.pointId, 'excerpt 必须包含题干。');

  return {blankCount, parts, filled, prompt, excerpt, labels, correctParts};
}

export function loadClozeBank(
  root: string,
  points: Point[],
  renderer: Renderer,
  options: {chapter?: number; points?: ReadonlySet<number>; requireComplete?: boolean} = {}
): ClozeBank {
  const scope = options.points ?? (options.chapter === undefined ? undefined : new Set(points.filter(point => point.chapter === options.chapter).map(point => point.id)));
  const directory = path.join(root, 'content', 'cloze');
  if (!fs.existsSync(directory)) throw Error('缺少 content/cloze 题库目录。');
  const chapterScope = options.chapter !== undefined
    ? new Set([options.chapter])
    : options.points ? new Set(points.filter(point => options.points!.has(point.id)).map(point => point.chapter)) : undefined;
  const files = fs.readdirSync(directory).filter(name => name.endsWith('.json')).sort().filter(name => {
    const match = /^ch(\d{2})/.exec(name);
    if (!match) throw Error(`content/cloze/${name}: 文件名必须以 chNN 开头。`);
    return !chapterScope || chapterScope.has(Number(match[1]));
  });
  if (!files.length) throw Error('content/cloze 中没有题库文件。');
  const byPoint = new Map<number, Point>();
  for (const point of points) byPoint.set(point.id, point);
  const questions: DrillQuestion[] = [];
  const seenIds = new Set<number>();
  const prompts = new Map<string, number>();

  for (const name of files) {
    const file = path.join('content', 'cloze', name);
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
    } catch (error) {
      throw Error(`${file}: JSON 解析失败：${(error as Error).message}`);
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error(`${file}: 顶层必须是对象。`);
    const data = raw as Partial<ClozeFile>;
    if (data.format !== 'cloze-bank-v1') throw Error(`${file}: format 必须是 "cloze-bank-v1"。`);
    if (!Number.isInteger(data.chapter) || !data.chapter || data.chapter < 1 || data.chapter > 19) throw Error(`${file}: chapter 必须是 1–19。`);
    if (options.chapter !== undefined && data.chapter !== options.chapter) continue;
    if (!Array.isArray(data.questions) || !data.questions.length) throw Error(`${file}: questions 不能为空。`);
    data.questions.forEach((entry, index) => {
      if (scope && !scope.has(entry?.pointId)) return;
      const point = byPoint.get(entry?.pointId);
      if (!point) fail(file, index, entry?.pointId, '找不到对应的知识点。');
      if (point.chapter !== data.chapter) fail(file, index, entry.pointId, `该知识点属于第 ${point.chapter} 章。`);
      if (seenIds.has(point.id)) fail(file, index, point.id, '该知识点已经出过题。');
      const checked = validateClozeEntry(entry, point, file, index);
      const key = normalizeQuoteText(checked.prompt);
      const duplicate = prompts.get(key);
      if (duplicate !== undefined) fail(file, index, point.id, `题干与知识点 ${duplicate} 重复。`);
      prompts.set(key, point.id);
      seenIds.add(point.id);

      const order = shuffledOrder(4, `cloze-v1:${point.id}`);
      const labels = checked.labels;
      const options = order.map(index => labels[index]);
      const answer = order.indexOf(0);
      const optionIds = options.map(option => createHash('sha256').update(option).digest('hex').slice(0, 24));
      const revision = createHash('sha256').update(JSON.stringify([checked.prompt, options[answer], [...options].sort()])).digest('hex').slice(0, 24);
      const noteHtml = renderer.renderInline(entry.note.trim());
      const excerptHtml = renderer.render(checked.excerpt);
      const explanationHtml = '<p class="explanation-source">讲解</p><div class="explanation-note">' + noteHtml + '</div><p class="explanation-source">原文</p>' + excerptHtml;
      const blank = (index: number) => `<span class="cloze-blank" data-blank="${index}">____</span>`;
      let counter = 0;
      const promptHtml = renderer.renderInline(entry.quote.replace(MARKER, () => `\uE000${counter++}\uE001`))
        .replace(/\uE000(\d+)\uE001/g, (_, index: string) => blank(Number(index)));

      questions.push({
        id: point.id,
        prompt: checked.prompt,
        promptHtml,
        quote: entry.quote,
        blankCount: checked.blankCount,
        options,
        answer,
        note: entry.note.trim(),
        excerpt: checked.excerpt,
        excerptHtml,
        explanation: `${entry.note.trim()} ${plainBlock(checked.excerpt)}`.trim(),
        explanationHtml,
        legacyOptionMap: [0, 1, 2, 3].map(correct => order.indexOf(correct)),
        optionIds,
        revision
      });
    });
  }

  const expected = scope ? points.filter(point => scope.has(point.id)) : points;
  if (options.requireComplete !== false) {
    const missing = expected.filter(point => !seenIds.has(point.id)).map(point => point.id);
    if (missing.length) throw Error(`挖空题库缺少知识点 ${missing.join(', ')}。`);
    if (questions.length !== expected.length) throw Error(`挖空题库题目数 ${questions.length} 与知识点数 ${expected.length} 不一致。`);
  }
  return {questions: questions.sort((a, b) => a.id - b.id)};
}
