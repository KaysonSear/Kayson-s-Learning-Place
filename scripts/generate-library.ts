import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import MarkdownIt from 'markdown-it';
import katex from 'katex';
import { fileURLToPath } from 'node:url';
import { createQuestions as questionsA } from './questions-a.ts';
import { createQuestions as questionsB } from './questions-b.ts';
import type { Chapter, Cluster, Library, Point, Question, SourceSection } from '../src/types.ts';
import { interactiveQuestions } from './interactive-questions.ts';
import { loadDrillQuestions } from './drill-bank.ts';
import { courseSource } from './course-source.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = fs.readFileSync(courseSource, 'utf8');
const escape = (s: unknown) => String(s).replace(/[&<>"']/g, c => (({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as Record<string,string>)[c]));
const headings: {level:number;title:string;start:number;end:number}[] = []; let offset = 0, fenced = false;
for (const line of raw.split(/(?<=\n)/)) {
  if (/^```/.test(line)) fenced = !fenced;
  const m = !fenced && /^(#{2,4}) (.+?)\r?\n?$/.exec(line);
  if (m) headings.push({level:m[1].length,title:m[2],start:offset,end:offset+line.length});
  offset += line.length;
}
const chapters: Chapter[] = [], clusters: Cluster[] = [], points: Point[] = [], extras: SourceSection[] = []; let chapter=0, cluster='';
extras.push({html:'',title:'阅读约定',markdown:raw.slice(0,headings[0].start).replace(/^---[\s\S]*?---\s*/, '').replace(/^# Coding · C\s*/, '').trim()});
headings.forEach((h,i)=>{
  const markdown=raw.slice(h.end,headings[i+1]?.start ?? raw.length).trim();
  if(h.level===2 && /^\d{2} /.test(h.title)) {
    chapter=Number(h.title.slice(0,2)); chapter && chapters.push({id:chapter,title:h.title,markdown,html:"",pointIds:[],labId:""});
  } else if(h.level===3 && /^(\d{2}\.\d+) /.test(h.title)) {
    cluster=h.title.match(/^[\d.]+/)![0]; clusters.push({id:cluster,chapter,title:h.title,markdown,html:""});
  } else if(h.level===4 && /^\d+\. /.test(h.title)) {
    points.push({id:Number(h.title.match(/^\d+/)![0]),title:h.title.replace(/^\d+\. /,''),chapter,cluster,markdown,html:"",search:""});
  } else if(h.level===2 || !/^\d/.test(h.title)) extras.push({html:'',title:h.title,markdown});
});
if(points.length<1064 || chapters.length!==19 || clusters.length<118 || points.some((point,index)=>point.id!==index+1)) throw new Error('Source coverage mismatch');
const targets=new Map();
for(const p of points) targets.set(`${p.id}. ${p.title}`,`#point-${p.id}`);
for(const c of chapters) targets.set(c.title,`#chapter-${c.id}`);
for(const c of clusters) targets.set(c.title,`#cluster-${c.id}`);
const targetFor = (title: string) => targets.get(title.replace(/^#/,'')) || '#knowledge';
let diagramCount=0;
function diagram(text: string) {
  const nodes=[...text.matchAll(/([A-Za-z][\w]*)\["([^"\n]+)"\]/g)].map(m=>({id:m[1],label:m[2]}));
  const unique=[...new Map(nodes.map(n=>[n.id,n])).values()];
  const edges=[...text.matchAll(/([A-Za-z][\w]*)\s*-->\s*([A-Za-z][\w]*)/g)].map(m=>[m[1],m[2]]);
  const outgoing=new Set(edges.map(e=>e[1]));
  const roots=unique.filter(n=>!edges.some(e=>e[1]===n.id));
  const depth: Record<string,number>={}; roots.forEach(n=>depth[n.id]=0);
  for(let k=0;k<unique.length;k++) for(const [a,b] of edges) if(depth[a]!==undefined) depth[b]=Math.max(depth[b]||0,depth[a]+1);
  const levels: (typeof unique)[]=[];for(const n of unique){const d=depth[n.id]||0;(levels[d]??=[]).push(n);}
  const rows=Math.max(1,...levels.map(l=>l?.length||0)); const height=rows*62+24,width=Math.max(620,levels.length*260+20);
  const coords: Record<string,{x:number;y:number}>={}; levels.forEach((list,d)=>list.forEach((n,i)=>coords[n.id]={x:18+d*260,y:12+(i+.5)*rows/list.length*62-22}));
  const marker=`arrow-${++diagramCount}`;
  const paths=edges.map(([a,b])=>{const x=coords[a],y=coords[b];return x&&y?`<path d="M${x.x+228},${x.y+22} C${x.x+245},${x.y+22} ${y.x-20},${y.y+22} ${y.x},${y.y+22}" fill="none" stroke="#aaa" marker-end="url(#${marker})"/>`:'';}).join('');
  const boxes=unique.map(n=>{const {x,y}=coords[n.id];const label=n.label.replace(/^#/,''); const chunks=label.match(/.{1,18}/gu)||[''];return `<a href="${escape(targetFor(n.label))}" aria-label="${escape(label)}"><rect x="${x}" y="${y}" width="228" height="44" rx="1" fill="white" stroke="${outgoing.has(n.id)?'#000':'#dedede'}"/><text x="${x+12}" y="${y+(chunks.length>1?18:27)}" font-size="12" fill="#000">${chunks.slice(0,2).map((s,i)=>`<tspan x="${x+12}" dy="${i?16:0}">${escape(s)}</tspan>`).join('')}</text><title>${escape(label)}</title></a>`;}).join('');
  return `<div class="source-diagram"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="知识关系图"><defs><marker id="${marker}" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#aaa"/></marker></defs>${paths}${boxes}</svg></div>`;
}
const md=new MarkdownIt({html:false,linkify:false,typographer:false});
md.inline.ruler.after('escape','math_inline',(state,silent)=>{
  if(state.src[state.pos]!=='$')return false;
  const end=state.src.indexOf('$',state.pos+1);if(end<0)return false;
  if(!silent){const t=state.push('math_inline','math',0);t.content=state.src.slice(state.pos+1,end).trim();}
  state.pos=end+1;return true;
});
md.renderer.rules.math_inline=(tokens,i)=>katex.renderToString(tokens[i].content,katexOptions);
const fence=md.renderer.rules.fence!;
md.renderer.rules.fence=(tokens,i,options,env,self)=>tokens[i].info.trim()==='mermaid'?diagram(tokens[i].content):fence(tokens,i,options,env,self);
const katexOptions={output:'mathml',throwOnError:false,strict:false} as const;
// Plain-text explanations keep the source's inline $…$ math; pre-render it so the app shows real formulas.
function inlineMath(text: string){
  return text.split(/\$([^$\n]+)\$/).map((part,i)=>i%2?katex.renderToString(part.trim(),katexOptions):escape(part)).join('');
}
const hasMath=(text: string)=>/\$[^$\n]+\$/.test(text);
// The source escapes table pipes as raw <code>&#124;</code>; html:false would print those tags, so turn them into code spans.
const rawCode=(text: string)=>text.replace(/<code>([^<\n]*)<\/code>/g,(_,code: string)=>'`'+code.replace(/&#124;/g,'\\|')+'`');
// CommonMark rejects **…** whose closing run touches CJK punctuation (e.g. **调用栈（Call Stack）**就是); finish those outside code.
const cjkStrong=(html: string)=>html.split(/(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>|<[^>]+>)/).map((part,i)=>i%2?part:part.replace(/\*\*([^*\n]+?)\*\*/g,'<strong>$1</strong>')).join('');
function render(text: string): string {
  text=rawCode(text);
  text=text.replace(/\[\[#([^\]|]+)(?:\|([^\]]+))?\]\]/g,(_,title,label)=>`[${label||title}](${targetFor(title)})`);
  // Obsidian callouts become native disclosure widgets; quoted contents retain their Markdown semantics.
  const blocks: string[]=[];
  text=text.replace(/^> \[!([^\]]+)\](-)?\s*([^\n]*)\r?\n((?:>.*(?:\r?\n|$))*)/gm,(_,kind,collapsed,title,body: string)=>{
    const inner=body.replace(/^> ?/gm,''); const html=`<details class="callout"${collapsed?'':' open'}><summary>${escape(title.trim()||kind)}</summary>${render(inner)}</details>`;
    blocks.push(html);return `\n\nCALLBLOCK${blocks.length-1}END\n\n`;
  });
  return cjkStrong(md.render(text)).replace(/<p>CALLBLOCK(\d+)END<\/p>/g,(_,i)=>blocks[Number(i)]);
}
for(const item of [...chapters,...clusters,...points,...extras]) item.html=render(item.markdown);
for(const c of chapters){c.pointIds=points.filter(p=>p.chapter===c.id).map(p=>p.id);c.labId=({1:'build',2:'types',3:'expressions',4:'control',5:'calls',6:'arrays',7:'pointers',8:'strings',9:'formats',10:'parse',11:'bits',12:'sort',13:'calls',14:'struct',15:'resources',16:'resources',17:'streams',18:'math',19:'build'} as Record<number,string>)[c.id];}
const questions: Question[] = [...questionsA(points), ...questionsB(points)];
if (questions.length !== points.length * 2) throw Error('Expected two exercises per point');
const pointsWithTables = new Set(points.filter(point => point.html.includes('<table>')).map(point => point.id));
for (const question of questions) {
  const authored = interactiveQuestions.get(question.id);
  if (authored) Object.assign(question, authored);
  else if (pointsWithTables.has(question.pointId)) question.sourceTable = true;
  if (hasMath(question.explanation)) question.explanationHtml = inlineMath(question.explanation);
  question.revision = crypto.createHash('sha256').update(JSON.stringify([question.prompt, question.answer, 'options' in question ? question.options : null, question.code])).digest('hex').slice(0,24);
}
for(const point of points)point.search=`${point.id} ${point.title} ${point.markdown}`.toLowerCase().replace(/\s+/g,' ');
const drillQuestions=loadDrillQuestions(root,points);
const optionBaseline: Record<number, {options:string[]; v1:number[]; labels:string[]; correct:number; revision:string}> = JSON.parse(fs.readFileSync(path.join(root, 'content/drill-option-baseline.json'), 'utf8'));
for (const question of drillQuestions) {
  if (pointsWithTables.has(question.id)) question.sourceTable = true;
  if (hasMath(question.explanation)) question.explanationHtml = inlineMath(question.explanation);
  question.optionIds = question.options.map(option => crypto.createHash('sha256').update(option).digest('hex').slice(0,24));
  question.revision = crypto.createHash('sha256').update(JSON.stringify([question.prompt, question.options[question.answer], [...question.options].sort()])).digest('hex').slice(0,24);
  const baseline = optionBaseline[question.id];
  if (baseline) {
    question.legacyOptionIds = {1:baseline.v1.map(index => baseline.options[index]), 2:baseline.options};
    const retired = Object.fromEntries(baseline.options.flatMap((id,index) => question.optionIds?.includes(id) ? [] : [[id,baseline.labels[index]]]));
    question.legacyGrade = {revision:baseline.revision, correctId:baseline.options[baseline.correct], correctLabel:baseline.labels[baseline.correct],
      ...(Object.keys(retired).length ? {retired} : {})};
  }
}
const data: Library={version:1,title:"Kayson's Learning Place",standard:'C23',sourceHash:crypto.createHash('sha256').update(raw).digest('hex'),chapters,clusters,points,extras,questions,drillQuestions,counts:{chapters:chapters.length,clusters:clusters.length,points:points.length,questions:questions.length,drillQuestions:drillQuestions.length,diagrams:diagramCount}};
const json = JSON.stringify(data);
function writeGenerated(filename: string, contents: string) {
  const destination = path.join(root,'content',filename);
  const temporary = destination + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporary, contents);
  fs.renameSync(temporary, destination);
}
writeGenerated('library.json',json);
writeGenerated('sync-catalog.json',JSON.stringify({
  sourceHash:data.sourceHash,
  points:points.map(({id})=>({id})),
  questions:questions.map(({id, pointId, stage, revision})=>({id, pointId, stage, revision})),
  drillQuestions:drillQuestions.map(({id,options,answer,optionIds,legacyOptionIds,legacyGrade,legacyOptionMap,revision})=>({id,options,answer,optionIds,legacyOptionIds,legacyGrade,legacyOptionMap,revision,prompt:'',explanation:''}))
}));
export { data };
