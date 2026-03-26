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

      const { decision, notes } = body;
      if (!decision || !['remis_en_etat', 'detruit'].includes(decision)) {
        return NextResponse.json({ error: 'Decision invalide (remis_en_etat ou detruit).' }, { status: 400 });
      }

      await admin.from('incidents_vol').update({
        statut: 'clos',
        decision,
        decision_notes: typeof notes === 'string' ? notes.trim() : null,
        examine_par_id: user.id,
        examine_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', id);

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
        } else {
          await admin.from('compagnie_avions').update({
            usure_percent: 100,
            statut: 'ground',
            bloque_incident: false,
            incident_id: null,
          }).eq('id', incident.compagnie_avion_id);
        }
      }

      if (incident.signalement_ifsa_id) {
        await admin.from('ifsa_signalements').update({
          statut: 'classe',
          reponse_ifsa: `Decision staff: ${decision === 'detruit' ? 'Avion detruit' : 'Avion remis en etat (usure 100%)'}.${typeof notes === 'string' && notes.trim() ? ' Notes: ' + notes.trim() : ''}`,
          traite_par_id: user.id,
          traite_at: new Date().toISOString(),
        }).eq('id', incident.signalement_ifsa_id);
      }

      if (incident.pilote_id) {
        const decisionLabel = decision === 'detruit'
          ? 'Votre avion a ete officiellement declare DETRUIT suite a l\'examen.'
          : 'Votre avion a ete remis en etat (usure remise a 100%) suite a l\'examen.';
        await admin.from('messages').insert({
          destinataire_id: incident.pilote_id,
          titre: `Incident ${incident.numero_incident} — Decision`,
          contenu: `L'incident ${incident.numero_incident} (${incident.type_incident === 'crash' ? 'CRASH' : 'Atterrissage d\'urgence'}) concernant votre vol ${incident.numero_vol} a ete examine.\n\n${decisionLabel}${typeof notes === 'string' && notes.trim() ? '\n\nNotes du staff: ' + notes.trim() : ''}`,
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
