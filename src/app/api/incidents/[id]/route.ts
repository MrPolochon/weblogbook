export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role, ifsa').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    const isIfsa = Boolean(profile?.ifsa);
    if (!isAdmin && !isIfsa) return NextResponse.json({ error: 'Acces admin/IFSA requis.' }, { status: 403 });

    const admin = createAdminClient();
    const { data, error } = await admin.from('incidents_vol').select('*').eq('id', id).single();
    if (error || !data) return NextResponse.json({ error: 'Incident introuvable' }, { status: 404 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role, ifsa, identifiant').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    const isIfsa = Boolean(profile?.ifsa);
    if (!isAdmin && !isIfsa) return NextResponse.json({ error: 'Acces admin/IFSA requis.' }, { status: 403 });

    const body = await request.json();
    const { action } = body;
    const admin = createAdminClient();

    const { data: incident, error: incErr } = await admin.from('incidents_vol').select('*').eq('id', id).single();
    if (incErr || !incident) return NextResponse.json({ error: 'Incident introuvable' }, { status: 404 });

    if (action === 'prendre_en_charge') {
      if (incident.statut !== 'en_attente') return NextResponse.json({ error: 'Incident deja pris en charge.' }, { status: 400 });
      await admin.from('incidents_vol').update({
        statut: 'en_examen',
        examine_par_id: user.id,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
      return NextResponse.json({ ok: true });
    }

    if (action === 'decider') {
      if (incident.statut === 'clos') return NextResponse.json({ error: 'Incident deja clos.' }, { status: 400 });
      if (incident.statut === 'en_attente') return NextResponse.json({ error: 'Prenez d\'abord l\'incident en charge avant de rendre une decision.' }, { status: 400 });

      const { decision, notes, usure_percent: usurePercentRaw } = body;
      if (!decision || !['remis_en_etat', 'detruit', 'aucune_action', 'usure_modifiee'].includes(decision)) {
        return NextResponse.json({ error: 'Decision invalide.' }, { status: 400 });
      }

      let usureApresDecision: number | null = null;
      if (decision === 'usure_modifiee') {
        if (!incident.compagnie_avion_id) {
          return NextResponse.json({ error: 'Aucun avion compagnie lié à cet incident.' }, { status: 400 });
        }
        const usureCible = Math.round(Number(usurePercentRaw));
        if (!Number.isFinite(usureCible) || usureCible < 0 || usureCible > 100) {
          return NextResponse.json({ error: 'Usure invalide (0 à 100).' }, { status: 400 });
        }
        const { data: avionRef } = await admin
          .from('compagnie_avions')
          .select('usure_percent')
          .eq('id', incident.compagnie_avion_id)
          .single();
        const usureMax = avionRef?.usure_percent ?? incident.usure_avant_incident ?? 100;
        if (usureCible > usureMax) {
          return NextResponse.json({
            error: `L'usure ne peut être réduite que vers la baisse (max actuel : ${usureMax}%).`,
          }, { status: 400 });
        }
        usureApresDecision = usureCible;
      }

      await admin.from('incidents_vol').update({
        statut: 'clos',
        decision,
        decision_notes: typeof notes === 'string' ? notes.trim() : null,
        usure_apres_decision: usureApresDecision,
        examine_par_id: user.id,
        examine_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', id);

      // Supprimer les photos uploadées maintenant que l'incident est clôturé
      const imagesUrls: string[] = (incident as any).images_urls || [];
      if (imagesUrls.length > 0) {
        try {
          const paths = imagesUrls.map((url: string) => {
            const match = url.match(/\/storage\/v1\/object\/public\/cartes-identite\/(.+)$/);
            return match ? match[1] : null;
          }).filter((p: string | null): p is string => Boolean(p));
          if (paths.length > 0) await admin.storage.from('cartes-identite').remove(paths);
          await admin.from('incidents_vol').update({ images_urls: [] }).eq('id', id);
        } catch (deleteErr) { console.warn('Delete incident photos:', deleteErr); }
      }

      if (incident.compagnie_avion_id) {
        if (decision === 'detruit') {
          await admin.from('compagnie_avions').update({
            detruit: true,
            detruit_at: new Date().toISOString(),
            detruit_par_id: user.id,
            detruit_raison: `${incident.type_incident === 'crash' ? 'Crash' : 'Incident'} — ${incident.numero_incident}`,
            bloque_incident: false,
            incident_id: null,
          }).eq('id', incident.compagnie_avion_id);
        } else if (decision === 'remis_en_etat') {
          await admin.from('compagnie_avions').update({
            usure_percent: 100,
            statut: 'ground',
            bloque_incident: false,
            incident_id: null,
          }).eq('id', incident.compagnie_avion_id);
        } else if (decision === 'usure_modifiee' && usureApresDecision != null) {
          await admin.from('compagnie_avions').update({
            usure_percent: usureApresDecision,
            statut: usureApresDecision === 0 ? 'bloque' : 'ground',
            bloque_incident: false,
            incident_id: null,
          }).eq('id', incident.compagnie_avion_id);
        } else {
          // aucune_action : débloquer l'avion sans toucher à l'usure
          await admin.from('compagnie_avions').update({
            statut: 'ground',
            bloque_incident: false,
            incident_id: null,
          }).eq('id', incident.compagnie_avion_id);
        }
      }

      const decisionLabels = {
        detruit: 'Votre avion a été officiellement déclaré DÉTRUIT suite à l\'examen.',
        remis_en_etat: 'Votre avion a été remis en état (usure remise à 100%) suite à l\'examen.',
        aucune_action: 'Aucune action n\'a été effectuée sur votre avion. Il est de nouveau disponible avec son usure actuelle.',
        usure_modifiee: usureApresDecision != null
          ? `L'usure de votre avion a été définie à ${usureApresDecision}% suite à l'examen.${usureApresDecision === 0 ? ' L\'avion est bloqué et nécessite une réparation.' : ''}`
          : 'L\'usure de votre avion a été modifiée suite à l\'examen.',
      };

      const staffDecisionLabel =
        decision === 'detruit' ? 'Avion détruit'
        : decision === 'remis_en_etat' ? 'Avion remis en état (usure 100%)'
        : decision === 'usure_modifiee' ? `Usure définie à ${usureApresDecision ?? '?'}%`
        : 'Aucune action — avion débloqué';

      if (incident.signalement_ifsa_id) {
        await admin.from('ifsa_signalements').update({
          statut: 'classe',
          reponse_ifsa: `Décision staff: ${staffDecisionLabel}.${typeof notes === 'string' && notes.trim() ? ' Notes: ' + notes.trim() : ''}`,
          traite_par_id: user.id,
          traite_at: new Date().toISOString(),
        }).eq('id', incident.signalement_ifsa_id);
      }

      if (incident.pilote_id) {
        await admin.from('messages').insert({
          destinataire_id: incident.pilote_id,
          titre: `Incident ${incident.numero_incident} — Décision`,
          contenu: `L'incident ${incident.numero_incident} (${incident.type_incident === 'crash' ? 'CRASH' : 'Atterrissage d\'urgence'}) concernant votre vol ${incident.numero_vol} a été examiné.\n\n${decisionLabels[decision as keyof typeof decisionLabels]}${typeof notes === 'string' && notes.trim() ? '\n\nNotes du staff: ' + notes.trim() : ''}`,
          type_message: 'systeme',
          expediteur_id: user.id,
        });
      }

      return NextResponse.json({ ok: true, decision });
    }

    return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
  } catch (e) {
    console.error('incidents PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
