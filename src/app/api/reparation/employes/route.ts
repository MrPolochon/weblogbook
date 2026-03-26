import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { entreprise_id, identifiant, role, specialite } = body;
  if (!entreprise_id || !identifiant) return NextResponse.json({ error: 'entreprise_id et identifiant requis' }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';
  const { data: ent } = await admin.from('entreprises_reparation').select('pdg_id').eq('id', entreprise_id).single();
  const isPdg = ent && String(ent.pdg_id) === String(user.id);
  if (!ent || (!isPdg && !isAdmin)) return NextResponse.json({ error: 'Seul le PDG peut embaucher' }, { status: 403 });

  const { data: targetProfile } = await admin.from('profiles').select('id').eq('identifiant', String(identifiant).trim()).single();
  if (!targetProfile) return NextResponse.json({ error: `Utilisateur "${identifiant}" introuvable` }, { status: 404 });

  const { error } = await admin.from('reparation_employes').insert({
    entreprise_id,
    user_id: targetProfile.id,
    role: ['technicien', 'logistique'].includes(role) ? role : 'technicien',
    specialite: specialite ? String(specialite).trim() : null,
  });
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Déjà employé' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await admin.from('messages').insert({
    destinataire_id: targetProfile.id,
    titre: `🔧 Embauche — Entreprise de réparation`,
    contenu: `Vous avez été embauché dans l'entreprise de réparation. Rendez-vous dans la section Réparation.`,
    type_message: 'normal',
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const employeId = searchParams.get('id');
  if (!employeId) return NextResponse.json({ error: 'id requis' }, { status: 400 });

  const admin = createAdminClient();
  const { data: employe } = await admin.from('reparation_employes')
    .select('id, entreprise_id, user_id, role')
    .eq('id', employeId).single();
  if (!employe) return NextResponse.json({ error: 'Employé introuvable' }, { status: 404 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';
  const { data: ent } = await admin.from('entreprises_reparation').select('pdg_id').eq('id', employe.entreprise_id).single();
  if (!ent) return NextResponse.json({ error: 'Entreprise introuvable' }, { status: 404 });

  if (employe.role === 'pdg' || String(ent.pdg_id) === String(employe.user_id)) {
    return NextResponse.json({ error: 'Impossible de licencier le PDG' }, { status: 400 });
  }

  const isPdg = String(ent.pdg_id) === String(user.id);
  if (!isPdg && !isAdmin) return NextResponse.json({ error: 'Seul le PDG peut licencier' }, { status: 403 });

  await admin.from('reparation_employes').delete().eq('id', employeId);
  return NextResponse.json({ ok: true });
}
