import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import * as drill from './drill.ts';
import { CLEAR_STREAK, MIX_EVERY, pickMistake } from './mistakes.ts';
import { Button, Explanation, focus } from './ui.tsx';
import type { DrillAnswer } from './cloud-types.ts';
import type { DrillMode, DrillQuestion, DrillRound, Point } from './types.ts';

/** Answers a mistake-book question outside the round; returns the recorded grade. */
export type Review = (questionId: number, choice: number) => DrillAnswer | undefined;
export interface ReviewResult { choice: number; answer: DrillAnswer; streak: number | null }

/** Streak after answering: 0 when wrong, null once the question leaves the book. */
export function nextStreak(book: ReadonlyMap<number, number>, id: number, correct: boolean) {
  if (!correct) return 0;
  const streak = (book.get(id) ?? 0) + 1;
  return streak >= CLEAR_STREAK ? null : streak;
}

export function streakNote(streak: number | null) {
  return streak === null ? '已连续答对 ' + CLEAR_STREAK + ' 次，移出错题本。' : streak === 0 ? '已加入错题本。连续答对 ' + CLEAR_STREAK + ' 次后移出。' : '错题本：已连续答对 ' + streak + ' / ' + CLEAR_STREAK + '。';
}

/** Where each question's correct option was last shown, so a reshuffle can move it elsewhere. */
const lastCorrectPosition = new Map<number, number>();

/** A fresh random option order for a repeat appearance, moving the correct option off its last position when possible. */
export function freshOrder(question: DrillQuestion) {
  let order = drill.displayOrder(question.options.length, crypto.randomUUID());
  for (let tries = 0; tries < 8 && order.indexOf(question.answer) === lastCorrectPosition.get(question.id); tries++) {
    order = drill.displayOrder(question.options.length, crypto.randomUUID());
  }
  return order;
}

export function DrillCard({question, order, eyebrow, selected, recorded, points, choose, next, nextLabel, note}: {
  question: DrillQuestion;
  order: number[];
  eyebrow: ReactNode;
  selected: number | undefined;
  recorded: DrillAnswer | undefined;
  points: ReadonlyMap<number, Point>;
  choose: (index: number) => void;
  next: () => void;
  nextLabel: string;
  note?: ReactNode;
}) {
  const graded = selected !== undefined;
  const passed = recorded?.correct ?? selected === question.answer;
  lastCorrectPosition.set(question.id, order.indexOf(question.answer));
  return <>
    <p className="eyebrow">{eyebrow}</p>
    <h2 className="drill-prompt" id="drill-prompt" tabIndex={-1}>{question.prompt}</h2>
    <div className="choice-list" role="group" aria-labelledby="drill-prompt">
      {order.map((index, position) => [index, question.options[index], position] as const).map(([index, option, position]) => <button key={option} type="button" className={'choice ' + (graded && index === question.answer ? 'correct ' : '') + (graded && index === selected && !passed ? 'wrong' : '')} data-drill-choice={index} disabled={graded} onClick={() => choose(index)}>
        <span className="choice-key">{String.fromCharCode(65 + position)}</span><span>{option}{graded && index === question.answer && ' ✓'}{graded && index === selected && '（你的答案）'}</span></button>)}
    </div>
    {graded && <section className={passed ? 'feedback' : 'feedback wrong'} id="drill-feedback" tabIndex={-1} onKeyDown={event => {
      if (event.key === 'Enter' && !event.repeat && event.target === event.currentTarget) {
        event.preventDefault();
        next();
      }
    }}>
      <h2>{passed ? '回答正确' : '回答错误'}</h2><p>正确答案 {recorded?.correctLabel ?? question.options[question.answer]}</p>
      {recorded && recorded.revision !== question.revision && <p>这次选择：{recorded.label}（按作答时的题目版本计分）</p>}
      {note && <p className="mistake-note" data-mistake-note>{note}</p>}
      <Explanation question={question} point={points.get(question.id)} />
      <div className="button-row"><a className="text-button" href={'#point-' + question.id}>查看原文</a><Button className="primary" id="drill-next" onClick={next}>{nextLabel}</Button></div>
    </section>}
  </>;
}

export function DrillView({round, bank, points, book, mix, setMix, save, review}: {
  round: DrillRound;
  bank: ReadonlyMap<number, DrillQuestion>;
  points: ReadonlyMap<number, Point>;
  book: ReadonlyMap<number, number>;
  mix: boolean;
  setMix: (mix: boolean) => void;
  save: (round: DrillRound, answered?: DrillAnswer) => void;
  review: Review;
}) {
  const [error, setError] = useState('');
  const [sinceMix, setSinceMix] = useState(0);
  const [interjection, setInterjection] = useState<{id: number; order: number[]; result?: ReviewResult} | null>(null);
  const [roundNote, setRoundNote] = useState<{id: number; streak: number | null} | null>(null);
  const number = useRef<HTMLInputElement>(null);
  const total = round.order.length;
  const answered = Object.keys(round.answers).length;
  const correct = Object.entries(round.answers).filter(([id, choice]) => round.answerInfo?.[Number(id)]?.correct ?? bank.get(Number(id))?.answer === choice).length;
  const mixing = mix && round.mode === 'random';
  const question = bank.get(round.current);
  if (!question) return null;
  const reviewQuestion = interjection && bank.get(interjection.id);
  const position = round.order.indexOf(question.id) + 1;

  function update(next: DrillRound, focusId: string, answered?: DrillAnswer) {
    setError('');
    if (number.current) number.current.value = '';
    save(next, answered);
    focus(focusId);
  }

  function advance() {
    const next = {...round};
    drill.next(next);
    setRoundNote(null);
    if (mixing && sinceMix >= MIX_EVERY && !next.finished) {
      const id = pickMistake(book, question?.id);
      const picked = id === undefined ? undefined : bank.get(id);
      if (picked) {
        setSinceMix(0);
        setInterjection({id:picked.id, order:freshOrder(picked)});
      }
    }
    update(next, next.finished ? 'drill-feedback' : 'drill-prompt');
  }

  const controls = <div className="drill-controls">
    <label>题序 <select id="drill-mode" value={round.mode} onChange={event => {
      const next = {...round};
      drill.changeMode(next, event.target.value as DrillMode);
      setInterjection(null);
      update(next, 'drill-mode');
    }}><option value="sequence">顺序</option><option value="random">随机</option></select></label>
    {round.mode === 'random' && <label className="mix-toggle"><input type="checkbox" id="drill-mix" checked={mix} onChange={event => {
      setMix(event.target.checked);
      if (!event.target.checked) setInterjection(null);
    }} /> 混入错题（{book.size}）</label>}
    <form id="drill-jump" noValidate onSubmit={event => {
      event.preventDefault();
      const text = number.current?.value.trim() ?? '';
      const next = {...round};
      if (!/^\d+$/.test(text) || !drill.jump(next, Number(text))) {
        setError('请输入 1 到 ' + total + ' 的整数题号。');
        number.current?.focus();
        return;
      }
      setInterjection(null);
      setRoundNote(null);
      update(next, 'drill-prompt');
    }}><label htmlFor="drill-number">跳到原题号</label><input ref={number} id="drill-number" type="text" inputMode="numeric" maxLength={8} placeholder={'1–' + total} aria-describedby="drill-error" aria-invalid={error ? true : undefined} /><Button type="submit">跳转</Button></form>
    <button className="text-button" type="button" id="drill-restart" onClick={() => {
      if (answered > 0 && answered < total && !window.confirm('重新开始会清除本轮刷题答案。确定重新开始？')) return;
      setInterjection(null);
      setRoundNote(null);
      update(drill.start(bank.keys(), round.mode), 'drill-prompt');
    }}>{answered === total ? '再刷一轮' : '重新开始'}</button>
  </div>;

  let body: ReactNode;
  if (reviewQuestion && interjection) {
    const result = interjection.result;
    body = <div className="mixed-review" data-mixed-review>
      <DrillCard question={reviewQuestion} order={interjection.order} points={points} selected={result?.choice} recorded={result?.answer}
        eyebrow={<>错题回顾 · 第 {reviewQuestion.id} 题 · 已连续答对 {book.get(reviewQuestion.id) ?? (result?.streak === null ? CLEAR_STREAK : 0)} / {CLEAR_STREAK}</>}
        note={result && streakNote(result.streak)} nextLabel="回到本轮"
        choose={index => {
          const streak = nextStreak(book, reviewQuestion.id, index === reviewQuestion.answer);
          const answer = review(reviewQuestion.id, index);
          if (answer) setInterjection({...interjection, result:{choice:index, answer, streak}});
          focus('drill-feedback');
        }}
        next={() => { setInterjection(null); focus('drill-prompt'); }} />
    </div>;
  } else if (round.finished) {
    body = <section className="feedback" tabIndex={-1} id="drill-feedback"><h2>本轮全部答完</h2><p>输入原题号可回看本轮答案。{book.size > 0 && <> 错题本里还有 {book.size} 道题，<a href="#mistakes">去专项练习</a>。</>}</p></section>;
  } else {
    const selected = round.answers[question.id];
    // Seeded by round: stable across reloads within a round, reshuffled whenever a new round starts.
    body = <DrillCard question={question} order={drill.displayOrder(question.options.length, (round.roundId ?? 'legacy') + ':' + question.id)} points={points} selected={selected} recorded={round.answerInfo?.[question.id]}
      eyebrow={<>第 {question.id} 题{round.mode === 'random' && (' · 随机位置 ' + position + ' / ' + total)}</>}
      note={roundNote?.id === question.id ? streakNote(roundNote.streak) : undefined}
      nextLabel={answered === total ? '查看本轮结果' : '下一题'}
      choose={index => {
        const next = {...round, answers: {...round.answers}, answerInfo: {...round.answerInfo}};
        if (!drill.answer(next, question, index)) return;
        const correctNow = next.answerInfo?.[question.id]?.correct ?? index === question.answer;
        if (!correctNow || book.has(question.id)) setRoundNote({id:question.id, streak:nextStreak(book, question.id, correctNow)});
        setSinceMix(sinceMix + 1);
        update(next, 'drill-feedback', next.answerInfo?.[question.id]);
      }}
      next={advance} />;
  }

  return <section className="drill" aria-labelledby="drill-title">
    <div className="section-head"><h1 id="drill-title">刷题</h1><a className="text-button" href="#mistakes">错题本 {book.size}</a></div>
    <p className="drill-stats">已答 {answered} / {total} · 答对 {correct} · 正确率 {answered ? Math.round(100 * correct / answered) + '%' : '—'}{mixing && book.size > 0 && ' · 每 ' + MIX_EVERY + ' 题混入 1 道错题'}</p>
    <progress className="drill-progress" value={answered} max={total} aria-label="刷题进度" />
    {controls}
    <p id="drill-error" role="alert">{error}</p>
    {body}
  </section>;
}
