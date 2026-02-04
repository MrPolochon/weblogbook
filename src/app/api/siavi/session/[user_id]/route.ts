import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

// DELETE - Forcer la déconnexion d'un agent SIAVI (admin only)
export async function DELETE(request: Request, { params }: { params: Promise<{ user_id: string }> }) {
  try {
    const { user_id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const admin = createAdminClient();
    
    // Récupérer les plans surveillés par cet AFIS et les remettre en autosurveillance
    await admin.from('plans_vol')
      .update({ current_afis_user_id: null })
      .eq('current_afis_user_id', user_id);

    // Supprimer la session
    const { error } = await admin.from('afis_sessions').delete().eq('user_id', user_id);
    
    if (error) {
      console.error('Erreur suppression session AFIS:', error);
      return NextResponse.json({ error: 'Erreur lors de la déconnexion' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('SIAVI session DELETE:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
