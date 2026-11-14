import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaults, evaluate } from '../src/animation.ts';
import { previewGeometry } from '../src/geometry.ts';
import { editMusic, sourceTime, splitMusic } from '../src/music.ts';
import { adjacentEndpoint, editLayerSpan, editSpan, newLayer, packLayers, reorderById, splitLayer, unpackLayers } from '../src/model.ts';
import { registry, templates } from '../src/templates.ts';

function clip(template, start, end) {
  return { id: template, template, start, end, params: defaults(registry.get(template)) };
}

test('music trim preserves source alignment and moving retains the trimmed audio', () => {
  const music = { start: 0, end: 20, inPoint: 0, volume: 1, muted: false,
    asset: { id: 'song', name: 'song.wav', duration: 20 } };
  const trimmed = editMusic(editMusic(music, 'start', 3), 'end', -4);
  assert.equal(sourceTime(trimmed, 5), 5);
  const moved = editMusic(trimmed, 'move', 7);
  assert.deepEqual([moved.start, moved.end, moved.inPoint], [10, 23, 3]);
  assert.equal(sourceTime(moved, 10), 3);
  assert.equal(sourceTime(moved, 12), 5);
  assert.equal(adjacentEndpoint([], 0, 1, moved), 10);
  assert.equal(adjacentEndpoint([], 10, 1, moved), 23);
});

test('preview movement changes the base position even while a slide offsets the object', () => {
  const layer = newLayer('rectangle', 1);
  layer.animations = [clip('slide-in', 0, 2)];
  const pose = evaluate(layer, 1, registry);
  const moved = { ...layer, ...previewGeometry(layer, pose, 80, -40) };
  const result = evaluate(moved, 1, registry);
  assert.equal(result.x, pose.x + 80);
  assert.equal(result.y, pose.y - 40);
});

test('resizing a rotated and scaled rectangle keeps its opposite corner anchored', () => {
  const base = { x: 500, y: 500, width: 200, height: 100 };
  const pose = { ...base, scale: 2, rotation: 90, opacity: 1, color: '#ffffff' };
  assert.deepEqual(previewGeometry(base, pose, -40, 80, [1, 1]),
    { x: 480, y: 540, width: 240, height: 120 });
});

test('endpoint navigation includes child clips, skips duplicates, and can return to zero', () => {
  const layer = newLayer('text', 1);
  layer.animations = [clip('fade-in', 0, 2), clip('fade-out', 2, 5)];
  assert.equal(adjacentEndpoint([layer], 0, 1), 2);
  assert.equal(adjacentEndpoint([layer], 2, 1), 5);
  assert.equal(adjacentEndpoint([layer], 2, -1), 0);
  assert.equal(adjacentEndpoint([layer], 0, -1), undefined);
  assert.equal(adjacentEndpoint([layer], 15, 1), undefined);
});

test('reordering sibling colors changes compositing without changing their times', () => {
  const layer = newLayer('text', 1);
  const red = { ...clip('color', 0, 2), id: 'red', params: { color: '#ff0000' } };
  const blue = { ...clip('color', 0, 2), id: 'blue', params: { color: '#0000ff' } };
  layer.animations = [red, blue];
  assert.equal(evaluate(layer, 2, registry).color, '#0000ff');
  layer.animations = reorderById(layer.animations, blue.id, { id: red.id, after: false });
  assert.deepEqual(layer.animations, [blue, red]);
  assert.equal(evaluate(layer, 2, registry).color, '#ff0000');
});

test('overlapping animations compose and seeking back restores the same pose', () => {
  const layer = newLayer('text', 1);
  layer.animations = [clip('fade-in', 0, 2), clip('slide-in', 0, 2), clip('fade-out', 3, 4)];
  const before = evaluate(layer, 1, registry);
  assert.equal(before.opacity, 0.5);
  assert.equal(before.x, layer.x - 160);
  assert.equal(evaluate(layer, 2.5, registry).opacity, 1);
  assert.equal(evaluate(layer, 5, registry).opacity, 0);
  assert.deepEqual(evaluate(layer, 1, registry), before);
});

test('every built-in template produces finite values across its interval', () => {
  const layer = newLayer('ellipse', 1);
  assert.equal(registry.size, 10);
  for (const template of templates) {
    layer.animations = [clip(template.id, 1, 3)];
    for (const time of [0, 1, 1.5, 3, 7]) {
      const { color, ...values } = evaluate(layer, time, registry);
      assert.match(color, /^#[0-9a-f]{6}$/i);
      assert.ok(Object.values(values).every(Number.isFinite), template.id);
    }
  }
});

test('animation endpoints snap and respect the layer bounds and minimum duration', () => {
  const bounds = { start: 1, end: 8 };
  const span = { start: 2.2, end: 4.4 };
  assert.deepEqual(editSpan(span, 'start', 99, bounds), { start: 4.3, end: 4.4 });
  assert.deepEqual(editSpan(span, 'end', -99, bounds), { start: 2.2, end: 2.3 });
  assert.deepEqual(editSpan(span, 'move', 99, bounds), { start: 5.8, end: 8 });
  assert.deepEqual(editSpan(span, 'end', 0.1, bounds), { start: 2.2, end: 4.5 });
});

test('trimming preserves animation settings and shifts them with the start', () => {
  const layer = { ...newLayer('rectangle', 1), start: 2, end: 7, animations: [clip('fade-in', 3, 5)] };
  const moved = editLayerSpan(layer, 'move', -10);
  assert.equal(moved.start, 0);
  assert.equal(moved.end, 5);
  assert.equal(moved.animations[0].start, 1);
  assert.equal(moved.animations[0].end, 3);
  const trimmed = editLayerSpan(layer, 'end', -3);
  assert.equal(trimmed.end, 4);
  assert.deepEqual(trimmed.animations, layer.animations);
  assert.equal(editLayerSpan(trimmed, 'end', 3).end, 7);
  assert.equal(editLayerSpan(layer, 'start', 1).animations[0].start, 4);
  assert.ok(editLayerSpan(layer, 'start', 10).end - editLayerSpan(layer, 'start', 10).start >= 1 / 30 - 1e-9);
});

test('a lyric cut shares a track, preserves animation progress and round-trips older projects', () => {
  const original = { ...newLayer('text', 1), fontFamily: 'Yu Mincho' };
  original.animations = [clip('grow', 0, 1), clip('slide-in', 1, 4)];
  for (const cut of [0.43, 2.37, 4.8]) {
    const [left, right] = splitLayer(original, cut);
    assert.equal(left.end, right.start);
    assert.equal(left.fontFamily, right.fontFamily);
    assert.equal(evaluate(left, cut, registry).opacity, 0);
    for (const time of [cut - 0.01, cut, cut + 0.01, 9]) {
      const before = evaluate(original, time, registry);
      const after = evaluate(time < cut ? left : right, time, registry);
      assert.ok(Math.abs(before.x - after.x) < 1e-8);
      assert.ok(Math.abs(before.scale - after.scale) < 1e-8);
    }
    const packed = packLayers([right, left]);
    assert.equal(packed.length, 1);
    assert.deepEqual(unpackLayers(packed), [left, right]);
  }
  assert.deepEqual(unpackLayers([original]), [original]);
  assert.equal(splitLayer(original, 0), undefined);
});

test('splitting trimmed music keeps the same source position on both sides', () => {
  const audio = { start: 2, end: 10, inPoint: 3, muted: false, volume: 1,
    asset: { id: 'test', name: 'test.wav', duration: 20 } };
  const [left, right] = splitMusic(audio, 5.25);
  assert.equal(sourceTime(left, 5.25), sourceTime(right, 5.25));
  assert.equal(sourceTime(right, 9), sourceTime(audio, 9));
});
