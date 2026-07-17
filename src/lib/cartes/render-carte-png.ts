import sharp from 'sharp';
import type { AeroSchoolRespondentCarte } from '@/lib/aeroschool-respondent-profiles';
import { svgText } from '@/lib/cartes/svg-text-paths';

const WIDTH = 300;
const HEIGHT = 420;

export type RenderCartePngOptions = {
  identifiant?: string;
  discordUsername?: string | null;
};

function shiftHex(hex: string, percent: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const num = parseInt(h, 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * (percent / 100))));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * (percent / 100))));
  const b = Math.max(0, Math.min(255, (num & 0xff) + Math.round(255 * (percent / 100))));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR');
  } catch {
    return dateStr;
  }
}

async function fetchImageDataUrl(url: string | null, width: number, height: number): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    const png = await sharp(input)
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;
  }
}

function buildCasesRow(cases: string[], y: number, valueFontSize: number): string {
  if (cases.length === 0) return '';
  const gap = 4;
  const cellWidth = (WIDTH - 28 - gap * (cases.length - 1)) / cases.length;
  return cases
    .map((value, index) => {
      const x = 14 + index * (cellWidth + gap);
      const cx = x + cellWidth / 2;
      const textY = y + valueFontSize + 4;
      return `
        <rect x="${x}" y="${y}" width="${cellWidth}" height="${valueFontSize + 14}" rx="4" fill="rgba(255,255,255,0.95)" />
        ${svgText(truncate(value, 8), { x: cx, y: textY, fontSize: valueFontSize, fill: '#0f172a', weight: 'bold', anchor: 'middle' })}
      `;
    })
    .join('');
}

function buildQualifRow(cases: string[], y: number): string {
  if (cases.length === 0) return '';
  const gap = 4;
  const cellWidth = (WIDTH - 28 - gap * (cases.length - 1)) / cases.length;
  return cases
    .map((value, index) => {
      const x = 14 + index * (cellWidth + gap);
      const cx = x + cellWidth / 2;
      return `
        <rect x="${x}" y="${y}" width="${cellWidth}" height="22" rx="4" fill="rgba(255,255,255,0.9)" />
        ${svgText(truncate(value, 10), { x: cx, y: y + 15, fontSize: 10, fill: '#0f172a', weight: 'bold', anchor: 'middle' })}
      `;
    })
    .join('');
}

/**
 * Génère un PNG de la carte d'identité pilote (approximation visuelle de CarteIdentite md).
 * Le texte est rendu en chemins SVG (opentype) pour fiabilité sur Linux/Vercel (librsvg sans Arial).
 */
export async function renderCartePng(
  carte: AeroSchoolRespondentCarte,
  options: RenderCartePngOptions = {},
): Promise<Buffer | null> {
  const { identifiant, discordUsername } = options;
  try {
    const base = carte.couleur_fond || '#1E3A8A';
    const lighter = shiftHex(base, 10);
    const darker = shiftHex(base, -22);
    const isStaff = base.toUpperCase() === '#1F2937';
    const displayName = carte.nom_affiche || identifiant || '—';
    const showIdentifiantLine =
      Boolean(identifiant) && identifiant !== carte.nom_affiche && Boolean(carte.nom_affiche);
    const mainDate = formatDate(carte.date_expiration || carte.date_delivrance);

    const [logoDataUrl, photoDataUrl] = await Promise.all([
      fetchImageDataUrl(carte.logo_url, 80, 80),
      fetchImageDataUrl(carte.photo_url, 96, 116),
    ]);

    let cursorY = 14;

    const titleBar = `
      <rect x="14" y="${cursorY}" width="${WIDTH - 28}" height="38" rx="6" fill="rgba(255,255,255,0.95)" />
      ${svgText(truncate(carte.titre, 40), {
        x: WIDTH / 2,
        y: cursorY + 25,
        fontSize: 14,
        fill: '#0f172a',
        weight: 'bold',
        anchor: 'middle',
      })}
    `;
    cursorY += 46;

    const casesHaut = buildQualifRow(carte.cases_haut, cursorY);
    if (carte.cases_haut.length > 0) cursorY += 28;

    const sousTitre = carte.sous_titre
      ? svgText(truncate(carte.sous_titre, 60), {
          x: WIDTH / 2,
          y: cursorY + 12,
          fontSize: 11,
          fill: '#ffffff',
          weight: 'italic',
          anchor: 'middle',
        })
      : '';
    if (carte.sous_titre) cursorY += 22;

    const mediaY = cursorY + 8;
    const logoX = 36;
    const photoX = WIDTH - 36 - 96;

    const logoBlock = logoDataUrl
      ? `<image href="${logoDataUrl}" x="${logoX}" y="${mediaY}" width="80" height="80" preserveAspectRatio="xMidYMid meet" />`
      : `
        <rect x="${logoX}" y="${mediaY}" width="80" height="80" rx="40" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2" stroke-dasharray="6 4" />
        ${svgText('LOGO', { x: logoX + 40, y: mediaY + 46, fontSize: 10, fill: '#ffffff', weight: 'bold', anchor: 'middle' })}
      `;

    const photoBlock = photoDataUrl
      ? `
        <rect x="${photoX - 2}" y="${mediaY - 2}" width="100" height="120" rx="6" fill="rgba(255,255,255,0.3)" />
        <image href="${photoDataUrl}" x="${photoX}" y="${mediaY}" width="96" height="116" preserveAspectRatio="xMidYMid slice" clip-path="url(#photoClip)" />
      `
      : `
        <rect x="${photoX}" y="${mediaY}" width="96" height="116" rx="6" fill="rgba(226,232,240,0.85)" />
        ${svgText('Photo', { x: photoX + 48, y: mediaY + 62, fontSize: 11, fill: '#64748b', weight: 'regular', anchor: 'middle' })}
      `;

    cursorY = mediaY + 130;

    let infoYOffset = 0;
    const infoLines: string[] = [
      svgText(mainDate, { x: 14, y: cursorY, fontSize: 16, fill: '#ffffff', weight: 'bold' }),
      svgText(truncate(displayName.toUpperCase(), 28), {
        x: 14,
        y: cursorY + 24,
        fontSize: 14,
        fill: '#ffffff',
        weight: 'bold',
      }),
      svgText(truncate(carte.organisation || 'IFSA', 40), {
        x: 14,
        y: cursorY + 42,
        fontSize: 11,
        fill: '#ffffff',
        weight: 'regular',
      }),
      svgText(carte.numero_carte || '000 00 000000', {
        x: 14,
        y: cursorY + 58,
        fontSize: 11,
        fill: '#ffffff',
        weight: 'regular',
      }),
    ];

    if (showIdentifiantLine && identifiant) {
      infoLines.push(
        svgText(`ID: ${truncate(identifiant, 24)}`, {
          x: 14,
          y: cursorY + 74,
          fontSize: 10,
          fill: '#e2e8f0',
          weight: 'regular',
        }),
      );
      infoYOffset += 16;
    }

    if (discordUsername) {
      infoLines.push(
        svgText(`Discord: ${truncate(discordUsername, 22)}`, {
          x: 14,
          y: cursorY + 74 + infoYOffset,
          fontSize: 10,
          fill: '#e2e8f0',
          weight: 'regular',
        }),
      );
    }

    const infoBlock = infoLines.join('\n');

    const casesBasY = HEIGHT - 52;
    const casesBas = buildCasesRow(carte.cases_bas, casesBasY, 18);

    const staffBar = isStaff
      ? `<rect x="0" y="0" width="${WIDTH}" height="6" fill="url(#staffBar)" />`
      : '';

    const svg = `
      <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${lighter}" />
            <stop offset="45%" stop-color="${base}" />
            <stop offset="100%" stop-color="${darker}" />
          </linearGradient>
          <linearGradient id="staffBar" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#fbbf24" />
            <stop offset="50%" stop-color="#f59e0b" />
            <stop offset="100%" stop-color="#fbbf24" />
          </linearGradient>
          <clipPath id="photoClip">
            <rect x="${photoX}" y="${mediaY}" width="96" height="116" rx="6" />
          </clipPath>
          <pattern id="grid" width="14" height="14" patternUnits="userSpaceOnUse">
            <path d="M 14 0 L 0 0 0 14" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
          </pattern>
        </defs>
        <rect width="${WIDTH}" height="${HEIGHT}" rx="12" fill="url(#bg)" />
        <rect width="${WIDTH}" height="${HEIGHT}" rx="12" fill="url(#grid)" />
        ${staffBar}
        ${titleBar}
        ${casesHaut}
        ${sousTitre}
        ${logoBlock}
        ${photoBlock}
        ${infoBlock}
        ${casesBas}
      </svg>
    `;

    return await sharp(Buffer.from(svg)).png().toBuffer();
  } catch (err) {
    console.error('[CarteIdentite] renderCartePng error:', err);
    return null;
  }
}
