import { clamp } from './model.ts';
import type { Layer, Parameters } from './model.ts';

export type Pose = {
  x: number; y: number; scale: number; rotation: number; opacity: number; color: string;
};
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
  apply: (pose: Pose, progress: number, params: Parameters) => Pose;
};

export function defaults(template: Template): Parameters {
  return Object.fromEntries(template.controls.map(control => [control.key, control.initial]));
}

export function evaluate(layer: Layer, time: number, registry: ReadonlyMap<string, Template>): Pose {
  let pose = { x: layer.x, y: layer.y, scale: 1, rotation: layer.rotation, opacity: 1, color: layer.color };
  if (time < layer.start || time > layer.end) return { ...pose, opacity: 0 };
  for (const animation of layer.animations) {
    const template = registry.get(animation.template);
    if (!template || time < animation.start) continue;
    const progress = clamp((time - animation.start) / (animation.end - animation.start), 0, 1);
    pose = template.apply(pose, progress, animation.params);
  }
  return pose;
}
