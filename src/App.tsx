import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as engine from './engine.ts';
import * as drill from './drill.ts';
import { createProgressFiles } from './progress.ts';
import { open as openStorage } from './storage.ts';
import { ChapterView, Home, Knowledge, PointView, ProgressView } from './CourseViews.tsx';
import { DrillView } from './DrillView.tsx';
import { emptyDraft, QuizView } from './QuizView.tsx';
import { LabList, LabView } from './LabViews.tsx';
import { getLab } from './labs.ts';
import { SettingsDialog } from './SettingsDialog.tsx';
import { connectCloud } from './cloud-sync.ts';
import type { CloudStatus } from './cloud-sync.ts';
import { createChange } from './cloud-progress.ts';
import type { Library, Progress, Scope } from './types.ts';

declare global {
  interface Window { CLabDebug?: {counts: Library['counts']; getState: () => Progress} }
}

const destinations = [
  ['home', '○', '今天', '今天'], ['drill', '☷', '刷题', '刷题'], ['knowledge', '▦', '知识地图', '知识'],
  ['labs', '⌁', '自由实验', '实验'], ['progress', '◷', '学习记录', '记录']
] as const;

function Navigation({active, mobile = false}: {active: string; mobile?: boolean}) {
  return <nav className={mobile ? 'bottom-nav' : 'main-nav'} aria-label={mobile ? '移动端导航' : '主导航'}>
    {destinations.map(([id, icon, label, short]) => <a key={id} href={'#' + id} data-nav={id} className={active === id ? 'active' : undefined} aria-current={active === id ? 'page' : undefined}>
      {mobile ? <>{icon}<span>{short}</span></> : <><span>{icon}</span> {label}</>}
    </a>)}
  </nav>;
}

const cloudLabels: Record<CloudStatus,string> = {
  checking:'连接云端', empty:'初始化云端', synced:'云端已同步', pending:'等待同步', offline:'离线待同步', login:'请重新登录', error:'同步待重试'
};

export function App({library, cloud}: {library: Library; cloud: boolean}) {
  const points = useMemo(() => new Map(library.points.map(p => [p.id, p])), [library]);
  const questions = useMemo(() => new Map(library.questions.map(q => [q.id, q])), [library]);
  const bank = useMemo(() => new Map(library.drillQuestions.map(q => [q.id, q])), [library]);
  const progressFiles = useMemo(() => createProgressFiles(library), [library]);
  const storage = useMemo(() => openStorage(() => window.localStorage, progressFiles.restore), [progressFiles]);
  const [progress, setProgress] = useState(() => storage.load() ?? engine.fresh());
  const current = useRef(progress);
  const connection = useRef<ReturnType<typeof connectCloud> | null>(null);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>('checking');
  const [hash, setHash] = useState(location.hash);
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [narrow, setNarrow] = useState(() => matchMedia('(max-width:900px)').matches);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const timer = useRef<number>(0);
  const main = useRef<HTMLElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const [name, query] = (hash || '#home').slice(1).split('?');
  const params = new URLSearchParams(query);
  const point = name.startsWith('point-') ? points.get(Number(name.slice(6))) : undefined;
  const cluster = name.startsWith('cluster-') ? library.clusters.find(c => c.id === name.slice(8)) : undefined;
  const chapterId = cluster?.chapter ?? (name.startsWith('chapter-') ? Number(name.slice(8)) : undefined);
  const chapter = library.chapters.find(c => c.id === chapterId);
  const lab = name.startsWith('lab-') ? getLab(name.slice(4)) : undefined;
  const selectedChapter = point?.chapter ?? chapterId ?? Number(params.get('chapter'));
  const group = /^(point|chapter|cluster)-/.test(name) ? 'knowledge' : name.startsWith('lab-') ? 'labs' : name === 'quiz' ? 'home' : name;
  const navLabel = destinations.find(([id]) => id === group)?.[2] ?? '知识地图';

  function commit(next: Progress, replace = false) {
    next.updatedAt = Date.now();
    if (connection.current?.initialized) {
      const operation = createChange(current.current, next, bank);
      if (operation) connection.current.enqueue(operation);
    } else if (replace) storage.replace(next); else storage.save(next);
    current.current = next;
    setProgress(next);
  }

  function edit(change: (next: Progress) => void) {
    const next = structuredClone(current.current);
    change(next);
    commit(next);
  }

  function toast(text: string) {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(''), 3500);
  }

  function start(scope: Scope = {}) {
    const queue = engine.queue(current.current, library.points, library.questions, scope);
    if (!queue.length) {
      toast('题库还没有准备好。');
      return;
    }
    edit(next => {
      next.session = {queue, index:0, answers:[], current:emptyDraft(), scope, started:Date.now()};
    });
    location.hash = 'quiz';
  }

  function download() {
    const payload = progressFiles.backup(current.current);
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'C-Lab-progress-' + engine.day() + '.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('进度文件已准备下载。');
  }

  useEffect(() => {
    storage.save(current.current);
    const media = matchMedia('(max-width:900px)');
    function resize() { setNarrow(media.matches); }
    function changeRoute() { setNavOpen(false); setHash(location.hash); }
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') setNavOpen(false); }
    media.addEventListener('change', resize);
    window.addEventListener('hashchange', changeRoute);
    window.addEventListener('keydown', escape);
    window.CLabDebug = {counts:library.counts, getState:() => structuredClone(current.current)};
    return () => {
      media.removeEventListener('change', resize);
      window.removeEventListener('hashchange', changeRoute);
      window.removeEventListener('keydown', escape);
      clearTimeout(timer.current);
      delete window.CLabDebug;
    };
  }, [library, storage]);

  useEffect(() => {
    if (!cloud) return;
    const sync = connectCloud(bank, next => { current.current = next; setProgress(next); }, setCloudStatus);
    connection.current = sync;
    return () => { sync.stop(); connection.current = null; };
  }, [bank, cloud]);

  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--scale', String(progress.settings.textSize));
    document.documentElement.classList.toggle('reduce-motion', progress.settings.reduceMotion);
  }, [progress.settings]);

  useLayoutEffect(() => {
    document.body.classList.toggle('nav-open', narrow && navOpen);
    document.body.classList.toggle('nav-collapsed', collapsed);
    if (narrow && navOpen) sidebar.current?.querySelector('a')?.focus();
  }, [narrow, navOpen, collapsed]);

  useLayoutEffect(() => {
    if (point && point.id !== current.current.lastPoint) {
      edit(next => { next.lastPoint = point.id; });
    }
    window.scrollTo(0, 0);
    main.current?.focus({preventScroll:true});
    if (cluster) document.getElementById('cluster-row-' + cluster.id)?.scrollIntoView();
  }, [hash]);

  useLayoutEffect(() => {
    if (name === 'drill' && !current.current.drill && (!cloud || cloudStatus !== 'checking')) {
      edit(next => { next.drill = drill.start(bank.keys()); });
    }
  }, [name, progress.drill, cloud, cloudStatus]);

  const settings = () => setSettingsOpen(true);
  let page = <div className="empty"><h1>这个位置没有内容。</h1><p style={{marginTop:18}}><a className="text-button" href="#knowledge">回到知识地图</a></p></div>;
  if (name === 'home') page = <Home library={library} progress={progress} start={start} toast={toast} />;
  else if (name === 'quiz') page = <QuizView progress={progress} questions={questions} points={points} edit={edit} start={start} toast={toast} />;
  else if (name === 'drill' && progress.drill) page = <DrillView round={progress.drill} bank={bank} points={points} save={round => commit({...current.current, drill:round})} />;
  else if (name === 'knowledge') page = <Knowledge key={hash} library={library} progress={progress} params={params} />;
  else if (name === 'progress') page = <ProgressView library={library} progress={progress} points={points} settings={settings} download={download} />;
  else if (name === 'labs') page = <LabList progress={progress} />;
  else if (point) page = <PointView library={library} point={point} points={points} progress={progress} start={start} />;
  else if (chapter) page = <ChapterView library={library} chapter={chapter} progress={progress} start={start} />;
  else if (lab) page = <LabView key={lab.id} lab={lab} complete={id => {
    if (current.current.labs[id]) return;
    edit(next => { next.labs[id] = Date.now(); });
    toast('实验挑战完成。这个能力印记已保存。');
  }} />;
  if (cloud && cloudStatus === 'checking') page = <div className="empty" role="status"><p>正在读取云端进度…</p></div>;

  return <>
    <a className="skip-link" href="#main" data-action="skip-main" onClick={event => {event.preventDefault(); main.current?.focus();}}>跳到学习内容</a>
    <aside ref={sidebar} className="sidebar" id="sidebar" aria-label="学习导航" inert={narrow && !navOpen}>
      <a className="brand" href="#home"><span className="brand-mark">C</span><span>微实验室<small>从理解，到会用。</small></span></a>
      <Navigation active={group} />
      <div className="sidebar-caption">学习路径 <button type="button" className="icon-button" id="close-nav" aria-label="收起导航" onClick={() => narrow ? setNavOpen(false) : setCollapsed(true)}>‹</button></div>
      <nav id="chapter-nav" className="chapter-nav" aria-label="章节">{library.chapters.map(c => <a key={c.id} href={'#chapter-' + c.id} className={selectedChapter === c.id ? 'current' : undefined}>
        <span>{String(c.id).padStart(2, '0')}</span><span>{c.title.replace(/^\d+ /, '')}</span>
        {c.pointIds.every(id => progress.points[id]?.transfer && !progress.points[id]?.needsWork) && <span className="chapter-check" aria-label="迁移通过">✓</span>}
      </a>)}</nav>
      <div className="sidebar-bottom"><span className="offline-dot" /> 随时停下，也能接着来。<button type="button" className="text-button" data-action="settings" onClick={settings}>设置与备份</button></div>
    </aside>
    <div id="nav-scrim" className="nav-scrim" hidden={!narrow || !navOpen} onClick={() => setNavOpen(false)} />
    <div className="workspace">
      <header className="topbar"><div><button type="button" className="icon-button" id="toggle-nav" aria-label="展开或收起导航" onClick={() => narrow ? setNavOpen(!navOpen) : setCollapsed(!collapsed)}>☰</button>
        <a className="mobile-brand" href="#home">C<span>微实验室</span></a><span id="breadcrumb">学习台 / {navLabel}</span></div>
        <button type="button" className="storage-pill" id="storage-status" data-action="settings" onClick={settings}><span className="offline-dot" style={storage.available && (!cloud || cloudStatus === 'synced') ? undefined : {background:'var(--red)'}} /> {cloud ? cloudLabels[cloudStatus] : storage.available ? '本机已保存' : '需导出进度'}</button>
      </header>
      <div id="storage-warning" className="storage-warning" role="status" hidden={storage.available}>当前浏览器无法持久保存进度。本次学习仍可继续，离开前请到「设置与备份」导出进度文件。</div>
      <main id="main" ref={main} tabIndex={-1}>{page}</main>
      <footer className="footer"><span>C23 · 你的离线学习工作台</span><button type="button" className="text-button" data-action="settings" onClick={settings}>保存一份进度</button></footer>
    </div>
    <Navigation active={group} mobile />
    {settingsOpen && <SettingsDialog progress={progress} restore={progressFiles.restore} edit={edit} close={() => setSettingsOpen(false)} download={download}
      cloud={cloud ? {label:cloudLabels[cloudStatus], empty:cloudStatus === 'empty', login:cloudStatus === 'login', initialize:async next => {
        if (!connection.current) throw Error('云端尚未连接。');
        await connection.current.initialize(next);
        setSettingsOpen(false);
        toast('云端主档已初始化。');
      }} : undefined} replace={next => {
      if (name === 'drill' && !next.drill) next.drill = drill.start(bank.keys());
      commit(next, true);
      setSettingsOpen(false);
      toast('进度已导入，可以接着学习。');
    }} />}
    <div id="toast" className={message ? 'toast visible' : 'toast'} role="status" aria-live="polite">{message}</div>
  </>;
}
