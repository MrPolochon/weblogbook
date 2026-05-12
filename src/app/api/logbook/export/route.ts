import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';
import { buildLogbookPdf, buildLogbookPdfFilename, type LogbookPdfVol } from '@/lib/logbook-pdf';

export const dynamic = 'force-dynamic';

const STATUTS_AUTORISES = ['tous', 'valide', 'en_attente', 'refuse'] as const;

type StatutFiltre = typeof STATUTS_AUTORISES[number];

function parseDate(input: string | null): string | null {
  if (!input) return null;
  // Accepter YYYY-MM-DD
  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return input;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const statutRaw = searchParams.get('statut') || 'valide';
    const statut: StatutFiltre = (STATUTS_AUTORISES as readonly string[]).includes(statutRaw)
      ? (statutRaw as StatutFiltre)
      : 'valide';

    const typeVol = searchParams.get('type_vol')?.trim() || null; // 'tous' ou un type
    const dateDebut = parseDate(searchParams.get('date_debut'));
    const dateFin = parseDate(searchParams.get('date_fin'));
    const inclureMilitaire = searchParams.get('inclure_militaire') === '1';

    // Optionnel : permettre l'export d'un autre pilote pour les admins
    const targetUserIdRaw = searchParams.get('user_id');
    let targetUserId = user.id;
    let targetProfile: { identifiant: string | null; heures_initiales_minutes: number | null } | null = null;

    const admin = createAdminClient();

    if (targetUserIdRaw && targetUserIdRaw !== user.id) {
      const { data: me } = await supabase
        .from('profiles')
        .select('role, ifsa')
        .eq('id', user.id)
        .single();
      if (me?.role !== 'admin' && !me?.ifsa) {
        return NextResponse.json({ error: 'Export d\'un autre logbook réservé aux administrateurs / IFSA' }, { status: 403 });
      }
      targetUserId = targetUserIdRaw;
    }

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('identifiant, heures_initiales_minutes')
      .eq('id', targetUserId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 });
    }
    targetProfile = profile;

    // Construire la requête de vols
    let query = admin
      .from('vols')
      .select(`
        id, pilote_id, copilote_id, instructeur_id, duree_minutes, depart_utc, arrivee_utc, statut, compagnie_libelle, type_vol, role_pilote, callsign,
        aeroport_depart, aeroport_arrivee, instruction_type, type_avion_militaire,
        type_avion:types_avion(nom, constructeur),
        pilote:profiles!vols_pilote_id_fkey(identifiant),
        copilote:profiles!vols_copilote_id_fkey(identifiant),
        instructeur:profiles!vols_instructeur_id_fkey(identifiant)
      `)
      .or(`pilote_id.eq.${targetUserId},copilote_id.eq.${targetUserId},instructeur_id.eq.${targetUserId}`)
      .order('depart_utc', { ascending: true })
      .limit(5000);

    if (!inclureMilitaire) {
      query = query.neq('type_vol', 'Vol militaire');
    }

    // Mapping statut -> valeurs en DB (la base utilise 'validé', 'refusé' avec accents)
    if (statut === 'valide') {
      query = query.eq('statut', 'validé');
    } else if (statut === 'refuse') {
      query = query.eq('statut', 'refusé');
    } else if (statut === 'en_attente') {
      query = query.eq('statut', 'en_attente');
    } else {
      // 'tous' : restreindre aux statuts pertinents
      query = query.in('statut', ['validé', 'en_attente', 'refusé']);
    }

    if (typeVol && typeVol !== 'tous') {
      query = query.eq('type_vol', typeVol);
    }

    if (dateDebut) {
      query = query.gte('depart_utc', `${dateDebut}T00:00:00.000Z`);
    }
    if (dateFin) {
      query = query.lte('depart_utc', `${dateFin}T23:59:59.999Z`);
    }

    const { data: vols, error: volsError } = await query;
    if (volsError) {
      console.error('Logbook export query error:', volsError);
      return NextResponse.json({ error: volsError.message }, { status: 400 });
    }

    const volsForPdf: LogbookPdfVol[] = (vols || []).map((v) => {
      const ta = Array.isArray(v.type_avion) ? v.type_avion[0] : v.type_avion;
      const pilote = Array.isArray(v.pilote) ? v.pilote[0] : v.pilote;
      const copilote = Array.isArray(v.copilote) ? v.copilote[0] : v.copilote;
      const instructeur = Array.isArray(v.instructeur) ? v.instructeur[0] : v.instructeur;
      return {
        depart_utc: v.depart_utc,
        arrivee_utc: v.arrivee_utc,
        duree_minutes: v.duree_minutes,
        statut: v.statut,
        aeroport_depart: v.aeroport_depart,
        aeroport_arrivee: v.aeroport_arrivee,
        type_vol: v.type_vol,
        role_pilote: v.role_pilote,
        callsign: v.callsign,
        compagnie_libelle: v.compagnie_libelle,
        type_avion_nom: (ta as { nom?: string } | null)?.nom || v.type_avion_militaire || null,
        type_avion_constructeur: (ta as { constructeur?: string } | null)?.constructeur || null,
        pilote_identifiant: (pilote as { identifiant?: string } | null)?.identifiant || null,
        copilote_identifiant: (copilote as { identifiant?: string } | null)?.identifiant || null,
        instructeur_identifiant: (instructeur as { identifiant?: string } | null)?.identifiant || null,
        instruction_type: v.instruction_type,
      };
    });

    // Statistiques globales (sans tenir compte des filtres pour cohérence avec la page)
    // Mais on calcule celles spécifiques à l'export
    const valides = volsForPdf.filter((v) => v.statut === 'validé');
    const enAttente = volsForPdf.filter((v) => v.statut === 'en_attente');
    const refuses = volsForPdf.filter((v) => v.statut === 'refusé');

    const totalMinutesValides = valides.reduce((s, v) => s + (v.duree_minutes || 0), 0);
    const heuresInitiales = targetProfile.heures_initiales_minutes || 0;
    const totalMinutes = heuresInitiales + totalMinutesValides;

    const identifiant = targetProfile.identifiant || 'pilote';
    const generatedAt = new Date();

    const pdfBytes = await buildLogbookPdf({
      pilote: {
        identifiant,
        heuresInitialesMinutes: heuresInitiales,
      },
      totalMinutes,
      totalValides: valides.length,
      totalEnAttente: enAttente.length,
      totalRefuses: refuses.length,
      vols: volsForPdf,
      filtres: {
        dateDebut,
        dateFin,
        statut,
        typeVol: typeVol,
      },
      generatedAt,
    });

    const filename = buildLogbookPdfFilename(identifiant, generatedAt);

    // ArrayBuffer pour eviter l'avertissement TS sur le SharedArrayBuffer
    const buffer = new Uint8Array(pdfBytes).slice().buffer as ArrayBuffer;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('Logbook export error:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
