import { defaults } from './animation.ts';
import type { Template } from './animation.ts';
import { initialAnimationSpan } from './model.ts';
import type { Animation, Layer } from './model.ts';
import { templates } from './templates.ts';

export type RandomGenre = Template['category'] | 'all';
export const RANDOM_BATCH_LIMIT = 300;

export function eligibleTemplates(kind: Layer['kind'], genre: RandomGenre = 'all') {
  return templates.filter(item => (genre === 'all' || item.category === genre) && (!item.textOnly || kind === 'text'));
}

export function drawTemplate(candidates: Template[], random: () => number, previous?: string) {
  const index = previous === undefined ? -1 : candidates.findIndex(item => item.id === previous);
  const skip = index >= 0 && candidates.length > 1;
  const draw = Math.floor(random() * (candidates.length - Number(skip)));
  return candidates.splice(draw + Number(skip && draw >= index), 1)[0];
}

export function randomAnimations(layer: Layer, playhead: number, count: number, genre: RandomGenre,
  random = Math.random): Animation[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > RANDOM_BATCH_LIMIT) return [];
  const placement = initialAnimationSpan(layer, playhead);
  if (!placement) return [];
  const { start, end } = placement;
  const existing = new Set(layer.animations.map(animation => animation.template));
  const pool = eligibleTemplates(layer.kind, genre);
  if (!pool.length) return [];

  const added: Animation[] = [];
  function draw(candidates: Template[]) {
    while (candidates.length && added.length < count) {
      const item = drawTemplate(candidates, random, added.at(-1)?.template);
      added.push({ start, end, id: crypto.randomUUID(), template: item.id, params: defaults(item) });
    }
  }
  draw(pool.filter(item => !existing.has(item.id)));
  draw(pool.filter(item => existing.has(item.id)));
  while (added.length < count) draw([...pool]);
  return added;
}
