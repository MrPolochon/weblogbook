import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const admin = createAdminClient();
    
    // Retirer le grade des profils qui l'ont
    await admin.from('profiles').update({ siavi_grade_id: null }).eq('siavi_grade_id', id);
    
    // Supprimer le grade
    const { error } = await admin.from('siavi_grades').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('SIAVI grades DELETE:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const body = await request.json();
    const { direction } = body;

    if (!direction || !['up', 'down'].includes(direction)) {
      return NextResponse.json({ error: 'Direction invalide' }, { status: 400 });
    }

    const admin = createAdminClient();
    
    // Récupérer tous les grades triés
    const { data: grades } = await admin.from('siavi_grades').select('id, ordre').order('ordre', { ascending: true });
    if (!grades) return NextResponse.json({ error: 'Grades non trouvés' }, { status: 404 });

    const idx = grades.findIndex((g) => g.id === id);
    if (idx === -1) return NextResponse.json({ error: 'Grade non trouvé' }, { status: 404 });

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= grades.length) {
      return NextResponse.json({ error: 'Impossible de déplacer' }, { status: 400 });
    }

    // Échanger les ordres
    const currentOrdre = grades[idx].ordre;
    const swapOrdre = grades[swapIdx].ordre;

    await admin.from('siavi_grades').update({ ordre: swapOrdre }).eq('id', id);
    await admin.from('siavi_grades').update({ ordre: currentOrdre }).eq('id', grades[swapIdx].id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('SIAVI grades PATCH:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
