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
  phase?: [number, number];
};
export type Layer = {
  id: string;
  kind: 'text' | 'rectangle' | 'ellipse';
  textTrackId?: string;
  name: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  fontSize: number;
  fontFamily?: string;
  fontBold?: boolean;
  fontItalic?: boolean;
  start: number;
  end: number;
  endExclusive?: boolean;
  animations: Animation[];
};
export type Span = { start: number; end: number };
export type TextClip = Omit<Layer, 'kind' | 'textTrackId'>;
export type TextLayer = { kind: 'text-track'; id: string; name?: string; clips: TextClip[] };
export type ProjectLayer = Layer | TextLayer;

export function trackId(layer: Layer) {
  return layer.kind === 'text' ? layer.textTrackId ?? layer.id : layer.id;
}

export function groupLayers(layers: Layer[]): Layer[][] {
  const groups = new Map<string, Layer[]>();
  for (const layer of layers) {
    const id = trackId(layer);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id)!.push(layer);
  }
  return Array.from(groups.values(), group => group.sort((a, b) => a.start - b.start));
}

export function packLayers(layers: Layer[]): ProjectLayer[] {
  return groupLayers(layers).map(group => group[0].kind === 'text' ? {
    kind: 'text-track', id: trackId(group[0]), name: group[0].name,
    clips: group.map(({ kind, textTrackId, ...clip }) => clip),
  } : group[0]);
}

export function unpackLayers(layers: ProjectLayer[]): Layer[] {
  return layers.flatMap(layer => layer.kind === 'text-track'
    ? layer.clips.map(clip => ({ ...clip, name: layer.name ?? clip.name, kind: 'text' as const, textTrackId: layer.id }))
    : [layer]);
}
export type Edge = 'move' | 'start' | 'end';
export type Reorder = { id: string; after: boolean };

export function adjacentEndpoint(layers: Layer[], time: number, direction: -1 | 1, extra?: Span | Span[]): number | undefined {
  let next: number | undefined;
  const spans: Span[] = layers.flatMap(layer => [layer, ...layer.animations]);
  if (extra) spans.push(...(Array.isArray(extra) ? extra : [extra]));
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
export function editSpan(span: Span, edge: Edge, delta: number, bounds: Span): Span {
  const clean = (value: number) => Number(value.toFixed(9));
  const change = ticks(delta) / 10;
  const minimum = Math.min(STEP, span.end - span.start);
  if (!change) return { start: span.start, end: span.end };
  if (edge === 'start') return { start: clamp(clean(span.start + change), bounds.start, clean(span.end - minimum)), end: span.end };
  if (edge === 'end') return { start: span.start, end: clamp(clean(span.end + change), clean(span.start + minimum), bounds.end) };
  const shift = clamp(change, bounds.start - span.start, bounds.end - span.end);
  return { start: clamp(clean(span.start + shift), bounds.start, bounds.end), end: clamp(clean(span.end + shift), bounds.start, bounds.end) };
}

export function editLayerSpan(layer: Layer, edge: Edge, delta: number, duration = DURATION, earliest = 0): Layer {
  const bounds = { start: earliest, end: duration };
  const frame = Math.min(1 / 30, layer.end - layer.start);
  const span = editSpan(layer, edge, delta, bounds);
  const change = ticks(delta) / 10;
  const start = edge === 'start' ? clamp(Number((layer.start + change).toFixed(9)), earliest, layer.end - frame) : span.start;
  const end = edge === 'end' ? clamp(Number((layer.end + change).toFixed(9)), layer.start + frame, duration) : span.end;
  const shift = start - layer.start;
  return {
    ...layer, start, end,
    animations: layer.animations.map(animation => ({
      ...animation, start: Number((animation.start + shift).toFixed(9)), end: Number((animation.end + shift).toFixed(9)),
    })),
  };
}

export function splitLayer(layer: Layer, time: number): [Layer, Layer] | undefined {
  if (!(time > layer.start && time < layer.end)) return;
  const left: Animation[] = [];
  const right: Animation[] = [];
  for (const animation of layer.animations) {
    const { start, end, phase = [0, 1] } = animation;
    const copy = { ...animation, id: crypto.randomUUID(), params: { ...animation.params } };
    if (end <= time) {
      left.push(animation);
      right.push({ ...copy, start: time, end: time, phase: [phase[1], phase[1]] });
    } else if (start >= time) {
      right.push(copy);
    } else {
      const middle = phase[0] + (phase[1] - phase[0]) * (time - start) / (end - start);
      left.push({ ...animation, end: time, phase: [phase[0], middle] });
      right.push({ ...copy, start: time, phase: [middle, phase[1]] });
    }
  }
  const textTrackId = layer.kind === 'text' ? trackId(layer) : undefined;
  return [{ ...layer, textTrackId, end: time, endExclusive: true, animations: left },
    { ...layer, textTrackId, id: crypto.randomUUID(), start: time, animations: right }];
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
