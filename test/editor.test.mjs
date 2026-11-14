import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaults, evaluate } from '../src/animation.ts';
import { previewGeometry } from '../src/geometry.ts';
import { adjacentEndpoint, editLayerSpan, editSpan, newLayer, reorderById } from '../src/model.ts';
import { registry, templates } from '../src/templates.ts';

function clip(template, start, end) {
  return { id: template, template, start, end, params: defaults(registry.get(template)) };
}

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

test('moving a layer shifts its animations and trimming preserves their bounds', () => {
  const layer = { ...newLayer('rectangle', 1), start: 2, end: 7, animations: [clip('fade-in', 3, 5)] };
  const moved = editLayerSpan(layer, 'move', -10);
  assert.equal(moved.start, 0);
  assert.equal(moved.end, 5);
  assert.equal(moved.animations[0].start, 1);
  assert.equal(moved.animations[0].end, 3);
  assert.equal(editLayerSpan(layer, 'start', 10).start, 3);
  assert.equal(editLayerSpan(layer, 'end', -10).end, 5);
});
