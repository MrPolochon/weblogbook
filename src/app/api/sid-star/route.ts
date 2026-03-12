import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';

/** GET - Liste des SID/STAR. Filtrage par aeroport et type pour les pilotes. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const aeroport = searchParams.get('aeroport')?.toUpperCase();
  const type = searchParams.get('type'); // SID | STAR

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const admin = createAdminClient();
  let query = admin.from('sid_star').select('id, aeroport, type_procedure, nom, route').order('aeroport').order('type_procedure').order('nom');

  if (aeroport) {
    if (!CODES_OACI_VALIDES.has(aeroport)) return NextResponse.json({ error: 'Aéroport invalide' }, { status: 400 });
    query = query.eq('aeroport', aeroport);
  }
  if (type && ['SID', 'STAR'].includes(type)) {
    query = query.eq('type_procedure', type);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

/** POST - Créer une SID/STAR (admin uniquement) */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

  const body = await request.json();
  const { aeroport, type_procedure, nom, route } = body;

  const ad = String(aeroport || '').toUpperCase();
  if (!CODES_OACI_VALIDES.has(ad)) return NextResponse.json({ error: 'Aéroport invalide' }, { status: 400 });
  if (!type_procedure || !['SID', 'STAR'].includes(String(type_procedure))) return NextResponse.json({ error: 'Type SID ou STAR requis' }, { status: 400 });
  if (!nom || !String(nom).trim()) return NextResponse.json({ error: 'Nom requis' }, { status: 400 });
  if (!route || !String(route).trim()) return NextResponse.json({ error: 'Route requise' }, { status: 400 });

  const admin = createAdminClient();
  const { data: inserted, error } = await admin.from('sid_star').insert({
    aeroport: ad,
    type_procedure: String(type_procedure),
    nom: String(nom).trim().toUpperCase(),
    route: String(route).trim(),
  }).select('id, aeroport, type_procedure, nom, route').single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Cette procédure existe déjà pour cet aéroport' }, { status: 400 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(inserted);
}
