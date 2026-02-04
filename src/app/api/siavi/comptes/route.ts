import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const body = await request.json();
    const { identifiant, grade_id } = body;

    if (!identifiant?.trim()) {
      return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });
    }

    const admin = createAdminClient();
    
    // Trouver le profil par identifiant
    const { data: targetProfile } = await admin.from('profiles')
      .select('id, siavi')
      .eq('identifiant', identifiant.trim())
      .single();

    if (!targetProfile) {
      return NextResponse.json({ error: 'Pilote non trouvé' }, { status: 404 });
    }

    if (targetProfile.siavi) {
      return NextResponse.json({ error: 'Ce pilote est déjà agent SIAVI' }, { status: 400 });
    }

    // Activer SIAVI et assigner le grade
    const { error } = await admin.from('profiles').update({
      siavi: true,
      siavi_grade_id: grade_id || null,
    }).eq('id', targetProfile.id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('SIAVI comptes POST:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
