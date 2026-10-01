import type { createAdminClient } from '@/lib/supabase/admin';
import { AEROPORTS_PTFS } from '@/lib/aeroports-ptfs';
import { OFFICIAL_SITE_URL } from '@/lib/site-url';

type Admin = ReturnType<typeof createAdminClient>;
const LIMIT = 5;
const brief = (value: unknown, length = 450) => String(value ?? '').slice(0, length);

/** Lectures ciblées, aucune mutation, aucun champ privé de création/annonce Discord. */
export async function buildSiteContext(admin: Admin, topic: string, hasAccount: boolean, now = new Date()): Promise<string> {
  const t = topic.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const blocks: string[] = [];
  const jobs: Promise<void>[] = [];
  const iso = now.toISOString();
  if (/\bnotams?\b/.test(t)) jobs.push((async () => {
    const airports = AEROPORTS_PTFS.filter((a) => new RegExp(`\\b${a.code}\\b`, 'i').test(topic)).map((a) => a.code);
    if (!hasAccount) { blocks.push('NOTAMs actuels : compte lié nécessaire pour consulter ces données.'); return; }
    if (!airports.length) { blocks.push('NOTAMs actuels : préciser le code de l’aéroport PTFS pour consulter les avis.'); return; }
    try {
      const { data, error } = await admin.from('notams')
        .select('identifiant, code_aeroport, du_at, au_at, permanent, champ_e, champ_d, reference_fr')
        .in('code_aeroport', airports.slice(0, 3)).eq('annule', false).lte('du_at', iso)
        .or(`permanent.eq.true,au_at.gte.${iso}`).order('permanent', { ascending: false })
        .order('du_at', { ascending: false }).limit(LIMIT + 1).abortSignal(AbortSignal.timeout(4000));
      if (error) throw new Error('notams_unavailable');
      const rows = (data || []).slice(0, LIMIT).map((n) => ({
        code: n.identifiant, aeroport: n.code_aeroport, debutUTC: n.du_at,
        finUTC: n.permanent ? 'PERM' : n.au_at, horaires: brief(n.champ_d),
        texte: brief(n.champ_e, 750), versionFr: n.reference_fr,
      }));
      blocks.push(`NOTAMs PTFS consultés à ${iso} (${new URL('/notams', OFFICIAL_SITE_URL).href}). ` +
        `Aéroports: ${airports.slice(0, 3).join(', ')}. ${(data || []).length > LIMIT ? 'Aperçu limité, consulter la page pour la liste complète.' : 'Avis en période de validité ; vérifier aussi leurs horaires.'} ` +
        'Les textes longs peuvent être abrégés : ne pas les présenter comme un briefing exhaustif. ' +
        JSON.stringify(rows));
    } catch { blocks.push('NOTAMs actuels : consultation indisponible, ne pas affirmer qu’il n’y a aucune restriction.'); }
  })());
  if (/\b(calendrier|evenements?|prochaines? sessions?)\b/.test(t)) jobs.push((async () => {
    try {
      const { data, error } = await admin.from('site_calendar_events')
        .select('title, description, location, starts_at, ends_at')
        .or(`ends_at.gte.${iso},and(ends_at.is.null,starts_at.gte.${iso})`)
        .order('starts_at', { ascending: true }).limit(LIMIT + 1)
        .abortSignal(AbortSignal.timeout(4000));
      if (error) throw new Error('calendar_unavailable');
      blocks.push(`Calendrier public consulté à ${iso} (${new URL('/calendrier', OFFICIAL_SITE_URL).href}) : ` +
        'aperçu des cinq premiers événements en cours ou à venir, horaires UTC, aucune disponibilité de réservation garantie. ' +
        JSON.stringify((data || []).slice(0, LIMIT).map((e) => ({
          titre: brief(e.title, 140), description: brief(e.description, 220), lieu: brief(e.location, 120),
          debutUTC: e.starts_at, finUTC: e.ends_at,
        }))));
    } catch { blocks.push('Calendrier actuel : consultation indisponible, ne pas inventer de date ni conclure à une absence d’événements.'); }
  })());
  await Promise.all(jobs);
  return blocks.join('\n\n');
}
