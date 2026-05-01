import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const FORMATION_ARCHIVE_FOLDER_ROOT = 'DOSSIER FORMATION';

export function formationArchiveStoragePath(
  licenceCode: string,
  eleveIdentifiant: string,
  completedAt: Date,
): string {
  const safeLicence = licenceCode.replace(/[^a-zA-Z0-9.-]/g, '_');
  const safeId = eleveIdentifiant.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
  const stamp = completedAt.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `${FORMATION_ARCHIVE_FOLDER_ROOT}/${safeLicence}/${safeId}_${stamp}.pdf`;
}

function wrapLines(text: string, maxChars: number): string[] {
  const t = text.replace(/\r\n/g, '\n').trim();
  if (!t) return [];
  const lines: string[] = [];
  for (const para of t.split('\n')) {
    let rest = para.trim();
    while (rest.length > 0) {
      if (rest.length <= maxChars) {
        lines.push(rest);
        break;
      }
      let slice = rest.slice(0, maxChars);
      const lastSpace = slice.lastIndexOf(' ');
      if (lastSpace > maxChars * 0.55) slice = rest.slice(0, lastSpace);
      lines.push(slice.trimEnd());
      rest = rest.slice(slice.length).trimStart();
    }
  }
  return lines;
}

export async function buildFormationClosurePdf(opts: {
  eleveIdentifiant: string;
  licenceLabel: string;
  licenceCode: string;
  instructeurIdentifiant: string | null;
  completedAtLabel: string;
  modules: Array<{ code: string; title: string; completed: boolean; note: string | null }>;
  avionsLines: string[];
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;
  const fontSize = 10;
  const lineH = 13;
  const pageWidth = 595;
  const pageHeight = 842;
  const maxTextWidth = pageWidth - margin * 2;
  const charsPerLine = Math.floor(maxTextWidth / (fontSize * 0.52));

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const draw = (text: string, bold = false, size = fontSize, color = rgb(0.1, 0.1, 0.12)) => {
    const lines = wrapLines(text, charsPerLine);
    const f = bold ? fontBold : font;
    for (const line of lines) {
      if (y < margin + lineH * 3) {
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(line, { x: margin, y, size, font: f, color });
      y -= lineH;
    }
  };

  draw('Synthèse de fin de formation', true, 14);
  y -= lineH * 0.5;
  draw(`Élève : ${opts.eleveIdentifiant}`, true);
  draw(`Formation : ${opts.licenceLabel} (${opts.licenceCode})`);
  draw(`Instructeur référent : ${opts.instructeurIdentifiant ?? '—'}`);
  draw(`Date de clôture : ${opts.completedAtLabel}`);
  y -= lineH;

  draw('Modules et suivi', true, 11);
  for (const m of opts.modules) {
    const ok = m.completed ? 'Réalisé' : 'Non réalisé';
    draw(`${m.code} — ${m.title} — ${ok}`, true);
    if (m.note && m.note.trim()) {
      draw(`    Note : ${m.note.trim()}`);
    } else {
      draw('    Note : —');
    }
    y -= lineH * 0.35;
  }

  y -= lineH * 0.5;
  draw('Avions temporaires d\'instruction', true, 11);
  if (opts.avionsLines.length === 0) {
    draw('Aucun avion temporaire enregistré sur le dossier au moment de la clôture.');
  } else {
    for (const line of opts.avionsLines) draw(`- ${line}`);
  }

  y -= lineH;
  draw(
    'Document genere automatiquement par le carnet de vol Weblogbook — conservation conforme aux usages de l\'aeroclub.',
    false,
    8,
    rgb(0.35, 0.35, 0.38),
  );

  const bytes = await pdf.save();
  return bytes;
}
