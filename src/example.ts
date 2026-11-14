import { defaults } from './animation.ts';
import { newLayer } from './model.ts';
import type { Animation, Layer } from './model.ts';
import { registry } from './templates.ts';

function clip(template: string, start: number, end: number): Animation {
  return { id: crypto.randomUUID(), template, start, end, params: defaults(registry.get(template)!) };
}

export function exampleLayers(): Layer[] {
  return [
    { ...newLayer('text', 1), name: 'メインタイトル', text: '夜明けのシグナル',
      x: 960, y: 520, width: 1620, fontSize: 144, end: 11,
      animations: [clip('fade-in', 0, 1.3), clip('slide-in', 0, 1.8), clip('fade-out', 9, 11)] },
    { ...newLayer('text', 2), name: 'サブタイトル', text: 'S I G N A L   A T   D A W N',
      x: 960, y: 680, fontSize: 42, color: '#c5b6ff', start: 0.5, end: 10, animations: [clip('fade-in', 0.5, 1.7)] },
    { ...newLayer('rectangle', 1), name: 'アクセント', x: 960, y: 774, width: 144, height: 9,
      color: '#a98aff', start: 1.2, end: 10, animations: [] },
    { ...newLayer('rectangle', 2), name: '背景', x: 960, y: 540, width: 1920, height: 1080,
      color: '#21183f', animations: [] },
  ];
}
