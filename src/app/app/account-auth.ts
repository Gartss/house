import { cookies } from 'next/headers';
import { env } from 'cloudflare:workers';

const COOKIE = 'house_session';
export const LOGOUT_COOKIE = 'house_logged_out';
const ttl = 60 * 60 * 24 * 30;
const enc = new TextEncoder();
export async function ensureAccountTables() {
  await env.DB.batch([
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY NOT NULL, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL)',
    ),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS account_sessions (token_hash TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, expires_at INTEGER NOT NULL)',
    ),
  ]);
}

async function digest(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(value));
  return Array.from(new Uint8Array(hash))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 120000,
      hash: 'SHA-256',
    },
    key,
    256,
  );
  return `${salt}:${Array.from(new Uint8Array(bits))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')}`;
}
export async function createPasswordHash(password: string) {
  return hashPassword(password, crypto.randomUUID());
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const actual = await hashPassword(password, salt);
  return actual === `${salt}:${expected}`;
}
export async function getAccountUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const tokenHash = await digest(token);
  try {
    const row = await env.DB.prepare(
      'SELECT a.id, a.username FROM account_sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?',
    )
      .bind(tokenHash, Math.floor(Date.now() / 1000))
      .first<{ id: string; username: string }>();
    return row
      ? {
          userId: row.id,
          displayName: row.username,
          email: `${row.username}@local`,
          fullName: null,
        }
      : null;
  } catch {
    return null;
  }
}
export async function startSession(accountId: string, secure = true) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO account_sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)',
  )
    .bind(await digest(token), accountId, Math.floor(Date.now() / 1000) + ttl)
    .run();
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: ttl,
  });
  (await cookies()).delete(LOGOUT_COOKIE);
}
export async function clearSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token)
    await env.DB.prepare('DELETE FROM account_sessions WHERE token_hash = ?')
      .bind(await digest(token))
      .run();
  jar.delete(COOKIE);
  jar.set(LOGOUT_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 86400,
  });
}
