import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { courseSource } from './course-source.ts';
import { parseCourse } from './course-parse.ts';
import { loadPracticeBank } from './practice-bank.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = fs.readFileSync(courseSource, 'utf8');
const {points} = parseCourse(raw);
const argument = process.argv[2];
const range = argument && /^(\d+)-(\d+)$/.exec(argument);
const chapter = argument && !range ? Number(argument) : undefined;
if (argument && !range && (!Number.isInteger(chapter) || chapter! < 1 || chapter! > 19)) {
  console.error('用法：node scripts/validate-practice.ts [章号 1-19 | 起始点-结束点]');
  process.exit(1);
}
const scope = range ? new Set(points.filter(point => point.id >= Number(range[1]) && point.id <= Number(range[2])).map(point => point.id)) : undefined;
const label = range ? `知识点 ${range[1]}–${range[2]}` : `第 ${chapter ?? '全部'} 章`;

try {
  loadPracticeBank(root, points, {chapter, points: scope});
  const target = scope ? points.filter(point => scope.has(point.id)) : chapter === undefined ? points : points.filter(point => point.chapter === chapter);
  const a = target.filter(point => point.chapter <= 10).length;
  const b = target.length - a;
  console.log(`PASS ${label}：${a} 组 A/B（第 1–10 章） + ${b} 组 A/B（第 11–19 章）。`);
} catch (error) {
  console.error(`FAIL ${(error as Error).message}`);
  process.exit(1);
}
