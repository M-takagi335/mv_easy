import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newLayer, packLayers, unpackLayers } from '../src/model.ts';
import { defaultSettings, makeProjectFile, readProjectFile, uniqueProjectIds } from '../src/projectFile.ts';

function fixture() {
  const title = { ...newLayer('text', 1), text: '文字PV', fontFamily: 'Meiryo', fontItalic: true, color: '#baebff',
    animations: [{ id: 'a', template: 'neon-glow', start: 0, end: 2, params: { color: '#ffffff', radius: 12 } }] };
  const next = { ...title, id: 'next', start: 5, end: 10, text: 'サビ', textTrackId: title.id };
  const music = { id: 'music', start: 1, end: 4, inPoint: 1, volume: 0.65, muted: false,
    asset: { id: 'sound', name: '歌.wav', duration: 8 } };
  return { version: 1, animationTime: 'relative', settings: { ...defaultSettings, name: 'サンプル', fps: 60 },
    layers: packLayers([{ ...title, textTrackId: title.id }, next, newLayer('ellipse', 2)]), music, musicClips: [music] };
}

test('ordinary project retains settings, music reference and editable clip data', async () => {
  const project = fixture();
  const file = makeProjectFile(project);
  const read = await readProjectFile(file);
  assert.deepEqual(read.project, project);
  assert.equal(read.audio, undefined);
  const restored = uniqueProjectIds(unpackLayers(read.project.layers), read.project.musicClips);
  assert.equal(restored.layers[0].textTrackId, restored.layers[1].textTrackId);
  assert.notEqual(restored.layers[0].animations[0].id, restored.layers[1].animations[0].id);
});

test('portable project preserves raw audio and rejects truncated data', async () => {
  const project = fixture();
  const file = makeProjectFile(project, { file: new Blob([new Uint8Array([0, 255, 128])], { type: 'audio/wav' }) });
  const read = await readProjectFile(file);
  assert.deepEqual(read.project, project);
  assert.equal(read.audio.type, 'audio/wav');
  assert.deepEqual(new Uint8Array(await read.audio.arrayBuffer()), new Uint8Array([0, 255, 128]));
  await assert.rejects(readProjectFile(file.slice(0, file.size - 1)));
});

test('legacy files load and malformed metadata or unsupported versions are rejected', async () => {
  const { layers, music } = fixture();
  const legacy = await readProjectFile(new Blob([JSON.stringify({ layers, music })]));
  assert.deepEqual(legacy.project.musicClips, [music]);
  for (const payload of ['{ broken', '{"version":2,"layers":[]}', '{"layers":[{"kind":"text-track","id":"x","clips":[null]}]}']) {
    await assert.rejects(readProjectFile(new Blob([payload])));
  }
});
