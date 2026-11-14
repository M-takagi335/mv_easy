import { animationTimelineSpan, clamp } from './model.ts';
import type { Animation, Layer, Parameters } from './model.ts';

export type Pose = {
  x: number; y: number; scale: number; rotation: number; opacity: number; color: string;
  scaleX?: number; scaleY?: number; skew?: number; blur?: number; hue?: number; glow?: number;
  rgb?: number; slice?: number;
  tiltX?: number; tiltY?: number; reveal?: string;
  filters?: VisualFilter[];
  trails?: Trail[];
  lines?: { spacing: number; opacity: number; color: string; offset: number; bands?: number[] }[];
  glyphs?: GlyphEffect[];
};
export type GlyphPose = { x?: number; y?: number; rotation?: number; scale?: number; opacity?: number;
  scaleX?: number; scaleY?: number; replacement?: string; tint?: { target: string; weight: number };
  glow?: { color: string; radius: number } };
export type GlyphEffect = { unit: string; sample: (index: number, count: number) => GlyphPose };
export type VisualFilter =
  | { kind: 'blur' | 'hue-rotate' | 'saturate' | 'brightness' | 'contrast' | 'grayscale' | 'invert' | 'sepia'; value: number }
  | { kind: 'shadow'; x: number; y: number; blur: number; color: string }
  | { kind: 'directional'; x: number; y: number; strength: number };
export type Trail = { count: number; interval: number; opacity: number; color?: string };
type Contribution = Partial<Omit<Pose, 'color' | 'glyphs' | 'filters' | 'trails' | 'lines'>> & {
  color?: { target: string; weight: number }; glyph?: GlyphEffect;
  filters?: VisualFilter[]; trail?: Trail; lines?: NonNullable<Pose['lines']>[number];
};
export const categories = ['登場・退場', '移動・浮遊', '回転・拡大縮小', 'バウンド・振動',
  '文字アニメーション', '色変化', 'グリッチ・エフェクト', '変形・特殊'] as const;
export type Control =
  | { key: string; label: string; initial: number; min: number; max: number; step: number }
  | { key: string; label: string; initial: string; options: [string, string][] }
  | { key: string; label: string; initial: string; color: true };
export type Template = {
  automaticRole?: 'entrance' | 'motion' | 'exit';
  id: string;
  label: string;
  icon: string;
  tone: string;
  category: typeof categories[number];
  textOnly?: boolean;
  activeOnly?: boolean;
  controls: Control[];
  sample: (progress: number, params: Parameters) => Contribution;
};

export function defaults(template: Template): Parameters {
  return Object.fromEntries(template.controls.map(control => [control.key, control.initial]));
}

const endpointSamples = new WeakMap<Animation, { template: Template; effect: Contribution }>();

function mixColor(from: string, to: string, progress: number): string {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  return '#' + [16, 8, 0].map(shift => {
    const start = (a >> shift) & 255;
    const end = (b >> shift) & 255;
    return Math.round(start + (end - start) * progress).toString(16).padStart(2, '0');
  }).join('');
}

export function evaluate(layer: Layer, time: number, registry: ReadonlyMap<string, Template>, includeTrails = true): Pose {
  const pose: Pose = { x: layer.x, y: layer.y, scale: 1, rotation: layer.rotation, opacity: 1, color: layer.color };
  if (time < layer.start || time > layer.end || (layer.endExclusive && time === layer.end)) return { ...pose, opacity: 0 };
  for (const animation of layer.animations) {
    const { start, end } = animationTimelineSpan(layer, animation);
    if (time < start) continue;
    const template = registry.get(animation.template);
    if (!template || (template.activeOnly && time >= end)) continue;
    const [from, to] = animation.phase ?? [0, 1];
    const fraction = end === start ? 1 : clamp((time - start) / (end - start), 0, 1);
    const progress = from + (to - from) * fraction;
    let effect: Contribution;
    if (fraction === 1) {
      const cached = endpointSamples.get(animation);
      if (cached?.template === template) effect = cached.effect;
      else {
        effect = template.sample(progress, animation.params);
        endpointSamples.set(animation, { template, effect });
      }
    } else effect = template.sample(progress, animation.params);
    pose.x += effect.x ?? 0;
    pose.y += effect.y ?? 0;
    pose.rotation += effect.rotation ?? 0;
    pose.scale *= effect.scale ?? 1;
    pose.opacity *= effect.opacity ?? 1;
    if (effect.color) pose.color = mixColor(pose.color, effect.color.target, effect.color.weight);
    for (const key of ['scaleX', 'scaleY'] as const) {
      if (effect[key] !== undefined) pose[key] = (pose[key] ?? 1) * effect[key];
    }
    for (const key of ['skew', 'blur', 'hue', 'glow', 'rgb', 'slice', 'tiltX', 'tiltY'] as const) {
      if (effect[key] !== undefined) pose[key] = (pose[key] ?? 0) + effect[key];
    }
    if (effect.reveal) pose.reveal = effect.reveal;
    if (effect.filters) (pose.filters ??= []).push(...effect.filters);
    if (effect.trail && includeTrails) (pose.trails ??= []).push(effect.trail);
    if (effect.lines) (pose.lines ??= []).push(effect.lines);
    if (effect.glyph && layer.kind === 'text') (pose.glyphs ??= []).push(effect.glyph);
  }
  return pose;
}

export function sampleTrails(layer: Layer, time: number, pose: Pose, registry: ReadonlyMap<string, Template>) {
  const copies: Pose[] = [];
  const trails = pose.trails ?? [];
  // Stacked trails can request the same historical pose with different tint or opacity.
  const sampled = trails.length > 1 ? new Map<number, Pose>() : undefined;
  for (const trail of trails) {
    for (let index = 1; index <= trail.count && copies.length < 12; index++) {
      const sampleTime = time - trail.interval * index;
      let past = sampled?.get(sampleTime);
      if (!past) {
        past = evaluate(layer, sampleTime, registry, false);
        sampled?.set(sampleTime, past);
      }
      if (past.opacity <= 0 || past.scale <= 0) continue;
      copies.push({ ...past, color: trail.color ?? past.color,
        opacity: past.opacity * trail.opacity * (1 - (index - 1) / trail.count) });
    }
    if (copies.length >= 12) break;
  }
  return copies.reverse();
}
