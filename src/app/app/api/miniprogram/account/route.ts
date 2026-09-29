import { getMiniProgramUser } from '@/app/miniprogram-auth';
import { env } from 'cloudflare:workers';

const response = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

async function deleteUserFiles(userId: string) {
  let cursor: string | undefined;
  do {
    const page = await env.FILES.list({ prefix: `${userId}/`, cursor });
    const keys = page.objects.map((object) => object.key);
    if (keys.length) await env.FILES.delete(keys);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

export async function DELETE(req: Request) {
  const user = await getMiniProgramUser(req);
  if (!user) return response({ error: '微信登录已失效，请重新登录' }, 401);

  try {
    await deleteUserFiles(user.userId);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM house_state WHERE owner = ?').bind(user.userId),
      env.DB.prepare('DELETE FROM mini_ocr_usage WHERE user_id = ?').bind(user.userId),
      env.DB.prepare('DELETE FROM mini_sessions WHERE user_id = ?').bind(user.userId),
      env.DB.prepare('DELETE FROM wechat_users WHERE id = ?').bind(user.userId),
    ]);
    return response({ deleted: true });
  } catch {
    return response({ error: '账号注销未完成，请稍后重试' }, 500);
  }
}
