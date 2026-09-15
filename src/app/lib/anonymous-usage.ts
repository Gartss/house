import { newId } from './id';

export type UsageSummary = {
  total: number;
  activeToday: number;
  active7: number;
};

const VISITOR_KEY = 'house.anonymous.visitor.v1';

function visitorId() {
  const existing = localStorage.getItem(VISITOR_KEY);
  if (existing) return existing;
  const id = newId();
  localStorage.setItem(VISITOR_KEY, id);
  return id;
}

export async function recordAnonymousUse(): Promise<UsageSummary | null> {
  try {
    const result = await fetch('/api/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: visitorId() }),
    });
    if (!result.ok) return null;
    const value = (await result.json()) as UsageSummary;
    return Number.isInteger(value.total) ? value : null;
  } catch {
    return null;
  }
}
