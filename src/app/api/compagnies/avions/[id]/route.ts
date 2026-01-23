import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const { capacite_passagers, capacite_cargo_kg, nom_avion, prix_billet_base, prix_cargo_kg, quantite } = body;

    const { data: avion } = await supabase.from('compagnies_avions').select('compagnie_id, compagnies(pdg_id)').eq('id', params.id).single();
    if (!avion) return NextResponse.json({ error: 'Avion introuvable' }, { status: 404 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';
    const isPDG = (avion as any).compagnies?.pdg_id === user.id;

    if (!isAdmin && !isPDG) return NextResponse.json({ error: 'Réservé aux PDG ou admins' }, { status: 403 });

    const updates: any = {};
    if (capacite_passagers !== undefined) updates.capacite_passagers = capacite_passagers ? Number(capacite_passagers) : null;
    if (capacite_cargo_kg !== undefined) updates.capacite_cargo_kg = capacite_cargo_kg ? Number(capacite_cargo_kg) : null;
    if (nom_avion !== undefined) updates.nom_avion = nom_avion ? String(nom_avion).trim() : null;
    if (prix_billet_base !== undefined) updates.prix_billet_base = prix_billet_base ? Number(prix_billet_base) : null;
    if (prix_cargo_kg !== undefined) updates.prix_cargo_kg = prix_cargo_kg ? Number(prix_cargo_kg) : null;
    if (quantite !== undefined && isAdmin) updates.quantite = Number(quantite);

    const admin = createAdminClient();
    const { error } = await admin.from('compagnies_avions').update(updates).eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Compagnies avions PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const admin = createAdminClient();
    const { error } = await admin.from('compagnies_avions').delete().eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Compagnies avions DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
