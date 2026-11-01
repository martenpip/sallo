// Storage: one document in IndexedDB. Plain by default; AES-256-GCM encrypted when a passcode is set.
// Nothing here talks to the network.
import { deriveKey, encryptJson, decryptJson, randomBytes, b64, unb64, KDF_ITERATIONS, WrongSecretError } from './vault.js';

const DB = 'sallo', STORE = 'kv';
let db = null;
let key = null;            // CryptoKey, only while unlocked and lock is on
let meta = { enc: null, autoLockMin: 5, fails: 0, until: 0 };
let pending = null, writing = false, writeError = null;
export const status = { ok: true, error: '' };
let memoryOnly = false;
const mem = new Map();

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('IndexedDB is not available'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('Could not open storage'));
    r.onblocked = () => reject(new Error('Storage is blocked by another tab'));
  });
}
const idbGet = (k) => new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
const idbPut = (k, v) => new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('write aborted')); });
const get = (k) => (memoryOnly ? Promise.resolve(mem.get(k)) : idbGet(k));
const put = (k, v) => (memoryOnly ? (mem.set(k, v), Promise.resolve()) : idbPut(k, v));

export async function init() {
  try { db = await openDb(); } catch (e) { memoryOnly = true; status.ok = false; status.error = String(e.message || e); }
  meta = { ...meta, ...((await get('meta')) || {}) };
  const doc = await get('doc');
  if (!doc) return { state: 'empty' };
  if (doc.format === 'enc') return { state: 'locked' };
  return { state: 'ready', data: doc.data };
}

export const lockEnabled = () => !!meta.enc;
export const autoLockMin = () => meta.autoLockMin;
export async function setAutoLockMin(m) { meta.autoLockMin = m; await put('meta', meta); }
export const lockoutSeconds = () => Math.max(0, Math.ceil((meta.until - Date.now()) / 1000));

async function writeNow() {
  writing = true;
  try {
    while (pending) {
      const data = pending; pending = null;
      const doc = key ? { format: 'enc', ...(await encryptJson(key, data)) } : { format: 'plain', data };
      await put('doc', doc);
    }
    status.ok = !memoryOnly; writeError = null;
  } catch (e) {
    writeError = e; status.ok = false; status.error = String(e.message || e);
  } finally { writing = false; }
}
/** Queue a save of the latest data. Safe to call on every change. */
export function save(data) {
  if (!data) return;
  pending = JSON.parse(JSON.stringify(data)); // snapshot now; later edits are a later save
  if (!writing) queueMicrotask(writeNow);
}
export async function flush() { while (writing || pending) { if (!writing) await writeNow(); else await new Promise((r) => setTimeout(r, 10)); } }
export const lastWriteFailed = () => !!writeError;

export async function createFirst(data) { pending = null; await put('doc', { format: 'plain', data }); }

// ---------- passcode lock ----------
export async function enableLock(passcode, data) {
  const salt = randomBytes(16);
  key = await deriveKey(passcode, salt, KDF_ITERATIONS);
  meta.enc = { salt: b64(salt), iterations: KDF_ITERATIONS };
  meta.fails = 0; meta.until = 0;
  await put('meta', meta);
  pending = null;
  await put('doc', { format: 'enc', ...(await encryptJson(key, data)) });
}
export async function disableLock(data) {
  await flush();
  pending = null;
  await put('doc', { format: 'plain', data });
  key = null; meta.enc = null; meta.fails = 0; meta.until = 0;
  await put('meta', meta);
}
export async function changePasscode(newPass, data) {
  await flush();
  await enableLock(newPass, data);
}
export async function unlock(passcode) {
  if (lockoutSeconds() > 0) throw new Error(`Too many attempts. Try again in ${lockoutSeconds()} s.`);
  const doc = await get('doc');
  if (!doc || doc.format !== 'enc' || !meta.enc) throw new Error('Nothing to unlock.');
  const k = await deriveKey(passcode, unb64(meta.enc.salt), meta.enc.iterations);
  try {
    const data = await decryptJson(k, doc);
    key = k; meta.fails = 0; meta.until = 0;
    await put('meta', meta);
    return data;
  } catch {
    meta.fails = (meta.fails || 0) + 1;
    meta.until = meta.fails >= 3 ? Date.now() + Math.min(300, 5 * 2 ** (meta.fails - 3)) * 1000 : 0;
    await put('meta', meta);
    throw new WrongSecretError();
  }
}
export async function verifyPasscode(passcode) {
  if (!meta.enc) return true;
  const doc = await get('doc');
  const k = await deriveKey(passcode, unb64(meta.enc.salt), meta.enc.iterations);
  try { await decryptJson(k, doc); return true; } catch { return false; }
}
export async function lockNow() { await flush(); key = null; }

/** Deletes every byte this app stored in the browser. */
export async function wipe() {
  pending = null; key = null; meta = { enc: null, autoLockMin: 5, fails: 0, until: 0 };
  mem.clear();
  try { db?.close(); } catch { /* ignore */ }
  await new Promise((res) => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => res(); });
  try { localStorage.clear(); } catch { /* ignore */ }
  db = null; memoryOnly = false;
  try { db = await openDb(); } catch { memoryOnly = true; }
}

export async function requestPersistence() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}
