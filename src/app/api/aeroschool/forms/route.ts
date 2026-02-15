import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

// GET — liste des formulaires publiés (public) ou tous (admin)
export async function GET() {
  try {
    const adminDb = createAdminClient();

    // Vérifier si l'utilisateur est admin (optionnel, peut ne pas être connecté)
    let isAdmin = false;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        isAdmin = profile?.role === 'admin';
      }
    } catch { /* pas connecté = accès public */ }

    let query = adminDb
      .from('aeroschool_forms')
      .select('id, title, description, is_published, delivery_mode, sections, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (!isAdmin) {
      query = query.eq('is_published', true);
    }

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Retourne un résumé (nombre de sections/questions, pas le contenu complet)
    const summary = (data || []).map((f) => {
      const sections = Array.isArray(f.sections) ? f.sections : [];
      const questionCount = sections.reduce((acc: number, s: { questions?: unknown[] }) => acc + (Array.isArray(s.questions) ? s.questions.length : 0), 0);
      return {
        id: f.id,
        title: f.title,
        description: f.description,
        is_published: f.is_published,
        delivery_mode: f.delivery_mode,
        sectionCount: sections.length,
        questionCount,
        created_at: f.created_at,
      };
    });
    return NextResponse.json(summary);
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST — créer un formulaire (admin uniquement)
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const body = await request.json();
    const { title, description, delivery_mode, webhook_url, sections, is_published } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Titre requis' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.from('aeroschool_forms').insert({
      title: title.trim(),
      description: (description || '').trim(),
      created_by: user.id,
      delivery_mode: delivery_mode === 'webhook' ? 'webhook' : 'review',
      webhook_url: delivery_mode === 'webhook' && webhook_url ? webhook_url.trim() : null,
      sections: Array.isArray(sections) ? sections : [],
      is_published: Boolean(is_published),
    }).select('id').single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
