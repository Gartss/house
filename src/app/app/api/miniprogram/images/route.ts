import { getMiniProgramUser } from '@/app/miniprogram-auth';
import { env } from 'cloudflare:workers';

const maxBytes = 12 * 1024 * 1024;

function detectType(bytes: Uint8Array) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return 'image/jpeg';
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71)
    return 'image/png';
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  if (String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-')
    return 'application/pdf';
  return '';
}

export async function POST(req: Request) {
  const user = await getMiniProgramUser(req);
  if (!user) return new Response('微信登录已失效，请重新登录', { status: 401 });
  let bytes: ArrayBuffer;
  if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
    const data = await req.formData();
    const file = data.get('file');
    if (!(file instanceof File))
      return new Response('请选择需要上传的图片', { status: 400 });
    bytes = await file.arrayBuffer();
  } else {
    bytes = await req.arrayBuffer();
  }
  if (bytes.byteLength > maxBytes)
    return new Response('图片需小于12MB', { status: 413 });
  const type = detectType(new Uint8Array(bytes));
  if (!type)
    return new Response('请选择 JPG、PNG、WebP 图片或 PDF 文件', { status: 400 });
  const id = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
  )
    .map((part) => part.toString(16).padStart(2, '0'))
    .join('');
  await env.FILES.put(`${user.userId}/${id}`, bytes, {
    httpMetadata: { contentType: type },
  });
  return Response.json({ id });
}
