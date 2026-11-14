import { categories } from './animation.ts';
import type { Control, GlyphPose, Template } from './animation.ts';
import { clamp } from './model.ts';

const n = (key: string, label: string, initial: number, min: number, max: number, step = 1): Control =>
  ({ key, label, initial, min, max, step });
const distance = n('distance', '距離 (px)', 160, -800, 800);
const amount = n('amount', '強さ (%)', 40, 0, 100);
const angle = n('angle', '角度 (°)', 120, 0, 720);
const cycles = n('cycles', '回数', 3, 1, 20);
const color: Control = { key: 'color', label: '変化後の色', initial: '#ff76ae', color: true };
const tau = 2 * Math.PI;
const ease = (p: number) => p * p * (3 - 2 * p);
const envelope = (p: number) => Math.sin(Math.PI * p);
const wave = (p: number, count: number) => Math.sin(tau * p * count);
const stepped = (p: number, count: number) => Math.floor(p * count);
const noise = (i: number) => {
  const value = Math.sin((i + 1) * 127.1) * 43758.5453;
  return 2 * (value - Math.floor(value)) - 1;
};
const define = (category: number, id: string, label: string, controls: Control[], sample: Template['sample'], textOnly = false): Template =>
  ({ id, label, category: categories[category], controls, sample, textOnly,
    activeOnly: category === 6 || id === 'hue-spin',
    icon: ['slideIn', 'slideOut', 'rotate', 'bounce', 'text', 'color', 'spark', 'shrink'][category],
    tone: ['violet', 'blue', 'mint', 'peach', 'violet', 'pink', 'blue', 'mint'][category] });

const unit: Control = { key: 'unit', label: '単位', initial: 'grapheme',
  options: [['grapheme', '文字'], ['word', '単語'], ['line', '行'], ['whole', '全体']] };
const order: Control = { key: 'order', label: '順番', initial: 'forward',
  options: [['forward', '先頭から'], ['reverse', '末尾から'], ['random', 'ランダム']] };
const lag = n('lag', '時間差 (%)', 55, 0, 100);
const glyph = (id: string, label: string, controls: Control[],
  sample: (local: number, strength: number, index: number, speed: number) => GlyphPose,
  random = false) =>
  define(4, id, label, [unit, lag, ...(random ? [] : [order]), ...controls], (p, params) => {
    // An affine permutation gives a deterministic, unique rank without sorting on each frame.
    return { glyph: { unit: String(params.unit), sample: (index, count) => {
      const reversed = params.order === 'reverse';
      let multiplier = Math.max(1, Math.floor(count * 0.62));
      function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }
      if (random || params.order === 'random') while (gcd(multiplier, count) !== 1) multiplier++;
      const rank = random || params.order === 'random' ? (index * multiplier + Math.floor(count / 2)) % count
        : reversed ? count - 1 - index : index;
      const stagger = 0.95 * Number(params.lag) / 100;
      const local = clamp((p - stagger * rank / Math.max(1, count - 1)) / (1 - stagger), 0, 1);
      return sample(local, Number(params.amount ?? params.distance ?? params.angle ?? 1), rank, Number(params.cycles ?? 2));
    } } };
  }, true);

export const additionalTemplates: Template[] = [
  define(0, 'pop-in', 'ポップイン', [amount], (p, a) => ({ opacity: ease(p), scale: p + Number(a.amount) / 100 * wave(p, 0.5) })),
  define(0, 'pop-out', 'ポップアウト', [amount], (p, a) => ({ opacity: 1 - p ** 3, scale: 1 - p ** 2 + Number(a.amount) / 100 * envelope(p) })),
  define(0, 'bounce-in', 'バウンスイン', [distance, cycles], (p, a) => ({ y: -Math.abs(Math.cos(Math.PI * p * Number(a.cycles))) * (1 - p) ** 2 * Number(a.distance), opacity: Math.min(1, p * 4) })),
  define(0, 'bounce-out', 'バウンスアウト', [distance], (p, a) => ({ y: (p ** 3 - 0.8 * envelope(p) ** 3) * Number(a.distance), opacity: 1 - p ** 3 })),
  define(0, 'spin-in', '回転登場', [angle, amount], (p, a) => ({ opacity: ease(p), rotation: -Number(a.angle) * (1 - p) ** 2, scale: 1 - Number(a.amount) / 100 * (1 - p) })),
  define(0, 'spin-out', '回転退場', [angle, amount], (p, a) => ({ opacity: 1 - ease(p), rotation: Number(a.angle) * p ** 2, scale: 1 + Number(a.amount) / 100 * p })),
  define(1, 'drift', '斜めドリフト', [distance, angle], (p, a) => {
    const rad = Number(a.angle) / 180 * Math.PI;
    return { x: Math.cos(rad) * ease(p) * Number(a.distance), y: Math.sin(rad) * ease(p) * Number(a.distance) };
  }),
  define(1, 'float', '浮遊', [distance, cycles], (p, a) => ({ y: -Number(a.distance) * envelope(p) * (0.7 + 0.3 * wave(p, Number(a.cycles))) })),
  define(1, 'zigzag', 'ジグザグ移動', [distance, cycles], (p, a) => ({ x: p * Number(a.distance), y: Number(a.distance) / 3 * (1 - 4 * Math.abs((p * Number(a.cycles)) % 1 - 0.5)) * envelope(p) })),
  define(1, 'orbit', '円運動', [distance, cycles], (p, a) => ({ x: Number(a.distance) * wave(p, Number(a.cycles)), y: Number(a.distance) * (1 - Math.cos(tau * p * Number(a.cycles))) })),
  define(1, 'pendulum', '振り子移動', [distance, angle, cycles], (p, a) => {
    const theta = wave(p, Number(a.cycles)) * envelope(p) * Number(a.angle) / 360 * Math.PI;
    return { x: Number(a.distance) * Math.sin(theta), y: -Number(a.distance) * (1 - Math.cos(theta)), rotation: theta * 180 / Math.PI };
  }),
  define(1, 'wave-path', '波状移動', [distance, cycles], (p, a) => ({ x: ease(p) * Number(a.distance), y: Number(a.distance) / 2 * wave(p, Number(a.cycles)) })),
  define(1, 'boomerang', '往復移動', [distance, angle], (p, a) => {
    const theta = Number(a.angle) / 180 * Math.PI;
    const offset = Number(a.distance) * envelope(p) ** 2;
    return { x: Math.cos(theta) * offset, y: Math.sin(theta) * offset };
  }),
  define(2, 'pulse', 'パルス', [amount, cycles], (p, a) => ({ scale: 1 + Number(a.amount) / 100 * envelope(p) * (0.5 - 0.5 * Math.cos(tau * Number(a.cycles) * p)) })),
  define(2, 'spring-zoom', 'スプリングズーム', [amount, cycles], (p, a) => ({ scale: 1 - Number(a.amount) / 100 * (1 - p) ** 2 * Math.cos(tau * p * Number(a.cycles)) })),
  define(2, 'swing-rotation', '揺り戻し回転', [angle, cycles], (p, a) => ({ rotation: Number(a.angle) * (1 - p) ** 2 * wave(p, Number(a.cycles)) })),
  define(2, 'spiral-zoom', 'らせんズーム', [amount, angle], (p, a) => ({ scale: 1 + Number(a.amount) / 100 * ease(p), rotation: Number(a.angle) * p ** 3 })),
  define(3, 'impact', '衝撃バウンド', [distance, amount], (p, a) => ({ y: -Number(a.distance) * envelope(p) * (1 - p) ** 3, scaleY: 1 - Number(a.amount) / 100 * (1 - p) ** 7 })),
  define(3, 'tremble', 'ぷるぷる', [amount, cycles], (p, a) => ({ rotation: Number(a.amount) / 4 * envelope(p) * wave(p, Number(a.cycles)), scaleX: 1 + Number(a.amount) / 300 * envelope(p) * wave(p, 2 * Number(a.cycles)) })),
  define(3, 'jitter', '不規則シェイク', [distance, cycles], (p, a) => ({ x: noise(stepped(p, 4 * Number(a.cycles))) * Number(a.distance) / 3 * envelope(p), y: noise(stepped(p, 4 * Number(a.cycles)) + 31) * Number(a.distance) / 4 * envelope(p) })),
  define(3, 'ricochet', '跳ね返り', [distance, cycles], (p, a) => ({ x: Number(a.distance) * p, y: -Number(a.distance) * Math.abs(wave(p, Number(a.cycles))) * (1 - p) ** 2 })),
  glyph('typewriter', 'タイプライター', [], p => ({ opacity: Number(p > 0) })),
  glyph('glyph-fade-in', '1文字ずつ登場', [], p => ({ opacity: ease(p) })),
  glyph('glyph-fade-out', '1文字ずつ退場', [], p => ({ opacity: 1 - ease(p) })),
  glyph('glyph-wave', '文字ウェーブ', [distance, cycles], (p, a, _i, speed) => ({ y: a / 3 * envelope(p) * wave(p, speed) })),
  glyph('glyph-jump', '文字ジャンプ', [distance], (p, a) => ({ y: -a / 2 * envelope(p) })),
  glyph('glyph-spin', '文字回転', [angle], (p, a) => ({ rotation: a * envelope(p), opacity: Math.min(1, p * 3) })),
  glyph('glyph-scatter', '文字分散', [distance], (p, a, i) => ({ x: noise(i) * a * ease(p), y: noise(i + 40) * a * ease(p), opacity: 1 - p })),
  glyph('glyph-gather', '文字集合', [distance], (p, a, i) => ({ x: noise(i) * a * (1 - ease(p)), y: noise(i + 40) * a * (1 - ease(p)), opacity: p })),
  glyph('glyph-random', 'ランダム文字登場', [amount], (p, a) => ({ opacity: p, scale: 1 + a / 100 * envelope(p) }), true),
  glyph('glyph-scale', '文字ごとの拡大', [amount], (p, a) => ({ scale: 1 + a / 100 * envelope(p) })),
  define(5, 'color-flash', '色点滅', [color, cycles, amount], (p, a) => ({ color: { target: String(a.color), weight: Math.max(0, wave(p, Number(a.cycles))) * Number(a.amount) / 100 } })),
  define(5, 'rainbow', '虹色ループ', [cycles, amount], (p, a) => ({ color: { target: ['#ff4f64', '#ff9b43', '#f7ef6a', '#54f386', '#5ae4ff', '#9b78ff'][stepped(p, 6 * Number(a.cycles)) % 6], weight: envelope(p) * Number(a.amount) / 100 } })),
  define(5, 'hue-spin', '色相回転', [angle, cycles], (p, a) => ({ hue: p * Number(a.angle) * Number(a.cycles) })),
  define(5, 'random-color', 'ランダムカラー', [cycles, amount], (p, a) => {
    const step = stepped(p, 4 * Number(a.cycles));
    const target = '#' + [0, 1, 2].map(channel => Math.round((noise(step + 17 * channel) + 1) * 127.5).toString(16).padStart(2, '0')).join('');
    return { color: { target, weight: Number(a.amount) / 100 * envelope(p) } };
  }),
  define(6, 'rgb-split', 'RGB分離', [distance, amount], (p, a) => ({ rgb: Math.abs(Number(a.distance)) * Number(a.amount) / 500 * envelope(p) })),
  define(6, 'glitch', 'グリッチ', [distance, cycles], (p, a) => ({ x: noise(stepped(p, 8 * Number(a.cycles))) * Number(a.distance) * envelope(p), slice: 12 * Math.abs(wave(p, Number(a.cycles))) * envelope(p) })),
  define(6, 'noise-flicker', 'ノイズ点滅', [amount, cycles], (p, a) => ({ opacity: 1 - (noise(stepped(p, 12 * Number(a.cycles))) + 1) * Number(a.amount) / 200 * envelope(p) })),
  define(6, 'blur-in', 'ブラー登場', [distance, amount], (p, a) => ({ blur: Math.abs(Number(a.distance)) / 5 * (1 - ease(p)), opacity: 1 - (1 - p) * Number(a.amount) / 100 })),
  define(6, 'glow', 'グロー', [distance, cycles], (p, a) => ({ glow: Math.abs(Number(a.distance)) / 4 * envelope(p) * (0.7 + 0.3 * wave(p, Number(a.cycles))) })),
  define(6, 'trail', '残像', [distance, cycles,
    n('interval', '間隔 (秒)', 0.07, 0.02, 0.4, 0.01)], (_p, a) => ({
    trail: { count: Math.max(1, Math.min(8, Number(a.cycles))),
      interval: Number(a.interval ?? 0.07), opacity: Math.min(0.85, Math.abs(Number(a.distance)) / 400) },
  })),
  define(7, 'stretch-x', '横伸縮', [amount, cycles], (p, a) => ({ scaleX: 1 + Number(a.amount) / 100 * wave(p, Number(a.cycles)) * envelope(p) })),
  define(7, 'stretch-y', '縦伸縮', [amount, cycles], (p, a) => ({ scaleY: 1 + Number(a.amount) / 100 * wave(p, Number(a.cycles)) * envelope(p) })),
  define(7, 'collapse', '潰れる', [amount], (p, a) => ({ scaleY: 1 - 0.95 * p ** 2, scaleX: 1 + Number(a.amount) / 100 * ease(p), opacity: 1 - p ** 4 })),
  define(7, 'elastic-deform', '弾性変形', [amount, cycles], (p, a) => {
    const stretch = 1 + Number(a.amount) / 150 * (1 - p) * wave(p, Number(a.cycles));
    return { scaleX: stretch, scaleY: 1 / stretch };
  }),
  define(7, 'warp', 'ワープ風変形', [angle, amount, cycles], (p, a) => ({ skew: Number(a.angle) / 8 * wave(p, Number(a.cycles)) * envelope(p), scaleX: 1 + Number(a.amount) / 100 * envelope(p), scaleY: 1 - Number(a.amount) / 150 * envelope(p) })),
];
