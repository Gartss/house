import { newId } from './id';

export type RoomArea = {
  id: string;
  name: string;
  area: string;
  included: boolean;
};
export type FloorPlan = {
  image: string;
  text: string;
  rooms: RoomArea[];
  confirmed: boolean;
};
export type CommunityQuote = {
  id: string;
  amount: number;
  unit: '元/㎡' | '万元';
  period: string;
  kind: string;
  image: string;
  createdAt: string;
};
export type Community = {
  id: string;
  name: string;
  region: string;
  quotes: CommunityQuote[];
};
export function areaSummary(area: string, plan?: FloorPlan) {
  if (!plan?.confirmed || !plan.rooms.length) return null;
  const rooms = plan.rooms.filter((r) => r.included);
  if (
    !rooms.length ||
    rooms.some(
      (r) =>
        !r.name.trim() ||
        r.name.includes('待核对') ||
        !Number.isFinite(Number(r.area)) ||
        Number(r.area) <= 0,
    )
  )
    return null;
  const total = Number(
    rooms.reduce((sum, r) => sum + Number(r.area), 0).toFixed(2),
  );
  return {
    total,
    rate:
      Number(area) > 0
        ? Number(((total / Number(area)) * 100).toFixed(2))
        : null,
  };
}
export function actualAreaSummary(
  area: string,
  plan?: FloorPlan,
  manual?: string,
) {
  const parsed = areaSummary(area, plan);
  if (parsed) return parsed;
  const total = Number(manual);
  if (!Number.isFinite(total) || total <= 0) return null;
  return {
    total: Number(total.toFixed(2)),
    rate:
      Number(area) > 0
        ? Number(((total / Number(area)) * 100).toFixed(2))
        : null,
  };
}
export function parseRooms(text: string): RoomArea[] {
  const clean = text.replace(/[ \t]/g, '');
  const rooms: RoomArea[] = [];
  const pattern =
    /(厨房|卫生间|卫|客厅|餐厅|卧室|主卧|次卧|阳台|书房|储藏室|过道|玄关)([A-Z\d]?)[^\d\u4e00-\u9fff]{0,18}(\d+(?:\.\d+)?)\s*(?:㎡|m[²2i]?|平米)/gi;
  for (const match of clean.matchAll(pattern))
    rooms.push({
      id: newId(),
      name: match[1] + match[2],
      area: match[3],
      included: !['阳台'].includes(match[1]),
    });
  return rooms;
}
export function parseCommunityQuote(text: string) {
  const clean = text.replace(/[ \t]/g, '');
  const lines = clean.split('\n');
  const index = lines.findIndex((l) => /成交(?:均价|价)/.test(l));
  if (index < 0)
    return { amount: '', unit: '元/㎡' as const, kind: '', period: '' };
  const line = lines[index];
  const tail = line.slice(line.indexOf('成交'));
  const priceText = tail + '\n' + (lines[index + 1] || '');
  const price = priceText.match(
    /(\d{1,3}(?:[,，.]\d{3})+|\d+(?:\.\d+)?)\s*(万元|万|元)\s*(?:\/(㎡|平|m[²2i]?))?/i,
  );
  let amount = price
    ? price[1].includes(',') ||
      price[1].includes('，') ||
      (/^\d{1,3}\.\d{3}$/.test(price[1]) && price[2] === '元')
      ? price[1].replace(/[,，.]/g, '')
      : price[1]
    : '';
  const perArea = !!price?.[3];
  if (price && perArea && price[2] !== '元')
    amount = String(Number(amount) * 10000);
  return {
    amount,
    unit:
      perArea || price?.[2] === '元' ? ('元/㎡' as const) : ('万元' as const),
    kind: line.includes('均价') ? '成交均价' : '成交价',
    period: line.match(/20\d{2}[年/.-]\d{1,2}月?/)?.[0] || '',
  };
}
export function validExtras(p: any) {
  if (p.communityId !== undefined && typeof p.communityId !== 'string')
    return false;
  if (p.floorPlan === undefined) return true;
  const f = p.floorPlan;
  return (
    !!f &&
    typeof f.image === 'string' &&
    /^[a-f0-9]{64}$/.test(f.image) &&
    p.images.includes(f.image) &&
    typeof f.text === 'string' &&
    f.text.length <= 50000 &&
    typeof f.confirmed === 'boolean' &&
    Array.isArray(f.rooms) &&
    f.rooms.length <= 100 &&
    f.rooms.every(
      (r: any) =>
        r &&
        typeof r.id === 'string' &&
        typeof r.name === 'string' &&
        r.name.length <= 100 &&
        typeof r.area === 'string' &&
        r.area.length <= 30 &&
        typeof r.included === 'boolean',
    ) &&
    (!f.confirmed || areaSummary(p.area, f) !== null)
  );
}
export function validCommunities(s: any) {
  if (s.communities === undefined) return true;
  if (!Array.isArray(s.communities) || s.communities.length > 500) return false;
  const ids = new Set();
  return (
    s.communities.every((c: any) => {
      if (
        !c ||
        typeof c.id !== 'string' ||
        ids.has(c.id) ||
        typeof c.name !== 'string' ||
        !c.name.trim() ||
        c.name.length > 500 ||
        typeof c.region !== 'string' ||
        !Array.isArray(c.quotes) ||
        c.quotes.length > 1000
      )
        return false;
      ids.add(c.id);
      const qids = new Set();
      return c.quotes.every((q: any) => {
        if (!q || typeof q.id !== 'string' || qids.has(q.id)) return false;
        qids.add(q.id);
        return (
          Number.isFinite(q.amount) &&
          q.amount > 0 &&
          q.amount < 10000000 &&
          ['元/㎡', '万元'].includes(q.unit) &&
          typeof q.period === 'string' &&
          q.period.length <= 100 &&
          typeof q.kind === 'string' &&
          q.kind.length <= 100 &&
          typeof q.createdAt === 'string' &&
          (!q.image || /^[a-f0-9]{64}$/.test(q.image))
        );
      });
    }) &&
    s.properties.every(
      (p: any) =>
        !!p &&
        (!p.communityId ||
          s.communities.some((c: any) => c.id === p.communityId)),
    )
  );
}
