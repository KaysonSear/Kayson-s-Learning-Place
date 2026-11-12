import { useRef, useState } from 'react';
import * as drill from './drill.ts';
import { Button, Explanation, focus } from './ui.tsx';
import type { DrillMode, DrillQuestion, DrillRound, Point } from './types.ts';

export function DrillView({round, bank, points, save}: {
  round: DrillRound;
  bank: ReadonlyMap<number, DrillQuestion>;
  points: ReadonlyMap<number, Point>;
  save: (round: DrillRound) => void;
}) {
  const [error, setError] = useState('');
  const number = useRef<HTMLInputElement>(null);
  const total = round.order.length;
  const answered = Object.keys(round.answers).length;
  const correct = Object.entries(round.answers).filter(([id, choice]) => round.answerInfo?.[Number(id)]?.correct ?? bank.get(Number(id))?.answer === choice).length;
  const question = bank.get(round.current);
  if (!question) return null;

  const selected = round.answers[question.id];
  const graded = selected !== undefined;
  const recorded = round.answerInfo?.[question.id];
  const passed = recorded?.correct ?? selected === question.answer;
  const position = round.order.indexOf(question.id) + 1;

  function update(next: DrillRound, focusId: string) {
    setError('');
    if (number.current) number.current.value = '';
    save(next);
    focus(focusId);
  }

  function advance() {
    const next = {...round};
    drill.next(next);
    update(next, next.finished ? 'drill-feedback' : 'drill-prompt');
  }

  return <section className="drill" aria-labelledby="drill-title">
    <div className="section-head"><h1 id="drill-title">刷题</h1><a className="text-button" href="#home">退出，稍后继续</a></div>
    <p className="drill-stats">已答 {answered} / {total} · 答对 {correct} · 正确率 {answered ? Math.round(100 * correct / answered) + '%' : '—'}</p>
    <progress className="drill-progress" value={answered} max={total} aria-label="刷题进度" />
    <div className="drill-controls">
      <label>题序 <select id="drill-mode" value={round.mode} onChange={event => {
        const next = {...round};
        drill.changeMode(next, event.target.value as DrillMode);
        update(next, 'drill-mode');
      }}><option value="sequence">顺序</option><option value="random">随机</option></select></label>
      <form id="drill-jump" noValidate onSubmit={event => {
        event.preventDefault();
        const text = number.current?.value.trim() ?? '';
        const next = {...round};
        if (!/^\d+$/.test(text) || !drill.jump(next, Number(text))) {
          setError('请输入 1 到 ' + total + ' 的整数题号。');
          number.current?.focus();
          return;
        }
        update(next, 'drill-prompt');
      }}><label htmlFor="drill-number">跳到原题号</label><input ref={number} id="drill-number" type="text" inputMode="numeric" maxLength={8} placeholder={'1–' + total} aria-describedby="drill-error" aria-invalid={error ? true : undefined} /><Button type="submit">跳转</Button></form>
      <button className="text-button" type="button" id="drill-restart" onClick={() => {
        if (answered > 0 && answered < total && !window.confirm('重新开始会清除本轮刷题答案。确定重新开始？')) return;
        update(drill.start(bank.keys(), round.mode), 'drill-prompt');
      }}>{answered === total ? '再刷一轮' : '重新开始'}</button>
    </div>
    <p id="drill-error" role="alert">{error}</p>
    {round.finished ? <section className="feedback" tabIndex={-1} id="drill-feedback"><h2>本轮全部答完</h2><p>输入原题号可回看本轮答案。</p></section> : <>
      <p className="eyebrow">第 {question.id} 题{round.mode === 'random' && (' · 随机位置 ' + position + ' / ' + total)}</p>
      <h2 className="drill-prompt" id="drill-prompt" tabIndex={-1}>{question.prompt}</h2>
      <div className="choice-list" role="group" aria-labelledby="drill-prompt">
        {question.options.map((option, index) => <button key={option} type="button" className={'choice ' + (graded && index === question.answer ? 'correct ' : '') + (graded && index === selected && !passed ? 'wrong' : '')} data-drill-choice={index} disabled={graded} onClick={() => {
          const next = {...round, answers: {...round.answers}, answerInfo: {...round.answerInfo}};
          if (drill.answer(next, question, index)) update(next, 'drill-feedback');
        }}><span className="choice-key">{String.fromCharCode(65 + index)}</span><span>{option}{graded && index === question.answer && ' ✓'}{graded && index === selected && '（你的答案）'}</span></button>)}
      </div>
      {graded && <section className={passed ? 'feedback' : 'feedback wrong'} id="drill-feedback" tabIndex={-1} onKeyDown={event => {
        if (event.key === 'Enter' && !event.repeat && event.target === event.currentTarget) {
          event.preventDefault();
          advance();
        }
      }}>
        <h2>{passed ? '回答正确' : '回答错误'}</h2><p>正确答案 {recorded?.correctLabel ?? question.options[question.answer]}</p>
        {recorded && recorded.revision !== question.revision && <p>这次选择：{recorded.label}（按作答时的题目版本计分）</p>}
        <Explanation question={question} point={points.get(question.id)} />
        <div className="button-row"><a className="text-button" href={'#point-' + question.id}>查看原文</a><Button className="primary" id="drill-next" onClick={advance}>{answered === total ? '查看本轮结果' : '下一题'}</Button></div>
      </section>}
    </>}
  </section>;
}
