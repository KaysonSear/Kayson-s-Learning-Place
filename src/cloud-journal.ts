import type { AcceptedOperation, CloudOperation } from './cloud-types.ts';
import type { Progress } from './types.ts';

export interface Checkpoint {
  cursor: number;
  progress: Progress;
}

export interface Pending extends CloudOperation {
  key: number;
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve,reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function complete(transaction: IDBTransaction) {
  return new Promise<void>((resolve,reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function openJournal() {
  const request = indexedDB.open('c-micro-lab-cloud-v1', 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore('state');
    const queue = request.result.createObjectStore('pending', {keyPath:'key', autoIncrement:true});
    queue.createIndex('operation', 'id', {unique:true});
  };
  const db = await result(request);

  return {
    close() { db.close(); },
    async read() {
      const transaction = db.transaction(['state','pending']);
      const [checkpoint,pending] = await Promise.all([
        result<Checkpoint | undefined>(transaction.objectStore('state').get('checkpoint')),
        result<Pending[]>(transaction.objectStore('pending').getAll())
      ]);
      return {checkpoint, pending};
    },
    async enqueue(operation: CloudOperation) {
      const transaction = db.transaction('pending','readwrite');
      const done = complete(transaction);
      transaction.objectStore('pending').add(operation);
      await done;
    },
    async accept(expected: number, checkpoint: Checkpoint, accepted: AcceptedOperation[]) {
      const transaction = db.transaction(['state','pending'], 'readwrite');
      const done = complete(transaction);
      const state = transaction.objectStore('state');
      const pending = transaction.objectStore('pending');
      const read = state.get('checkpoint');
      read.onsuccess = () => {
        const stored: Checkpoint | undefined = read.result;
        if ((stored?.cursor ?? -1) !== expected) return;
        state.put(checkpoint, 'checkpoint');
        const index = pending.index('operation');
        for (const op of accepted) {
          const match = index.getKey(op.id);
          match.onsuccess = () => { if (match.result !== undefined) pending.delete(match.result); };
        }
      };
      await done;
    }
  };
}
