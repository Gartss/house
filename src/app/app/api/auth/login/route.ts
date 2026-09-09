import { env } from 'cloudflare:workers';
import {
  startSession,
  verifyPassword,
  ensureAccountTables,
} from '../../../account-auth';
export async function POST(req: Request) {
  await ensureAccountTables();
  const { username, password } = (await req.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const row =
    typeof username === 'string'
      ? await env.DB.prepare(
          'SELECT id, password_hash FROM accounts WHERE username = ?',
        )
          .bind(username)
          .first<{ id: string; password_hash: string }>()
      : null;
  if (
    !row ||
    typeof password !== 'string' ||
    !(await verifyPassword(password, row.password_hash))
  )
    return Response.json({ error: '账号或密码不正确' }, { status: 401 });
  await startSession(row.id, new URL(req.url).protocol === 'https:');
  return Response.json({ ok: true });
}
