import type { HouseState } from './model';
export function validTransition(
  previous: HouseState,
  next: HouseState,
  deleted: unknown = [],
): boolean {
  if (
    !Array.isArray(deleted) ||
    deleted.some((id) => typeof id !== 'string') ||
    new Set(deleted).size !== deleted.length
  )
    return false;
  if (
    deleted.some(
      (id) =>
        !previous.properties.some((p) => p.id === id) ||
        next.properties.some((p) => p.id === id),
    )
  )
    return false;
  if (
    (previous.communities || []).some((c) => {
      const updated = next.communities?.find((n) => n.id === c.id);
      return (
        !updated ||
        c.quotes.some((q) => {
          const sameId = updated.quotes.find((n) => n.id === q.id);
          return (
            sameId !== undefined && JSON.stringify(sameId) !== JSON.stringify(q)
          );
        })
      );
    })
  )
    return false;
  return previous.properties.every((p) => {
    const target = next.properties.find((n) => n.id === p.id);
    if (!target) return deleted.includes(p.id);
    return p.quotes.every((q) => {
      const sameId = target.quotes.find((n) => n.id === q.id);
      return (
        sameId === undefined || JSON.stringify(sameId) === JSON.stringify(q)
      );
    });
  });
}
