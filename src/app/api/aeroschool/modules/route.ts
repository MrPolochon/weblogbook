import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

// GET — liste des modules (admin uniquement)
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('aeroschool_question_modules')
      .select('id, title, created_at, updated_at, questions')
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const withCount = (data || []).map((m) => {
      const questions = Array.isArray((m as { questions?: unknown[] }).questions) ? (m as { questions: unknown[] }).questions : [];
      return {
        id: m.id,
        title: m.title,
        created_at: m.created_at,
        updated_at: m.updated_at,
        question_count: questions.length,
      };
    });

    return NextResponse.json(withCount);
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST — créer un module (admin uniquement)
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const body = await request.json();
    const { title, questions } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Titre requis' }, { status: 400 });
    }

    const admin = createAdminClient();
    const insertRow = {
      title: title.trim(),
      created_by: user.id,
      questions: Array.isArray(questions) ? questions : [],
    };
    const { data, error } = await admin.from('aeroschool_question_modules').insert(insertRow).select('id').single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
