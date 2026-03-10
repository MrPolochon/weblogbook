import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const entrepriseId = searchParams.get('entreprise_id');
  if (!entrepriseId) return NextResponse.json({ error: 'entreprise_id requis' }, { status: 400 });

  const admin = createAdminClient();
  const { data } = await admin.from('reparation_hangars').select('*').eq('entreprise_id', entrepriseId);
  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { entreprise_id, aeroport_code, nom, capacite } = body;
  if (!entreprise_id || !aeroport_code) return NextResponse.json({ error: 'entreprise_id et aeroport_code requis' }, { status: 400 });

  const admin = createAdminClient();
  const { data: ent } = await admin.from('entreprises_reparation').select('pdg_id').eq('id', entreprise_id).single();
  if (!ent || ent.pdg_id !== user.id) return NextResponse.json({ error: 'Seul le PDG' }, { status: 403 });

  const { error } = await admin.from('reparation_hangars').insert({
    entreprise_id,
    aeroport_code: String(aeroport_code).toUpperCase().trim(),
    nom: nom ? String(nom).trim() : null,
    capacite: Math.max(1, Math.min(20, Number(capacite) || 2)),
  });
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Hangar déjà existant pour cet aéroport' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const hangarId = searchParams.get('id');
  if (!hangarId) return NextResponse.json({ error: 'id requis' }, { status: 400 });

  const admin = createAdminClient();
  const { data: hangar } = await admin.from('reparation_hangars').select('entreprise_id').eq('id', hangarId).single();
  if (!hangar) return NextResponse.json({ error: 'Hangar introuvable' }, { status: 404 });

  const { data: ent } = await admin.from('entreprises_reparation').select('pdg_id').eq('id', hangar.entreprise_id).single();
  if (!ent || ent.pdg_id !== user.id) return NextResponse.json({ error: 'Seul le PDG' }, { status: 403 });

  await admin.from('reparation_hangars').delete().eq('id', hangarId);
  return NextResponse.json({ ok: true });
}
