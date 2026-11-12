import { useState } from 'react';
import { DrillCard, nextStreak, streakNote } from './DrillView.tsx';
import type { Review, ReviewResult } from './DrillView.tsx';
import { CLEAR_STREAK, pickMistake } from './mistakes.ts';
import { Button, focus } from './ui.tsx';
import type { DrillQuestion, Point } from './types.ts';

export function MistakesView({book, bank, points, review}: {
  book: ReadonlyMap<number, number>;
  bank: ReadonlyMap<number, DrillQuestion>;
  points: ReadonlyMap<number, Point>;
  review: Review;
}) {
  const [current, setCurrent] = useState<{id: number; result?: ReviewResult} | null>(null);
  const [cleared, setCleared] = useState(0);
  const question = current && bank.get(current.id);

  function pick(exclude?: number) {
    const id = pickMistake(book, exclude);
    setCurrent(id === undefined ? null : {id});
    focus(id === undefined ? 'mistakes-title' : 'drill-prompt');
  }

  if (question && current) {
    const result = current.result;
    const remaining = book.size;
    return <section className="drill" aria-labelledby="mistakes-title">
      <div className="section-head"><h1 id="mistakes-title" tabIndex={-1}>错题专项</h1><button type="button" className="text-button" data-action="mistakes-stop" onClick={() => { setCurrent(null); focus('mistakes-title'); }}>结束练习</button></div>
      <p className="drill-stats">错题本剩余 {remaining} 道 · 本次已移出 {cleared} 道 · 每道题连续答对 {CLEAR_STREAK} 次移出</p>
      <DrillCard question={question} points={points} selected={result?.choice} recorded={result?.answer}
        eyebrow={<>第 {question.id} 题 · 已连续答对 {book.get(question.id) ?? (result?.streak === null ? CLEAR_STREAK : 0)} / {CLEAR_STREAK}</>}
        note={result && streakNote(result.streak)}
        nextLabel={remaining ? '下一题' : '完成'}
        choose={index => {
          const streak = nextStreak(book, question.id, index === question.answer);
          const answer = review(question.id, index);
          if (!answer) return;
          if (streak === null) setCleared(cleared + 1);
          setCurrent({id:question.id, result:{choice:index, answer, streak}});
          focus('drill-feedback');
        }}
        next={() => pick(question.id)} />
    </section>;
  }

  const entries = [...book].reverse();
  return <section className="mistakes" aria-labelledby="mistakes-title">
    <div className="section-head"><div><h1 id="mistakes-title" tabIndex={-1}>错题本</h1><p>刷题答错的题会自动收进来。在任何模式下连续答对 {CLEAR_STREAK} 次，才会移出。</p></div></div>
    {entries.length ? <>
      <div className="button-row"><Button className="primary" data-action="mistakes-start" onClick={() => { setCleared(0); pick(); }}>开始专项练习（{entries.length} 道）</Button><a className="button secondary" href="#drill">回到刷题</a></div>
      <div className="mistake-list">{entries.map(([id, streak]) => {
        const item = bank.get(id);
        return <a key={id} className="point-row" href={'#point-' + id} data-mistake={id}><span className="point-number">{String(id).padStart(3, '0')}</span>
          <span className="point-title">{item?.prompt ?? id}<small>{points.get(id)?.title}</small></span>
          <span className={'status-tag ' + (streak ? '' : 'work')}>连对 {streak} / {CLEAR_STREAK}</span></a>;
      })}</div>
    </> : <div className="empty"><h2>{cleared ? '错题本已清空。' : '错题本是空的。'}</h2><p>刷题时答错的题会出现在这里。</p><p style={{marginTop:18}}><a className="button primary" href="#drill">去刷题</a></p></div>}
  </section>;
}
