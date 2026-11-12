import type { AnswerValue, Attempt, Draft, Evidence, Exercise, Grade, PointProgress, Progress, QuestionRef, RoundAnswer, Scope } from './types.ts';

export const DAY=86400000, intervals=[1,3,7,14];
const LAB_IDS=new Set(['build','types','expressions','control','calls','arrays','pointers','strings','formats','parse','bits','sort','struct','resources','streams','math']);
export function day(time=Date.now()){const d=new Date(time);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function nextDay(time=Date.now()){const d=new Date(time);d.setHours(0,0,0,0);d.setDate(d.getDate()+1);return d.getTime();}
export function fresh(): Progress {return {schemaVersion:1,updatedAt:Date.now(),points:{},history:[],labs:{},settings:{reduceMotion:false,textSize:1},session:null,lastPoint:null,rounds:0};}
// C names, character literals and printed text are case-sensitive.
export function normalize(v: unknown){return String(v).trim().replace(/\r\n/g,'\n').replace(/[，、]/g,',').replace(/[（]/g,'(').replace(/[）]/g,')').replace(/[；]/g,';').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/\s+/g,' ');}
export function grade(q: Exercise, value: unknown){
  if(value===null||value===undefined||typeof value==='boolean'||typeof value==='object'&&!Array.isArray(value))return false;
  if(q.kind==='choice')return (typeof value==='number'||typeof value==='string'&&/^\d+$/.test(value.trim()))&&Number.isInteger(Number(value))&&Number(value)>=0&&Number(value)<q.options.length&&Number(value)===Number(q.answer);
  if(q.kind==='order'||q.kind==='match')return Array.isArray(value)&&JSON.stringify(value)===JSON.stringify(q.answer);
  if(typeof value!=='number'&&typeof value!=='string')return false;
  return (Array.isArray(q.answer)?q.answer:[q.answer]).some(a=>normalize(a)===normalize(value));
}
export function getEvidence(state: Progress, id: number){const p=state.points[id];return !p?'未练习':p.needsWork?'待巩固':p.transfer?'迁移通过':p.base?'独立通过':'辅助完成';}
export function record(state: Progress, q: QuestionRef, {correct,assisted=false,skipped=false}: Partial<Grade>, now=Date.now()): Attempt{
  const p=state.points[q.pointId]??={base:null,transfer:null,attempts:0,reviewStep:0,due:now,needsWork:false};
  const today=day(now);
  // Reopening a question after seeing its answer today is still assisted practice.
  const exposedToday=state.history.some(h=>h.questionId===q.id&&day(h.time)===today&&(!h.correct||h.assisted||h.skipped));
  const entry={questionId:q.id,pointId:q.pointId,stage:q.stage,correct:correct===true&&!skipped,assisted:!!assisted||!!skipped||exposedToday,skipped:!!skipped,time:now};
  p.attempts++;p.last=now;
  if(!entry.correct||entry.assisted||entry.skipped){p.needsWork=true;p.reviewStep=0;p.due=now;}
  else{
    p.needsWork=false;
    if(q.stage==='a'&&!p.base){p.base={time:now,day:today};p.due=nextDay(now);}
    else if(q.stage==='b'&&p.base&&today>p.base.day){
      const alreadyReviewedToday=p.reviewDay===today||!!p.transfer&&state.history.some(h=>h.pointId===q.pointId&&h.stage==='b'&&h.correct&&!h.assisted&&!h.skipped&&day(h.time)===today);
      // Extra practice cannot advance the spaced-repetition schedule before it is due.
      if(!p.transfer||p.due<=now&&!alreadyReviewedToday){
        p.transfer??={time:now,day:today};
        p.due=now+intervals[Math.min(p.reviewStep,3)]*DAY;p.reviewStep=Math.min(p.reviewStep+1,3);p.reviewDay=today;
      }
    }else if(q.stage==='b'&&!p.base){p.due=now;}else p.due=Math.max(p.due,nextDay(now));
  }
  const attempt = q.revision ? {...entry,revision:q.revision} : entry;
  state.history.push(attempt);state.updatedAt=now;return attempt;
}
function chooseQuestion(state: Progress, point: {id: number}, questions: QuestionRef[], now: number){const p=state.points[point.id];const stage=p?.base&&day(now)>p.base.day?'b':'a';return questions.find(q=>q.pointId===point.id&&q.stage===stage);}
export function queue(state: Progress, points: {id: number; chapter: number}[], questions: QuestionRef[], {chapter=null,pointId=null,now=Date.now()}: Scope & {now?: number}={}){
  const allowed=points.filter(p=>(!chapter||p.chapter===chapter)&&(!pointId||p.id===pointId));
  const due=allowed.filter(p=>state.points[p.id]&&state.points[p.id].due<=now).sort((a,b)=>Number(state.points[b.id].needsWork)-Number(state.points[a.id].needsWork)||state.points[a.id].due-state.points[b.id].due);
  const unseen=allowed.filter(p=>!state.points[p.id]);
  if(!chapter&&!pointId&&!state.history.length){const rank=new Map([[38,0],[215,1],[765,2]]);unseen.sort((a,b)=>(rank.get(a.id)??3)-(rank.get(b.id)??3)||a.id-b.id);}
  const chosen=[...due.slice(0,2),...unseen.slice(0,1)];
  const unique=new Set(chosen.map(p=>p.id));
  for(const p of [...due.slice(2),...unseen.slice(1)])if(chosen.length<3&&!unique.has(p.id)){chosen.push(p);unique.add(p.id);}
  // Extra rounds can repeat completed points; record() does not grant premature spacing credit.
  for(const p of allowed.sort((a,b)=>(state.points[a.id]?.last||0)-(state.points[b.id]?.last||0)))if(chosen.length<Math.min(3,allowed.length)&&!unique.has(p.id)){chosen.push(p);unique.add(p.id);}
  return chosen.map(p=>chooseQuestion(state,p,questions,now)).filter(q => q !== undefined).map(q=>q.id);
}
export function isObject(v: unknown): v is Record<string, unknown>{return v!==null&&typeof v==='object'&&!Array.isArray(v);}
function isTime(v: unknown): v is number{return typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=8640000000000000;}
function isDay(v: unknown): v is string{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const [y,m,d]=v.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));return y>=1000&&date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;}
export function validateImport(value: unknown, pointIds: number[], questionIds: string[]): Progress{
  function fail(message: string): never { throw Error(message); }
  if(!isObject(value)||value.schemaVersion!==1||!isObject(value.points)||!Array.isArray(value.history)||value.history.length>200000)fail('这不是受支持的进度文件（需要版本 1）。');
  const validPoints=new Set(pointIds.map(String)),validQuestions=new Set(questionIds),clean=fresh();
  if (isTime(value.updatedAt)) clean.updatedAt = value.updatedAt;
  const questionMatches=(id: unknown, pointId: unknown, stage?: unknown): id is string=>{if(typeof id !== "string" || !validQuestions.has(id))return false;const match=/^p(\d+)-([ab])$/.exec(id);return !match||(String(Number(match[1]))===String(pointId)&&(!stage||match[2]===stage));};
  const evidence=(raw: unknown): Evidence | null=>{if(raw===null||raw===undefined)return null;if(!isObject(raw)||!isTime(raw.time)||!isDay(raw.day))fail('作答证据格式无效。');return {time:raw.time,day:raw.day};};
  for(const [id,p] of Object.entries(value.points)){
    if(!validPoints.has(id)||!isObject(p)||typeof p.attempts !== "number"||!Number.isSafeInteger(p.attempts)||p.attempts<0||!isTime(p.due)||typeof p.needsWork!=='boolean'||typeof p.reviewStep !== "number"||!Number.isInteger(p.reviewStep)||p.reviewStep<0||p.reviewStep>3)fail('进度中存在无效知识点记录。');
    const base=evidence(p.base),transfer=evidence(p.transfer);
    if(transfer&&(!base||transfer.day<=base.day||transfer.time<base.time))fail('迁移证据需要有先前日期的基础记录。');
    const point: PointProgress={base,transfer,attempts:p.attempts,reviewStep:p.reviewStep,due:p.due,needsWork:p.needsWork};
    if(p.last!==undefined){if(!isTime(p.last))fail('知识点最后练习时间无效。');point.last=p.last;}
    if(p.reviewDay!==undefined){if(!isDay(p.reviewDay))fail('复习日期格式无效。');point.reviewDay=p.reviewDay;}
    clean.points[Number(id)]=point;
  }
  clean.history=value.history.map((item: unknown): Attempt=>{
    if(!isObject(item)||!validPoints.has(String(item.pointId))||!questionMatches(item.questionId,item.pointId,item.stage)||item.stage!=='a'&&item.stage!=='b'||!isTime(item.time)||typeof item.correct!=='boolean'||typeof item.assisted!=='boolean'||typeof item.skipped!=='boolean'||item.skipped&&item.correct)fail('作答历史格式无效。');
    const revision = typeof item.revision === 'string' && /^[a-f0-9]{24}$/.test(item.revision) ? item.revision : undefined;
    return {questionId:item.questionId,pointId:Number(item.pointId),stage:item.stage,correct:item.correct,assisted:item.assisted||item.skipped,skipped:item.skipped,time:item.time,...(revision ? {revision} : {})};
  });
  if(value.labs!==undefined&&!isObject(value.labs))fail('实验记录格式无效。');
  for(const [id,time] of Object.entries(value.labs||{})){if(!LAB_IDS.has(id)||!isTime(time))fail('实验记录格式无效。');clean.labs[id]=time;}
  if(value.settings!==undefined&&!isObject(value.settings))fail('设置格式无效。');
  clean.settings={reduceMotion:!!value.settings?.reduceMotion,textSize:typeof value.settings?.textSize === "number" && [1,1.1,1.2].includes(value.settings.textSize)?value.settings.textSize:1};
  if(value.rounds!==undefined&&(typeof value.rounds !== "number"||!Number.isSafeInteger(value.rounds)||value.rounds<0))fail('完成轮次格式无效。');
  clean.rounds=value.rounds||0;
  if(value.session!==null&&value.session!==undefined){
    const s=value.session;
    if(!isObject(s)||!Array.isArray(s.queue)||!s.queue.length||s.queue.length>3||!s.queue.every((id: unknown): id is string=>typeof id === "string" && validQuestions.has(id))||new Set(s.queue).size!==s.queue.length||typeof s.index !== "number"||!Number.isInteger(s.index)||s.index<0||s.index>s.queue.length||!Array.isArray(s.answers)||s.answers.length!==s.index||!isObject(s.current)||!isTime(s.started))fail('未完成轮次格式无效。');
    const sessionQueue = s.queue;
    const answers=s.answers.map((item: unknown,i): RoundAnswer=>{
      if(!isObject(item)||item.questionId!==sessionQueue[i]||!validPoints.has(String(item.pointId))||!questionMatches(item.questionId,item.pointId)||typeof item.correct!=='boolean'||typeof item.assisted!=='boolean'||typeof item.skipped!=='boolean'||item.skipped&&item.correct)fail('轮次作答记录格式无效。');
      return {questionId:item.questionId,pointId:Number(item.pointId),correct:item.correct,assisted:item.assisted||item.skipped,skipped:item.skipped};
    });
    const c=s.current;
    if(typeof c.assisted!=='boolean'||typeof c.submitted!=='boolean'||typeof c.everWrong!=='boolean'||c.showHint!==undefined&&typeof c.showHint!=='boolean'||c.correct!==undefined&&typeof c.correct!=='boolean'||c.skipped!==undefined&&typeof c.skipped!=='boolean'||c.submitted&&(typeof c.correct!=='boolean'||typeof c.skipped!=='boolean'))fail('当前题目的进度格式无效。');
    if(c.value!==null&&!(typeof c.value==='string'&&c.value.length<=20000)&&!(typeof c.value==='number'&&Number.isFinite(c.value))&&!(Array.isArray(c.value)&&c.value.length<=12&&c.value.every(v=>v===null||Number.isInteger(v)&&v>=0&&v<100)))fail('当前答案格式无效。');
    if(c.skipped&&c.correct)fail('跳过的题目不能记为正确作答。');
    const current: Draft={value:c.value as AnswerValue,assisted:c.assisted||c.everWrong||!!c.showHint||!!c.skipped,submitted:c.submitted,everWrong:c.everWrong};
    for(const key of ['correct','skipped','showHint'] as const)if(typeof c[key] === 'boolean')current[key]=c[key];
    const scope: Scope={};
    if(s.scope!==undefined&&!isObject(s.scope))fail('轮次范围格式无效。');
    if(s.scope?.chapter!==undefined&&s.scope.chapter!==null){if(typeof s.scope.chapter !== "number"||!Number.isInteger(s.scope.chapter)||s.scope.chapter<1||s.scope.chapter>19)fail('轮次章节无效。');scope.chapter=s.scope.chapter;}
    if(s.scope?.pointId!==undefined&&s.scope.pointId!==null){if(!validPoints.has(String(s.scope.pointId)))fail('轮次知识点无效。');scope.pointId=Number(s.scope.pointId);}
    clean.session={queue:s.queue.slice(),index:s.index,answers,current,scope,started:s.started};
  }
  clean.lastPoint=validPoints.has(String(value.lastPoint))?Number(value.lastPoint):null;
  return clean;
}
