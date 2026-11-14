import type { Layer } from './model.ts';

export type FontOption = { family: string; label: string };
export interface FontProvider {
  list(): Promise<FontOption[]>;
  has(family: string): boolean;
}

export const suggestedFonts: FontOption[] = [
  { family: 'Yu Gothic', label: '游ゴシック' },
  { family: 'Yu Mincho', label: '游明朝' },
  { family: 'Meiryo', label: 'メイリオ' },
  { family: 'MS Gothic', label: 'ＭＳ ゴシック' },
  { family: 'MS Mincho', label: 'ＭＳ 明朝' },
  { family: 'BIZ UDGothic', label: 'BIZ UDゴシック' },
  { family: 'BIZ UDMincho', label: 'BIZ UD明朝' },
  ...['Noto Sans CJK JP', 'Noto Serif CJK JP', 'Arial', 'Calibri', 'Georgia', 'Times New Roman'].map(
    family => ({ family, label: family }),
  ),
];

export function quoteFamily(family: string) {
  return '"' + family.replace(/["\\\u0000-\u001f\u007f]/g, character => '\\' + character.charCodeAt(0).toString(16) + ' ') + '"';
}

const defaultStack = '"Inter", "Yu Gothic UI", "Meiryo", sans-serif';
const fallbackStack = '"Yu Gothic UI", "Meiryo", "Noto Sans CJK JP", sans-serif';

// Share this resolution with any renderer that consumes project text.
export function resolveTextFont(layer: Pick<Layer, 'fontFamily' | 'fontBold' | 'fontItalic'>, provider: FontProvider) {
  const family = layer.fontFamily?.trim();
  const unavailable = Boolean(family && !provider.has(family));
  return {
    unavailable,
    fontFamily: family ? (unavailable ? fallbackStack : `${quoteFamily(family)}, ${fallbackStack}`) : defaultStack,
    fontWeight: layer.fontBold === undefined ? 760 : layer.fontBold ? 700 : 400,
    fontStyle: layer.fontItalic ? 'italic' as const : 'normal' as const,
  };
}

export function createBrowserFontProvider(): FontProvider {
  const installed = new Set<string>();
  const measured = new Map<string, boolean>();
  const normalize = (name: string) => name.toLowerCase();
  return {
    async list() {
      const browser = window as Window & { queryLocalFonts?: () => Promise<{ family: string }[]> };
      const fonts = await browser.queryLocalFonts?.();
      if (!fonts) return [];
      const families = new Map<string, string>();
      for (const { family } of fonts) if (family) families.set(normalize(family), family);
      for (const family of families.keys()) installed.add(family);
      return Array.from(families.values(), family => ({ family, label: family }));
    },
    has(family) {
      const name = normalize(family);
      if (installed.has(name)) return true;
      const cached = measured.get(name);
      if (cached !== undefined) return cached;
      // FontFaceSet.check also succeeds for an unknown family. Compare browser metrics against fallbacks.
      const canvas = document.createElement('canvas').getContext('2d');
      const found = canvas !== null && ['monospace', 'serif', 'sans-serif'].some(fallback => {
        return ['MWilQp@123', '日本語あいうカナ永'].some(sample => {
          canvas.font = `64px ${fallback}`;
          const base = canvas.measureText(sample);
          canvas.font = `64px ${quoteFamily(family)}, ${fallback}`;
          const candidate = canvas.measureText(sample);
          return candidate.width !== base.width || candidate.actualBoundingBoxAscent !== base.actualBoundingBoxAscent ||
            candidate.actualBoundingBoxDescent !== base.actualBoundingBoxDescent;
        });
      });
      measured.set(name, found);
      return found;
    },
  };
}
