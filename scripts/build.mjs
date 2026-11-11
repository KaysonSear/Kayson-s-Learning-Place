import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import MarkdownIt from 'markdown-it';
import katex from 'katex';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { interactiveQuestions } from './interactive-questions.mjs';
import { loadDrillQuestions } from './drill-bank.mjs';
import { courseSource } from './course-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = fs.readFileSync(courseSource, 'utf8');
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const headings = []; let offset = 0, fenced = false;
for (const line of raw.split(/(?<=\n)/)) {
  if (/^```/.test(line)) fenced = !fenced;
  const m = !fenced && /^(#{2,4}) (.+?)\r?\n?$/.exec(line);
  if (m) headings.push({level:m[1].length,title:m[2],start:offset,end:offset+line.length});
  offset += line.length;
}
const chapters=[], clusters=[], points=[], extras=[]; let chapter=0, cluster='';
extras.push({title:'阅读约定',markdown:raw.slice(0,headings[0].start).replace(/^---[\s\S]*?---\s*/, '').replace(/^# Coding · C\s*/, '').trim()});
headings.forEach((h,i)=>{
  const markdown=raw.slice(h.end,headings[i+1]?.start ?? raw.length).trim();
  if(h.level===2 && /^\d{2} /.test(h.title)) {
    chapter=Number(h.title.slice(0,2)); chapter && chapters.push({id:chapter,title:h.title,markdown});
  } else if(h.level===3 && /^(\d{2}\.\d+) /.test(h.title)) {
    cluster=h.title.match(/^[\d.]+/)[0]; clusters.push({id:cluster,chapter,title:h.title,markdown});
  } else if(h.level===4 && /^\d+\. /.test(h.title)) {
    points.push({id:Number(h.title.match(/^\d+/)[0]),title:h.title.replace(/^\d+\. /,''),chapter,cluster,markdown});
  } else if(h.level===2 || !/^\d/.test(h.title)) extras.push({title:h.title,markdown});
});
if(points.length!==1064 || chapters.length!==19 || clusters.length!==118) throw new Error('Source coverage mismatch');
const targets=new Map();
for(const p of points) targets.set(`${p.id}. ${p.title}`,`#point-${p.id}`);
for(const c of chapters) targets.set(c.title,`#chapter-${c.id}`);
for(const c of clusters) targets.set(c.title,`#cluster-${c.id}`);
const targetFor = title => targets.get(title.replace(/^#/,'')) || '#knowledge';
let diagramCount=0;
function diagram(text) {
  const nodes=[...text.matchAll(/([A-Za-z][\w]*)\["([^"\n]+)"\]/g)].map(m=>({id:m[1],label:m[2]}));
  const unique=[...new Map(nodes.map(n=>[n.id,n])).values()];
  const edges=[...text.matchAll(/([A-Za-z][\w]*)\s*-->\s*([A-Za-z][\w]*)/g)].map(m=>[m[1],m[2]]);
  const outgoing=new Set(edges.map(e=>e[1]));
  const roots=unique.filter(n=>!edges.some(e=>e[1]===n.id));
  const depth={}; roots.forEach(n=>depth[n.id]=0);
  for(let k=0;k<unique.length;k++) for(const [a,b] of edges) if(depth[a]!==undefined) depth[b]=Math.max(depth[b]||0,depth[a]+1);
  const levels=[];for(const n of unique){const d=depth[n.id]||0;(levels[d]??=[]).push(n);}
  const rows=Math.max(1,...levels.map(l=>l?.length||0)); const height=rows*62+24,width=Math.max(620,levels.length*260+20);
  const coords={}; levels.forEach((list,d)=>list.forEach((n,i)=>coords[n.id]={x:18+d*260,y:12+(i+.5)*rows/list.length*62-22}));
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
md.renderer.rules.math_inline=(tokens,i)=>katex.renderToString(tokens[i].content,{output:'mathml',throwOnError:false,strict:false});
const fence=md.renderer.rules.fence;
md.renderer.rules.fence=(tokens,i,options,env,self)=>tokens[i].info.trim()==='mermaid'?diagram(tokens[i].content):fence(tokens,i,options,env,self);
function render(text) {
  text=text.replace(/\[\[#([^\]|]+)(?:\|([^\]]+))?\]\]/g,(_,title,label)=>`[${label||title}](${targetFor(title)})`);
  // Obsidian callouts become native disclosure widgets; quoted contents retain their Markdown semantics.
  const blocks=[];
  text=text.replace(/^> \[!([^\]]+)\](-)?\s*([^\n]*)\r?\n((?:>.*(?:\r?\n|$))*)/gm,(_,kind,collapsed,title,body)=>{
    const inner=body.replace(/^> ?/gm,''); const html=`<details class="callout"${collapsed?'':' open'}><summary>${escape(title.trim()||kind)}</summary>${render(inner)}</details>`;
    blocks.push(html);return `\n\nCALLBLOCK${blocks.length-1}END\n\n`;
  });
  return md.render(text).replace(/<p>CALLBLOCK(\d+)END<\/p>/g,(_,i)=>blocks[Number(i)]);
}
for(const item of [...chapters,...clusters,...points,...extras]) item.html=render(item.markdown);
for(const c of chapters){c.pointIds=points.filter(p=>p.chapter===c.id).map(p=>p.id);c.labId={1:'build',2:'types',3:'expressions',4:'control',5:'calls',6:'arrays',7:'pointers',8:'strings',9:'formats',10:'parse',11:'bits',12:'sort',13:'calls',14:'struct',15:'resources',16:'resources',17:'streams',18:'math',19:'build'}[c.id];}
const questions=[];
for(const file of ['questions-a.mjs','questions-b.mjs']) {
  const p=path.join(root,'scripts',file);
  if(fs.existsSync(p)){
    const module=await import(pathToFileURL(p).href);
    const subset=process.argv.includes('--allow-partial')?points.filter(pnt=>new RegExp(`^${pnt.id}[§¦]`,'m').test(fs.readFileSync(p,'utf8'))):points;
    questions.push(...await module.createQuestions(subset));
  }
  else if(!process.argv.includes('--allow-partial')) throw new Error(`Missing ${file}`);
}
if(!process.argv.includes('--allow-partial') && questions.length!==2128)throw new Error(`Expected 2128 exercises, got ${questions.length}`);
const pointsWithTables = new Set(points.filter(point => point.html.includes('<table>')).map(point => point.id));
for (const question of questions) {
  const authored = interactiveQuestions.get(question.id);
  if (authored) Object.assign(question, authored);
  else if (pointsWithTables.has(question.pointId)) question.sourceTable = true;
}
for(const point of points)point.search=`${point.id} ${point.title} ${point.markdown}`.toLowerCase().replace(/\s+/g,' ');
const drillQuestions=loadDrillQuestions(root,points);
for (const question of drillQuestions) {
  if (pointsWithTables.has(question.id)) question.sourceTable = true;
}
const data={version:1,title:'C 微实验室',standard:'C23',sourceHash:crypto.createHash('sha256').update(raw).digest('hex'),chapters,clusters,points,extras,questions,drillQuestions,counts:{chapters:chapters.length,clusters:clusters.length,points:points.length,questions:questions.length,drillQuestions:drillQuestions.length,diagrams:diagramCount}};
const json = JSON.stringify(data);
fs.writeFileSync(path.join(root,'content','library.json'),json);
const readSource = file => fs.readFileSync(path.join(root,'src',file),'utf8');
const scripts = ['engine.js','drill.js','labs.js','progress.js','storage.js','app.js','bootstrap.js']
  .map(readSource).join('\n;\n');
const css = readSource('style.css');
const shell = readSource('shell.html');
const html = shell
  .replace('<!-- STYLE -->', () => `<style>${css}</style>`)
  .replace('<!-- DATA -->', () => `<script type="application/json" id="library-data">${json.replaceAll('<','\\u003c')}</script>`)
  .replace('<!-- SCRIPT -->', () => `<script>${scripts.replace(/<\/script/gi,'<\\/script')}</script>`);
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
fs.writeFileSync(path.join(root,'dist','C-Lab.html'),html);

const web = shell
  .replace('<!-- STYLE -->', '<link rel="stylesheet" href="./style.css">')
  .replace('<!-- DATA -->', '')
  .replace('<!-- SCRIPT -->', '<script defer src="./app.js"></script>');
const webDir = path.join(root, 'dist-cloud');
fs.mkdirSync(webDir, { recursive: true });
for (const [filename, body] of Object.entries({ 'index.html': web, 'style.css': css, 'app.js': scripts, 'library.json': json })) {
  fs.writeFileSync(path.join(webDir, filename), body);
}
console.log(JSON.stringify({...data.counts,bytes:Buffer.byteLength(html),sourceHash:data.sourceHash},null,2));
