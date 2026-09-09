import { env } from 'cloudflare:workers';
import {
  createPasswordHash,
  startSession,
  ensureAccountTables,
} from '../../../account-auth';
const json = (v: unknown, status = 200) => Response.json(v, { status });
export async function POST(req: Request) {
  await ensureAccountTables();
  const { username, password, confirmPassword } = (await req
    .json()
    .catch(() => ({}))) as Record<string, unknown>;
  if (typeof username !== 'string' || !/^[A-Za-z0-9_]{3,32}$/.test(username))
    return json({ error: '账号需为3-32位字母、数字或下划线' }, 400);
  if (typeof password !== 'string' || password.length < 8)
    return json({ error: '密码至少需要8位' }, 400);
  if (password !== confirmPassword)
    return json({ error: '两次输入的密码不一致' }, 400);
  const exists = await env.DB.prepare(
    'SELECT id FROM accounts WHERE username = ?',
  )
    .bind(username)
    .first();
  if (exists) return json({ error: '账号已存在，请换一个账号' }, 409);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO accounts (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
  )
    .bind(
      id,
      username,
      await createPasswordHash(password),
      new Date().toISOString(),
    )
    .run();
  await startSession(id, new URL(req.url).protocol === 'https:');
  return json({ ok: true });
}
