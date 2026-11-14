import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyAutomaticAnimations, automaticCandidates } from '../src/autoAnimation.ts';
import { templates } from '../src/templates.ts';
import { createHistory } from '../src/history.ts';
import { editLayerSpan, newLayer, packLayers, splitLayer, unpackLayers } from '../src/model.ts';

test('long lyric clips can draw every catalog ID without repeating a slot while alternatives remain', () => {
  const layers = Array.from({ length: templates.length }, (_, index) => ({
    ...newLayer('text', index), start: index * 3, end: (index + 1) * 3, textTrackId: 'lyrics',
  }));
  const { layers: result } = applyAutomaticAnimations(layers, layers[0].id, 'high', () => 0);
  assert.deepEqual(new Set(result.flatMap(layer => layer.animations.map(item => item.template))),
    new Set(templates.map(item => item.id)));
  assert.ok(result.every((layer, index) =>
    layer.animations.every((item, slot) => item.template !== result[index - 1]?.animations[slot].template)));
  const short = { ...layers[0], end: 0.5 };
  assert.ok(automaticCandidates(short).every(item => !item.textOnly));
  assert.equal(applyAutomaticAnimations([short], short.id, 'high', () => 0).layers[0].animations.length, 1);
});

test('automatic application respects length, ownership, existing effects and history', () => {
  const short = { ...newLayer('text', 1), end: 0.45, textTrackId: 'lyrics' };
  const manual = { id: 'manual', template: 'fade-in', start: 0, end: 0.4, params: { opacity: 0 } };
  const middle = { ...newLayer('text', 2), start: 2, end: 5, textTrackId: 'lyrics', animations: [manual] };
  const long = { ...newLayer('text', 3), start: 5, end: 8, textTrackId: 'lyrics' };
  const other = newLayer('text', 4);
  const original = [long, other, middle, short];
  const history = createHistory(original, Object.is);
  const result = applyAutomaticAnimations(original, middle.id, 'high');
  assert.equal(result.affected, 3);
  const [longClip, untouched, existing, shortClip] = result.layers;
  assert.equal(untouched, other);
  assert.equal(existing.animations[0], manual);
  assert.equal(shortClip.animations.length, 1);
  assert.equal(longClip.animations.length, 3);
  assert.notEqual(longClip.animations[2].template, existing.animations[2].template);
  const all = result.layers.flatMap(layer => layer.animations.map(item => {
    assert.ok(item.start >= 0 && item.end > item.start && item.end <= layer.end - layer.start);
    return item;
  }));
  assert.equal(new Set(all.map(item => item.id)).size, all.length);
  assert.equal(new Set(all.map(item => item.params)).size, all.length);
  const repeated = applyAutomaticAnimations(result.layers, middle.id, 'high');
  assert.equal(repeated.added, 7);
  assert.equal(repeated.affected, 3);
  assert.deepEqual(repeated.layers[2].animations.slice(0, existing.animations.length), existing.animations);
  history.update(() => result.layers);
  assert.equal(history.step(false), original);
  assert.equal(history.step(true), result.layers);
  const restored = unpackLayers(JSON.parse(JSON.stringify(packLayers(result.layers))));
  const restoredLong = restored.find(item => item.id === long.id);
  assert.deepEqual(restoredLong.animations, longClip.animations);
  const [, right] = splitLayer(restoredLong, 6.5);
  assert.ok(right.animations.every(item => !all.some(original => original.id === item.id)));
  assert.deepEqual(editLayerSpan(restoredLong, 'move', 2).animations, longClip.animations);
});
