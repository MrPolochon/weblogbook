import sharp from 'sharp';
import type { AeroSchoolRespondentCarte } from '@/lib/aeroschool-respondent-profiles';

const WIDTH = 300;
const HEIGHT = 420;

function shiftHex(hex: string, percent: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const num = parseInt(h, 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * (percent / 100))));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * (percent / 100))));
  const b = Math.max(0, Math.min(255, (num & 0xff) + Math.round(255 * (percent / 100))));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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

function buildCasesRow(
  cases: string[],
  y: number,
  fontSize: number,
  valueFontSize: number,
): string {
  if (cases.length === 0) return '';
  const gap = 4;
  const cellWidth = (WIDTH - 28 - gap * (cases.length - 1)) / cases.length;
  return cases
    .map((value, index) => {
      const x = 14 + index * (cellWidth + gap);
      return `
        <rect x="${x}" y="${y}" width="${cellWidth}" height="${valueFontSize + 14}" rx="4" fill="rgba(255,255,255,0.95)" />
        <text x="${x + cellWidth / 2}" y="${y + valueFontSize + 4}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${valueFontSize}" font-weight="800" fill="#0f172a">${escapeXml(truncate(value, 8))}</text>
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
      return `
        <rect x="${x}" y="${y}" width="${cellWidth}" height="22" rx="4" fill="rgba(255,255,255,0.9)" />
        <text x="${x + cellWidth / 2}" y="${y + 15}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="700" fill="#0f172a">${escapeXml(truncate(value, 10))}</text>
      `;
    })
    .join('');
}

/**
 * Génère un PNG de la carte d'identité pilote (approximation visuelle de CarteIdentite md).
 * Retourne null en cas d'échec — l'appelant doit continuer sans image.
 */
export async function renderCartePng(
  carte: AeroSchoolRespondentCarte,
  identifiant?: string,
): Promise<Buffer | null> {
  try {
    const base = carte.couleur_fond || '#1E3A8A';
    const lighter = shiftHex(base, 10);
    const darker = shiftHex(base, -22);
    const isStaff = base.toUpperCase() === '#1F2937';
    const displayName = carte.nom_affiche || identifiant || '—';
    const mainDate = formatDate(carte.date_expiration || carte.date_delivrance);

    const [logoDataUrl, photoDataUrl] = await Promise.all([
      fetchImageDataUrl(carte.logo_url, 80, 80),
      fetchImageDataUrl(carte.photo_url, 96, 116),
    ]);

    let cursorY = 14;

    const titleBar = `
      <rect x="14" y="${cursorY}" width="${WIDTH - 28}" height="38" rx="6" fill="rgba(255,255,255,0.95)" />
      <text x="${WIDTH / 2}" y="${cursorY + 25}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="800" fill="#0f172a">${escapeXml(truncate(carte.titre, 40))}</text>
    `;
    cursorY += 46;

    const casesHaut = buildQualifRow(carte.cases_haut, cursorY);
    if (carte.cases_haut.length > 0) cursorY += 28;

    const sousTitre = carte.sous_titre
      ? `<text x="${WIDTH / 2}" y="${cursorY + 12}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11" font-style="italic" fill="rgba(255,255,255,0.9)">${escapeXml(truncate(carte.sous_titre, 60))}</text>`
      : '';
    if (carte.sous_titre) cursorY += 22;

    const mediaY = cursorY + 8;
    const logoX = 36;
    const photoX = WIDTH - 36 - 96;

    const logoBlock = logoDataUrl
      ? `<image href="${logoDataUrl}" x="${logoX}" y="${mediaY}" width="80" height="80" preserveAspectRatio="xMidYMid meet" />`
      : `
        <rect x="${logoX}" y="${mediaY}" width="80" height="80" rx="40" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2" stroke-dasharray="6 4" />
        <text x="${logoX + 40}" y="${mediaY + 46}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="700" fill="rgba(255,255,255,0.45)">LOGO</text>
      `;

    const photoBlock = photoDataUrl
      ? `
        <rect x="${photoX - 2}" y="${mediaY - 2}" width="100" height="120" rx="6" fill="rgba(255,255,255,0.3)" />
        <image href="${photoDataUrl}" x="${photoX}" y="${mediaY}" width="96" height="116" preserveAspectRatio="xMidYMid slice" clip-path="url(#photoClip)" />
      `
      : `
        <rect x="${photoX}" y="${mediaY}" width="96" height="116" rx="6" fill="rgba(226,232,240,0.85)" />
        <text x="${photoX + 48}" y="${mediaY + 62}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="600" fill="#64748b">Photo</text>
      `;

    cursorY = mediaY + 130;

    const infoBlock = `
      <text x="14" y="${cursorY}" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" fill="#ffffff">${escapeXml(mainDate)}</text>
      <text x="14" y="${cursorY + 24}" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700" fill="#ffffff">${escapeXml(truncate(displayName.toUpperCase(), 28))}</text>
      <text x="14" y="${cursorY + 42}" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="600" fill="rgba(255,255,255,0.9)">${escapeXml(truncate(carte.organisation || 'IFSA', 40))}</text>
      <text x="14" y="${cursorY + 58}" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="600" fill="rgba(255,255,255,0.85)" letter-spacing="2">${escapeXml(carte.numero_carte || '000 00 000000')}</text>
    `;

    const casesBasY = HEIGHT - 52;
    const casesBas = buildCasesRow(carte.cases_bas, casesBasY, 10, 18);

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
