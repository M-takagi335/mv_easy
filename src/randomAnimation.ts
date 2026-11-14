import { defaults } from './animation.ts';
import type { Template } from './animation.ts';
import { initialAnimationSpan } from './model.ts';
import type { Animation, Layer } from './model.ts';
import { templates } from './templates.ts';

export type RandomGenre = Template['category'] | 'all';
export const RANDOM_BATCH_LIMIT = 300;

export function randomAnimations(layer: Layer, playhead: number, count: number, genre: RandomGenre,
  random = Math.random): Animation[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > RANDOM_BATCH_LIMIT) return [];
  const placement = initialAnimationSpan(layer, playhead);
  if (!placement) return [];
  const span = placement;
  const existing = new Set(layer.animations.map(animation => animation.template));
  const pool = templates.filter(item => (genre === 'all' || item.category === genre) &&
    (!item.textOnly || layer.kind === 'text'));
  if (!pool.length) return [];

  const added: Animation[] = [];
  function draw(candidates: Template[]) {
    for (let i = candidates.length - 1; i >= 0 && added.length < count; i--) {
      const index = Math.floor(random() * (i + 1));
      [candidates[i], candidates[index]] = [candidates[index], candidates[i]];
      const item = candidates[i];
      added.push({ ...span, id: crypto.randomUUID(), template: item.id, params: defaults(item) });
    }
  }
  draw(pool.filter(item => !existing.has(item.id)));
  draw(pool.filter(item => existing.has(item.id)));
  while (added.length < count) draw([...pool]);
  return added;
}
