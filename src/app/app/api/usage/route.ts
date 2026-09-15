import { env } from 'cloudflare:workers';

const response = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });

const visitorIdPattern = /^[a-f0-9-]{36}$/i;

async function ensureUsageTables() {
  await env.DB.batch([
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS anonymous_visitors (visitor_id TEXT PRIMARY KEY NOT NULL, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL)',
    ),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS anonymous_visitor_days (visitor_id TEXT NOT NULL, active_day TEXT NOT NULL, PRIMARY KEY (visitor_id, active_day))',
    ),
  ]);
}

async function usageSummary() {
  const totals = await env.DB.prepare(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN datetime(last_seen) >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS active7 FROM anonymous_visitors",
  ).first<{ total: number; active7: number | null }>();
  const today = await env.DB.prepare(
    "SELECT COUNT(*) AS activeToday FROM anonymous_visitor_days WHERE active_day = date('now', '+8 hours')",
  ).first<{ activeToday: number }>();
  return {
    total: Number(totals?.total || 0),
    activeToday: Number(today?.activeToday || 0),
    active7: Number(totals?.active7 || 0),
  };
}

export async function GET() {
  await ensureUsageTables();
  return response(await usageSummary());
}

export async function POST(req: Request) {
  if (req.headers.get('origin') !== new URL(req.url).origin)
    return response({ error: '请求来源不正确' }, 403);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (
    typeof body.visitorId !== 'string' ||
    !visitorIdPattern.test(body.visitorId)
  )
    return response({ error: '匿名编号格式错误' }, 400);

  await ensureUsageTables();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO anonymous_visitors (visitor_id, first_seen, last_seen) VALUES (?, ?, ?) ON CONFLICT(visitor_id) DO UPDATE SET last_seen = excluded.last_seen',
    ).bind(body.visitorId, now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO anonymous_visitor_days (visitor_id, active_day) VALUES (?, date('now', '+8 hours'))",
    ).bind(body.visitorId),
  ]);
  return response(await usageSummary());
}
