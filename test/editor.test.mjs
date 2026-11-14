import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaults, evaluate } from '../src/animation.ts';
import { previewGeometry } from '../src/geometry.ts';
import { createHistory } from '../src/history.ts';
import { editMusic, sourceTime, splitMusic } from '../src/music.ts';
import { adjacentEndpoint, animationTimelineSpan, editAnimationSpan, editLayerSpan, editSpan, initialAnimationSpan,
  migrateAbsoluteAnimations, newLayer, packLayers, reorderById, splitLayer, unpackLayers } from '../src/model.ts';
import { registry, templates } from '../src/templates.ts';

function clip(template, start, end) {
  return { id: template, template, start, end, params: defaults(registry.get(template)) };
}

test('history records one drag, skips cancelled and unchanged edits, and clears redo after a new edit', () => {
  const history = createHistory({ start: 3, label: '歌詞' }, (a, b) => a.start === b.start && a.label === b.label);
  history.begin();
  for (const start of [4, 5, 8]) history.update(value => ({ ...value, start }));
  history.finish();
  history.update(value => ({ ...value, label: 'サビ' }));
  assert.deepEqual(history.step(false), { start: 8, label: '歌詞' });
  assert.deepEqual(history.step(false), { start: 3, label: '歌詞' });
  history.begin();
  history.update(value => ({ ...value, start: 10 }));
  history.finish(true);
  history.begin();
  history.update(value => ({ ...value }));
  history.finish();
  assert.deepEqual(history.step(true), { start: 8, label: '歌詞' });
  history.update(value => ({ ...value, label: '新しい歌詞' }));
  assert.deepEqual(history.step(true), { start: 8, label: '新しい歌詞' });
});

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
  const layer = { ...newLayer('rectangle', 1), start: 2, end: 7, animations: [clip('fade-in', 1, 3)] };
  const moved = editLayerSpan(layer, 'move', -10);
  assert.equal(moved.start, 0);
  assert.equal(moved.end, 5);
  assert.equal(moved.animations[0].start, 1);
  assert.equal(moved.animations[0].end, 3);
  const trimmed = editLayerSpan(layer, 'end', -3);
  assert.equal(trimmed.end, 4);
  assert.deepEqual(trimmed.animations, layer.animations);
  assert.equal(editLayerSpan(trimmed, 'end', 3).end, 7);
  const shifted = editLayerSpan(layer, 'start', 1);
  assert.deepEqual(animationTimelineSpan(shifted, shifted.animations[0]), { start: 4, end: 6 });
  assert.ok(editLayerSpan(layer, 'start', 10).end - editLayerSpan(layer, 'start', 10).start >= 1 / 30 - 1e-9);
});

test('split assigns animations to the intersecting side and preserves crossing progress', () => {
  const original = { ...newLayer('text', 1), start: 2, end: 12, fontFamily: 'Yu Mincho',
    animations: [clip('grow', 1, 3), clip('slide-in', 4, 7), clip('rotate', 4.5, 8)] };
  const expected = [
    [2.5, [], [[3, 5], [6, 9], [6.5, 10]]],
    [7, [[3, 5], [6, 7], [6.5, 7]], [[7, 9], [7, 10]]],
    [11, [[3, 5], [6, 9], [6.5, 10]], []],
  ];
  for (const [time, before, after] of expected) {
    const [left, right] = splitLayer(original, time);
    const spans = layer => layer.animations.map(animation => {
      const { start, end } = animationTimelineSpan(layer, animation);
      return [start, end];
    });
    assert.deepEqual(spans(left), before);
    assert.deepEqual(spans(right), after);
    assert.equal(left.end, right.start);
    assert.notEqual(left.id, right.id);
    assert.equal(right.fontFamily, original.fontFamily);
    assert.equal(evaluate(left, time, registry).opacity, 0);
    const packed = JSON.parse(JSON.stringify(packLayers([right, left])));
    assert.equal(packed.length, 1);
    const restored = unpackLayers(packed);
    assert.deepEqual(restored.map(spans), [before, after]);
    const history = createHistory([original], (a, b) => a === b);
    history.update(() => [left, right]);
    assert.deepEqual(history.step(false), [original]);
    assert.deepEqual(history.step(true).map(spans), [before, after]);
    if (time === 7) {
      for (const sample of [6.99, 7, 7.01, 8]) {
        const previous = evaluate(original, sample, registry);
        const next = evaluate(sample < time ? left : right, sample, registry);
        assert.ok(Math.abs(previous.x - next.x) < 1e-8);
        assert.ok(Math.abs(previous.rotation - next.rotation) < 1e-8);
      }
      assert.equal(evaluate(right, time, registry).scale, 1);
      assert.notEqual(left.animations[1].id, right.animations[0].id);
      assert.notEqual(left.animations[1].params, right.animations[0].params);
      assert.notEqual(left.animations[1].phase, right.animations[0].phase);
    }
  }
  assert.equal(splitLayer(original, original.start), undefined);
  assert.equal(splitLayer(original, original.end), undefined);
});

test('adding animations anchors the left edge at the playhead and trims only the end', () => {
  const owner = { start: 0, end: 10 };
  assert.deepEqual(initialAnimationSpan(owner, 0), { start: 0, end: 1.5 });
  assert.deepEqual(initialAnimationSpan(owner, 5), { start: 5, end: 6.5 });
  const lateOwner = { start: 4, end: 10 };
  assert.deepEqual(initialAnimationSpan(lateOwner, 4.125), { start: 0.125, end: 1.625 });
  assert.deepEqual(initialAnimationSpan(lateOwner, 9.875), { start: 5.875, end: 6 });
  for (const time of [0, 10, 11]) assert.deepEqual(initialAnimationSpan(lateOwner, time), { start: 0, end: 1.5 });
  assert.equal(initialAnimationSpan(lateOwner, 9.999), undefined);
});

test('a cut gives both clips independent identities and settings through move, delete, history and save', () => {
  const original = { ...newLayer('text', 1), end: 10, animations: [
    { ...clip('grow', 1, 3), phase: [0.1, 0.9] },
    clip('slide-in', 4, 7),
    clip('rotate', 8, 9),
  ] };
  const [left, right] = splitLayer(original, 5);
  assert.equal(new Set([original.id, left.id, right.id]).size, 3);
  assert.notEqual(left.animations, right.animations);
  const animations = [...original.animations, ...left.animations, ...right.animations];
  assert.equal(new Set(animations.map(item => item.id)).size, animations.length);
  assert.equal(new Set(animations.map(item => item.params)).size, animations.length);
  const phases = animations.flatMap(item => item.phase ? [item.phase] : []);
  assert.equal(new Set(phases).size, phases.length);
  const spans = owner => owner.animations.map(item => animationTimelineSpan(owner, item));
  const history = createHistory([original], (a, b) => a === b);
  history.update(() => [left, right]);
  const moved = editLayerSpan(right, 'move', 5, 15, left.end);
  history.update(() => [left, moved]);
  assert.deepEqual(spans(left), [{ start: 1, end: 3 }, { start: 4, end: 5 }]);
  assert.deepEqual(spans(moved), [{ start: 10, end: 12 }, { start: 13, end: 14 }]);
  history.update(() => [{ ...left, animations: left.animations.slice(0, 1) }, moved]);
  assert.deepEqual(spans(history.current[1]), spans(moved));
  assert.deepEqual(history.step(false), [left, moved]);
  assert.deepEqual(history.step(false), [left, right]);
  assert.deepEqual(history.step(false), [original]);
  history.step(true);
  history.step(true);
  const restored = unpackLayers(JSON.parse(JSON.stringify(packLayers(history.step(true)))));
  assert.deepEqual(restored.map(spans), [[{ start: 1, end: 3 }], spans(moved)]);
  assert.equal(restored[0].textTrackId, original.id);
  assert.equal(restored[1].textTrackId, original.id);
});

test('legacy timings migrate, remain editable outside the owner and persist across a project round trip', () => {
  const layer = migrateAbsoluteAnimations({ ...newLayer('text', 1), start: 5, end: 10,
    animations: [clip('fade-in', 7, 8), clip('fade-in', 10, 10), clip('grow', 11, 13)] });
  assert.equal(new Set(layer.animations.map(animation => animation.id)).size, 3);
  assert.equal(layer.animations[0].start, 2);
  assert.ok(layer.animations[1].end > layer.animations[1].start);
  const recovered = editAnimationSpan(layer.animations[2], 'move', -4, layer, 15);
  assert.deepEqual(animationTimelineSpan(layer, recovered), { start: 7, end: 9 });
  assert.deepEqual(editAnimationSpan(recovered, 'start', -1, layer, 15), { start: 1, end: 4 });
  assert.deepEqual(editAnimationSpan(recovered, 'end', 1, layer, 15), { start: 2, end: 5 });
  layer.animations[2] = { ...layer.animations[2], ...recovered };
  const [restored] = unpackLayers(JSON.parse(JSON.stringify(packLayers([layer]))));
  assert.deepEqual(restored.animations, layer.animations);
  assert.ok(evaluate(restored, 8, registry).scale > 1);
  assert.equal(evaluate(restored, 11, registry).opacity, 0);
});

test('splitting trimmed music keeps the same source position on both sides', () => {
  const audio = { start: 2, end: 10, inPoint: 3, muted: false, volume: 1,
    asset: { id: 'test', name: 'test.wav', duration: 20 } };
  const [left, right] = splitMusic(audio, 5.25);
  assert.equal(sourceTime(left, 5.25), sourceTime(right, 5.25));
  assert.equal(sourceTime(right, 9), sourceTime(audio, 9));
});
