import { env } from 'cloudflare:workers';

const encoder = new TextEncoder();
const sessionTtlSeconds = 60 * 60 * 24 * 30;

type WeChatCodeResponse = {
  openid?: string;
  unionid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
};

export class MiniProgramAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function ensureMiniProgramTables() {
  await env.DB.batch([
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS wechat_users (id TEXT PRIMARY KEY NOT NULL, openid TEXT NOT NULL UNIQUE, unionid TEXT, created_at TEXT NOT NULL, last_login_at TEXT NOT NULL)',
    ),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS mini_sessions (token_hash TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL)',
    ),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS mini_sessions_user_id_idx ON mini_sessions (user_id)',
    ),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS mini_sessions_expires_at_idx ON mini_sessions (expires_at)',
    ),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS mini_ocr_usage (user_id TEXT NOT NULL, window_start INTEGER NOT NULL, request_count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, window_start))',
    ),
  ]);
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(bytes))
    .map((part) => part.toString(16).padStart(2, '0'))
    .join('');
}

function bearerToken(req: Request) {
  const authorization = req.headers.get('authorization') || '';
  return authorization.match(/^Bearer\s+([^\s]+)$/i)?.[1] || '';
}

async function exchangeCode(code: string) {
  const appId = env.WECHAT_MINIPROGRAM_APP_ID?.trim();
  const appSecret = env.WECHAT_MINIPROGRAM_APP_SECRET?.trim();
  if (!appId || !appSecret)
    throw new MiniProgramAuthError('微信登录尚未完成服务器配置', 503);

  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', appId);
  url.searchParams.set('secret', appSecret);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');
  const result = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!result.ok)
    throw new MiniProgramAuthError('微信登录服务暂时不可用，请稍后重试', 502);

  const body = (await result.json()) as WeChatCodeResponse;
  if (!body.openid || body.errcode)
    throw new MiniProgramAuthError(
      body.errcode === 40029 || body.errcode === 40163
        ? '微信登录凭证已失效，请重试'
        : '微信登录失败，请稍后重试',
      401,
    );
  return { openid: body.openid, unionid: body.unionid || null };
}

export async function startMiniProgramSession(code: string) {
  if (!code || code.length > 256)
    throw new MiniProgramAuthError('微信登录凭证无效', 400);
  await ensureMiniProgramTables();
  const identity = await exchangeCode(code);
  const now = new Date().toISOString();
  let user = await env.DB.prepare(
    'SELECT id FROM wechat_users WHERE openid = ?',
  )
    .bind(identity.openid)
    .first<{ id: string }>();

  if (!user) {
    const userId = `mini:${crypto.randomUUID()}`;
    await env.DB.prepare(
      'INSERT OR IGNORE INTO wechat_users (id, openid, unionid, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(userId, identity.openid, identity.unionid, now, now)
      .run();
    user = await env.DB.prepare('SELECT id FROM wechat_users WHERE openid = ?')
      .bind(identity.openid)
      .first<{ id: string }>();
  }
  if (!user) throw new MiniProgramAuthError('无法创建小程序账号', 500);

  await env.DB.prepare(
    'UPDATE wechat_users SET unionid = COALESCE(?, unionid), last_login_at = ? WHERE id = ?',
  )
    .bind(identity.unionid, now, user.id)
    .run();
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const expiresAt = Math.floor(Date.now() / 1000) + sessionTtlSeconds;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM mini_sessions WHERE expires_at <= ?').bind(
      Math.floor(Date.now() / 1000),
    ),
    env.DB.prepare(
      'INSERT INTO mini_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
    ).bind(await digest(token), user.id, expiresAt),
  ]);
  return { token, expiresAt };
}

export async function getMiniProgramUser(req: Request) {
  const token = bearerToken(req);
  if (!token) return null;
  try {
    const row = await env.DB.prepare(
      'SELECT u.id FROM mini_sessions s JOIN wechat_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
    )
      .bind(await digest(token), Math.floor(Date.now() / 1000))
      .first<{ id: string }>();
    return row ? { userId: row.id } : null;
  } catch {
    return null;
  }
}

export async function endMiniProgramSession(req: Request) {
  const token = bearerToken(req);
  if (!token) return false;
  const result = await env.DB.prepare(
    'DELETE FROM mini_sessions WHERE token_hash = ?',
  )
    .bind(await digest(token))
    .run();
  return Boolean(result.meta.changes);
}
