import type { Control, Template, VisualFilter } from './animation.ts';

const level = (key: string, label: string, initial: number, max: number, step = 1): Control =>
  ({ key, label, initial, min: 0, max, step });
const strength = level('strength', '強さ (%)', 60, 100);
const radius = level('radius', '広がり (px)', 28, 100);
const speed = level('cycles', '周期数', 4, 24);
const seed = level('seed', 'シード', 7, 9999);
const tint: Control = { key: 'color', label: '色', initial: '#77dcff', color: true };
const interval: Control = { key: 'interval', label: '間隔 (秒)', initial: 0.07, min: 0.02, max: 0.4, step: 0.01 };
const count: Control = { key: 'count', label: '残像の数', initial: 4, min: 1, max: 8, step: 1 };
const direction = level('angle', '方向 (°)', 25, 360);
const ease = (p: number) => p * p * (3 - 2 * p);
const alpha = (opacity: number) => Math.round(Math.min(1, Math.max(0, opacity)) * 255).toString(16).padStart(2, '0');

function effect(id: string, label: string, controls: Control[], sample: Template['sample'], color = false): Template {
  return { id, label, controls, sample, icon: color ? 'color' : 'spark', tone: color ? 'pink' : 'blue',
    category: color ? '色変化' : 'グリッチ・エフェクト', activeOnly: true };
}

function colorFilter(id: string, label: string, kind: Extract<VisualFilter, { value: number }>['kind'], neutral: number, target: number) {
  return effect(id, label, [strength], (p, a) => ({
    filters: [{ kind, value: neutral + (target - neutral) * Number(a.strength) / 100 * ease(p) }],
  }), true);
}

export const visualEffects: Template[] = [
  effect('pulse-glow', 'パルスグロー', [tint, strength, radius, speed], (p, a) => ({
    filters: [{ kind: 'shadow', x: 0, y: 0, blur: Number(a.radius),
      color: String(a.color) + alpha(Number(a.strength) / 100 * (0.5 - 0.5 * Math.cos(2 * Math.PI * p * Number(a.cycles)))) }],
  })),
  effect('neon-glow', 'ネオングロー', [tint, strength, radius], (_p, a) => ({
    filters: [0.18, 1].map(factor => ({ kind: 'shadow', x: 0, y: 0, blur: Number(a.radius) * factor,
      color: String(a.color) + alpha(Number(a.strength) / 100) })),
  })),
  effect('blur', 'ブラー', [radius], (_p, a) => ({ filters: [{ kind: 'blur', value: Number(a.radius) }] })),
  effect('blur-out', 'ブラーアウト', [radius], (p, a) => ({ filters: [{ kind: 'blur', value: Number(a.radius) * ease(p) }] })),
  effect('directional-blur', '方向ブラー', [radius, direction, strength], (_p, a) => {
    const radians = Number(a.angle) * Math.PI / 180;
    return { filters: [{
      kind: 'directional', x: Math.cos(radians) * Number(a.radius),
      y: Math.sin(radians) * Number(a.radius), strength: Number(a.strength) / 100,
    }] };
  }),
  effect('digital-noise', 'デジタルノイズ', [strength, speed, seed, tint], (p, a) => {
    const step = Math.floor(p * Number(a.cycles) * 12);
    const random = (band: number) => {
      const noise = Math.sin((step + Number(a.seed)) * 127.1 + band * 311.7) * 43758.5453;
      return noise - Math.floor(noise);
    };
    const spacing = 160;
    const bands = Array.from({ length: 8 }, (_, band) => {
      const start = band * 20 + 12 * random(band);
      return [start, start + 1 + 6 * random(band + 8)];
    }).flat();
    return { lines: { spacing, offset: random(16) * spacing, bands,
      color: String(a.color), opacity: Number(a.strength) / 100 * random(17) } };
  }),
  effect('scanlines', 'スキャンライン', [level('spacing', '間隔 (px)', 12, 64), strength, tint, speed], (p, a) => ({
    lines: { spacing: Number(a.spacing), offset: p * Number(a.cycles) * Number(a.spacing),
      color: String(a.color), opacity: Number(a.strength) / 100 },
  })),
  effect('color-trail', 'カラー残像', [count, interval, strength, tint], (_p, a) => ({
    trail: { count: Number(a.count), interval: Number(a.interval), opacity: Number(a.strength) / 100, color: String(a.color) },
  })),
  effect('strobe', 'ストロボ', [speed, strength], (p, a) => ({
    opacity: (p * Number(a.cycles)) % 1 < 0.5 ? 1 : 1 - Number(a.strength) / 100,
  })),
  colorFilter('saturation', '彩度変化', 'saturate', 1, 3),
  colorFilter('brightness', '明るさ変化', 'brightness', 1, 2.5),
  colorFilter('contrast', 'コントラスト変化', 'contrast', 1, 3),
  colorFilter('monochrome', 'モノクロ化', 'grayscale', 0, 1),
  colorFilter('invert', '反転色', 'invert', 0, 1),
];
