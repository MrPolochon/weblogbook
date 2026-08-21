export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculerPrixAbonnement, DUREE_ABONNEMENT_MS } from '@/lib/ground/pricing';
import { crediterFelitzAvecTrace } from '@/lib/felitz/atomic';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const compagnieId = searchParams.get('compagnie_id');

  if (!compagnieId) {
    return NextResponse.json({ error: 'compagnie_id requis' }, { status: 400 });
  }

  const { data: priorities, error } = await admin
    .from('company_gate_priority')
    .select(`
      id, compagnie_id, aeroport, gate_id, priority_level, prix_paye, expires_at, created_at,
      gate:airport_gates!company_gate_priority_gate_id_fkey(id, gate_code, terminal, gate_type, aeroport)
    `)
    .eq('compagnie_id', compagnieId)
    .order('expires_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ priorities });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();

  const body = await request.json() as {
    compagnie_id?: string;
    aeroport?: string;
    gate_id?: string;
    preview?: boolean;
  };

  if (!body.compagnie_id || !body.aeroport || !body.gate_id) {
    return NextResponse.json({ error: 'compagnie_id, aeroport et gate_id requis' }, { status: 400 });
  }

  const [{ data: pdgCheck }, { data: coPdgCheck }] = await Promise.all([
    admin.from('compagnies').select('id').eq('id', body.compagnie_id).eq('pdg_id', user.id).limit(1),
    admin.from('compagnie_employes').select('id').eq('compagnie_id', body.compagnie_id).eq('pilote_id', user.id).eq('role', 'co_pdg').limit(1),
  ]);

  if ((!pdgCheck || pdgCheck.length === 0) && (!coPdgCheck || coPdgCheck.length === 0)) {
    return NextResponse.json({ error: 'Accès refusé — PDG ou co-PDG requis' }, { status: 403 });
  }

  const { prix, estHub } = await calculerPrixAbonnement(body.compagnie_id, body.aeroport, body.gate_id);

  if (body.preview === true) {
    return NextResponse.json({ preview: true, prix, estHub });
  }

  // Vérifier que la compagnie a les fonds suffisants
  const { data: compteComp } = await admin
    .from('felitz_comptes')
    .select('id, solde')
    .eq('compagnie_id', body.compagnie_id)
    .eq('type', 'entreprise')
    .maybeSingle();

  if (!compteComp) {
    return NextResponse.json({ error: 'Compte Felitz de la compagnie introuvable' }, { status: 422 });
  }

  const solde = Number(compteComp.solde);
  if (solde < prix) {
    return NextResponse.json({ error: `Solde insuffisant — ${prix.toLocaleString('fr-FR')} F$ requis, ${solde.toLocaleString('fr-FR')} F$ disponible` }, { status: 422 });
  }

  // Débiter le compte de la compagnie
  const { data: debitOk } = await admin.rpc('debiter_compte_safe', {
    p_compte_id: compteComp.id,
    p_montant: prix,
  });

  if (!debitOk) {
    return NextResponse.json({ error: 'Échec du débit Felitz' }, { status: 422 });
  }

  // Créer ou renouveler l'abonnement
  const expiresAt = new Date(Date.now() + DUREE_ABONNEMENT_MS).toISOString();

  // Supprimer l'ancien abonnement s'il existe
  await admin.from('company_gate_priority')
    .delete()
    .eq('compagnie_id', body.compagnie_id)
    .eq('gate_id', body.gate_id);

  const { data: priority, error } = await admin
    .from('company_gate_priority')
    .insert({
      compagnie_id: body.compagnie_id,
      aeroport: body.aeroport,
      gate_id: body.gate_id,
      priority_level: 1,
      prix_paye: prix,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Transaction Felitz
  await admin.from('felitz_transactions').insert({
    compte_id: compteComp.id,
    type: 'debit',
    montant: prix,
    libelle: `Abonnement priorité porte ${body.aeroport}${estHub ? ' (réduction hub -50%)' : ''}`,
  });

  return NextResponse.json({ priority, prix, estHub }, { status: 201 });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const body = await request.json().catch(() => ({})) as { id?: string; compagnie_id?: string };
  if (!body.id || !body.compagnie_id) {
    return NextResponse.json({ error: 'id et compagnie_id requis' }, { status: 400 });
  }

  const [{ data: pdgCheck }, { data: coPdgCheck }] = await Promise.all([
    admin.from('compagnies').select('id').eq('id', body.compagnie_id).eq('pdg_id', user.id).limit(1),
    admin.from('compagnie_employes').select('id').eq('compagnie_id', body.compagnie_id).eq('pilote_id', user.id).eq('role', 'co_pdg').limit(1),
  ]);
  if ((!pdgCheck || pdgCheck.length === 0) && (!coPdgCheck || coPdgCheck.length === 0)) {
    return NextResponse.json({ error: 'Accès refusé — PDG ou co-PDG requis' }, { status: 403 });
  }

  const { data: row } = await admin
    .from('company_gate_priority')
    .select('id, compagnie_id, aeroport, prix_paye, expires_at')
    .eq('id', body.id)
    .eq('compagnie_id', body.compagnie_id)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: 'Abonnement introuvable' }, { status: 404 });

  const { error: delErr } = await admin.from('company_gate_priority').delete().eq('id', row.id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const refund = Math.max(0, Number(row.prix_paye) || 0);
  if (refund > 0) {
    const { data: compteComp } = await admin
      .from('felitz_comptes')
      .select('id')
      .eq('compagnie_id', body.compagnie_id)
      .eq('type', 'entreprise')
      .maybeSingle();
    if (compteComp) {
      await crediterFelitzAvecTrace(admin, {
        compteId: compteComp.id,
        montant: refund,
        libelle: `Annulation priorité porte ${row.aeroport} — remboursement ${refund} F$`,
      });
    }
  }

  return NextResponse.json({ ok: true, refund });
}
