import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getInstructionCapabilities,
  canAccessInstructionManagerTools,
  listProfilesEligibleAsFormationReferent,
  LICENCE_FI,
  LICENCE_FE,
  LICENCE_ATC_FI,
  LICENCE_ATC_FE,
} from '@/lib/instruction-permissions';
import { notifyUser } from '@/lib/notifications';

/**
 * GET — Récupère le statut de disponibilité de l'instructeur connecté.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('instruction_indisponible')
      .eq('id', user.id)
      .single();

    return NextResponse.json({ instruction_indisponible: profile?.instruction_indisponible ?? false });
  } catch (e) {
    console.error('instruction/disponibilite GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * POST — Bascule le mode indisponible d'un instructeur/examinateur.
 *
 * Body : { indisponible: boolean }
 *
 * Quand indisponible = true :
 *  - Les élèves actifs sont transférés vers un autre instructeur disponible
 *    (charge de travail la plus faible). Si aucun disponible, la formation
 *    est suspendue (instructeur_referent_id mis à null).
 *  - Les demandes d'examen en attente assignées à cet instructeur sont
 *    réassignées automatiquement.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
    const cap = await getInstructionCapabilities(admin, user.id, me?.role);

    const isInstructeur = canAccessInstructionManagerTools(cap);
    const isExaminateur = cap.canExamineFlight || cap.canExamineAtc;

    if (!isInstructeur && !isExaminateur) {
      return NextResponse.json({ error: 'Réservé aux instructeurs et examinateurs (FI, FE, ATC FI, ATC FE).' }, { status: 403 });
    }

    const body = await request.json();
    const indisponible: boolean = Boolean(body.indisponible);

    // Mettre à jour le statut
    const { error: upErr } = await admin
      .from('profiles')
      .update({ instruction_indisponible: indisponible })
      .eq('id', user.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

    let transfertsEffectues = 0;
    let elevesNonTransferes: string[] = [];

    if (indisponible) {
      // --- Transfert des élèves actifs ---
      const { data: elevesActifs } = await admin
        .from('profiles')
        .select('id, identifiant, formation_instruction_licence')
        .eq('instructeur_referent_id', user.id)
        .eq('formation_instruction_active', true);

      for (const eleve of elevesActifs || []) {
        const licenceCode = (eleve.formation_instruction_licence as string | null) || '';

        // Trouver les candidats éligibles (disponibles, exclure soi-même)
        const eligibles = await listProfilesEligibleAsFormationReferent(admin, licenceCode);
        const candidats = eligibles.filter((p) => p.id !== user.id);

        // Filtrer les indisponibles
        const candidatsIds = candidats.map((p) => p.id);
        const disponibles = candidatsIds.length > 0
          ? await (async () => {
              const { data } = await admin
                .from('profiles')
                .select('id')
                .in('id', candidatsIds)
                .eq('instruction_indisponible', false);
              return (data || []).map((p) => p.id as string);
            })()
          : [];

        if (disponibles.length === 0) {
          // Aucun instructeur disponible : suspendre la formation
          await admin
            .from('profiles')
            .update({ instructeur_referent_id: null })
            .eq('id', eleve.id);
          elevesNonTransferes.push(eleve.identifiant as string);
          continue;
        }

        // Choisir l'instructeur avec la charge la plus faible
        const charges = new Map<string, number>();
        for (const id of disponibles) charges.set(id, 0);
        const { data: chargeRows } = await admin
          .from('profiles')
          .select('id')
          .in('id', disponibles)
          .eq('formation_instruction_active', true);
        // On compte les élèves actifs par instructeur
        for (const id of disponibles) {
          const { count } = await admin
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('instructeur_referent_id', id)
            .eq('formation_instruction_active', true);
          charges.set(id, count ?? 0);
        }
        const nouvelInstructeurId = [...charges.entries()].sort((a, b) => a[1] - b[1])[0][0];

        await admin
          .from('profiles')
          .update({ instructeur_referent_id: nouvelInstructeurId })
          .eq('id', eleve.id);

        transfertsEffectues++;

        // Notifier le nouvel instructeur et l'élève
        try {
          await notifyUser(nouvelInstructeurId, {
            type: 'transfer_in',
            title: 'Nouvel élève transféré',
            body: `${eleve.identifiant} vous a été transféré suite à l'indisponibilité de son instructeur référent.`,
            link: '/instruction',
          });
          await notifyUser(eleve.id as string, {
            type: 'transfer_out',
            title: "Changement d'instructeur référent",
            body: "Votre instructeur référent s'est mis en indisponibilité. Vous avez été transféré à un nouvel instructeur.",
            link: '/instruction',
          });
        } catch (e) {
          console.error('Notification transfert élève:', e);
        }
      }

      // --- Réassignation des demandes d'examen en attente ---
      const { data: examsPending } = await admin
        .from('instruction_exam_requests')
        .select('id, requester_id, licence_code')
        .eq('instructeur_id', user.id)
        .in('statut', ['assigne', 'accepte']);

      for (const exam of examsPending || []) {
        const licenceCode = exam.licence_code as string;
        const isAtcExam = ['CAL-ATC', 'PCAL-ATC', 'CAL-AFIS', 'PCAL-AFIS', 'LPAFIS', 'LATC'].includes(licenceCode);

        const { data: examinateurs } = await admin
          .from('licences_qualifications')
          .select('user_id')
          .eq('type', isAtcExam ? LICENCE_ATC_FE : LICENCE_FE);

        const pool = (examinateurs || [])
          .map((r) => r.user_id as string)
          .filter((id) => id !== user.id);

        if (pool.length === 0) continue;

        // Filtrer les indisponibles
        const { data: dispRows } = await admin
          .from('profiles')
          .select('id')
          .in('id', pool)
          .eq('instruction_indisponible', false);
        const disponiblesExam = (dispRows || []).map((r) => r.id as string);

        if (disponiblesExam.length === 0) continue;

        // Charge d'examen (demandes assigne/accepte)
        const chargesExam = new Map<string, number>();
        for (const id of disponiblesExam) chargesExam.set(id, 0);
        const { data: examChargeRows } = await admin
          .from('instruction_exam_requests')
          .select('instructeur_id')
          .in('instructeur_id', disponiblesExam)
          .in('statut', ['assigne', 'accepte']);
        for (const r of examChargeRows || []) {
          const id = r.instructeur_id as string;
          chargesExam.set(id, (chargesExam.get(id) || 0) + 1);
        }
        const nouvelExaminateurId = [...chargesExam.entries()].sort((a, b) => a[1] - b[1])[0][0];

        await admin
          .from('instruction_exam_requests')
          .update({ instructeur_id: nouvelExaminateurId })
          .eq('id', exam.id);

        try {
          await notifyUser(nouvelExaminateurId, {
            type: 'exam_reassigned_new',
            title: `Examen ${licenceCode} réassigné`,
            body: "Une demande d'examen vous a été transférée suite à l'indisponibilité de l'examinateur précédent.",
            link: '/instruction',
          });
        } catch (e) {
          console.error('Notification réassignation examen:', e);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      indisponible,
      transferts: transfertsEffectues,
      elevesNonTransferes,
    });
  } catch (e) {
    console.error('instruction/disponibilite POST:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
