import { categories } from './animation.ts';
import type { Control, GlyphPose, Template } from './animation.ts';

const control = (key: string, label: string, initial: number, max: number): Control =>
  ({ key, label, initial, min: 0, max, step: 1 });
const distance = control('distance', '距離 (px)', 190, 960);
const angle = control('angle', '角度 (°)', 60, 180);
const strength = control('strength', '強さ (%)', 65, 100);
const count = control('count', '回数', 4, 12);
const seed = control('seed', 'シード', 19, 999);
const lag = control('lag', '文字の時間差 (%)', 53, 90);
const tint: Control = { key: 'color', label: '色', initial: '#73edff', color: true };
type Knobs = { d: number; a: number; s: number; n: number; seed: number; lag: number; color: string };
const knobs = (p: Parameters<Template['sample']>[1]): Knobs => ({
  d: Number(p.distance), a: Number(p.angle), s: Number(p.strength) / 100, n: Math.max(1, Math.min(12, Number(p.count))),
  seed: Number(p.seed), lag: Number(p.lag) / 100, color: String(p.color),
});
const limit = (p: number) => Math.min(1, Math.max(0, p));
const ease = (p: number) => { const x = limit(p); return x * x * (3 - 2 * x); };
const arc = (p: number) => 4 * p * (1 - p);
const sin = (p: number) => Math.sin(2 * Math.PI * p);
const cos = (p: number) => Math.cos(2 * Math.PI * p);
const rnd = (i: number, seed: number) => {
  const value = 43758.5453 * Math.sin(i * 127.1 + seed * 311.7);
  return value - Math.floor(value);
};
type Effect = ReturnType<Template['sample']>;
type Role = Template['automaticRole'];
function effect(category: number, id: string, label: string, controls: Control[],
  sample: (p: number, k: Knobs) => Effect, automaticRole?: Role): Template {
  return { id, label, category: categories[category], controls, sample: (p, params) => sample(p, knobs(params)),
    icon: ['slideIn', 'slideOut', 'rotate', 'bounce', 'text', 'color', 'spark', 'shrink'][category],
    tone: category === 5 ? 'pink' : 'violet', activeOnly: category === 5 || category === 6, automaticRole };
}
function glyph(id: string, label: string, controls: Control[],
  sample: (p: number, i: number, global: number, k: Knobs) => GlyphPose, options: { stagger?: boolean; role?: Role } = {}): Template {
  const stagger = options.stagger !== false;
  return { ...effect(4, id, label, stagger ? [lag, ...controls] : controls, (p, k) => ({
    glyph: { unit: 'grapheme', sample: (i, total) => {
      const local = stagger && total > 1 ? limit((p - k.lag * i / (total - 1)) / (1 - k.lag)) : p;
      return sample(local, i, p, k);
    } },
  }), options.role), textOnly: true };
}

export const lyricTemplates: Template[] = [
  effect(0, 'iris-entry', 'アイリス登場', [strength], (p, k) => ({ reveal: `circle(${120 * ease(p)}% at 50% 50%)`, scale: 1 - 0.35 * k.s * (1 - p) })),
  effect(0, 'diagonal-wipe', '斜めワイプ登場', [angle], (p, k) => {
    const slope = k.a / 6;
    const edge = (100 + 2 * slope) * ease(p) - slope;
    return { reveal: `polygon(0 0, ${edge + k.a / 6}% 0, ${edge - k.a / 6}% 100%, 0 100%)`, opacity: limit(p * 8) };
  }),
  effect(0, 'vanishing-point', '消失点へ吸い込まれる', [distance, angle], (p, k) => ({
    x: k.d * p ** 2, y: -k.d * p ** 3 / 2, scale: 1 - ease(p), tiltY: k.a * 0.7 * p, opacity: 1 - p ** 3,
  }), 'exit'),
  effect(0, 'fold-away', '折りたたんで退場', [angle, strength], (p, k) => ({
    tiltX: k.a * ease(p), scaleY: 1 - 0.8 * k.s * ease(p), reveal: `inset(${50 * p}% 0)`,
  }), 'exit'),
  effect(0, 'shutter-entry', 'シャッター登場', [strength], (p, k) => ({
    reveal: `inset(${50 * (1 - ease(p))}% 0)`, blur: 32 * k.s * (1 - p) ** 2,
  })),
  effect(0, 'diamond-exit', 'ひし形に閉じる', [], p => {
    const r = 105 * (1 - ease(p));
    return { reveal: `polygon(50% ${50 - r}%, ${50 + r}% 50%, 50% ${50 + r}%, ${50 - r}% 50%)` };
  }, 'exit'),

  effect(1, 'accelerated-zig', '加速ジグザグ', [distance, count], (p, k) => ({
    x: k.d * p ** 2, y: k.d * 0.34 * (1 - 4 * Math.abs(p * p * k.n % 1 - 0.5)) * arc(p),
  })),
  effect(1, 's-curve', 'S字カーブ移動', [distance, strength], (p, k) => ({
    x: k.d * ease(p), y: k.d * k.s * sin(p) * arc(p),
  })),
  effect(1, 'parallax-approach', '遠近移動', [distance, strength], (p, k) => ({
    x: k.d * (1 - ease(p)), y: -k.d * (1 - p) / 3, scale: 1 - 0.75 * k.s * (1 - p) ** 2,
  })),
  effect(1, 'magnet-catch', '磁石に引き寄せられる', [distance, strength], (p, k) => ({
    x: k.d * ((1 - p) ** 4 - k.s * 0.18 * sin(p * 1.25) * arc(p)), y: -k.d * sin(p) * (1 - p) / 2,
  })),
  effect(1, 'orbital-roll', '自転しながら周回', [distance, angle, count], (p, k) => ({
    x: k.d * sin(p * k.n), y: k.d * 0.5 * (1 - cos(p * k.n)), rotation: k.a * k.n * p,
  })),
  effect(1, 'wind-drift', '風に流される', [distance, seed], (p, k) => ({
    x: k.d * (p + 0.16 * arc(p) * sin(1.7 * p + rnd(1, k.seed))), y: k.d * arc(p) *
      (0.4 * sin(p + rnd(2, k.seed)) + 0.15 * sin(3 * p + rnd(3, k.seed))),
  })),
  effect(1, 'square-route', '四角い軌道', [distance, count], (p, k) => {
    const t = p * k.n % 1 * 4;
    return { x: k.d * (ease(t) - ease(t - 2)), y: k.d * (ease(t - 1) - ease(t - 3)) };
  }),

  effect(2, 'perspective-turn', '遠近ヨー回転', [angle, count], (p, k) => ({ tiltY: k.a * sin(p * k.n), rotation: 10 * arc(p) * sin(p) })),
  effect(2, 'perspective-swing', '立体振り子', [angle, distance, count], (p, k) => {
    const swing = sin(p * k.n) * arc(p);
    return { tiltX: k.a * swing, y: k.d * 0.35 * swing * swing, scale: 1 + 0.28 * swing };
  }),
  effect(2, 'page-turn', 'ページめくり', [angle, distance], (p, k) => ({
    tiltY: k.a * Math.sin(Math.PI * ease(p)), x: k.d * Math.sin(Math.PI * p) / 2,
    reveal: `inset(0 ${38 * arc(p)}% 0 0)`,
  })),
  effect(2, 'tumble', '立体タンブル', [angle, count], (p, k) => ({
    tiltX: k.a * sin(p * k.n), tiltY: k.a * 0.7 * sin(p * (k.n + 1)), rotation: 40 * sin(p),
  })),
  effect(2, 'dolly-focus', 'フォーカスズーム', [strength, distance], (p, k) => ({
    scale: 1 + k.s * arc(p), blur: k.d * 0.08 * (1 - arc(p)) * arc(p),
  })),
  effect(2, 'overshoot-turn', '回し過ぎから戻る', [angle, strength], (p, k) => ({
    rotation: k.a * (ease(p) + k.s * arc(p) ** 2 * p), scale: 1 - 0.2 * k.s * arc(p),
  })),

  effect(3, 'side-hop', '不規則な方向に跳ねる', [distance, count, seed], (p, k) => {
    const step = p * k.n;
    const j = Math.floor(step);
    const jump = arc(step % 1) * k.d * (1 - p / 2);
    return { x: jump * (2 * rnd(j, k.seed) - 1), y: -jump * (0.35 + 0.65 * rnd(j, k.seed + 1)) };
  }),
  effect(3, 'contact-repel', '接触して反発', [distance, strength], (p, k) => ({
    x: -k.d * Math.abs(1 - 2 * p) ** 2, scaleX: 1 - 0.6 * k.s * arc(p) ** 10,
    scaleY: 1 + 0.27 * k.s * arc(p) ** 8,
  })),
  effect(3, 'impact-ring', '衝撃で円を描く', [distance, count], (p, k) => {
    const r = k.d * p * (1 - p) ** 3;
    return { x: r * cos(p * k.n), y: r * sin(p * k.n), scale: 1 + r / 720 };
  }),
  effect(3, 'spring-stair', '階段を跳ね上がる', [distance, count], (p, k) => {
    const step = p * k.n;
    return { x: k.d * p, y: -k.d * (Math.floor(step) + ease(step % 1) + 0.4 * arc(step % 1)) / k.n };
  }),

  glyph('glyph-compass', '文字が四方から飛び込む', [distance, seed], (p, i, _, k) => {
    const rad = 2 * Math.PI * rnd(i, k.seed);
    return { x: k.d * Math.cos(rad) * (1 - p) ** 2, y: k.d * Math.sin(rad) * (1 - p) ** 2, opacity: ease(p * 2) };
  }, { role: 'entrance' }),
  glyph('glyph-domino', '文字ドミノ', [angle, distance], (p, _i, _, k) => ({
    rotation: k.a * ease(p), x: k.d * 0.35 * p, y: k.d * 0.4 * (1 - cos(p / 4)), opacity: 1 - ease((p - 0.6) / 0.4),
  }), { role: 'exit' }),
  glyph('glyph-spiral-entry', '文字が渦を描いて集合', [distance, count], (p, i, _, k) => {
    const spin = p * k.n + i * 0.17;
    return { x: k.d * (1 - p) * cos(spin), y: k.d * (1 - p) * sin(spin), opacity: ease(p * 2) };
  }, { role: 'entrance' }),
  glyph('glyph-crush-chain', '文字の連鎖プレス', [strength, distance], (p, _i, _, k) => {
    const press = ease(p * 5) * (1 - ease((p - 0.45) * 2));
    return { scaleY: 1 - 0.8 * k.s * press, scaleX: 1 + 0.42 * k.s * press, y: k.d * 0.35 * press };
  }),
  glyph('glyph-firework', '文字花火', [distance, seed, strength], (p, i, _, k) => {
    const r = k.d * Math.sqrt(p) * (0.4 + rnd(i, k.seed));
    return { x: r * cos(i * 0.382), y: r * sin(i * 0.382) + k.d * p ** 3 / 3,
      scale: 1 + k.s * arc(p) - p, opacity: 1 - ease(p) };
  }, { role: 'exit' }),
  glyph('glyph-flip-chain', '文字の連続反転', [strength], (p, _i, _, k) => ({
    scaleX: cos(p), scaleY: 1 + k.s * sin(p) ** 2 * 0.35,
  })),
  glyph('glyph-jitter-cloud', '文字がばらばらに震える', [distance, count, seed], (p, i, _, k) => {
    const key = i * 97 + Math.floor(p * k.n * 8);
    return { x: k.d * 0.25 * arc(p) * (2 * rnd(key, k.seed) - 1),
      y: k.d * 0.25 * arc(p) * (2 * rnd(key, k.seed + 1) - 1), rotation: 35 * arc(p) * (rnd(key, k.seed + 2) - 0.5) };
  }, { stagger: false }),
  glyph('glyph-rebound', '文字が潰れて跳ね返る', [distance, strength], (p, _i, _, k) => ({
    y: -k.d * arc(limit((p - 0.28) / 0.72)), scaleY: 1 - 0.75 * k.s * arc(limit(p / 0.35)),
    scaleX: 1 + 0.28 * k.s * arc(limit(p / 0.35)),
  })),
  glyph('glyph-swap', '文字の交互すれ違い', [distance, angle], (p, i, _, k) => {
    const sign = i % 2 ? -1 : 1;
    return { x: sign * k.d * sin(p), y: sign * k.d * 0.33 * arc(p), rotation: sign * k.a * 0.5 * arc(p) };
  }, { stagger: false }),
  glyph('glyph-hinge-turn', '文字が一枚ずつ開く', [angle, distance], (p, i, _, k) => ({
    rotation: (i % 2 ? 1 : -1) * k.a * (1 - ease(p)), y: k.d * (1 - p) ** 2 / 2, scaleY: ease(p),
  }), { role: 'entrance' }),
  glyph('glyph-twist-hop', '文字のひねり跳び', [distance, angle], (p, i, _, k) => ({
    y: -k.d * arc(p), rotation: (i % 2 ? -1 : 1) * k.a * sin(p), scaleX: 1 - 0.45 * arc(p),
  })),
  glyph('glyph-breath', '文字が連鎖して膨らむ', [strength, distance], (p, _i, _, k) => {
    const swell = Math.sin(Math.PI * ease(p)) ** 3;
    return { scale: 1 + k.s * swell, y: -k.d * 0.25 * swell, x: k.d * 0.23 * sin(p) * swell };
  }),
  glyph('glyph-fall-rise', '文字が落ちて再浮上', [distance, angle], (p, _i, _, k) => ({
    y: k.d * sin(p) * arc(p), rotation: k.a * sin(2 * p) * arc(p),
  })),
  glyph('glyph-focus-chain', '文字のフォーカス走査', [strength, tint], (p, _i, _, k) => ({
    opacity: 1 - k.s * 0.7 * arc(p), scale: 1 + 0.35 * k.s * arc(p) ** 3,
    tint: { target: k.color, weight: k.s * arc(p) ** 5 },
  })),

  effect(5, 'sepia-reveal', 'セピアから鮮色へ', [strength], (p, k) => ({
    filters: [{ kind: 'sepia', value: k.s * (1 - ease(p)) }, { kind: 'saturate', value: 1 + k.s * arc(p) }],
  })),
  effect(5, 'cold-negative', 'ネガ反転から寒色へ', [strength, tint], (p, k) => ({
    color: { target: k.color, weight: k.s * ease(p) }, filters: [{ kind: 'invert', value: k.s * (1 - ease(p)) }],
  })),
  effect(5, 'color-bleach', '退色フラッシュ', [strength], (p, k) => ({
    filters: [{ kind: 'brightness', value: 1 + 2 * k.s * arc(p) ** 6 }, { kind: 'saturate', value: 1 - k.s * arc(p) ** 2 }],
  })),

  effect(6, 'camera-flash', 'カメラフラッシュ', [strength, tint], (p, k) => {
    const flash = Math.exp(-14 * Math.abs(p - 0.18));
    return { color: { target: k.color, weight: k.s * flash }, glow: 85 * k.s * flash, blur: 14 * flash };
  }),
  effect(6, 'echo-sweep', '残像スイープ', [distance, strength], (p, k) => ({
    x: k.d * sin(p), y: -k.d * 0.33 * arc(p), trail: { count: 5, interval: 0.055, opacity: k.s },
  })),
  effect(6, 'scan-reveal', '発光帯の走査', [strength, tint], (p, k) => ({
    lines: { spacing: 1600, offset: 1080 * p, bands: [0, 12, 17, 34], color: k.color, opacity: k.s },
    blur: 12 * (1 - p) * k.s,
  })),
  effect(6, 'signal-tear', '映像信号の裂け', [distance, count, seed], (p, k) => {
    const gate = ease(Math.abs(sin(p * k.n)) * 3 - 2);
    const band = 38 * rnd(Math.floor(p * k.n * 8), k.seed) * gate;
    return { x: k.d * 0.25 * gate, slice: band, rgb: k.d * 0.13 * gate,
      lines: { spacing: 44, offset: 90 * p, color: '#91eaff', opacity: gate * 0.7 } };
  }),
  effect(6, 'soft-halo', '柔らかな光のにじみ', [strength, tint], (p, k) => ({
    filters: [{ kind: 'shadow', x: 0, y: -14 * arc(p), blur: 56 * k.s, color: k.color + 'a0' },
      { kind: 'brightness', value: 1 + 0.45 * k.s * arc(p) }],
  })),

  effect(7, 'gel-wobble', 'ゼリー変形', [strength, angle, count], (p, k) => {
    const w = k.s * (1 - p) ** 2;
    return { scaleX: 1 + 0.55 * w * sin(p * k.n), scaleY: 1 - 0.36 * w * sin(p * (k.n + 1)),
      skew: k.a * 0.3 * w * sin(p * (k.n + 2)) };
  }),
  effect(7, 'pinch-release', '横からつまんで戻す', [strength, distance], (p, k) => {
    const pinch = arc(p) ** 4;
    return { scaleX: 1 - 0.8 * k.s * pinch, scaleY: 1 + 0.4 * k.s * pinch, x: k.d * 0.3 * pinch };
  }),
  effect(7, 'shear-fold', '斜めに折り曲げる', [angle, strength], (p, k) => ({
    skew: k.a * 0.65 * arc(p), tiltY: -k.a * 0.9 * arc(p), scaleY: 1 - 0.45 * k.s * arc(p),
  })),
  effect(7, 'stretch-recoil', '伸びてから縮み返す', [strength, distance], (p, k) => ({
    scaleY: 1 + 0.85 * k.s * sin(p) * arc(p), scaleX: 1 - 0.38 * k.s * sin(p) * arc(p),
    y: -k.d * 0.25 * sin(p) * arc(p),
  })),
  effect(7, 'diamond-fold', 'ひし形に折れて開く', [strength, angle], (p, k) => {
    const fold = 45 * k.s * arc(p);
    return { reveal: `polygon(${fold}% 0, 100% ${fold}%, ${100 - fold}% 100%, 0 ${100 - fold}%)`, tiltX: k.a * arc(p) };
  }),
];
