import { getMiniProgramUser } from '@/app/miniprogram-auth';

export async function GET(req: Request) {
  const user = await getMiniProgramUser(req);
  return Response.json(
    user ? { authenticated: true } : { authenticated: false },
    {
      status: user ? 200 : 401,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
