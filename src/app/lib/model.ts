import {
  Community,
  FloorPlan,
  validExtras,
  validCommunities,
} from './property-extras';
import { newId } from './id';
export type Quote = {
  id: string;
  amount: number;
  date: string;
  createdAt: string;
  note: string;
  supersedes?: string;
};
export type Property = {
  id: string;
  name: string;
  communityId?: string;
  floorPlan?: FloorPlan;
  actualArea?: string;
  region?: string;
  district?: string;
  area: string;
  unitPrice: string;
  suggestedPrice?: string;
  suggestedDate?: string;
  suggestedQuoteNote?: string;
  suggestedTarget?: string;
  layout: string;
  floor: string;
  direction: string;
  decoration: string;
  code: string;
  year: string;
  lift: string;
  note: string;
  quotes: Quote[];
  images: string[];
  photos?: string[];
  archived?: boolean;
};
export type Draft = {
  id: string;
  image: string;
  text: string;
  properties: Property[];
};
export type HouseState = {
  properties: Property[];
  drafts: Draft[];
  communities?: Community[];
};
export const emptyState = (): HouseState => ({ properties: [], drafts: [] });
export function newProperty(): Property {
  return {
    id: newId(),
    name: '',
    region: '',
    district: '',
    area: '',
    actualArea: '',
    unitPrice: '',
    layout: '',
    floor: '',
    direction: '',
    decoration: '',
    code: '',
    year: '',
    lift: '',
    note: '',
    quotes: [],
    images: [],
    photos: [],
  };
}
export const activeQuotes = (p: Property) =>
  p.quotes.filter((q) => !p.quotes.some((n) => n.supersedes === q.id));
export const latestQuote = (p: Property) =>
  activeQuotes(p)
    .slice()
    .sort(
      (a, b) =>
        (b.date || '').localeCompare(a.date || '') ||
        b.createdAt.localeCompare(a.createdAt),
    )[0];
export const fields = [
  ['name', '小区 / 地址'],
  ['region', '区域'],
  ['district', '板块'],
  ['area', '建筑面积（㎡）'],
  ['unitPrice', '单价（元/㎡）'],
  ['layout', '户型'],
  ['floor', '楼层'],
  ['direction', '朝向'],
  ['decoration', '装修'],
  ['year', '建成年份'],
  ['lift', '电梯'],
  ['note', '备注'],
] as const;
export const DECORATION_OPTIONS = ['精装', '简装', '毛坯'] as const;
export const LIFT_OPTIONS = ['是', '否'] as const;
export function normalizedLift(value: string) {
  if (value === '是' || value.includes('有电梯')) return '是';
  if (value === '否' || value.includes('无电梯')) return '否';
  return '';
}
export function validateState(value: unknown): value is HouseState {
  const s = value as HouseState;
  if (
    !s ||
    !Array.isArray(s.properties) ||
    !Array.isArray(s.drafts) ||
    s.properties.length > 500 ||
    s.drafts.length > 100
  )
    return false;
  if (!validCommunities(s)) return false;
  const ids = new Set<string>();
  const valid = (p: Property) => {
    if (
      !p ||
      typeof p.id !== 'string' ||
      p.id.length > 100 ||
      !Array.isArray(p.quotes) ||
      !Array.isArray(p.images) ||
      p.quotes.length > 1000 ||
      p.images.length > 100
    )
      return false;
    if (
      !fields.every(
        ([k]) =>
          ((k === 'region' || k === 'district') && p[k] === undefined) ||
          (typeof p[k] === 'string' && p[k]!.length <= 5000),
      )
    )
      return false;
    if (p.actualArea !== undefined && typeof p.actualArea !== 'string')
      return false;
    if (
      p.photos !== undefined &&
      (!Array.isArray(p.photos) ||
        p.photos.length > 100 ||
        !p.photos.every((i) => /^[a-f0-9]{64}$/.test(i)))
    )
      return false;
    if (!validExtras(p)) return false;
    if (!p.images.every((i) => /^[a-f0-9]{64}$/.test(i))) return false;
    const qi = new Set<string>();
    return p.quotes.every((q) => {
      if (!q || typeof q.id !== 'string' || qi.has(q.id)) return false;
      qi.add(q.id);
      return (
        Number.isFinite(q.amount) &&
        q.amount > 0 &&
        q.amount < 10000000 &&
        typeof q.date === 'string' &&
        (!q.date ||
          (/^\d{4}-\d{2}-\d{2}$/.test(q.date) &&
            !isNaN(Date.parse(q.date)) &&
            new Date(q.date).toISOString().slice(0, 10) === q.date)) &&
        typeof q.createdAt === 'string' &&
        typeof q.note === 'string' &&
        q.note.length < 5000 &&
        (!q.supersedes || p.quotes.some((x) => x.id === q.supersedes))
      );
    });
  };
  return (
    s.properties.every((p) => {
      if (!valid(p) || !p.name.trim() || ids.has(p.id)) return false;
      ids.add(p.id);
      return true;
    }) &&
    s.drafts.every(
      (d) =>
        d &&
        typeof d.id === 'string' &&
        typeof d.text === 'string' &&
        d.text.length < 50000 &&
        /^[a-f0-9]{64}$/.test(d.image) &&
        Array.isArray(d.properties) &&
        d.properties.every(valid),
    )
  );
}
