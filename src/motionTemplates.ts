import { categories } from './animation.ts';
import type { Control, GlyphPose, Template } from './animation.ts';
import type { Parameters } from './model.ts';

const n = (key: string, label: string, initial: number, max: number): Control => ({ key, label, initial, min: 0, max, step: 1 });
const distance = n('distance', '距離 (px)', 220, 1200);
const angle = n('angle', '角度 (°)', 90, 720);
const strength = n('strength', '強さ (%)', 60, 100);
const cycles = n('cycles', '回数', 3, 12);
const seed = n('seed', 'シード', 13, 999);
const color: Control = { key: 'color', label: '色', initial: '#82d5ff', color: true };
const value = (p: Parameters, key: string) => Number(p[key]);
const d = (p: Parameters) => value(p, 'distance');
const a = (p: Parameters) => value(p, 'angle');
const s = (p: Parameters) => value(p, 'strength') / 100;
const c = (p: Parameters) => Math.max(1, Math.min(12, value(p, 'cycles')));
const wave = (p: number) => Math.sin(p * 2 * Math.PI);
const arch = (p: number) => 4 * p * (1 - p);
const ease = (p: number) => p * p * (3 - 2 * p);
const clamp = (p: number) => Math.max(0, Math.min(1, p));
const noise = (i: number, salt: number) => {
  const raw = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return 2 * (raw - Math.floor(raw)) - 1;
};
function motion(category: number, id: string, label: string, controls: Control[], sample: Template['sample']): Template {
  return { id, label, category: categories[category], controls, sample,
    icon: category === 5 ? 'color' : 'spark', tone: category === 5 ? 'pink' : 'blue',
    activeOnly: category === 5 || category === 6 };
}

function letters(category: number, id: string, label: string, controls: Control[],
  sample: (local: number, index: number, time: number, params: Parameters) => GlyphPose, stagger = true): Template {
  const delay = n('delay', '文字の時間差 (%)', 48, 90);
  return { ...motion(category, id, label, stagger ? [delay, ...controls] : controls, (p, params) => ({
    glyph: { unit: 'grapheme', sample: (i, count) => {
      const lag = stagger && count > 1 ? value(params, 'delay') / 100 : 0;
      return sample(clamp((p - lag * i / Math.max(1, count - 1)) / (1 - lag)), i, p, params);
    } },
  })), textOnly: true };
}

export const motionTemplates: Template[] = [
  motion(0, 'depth-entry', '奥から飛び出す', [distance, strength], (p, q) => ({
    y: d(q) * (1 - p) ** 3, scale: 0.18 + 0.82 * ease(p) + s(q) * arch(p) * p, opacity: Math.min(1, 3 * p),
  })),
  motion(0, 'hinge-exit', '蝶番のように落下', [distance, angle], (p, q) => ({
    rotation: a(q) * ease(Math.min(1, p * 1.7)), y: d(q) * Math.max(0, 2 * p - 1) ** 2,
    opacity: 1 - Math.max(0, 2 * p - 1) ** 2,
  })),
  letters(0, 'glyph-cross-entry', '左右交互に登場', [distance, angle], (p, i, _, q) => ({
    x: (i % 2 ? 1 : -1) * d(q) * (1 - ease(p)), rotation: (i % 2 ? -1 : 1) * a(q) * (1 - p) ** 2,
    opacity: ease(p),
  })),
  letters(0, 'glyph-crumble-exit', '文字が崩れ落ちる', [distance, angle, seed], (p, i, _, q) => ({
    x: d(q) * noise(i, value(q, 'seed')) * p ** 2, y: d(q) * p ** 3,
    rotation: a(q) * noise(i, value(q, 'seed') + 1) * p, opacity: 1 - p ** 2,
  })),

  motion(1, 'spiral-path', '螺旋移動', [distance, cycles], (p, q) => ({
    x: d(q) * p * wave(c(q) * p), y: d(q) * p * Math.cos(2 * Math.PI * c(q) * p),
  })),
  motion(1, 'figure-eight', '8の字移動', [distance, cycles], (p, q) => ({
    x: d(q) * wave(p * c(q)), y: d(q) * 0.48 * wave(2 * p * c(q)),
  })),
  motion(1, 'arc-path', '弧を描く移動', [distance, strength], (p, q) => ({
    x: d(q) * ease(p), y: -d(q) * s(q) * Math.sin(Math.PI * p),
  })),
  motion(1, 'random-walk', 'ランダムウォーク', [distance, cycles, seed], (p, q) => {
    const step = p * c(q) * 2;
      const index = Math.floor(step);
    const axis = (salt: number) => {
      let sum = 0;
      for (let i = 0; i < index; i++) sum += noise(i, salt);
      return d(q) * (sum + noise(index, salt) * ease(step - index)) / c(q);
    };
    return { x: axis(value(q, 'seed')), y: axis(value(q, 'seed') + 1) };
  }),
  motion(1, 'surge-path', '加減速ステップ移動', [distance, cycles], (p, q) => {
    const step = p * c(q);
    return { x: d(q) * (Math.floor(step) + ease(step % 1)) / c(q) };
  }),
  motion(1, 'surf-path', '波に乗る移動', [distance, cycles, angle], (p, q) => ({
    x: d(q) * p, y: d(q) * 0.35 * wave(c(q) * p) * arch(p),
    rotation: a(q) * 0.22 * Math.cos(2 * Math.PI * c(q) * p) * arch(p),
  })),

  motion(2, 'card-flip', 'カード反転', [cycles, strength], (p, q) => {
    const turn = p * c(q);
    return { scaleX: Math.cos(2 * Math.PI * turn), skew: 22 * s(q) * wave(turn), scaleY: 1 + s(q) * 0.2 * wave(turn) };
  }),
  motion(2, 'stepped-zoom', '段階ズーム', [strength, cycles], (p, q) => ({ scale: 1 + s(q) * Math.floor(p * c(q)) / c(q) })),
  motion(2, 'offbeat-zoom', '裏拍ズーム', [strength, cycles], (p, q) => {
    const beat = p * c(q) % 1;
    return { scale: 1 + s(q) * arch(p) * (ease(clamp(beat * 4)) - ease(clamp((beat - 0.28) * 1.4))) };
  }),
  motion(2, 'ratchet-turn', 'ラチェット回転', [angle, cycles], (p, q) => {
    const turn = p * c(q);
    const step = turn % 1;
    return { rotation: a(q) * (Math.floor(turn) + ease(clamp(step * 3)) + 0.25 * Math.sin(Math.PI * step)) / c(q) };
  }),

  motion(3, 'floor-rebound', '床で減衰する跳ね返り', [distance, cycles, strength], (p, q) => {
    const hit = p * c(q);
    return { y: -d(q) * Math.sin(Math.PI * (hit % 1)) * (1 - p) ** 2,
      scaleY: 1 - s(q) * 0.38 * Math.cos(Math.PI * hit) ** 12 * arch(p) };
  }),
  motion(3, 'aftershock', '余震', [distance, cycles, angle], (p, q) => {
    const impulse = Math.exp(-5 * p) * wave(c(q) * p * (1 + p));
    return { x: d(q) * 0.3 * impulse, rotation: a(q) * 0.3 * impulse, y: d(q) * 0.12 * impulse ** 2 };
  }),

  letters(4, 'glyph-scramble', '文字スクランブル', [cycles, seed], (p, i, time, q) => {
    const pool = Array.from('アカサタナハマヤラワ0123456789!?');
    const random = noise(i + Math.floor(time * 8 * c(q)) * 31, value(q, 'seed'));
    return p < 0.9 ? { replacement: pool[Math.floor((random + 1) / 2 * pool.length)] } : {};
  }),
  letters(4, 'glyph-flip-entry', '文字カードめくり', [angle], (p, _i, _t, q) => ({
    scaleX: Math.cos(Math.PI * (1 - ease(p)) / 2), rotation: a(q) * 0.5 * (1 - p) ** 2,
  })),
  letters(4, 'glyph-scatter-return', '文字分散と再集合', [distance, angle, seed], (p, i, _t, q) => ({
    x: d(q) * noise(i, value(q, 'seed')) * arch(p), y: d(q) * noise(i, value(q, 'seed') + 1) * arch(p),
    rotation: a(q) * noise(i, value(q, 'seed') + 2) * arch(p),
  }), false),
  letters(4, 'glyph-color-wave', '文字の色ウェーブ', [color, cycles, strength], (p, _i, _t, q) => ({
    tint: { target: String(q.color), weight: s(q) * arch(p) * (0.5 + 0.5 * wave(p * c(q))) },
  })),
  letters(4, 'glyph-glow-wave', '文字の発光ウェーブ', [color, strength, cycles], (p, _i, _t, q) => ({
    glow: { color: String(q.color), radius: 40 * s(q) * arch(p) * Math.max(0, wave(p * c(q))) },
  })),
  letters(4, 'glyph-ripple-stretch', '文字の波状変形', [strength, cycles], (p, _i, _t, q) => {
    const stretch = 0.6 * s(q) * wave(p * c(q)) * arch(p);
    return { scaleX: 1 + stretch, scaleY: 1 - stretch };
  }),

  motion(5, 'color-restore', 'モノクロからカラー', [strength], (p, q) => ({
    filters: [{ kind: 'grayscale', value: s(q) * (1 - ease(p)) }],
  })),
  motion(5, 'warm-cool', '暖色・寒色の往復', [strength, cycles], (p, q) => {
    const hue = wave(p * c(q));
    return { color: { target: hue >= 0 ? '#ff913f' : '#378fff', weight: s(q) * Math.abs(hue) * arch(p) } };
  }),
  motion(5, 'color-dip', '色を沈めて戻す', [strength], (p, q) => ({
    filters: [{ kind: 'brightness', value: 1 - 0.7 * s(q) * arch(p) ** 2 },
      { kind: 'saturate', value: 1 - s(q) * arch(p) }],
  })),

  motion(6, 'glitch-burst', '断続グリッチ', [distance, cycles, seed], (p, q) => {
    const gate = Math.max(0, (wave(p * c(q)) - 0.6) / 0.4);
    return { x: d(q) * noise(Math.floor(p * c(q) * 16), value(q, 'seed')) * gate,
      skew: 22 * gate, rgb: d(q) * 0.22 * gate };
  }),
  motion(6, 'rgb-sweep', 'RGBのずれ戻り', [distance, cycles], (p, q) => {
    const shift = d(q) * 0.22 * wave(p * c(q)) * arch(p);
    return { filters: [{ kind: 'shadow', x: shift, y: shift * 0.45, blur: 0, color: '#ff235e88' },
      { kind: 'shadow', x: -shift, y: -shift * 0.45, blur: 0, color: '#13dbff88' }] };
  }),

  motion(7, 'rubber-pull', 'ゴム引きと反動', [strength, cycles], (p, q) => {
    const pull = p < 0.4 ? ease(p / 0.4) : Math.exp(-7 * (p - 0.4)) * Math.cos((p - 0.4) * c(q) * Math.PI * 2) * (1 - p) / 0.6;
    return { scaleX: 1 + s(q) * pull, scaleY: 1 / (1 + s(q) * pull) };
  }),
  motion(7, 'skew-snap', '傾きの切り返し', [angle, strength], (p, q) => ({
    skew: a(q) * 0.45 * wave(p) * arch(p), rotation: -a(q) * 0.13 * wave(p) * s(q),
  })),
  motion(7, 'squash-recover', 'プレスと復元', [strength, distance], (p, q) => {
    const press = ease(clamp(p * 5)) * (1 - ease(clamp((p - 0.5) * 2)));
    return { scaleY: 1 - 0.8 * s(q) * press, scaleX: 1 + 0.4 * s(q) * press, y: d(q) * 0.35 * press };
  }),
  motion(7, 'accordion', 'アコーディオン変形', [strength, cycles], (p, q) => {
    const fold = Math.abs(wave(p * c(q))) ** 3 * s(q) * arch(p);
    return { scaleX: 1 - 0.75 * fold, scaleY: 1 + 0.5 * fold, skew: 16 * fold };
  }),
];
