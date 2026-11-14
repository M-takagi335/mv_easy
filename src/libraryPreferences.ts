import type { Template } from './animation.ts';

export const recentLimit = 16;
export type LibraryPreferences = { favorites: string[]; recent: string[] };
export const preferencesKey = 'mv-easy.template-library.v1';

export function parsePreferences(json: string | null, known: ReadonlySet<string>): LibraryPreferences {
  const clean = (value: unknown): string[] => Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => typeof id === 'string' && known.has(id)))] : [];
  try {
    const parsed = JSON.parse(json ?? 'null');
    return { favorites: clean(parsed?.favorites), recent: clean(parsed?.recent).slice(0, recentLimit) };
  } catch {
    return { favorites: [], recent: [] };
  }
}

export function rememberTemplate(ids: string[], id: string) {
  return [id, ...ids.filter(item => item !== id)].slice(0, recentLimit);
}

const normalized = (value: string) => value.normalize('NFKC').toLowerCase();
const labels = new WeakMap<Template, string>();
export function searchTemplates(templates: Template[], query: string) {
  const term = normalized(query.trim());
  if (!term) return templates;
  return templates.filter(item => {
    let label = labels.get(item);
    if (label === undefined) {
      label = normalized(item.label);
      labels.set(item, label);
    }
    return label.includes(term);
  });
}
