import { getMiniProgramUser } from '@/app/miniprogram-auth';
import { env } from 'cloudflare:workers';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getMiniProgramUser(req);
  if (!user) return new Response('微信登录已失效，请重新登录', { status: 401 });
  const { id } = await params;
  if (!/^[a-f0-9]{64}$/.test(id))
    return new Response('未找到图片', { status: 404 });
  const object = await env.FILES.get(`${user.userId}/${id}`);
  if (!object) return new Response('未找到图片', { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
