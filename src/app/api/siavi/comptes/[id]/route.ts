import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const body = await request.json();
    const { siavi_grade_id } = body;

    const admin = createAdminClient();
    const { error } = await admin.from('profiles').update({
      siavi_grade_id: siavi_grade_id || null,
    }).eq('id', id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('SIAVI comptes PATCH:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const admin = createAdminClient();
    
    // Retirer les droits SIAVI
    const { error } = await admin.from('profiles').update({
      siavi: false,
      siavi_grade_id: null,
    }).eq('id', id);

    if (error) throw error;

    // Supprimer la session si en cours
    await admin.from('afis_sessions').delete().eq('user_id', id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('SIAVI comptes DELETE:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
