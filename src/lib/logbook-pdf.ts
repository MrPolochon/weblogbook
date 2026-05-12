import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

export type LogbookPdfVol = {
  depart_utc: string;
  arrivee_utc: string | null;
  duree_minutes: number | null;
  statut: string;
  aeroport_depart: string | null;
  aeroport_arrivee: string | null;
  type_vol: string | null;
  role_pilote: string | null;
  callsign: string | null;
  compagnie_libelle: string | null;
  type_avion_nom: string | null;
  type_avion_constructeur: string | null;
  pilote_identifiant: string | null;
  copilote_identifiant: string | null;
  instructeur_identifiant: string | null;
  instruction_type: string | null;
};

export type LogbookPdfOptions = {
  pilote: {
    identifiant: string;
    heuresInitialesMinutes: number;
  };
  totalMinutes: number;
  totalValides: number;
  totalEnAttente: number;
  totalRefuses: number;
  vols: LogbookPdfVol[];
  filtres: {
    dateDebut: string | null;
    dateFin: string | null;
    statut: string | null;
    typeVol: string | null;
  };
  generatedAt: Date;
};

const PAGE_WIDTH = 842; // A4 landscape
const PAGE_HEIGHT = 595;
const MARGIN_X = 32;
const MARGIN_TOP = 36;
const MARGIN_BOTTOM = 36;

// Colonnes du tableau (en pixels)
const COLUMNS = [
  { key: 'date', label: 'Date', width: 70 },
  { key: 'depart', label: 'Dep', width: 44 },
  { key: 'arrivee', label: 'Arr', width: 44 },
  { key: 'heureDep', label: 'Dec.', width: 38 },
  { key: 'heureArr', label: 'Atr.', width: 38 },
  { key: 'duree', label: 'Duree', width: 50 },
  { key: 'avion', label: 'Appareil', width: 110 },
  { key: 'callsign', label: 'Callsign', width: 60 },
  { key: 'compagnie', label: 'Compagnie', width: 100 },
  { key: 'typeVol', label: 'Type', width: 70 },
  { key: 'role', label: 'Role', width: 60 },
  { key: 'crew', label: 'PIC / Co / Instr.', width: 80 },
  { key: 'statut', label: 'Statut', width: 56 },
] as const;
type ColumnKey = typeof COLUMNS[number]['key'];

const ROW_HEIGHT = 18;
const HEADER_HEIGHT = 22;

const COLOR_BORDER = rgb(0.78, 0.82, 0.88);
const COLOR_BORDER_DARK = rgb(0.55, 0.62, 0.72);
const COLOR_HEADER_BG = rgb(0.1, 0.18, 0.32);
const COLOR_HEADER_TEXT = rgb(1, 1, 1);
const COLOR_TEXT = rgb(0.1, 0.13, 0.18);
const COLOR_TEXT_MUTED = rgb(0.42, 0.46, 0.54);
const COLOR_ZEBRA = rgb(0.95, 0.96, 0.98);
const COLOR_VALIDE = rgb(0.0, 0.45, 0.27);
const COLOR_REFUSE = rgb(0.72, 0.18, 0.18);
const COLOR_EN_ATTENTE = rgb(0.65, 0.45, 0.05);
const COLOR_ACCENT = rgb(0.05, 0.36, 0.72);
const COLOR_ACCENT_BG = rgb(0.92, 0.96, 1);

function safeText(text: string | null | undefined): string {
  if (!text) return '';
  // Remplacer caracteres non-Latin1 (pdf-lib StandardFonts ne supporte que WinAnsi)
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2026]/g, '...')
    .replace(/[\u00A0]/g, ' ');
}

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (!text) return '';
  let t = text;
  let w = font.widthOfTextAtSize(t, size);
  if (w <= maxWidth) return t;
  const ellipsis = '…';
  // Iterative truncation (binary search would be over-engineered for short strings)
  while (t.length > 1) {
    t = t.slice(0, -1);
    w = font.widthOfTextAtSize(t + ellipsis, size);
    if (w <= maxWidth) return t + ellipsis;
  }
  return t;
}

function formatDureeMinutes(m: number): string {
  if (!m || m < 0) return '0h00';
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}h${min.toString().padStart(2, '0')}`;
}

function formatDateShort(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = String(d.getUTCFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function formatTimeShort(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function statutLabel(s: string): { label: string; color: ReturnType<typeof rgb> } {
  switch (s) {
    case 'valide':
    case 'validé':
      return { label: 'Valide', color: COLOR_VALIDE };
    case 'refuse':
    case 'refusé':
      return { label: 'Refuse', color: COLOR_REFUSE };
    case 'en_attente':
      return { label: 'Attente', color: COLOR_EN_ATTENTE };
    default:
      return { label: s || '-', color: COLOR_TEXT_MUTED };
  }
}

function columnX(key: ColumnKey): number {
  let x = MARGIN_X;
  for (const col of COLUMNS) {
    if (col.key === key) return x;
    x += col.width;
  }
  return x;
}

function tableWidth(): number {
  return COLUMNS.reduce((s, c) => s + c.width, 0);
}

function drawHeaderRow(page: PDFPage, y: number, fontBold: PDFFont) {
  const totalW = tableWidth();
  page.drawRectangle({
    x: MARGIN_X,
    y: y - HEADER_HEIGHT,
    width: totalW,
    height: HEADER_HEIGHT,
    color: COLOR_HEADER_BG,
  });
  for (const col of COLUMNS) {
    const x = columnX(col.key);
    const label = col.label;
    const w = fontBold.widthOfTextAtSize(label, 8.5);
    const textX = x + Math.max(4, (col.width - w) / 2);
    page.drawText(label, {
      x: textX,
      y: y - HEADER_HEIGHT / 2 - 3,
      size: 8.5,
      font: fontBold,
      color: COLOR_HEADER_TEXT,
    });
  }
  // Borders
  page.drawLine({
    start: { x: MARGIN_X, y: y - HEADER_HEIGHT },
    end: { x: MARGIN_X + totalW, y: y - HEADER_HEIGHT },
    color: COLOR_BORDER_DARK,
    thickness: 0.5,
  });
}

function drawRow(
  page: PDFPage,
  y: number,
  font: PDFFont,
  fontBold: PDFFont,
  values: Record<ColumnKey, string>,
  zebra: boolean,
  statutColor: ReturnType<typeof rgb>,
) {
  const totalW = tableWidth();
  if (zebra) {
    page.drawRectangle({
      x: MARGIN_X,
      y: y - ROW_HEIGHT,
      width: totalW,
      height: ROW_HEIGHT,
      color: COLOR_ZEBRA,
    });
  }
  for (const col of COLUMNS) {
    const x = columnX(col.key);
    const value = values[col.key];
    const size = 7.8;
    const f = col.key === 'date' || col.key === 'statut' ? fontBold : font;
    const cellPadding = 4;
    const text = truncate(safeText(value), f, size, col.width - cellPadding * 2);
    const color = col.key === 'statut' ? statutColor : col.key === 'callsign' ? COLOR_ACCENT : COLOR_TEXT;
    page.drawText(text, {
      x: x + cellPadding,
      y: y - ROW_HEIGHT / 2 - 2.6,
      size,
      font: f,
      color,
    });
    // Vertical separator
    if (col.key !== 'date') {
      page.drawLine({
        start: { x, y: y - ROW_HEIGHT },
        end: { x, y },
        color: COLOR_BORDER,
        thickness: 0.3,
      });
    }
  }
  // Horizontal bottom border
  page.drawLine({
    start: { x: MARGIN_X, y: y - ROW_HEIGHT },
    end: { x: MARGIN_X + totalW, y: y - ROW_HEIGHT },
    color: COLOR_BORDER,
    thickness: 0.3,
  });
}

function drawPageHeader(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  opts: LogbookPdfOptions,
  pageNumber: number,
) {
  const top = PAGE_HEIGHT - MARGIN_TOP;
  page.drawText('CARNET DE VOL - LOGBOOK', {
    x: MARGIN_X,
    y: top,
    size: 14,
    font: fontBold,
    color: COLOR_HEADER_BG,
  });

  const subtitle = `Pilote : ${safeText(opts.pilote.identifiant)}`;
  page.drawText(subtitle, {
    x: MARGIN_X,
    y: top - 16,
    size: 10,
    font,
    color: COLOR_TEXT,
  });

  // Date de generation
  const gen = opts.generatedAt;
  const genStr = `Edite le ${String(gen.getUTCDate()).padStart(2, '0')}/${String(gen.getUTCMonth() + 1).padStart(2, '0')}/${gen.getUTCFullYear()} a ${String(gen.getUTCHours()).padStart(2, '0')}:${String(gen.getUTCMinutes()).padStart(2, '0')} UTC`;
  const genWidth = font.widthOfTextAtSize(genStr, 8);
  page.drawText(genStr, {
    x: PAGE_WIDTH - MARGIN_X - genWidth,
    y: top,
    size: 8,
    font,
    color: COLOR_TEXT_MUTED,
  });

  const pageStr = `Page ${pageNumber}`;
  const pageW = font.widthOfTextAtSize(pageStr, 8);
  page.drawText(pageStr, {
    x: PAGE_WIDTH - MARGIN_X - pageW,
    y: top - 12,
    size: 8,
    font,
    color: COLOR_TEXT_MUTED,
  });
}

function drawSummaryBlock(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  opts: LogbookPdfOptions,
  y: number,
): number {
  const blockTop = y;
  const blockHeight = 64;
  const blockWidth = tableWidth();
  page.drawRectangle({
    x: MARGIN_X,
    y: blockTop - blockHeight,
    width: blockWidth,
    height: blockHeight,
    color: COLOR_ACCENT_BG,
    borderColor: COLOR_ACCENT,
    borderWidth: 0.8,
  });

  // Stats
  const stats: Array<{ label: string; value: string; emphasize?: boolean }> = [
    { label: 'Temps de vol TOTAL', value: formatDureeMinutes(opts.totalMinutes), emphasize: true },
    { label: 'Heures initiales', value: formatDureeMinutes(opts.pilote.heuresInitialesMinutes) },
    { label: 'Vols valides', value: String(opts.totalValides) },
    { label: 'En attente', value: String(opts.totalEnAttente) },
    { label: 'Refuses', value: String(opts.totalRefuses) },
    { label: 'Total exporte', value: String(opts.vols.length) },
  ];

  const padding = 14;
  const innerWidth = blockWidth - padding * 2;
  const colWidth = innerWidth / stats.length;
  stats.forEach((s, i) => {
    const x = MARGIN_X + padding + i * colWidth;
    page.drawText(safeText(s.label).toUpperCase(), {
      x,
      y: blockTop - 16,
      size: 7,
      font,
      color: COLOR_TEXT_MUTED,
    });
    page.drawText(safeText(s.value), {
      x,
      y: blockTop - 32,
      size: s.emphasize ? 16 : 13,
      font: fontBold,
      color: s.emphasize ? COLOR_ACCENT : COLOR_TEXT,
    });
  });

  // Filtres applique en bas du bloc
  const filtres: string[] = [];
  if (opts.filtres.dateDebut) filtres.push(`du ${opts.filtres.dateDebut}`);
  if (opts.filtres.dateFin) filtres.push(`au ${opts.filtres.dateFin}`);
  if (opts.filtres.statut && opts.filtres.statut !== 'tous') filtres.push(`statut : ${opts.filtres.statut}`);
  if (opts.filtres.typeVol && opts.filtres.typeVol !== 'tous') filtres.push(`type : ${opts.filtres.typeVol}`);
  const filtreLine = filtres.length > 0 ? `Filtres : ${filtres.join(' - ')}` : 'Filtres : aucun (toutes les donnees du logbook)';
  page.drawText(safeText(filtreLine), {
    x: MARGIN_X + padding,
    y: blockTop - blockHeight + 8,
    size: 7.5,
    font,
    color: COLOR_TEXT_MUTED,
  });

  return blockTop - blockHeight - 8;
}

function drawFooter(page: PDFPage, font: PDFFont) {
  const footerText =
    'Document genere automatiquement par Weblogbook. Les vols valides constituent le carnet de vol officiel.';
  const w = font.widthOfTextAtSize(footerText, 7);
  page.drawText(footerText, {
    x: (PAGE_WIDTH - w) / 2,
    y: MARGIN_BOTTOM / 2,
    size: 7,
    font,
    color: COLOR_TEXT_MUTED,
  });
}

export async function buildLogbookPdf(opts: LogbookPdfOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Logbook - ${opts.pilote.identifiant}`);
  pdf.setAuthor(opts.pilote.identifiant);
  pdf.setCreator('Weblogbook');
  pdf.setCreationDate(opts.generatedAt);

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let pageNumber = 1;
  drawPageHeader(page, font, fontBold, opts, pageNumber);
  let y = PAGE_HEIGHT - MARGIN_TOP - 32;
  y = drawSummaryBlock(page, font, fontBold, opts, y);

  // Header du tableau
  drawHeaderRow(page, y, fontBold);
  y -= HEADER_HEIGHT;

  const vols = opts.vols;
  if (vols.length === 0) {
    page.drawText('Aucun vol a afficher pour les filtres selectionnes.', {
      x: MARGIN_X + 8,
      y: y - 18,
      size: 10,
      font,
      color: COLOR_TEXT_MUTED,
    });
    drawFooter(page, font);
    return pdf.save();
  }

  let zebra = false;
  for (const v of vols) {
    if (y - ROW_HEIGHT < MARGIN_BOTTOM + 18) {
      drawFooter(page, font);
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pageNumber += 1;
      drawPageHeader(page, font, fontBold, opts, pageNumber);
      y = PAGE_HEIGHT - MARGIN_TOP - 32;
      drawHeaderRow(page, y, fontBold);
      y -= HEADER_HEIGHT;
      zebra = false;
    }

    const statut = statutLabel(v.statut);
    const avion = [v.type_avion_constructeur, v.type_avion_nom].filter(Boolean).join(' ').trim();
    const crewParts: string[] = [];
    if (v.pilote_identifiant) crewParts.push(`PIC: ${v.pilote_identifiant}`);
    if (v.copilote_identifiant) crewParts.push(`Co: ${v.copilote_identifiant}`);
    if (v.instructeur_identifiant) crewParts.push(`Instr: ${v.instructeur_identifiant}`);

    const values: Record<ColumnKey, string> = {
      date: formatDateShort(v.depart_utc),
      depart: v.aeroport_depart || '-',
      arrivee: v.aeroport_arrivee || '-',
      heureDep: formatTimeShort(v.depart_utc),
      heureArr: formatTimeShort(v.arrivee_utc),
      duree: formatDureeMinutes(v.duree_minutes || 0),
      avion: avion || '-',
      callsign: v.callsign || '-',
      compagnie: v.compagnie_libelle || '-',
      typeVol: v.type_vol || '-',
      role: v.role_pilote || '-',
      crew: crewParts.join(' / ') || '-',
      statut: statut.label,
    };
    drawRow(page, y, font, fontBold, values, zebra, statut.color);
    y -= ROW_HEIGHT;
    zebra = !zebra;
  }

  drawFooter(page, font);
  return pdf.save();
}

export function buildLogbookPdfFilename(identifiant: string, generatedAt: Date): string {
  const safeId = identifiant.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40) || 'pilote';
  const y = generatedAt.getUTCFullYear();
  const m = String(generatedAt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(generatedAt.getUTCDate()).padStart(2, '0');
  return `logbook_${safeId}_${y}-${m}-${d}.pdf`;
}
