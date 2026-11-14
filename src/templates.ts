import type { Control, Pose, Template } from './animation.ts';
import type { Parameters } from './model.ts';

const direction: Control = {
  key: 'direction', label: '方向', initial: 'left',
  options: [['left', '左'], ['right', '右'], ['up', '上'], ['down', '下']],
};
const number = (key: string, label: string, initial: number, min: number, max: number, step = 1): Control =>
  ({ key, label, initial, min, max, step });
const distance = number('distance', '距離 (px)', 320, 0, 1920, 10);
const strength = number('strength', '強さ (px)', 80, 0, 400, 5);
const ease = (p: number) => p * p * (3 - 2 * p);

function slide(pose: Pose, amount: number, params: Parameters): Pose {
  const offset = amount * Number(params.distance);
  const [x, y] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[String(params.direction)] ?? [0, 0];
  return { ...pose, x: pose.x + x * offset, y: pose.y + y * offset };
}

function mixColor(from: string, to: string, progress: number): string {
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const channels = [16, 8, 0].map(shift => {
    const start = (a >> shift) & 255;
    const end = (b >> shift) & 255;
    return Math.round(start + (end - start) * progress).toString(16).padStart(2, '0');
  });
  return '#' + channels.join('');
}

export const templates: Template[] = [
  { id: 'fade-in', label: 'フェードイン', icon: 'fadeIn', tone: 'violet',
    controls: [number('opacity', '開始時の不透明度 (%)', 0, 0, 100)],
    apply: (pose, p, params) => ({ ...pose, opacity: pose.opacity * (1 - (1 - Number(params.opacity) / 100) * (1 - p)) }) },
  { id: 'fade-out', label: 'フェードアウト', icon: 'fadeOut', tone: 'violet',
    controls: [number('opacity', '終了時の不透明度 (%)', 0, 0, 100)],
    apply: (pose, p, params) => ({ ...pose, opacity: pose.opacity * (1 - (1 - Number(params.opacity) / 100) * p) }) },
  { id: 'slide-in', label: 'スライドイン', icon: 'slideIn', tone: 'blue', controls: [direction, distance],
    apply: (pose, p, params) => slide(pose, 1 - ease(p), params) },
  { id: 'slide-out', label: 'スライドアウト', icon: 'slideOut', tone: 'blue', controls: [direction, distance],
    apply: (pose, p, params) => slide(pose, ease(p), params) },
  { id: 'grow', label: '拡大', icon: 'grow', tone: 'mint', controls: [number('scale', '最終サイズ (%)', 150, 100, 400)],
    apply: (pose, p, params) => ({ ...pose, scale: pose.scale * (1 + (Number(params.scale) / 100 - 1) * ease(p)) }) },
  { id: 'shrink', label: '縮小', icon: 'shrink', tone: 'mint', controls: [number('scale', '最終サイズ (%)', 50, 0, 100)],
    apply: (pose, p, params) => ({ ...pose, scale: pose.scale * (1 + (Number(params.scale) / 100 - 1) * ease(p)) }) },
  { id: 'rotate', label: '回転', icon: 'rotate', tone: 'peach', controls: [number('angle', '回転角度 (°)', 360, -1080, 1080, 5)],
    apply: (pose, p, params) => ({ ...pose, rotation: pose.rotation + Number(params.angle) * ease(p) }) },
  { id: 'bounce', label: 'バウンド', icon: 'bounce', tone: 'peach',
    controls: [strength, number('cycles', '回数', 3, 1, 12)],
    apply: (pose, p, params) => ({ ...pose, y: pose.y - Number(params.strength) * (1 - p) * Math.abs(Math.sin(Math.PI * Number(params.cycles) * p)) }) },
  { id: 'shake', label: 'シェイク', icon: 'shake', tone: 'pink',
    controls: [strength, number('cycles', '回数', 5, 1, 20)],
    apply: (pose, p, params) => ({ ...pose, x: pose.x + Number(params.strength) * (1 - p) * Math.sin(2 * Math.PI * Number(params.cycles) * p) }) },
  { id: 'color', label: '色変化', icon: 'color', tone: 'pink',
    controls: [{ key: 'color', label: '変化後の色', initial: '#b29aff', color: true }],
    apply: (pose, p, params) => ({ ...pose, color: mixColor(pose.color, String(params.color), p) }) },
];

export const registry = new Map(templates.map(template => [template.id, template]));
