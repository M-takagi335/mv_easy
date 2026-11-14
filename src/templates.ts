import type { Control, Template } from './animation.ts';
import { additionalTemplates } from './additionalTemplates.ts';
import { visualEffects } from './visualEffects.ts';
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

function slide(amount: number, params: Parameters) {
  const offset = amount * Number(params.distance);
  const [x, y] = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[String(params.direction)] ?? [0, 0];
  return { x: x * offset, y: y * offset };
}

const originalTemplates: Template[] = [
  { id: 'fade-in', label: 'フェードイン', icon: 'fadeIn', tone: 'violet', category: '登場・退場',
    controls: [number('opacity', '開始時の不透明度 (%)', 0, 0, 100)],
    sample: (p, params) => ({ opacity: (1 - (1 - Number(params.opacity) / 100) * (1 - p)) }) },
  { id: 'fade-out', label: 'フェードアウト', icon: 'fadeOut', tone: 'violet', category: '登場・退場',
    controls: [number('opacity', '終了時の不透明度 (%)', 0, 0, 100)],
    sample: (p, params) => ({ opacity: (1 - (1 - Number(params.opacity) / 100) * p) }) },
  { id: 'slide-in', label: 'スライドイン', icon: 'slideIn', tone: 'blue', category: '登場・退場', controls: [direction, distance],
    sample: (p, params) => slide(1 - ease(p), params) },
  { id: 'slide-out', label: 'スライドアウト', icon: 'slideOut', tone: 'blue', category: '登場・退場', controls: [direction, distance],
    sample: (p, params) => slide(ease(p), params) },
  { id: 'grow', label: '拡大', icon: 'grow', tone: 'mint', category: '回転・拡大縮小', controls: [number('scale', '最終サイズ (%)', 150, 100, 400)],
    sample: (p, params) => ({ scale: (1 + (Number(params.scale) / 100 - 1) * ease(p)) }) },
  { id: 'shrink', label: '縮小', icon: 'shrink', tone: 'mint', category: '回転・拡大縮小', controls: [number('scale', '最終サイズ (%)', 50, 0, 100)],
    sample: (p, params) => ({ scale: (1 + (Number(params.scale) / 100 - 1) * ease(p)) }) },
  { id: 'rotate', label: '回転', icon: 'rotate', tone: 'peach', category: '回転・拡大縮小', controls: [number('angle', '回転角度 (°)', 360, -1080, 1080, 5)],
    sample: (p, params) => ({ rotation: Number(params.angle) * ease(p) }) },
  { id: 'bounce', label: 'バウンド', icon: 'bounce', tone: 'peach', category: 'バウンド・振動',
    controls: [strength, number('cycles', '回数', 3, 1, 12)],
    sample: (p, params) => ({ y: -Number(params.strength) * (1 - p) * Math.abs(Math.sin(Math.PI * Number(params.cycles) * p)) }) },
  { id: 'shake', label: 'シェイク', icon: 'shake', tone: 'pink', category: 'バウンド・振動',
    controls: [strength, number('cycles', '回数', 5, 1, 20)],
    sample: (p, params) => ({ x: Number(params.strength) * (1 - p) * Math.sin(2 * Math.PI * Number(params.cycles) * p) }) },
  { id: 'color', label: '色変化', icon: 'color', tone: 'pink', category: '色変化',
    controls: [{ key: 'color', label: '変化後の色', initial: '#b29aff', color: true }],
    sample: (p, params) => ({ color: { target: String(params.color), weight: p } }) },
];

export const templates = [...originalTemplates, ...additionalTemplates, ...visualEffects];
export const registry = new Map(templates.map(template => [template.id, template]));
