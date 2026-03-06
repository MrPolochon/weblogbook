import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET - Liste des demandes d'accès IP en attente (pour les admins qui doivent approuver).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const { data: requests } = await admin
      .from('superadmin_ip_requests')
      .select('id, requested_by, approver_id, created_at, status')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (!requests?.length) {
      return NextResponse.json({ requests: [] });
    }

    const requesterIds = Array.from(new Set(requests.map((r) => r.requested_by)));
    const approverIds = requests.map((r) => r.approver_id).filter(Boolean) as string[];
    const ids = Array.from(new Set([...requesterIds, ...approverIds]));
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, identifiant')
      .in('id', ids);

    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    const list = requests.map((r) => ({
      id: r.id,
      requested_by: r.requested_by,
      approver_id: r.approver_id ?? undefined,
      requested_at: r.created_at,
      identifiant: byId.get(r.requested_by)?.identifiant ?? '—',
      approver_identifiant: r.approver_id ? byId.get(r.approver_id)?.identifiant : undefined,
      canParticipate: r.requested_by !== user.id,
    }));

    return NextResponse.json({ requests: list });
  } catch (e) {
    console.error('[superadmin pending-requests]', e);
    return NextResponse.json({ requests: [] });
  }
}
