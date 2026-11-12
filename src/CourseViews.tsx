import { Fragment, useState } from 'react';
import { getEvidence } from './engine.ts';
import { Button, Prose } from './ui.tsx';
import type { Chapter, Library, Point, Progress } from './types.ts';

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

export function ChapterView({library, chapter, progress}: {library: Library; chapter: Chapter; progress: Progress}) {
  return <>
    <div className="reading-head"><a className="text-button" href="#knowledge">全部知识</a><h1>{chapter.title}</h1>
      <p className="subline">{chapter.pointIds.length} 个知识点 · 刷题第 {chapter.pointIds[0]}–{chapter.pointIds.at(-1)} 题 · 全部可自由进入</p>
      <div className="button-row" style={{marginTop:24}}><a className="button primary" data-action="drill-chapter" href={'#drill?jump=' + chapter.pointIds[0]}>从这一章开始刷题</a><a className="button secondary" href={'#lab-' + chapter.labId}>进入对应实验</a></div>
    </div><Prose html={chapter.html} />
    {library.clusters.filter(c => c.chapter === chapter.id).map(cluster => <section key={cluster.id} className="cluster-group" id={'cluster-row-' + cluster.id}>
      <h2>{cluster.title}</h2><details className="source-details"><summary>知识图与目录</summary><Prose html={cluster.html} /></details>
      {library.points.filter(p => p.cluster === cluster.id).map(p => <a key={p.id} className="point-row" href={'#point-' + p.id}><span className="point-number">{p.id}</span><span className="point-title">{p.title}</span><EvidenceTag progress={progress} id={p.id} /></a>)}
    </section>)}
  </>;
}

export function PointView({library, point, points, progress}: {library: Library; point: Point; points: ReadonlyMap<number,Point>; progress: Progress}) {
  const chapter = library.chapters.find(c => c.id === point.chapter);
  const previous = points.get(point.id - 1), next = points.get(point.id + 1);
  return <>
    <div className="reading-head"><a className="text-button" href={'#chapter-' + point.chapter}>{chapter?.title}</a><h1>{point.title}</h1><p className="subline">知识点 {point.id} · {library.clusters.find(c => c.id === point.cluster)?.title}</p></div>
    <div className="reading-layout"><article className="prose" dangerouslySetInnerHTML={{__html: point.html}} /><aside className="reading-aside">
      <EvidenceTag progress={progress} id={point.id} /><a className="button primary" data-action="drill-point" href={'#drill?jump=' + point.id}>刷第 {point.id} 题</a>
      {chapter && <a className="button secondary" href={'#lab-' + chapter.labId}>动手实验</a>}<p>每个知识点对应一道刷题。答错会自动收进错题本。</p>
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
