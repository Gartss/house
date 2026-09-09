import { validTransition } from '@/lib/state-transition';
import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { emptyState, validateState } from '@/lib/model';
const response = (v: unknown, status = 200) =>
  Response.json(v, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET() {
  const u = await getChatGPTUser();
  if (!u) return response({ error: '请先登录' }, 401);
  const row = await env.DB.prepare(
    'SELECT payload, version FROM house_state WHERE owner = ?',
  )
    .bind(u.userId)
    .first<{ payload: string; version: number }>();
  return response({
    state: row ? JSON.parse(row.payload) : emptyState(),
    version: row?.version || 0,
  });
}
export async function POST(req: Request) {
  const u = await getChatGPTUser();
  if (!u) return response({ error: '请先登录' }, 401);
  if (req.headers.get('origin') !== new URL(req.url).origin)
    return response({ error: '请求来源不正确' }, 403);
  const raw = await req.text();
  if (raw.length > 450000)
    return response({ error: '资料超过首版容量，请先导出备份' }, 413);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return response({ error: '资料格式错误' }, 400);
  }
  const { state, version, requestId } = body;
  if (
    !validateState(state) ||
    !Number.isInteger(version) ||
    typeof requestId !== 'string' ||
    requestId.length > 100
  )
    return response({ error: '请检查房源、金额和日期格式' }, 400);
  const row = await env.DB.prepare(
    'SELECT payload, version, request_id FROM house_state WHERE owner = ?',
  )
    .bind(u.userId)
    .first<{ payload: string; version: number; request_id: string }>();
  if (row?.request_id === requestId) return response({ version: row.version });
  if ((row?.version || 0) !== version)
    return response({ error: '资料已在其他页面更新，请刷新后重试' }, 409);
  if (
    !validTransition(
      row ? JSON.parse(row.payload) : emptyState(),
      state,
      body.deletedPropertyIds ?? [],
    )
  )
    return response(
      { error: '删除房源需要明确确认；历史报价不能覆盖或删除，请追加更正记录' },
      400,
    );
  const allImages = [
    ...state.properties.flatMap((p) => p.images),
    ...state.drafts.map((d) => d.image),
    ...(state.communities || []).flatMap((c) => c.quotes.map((q) => q.image)),
  ].filter(Boolean);
  for (const id of new Set(allImages)) {
    if (!(await env.FILES.head(`${u.userId}/${id}`)))
      return response({ error: '原图尚未上传成功，请重试' }, 400);
  }
  const payload = JSON.stringify(state);
  if (!row) {
    const result = await env.DB.prepare(
      'INSERT OR IGNORE INTO house_state (owner,payload,version,request_id) VALUES (?,?,1,?)',
    )
      .bind(u.userId, payload, requestId)
      .run();
    if (!result.meta.changes)
      return response({ error: '资料已更新，请刷新重试' }, 409);
  } else {
    const result = await env.DB.prepare(
      'UPDATE house_state SET payload = ?, version = version + 1, request_id = ? WHERE owner = ? AND version = ?',
    )
      .bind(payload, requestId, u.userId, version)
      .run();
    if (!result.meta.changes)
      return response({ error: '资料已更新，请刷新重试' }, 409);
  }
  return response({ version: version + 1 });
}
