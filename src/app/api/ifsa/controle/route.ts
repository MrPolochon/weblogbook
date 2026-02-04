import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

async function checkIfsa(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, ifsa')
    .eq('id', userId)
    .single();
  return profile?.ifsa || profile?.role === 'admin';
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    if (!await checkIfsa(supabase, user.id)) {
      return NextResponse.json({ error: 'Accès réservé à l\'IFSA' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const id = searchParams.get('id');

    if (!type || !id) {
      return NextResponse.json({ error: 'type et id requis' }, { status: 400 });
    }

    const admin = createAdminClient();

    if (type === 'pilote') {
      const { data: profile } = await admin
        .from('profiles')
        .select('id, identifiant, role, heures_initiales_minutes')
        .eq('id', id)
        .single();

      if (!profile) return NextResponse.json({ error: 'Pilote introuvable' }, { status: 404 });

      const { data: comptePerso } = await admin
        .from('felitz_comptes')
        .select('id, vban, solde, type')
        .eq('proprietaire_id', id)
        .eq('type', 'personnel')
        .single();

      let transactions: Array<{ id: string; type: string; montant: number; libelle: string; description?: string | null; created_at: string }> = [];
      if (comptePerso) {
        const { data } = await admin
          .from('felitz_transactions')
          .select('id, type, montant, libelle, description, created_at')
          .eq('compte_id', comptePerso.id)
          .order('created_at', { ascending: false })
          .limit(100);
        transactions = data || [];
      }

      const { data: licences } = await admin
        .from('licences_qualifications')
        .select('id, type, type_avion_id, langue, date_delivrance, date_expiration, a_vie, note, created_at, types_avion(nom, constructeur)')
        .eq('user_id', id)
        .order('created_at', { ascending: false });

      const selectVols = `
        id, pilote_id, copilote_id, instructeur_id, chef_escadron_id, duree_minutes, depart_utc, arrivee_utc, statut, compagnie_libelle, type_vol, role_pilote, callsign, type_avion_militaire,
        aeroport_depart, aeroport_arrivee, instruction_type,
        type_avion:types_avion(nom, constructeur),
        instructeur:profiles!vols_instructeur_id_fkey(identifiant),
        pilote:profiles!vols_pilote_id_fkey(identifiant),
        copilote:profiles!vols_copilote_id_fkey(identifiant)
      `;

      const { data: vols } = await admin
        .from('vols')
        .select(selectVols)
        .or(`pilote_id.eq.${id},copilote_id.eq.${id},instructeur_id.eq.${id},chef_escadron_id.eq.${id}`)
        .in('statut', ['en_attente', 'validé', 'refusé'])
        .order('depart_utc', { ascending: false })
        .limit(200);

      const totalValides = (vols || []).filter((v) => v.statut === 'validé');
      const totalMinutes =
        (profile.heures_initiales_minutes ?? 0) +
        totalValides.reduce((s, v) => s + (v.duree_minutes || 0), 0);

      return NextResponse.json({
        profile,
        compte: comptePerso,
        transactions,
        licences: licences || [],
        logbook: {
          totalMinutes,
          vols: vols || [],
        },
      });
    }

    if (type === 'compagnie') {
      const { data: compagnie } = await admin
        .from('compagnies')
        .select('id, nom, vban, pdg_id')
        .eq('id', id)
        .single();

      if (!compagnie) return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });

      const { data: compteEntreprise } = await admin
        .from('felitz_comptes')
        .select('id, vban, solde, type')
        .eq('compagnie_id', id)
        .eq('type', 'entreprise')
        .single();

      let transactions: Array<{ id: string; type: string; montant: number; libelle: string; description?: string | null; created_at: string }> = [];
      if (compteEntreprise) {
        const { data } = await admin
          .from('felitz_transactions')
          .select('id, type, montant, libelle, description, created_at')
          .eq('compte_id', compteEntreprise.id)
          .order('created_at', { ascending: false })
          .limit(100);
        transactions = data || [];
      }

      const { data: employes } = await admin
        .from('compagnie_employes')
        .select('pilote_id, profiles(id, identifiant, role)')
        .eq('compagnie_id', id)
        .order('date_embauche', { ascending: false });

      const pilotes = (employes || []).map((e) => {
        const profile = Array.isArray(e.profiles) ? e.profiles[0] : e.profiles;
        return profile ? { id: profile.id, identifiant: profile.identifiant, role: profile.role } : null;
      }).filter(Boolean) as Array<{ id: string; identifiant: string; role: string }>;

      const { data: vols } = await admin
        .from('vols')
        .select(`
          id, pilote_id, copilote_id, duree_minutes, depart_utc, arrivee_utc, statut, type_vol, role_pilote, callsign,
          aeroport_depart, aeroport_arrivee, instruction_type,
          type_avion:types_avion(nom, constructeur),
          pilote:profiles!vols_pilote_id_fkey(identifiant),
          copilote:profiles!vols_copilote_id_fkey(identifiant),
          instructeur:profiles!vols_instructeur_id_fkey(identifiant)
        `)
        .eq('compagnie_id', id)
        .in('statut', ['en_attente', 'validé', 'refusé'])
        .order('depart_utc', { ascending: false })
        .limit(200);

      const totalValides = (vols || []).filter((v) => v.statut === 'validé');
      const totalMinutes = totalValides.reduce((s, v) => s + (v.duree_minutes || 0), 0);

      return NextResponse.json({
        compagnie,
        compte: compteEntreprise,
        transactions,
        pilotes,
        logbook: {
          totalMinutes,
          vols: vols || [],
        },
      });
    }

    return NextResponse.json({ error: 'type invalide' }, { status: 400 });
  } catch (e) {
    console.error('IFSA controle GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
