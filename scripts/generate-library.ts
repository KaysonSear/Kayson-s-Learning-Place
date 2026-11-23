import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseCourse } from './course-parse.ts';
import { createRenderer, hasMath, inlineMath } from './markdown.ts';
import { createQuestions as questionsA } from './questions-a.ts';
import { createQuestions as questionsB } from './questions-b.ts';
import { loadClozeBank } from './cloze-bank.ts';
import { loadPracticeBank } from './practice-bank.ts';
import type { Library, Question } from '../src/types.ts';
import { courseSource } from './course-source.ts';
import { PROGRESS_EPOCH } from '../src/epoch.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = fs.readFileSync(courseSource, 'utf8');
const {chapters, clusters, points, extras} = parseCourse(raw);

if (points.length < 1087 || chapters.length !== 19 || clusters.length < 120 || points.some((point, index) => point.id !== index + 1)) {
  throw new Error(`Source coverage mismatch: ${chapters.length} chapters, ${clusters.length} clusters, ${points.length} points`);
}

const renderer = createRenderer(chapters, clusters, points);
for (const item of [...chapters, ...clusters, ...points, ...extras]) item.html = renderer.render(item.markdown);

for (const chapter of chapters) {
  chapter.pointIds = points.filter(point => point.chapter === chapter.id).map(point => point.id);
  chapter.labId = ({
    1: 'build', 2: 'types', 3: 'expressions', 4: 'control', 5: 'calls', 6: 'arrays', 7: 'pointers', 8: 'strings',
    9: 'formats', 10: 'parse', 11: 'bits', 12: 'sort', 13: 'calls', 14: 'struct', 15: 'resources', 16: 'resources',
    17: 'streams', 18: 'math', 19: 'build'
  } as Record<number, string>)[chapter.id];
}

const practice = loadPracticeBank(root, points);
const questions: Question[] = [...questionsA(points, practice), ...questionsB(points, practice)];
if (questions.length !== points.length * 2) throw Error('Expected two exercises per point');
const pointsWithTables = new Set(points.filter(point => point.html.includes('<table>')).map(point => point.id));
for (const question of questions) {
  if (pointsWithTables.has(question.pointId)) question.sourceTable = true;
  if (hasMath(question.explanation)) question.explanationHtml = inlineMath(question.explanation);
  question.revision = crypto.createHash('sha256').update(JSON.stringify([question.prompt, question.answer, 'options' in question ? question.options : null, question.code])).digest('hex').slice(0, 24);
}

for (const point of points) point.search = `${point.id} ${point.title} ${point.markdown}`.toLowerCase().replace(/\s+/g, ' ');

const {questions: drillQuestions} = loadClozeBank(root, points, renderer);

const data: Library = {
  version: 1,
  title: "Kayson's Learning Place",
  standard: 'C23',
  epoch: PROGRESS_EPOCH,
  sourceHash: crypto.createHash('sha256').update(raw).digest('hex'),
  chapters,
  clusters,
  points,
  extras,
  questions,
  drillQuestions,
  counts: {
    chapters: chapters.length,
    clusters: clusters.length,
    points: points.length,
    questions: questions.length,
    drillQuestions: drillQuestions.length,
    diagrams: renderer.diagramCount
  }
};
const json = JSON.stringify(data);

function writeGenerated(filename: string, contents: string) {
  const destination = path.join(root, 'content', filename);
  const temporary = destination + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporary, contents);
  fs.renameSync(temporary, destination);
}

writeGenerated('library.json', json);
writeGenerated('sync-catalog.json', JSON.stringify({
  epoch: data.epoch,
  sourceHash: data.sourceHash,
  points: points.map(({id}) => ({id})),
  questions: questions.map(({id, pointId, stage, revision}) => ({id, pointId, stage, revision})),
  drillQuestions: drillQuestions.map(({id, options, answer, optionIds, legacyOptionIds, legacyGrade, legacyOptionMap, revision}) => ({
    id, options, answer, optionIds, legacyOptionIds, legacyGrade, legacyOptionMap, revision, prompt: '', explanation: ''
  }))
}));
export { data };
