import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// PATCH - Mettre à jour un type d'avion (admin uniquement)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

    const body = await req.json();
    const { prix, capacite_pax, capacite_cargo_kg } = body;

    const admin = createAdminClient();
    
    const updates: Record<string, number> = {};
    if (prix !== undefined) updates.prix = prix;
    if (capacite_pax !== undefined) updates.capacite_pax = capacite_pax;
    if (capacite_cargo_kg !== undefined) updates.capacite_cargo_kg = capacite_cargo_kg;

    const { data, error } = await admin.from('types_avion')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json(data);
  } catch (e) {
    console.error('Types avion PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
