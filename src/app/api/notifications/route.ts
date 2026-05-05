import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/notifications
 *   ?limit=20  (default 20, max 100)
 *   ?unread=1  -> uniquement les non lues
 *
 * Renvoie { items: [...], unread_count: number }
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const url = new URL(request.url);
    const limitRaw = parseInt(url.searchParams.get('limit') || '20', 10);
    const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? limitRaw : 20, 100));
    const unreadOnly = url.searchParams.get('unread') === '1';

    let query = supabase
      .from('notifications')
      .select('id, type, title, body, link, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (unreadOnly) query = query.is('read_at', null);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const { count: unreadCount } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .is('read_at', null);

    return NextResponse.json({
      items: data || [],
      unread_count: unreadCount ?? 0,
    });
  } catch (e) {
    console.error('notifications GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * PATCH /api/notifications
 *   body: { id?: string, all?: boolean }
 *
 * Marque une notif (id) ou toutes les notifs comme lues.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const id = typeof body.id === 'string' ? body.id : null;
    const all = body.all === true;

    if (!id && !all) {
      return NextResponse.json({ error: 'id ou all requis.' }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    if (all) {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: nowIso })
        .is('read_at', null);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    const { error } = await supabase
      .from('notifications')
      .update({ read_at: nowIso })
      .eq('id', id!);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('notifications PATCH:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

/**
 * DELETE /api/notifications
 *   body: { id?: string, all?: boolean }
 *
 * Supprime une notif (id) ou toutes les notifs lues (all=true).
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const id = typeof body.id === 'string' ? body.id : null;
    const all = body.all === true;

    if (all) {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .not('read_at', 'is', null);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (!id) {
      return NextResponse.json({ error: 'id ou all requis.' }, { status: 400 });
    }
    const { error } = await supabase.from('notifications').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('notifications DELETE:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
