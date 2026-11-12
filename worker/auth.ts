import type { D1Database } from '@cloudflare/workers-types';

const cookieName = '__Host-clab-session';
const lifetime = 30 * 24 * 60 * 60;
const windowMs = 10 * 60 * 1000;
const encoder = new TextEncoder();

async function hash(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function same(a: string, b: string) {
  let difference = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0);
  return difference === 0;
}

function token(request: Request) {
  const match = request.headers.get('cookie')?.match(/(?:^|;\s*)__Host-clab-session=([a-f0-9]{64})(?:;|$)/);
  return match?.[1];
}

export function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}

export async function authenticated(request: Request, db: D1Database, password: string) {
  const key = token(request);
  if (!key) return false;
  const stored = await db.prepare('SELECT expires_at, password_version FROM sessions WHERE token_hash = ? AND expires_at > ?')
    .bind(await hash(key), Date.now()).first<{expires_at:number;password_version:string}>();
  return !!stored && same(stored.password_version, await hash(key + ':' + password));
}

export async function login(request: Request, db: D1Database, password: string) {
  if (!sameOrigin(request)) return {status:403};
  const type = request.headers.get('content-type') ?? '';
  if (!type.startsWith('application/x-www-form-urlencoded')) return {status:415};
  const reader = request.body?.getReader();
  if (!reader) return {status:400};
  const decoder = new TextDecoder();
  let body = '', size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return {status:413};
      }
      body += decoder.decode(value, {stream:true});
    }
    body += decoder.decode();
  } finally { reader.releaseLock(); }

  const now = Date.now();
  const start = Math.floor(now / windowMs) * windowMs;
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const counter = 'INSERT INTO login_limits(bucket,window_start,attempts) VALUES(?,?,1) ' +
    'ON CONFLICT(bucket) DO UPDATE SET attempts = CASE WHEN window_start = excluded.window_start THEN MIN(attempts+1,31) ELSE 1 END, window_start=excluded.window_start RETURNING attempts';
  const result = await db.batch<{attempts:number}>([
    db.prepare(counter).bind('global', start),
    db.prepare(counter).bind('ip:' + await hash(password + ':' + ip), start)
  ]);
  if (result[0].results[0].attempts > 30 || result[1].results[0].attempts > 8) {
    return {status:429, retry:Math.ceil((start + windowMs - now) / 1000)};
  }
  const submitted = new URLSearchParams(body).get('password') ?? '';
  if (!same(await hash(password), await hash(submitted))) return {status:401};

  const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('');
  await db.batch([
    db.prepare('INSERT INTO sessions(token_hash,expires_at,password_version) VALUES(?,?,?)')
      .bind(await hash(key), now + lifetime * 1000, await hash(key + ':' + password)),
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    db.prepare('DELETE FROM login_limits WHERE window_start < ?').bind(start - windowMs)
  ]);
  return {status:303, cookie:cookieName + '=' + key + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' + lifetime};
}

export async function logout(request: Request, db: D1Database) {
  const key = token(request);
  if (key) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hash(key)).run();
  return cookieName + '=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0';
}
