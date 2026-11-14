import { categories } from './animation.ts';
import type { Control, GlyphPose, Template } from './animation.ts';

const control = (key: string, label: string, initial: number, max: number): Control =>
  ({ key, label, initial, min: 0, max, step: 1 });
export const distance = control('distance', '距離 (px)', 190, 960);
export const angle = control('angle', '角度 (°)', 60, 180);
export const strength = control('strength', '強さ (%)', 65, 100);
export const count = control('count', '回数', 4, 12);
export const seed = control('seed', 'シード', 19, 999);
const lag = control('lag', '文字の時間差 (%)', 53, 90);
export const tint: Control = { key: 'color', label: '色', initial: '#73edff', color: true };
type Knobs = { d: number; a: number; s: number; n: number; seed: number; lag: number; color: string };
const knobs = (p: Parameters<Template['sample']>[1]): Knobs => ({
  d: Number(p.distance), a: Number(p.angle), s: Number(p.strength) / 100, n: Math.max(1, Math.min(12, Number(p.count))),
  seed: Number(p.seed), lag: Number(p.lag) / 100, color: String(p.color),
});
export const limit = (p: number) => Math.min(1, Math.max(0, p));
export const ease = (p: number) => { const x = limit(p); return x * x * (3 - 2 * x); };
export const arc = (p: number) => 4 * p * (1 - p);
export const sin = (p: number) => Math.sin(2 * Math.PI * p);
export const cos = (p: number) => Math.cos(2 * Math.PI * p);
export const rnd = (i: number, seed: number) => {
  const value = 43758.5453 * Math.sin(i * 127.1 + seed * 311.7);
  return value - Math.floor(value);
};
type Effect = ReturnType<Template['sample']>;
type Role = Template['automaticRole'];
export function effect(category: number, id: string, label: string, controls: Control[],
  sample: (p: number, k: Knobs) => Effect, automaticRole?: Role): Template {
  return { id, label, category: categories[category], controls, sample: (p, params) => sample(p, knobs(params)),
    icon: ['slideIn', 'slideOut', 'rotate', 'bounce', 'text', 'color', 'spark', 'shrink'][category],
    tone: category === 5 ? 'pink' : 'violet', activeOnly: category === 5 || category === 6, automaticRole };
}
export function glyph(id: string, label: string, controls: Control[],
  sample: (p: number, i: number, global: number, k: Knobs) => GlyphPose, options: { stagger?: boolean; role?: Role } = {}): Template {
  const stagger = options.stagger !== false;
  return { ...effect(4, id, label, stagger ? [lag, ...controls] : controls, (p, k) => ({
    glyph: { unit: 'grapheme', sample: (i, total) => {
      const local = stagger && total > 1 ? limit((p - k.lag * i / (total - 1)) / (1 - k.lag)) : p;
      return sample(local, i, p, k);
    } },
  }), options.role), textOnly: true };
}
