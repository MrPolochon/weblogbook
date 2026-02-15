import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

// GET — récupérer un formulaire pour le remplir (public si publié) ou éditer (admin)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const admin = createAdminClient();

    // Essayer d'abord en tant qu'admin authentifié
    let isAdmin = false;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        isAdmin = profile?.role === 'admin';
      }
    } catch { /* pas connecté, accès public */ }

    const query = admin.from('aeroschool_forms').select('*').eq('id', id).single();
    const { data, error } = await query;

    if (error || !data) return NextResponse.json({ error: 'Formulaire introuvable' }, { status: 404 });

    // Si pas admin, on ne retourne que les formulaires publiés et on masque certains champs
    if (!isAdmin) {
      if (!data.is_published) return NextResponse.json({ error: 'Formulaire introuvable' }, { status: 404 });
      // Masquer les réponses correctes et les points pour les candidats
      const sanitizedSections = Array.isArray(data.sections) ? data.sections.map((s: Record<string, unknown>) => ({
        ...s,
        questions: Array.isArray(s.questions) ? (s.questions as Record<string, unknown>[]).map((q) => {
          const { correct_answers, ...rest } = q;
          void correct_answers;
          return rest;
        }) : [],
      })) : [];
      return NextResponse.json({ ...data, sections: sanitizedSections, webhook_url: undefined, created_by: undefined });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// PUT — mettre à jour un formulaire (admin)
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const body = await request.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.title !== undefined) updates.title = String(body.title).trim();
    if (body.description !== undefined) updates.description = String(body.description || '').trim();
    if (body.delivery_mode !== undefined) updates.delivery_mode = body.delivery_mode === 'webhook' ? 'webhook' : 'review';
    if (body.webhook_url !== undefined) updates.webhook_url = body.webhook_url ? String(body.webhook_url).trim() : null;
    if (body.webhook_role_id !== undefined) updates.webhook_role_id = body.webhook_role_id ? String(body.webhook_role_id).trim() : null;
    if (body.sections !== undefined) updates.sections = Array.isArray(body.sections) ? body.sections : [];
    if (body.is_published !== undefined) updates.is_published = Boolean(body.is_published);

    const admin = createAdminClient();
    const { error } = await admin.from('aeroschool_forms').update(updates).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE — supprimer un formulaire (admin)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const admin = createAdminClient();
    const { error } = await admin.from('aeroschool_forms').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
