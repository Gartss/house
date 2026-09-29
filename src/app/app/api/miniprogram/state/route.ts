import { getMiniProgramUser } from '@/app/miniprogram-auth';
import { emptyState, validateState } from '@/lib/model';
import { validTransition } from '@/lib/state-transition';
import { env } from 'cloudflare:workers';

const response = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: Request) {
  const user = await getMiniProgramUser(req);
  if (!user) return response({ error: '微信登录已失效，请重新登录' }, 401);
  const row = await env.DB.prepare(
    'SELECT payload, version FROM house_state WHERE owner = ?',
  )
    .bind(user.userId)
    .first<{ payload: string; version: number }>();
  return response({
    state: row ? JSON.parse(row.payload) : emptyState(),
    version: row?.version || 0,
  });
}

export async function POST(req: Request) {
  const user = await getMiniProgramUser(req);
  if (!user) return response({ error: '微信登录已失效，请重新登录' }, 401);
  const raw = await req.text();
  if (raw.length > 450000)
    return response({ error: '资料超过当前容量，请减少原图后重试' }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return response({ error: '资料格式错误' }, 400);
  }
  const { state, version, requestId } = body;
  if (
    !validateState(state) ||
    !Number.isInteger(version) ||
    typeof requestId !== 'string' ||
    !requestId ||
    requestId.length > 100
  )
    return response({ error: '请检查房源、金额和日期格式' }, 400);

  const row = await env.DB.prepare(
    'SELECT payload, version, request_id FROM house_state WHERE owner = ?',
  )
    .bind(user.userId)
    .first<{ payload: string; version: number; request_id: string }>();
  if (row?.request_id === requestId) return response({ version: row.version });
  if ((row?.version || 0) !== version)
    return response(
      { error: '资料已在其他设备更新，请核对后重试', conflict: true },
      409,
    );
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
    ...state.properties.flatMap((property) => property.images),
    ...state.properties.flatMap((property) => property.photos || []),
    ...state.drafts.map((draft) => draft.image),
    ...(state.communities || []).flatMap((community) =>
      community.quotes.map((quote) => quote.image),
    ),
  ].filter(Boolean);
  for (const id of new Set(allImages)) {
    if (!(await env.FILES.head(`${user.userId}/${id}`)))
      return response({ error: '原图尚未上传成功，请重试' }, 400);
  }

  const payload = JSON.stringify(state);
  if (!row) {
    const result = await env.DB.prepare(
      'INSERT OR IGNORE INTO house_state (owner, payload, version, request_id) VALUES (?, ?, 1, ?)',
    )
      .bind(user.userId, payload, requestId)
      .run();
    if (!result.meta.changes)
      return response({ error: '资料已更新，请刷新重试', conflict: true }, 409);
  } else {
    const result = await env.DB.prepare(
      'UPDATE house_state SET payload = ?, version = version + 1, request_id = ? WHERE owner = ? AND version = ?',
    )
      .bind(payload, requestId, user.userId, version)
      .run();
    if (!result.meta.changes)
      return response({ error: '资料已更新，请刷新重试', conflict: true }, 409);
  }
  return response({ version: Number(version) + 1 });
}
