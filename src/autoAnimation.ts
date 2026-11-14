import { defaults } from './animation.ts';
import { FRAME_DURATION, trackId } from './model.ts';
import type { Animation, Layer, Span } from './model.ts';
import { drawTemplate, eligibleTemplates } from './randomAnimation.ts';
import type { Template } from './animation.ts';

export type AnimationDensity = 'low' | 'normal' | 'high';
type Role = 'entrance' | 'motion' | 'exit';
const counts = { low: 1, normal: 2, high: 3 };
const exits = new Set(['fade-out', 'slide-out', 'pop-out', 'bounce-out', 'spin-out', 'hinge-exit',
  'glyph-crumble-exit', 'glyph-fade-out', 'glyph-scatter', 'collapse']);

function roleOf(template: Template): Role {
  if (exits.has(template.id)) return 'exit';
  if (template.category === '登場・退場') return 'entrance';
  return 'motion';
}

const catalog = eligibleTemplates('text');

export function automaticCandidates(layer: Layer, role?: Role) {
  const canAnimateGlyphs = layer.end - layer.start >= 1.5 && layer.text.trim() !== '';
  return catalog.filter(template => (!role || roleOf(template) === role) && (!template.textOnly || canAnimateGlyphs));
}

export function applyAutomaticAnimations(layers: Layer[], selectedId: string, density: AnimationDensity, random = Math.random) {
  const selected = layers.find(layer => layer.id === selectedId && layer.kind === 'text');
  if (!selected) return { layers, added: 0, affected: 0 };
  const siblings = layers.filter(layer => layer.kind === 'text' && trackId(layer) === trackId(selected))
    .sort((a, b) => a.start - b.start);
  const changed = new Map<string, Layer>();
  const previous: Partial<Record<Role, string>> = {};
  const used = new Set<string>();
  let added = 0;
  for (const layer of siblings) {
    const length = layer.end - layer.start;
    const limit = Math.min(counts[density], length < 0.65 ? 1 : length < 1.5 ? 2 : 3);
    const window = Math.min(length, 0.55, Math.max(FRAME_DURATION, length * (limit === 1 ? 0.65 : 0.25)));
    const spans: Record<Role, Span> = {
      entrance: { start: 0, end: window },
      motion: { start: length * 0.3, end: length * 0.7 },
      exit: { start: length - window, end: length },
    };
    const roles: (Role | undefined)[] = length < 1.5
      ? (limit === 1 ? ['entrance'] : ['entrance', 'exit'])
      : limit === 1 ? [undefined]
      : limit === 2 ? (random() < 0.5 ? ['entrance', 'motion'] : ['motion', 'exit'])
      : ['entrance', 'motion', 'exit'];
    const existing = new Set(layer.animations.map(item => item.template));
    const animations: Animation[] = [];
    for (const role of roles) {
      const candidates = automaticCandidates(layer, role).filter(item => {
        const span = spans[roleOf(item)];
        return span.end - span.start >= FRAME_DURATION - 1e-9;
      });
      const alternatives = candidates.filter(item => item.id !== previous[roleOf(item)]);
      const available = alternatives.length ? alternatives : candidates;
      const fresh = available.filter(item => !existing.has(item.id));
      const pool = fresh.length ? fresh : available;
      const unused = pool.filter(item => !used.has(item.id));
      const draw = unused.length ? unused : pool;
      if (!draw.length) continue;
      const template = drawTemplate(draw, random);
      const chosenRole = roleOf(template);
      previous[chosenRole] = template.id;
      used.add(template.id);
      existing.add(template.id);
      animations.push({ ...spans[chosenRole], id: crypto.randomUUID(), template: template.id, params: defaults(template) });
    }
    if (animations.length) {
      added += animations.length;
      changed.set(layer.id, { ...layer, animations: [...layer.animations, ...animations] });
    }
  }
  return { layers: added ? layers.map(layer => changed.get(layer.id) ?? layer) : layers, added, affected: changed.size };
}
