import { clamp } from './model.ts';
import type { Layer, Parameters } from './model.ts';

export type Pose = {
  x: number; y: number; scale: number; rotation: number; opacity: number; color: string;
};
type Contribution = Partial<Omit<Pose, 'color'>> & { color?: { target: string; weight: number } };
export type Control =
  | { key: string; label: string; initial: number; min: number; max: number; step: number }
  | { key: string; label: string; initial: string; options: [string, string][] }
  | { key: string; label: string; initial: string; color: true };
export type Template = {
  id: string;
  label: string;
  icon: string;
  tone: string;
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
  let pose = { x: layer.x, y: layer.y, scale: 1, rotation: layer.rotation, opacity: 1, color: layer.color };
  if (time < layer.start || time > layer.end) return { ...pose, opacity: 0 };
  for (const animation of layer.animations) {
    const template = registry.get(animation.template);
    if (!template || time < animation.start) continue;
    const progress = clamp((time - animation.start) / (animation.end - animation.start), 0, 1);
    const effect = template.sample(progress, animation.params);
    pose.x += effect.x ?? 0;
    pose.y += effect.y ?? 0;
    pose.rotation += effect.rotation ?? 0;
    pose.scale *= effect.scale ?? 1;
    pose.opacity *= effect.opacity ?? 1;
    if (effect.color) pose.color = mixColor(pose.color, effect.color.target, effect.color.weight);
  }
  return pose;
}
