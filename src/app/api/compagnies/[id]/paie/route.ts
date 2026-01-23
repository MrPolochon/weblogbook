import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const { pourcentage_paie } = body;

    if (pourcentage_paie === undefined || pourcentage_paie < 0 || pourcentage_paie > 100) {
      return NextResponse.json({ error: 'Pourcentage invalide (0-100)' }, { status: 400 });
    }

    const { data: compagnie } = await supabase.from('compagnies').select('pdg_id').eq('id', params.id).single();
    if (!compagnie) return NextResponse.json({ error: 'Compagnie introuvable' }, { status: 404 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';

    if (!isAdmin && compagnie.pdg_id !== user.id) {
      return NextResponse.json({ error: 'Réservé au PDG ou aux admins' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from('compagnies').update({ pourcentage_paie: Number(pourcentage_paie) }).eq('id', params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Compagnies paie PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
