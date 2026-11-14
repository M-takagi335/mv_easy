import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePreferences, recentLimit, rememberTemplate, searchTemplates } from '../src/libraryPreferences.ts';
import { templates, registry } from '../src/templates.ts';
import { defaults } from '../src/animation.ts';

test('preferences restore known favorites and bound the deduplicated recent order', () => {
  const known = new Set(registry.keys());
  let recent = [];
  for (const template of templates) recent = rememberTemplate(recent, template.id);
  recent = rememberTemplate(recent, recent[5]);
  assert.equal(recent.length, recentLimit);
  const restored = parsePreferences(JSON.stringify({ favorites: ['fade-in', 'missing', 'fade-in'], recent }), known);
  assert.deepEqual(restored, { favorites: ['fade-in'], recent });
  assert.deepEqual(parsePreferences('{', known), { favorites: [], recent: [] });
});

test('normalized search spans categories and new glyph effects are deterministic', () => {
  assert.ok(searchTemplates(templates, '８の字').some(item => item.id === 'figure-eight'));
  const matched = searchTemplates(templates, 'ウェーブ');
  assert.ok(matched.some(item => item.id === 'glyph-color-wave'));
  const scramble = registry.get('glyph-scramble');
  const sample = t => scramble.sample(t, defaults(scramble)).glyph.sample(3, 8);
  const mid = sample(0.4);
  assert.ok(mid.replacement);
  assert.equal(sample(1).replacement, undefined);
  assert.deepEqual(sample(0.4), mid);
});
