// Encryption helpers (Web Crypto only; nothing leaves the device).
// - Passcode lock: the whole dataset is stored as AES-256-GCM ciphertext in IndexedDB.
// - Encrypted backup file: same primitives, key derived from a backup passphrase.
const enc = new TextEncoder();
const dec = new TextDecoder();
export const KDF_ITERATIONS = 310000;

export function b64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
export const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

export async function deriveKey(secret, salt, iterations = KDF_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(key, obj, aad) {
  const iv = randomBytes(12);
  const params = { name: 'AES-GCM', iv };
  if (aad) params.additionalData = enc.encode(aad);
  const ct = await crypto.subtle.encrypt(params, key, enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}

export async function decryptJson(key, { iv, ct }, aad) {
  const params = { name: 'AES-GCM', iv: unb64(iv) };
  if (aad) params.additionalData = enc.encode(aad);
  const pt = await crypto.subtle.decrypt(params, key, unb64(ct));
  return JSON.parse(dec.decode(pt));
}

export class WrongSecretError extends Error {
  constructor() { super('Wrong passphrase, or the file was changed.'); this.name = 'WrongSecretError'; }
}
export class BadFileError extends Error {
  constructor(msg) { super(msg); this.name = 'BadFileError'; }
}

const BACKUP_AAD = 'sallo-backup-v1';

/** Returns the text of an encrypted backup file. */
export async function encryptBackup(data, passphrase, iterations = KDF_ITERATIONS) {
  const salt = randomBytes(16);
  const key = await deriveKey(passphrase, salt, iterations);
  const { iv, ct } = await encryptJson(key, data, BACKUP_AAD);
  return JSON.stringify({ sallo: 'encrypted-backup', v: 1, kdf: 'PBKDF2-SHA256', iterations, salt: b64(salt), iv, ct });
}

export function isEncryptedBackup(obj) {
  return !!obj && obj.sallo === 'encrypted-backup';
}

export async function decryptBackup(envelope, passphrase) {
  if (!isEncryptedBackup(envelope) || envelope.v !== 1 || envelope.kdf !== 'PBKDF2-SHA256') throw new BadFileError('This is not a Sallo encrypted backup.');
  const it = Number(envelope.iterations);
  if (!Number.isInteger(it) || it < 10000 || it > 2000000) throw new BadFileError('Unsupported backup settings.');
  try {
    const key = await deriveKey(passphrase, unb64(envelope.salt), it);
    return await decryptJson(key, envelope, BACKUP_AAD);
  } catch (e) {
    if (e instanceof BadFileError) throw e;
    throw new WrongSecretError();
  }
}
