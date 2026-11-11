import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import type { Library } from './types.ts';

const container = document.getElementById('root');
if (!container) throw Error('Missing application container');
const root = createRoot(container);

async function load(): Promise<Library> {
  const inline = document.getElementById('library-data');
  if (inline?.textContent) return JSON.parse(inline.textContent) as Library;
  const response = await fetch('./library.json');
  if (!response.ok) throw Error('Course request failed (' + response.status + ')');
  return await response.json() as Library;
}

void load().then(library => root.render(<App library={library} />)).catch((error: unknown) => {
  root.render(<main id="main"><p role="alert">课程数据加载失败。请刷新页面，或重新构建离线文件。</p></main>);
  console.error(error);
});
