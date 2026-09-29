import {
  MiniProgramAuthError,
  startMiniProgramSession,
} from '@/app/miniprogram-auth';

const response = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: Request) {
  let body: { code?: unknown };
  try {
    body = (await req.json()) as { code?: unknown };
  } catch {
    return response({ error: '登录请求格式错误' }, 400);
  }
  try {
    const session = await startMiniProgramSession(
      typeof body.code === 'string' ? body.code.trim() : '',
    );
    return response(session);
  } catch (error) {
    if (error instanceof MiniProgramAuthError)
      return response({ error: error.message }, error.status);
    return response({ error: '微信登录失败，请稍后重试' }, 500);
  }
}
