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
    const { nom, ordre } = body;

    if (!nom?.trim()) {
      return NextResponse.json({ error: 'Nom requis' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.from('siavi_grades').insert({
      nom: nom.trim(),
      ordre: ordre || 0,
    }).select().single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ce grade existe déjà' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ grade: data });
  } catch (err) {
    console.error('SIAVI grades POST:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
