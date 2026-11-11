import { useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { catalog, getLab } from './labs.ts';
import type { Progress } from './types.ts';

export function LabList({progress}: {progress: Progress}) {
  return <>
    <div className="section-head"><div><h1>自由实验</h1><p>把抽象规则，变成能亲手操作的东西。</p></div></div>
    <p className="model-note">每个工作台都有明确的教学模型与输入范围。你可以单步、重置、尝试边界；这里不编译任意 C 程序。</p>
    <div className="lab-list">{catalog.map((lab, i) => <article className="lab-card" key={lab.id}><span className="lab-index">{String(i + 1).padStart(2, '0')}</span><div><h2>{lab.title}</h2><p>{lab.summary}</p>
      <a className="button secondary small" href={'#lab-' + lab.id}>开始实验</a>{progress.labs[lab.id] && <span className="lab-completed">✓ 挑战已完成</span>}
      <small style={{display:'block', marginTop:12}}>对应第 {lab.chapters.map(c => String(c).padStart(2, '0')).join('、')} 章</small>
    </div></article>)}</div>
  </>;
}

export function LabView({lab, complete}: {lab: NonNullable<ReturnType<typeof getLab>>; complete: (id: string) => void}) {
  const [run, setRun] = useState<Pick<ReturnType<typeof lab.start>, "act" | "view">>(() => lab.start());
  const [status, setStatus] = useState({message:'先读目标，再选择一个操作。每一步由你推进。', finished:false});
  const bench = useRef<HTMLDivElement>(null);

  function operate(event: MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element && event.target.closest<HTMLButtonElement>('[data-lab-action]');
    if (!target || !bench.current?.contains(target)) return;
    const {labAction: action, value} = target.dataset;
    if (!action) return;
    if (action === 'reset') {
      setRun(lab.start());
      setStatus({message:'已重置。可以换一种操作路径再试。', finished:false});
    } else {
      const result = run.act(action, value);
      if (result.success && !status.finished) complete(lab.id);
      setStatus({message: result.message, finished: status.finished || result.success});
    }
    requestAnimationFrame(() => {
      const current = bench.current;
      if (!current) return;
      const buttons = [...current.querySelectorAll<HTMLButtonElement>('[data-lab-action]')];
      const same = buttons.find(button => button.dataset.labAction === action && button.dataset.value === value);
      (same ?? current.querySelector<HTMLButtonElement>('.lab-controls button') ?? buttons[0])?.focus({preventScroll:true});
    });
  }

  return <>
    <div className="lab-heading"><a className="text-button" href="#labs">全部实验</a><h1>{lab.title}</h1><p className="subline">{lab.summary}</p></div>
    <div id="lab-root" ref={bench} onClick={operate}><section className="lab-workbench" aria-label={lab.title}>
      <div className="lab-toolbar"><div><h2>{lab.title}</h2><p>{lab.summary}</p></div><button type="button" data-lab-action="reset">重置实验</button></div>
      <p className="lab-goal"><strong>目标：</strong>{lab.goal}</p><details className="lab-assumptions"><summary>模型假设与适用范围</summary><p>{lab.assumptions}</p></details>
      <div className="lab-canvas">{run.view()}</div>
      <p className={status.finished ? 'lab-status complete' : 'lab-status'} role="status" aria-live="polite">{status.message}</p>
      <p className="lab-footnote">这是限定范围的教学模拟。完成实验记录实验印记；知识点掌握仍由独立练习与迁移复测验证。</p>
    </section></div>
    <div className="button-row" style={{borderTop:'1px solid var(--line)', paddingTop:24, marginTop:28}}>{lab.chapters.map(c => <a key={c} className="text-button" href={'#chapter-' + c}>回看第 {String(c).padStart(2, '0')} 章</a>)}</div>
  </>;
}
