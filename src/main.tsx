import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import type { Library } from './types.ts';

const container = document.getElementById('root');
if (!container) throw Error('Missing application container');
const root = createRoot(container);

async function load(): Promise<{library:Library; cloud:boolean}> {
  const inline = document.getElementById('library-data');
  if (inline?.textContent) return {library:JSON.parse(inline.textContent) as Library, cloud:false};
  const response = await fetch('./library.json');
  if (!response.ok) throw Error('Course request failed (' + response.status + ')');
  return {library:await response.json() as Library, cloud:response.headers.get('X-CLab-Cloud') === '1'};
}

void load().then(props => root.render(<App {...props} />)).catch((error: unknown) => {
  root.render(<main id="main"><p role="alert">课程数据加载失败。请刷新页面，或重新构建离线文件。</p></main>);
  console.error(error);
});
