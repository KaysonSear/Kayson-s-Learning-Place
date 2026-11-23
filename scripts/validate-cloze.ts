import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { courseSource } from './course-source.ts';
import { parseCourse } from './course-parse.ts';
import { createRenderer } from './markdown.ts';
import { loadClozeBank } from './cloze-bank.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = fs.readFileSync(courseSource, 'utf8');
const {chapters, clusters, points} = parseCourse(raw);
const renderer = createRenderer(chapters, clusters, points);
const argument = process.argv[2];
const range = argument && /^(\d+)-(\d+)$/.exec(argument);
const chapter = argument && !range ? Number(argument) : undefined;
if (argument && !range && (!Number.isInteger(chapter) || chapter! < 1 || chapter! > 19)) {
  console.error('用法：node scripts/validate-cloze.ts [章号 1-19 | 起始点-结束点]');
  process.exit(1);
}
const scope = range ? new Set(points.filter(point => point.id >= Number(range[1]) && point.id <= Number(range[2])).map(point => point.id)) : undefined;
const label = range ? `知识点 ${range[1]}–${range[2]}` : `第 ${chapter ?? '全部'} 章`;

try {
  const {questions} = loadClozeBank(root, points, renderer, {chapter, points: scope, requireComplete: true});
  const blanks = new Map<number, number>();
  for (const question of questions) blanks.set(question.blankCount ?? 1, (blanks.get(question.blankCount ?? 1) ?? 0) + 1);
  const distribution = [...blanks.entries()].sort((a, b) => a[0] - b[0]).map(([count, n]) => `${count} 空 × ${n}`).join('，');
  console.log(`PASS ${label}：${questions.length} 题；${distribution}。`);
} catch (error) {
  console.error(`FAIL ${(error as Error).message}`);
  process.exit(1);
}
