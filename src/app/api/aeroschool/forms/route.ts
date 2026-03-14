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

    // Pour les admins : compter les réponses à vérifier (triche, trashed, time_expired) par formulaire
    let pendingReviewByForm: Record<string, number> = {};
    if (isAdmin && (data?.length ?? 0) > 0) {
      const formIds = (data || []).map((f: { id: string }) => f.id);
      const { data: responses } = await adminDb
        .from('aeroschool_responses')
        .select('form_id')
        .in('form_id', formIds)
        .or('cheating_detected.eq.true,status.eq.trashed,status.eq.time_expired');
      for (const r of responses || []) {
        const fid = (r as { form_id: string }).form_id;
        pendingReviewByForm[fid] = (pendingReviewByForm[fid] ?? 0) + 1;
      }
    }

    // Retourne un résumé (nombre de sections/questions, pas le contenu complet)
    const summary = (data || []).map((f: { id: string; sections?: unknown[]; title: string; description: string; is_published: boolean; delivery_mode: string; created_at: string }) => {
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
        pending_review_count: pendingReviewByForm[f.id] ?? 0,
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
    const { title, description, delivery_mode, webhook_url, webhook_role_id, sections, is_published } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Titre requis' }, { status: 400 });
    }

    const admin = createAdminClient();
    // Insert avec colonnes du schéma de base (time_limit_minutes et antitriche_enabled
    // peuvent être absentes si les migrations optionnelles n'ont pas été exécutées)
    const insertRow: Record<string, unknown> = {
      title: title.trim(),
      description: (description || '').trim(),
      created_by: user.id,
      delivery_mode: delivery_mode === 'webhook' ? 'webhook' : 'review',
      webhook_url: delivery_mode === 'webhook' && webhook_url ? webhook_url.trim() : null,
      webhook_role_id: delivery_mode === 'webhook' && webhook_role_id ? String(webhook_role_id).trim() : null,
      sections: Array.isArray(sections) ? sections : [],
      is_published: Boolean(is_published),
    };
    const { data, error } = await admin.from('aeroschool_forms').insert(insertRow).select('id').single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data.id });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
