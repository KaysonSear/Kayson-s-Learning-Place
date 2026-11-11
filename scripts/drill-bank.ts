import type { DrillQuestion, Point } from '../src/types.ts';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

function excerpt(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[\[#([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_, name, label) => label || name)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`|\*\*([^*]+)\*\*/g, (_, code, bold) => code ?? bold)
    .replace(/^> ?/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function shuffledOptions(options: string[], id: number) {
  const hash = createHash('sha256').update(`c-lab-drill-v1:${id}`).digest();
  const shuffled = [...options];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = hash[i] % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function loadDistractors(directory: string, range: string) {
  const text = fs.readFileSync(path.join(directory, `drill-options-${range}.txt`), 'utf8');
  const result = new Map<string, string[]>();
  for (const row of text.trim().split(/\r?\n/)) {
    const [id, ...options] = row.split('§').map(field => field.trim());
    if (result.has(id) || !options.length || options.some(option => !option)) {
      throw Error(`刷题干扰项存在无效记录 ${range} / ${id}`);
    }
    result.set(id, options);
  }
  return result;
}

export function loadDrillQuestions(root: string, points: Point[]): DrillQuestion[] {
  const source = new Map(points.map(point => [point.id, point]));
  const bank = new Map<number, DrillQuestion>();
  const prompts = new Set();
  const ranges = ['01-03', '04-07', '08-10', '11-13', '14-16', '17-19'];
  const directory = path.join(root, 'content');
  for (const range of ranges) {
    const rows = fs.readFileSync(path.join(directory, `drill-${range}.txt`), 'utf8');
    const distractors = loadDistractors(directory, range);
    for (const row of rows.trim().split(/\r?\n/)) {
      // Each row contains id, cloze, correct option, then one to three distractors.
      const [number, prompt, ...authored] = row.split('§').map(field => field.trim());
      const id = Number(number);
      const point = source.get(id);
      if (!point || String(id) !== number || bank.has(id) || prompts.has(prompt) ||
          (prompt.match(/____/g) || []).length !== 1 || authored.length < 2 || authored.length > 4 ||
          authored.some(option => !option) || new Set(authored).size !== authored.length) {
        throw Error(`刷题题库存在无效记录 ${range} / ${number}`);
      }
      const expanded = [...authored, ...(distractors.get(number) ?? [])];
      distractors.delete(number);
      if (expanded.length !== 4 || new Set(expanded).size !== 4) {
        throw Error(`刷题第 ${id} 题需要四个不同的选项`);
      }
      const options = shuffledOptions(expanded, id);
      const legacyOptionMap = shuffledOptions(authored, id).map(option => options.indexOf(option));
      const explanation = excerpt(point.markdown) || point.markdown.replace(/^```[^\n]*\n|^```\s*$/gm, '').trim();
      if (!explanation) throw Error(`刷题第 ${id} 题缺少原文解析`);
      bank.set(id, { id, prompt, options, answer: options.indexOf(authored[0]), explanation, legacyOptionMap });
      prompts.add(prompt);
    }
    if (distractors.size) throw Error(`刷题干扰项没有对应的题目 ${range} / ${[...distractors.keys()].join(', ')}`);
  }
  if (bank.size !== points.length) {
    throw Error(`刷题题库缺少知识点 ${points.filter(point => !bank.has(point.id)).map(point => point.id).join(', ')}`);
  }
  return [...bank.values()].sort((a, b) => a.id - b.id);
}
