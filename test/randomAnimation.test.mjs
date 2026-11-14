import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHistory } from '../src/history.ts';
import { newLayer, packLayers, splitLayer, unpackLayers } from '../src/model.ts';
import { drawTemplate, eligibleTemplates, randomAnimations, RANDOM_BATCH_LIMIT } from '../src/randomAnimation.ts';
import { registry } from '../src/templates.ts';
import { evaluate } from '../src/animation.ts';

test('all compatible IDs appear, with no adjacent repeats between shuffled batches', () => {
  for (const kind of ['text', 'rectangle', 'ellipse']) {
    const layer = newLayer(kind, 1);
    const candidates = eligibleTemplates(kind);
    const result = randomAnimations(layer, 0, Math.min(RANDOM_BATCH_LIMIT, candidates.length + 1), 'all', () => 0);
    assert.deepEqual(new Set(result.slice(0, candidates.length).map(item => item.template)),
      new Set(candidates.map(item => item.id)));
    assert.ok(result.every((item, i) => item.template !== result[i - 1]?.template));
    const effects = result.filter(item => ['neon-glow', 'glitch-burst', 'glyph-scramble', 'accordion'].includes(item.template));
    for (const animation of effects) {
      const animated = { ...layer, animations: [animation] };
      assert.notDeepEqual(evaluate(animated, layer.start + 0.41, registry), evaluate(layer, layer.start + 0.41, registry));
    }
  }
});

test('a new draw cycle skips the previous template when alternatives exist', () => {
  const candidates = eligibleTemplates('text');
  assert.notEqual(drawTemplate([...candidates], () => 0, candidates[0].id).id, candidates[0].id);
});

test('first draws distribute across the complete catalog', () => {
  const layer = newLayer('text', 1);
  const ids = eligibleTemplates('text');
  const counts = new Map(ids.map(item => [item.id, 0]));
  let state = 77;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < ids.length * 100; i++) {
    const [{ template }] = randomAnimations(layer, 0, 1, 'all', random);
    counts.set(template, counts.get(template) + 1);
  }
  assert.ok([...counts.values()].every(count => count >= 60 && count <= 145));
});

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
  const effects = [...registry.values()].filter(item => item.category === 'グリッチ・エフェクト');
  const drawnEffects = randomAnimations(shape, 0, effects.length, 'グリッチ・エフェクト', () => 0);
  assert.deepEqual(new Set(drawnEffects.map(item => item.template)), new Set(effects.map(item => item.id)));
  assert.deepEqual(randomAnimations(shape, 0, 3, '文字アニメーション'), []);
  assert.deepEqual(randomAnimations({ ...shape, end: 0.01 }, 0, 3, 'all'), []);
  assert.deepEqual(randomAnimations(shape, 0, 1.5, 'all'), []);
});
