import { useMemo } from 'react';
import type { GlyphEffect, GlyphPose } from './animation';
import { CANVAS } from './model';

const characters = new Intl.Segmenter('ja', { granularity: 'grapheme' });
const words = new Intl.Segmenter('ja', { granularity: 'word' });

export function AnimatedText({ text, effects }: { text: string; effects: GlyphEffect[] }) {
  const segments = useMemo(() => {
    const groups = [...words.segment(text)];
    let word = -1;
    let line = 0;
    let letter = 0;
    const units = groups.flatMap(group => {
      if (group.isWordLike || /\S/.test(group.segment)) word++;
      return [...characters.segment(group.segment)].map(({ segment, index }) => {
        const newline = /[\r\n]/.test(segment);
        const item = { segment, index: group.index + index, line, word: Math.max(0, word), letter, newline };
        if (newline) line++;
        else if (/\S/.test(segment)) letter++;
        return item;
      });
    });
    return { units, counts: { word: Math.max(1, word + 1), line: line + 1, grapheme: Math.max(1, letter), whole: 1 } };
  }, [text]);
  const singleUnit = effects.every(effect => effect.unit === effects[0].unit) ? effects[0].unit : 'grapheme';
  const indexFor = (item: typeof segments.units[number], unit: string) =>
    unit === 'line' ? item.line : unit === 'word' ? item.word : unit === 'whole' ? 0 : item.letter;
  const runs: typeof segments.units[] = [];
  for (const item of segments.units) {
    const last = runs.at(-1);
    if (last && !item.newline && !last[0].newline && singleUnit !== 'grapheme' &&
        indexFor(last[0], singleUnit) === indexFor(item, singleUnit)) last.push(item);
    else runs.push([item]);
  }
  return <span className="animated-text">{runs.map(run => {
    const first = run[0];
    if (first.newline) return <br key={first.index} />;
    const value = run.map(item => item.segment).join('');
    if (!/\S/.test(value)) return value;
    const pose: Required<GlyphPose> = { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 };
    for (const effect of effects) {
      const count = segments.counts[effect.unit as keyof typeof segments.counts] ?? segments.counts.grapheme;
      const part = effect.sample(indexFor(first, effect.unit), count);
      pose.x += part.x ?? 0;
      pose.y += part.y ?? 0;
      pose.rotation += part.rotation ?? 0;
      pose.scale *= part.scale ?? 1;
      pose.opacity *= part.opacity ?? 1;
    }
    return <span className="animated-glyph" key={first.index} style={{ opacity: pose.opacity,
      transform: `translate(${pose.x * 100 / CANVAS.width}cqw, ${pose.y * 100 / CANVAS.width}cqw) rotate(${pose.rotation}deg) scale(${pose.scale})` }}>{value}</span>;
  })}</span>;
}
