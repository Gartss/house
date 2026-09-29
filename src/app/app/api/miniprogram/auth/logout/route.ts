import {
  endMiniProgramSession,
  getMiniProgramUser,
} from '@/app/miniprogram-auth';

export async function POST(req: Request) {
  const user = await getMiniProgramUser(req);
  if (!user)
    return Response.json(
      { error: '微信登录已失效，请重新登录' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  await endMiniProgramSession(req);
  return Response.json(
    { loggedOut: true },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
