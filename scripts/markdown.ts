import MarkdownIt from 'markdown-it';
import katex from 'katex';
import type { Chapter, Cluster, Point } from '../src/types.ts';

export const escapeHtml = (s: unknown) =>
  String(s).replace(/[&<>"']/g, c => (({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'} as Record<string, string>)[c]));

const katexOptions = {output: 'mathml', throwOnError: false, strict: false} as const;

/** Plain-text explanations keep the source's inline $…$ math; pre-render it so the app shows real formulas. */
export function inlineMath(text: string) {
  return text.split(/\$([^$\n]+)\$/).map((part, i) => i % 2 ? katex.renderToString(part.trim(), katexOptions) : escapeHtml(part)).join('');
}

export const hasMath = (text: string) => /\$[^$]+\$/.test(text);

/** The source escapes table pipes as raw <code>&#124;</code>; html:false would print those tags, so turn them into code spans. */
const rawCode = (text: string) => text.replace(/<code>([^<\n]*)<\/code>/g, (_, code: string) => '`' + code.replace(/&#124;/g, '\\|') + '`');

/** CommonMark rejects **…** whose closing run touches CJK punctuation; finish those outside code. */
const cjkStrong = (html: string) => html.split(/(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>|<[^>]+>)/).map((part, i) => i % 2 ? part : part.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')).join('');

/** Turn a phrase from a point/heading title into the in-app anchor the source's wiki links target. */
function targetKey(title: string) {
  return title.replace(/^#/, '');
}

export interface Renderer {
  render(markdown: string): string;
  renderInline(markdown: string): string;
  readonly diagramCount: number;
}

export function createRenderer(chapters: Chapter[], clusters: Cluster[], points: Point[]) {
  const targets = new Map<string, string>();
  for (const point of points) targets.set(`${point.id}. ${point.title}`, `#point-${point.id}`);
  for (const chapter of chapters) targets.set(chapter.title, `#chapter-${chapter.id}`);
  for (const cluster of clusters) targets.set(cluster.title, `#cluster-${cluster.id}`);
  const targetFor = (title: string) => targets.get(targetKey(title)) || '#knowledge';

  let diagramCount = 0;
  function diagram(text: string) {
    const nodes = [...text.matchAll(/([A-Za-z][\w]*)\["([^"\n]+)"\]/g)].map(m => ({id: m[1], label: m[2]}));
    const unique = [...new Map(nodes.map(n => [n.id, n])).values()];
    const edges = [...text.matchAll(/([A-Za-z][\w]*)\s*-->\s*([A-Za-z][\w]*)/g)].map(m => [m[1], m[2]]);
    const outgoing = new Set(edges.map(e => e[1]));
    const roots = unique.filter(n => !edges.some(e => e[1] === n.id));
    const depth: Record<string, number> = {};
    roots.forEach(n => depth[n.id] = 0);
    for (let k = 0; k < unique.length; k++) for (const [a, b] of edges) if (depth[a] !== undefined) depth[b] = Math.max(depth[b] || 0, depth[a] + 1);
    const levels: (typeof unique)[] = [];
    for (const n of unique) { const d = depth[n.id] || 0; (levels[d] ??= []).push(n); }
    const rows = Math.max(1, ...levels.map(l => l?.length || 0));
    const height = rows * 62 + 24;
    const width = Math.max(620, levels.length * 260 + 20);
    const coords: Record<string, {x: number; y: number}> = {};
    levels.forEach((list, d) => list.forEach((n, i) => coords[n.id] = {x: 18 + d * 260, y: 12 + (i + .5) * rows / list.length * 62 - 22}));
    const marker = `arrow-${++diagramCount}`;
    const paths = edges.map(([a, b]) => {
      const x = coords[a], y = coords[b];
      return x && y ? `<path d="M${x.x + 228},${x.y + 22} C${x.x + 245},${x.y + 22} ${y.x - 20},${y.y + 22} ${y.x},${y.y + 22}" fill="none" stroke="#aaa" marker-end="url(#${marker})"/>` : '';
    }).join('');
    const boxes = unique.map(n => {
      const {x, y} = coords[n.id];
      const label = n.label.replace(/^#/, '');
      const chunks = label.match(/.{1,18}/gu) || [''];
      return `<a href="${escapeHtml(targetFor(n.label))}" aria-label="${escapeHtml(label)}"><rect x="${x}" y="${y}" width="228" height="44" rx="1" fill="white" stroke="${outgoing.has(n.id) ? '#000' : '#dedede'}"/><text x="${x + 12}" y="${y + (chunks.length > 1 ? 18 : 27)}" font-size="12" fill="#000">${chunks.slice(0, 2).map((s, i) => `<tspan x="${x + 12}" dy="${i ? 16 : 0}">${escapeHtml(s)}</tspan>`).join('')}</text><title>${escapeHtml(label)}</title></a>`;
    }).join('');
    return `<div class="source-diagram"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="知识关系图"><defs><marker id="${marker}" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#aaa"/></marker></defs>${paths}${boxes}</svg></div>`;
  }

  const md = new MarkdownIt({html: false, linkify: false, typographer: false});
  md.inline.ruler.after('escape', 'math_inline', (state, silent) => {
    if (state.src[state.pos] !== '$') return false;
    const end = state.src.indexOf('$', state.pos + 1);
    if (end < 0) return false;
    if (!silent) { const token = state.push('math_inline', 'math', 0); token.content = state.src.slice(state.pos + 1, end).trim(); }
    state.pos = end + 1;
    return true;
  });
  md.renderer.rules.math_inline = (tokens, i) => katex.renderToString(tokens[i].content, katexOptions);
  const fence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, i, options, env, self) => tokens[i].info.trim() === 'mermaid' ? diagram(tokens[i].content) : fence(tokens, i, options, env, self);

  function prepare(text: string) {
    text = rawCode(text);
    return text.replace(/\[\[#([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, title, label) => `[${label || title}](${targetFor(title)})`);
  }

  function render(text: string): string {
    text = prepare(text);
    // Obsidian callouts become native disclosure widgets; quoted contents retain their Markdown semantics.
    const blocks: string[] = [];
    text = text.replace(/^> \[!([^\]]+)\](-)?\s*([^\n]*)\r?\n((?:>.*(?:\r?\n|$))*)/gm, (_, kind, collapsed, title, body: string) => {
      const inner = body.replace(/^> ?/gm, '');
      const html = `<details class="callout"${collapsed ? '' : ' open'}><summary>${escapeHtml(title.trim() || kind)}</summary>${render(inner)}</details>`;
      blocks.push(html);
      return `\n\nCALLBLOCK${blocks.length - 1}END\n\n`;
    });
    return cjkStrong(md.render(text)).replace(/<p>CALLBLOCK(\d+)END<\/p>/g, (_, i) => blocks[Number(i)]);
  }

  function renderInline(text: string): string {
    return cjkStrong(md.renderInline(prepare(text)));
  }

  return {
    render,
    renderInline,
    get diagramCount() { return diagramCount; }
  };
}

/** Strip inline Markdown down to the text a button or a plain-text backup should show. */
export function plainInline(s: string): string {
  return s
    .replace(/<code>([^<\n]*)<\/code>/g, (_, code: string) => code.replace(/&#124;/g, '|'))
    .replace(/\[\[#?([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, title, label) => label || title)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/\$([^$\n]+)\$/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip block Markdown for the plain-text `explanation` fallback. */
export function plainBlock(s: string): string {
  return s
    .replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code: string) => ' ' + code + ' ')
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, ' ')
    .replace(/<code>([^<\n]*)<\/code>/g, (_, code: string) => code.replace(/&#124;/g, '|'))
    .replace(/\[\[#([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_, name, label) => label || name)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+.*$/gm, ' ')
    .replace(/^> ?/gm, '')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$([^$\n]+)\$/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
