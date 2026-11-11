import { Fragment, useState } from 'react';
import { getEvidence } from './engine.ts';
import { Button, Prose } from './ui.tsx';
import type { Chapter, Library, Point, Progress, Scope } from './types.ts';

const demo = [3, 1, 4, 2];

export function Home({library, progress, start, toast}: {library: Library; progress: Progress; start: () => void; toast: (message: string) => void}) {
  const [index, setIndex] = useState(0);
  const resume = progress.session && progress.session.index < progress.session.queue.length;
  const totals = stats(progress);
  return <>
    {resume && progress.session && <div className="resume-banner"><span>上次那一轮，停在第 {progress.session.index + 1} 题。可以从这里接着来。</span><a className="text-button" href="#quiz">继续</a></div>}
    <section className="hero">
      <div><p className="eyebrow">不用一次学完。只向前一点。</p><h1>今天，<br />只做三题。</h1><p className="subline">先猜一猜，再动手验证。<br />把看懂的 C，变成自己会用的 C。</p>
        <div className="button-row"><Button className="primary" data-action={resume ? 'resume' : 'start'} onClick={() => resume ? location.hash = 'quiz' : start()}>{resume ? '继续上次' : '开始 3 题'}</Button>
          <a className="button secondary" href="#drill">{progress.drill ? '继续刷题' : '刷题'}</a><a className="text-button" href="#knowledge">自己选一章</a></div><p className="hero-note">约 2–5 分钟 · 没有倒计时 · 随时可以停</p></div>
      <div className="hero-workbench"><div className="workbench-label"><span>摸一下指针</span><span>一个可操作的小模型</span></div><pre><code>{'int a[4] = { 3, 1, 4, 2 };\nint *p = a;\np++;'}</code></pre>
        <div id="hero-memory" className="hero-memory">{[...demo, '尾后'].map((value, i) => <div key={i} className={['hero-cell', i === index && 'selected', i === 4 && 'end'].filter(Boolean).join(' ')}>{value}<small>{i === 4 ? 'a + 4' : 'a[' + i + ']'}</small></div>)}</div>
        <div className="hero-lab-actions"><button type="button" className="text-button" data-action="hero-back" onClick={() => setIndex(Math.max(0, index - 1))}>退一步</button><Button className="secondary small" data-action="hero-next" onClick={() => index < 4 ? setIndex(index + 1) : toast('已经到达尾后位置，不能继续向前。')}>p++ 前进一步</Button></div>
        <p id="hero-feedback" className="hero-feedback" aria-live="polite">{index === 4 ? 'p 可以位于尾后，但不能解引用。再执行 p++ 会越出允许范围。' : '现在 p 指向 a[' + index + ']，*p 是 ' + demo[index] + '。图中每格代表一个 int 对象，步长不固定为 1 字节。'}</p>
      </div>
    </section>
    <section className="home-section"><div className="section-head"><h2>这一轮，很简单。</h2><small>{totals.due ? totals.due + ' 个知识点到了复习时间' : '从一个小问题开始'}</small></div>
      <div className="round-line">{[['先做判断','不用急着翻答案。'],['看到原因','错在哪里，具体说清楚。'],['带走一点能力','下次换个情境再验证。']].map(([title, copy], i) => <div key={title} className="round-step"><span>{i + 1}</span><div><strong>{title}</strong><p>{copy}</p></div></div>)}</div></section>
    <section className="home-section"><div className="section-head"><h2>或者，先动手。</h2><a className="text-button" href="#labs">全部实验</a></div>
      <div className="topic-list"><a className="topic-link" href="#lab-pointers"><span>指针往前一步，究竟移动了什么？</span><small>指针工作台 ↗</small></a><a className="topic-link" href="#lab-resources"><span>释放以后，另一个指针还能用吗？</span><small>资源维修台 ↗</small></a><a className="topic-link" href="#lab-calls"><span>递归返回时，谁在等着谁？</span><small>调用栈 ↗</small></a></div></section>
    <div className="home-stats"><span><strong>{library.points.length}</strong>知识点</span><span><strong>{library.questions.length}</strong>专属练习</span><span><strong>{totals.independent}</strong>独立通过</span><span><strong>{totals.transfer}</strong>迁移通过</span></div>
  </>;
}

function stats(progress: Progress) {
  const items = Object.values(progress.points);
  return {practiced: items.length, independent: items.filter(p => p.base).length,
    transfer: items.filter(p => p.transfer && !p.needsWork).length, due: items.filter(p => p.due <= Date.now()).length};
}

function EvidenceTag({progress, id}: {progress: Progress; id: number}) {
  const status = getEvidence(progress, id);
  return <span className={'status-tag ' + (status === '迁移通过' ? 'good' : status === '待巩固' ? 'work' : '')}>{status}</span>;
}

export function Knowledge({library, progress, params}: {library: Library; progress: Progress; params: URLSearchParams}) {
  const [chapter, setChapter] = useState(params.get('chapter') || 'all');
  const [query, setQuery] = useState(params.get('q') || '');
  const [limit, setLimit] = useState(70);
  const filter = params.get('filter') || 'all';
  const term = query.trim().toLowerCase();
  const matches = library.points.filter(p => (chapter === 'all' || p.chapter === Number(chapter)) && (!term || p.search.includes(term)) &&
    (filter === 'all' || filter === 'due' && (progress.points[p.id]?.due ?? Infinity) <= Date.now() ||
      filter === 'new' && !progress.points[p.id] || filter === 'transfer' && progress.points[p.id]?.transfer && !progress.points[p.id]?.needsWork));
  const groups = new Map<string, Point[]>();
  for (const p of matches.slice(0, limit)) {
    const group = groups.get(p.cluster);
    if (group) group.push(p); else groups.set(p.cluster, [p]);
  }
  return <>
    <div className="section-head"><div><h1>知识地图</h1><p>所有路径都开放。找到你现在需要的那一处。</p></div></div>
    <div className="toolbar"><label className="search-wrap"><span className="sr-only">搜索知识点与代码</span><input id="knowledge-search" type="search" placeholder="搜索知识、代码或编号，如：realloc" value={query} autoComplete="off" onChange={event => { setQuery(event.target.value); setLimit(70); }} /></label>
      <select id="chapter-filter" aria-label="按章节筛选" value={chapter} onChange={event => { setChapter(event.target.value); setLimit(70); }}><option value="all">全部 19 章</option>{library.chapters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
    <div className="filter-chips" aria-label="按学习状态筛选">{[['all','全部'],['due','待复习'],['new','未练习'],['transfer','迁移通过']].map(([v,label]) =>
      <button key={v} type="button" className={filter === v ? 'chip active' : 'chip'} data-action="filter" data-filter={v} aria-pressed={filter === v} onClick={() => {
        const next = new URLSearchParams({chapter, filter:v});
        if (query) next.set('q', query);
        location.hash = 'knowledge?' + next;
      }}>{label}</button>)}</div>
    <div id="knowledge-results"><p className="muted" style={{fontSize:11, marginBottom:16}}>找到 {matches.length} 个知识点{limit < matches.length && (' · 已显示 ' + limit + ' 个')}</p>
      {groups.size ? [...groups].map(([id, points]) => <section key={id} className="cluster-group"><h2>{library.clusters.find(c => c.id === id)?.title || id}</h2>
        {points.map(p => <a key={p.id} href={'#point-' + p.id} className="point-row"><span className="point-number">{String(p.id).padStart(3, '0')}</span><span className="point-title">{p.title}<small>{library.chapters.find(c => c.id === p.chapter)?.title.replace(/^\d+ /, '')}</small></span><EvidenceTag progress={progress} id={p.id} /></a>)}</section>) :
        <div className="empty"><h2>这里暂时没有知识点。</h2><p>试试更短的关键词，或切换章节和筛选条件。</p></div>}
      {limit < matches.length && <Button data-action="more-points" onClick={() => setLimit(limit + 70)}>再显示 70 个</Button>}
      <details className="source-details"><summary>原文导航、代码索引与参考资料</summary><div className="prose">{library.extras.map((item, i) => <Fragment key={i}><h2>{item.title}</h2><div dangerouslySetInnerHTML={{__html:item.html}} /></Fragment>)}</div></details>
    </div>
  </>;
}

export function ChapterView({library, chapter, progress, start}: {library: Library; chapter: Chapter; progress: Progress; start: (scope: Scope) => void}) {
  return <>
    <div className="reading-head"><a className="text-button" href="#knowledge">全部知识</a><h1>{chapter.title}</h1>
      <p className="subline">{chapter.pointIds.length} 个知识点 · {chapter.pointIds.length * 2} 道专属练习 · 全部可自由进入</p>
      <div className="button-row" style={{marginTop:24}}><Button className="primary" data-action="start-chapter" data-chapter={chapter.id} onClick={() => start({chapter:chapter.id})}>这一章，做 3 题</Button><a className="button secondary" href={'#lab-' + chapter.labId}>进入对应实验</a></div>
    </div><Prose html={chapter.html} />
    {library.clusters.filter(c => c.chapter === chapter.id).map(cluster => <section key={cluster.id} className="cluster-group" id={'cluster-row-' + cluster.id}>
      <h2>{cluster.title}</h2><details className="source-details"><summary>知识图与目录</summary><Prose html={cluster.html} /></details>
      {library.points.filter(p => p.cluster === cluster.id).map(p => <a key={p.id} className="point-row" href={'#point-' + p.id}><span className="point-number">{p.id}</span><span className="point-title">{p.title}</span><EvidenceTag progress={progress} id={p.id} /></a>)}
    </section>)}
  </>;
}

export function PointView({library, point, points, progress, start}: {library: Library; point: Point; points: ReadonlyMap<number,Point>; progress: Progress; start: (scope: Scope) => void}) {
  const chapter = library.chapters.find(c => c.id === point.chapter);
  const previous = points.get(point.id - 1), next = points.get(point.id + 1);
  return <>
    <div className="reading-head"><a className="text-button" href={'#chapter-' + point.chapter}>{chapter?.title}</a><h1>{point.title}</h1><p className="subline">知识点 {point.id} · {library.clusters.find(c => c.id === point.cluster)?.title}</p></div>
    <div className="reading-layout"><article className="prose" dangerouslySetInnerHTML={{__html: point.html}} /><aside className="reading-aside">
      <EvidenceTag progress={progress} id={point.id} /><Button className="primary" data-action="start-point" data-point={point.id} onClick={() => start({pointId:point.id})}>验证这个知识点</Button>
      {chapter && <a className="button secondary" href={'#lab-' + chapter.labId}>动手实验</a>}<p>阅读帮助理解；独立作答和隔日迁移，才积累掌握证据。</p>
    </aside></div>
    <nav className="reading-pagination" aria-label="相邻知识点">{previous ? <a href={'#point-' + previous.id}>← {previous.title}</a> : <span />}{next && <a href={'#point-' + next.id}>{next.title} →</a>}</nav>
  </>;
}

export function ProgressView({library, progress, points, settings, download}: {library: Library; progress: Progress; points: ReadonlyMap<number, Point>; settings: () => void; download: () => void}) {
  const totals = stats(progress);
  return <>
    <div className="section-head"><div><h1>学习记录</h1><p>记录你做到了什么，也留住还需要练习的地方。</p></div></div>
    <div className="metrics"><div className="metric"><strong>{totals.practiced}</strong><span>已练知识点 / {library.points.length}</span></div><div className="metric"><strong>{totals.independent}</strong><span>基础独立通过</span></div><div className="metric"><strong>{totals.transfer}</strong><span>隔日迁移通过</span></div></div>
    <p className="model-note">阅读和提示后完成不算独立掌握。基础题、隔日迁移题均无提示通过后，记录迁移证据；后续失误会标记待巩固。实验印记单独记录。</p>
    <section className="home-section"><div className="section-head"><h2>每一章的位置</h2><small>{progress.rounds} 轮完成 · {Object.keys(progress.labs).length} 个实验印记</small></div>
      <div className="chapter-progress">{library.chapters.map(c => {
        const n = c.pointIds.filter(id => progress.points[id]?.transfer && !progress.points[id]?.needsWork).length;
        return <a key={c.id} href={'#chapter-' + c.id} className="chapter-progress-row"><span>{c.title}</span><span className="progress-track"><span style={{width:100 * n / c.pointIds.length + '%'}} /></span><small>{n} / {c.pointIds.length}</small></a>;
      })}</div></section>
    <section className="home-section"><div className="section-head"><h2>最近的练习</h2>{totals.due > 0 && <a className="text-button" href="#knowledge?filter=due">{totals.due} 个待复习</a>}</div>
      {progress.history.length ? <div className="history-list">{progress.history.slice(-18).reverse().map((h,i) => <div className="history-row" key={i}><span style={{color:h.correct && !h.assisted ? 'var(--green)' : 'var(--red)'}}>{h.correct && !h.assisted ? '✓' : '↻'}</span><a href={'#point-' + h.pointId}>{points.get(h.pointId)?.title ?? h.pointId}</a><span>{h.stage === 'b' ? '迁移' : '基础'} · {h.skipped ? '跳过' : h.assisted ? '辅助' : h.correct ? '通过' : '待巩固'}</span><time>{new Date(h.time).toLocaleDateString('zh-CN', {month:'numeric', day:'numeric'})}</time></div>)}</div> :
        <div className="empty"><p>这里还没有练习记录。完成第一轮后，你的足迹会留在这里。</p></div>}</section>
    <section className="backup-block"><h2>把进度带走。</h2><p>电脑和手机各自保存。导出一个进度文件，在另一台设备导入，即可接着学。</p><div className="button-row"><Button data-action="export" onClick={download}>导出进度</Button><Button data-action="settings" onClick={settings}>导入与设置</Button></div></section>
  </>;
}
