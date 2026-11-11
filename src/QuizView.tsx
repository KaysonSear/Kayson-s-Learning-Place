import * as engine from './engine.ts';
import { Button, Explanation, Prose, focus } from './ui.tsx';
import type { AnswerValue, Draft, Point, Progress, Question, Scope, Session } from './types.ts';

export function emptyDraft(): Draft {
  return {value: null, assisted: false, submitted: false, everWrong: false};
}

function QuizInput({question: q, draft: c, setValue, submit}: {
  question: Question; draft: Draft; setValue: (value: AnswerValue) => void; submit: () => void;
}) {
  const chosen = Array.isArray(c.value) ? c.value : [];
  if (q.kind === 'choice') return <div className="choice-list" role="group" aria-label="选择答案">
    {q.options.map((option, i) => {
      const selected = c.value !== null && Number(c.value) === i;
      return <button key={option} type="button" className={['choice', selected && 'selected', c.submitted && (i === q.answer ? 'correct' : selected && 'wrong')].filter(Boolean).join(' ')}
        data-action="choose" data-index={i} aria-pressed={selected} disabled={c.submitted} onClick={() => setValue(i)}>
        <span className="choice-key">{String.fromCharCode(65 + i)}</span><span>{option}</span>
      </button>;
    })}
  </div>;
  if (q.kind === 'order') {
    function select(next: (number | null)[]) {
      setValue(next);
      requestAnimationFrame(() => document.querySelector<HTMLElement>('#answer-form [data-action=seq-add]:not(:disabled), #answer-form button[type=submit]')?.focus({preventScroll: true}));
    }
    return <div className="quiz-order">
      <p className="subline">依次点选，组成执行顺序。</p>
      <ol className="chosen-sequence" aria-label="当前顺序">{chosen.map((i, index) => <li key={index}><code>{i === null ? '' : q.options[i]}</code></li>)}</ol>
      {!c.submitted && <>
        <div className="choice-list" role="group" aria-label="可排列的步骤">{q.options.map((option, i) =>
          <button key={option} type="button" className="choice" data-action="seq-add" data-index={i} disabled={chosen.includes(i)} onClick={() => select([...chosen, i])}><code>{option}</code></button>)}
        </div><button className="text-button" data-action="seq-undo" type="button" disabled={!chosen.length} onClick={() => select(chosen.slice(0, -1))}>撤回上一步</button>
      </>}
    </div>;
  }
  if (q.kind === 'match') return <div className="quiz-match" role="group" aria-label="选择对应类型">
    {q.items.map((label, i) => <label key={label} className="match-row"><code>{label}</code><select data-match={i} disabled={c.submitted} value={chosen[i] ?? ''} onChange={event => {
      const selection = event.target.value;
      setValue(q.items.map((_, index) => index === i ? (selection === '' ? null : Number(selection)) : chosen[index] ?? null));
    }}><option value="">选择类型</option>{q.options.map((option, j) => <option key={option} value={j}>{option}</option>)}</select></label>)}
  </div>;
  return <><label className="sr-only" htmlFor="answer-input">输入你的答案</label>
    <textarea className="answer-input" id="answer-input" rows={2} spellCheck={false} autoComplete="off"
      placeholder="输入结果、类型或题目要求的短答案" disabled={c.submitted} value={String(c.value ?? '')}
      onChange={event => setValue(event.target.value)} onKeyDown={event => {
        if (event.ctrlKey && event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          submit();
        }
      }} />
    <small style={{display:'block', marginTop:8}}>按题目要求作答。Ctrl + Enter 提交。</small></>;
}

function answerText(q: Question) {
  if (q.kind === 'order') return q.answer.map(i => q.options[i]).join('\n');
  if (q.kind === 'match') return q.answer.map((v, i) => q.items[i] + '  →  ' + q.options[v]).join('\n');
  return q.kind === 'choice' ? q.options[q.answer] : Array.isArray(q.answer) ? q.answer.join(' / ') : q.answer;
}

export function QuizView({progress, questions, points, edit, start, toast}: {
  progress: Progress; questions: ReadonlyMap<string, Question>; points: ReadonlyMap<number, Point>;
  edit: (change: (next: Progress) => void) => void;
  start: (scope?: Scope) => void;
  toast: (message: string) => void;
}) {
  const session = progress.session;
  const q = session && questions.get(session.queue[session.index]);
  if (!session) return <div className="empty"><h1>从三题开始。</h1><p style={{margin:'18px 0 24px'}}>先预测，再验证。什么时候开始都可以。</p><Button className="primary" data-action="start" onClick={() => start()}>开始 3 题</Button></div>;
  if (session.index >= session.queue.length) return <FinishRound session={session} points={points} start={start} end={() => {
    edit(next => { next.session = null; });
    location.hash = 'home';
  }} />;
  if (!q) return null;

  const c = session.current;
  const point = points.get(q.pointId);
  const past = progress.history.some(attempt => attempt.questionId === q.id);
  function patch(draft: Partial<Draft>) {
    edit(next => { if (next.session) Object.assign(next.session.current, draft); });
  }
  function submit(skip = false) {
    if (!q || c.submitted) return;
    if (!skip && (q.kind === 'order' || q.kind === 'match') && (!Array.isArray(c.value) || c.value.length !== q.answer.length || c.value.some(value => value === null))) {
      toast('把剩下的项也选好，再确认。');
      return;
    }
    if (!skip && (c.value === null || String(c.value).trim() === '')) {
      toast('先选一个答案，或写下你的判断。');
      return;
    }
    edit(next => {
      const draft = next.session?.current;
      if (!draft || draft.submitted) return;
      const entry = engine.record(next, q, {correct: !skip && engine.grade(q, draft.value), assisted: draft.assisted || draft.everWrong, skipped: skip});
      Object.assign(draft, {submitted: true, correct: entry.correct, skipped: skip, assisted: entry.assisted, everWrong: draft.everWrong || !entry.correct});
    });
    focus('question-feedback');
  }
  function advance() {
    if (!q) return;
    edit(next => {
      const s = next.session;
      if (!s?.current.submitted) return;
      s.answers.push({questionId: q.id, pointId: q.pointId, correct: !!s.current.correct, assisted: s.current.assisted, skipped: !!s.current.skipped});
      s.index++;
      s.current = emptyDraft();
      if (s.index === s.queue.length) next.rounds++;
    });
  }
  return <>
    <div className="session-top"><div className="session-dots" aria-label={'第 ' + (session.index + 1) + ' 题，共 ' + session.queue.length + ' 题'}>
      {session.queue.map((id, i) => <i key={id} className={i < session.index ? 'done' : i === session.index ? 'current' : ''} />)}
      <span style={{marginLeft:8}}>{session.index + 1} / {session.queue.length}</span></div><a className="text-button" href="#home">暂停，稍后继续</a></div>
    <div className="question-layout"><section className="question-main">
      <div className="question-meta"><span>{q.stage === 'b' ? '迁移检验' : '基础检验'}</span>{past && !c.submitted && <span>同题复习</span>}{c.assisted && <span>本题已使用辅助</span>}</div>
      <h1 id="question-prompt">{q.prompt}</h1>{q.code && <pre className="question-code"><code>{q.code}</code></pre>}
      <form key={q.id} id="answer-form" aria-labelledby="question-prompt" onSubmit={event => { event.preventDefault(); submit(); }}>
        <QuizInput question={q} draft={c} setValue={value => patch({value})} submit={submit} />
        {!c.submitted && <div className="question-actions"><Button type="submit" className="primary">确认判断</Button>
          <button type="button" className="text-button" data-action="hint" onClick={() => patch({assisted:true, showHint:true})}>给我一点提示</button>
          <button type="button" className="text-button" data-action="skip" onClick={() => submit(true)}>这题先跳过</button></div>}
      </form>
      {c.showHint && <div className="hint-box" role="note"><strong>一点提示</strong><p>{q.hint || '先区分对象、类型与行为边界。'}</p></div>}
      {c.submitted && <section className={c.correct ? 'feedback' : 'feedback wrong'} id="question-feedback" tabIndex={-1}>
        <h2>{c.skipped ? '先留个记号。' : c.correct ? c.assisted ? '订正完成。' : '这一步，判断正确。' : '找到一个可以补上的地方。'}</h2>
        {!c.correct && <><p>参考答案</p><div className="answer">{answerText(q)}</div></>}
        <Explanation question={q} point={point} />
        <small>{c.assisted || !c.correct ? '本题已记为待巩固，不计入独立通过。' : q.stage === 'b' ? '基础检验与隔日迁移共同构成掌握证据。' : '基础证据已记录，迁移检验至少隔日安排。'}</small>
        <div className="button-row"><Button className="primary" data-action="next" onClick={advance}>{session.index + 1 === session.queue.length ? '完成这一轮' : '下一题'}</Button>
          {!c.correct && !c.skipped && <Button data-action="retry" onClick={() => patch({submitted:false, assisted:true, value:null})}>再试一次</Button>}
          {point && <a className="text-button" href={'#point-' + point.id}>查看原文与出处</a>}</div>
        {point && <details className="source-details"><summary>原文：{point.title}（#{point.id}）</summary><Prose html={point.html} /></details>}
      </section>}
    </section><aside className="question-side"><h2>把这一步想清楚。</h2><p>先给出你自己的判断，再看解释。<br />暂时想不起来，也可以用提示。</p><p style={{marginTop:16}}>没有倒计时。<br />中断的位置会自动保留。</p></aside></div>
  </>;
}

function FinishRound({session, points, start, end}: {
  session: Session; points: ReadonlyMap<number, Point>; start: (scope: Scope) => void; end: () => void;
}) {
  return <section className="round-finish">
    <div className="finish-mark" aria-hidden="true">✓</div><p className="eyebrow">这一轮，已经完成。</p><h1>向前了一小步。</h1>
    <p className="subline">完成 {session.queue.length} 题，其中 {session.answers.filter(a => a.correct && !a.assisted).length} 题独立通过。<br />停在这里，也是一轮完整的学习。</p>
    <div className="round-results">{session.answers.map(a => <div className="round-result" key={a.questionId}>
      <span style={{color:a.correct && !a.assisted ? 'var(--green)' : 'var(--red)'}}>{a.correct && !a.assisted ? '✓' : '↻'}</span>
      <a href={'#point-' + a.pointId}>{points.get(a.pointId)?.title}</a><span>{a.skipped ? '留待下次' : a.assisted ? '辅助完成' : a.correct ? '独立通过' : '待巩固'}</span></div>)}</div>
    <div className="button-row"><Button className="primary" data-action="end-round" onClick={end}>到这里，回到今天</Button><Button data-action="another-round" onClick={() => start(session.scope)}>再来 3 题</Button></div>
    <p className="hero-note">答错的地方会回到复习队列。无需现在全部解决。</p>
  </section>;
}
