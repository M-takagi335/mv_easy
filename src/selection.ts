import { clamp, STEP, trackId } from './model.ts';
import type { Layer } from './model.ts';
import type { MusicClip } from './music.ts';

export type Selection = { layerId: string; animationId?: string };
export const selectionKey = (item: Selection) => item.animationId ? item.layerId + ':' + item.animationId : item.layerId;

export function independentSelection(selection: Selection[]) {
  const parents = new Set(selection.filter(item => !item.animationId).map(item => item.layerId));
  return selection.filter(item => !item.animationId || !parents.has(item.layerId));
}

export function moveSelection(layers: Layer[], music: MusicClip[], selection: Selection[], delta: number, duration: number) {
  const keys = new Set(independentSelection(selection).map(selectionKey));
  let min = -Infinity;
  let max = Infinity;
  function bounds(start: number, end: number, earliest: number, latest: number) {
    min = Math.max(min, Math.min(0, earliest - start));
    max = Math.min(max, Math.max(0, latest - end));
  }
  function clipBounds(item: { start: number; end: number }, neighbors: { start: number; end: number }[]) {
    bounds(item.start, item.end,
      Math.max(0, ...neighbors.filter(neighbor => neighbor.end <= item.start).map(neighbor => neighbor.end)),
      Math.min(duration, ...neighbors.filter(neighbor => neighbor.start >= item.end).map(neighbor => neighbor.start)));
  }
  for (const layer of layers) {
    if (keys.has(layer.id)) {
      clipBounds(layer, layers.filter(item => trackId(item) === trackId(layer) && !keys.has(item.id)));
    } else {
      for (const animation of layer.animations) if (keys.has(selectionKey({ layerId: layer.id, animationId: animation.id }))) {
        bounds(layer.start + animation.start, layer.start + animation.end, 0, duration);
      }
    }
  }
  for (const item of music) if (keys.has(item.id!)) clipBounds(item, music.filter(clip => !keys.has(clip.id!)));
  const shift = clamp(Math.round(delta / STEP) / 10, min, max);
  const move = <T extends { start: number; end: number }>(item: T): T =>
    ({ ...item, start: item.start + shift, end: item.end + shift });
  return {
    layers: layers.map(layer => keys.has(layer.id) ? move(layer) : {
      ...layer, animations: layer.animations.map(animation =>
        keys.has(selectionKey({ layerId: layer.id, animationId: animation.id })) ? move(animation) : animation),
    }),
    musicClips: music.map(item => keys.has(item.id!) ? move(item) : item),
  };
}
