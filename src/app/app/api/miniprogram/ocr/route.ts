import { getMiniProgramUser } from '@/app/miniprogram-auth';
import {
  recognizeWithTencentOcr,
  pdfPageCount,
  TencentOcrError,
} from '@/app/tencent-ocr';
import {
  isListingDocumentText,
  parseFloorPlanRoomsFromText,
  parseScreenshot,
} from '@/lib/ocr';
import { env } from 'cloudflare:workers';

// Tencent OCR limits ImageBase64 to 10 MiB. Raw files must stay below 7.5 MiB
// because base64 expands data by roughly one third.
const maxBytes = Math.floor((10 * 1024 * 1024 * 3) / 4);
const hourlyLimit = 60;

async function consumeOcrAllowance(userId: string, units = 1) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / 3600) * 3600;
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS mini_ocr_usage (user_id TEXT NOT NULL, window_start INTEGER NOT NULL, request_count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, window_start))',
  ).run();
  await env.DB.prepare(
    'INSERT OR IGNORE INTO mini_ocr_usage (user_id, window_start, request_count) VALUES (?, ?, 0)',
  )
    .bind(userId, windowStart)
    .run();
  const result = await env.DB.prepare(
    'UPDATE mini_ocr_usage SET request_count = request_count + ? WHERE user_id = ? AND window_start = ? AND request_count <= ?',
  )
    .bind(units, userId, windowStart, hourlyLimit - units)
    .run();
  if (!result.meta.changes) return false;
  if (Math.random() < 0.02)
    await env.DB.prepare('DELETE FROM mini_ocr_usage WHERE window_start < ?')
      .bind(windowStart - 24 * 3600)
      .run();
  return true;
}

function isSupported(bytes: Uint8Array) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image';
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71)
    return 'image';
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
    return 'image';
  if (String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-') return 'pdf';
  return '';
}

export async function POST(req: Request) {
  const user = await getMiniProgramUser(req);
  if (!user) return Response.json({ error: '微信登录已失效，请重新登录' }, { status: 401 });
  let bytes: Uint8Array;
  let requestedPage = 0;
  if ((req.headers.get('content-type') || '').includes('application/json')) {
    const input = await req.json().catch(() => null) as { fileId?: unknown; page?: unknown } | null;
    const fileId = String(input?.fileId || '');
    requestedPage = Number(input?.page);
    if (!/^[a-f0-9]{64}$/.test(fileId) || !Number.isInteger(requestedPage) || requestedPage < 1)
      return Response.json({ error: '文件或页码无效' }, { status: 400 });
    const object = await env.FILES.get(`${user.userId}/${fileId}`);
    if (!object) return Response.json({ error: '未找到需要识别的文件' }, { status: 404 });
    if (object.size > maxBytes)
      return Response.json({ error: '用于识别的文件需小于 7.5MB' }, { status: 413 });
    bytes = new Uint8Array(await object.arrayBuffer());
  } else {
    const data = await req.formData();
    const file = data.get('file');
    if (!(file instanceof File))
      return Response.json({ error: '请选择需要识别的文件' }, { status: 400 });
    bytes = new Uint8Array(await file.arrayBuffer());
  }
  if (bytes.byteLength > maxBytes)
    return Response.json({ error: '用于识别的文件需小于 7.5MB' }, { status: 413 });
  const kind = isSupported(bytes);
  if (!kind)
    return Response.json({ error: '请选择 JPG、PNG、WebP 图片或 PDF 文件' }, { status: 400 });

  const pageCount = kind === 'pdf' ? pdfPageCount(bytes) : 1;
  if (pageCount > 50)
    return Response.json({ error: 'PDF 最多支持 50 页' }, { status: 400 });
  if (requestedPage > pageCount)
    return Response.json({ error: 'PDF 页码超出范围' }, { status: 400 });
  const pages = requestedPage ? [requestedPage] : Array.from({ length: pageCount }, (_, index) => index + 1);
  if (!(await consumeOcrAllowance(user.userId, pages.length)))
    return Response.json(
      { error: '本小时识别次数较多，请稍后再试' },
      { status: 429 },
    );

  try {
    const texts: string[] = [];
    const requestIds: string[] = [];
    const properties: ReturnType<typeof parseScreenshot> = [];
    for (const page of pages) {
      const result = await recognizeWithTencentOcr(
        bytes,
        env.TENCENT_CLOUD_SECRET_ID?.trim() || '',
        env.TENCENT_CLOUD_SECRET_KEY?.trim() || '',
        kind === 'pdf',
        page,
      );
      texts.push(result.text);
      if (result.requestId) requestIds.push(result.requestId);
      if (!result.text) continue;
      const isListingPage = kind !== 'pdf' || isListingDocumentText(result.text);
      const pageProperties = (isListingPage ? parseScreenshot(result.text, '') : []).filter(
        (property) =>
          property.suggestedPrice ||
          property.area ||
          property.layout ||
          property.code,
      );
      const rooms = parseFloorPlanRoomsFromText(result.text);
      if (pageProperties.length === 1 && rooms.length >= 2) {
        pageProperties[0].floorPlan = {
          image: '',
          text: result.text,
          rooms,
          confirmed: false,
        };
      }
      properties.push(...pageProperties);
    }
    return Response.json({
      text: texts.filter(Boolean).join('\n\n'),
      requestId: requestIds[0] || '',
      requestIds,
      pageCount,
      properties,
    });
  } catch (error) {
    if (error instanceof TencentOcrError) {
      console.error('Tencent OCR failed', {
        code: error.code,
        requestId: error.requestId,
      });
      return Response.json(
        {
          error:
            error.code === 'NotConfigured'
              ? error.message
              : '图片识别失败，请稍后重试或手动核对',
          requestId: error.requestId,
        },
        { status: error.code === 'NotConfigured' ? 503 : 502 },
      );
    }
    console.error('Unexpected OCR failure', error);
    return Response.json({ error: '图片识别失败，请稍后重试或手动核对' }, { status: 500 });
  }
}
