import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHistory } from '../src/history.ts';
import { newLayer, packLayers, splitLayer, unpackLayers } from '../src/model.ts';
import { randomAnimations } from '../src/randomAnimation.ts';
import { registry } from '../src/templates.ts';

test('random batches keep their placement, IDs and parameters through history and saving', () => {
  const manual = [
    { id: 'manual-fade', template: 'fade-in', start: 2, end: 3, params: { opacity: 23 } },
    { id: 'manual-rotate', template: 'rotate', start: 2, end: 3, params: { angle: 72 } },
  ];
  const first = { ...newLayer('text', 1), start: 2, end: 5, textTrackId: 'lyrics', animations: manual };
  const sibling = { ...newLayer('text', 2), start: 5, textTrackId: 'lyrics' };
  const history = createHistory([first, sibling], Object.is);
  const add = count => history.update(([target, other]) => [
    { ...target, animations: [...target.animations, ...randomAnimations(target, 4, count, 'all', () => 0.5)] }, other,
  ]);
  const firstBatch = add(3);
  assert.equal(firstBatch[0].animations.length, 5);
  const secondBatch = add(5);
  const effects = secondBatch[0].animations;
  assert.equal(effects.length, 10);
  assert.deepEqual(effects.slice(0, 2), manual);
  assert.equal(new Set(effects.map(item => item.template)).size, 10);
  assert.equal(new Set(effects.map(item => item.id)).size, 10);
  assert.equal(new Set(effects.map(item => item.params)).size, 10);
  assert.ok(effects.every(item => item.start === 2 && item.end === 3));
  assert.equal(secondBatch[1], sibling);
  assert.equal(history.step(false), firstBatch);
  assert.equal(history.step(true), secondBatch);
  const [restored] = unpackLayers(JSON.parse(JSON.stringify(packLayers(secondBatch))));
  assert.deepEqual(restored.animations, effects);
  const [left, right] = splitLayer(restored, 4.5);
  assert.equal(left.animations.length, 10);
  assert.equal(right.animations.length, 10);
  assert.ok(right.animations.every(item => item.start === 0 && !left.animations.some(other => other.id === item.id)));
});

test('genre and object compatibility constrain the draw, with repeats only when needed', () => {
  const shape = newLayer('rectangle', 1);
  const options = randomAnimations(shape, -1, 20, '色変化', () => 0);
  assert.equal(options.length, 20);
  assert.equal(new Set(options.slice(0, 5).map(item => item.template)).size, 5);
  assert.ok(options.every(item => item.start === 0 && registry.get(item.template).category === '色変化'));
  assert.deepEqual(randomAnimations(shape, 0, 3, '文字アニメーション'), []);
  assert.deepEqual(randomAnimations({ ...shape, end: 0.01 }, 0, 3, 'all'), []);
  assert.deepEqual(randomAnimations(shape, 0, 1.5, 'all'), []);
});
