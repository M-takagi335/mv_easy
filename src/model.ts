export const DURATION = 15;
export const STEP = 0.1;
export const CANVAS = { width: 1920, height: 1080 };

export type Parameters = Record<string, number | string>;
export type Animation = {
  id: string;
  template: string;
  start: number;
  end: number;
  params: Parameters;
};
export type Layer = {
  id: string;
  kind: 'text' | 'rectangle' | 'ellipse';
  name: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  fontSize: number;
  start: number;
  end: number;
  animations: Animation[];
};
export type Span = { start: number; end: number };
export type Edge = 'move' | 'start' | 'end';
export type Reorder = { id: string; after: boolean };

export function adjacentEndpoint(layers: Layer[], time: number, direction: -1 | 1, extra?: Span): number | undefined {
  let next: number | undefined;
  const spans: Span[] = layers.flatMap(layer => [layer, ...layer.animations]);
  if (extra) spans.push(extra);
  for (const span of spans) {
      for (const endpoint of [span.start, span.end]) {
        if (direction * (endpoint - time) > 1e-8 &&
            (next === undefined || direction * (endpoint - next) < 0)) next = endpoint;
      }
  }
  return next;
}

export function reorderById<T extends { id: string }>(items: T[], id: string, target: Reorder): T[] {
  const item = items.find(entry => entry.id === id);
  if (!item || id === target.id) return items;
  const remaining = items.filter(entry => entry.id !== id);
  const index = remaining.findIndex(entry => entry.id === target.id);
  if (index < 0) return items;
  remaining.splice(index + Number(target.after), 0, item);
  return remaining;
}
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const ticks = (time: number) => Math.round(time / STEP);
const seconds = (tick: number) => tick / 10;
const snap = (time: number) => seconds(ticks(time));

export function editSpan(span: Span, edge: Edge, delta: number, bounds: Span): Span {
  const start = ticks(span.start);
  const end = ticks(span.end);
  const min = ticks(bounds.start);
  const max = ticks(bounds.end);
  const change = ticks(delta);
  if (edge === 'start') return { start: seconds(clamp(start + change, min, end - 1)), end: span.end };
  if (edge === 'end') return { start: span.start, end: seconds(clamp(end + change, start + 1, max)) };
  const shift = clamp(change, min - start, max - end);
  return { start: seconds(start + shift), end: seconds(end + shift) };
}

export function editLayerSpan(layer: Layer, edge: Edge, delta: number, duration = DURATION): Layer {
  const bounds = { start: 0, end: duration };
  const span = editSpan(layer, edge, delta, bounds);
  const start = edge === 'start'
    ? Math.min(span.start, ...layer.animations.map(animation => animation.start))
    : span.start;
  const end = edge === 'end'
    ? Math.max(span.end, ...layer.animations.map(animation => animation.end))
    : span.end;
  const shift = edge === 'move' ? start - layer.start : 0;
  return {
    ...layer, start, end,
    animations: layer.animations.map(animation => ({
      ...animation, start: snap(animation.start + shift), end: snap(animation.end + shift),
    })),
  };
}

export function newLayer(kind: Layer['kind'], number: number): Layer {
  const name = { text: 'テキスト', rectangle: '四角形', ellipse: '円・楕円' }[kind];
  return {
    id: crypto.randomUUID(), kind, name: `${name} ${number}`, text: 'テキストを入力',
    x: 960, y: 540, width: kind === 'text' ? 1400 : 420, height: kind === 'text' ? 240 : 420,
    fontSize: 112, rotation: 0, color: kind === 'text' ? '#ffffff' : '#a38aff',
    start: 0, end: DURATION, animations: [],
  };
}
