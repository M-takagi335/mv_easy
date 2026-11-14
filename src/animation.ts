import { animationTimelineSpan, clamp } from './model.ts';
import type { Layer, Parameters } from './model.ts';

export type Pose = {
  x: number; y: number; scale: number; rotation: number; opacity: number; color: string;
  scaleX?: number; scaleY?: number; skew?: number; blur?: number; hue?: number; glow?: number;
  rgb?: number; trail?: number; slice?: number;
  glyphs?: GlyphEffect[];
};
export type GlyphPose = { x?: number; y?: number; rotation?: number; scale?: number; opacity?: number };
export type GlyphEffect = { unit: string; sample: (index: number, count: number) => GlyphPose };
type Contribution = Partial<Omit<Pose, 'color' | 'glyphs'>> & {
  color?: { target: string; weight: number }; glyph?: GlyphEffect;
};
export const categories = ['登場・退場', '移動・浮遊', '回転・拡大縮小', 'バウンド・振動',
  '文字アニメーション', '色変化', 'グリッチ・エフェクト', '変形・特殊'] as const;
export type Control =
  | { key: string; label: string; initial: number; min: number; max: number; step: number }
  | { key: string; label: string; initial: string; options: [string, string][] }
  | { key: string; label: string; initial: string; color: true };
export type Template = {
  id: string;
  label: string;
  icon: string;
  tone: string;
  category: typeof categories[number];
  textOnly?: boolean;
  controls: Control[];
  sample: (progress: number, params: Parameters) => Contribution;
};

export function defaults(template: Template): Parameters {
  return Object.fromEntries(template.controls.map(control => [control.key, control.initial]));
}

function mixColor(from: string, to: string, progress: number): string {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  return '#' + [16, 8, 0].map(shift => {
    const start = (a >> shift) & 255;
    const end = (b >> shift) & 255;
    return Math.round(start + (end - start) * progress).toString(16).padStart(2, '0');
  }).join('');
}

export function evaluate(layer: Layer, time: number, registry: ReadonlyMap<string, Template>): Pose {
  const pose: Pose = { x: layer.x, y: layer.y, scale: 1, rotation: layer.rotation, opacity: 1, color: layer.color };
  if (time < layer.start || time > layer.end || (layer.endExclusive && time === layer.end)) return { ...pose, opacity: 0 };
  for (const animation of layer.animations) {
    const template = registry.get(animation.template);
    const { start, end } = animationTimelineSpan(layer, animation);
    if (!template || time < start) continue;
    const [from, to] = animation.phase ?? [0, 1];
    const fraction = end === start ? 1 : clamp((time - start) / (end - start), 0, 1);
    const progress = from + (to - from) * fraction;
    const effect = template.sample(progress, animation.params);
    pose.x += effect.x ?? 0;
    pose.y += effect.y ?? 0;
    pose.rotation += effect.rotation ?? 0;
    pose.scale *= effect.scale ?? 1;
    pose.opacity *= effect.opacity ?? 1;
    if (effect.color) pose.color = mixColor(pose.color, effect.color.target, effect.color.weight);
    for (const key of ['scaleX', 'scaleY'] as const) {
      if (effect[key] !== undefined) pose[key] = (pose[key] ?? 1) * effect[key];
    }
    for (const key of ['skew', 'blur', 'hue', 'glow', 'rgb', 'trail', 'slice'] as const) {
      if (effect[key] !== undefined) pose[key] = (pose[key] ?? 0) + effect[key];
    }
    if (effect.glyph && layer.kind === 'text') (pose.glyphs ??= []).push(effect.glyph);
  }
  return pose;
}
