import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

/**
 * POST - Approuve une demande d'accès à la liste des IP (par un autre admin).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
    if (!requestId) return NextResponse.json({ error: 'requestId requis' }, { status: 400 });

    const { data: request } = await admin
      .from('superadmin_ip_requests')
      .select('id, requested_by, status')
      .eq('id', requestId)
      .single();

    if (!request) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
    if (request.status !== 'pending') return NextResponse.json({ error: 'Demande déjà traitée' }, { status: 400 });
    if (request.requested_by === user.id) return NextResponse.json({ error: 'Vous ne pouvez pas approuver votre propre demande' }, { status: 400 });

    const { error } = await admin
      .from('superadmin_ip_requests')
      .update({
        status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[superadmin approve-request]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
