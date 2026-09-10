import { Draft, HouseState, Property, fields } from './model';

const normalize = (value?: string) =>
  (value || '').toLowerCase().replace(/[\s·•,，.。/\\()（）【】_-]/g, '');

const sameValue = (a?: string, b?: string) =>
  !!a && !!b && normalize(a) === normalize(b);

export function sameProperty(a: Property, b: Property) {
  if (a.code && b.code) return normalize(a.code) === normalize(b.code);
  if (!sameValue(a.name, b.name) || !sameValue(a.area, b.area)) return false;

  const identityFields: Array<
    'layout' | 'floor' | 'direction' | 'unitPrice' | 'suggestedPrice'
  > = ['layout', 'floor', 'direction', 'unitPrice', 'suggestedPrice'];
  if (
    identityFields.some((key) => a[key] && b[key] && !sameValue(a[key], b[key]))
  )
    return false;
  return identityFields.filter((key) => sameValue(a[key], b[key])).length >= 2;
}

export function mergePropertyInformation(target: Property, source: Property) {
  const merged = structuredClone(target);
  for (const [key] of fields)
    if (!merged[key] && source[key]) merged[key] = source[key];
  if (!merged.actualArea && source.actualArea)
    merged.actualArea = source.actualArea;
  if (!merged.floorPlan && source.floorPlan)
    merged.floorPlan = structuredClone(source.floorPlan);
  merged.images = Array.from(new Set([...merged.images, ...source.images]));
  merged.photos = Array.from(
    new Set([...(merged.photos || []), ...(source.photos || [])]),
  );
  if (!merged.suggestedPrice && source.suggestedPrice)
    merged.suggestedPrice = source.suggestedPrice;
  if (!merged.suggestedDate && source.suggestedDate)
    merged.suggestedDate = source.suggestedDate;
  if (!merged.suggestedQuoteNote && source.suggestedQuoteNote)
    merged.suggestedQuoteNote = source.suggestedQuoteNote;
  return merged;
}

export function mergeImportedDrafts(state: HouseState): HouseState {
  const next = structuredClone(state);
  const kept: { draft: Draft; property: Property }[] = [];

  for (const draft of next.drafts) {
    const remaining: Property[] = [];
    for (const property of draft.properties) {
      const draftMatches = kept.filter((item) =>
        sameProperty(item.property, property),
      );
      if (draftMatches.length === 1) {
        draftMatches[0].property = mergePropertyInformation(
          draftMatches[0].property,
          property,
        );
        const index = draftMatches[0].draft.properties.findIndex(
          (item) => item.id === draftMatches[0].property.id,
        );
        if (index >= 0)
          draftMatches[0].draft.properties[index] = draftMatches[0].property;
        continue;
      }

      const savedMatches = next.properties.filter((saved) =>
        sameProperty(saved, property),
      );
      if (savedMatches.length === 1)
        property.suggestedTarget = savedMatches[0].id;
      remaining.push(property);
      kept.push({ draft, property });
    }
    draft.properties = remaining;
  }
  next.drafts = next.drafts.filter((draft) => draft.properties.length);
  return next;
}
