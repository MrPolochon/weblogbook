import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

/**
 * GET: liste des demandes de réinitialisation de mot de passe (admin).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 });

    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from('password_reset_requests')
      .select('id, identifiant_or_email, user_id, created_at, status, handled_by')
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const userIds = Array.from(new Set((rows || []).map((r) => r.user_id).filter(Boolean))) as string[];
    let identifiants: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await admin.from('profiles').select('id, identifiant').in('id', userIds);
      if (profiles) identifiants = Object.fromEntries(profiles.map((p) => [p.id, p.identifiant ?? '']));
    }

    const list = (rows || []).map((r) => ({
      id: r.id,
      identifiant_or_email: r.identifiant_or_email,
      user_id: r.user_id,
      identifiant: r.user_id ? identifiants[r.user_id] ?? null : null,
      created_at: r.created_at,
      status: r.status,
      handled_by: r.handled_by,
    }));
    return NextResponse.json({ requests: list });
  } catch (e) {
    console.error('[password-reset-requests]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * PATCH: marquer une demande comme traitée (admin).
 * body: { id: string, status: 'done' }
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === 'string' ? body.id.trim() : null;
    const status = body.status === 'done' ? 'done' : null;
    if (!id || status !== 'done') return NextResponse.json({ error: 'id et status requis.' }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin
      .from('password_reset_requests')
      .update({ status: 'done', handled_by: user.id })
      .eq('id', id)
      .eq('status', 'pending');
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[password-reset-requests PATCH]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
