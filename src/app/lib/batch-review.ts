import { fields, HouseState, Property } from './model';
import { newId } from './id';
export type ReviewRow = {
  draftId: string;
  property: Property;
  amount: string;
  date: string;
  quoteNote: string;
  target: string;
  checked: boolean;
};
export function reviewRows(state: HouseState): ReviewRow[] {
  return state.drafts.flatMap((d) =>
    d.properties.map((p) => ({
      draftId: d.id,
      property: structuredClone(p),
      amount: p.suggestedPrice || '',
      date: p.suggestedDate || '',
      quoteNote: p.suggestedQuoteNote || '',
      target: p.suggestedTarget || '',
      checked: false,
    })),
  );
}
export async function applyOneReview(
  state: HouseState,
  rows: ReviewRow[],
  index: number,
  confirm: (text: string) => Promise<boolean>,
): Promise<HouseState> {
  const row = rows[index];
  if (!row) throw Error('待核对房源不存在，请重新打开审核页');
  const current = reviewRows(state);
  const target = current.findIndex(
    (r) => r.draftId === row.draftId && r.property.id === row.property.id,
  );
  if (target < 0) throw Error('待核对房源已变化，请重新打开审核页');
  current[target] = { ...structuredClone(row), checked: true };
  return applyReview(state, current, true, confirm);
}
export function removeReviewRow(state: HouseState, row: ReviewRow): HouseState {
  const next = structuredClone(state);
  const draft = next.drafts.find((d) => d.id === row.draftId);
  if (!draft) throw Error('待核对房源已变化，请重新打开审核页');
  draft.properties = draft.properties.filter((p) => p.id !== row.property.id);
  next.drafts = next.drafts.filter((d) => d.properties.length);
  return next;
}
export async function applyReview(
  state: HouseState,
  rows: ReviewRow[],
  final: boolean,
  confirm: (text: string) => Promise<boolean>,
): Promise<HouseState> {
  const next = structuredClone(state);
  for (const draft of next.drafts)
    draft.properties = draft.properties.filter((p) =>
      rows.some((r) => r.draftId === draft.id && r.property.id === p.id),
    );
  const picked = rows.filter((r) => r.checked);
  if (final && !picked.length) throw Error('请勾选已核对的房源');
  // Validate the entire selection before any merge or write.
  if (final)
    for (const [i, r] of rows.entries()) {
      if (!r.checked) continue;
      if (!r.property.name.trim() && !r.target)
        throw Error(`第${i + 1}行：请填写小区 / 地址`);
      if (r.target && !state.properties.some((p) => p.id === r.target))
        throw Error(`第${i + 1}行：关联房源不存在`);
      if (
        r.amount &&
        (!Number.isFinite(Number(r.amount)) || Number(r.amount) <= 0)
      )
        throw Error(`第${i + 1}行：总价必须大于0`);
      if (
        r.date &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
          isNaN(Date.parse(r.date)) ||
          new Date(r.date).toISOString().slice(0, 10) !== r.date)
      )
        throw Error(`第${i + 1}行：报价日期无效`);
    }
  for (const r of rows) {
    const draft = next.drafts.find((d) => d.id === r.draftId);
    if (!draft) throw Error('草稿已变化，请返回后重新打开');
    const p = structuredClone(r.property);
    p.suggestedPrice = r.amount;
    p.suggestedDate = r.date;
    p.suggestedQuoteNote = r.quoteNote;
    p.suggestedTarget = r.target;
    if (!final || !r.checked) {
      const i = draft.properties.findIndex((x) => x.id === p.id);
      if (i < 0) draft.properties.push(p);
      else draft.properties[i] = p;
      continue;
    }
    delete p.suggestedPrice;
    delete p.suggestedDate;
    delete p.suggestedQuoteNote;
    delete p.suggestedTarget;
    if (r.amount)
      p.quotes.push({
        id: newId(),
        amount: Number(r.amount),
        date: r.date,
        createdAt: new Date().toISOString(),
        note: r.quoteNote,
      });
    if (r.target) {
      const old = next.properties.find((x) => x.id === r.target)!;
      for (const [key, label] of fields) {
        if (
          p[key] &&
          p[key] !== old[key] &&
          (!old[key] ||
            (await confirm(
              `${old.name} · ${label}\n原值：${old[key]}\n新值：${p[key]}\n采用新值吗？`,
            )))
        )
          old[key] = p[key];
      }
      if (
        p.actualArea &&
        p.actualArea !== old.actualArea &&
        (!old.actualArea ||
          (await confirm(
            `${old.name} · 实际面积\n原值：${old.actualArea}\n新值：${p.actualArea}\n采用新值吗？`,
          )))
      )
        old.actualArea = p.actualArea;
      old.images = Array.from(new Set([...old.images, ...p.images]));
      old.photos = Array.from(
        new Set([...(old.photos || []), ...(p.photos || [])]),
      );
      old.quotes.push(...p.quotes);
      if (
        p.floorPlan &&
        (!old.floorPlan ||
          (await confirm(`${old.name}：用本次核对的户型面积替换原明细？`)))
      )
        old.floorPlan = p.floorPlan;
    } else {
      if (next.properties.some((x) => x.id === p.id))
        throw Error('这套房已保存，请重新打开待核对列表');
      next.properties.push(p);
    }
    draft.properties = draft.properties.filter((x) => x.id !== p.id);
  }
  next.drafts = next.drafts.filter((d) => d.properties.length);
  return next;
}
