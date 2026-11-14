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
  const width = clamp(Math.round(base.width + horizontal * (dx * cos + dy * sin) / pose.scale), 1, CANVAS.width * 2);
  const height = clamp(Math.round(base.height + vertical * (-dx * sin + dy * cos) / pose.scale), 1, CANVAS.height * 2);
  const shiftX = horizontal * (width - base.width) * pose.scale / 2;
  const shiftY = vertical * (height - base.height) * pose.scale / 2;
  return {
    x: Math.round(base.x + shiftX * cos - shiftY * sin),
    y: Math.round(base.y + shiftX * sin + shiftY * cos),
    width, height,
  };
}
