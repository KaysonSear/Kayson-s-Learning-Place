import type { D1Database } from '@cloudflare/workers-types';
import catalog from '../content/sync-catalog.json';
import { createOperationDecoder, prepareSeed } from '../src/cloud-progress.ts';
import { createProgressFiles } from '../src/progress.ts';
import type { CloudOperation, CloudResponse } from '../src/cloud-types.ts';
import { authenticated, login, logout, sameOrigin } from './auth.ts';

interface Env {
  DB: D1Database;
  ASSETS: {fetch(request: Request): Promise<Response>};
  SITE_PASSWORD?: string;
}

const bank = new Map(catalog.drillQuestions.map(question => [question.id, question]));
const files = createProgressFiles(catalog);
const decodeOperation = createOperationDecoder(catalog.points.map(p => p.id), catalog.questions.map(q => q.id), bank);
const maxBackup = 4 * 1024 * 1024;
const baseHeaders = {'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'same-origin'};

function json(body: object, status = 200) {
  return Response.json(body, {status, headers:baseHeaders});
}

function error(status: number, message: string) {
  return json({error:message}, status);
}

function redirect(location: string, cookie?: string) {
  return new Response(null, {status:303, headers:{...baseHeaders, Location:location, ...(cookie ? {'Set-Cookie':cookie} : {})}});
}

function loginPage(status = 200, retry?: number) {
  const message = status === 401 ? '密码错误，请再试一次。' : status === 429 ? '尝试次数过多，请稍后再试。' : '';
  return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>C 微实验室 · 登录</title>
<style>body{margin:0;font:16px system-ui,sans-serif;color:#000;background:#fff}main{max-width:28rem;margin:12vh auto;padding:2rem}h1{font-size:clamp(2rem,8vw,3.2rem);line-height:1.1}label,input{display:block}input{box-sizing:border-box;width:100%;padding:.8rem;margin:.5rem 0 1rem;font:inherit;border:1px solid #686868}button{min-height:44px;padding:.65rem 1.2rem;background:#c22620;color:#fff;border:0;font:inherit}input:focus-visible,button:focus-visible{outline:2px solid #000;outline-offset:3px}[role=alert]{color:#aa201b}</style>
<main><h1>C 微实验室</h1><form method="post" action="/login"><label for="password">站点密码</label><input id="password" name="password" type="password" required maxlength="512" autocomplete="current-password"><button>登录</button></form>${message ? '<p role="alert">'+message+'</p>' : ''}</main></html>`, {status, headers:{...baseHeaders,
    'Content-Type':'text/html; charset=utf-8', 'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    ...(retry ? {'Retry-After':String(retry)} : {})}});
}

class BodyError extends Error {}

async function readJson(request: Request, max: number): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new BodyError('需要 JSON 请求。');
  const reader = request.body?.getReader();
  if (!reader) throw new BodyError('请求内容为空。');
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new BodyError('数据超出本次上传大小限制。');
      }
      chunks.push(decoder.decode(value, {stream:true}));
    }
  } finally { reader.releaseLock(); }
  chunks.push(decoder.decode());
  return JSON.parse(chunks.join('')) as unknown;
}

async function initialized(db: D1Database) {
  return (await db.prepare('SELECT 1 FROM progress_seed WHERE part = 0').first()) !== null;
}

async function initialize(request: Request, db: D1Database) {
  if (await initialized(db)) return error(409, '云端已经有主档。');
  let serialized: string;
  try {
    const seed = prepareSeed(files.restore(await readJson(request, maxBackup)), bank);
    serialized = JSON.stringify(seed);
  } catch (reason) {
    return error(400, reason instanceof SyntaxError ? '无效的 JSON。' : reason instanceof Error ? reason.message : '无法导入进度。');
  }
  // Keep each UTF-8 row below the D1 row limit, including non-ASCII source text.
  const parts: string[] = [];
  for (let start = 0; start < serialized.length;) {
    let end = Math.min(start + 240000, serialized.length);
    const last = serialized.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) end--;
    parts.push(serialized.slice(start,end));
    start = end;
  }
  try {
    await db.batch(parts.map((part, i) => db.prepare('INSERT INTO progress_seed(part, contents) VALUES(?,?)').bind(i, part)));
  } catch (reason) {
    if (await initialized(db)) return error(409, '云端已经有主档。');
    throw reason;
  }
  return json({initialized:true}, 201);
}

async function sync(request: Request, db: D1Database, url: URL) {
  const rawCursor = url.searchParams.get('after') ?? '-1';
  const after = Number(rawCursor);
  if (!/^(?:-1|0|[1-9]\d*)$/.test(rawCursor) || !Number.isSafeInteger(after)) return error(400, '无效同步游标。');
  if (!await initialized(db)) return request.method === 'POST' ? error(409, '云端主档尚未初始化。') : json({initialized:false});
  if (request.method === 'POST') {
    let operations: CloudOperation[];
    try {
      const raw = await readJson(request, 700 * 1024);
      if (!Array.isArray(raw) || raw.length < 1 || raw.length > 24) return error(400, '同步批次无效。');
      operations = raw.map(decodeOperation);
    } catch (reason) {
      return error(400, reason instanceof SyntaxError ? '无效的 JSON。' : reason instanceof Error ? reason.message : '同步操作无效。');
    }
    await db.batch(operations.map(op => db.prepare('INSERT INTO progress_operations(id,payload) VALUES(?,?) ON CONFLICT(id) DO NOTHING')
      .bind(op.id, JSON.stringify(op.change))));
  }
  const seed = after === -1 ? (await db.prepare('SELECT contents FROM progress_seed ORDER BY part').all<{contents:string}>()).results.map(row => row.contents).join('') : '';
  const rows = (await db.prepare('SELECT seq,id,payload FROM progress_operations WHERE seq > ? ORDER BY seq LIMIT 33')
    .bind(after).all<{seq:number; id:string; payload:string}>()).results;
  const result: CloudResponse = {
    initialized:true, ...(seed ? {seed:JSON.parse(seed)} : {}),
    operations:rows.slice(0,32).map(({seq,id,payload}) => ({seq,id,change:JSON.parse(payload)})),
    more:rows.length > 32
  };
  return json(result);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const password = env.SITE_PASSWORD;
    if (!password || !env.DB) return error(503, '站点尚未完成配置。');
    try {
      if (url.pathname === '/login') {
        if (request.method === 'GET') return await authenticated(request, env.DB, password) ? redirect('/') : loginPage();
        if (request.method !== 'POST') return error(405, '请求方式不支持。');
        const outcome = await login(request, env.DB, password);
        return outcome.cookie ? redirect('/', outcome.cookie) : loginPage(outcome.status, outcome.retry);
      }
      const api = url.pathname.startsWith('/api/');
      if (!await authenticated(request, env.DB, password)) return api ? error(401, '请重新登录。') : redirect('/login');
      if (request.method !== 'GET' && request.method !== 'HEAD' && !sameOrigin(request)) return error(403, '请求来源无效。');
      if (url.pathname === '/logout' && request.method === 'POST') return redirect('/login', await logout(request, env.DB));
      if (url.pathname === '/api/progress/initialize' && request.method === 'POST') return await initialize(request, env.DB);
      if (url.pathname === '/api/progress' && (request.method === 'GET' || request.method === 'POST')) return await sync(request, env.DB, url);
      if (api) return error(404, '接口不存在。');
      if (request.method !== 'GET' && request.method !== 'HEAD') return error(405, '请求方式不支持。');
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      for (const [key,value] of Object.entries(baseHeaders)) headers.set(key,value);
      if (url.pathname === '/library.json') headers.set('X-CLab-Cloud','1');
      if (headers.get('Content-Type')?.includes('text/html')) headers.set('X-Frame-Options','DENY');
      return new Response(asset.body, {status:asset.status, headers});
    } catch {
      return error(503, '同步服务暂时不可用，请稍后重试。');
    }
  }
};
