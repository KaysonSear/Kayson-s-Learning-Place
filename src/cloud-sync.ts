import { openJournal } from './cloud-journal.ts';
import type { Checkpoint, Pending } from './cloud-journal.ts';
import { applyOperation } from './cloud-progress.ts';
import type { CloudOperation, CloudResponse } from './cloud-types.ts';
import type { DrillQuestion, Progress } from './types.ts';

export type CloudStatus = 'checking' | 'empty' | 'synced' | 'pending' | 'offline' | 'login' | 'error';
type Journal = Awaited<ReturnType<typeof openJournal>>;

export function connectCloud(bank: ReadonlyMap<number, DrillQuestion>, publish: (progress: Progress) => void, report: (status: CloudStatus) => void) {
  let journal: Journal | undefined;
  let timer = 0;
  let retry = 3000;
  let running: Promise<void> | undefined;
  let wanted = false;
  let stopped = false;
  let initialized = false;
  const unstored = new Map<string, CloudOperation>();
  const writes = new Map<string, Promise<void>>();

  function persist(op: CloudOperation) {
    const inFlight = writes.get(op.id);
    if (inFlight) return inFlight;
    if (!journal) return Promise.resolve();
    const write = journal.enqueue(op).then(() => { unstored.delete(op.id); }).finally(() => { writes.delete(op.id); });
    writes.set(op.id, write);
    return write;
  }

  function visible(checkpoint: Checkpoint, pending: Pending[]) {
    const progress = structuredClone(checkpoint.progress);
    if (progress.drill) {
      for (const [id, answer] of Object.entries(progress.drill.answerInfo ?? {})) {
        progress.drill.answers[Number(id)] = bank.get(Number(id))?.optionIds?.indexOf(answer.optionId) ?? -1;
      }
    }
    const queued = new Set(pending.map(op => op.id));
    for (const op of pending) applyOperation(progress, op, bank);
    for (const op of unstored.values()) if (!queued.has(op.id)) applyOperation(progress, op, bank);
    if (!stopped) publish(progress);
  }

  function schedule(delay: number) {
    window.clearTimeout(timer);
    if (!stopped) timer = window.setTimeout(kick, delay);
  }

  function wake() {
    if (document.visibilityState === 'visible') kick();
  }

  function batch(pending: Pending[]) {
    const encoder = new TextEncoder();
    const operations: CloudOperation[] = [];
    let size = 2;
    for (const {id,change} of pending.slice(0,24)) {
      const operation = {id,change};
      size += encoder.encode(JSON.stringify(operation)).length + 1;
      if (size > 640 * 1024) break;
      operations.push(operation);
    }
    return operations;
  }

  async function run() {
    if (!journal) journal = await openJournal();
    if (stopped) { journal.close(); return; }
    await Promise.all([...unstored.values()].map(persist));
    let more = false;
    do {
      const {checkpoint,pending} = await journal.read();
      if (stopped) return;
      if (checkpoint) {
        initialized = true;
        visible(checkpoint, pending);
      }
      if (!navigator.onLine) { report('offline'); return; }
      const after = checkpoint?.cursor ?? -1;
      const send: CloudOperation[] = checkpoint && !more ? batch(pending) : [];
      const response: Response = await fetch('/api/progress?after=' + after, {
        method:send.length ? 'POST' : 'GET',
        ...(send.length ? {headers:{'Content-Type':'application/json'}, body:JSON.stringify(send)} : {}),
        cache:'no-store', credentials:'same-origin', redirect:'manual',
        signal: AbortSignal.timeout(12000)
      });
      if (stopped) return;
      if (response.status === 401 || response.type === 'opaqueredirect') { report('login'); return; }
      if (!response.ok) { report('error'); schedule(retry); retry = Math.min(retry * 2,60000); return; }
      const data: CloudResponse = await response.json();
      retry = 3000;
      if (!data.initialized) {
        report(checkpoint ? 'error' : 'empty');
        schedule(15000);
        return;
      }
      const progress = checkpoint ? structuredClone(checkpoint.progress) : data.seed;
      if (!progress) throw Error('Cloud seed is missing');
      for (const op of data.operations) applyOperation(progress, op, bank);
      const cursor = data.operations.at(-1)?.seq ?? Math.max(after,0);
      await journal.accept(after, {cursor,progress}, data.operations);
      const latest = await journal.read();
      if (stopped) return;
      if (latest.checkpoint) {
        initialized = true;
        visible(latest.checkpoint, latest.pending);
      }
      more = data.more;
      if (!more && !latest.pending.length && !unstored.size) {
        report('synced');
        schedule(document.visibilityState === 'visible' ? 15000 : 60000);
        return;
      }
      report('pending');
      if (!more && !data.operations.length && send.length) {
        // Another tab may have moved the cursor while this request was in flight.
        schedule(1000);
        return;
      }
      if (!latest.pending.length && unstored.size && !more) return;
    } while (!stopped);
  }

  function kick() {
    if (stopped) return;
    window.clearTimeout(timer);
    if (running) { wanted = true; return; }
    running = run().catch(() => {
      if (stopped) return;
      report(navigator.onLine ? 'error' : 'offline');
      schedule(retry);
      retry = Math.min(retry * 2,60000);
    }).finally(() => {
      running = undefined;
      if (wanted) { wanted = false; kick(); }
    });
  }

  window.addEventListener('online', kick);
  window.addEventListener('offline', kick);
  window.addEventListener('focus', wake);
  document.addEventListener('visibilitychange', wake);
  kick();

  return {
    get initialized() { return initialized; },
    enqueue(operation: CloudOperation) {
      unstored.set(operation.id, operation);
      report(navigator.onLine ? 'pending' : 'offline');
      void persist(operation).catch(() => { if (!stopped) report('error'); });
      kick();
    },
    async initialize(progress: Progress) {
      const response = await fetch('/api/progress/initialize', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(progress),
        credentials:'same-origin', redirect:'manual', signal:AbortSignal.timeout(20000)
      });
      if (response.status === 401 || response.type === 'opaqueredirect') { report('login'); throw Error('请重新登录后再导入。'); }
      if (!response.ok) {
        if (response.status === 409) kick();
        throw Error((await response.json() as {error?:string}).error ?? '初始化失败。');
      }
      kick();
    },
    stop() {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener('online', kick);
      window.removeEventListener('offline', kick);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
      if (journal) journal.close();
    }
  };
}
