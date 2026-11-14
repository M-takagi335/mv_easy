import { defaults } from './animation.ts';
import { FRAME_DURATION, trackId } from './model.ts';
import type { Animation, Layer, Span } from './model.ts';
import { registry } from './templates.ts';

export type AnimationDensity = 'low' | 'normal' | 'high';
const counts = { low: 1, normal: 2, high: 3 };
const pools = {
  entrance: ['fade-in', 'slide-in', 'pop-in', 'spin-in', 'glyph-fade-in'],
  motion: ['float', 'pulse', 'glyph-wave', 'tremble', 'glow', 'pulse-glow', 'neon-glow', 'color-trail', 'saturation'],
  exit: ['fade-out', 'slide-out', 'pop-out', 'spin-out', 'glyph-fade-out'],
} as const;

export function applyAutomaticAnimations(layers: Layer[], selectedId: string, density: AnimationDensity) {
  const selected = layers.find(layer => layer.id === selectedId && layer.kind === 'text');
  if (!selected) return { layers, added: 0, affected: 0 };
  const siblings = layers.filter(layer => layer.kind === 'text' && trackId(layer) === trackId(selected))
    .sort((a, b) => a.start - b.start);
  const changed = new Map<string, Layer>();
  const cursors = { entrance: 0, motion: 0, exit: 0 };
  let added = 0;
  for (const layer of siblings) {
    const length = layer.end - layer.start;
    const limit = Math.min(counts[density], length < 0.65 ? 1 : length < 1.5 ? 2 : 3);
    const window = Math.min(length, 0.55, Math.max(FRAME_DURATION, length * (limit === 1 ? 0.65 : 0.25)));
    const slots: { role: keyof typeof pools; span: Span }[] = [
      { role: 'entrance', span: { start: 0, end: window } },
    ];
    if (limit === 3) slots.push({ role: 'motion', span: { start: length * 0.3, end: length * 0.7 } });
    if (limit >= 2) slots.push({ role: 'exit', span: { start: length - window, end: length } });
    const existing = new Set(layer.animations.map(item => item.template));
    const animations: Animation[] = [];
    for (const { role, span } of slots) {
      if (span.end - span.start < FRAME_DURATION - 1e-9) continue;
      const pool = pools[role];
      const candidates = pool.map((_, index) => registry.get(pool[(cursors[role] + index) % pool.length]))
        .filter(template => template && (!template.textOnly || (length >= 1.5 && layer.text.trim())));
      const template = candidates.find(item => item && !existing.has(item.id)) ?? candidates[0];
      if (!template) continue;
      cursors[role] = pool.findIndex(id => id === template.id) + 1;
      animations.push({ ...span, id: crypto.randomUUID(), template: template.id, params: defaults(template) });
    }
    if (animations.length) {
      added += animations.length;
      changed.set(layer.id, { ...layer, animations: [...layer.animations, ...animations] });
    }
  }
  return { layers: added ? layers.map(layer => changed.get(layer.id) ?? layer) : layers, added, affected: changed.size };
}
