import { CANVAS, clamp } from './model.ts';
import type { Layer } from './model.ts';
import type { Pose } from './animation.ts';

export type Geometry = Pick<Layer, 'x' | 'y' | 'width' | 'height'>;
export type Corner = readonly [number, number];

export function previewGeometry(base: Geometry, pose: Pose, dx: number, dy: number, corner?: Corner): Geometry {
  if (!corner) return { x: Math.round(base.x + dx), y: Math.round(base.y + dy), width: base.width, height: base.height };
  const angle = pose.rotation * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const [horizontal, vertical] = corner;
  const sx = Math.max(0.001, pose.scale * (pose.scaleX ?? 1));
  const sy = Math.max(0.001, pose.scale * (pose.scaleY ?? 1));
  const shear = Math.tan((pose.skew ?? 0) * Math.PI / 180);
  const localY = -dx * sin + dy * cos;
  const localX = dx * cos + dy * sin - shear * localY;
  const width = clamp(Math.round(base.width + horizontal * localX / sx), 1, CANVAS.width * 2);
  const height = clamp(Math.round(base.height + vertical * localY / sy), 1, CANVAS.height * 2);
  const shiftY = vertical * (height - base.height) * sy / 2;
  const shiftX = horizontal * (width - base.width) * sx / 2 + shear * shiftY;
  return {
    x: Math.round(base.x + shiftX * cos - shiftY * sin),
    y: Math.round(base.y + shiftX * sin + shiftY * cos),
    width, height,
  };
}
