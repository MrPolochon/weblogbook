import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

// GET - Liste tous les avions de toutes les compagnies (admin only)
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('compagnie_avions')
      .select(`
        *,
        types_avion(id, nom, constructeur),
        compagnies(id, nom)
      `)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    console.error('Admin avions GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PATCH - Modifier un avion (déplacer, changer statut, etc.)
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });
    }

    const body = await request.json();
    const { id, aeroport_actuel, statut, usure_percent, immatriculation, nom_bapteme } = body;

    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 });
    }

    const admin = createAdminClient();
    
    const updates: Record<string, unknown> = {};
    if (aeroport_actuel !== undefined) updates.aeroport_actuel = aeroport_actuel.toUpperCase();
    if (statut !== undefined) updates.statut = statut;
    if (usure_percent !== undefined) updates.usure_percent = Math.max(0, Math.min(100, usure_percent));
    if (immatriculation !== undefined) updates.immatriculation = immatriculation.toUpperCase();
    if (nom_bapteme !== undefined) updates.nom_bapteme = nom_bapteme || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Aucune modification' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('compagnie_avions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    console.error('Admin avions PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE - Supprimer un avion
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from('compagnie_avions').delete().eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Admin avions DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
