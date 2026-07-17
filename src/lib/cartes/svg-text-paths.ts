import fs from 'fs';
import path from 'path';
import opentype from 'opentype.js';

type FontWeight = 'regular' | 'bold' | 'italic';

const fontCache: Partial<Record<FontWeight, opentype.Font>> = {};
let fontsDirCache: string | null = null;

function resolveFontsDir(): string {
  if (fontsDirCache) return fontsDirCache;
  const candidates = [
    path.join(__dirname, 'fonts'),
    path.join(process.cwd(), 'src/lib/cartes/fonts'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'DejaVuSans.ttf'))) {
      fontsDirCache = dir;
      return dir;
    }
  }
  throw new Error('[CarteIdentite] Polices DejaVu introuvables pour le rendu PNG');
}

function loadFont(weight: FontWeight): opentype.Font {
  if (!fontCache[weight]) {
    const file =
      weight === 'bold'
        ? 'DejaVuSans-Bold.ttf'
        : weight === 'italic'
          ? 'DejaVuSans-Oblique.ttf'
          : 'DejaVuSans.ttf';
    const fontPath = path.join(resolveFontsDir(), file);
    fontCache[weight] = opentype.loadSync(fontPath);
  }
  return fontCache[weight]!;
}

function escapePathAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
}

export type SvgTextOptions = {
  x: number;
  y: number;
  fontSize: number;
  fill: string;
  weight?: FontWeight;
  anchor?: 'start' | 'middle' | 'end';
};

/**
 * Convertit du texte en chemins SVG (pas de dépendance fontconfig/librsvg).
 * Nécessaire sur Linux/Vercel où les polices système (Arial) sont absentes.
 */
export function svgText(text: string, options: SvgTextOptions): string {
  if (!text) return '';
  const { x, y, fontSize, fill, weight = 'regular', anchor = 'start' } = options;
  const font = loadFont(weight);
  const width = font.getAdvanceWidth(text, fontSize);
  let drawX = x;
  if (anchor === 'middle') drawX = x - width / 2;
  else if (anchor === 'end') drawX = x - width;

  const glyphPath = font.getPath(text, drawX, y, fontSize);
  const d = glyphPath.toPathData(2);
  if (!d) return '';
  return `<path d="${escapePathAttr(d)}" fill="${fill}" />`;
}
