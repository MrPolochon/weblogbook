import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ACCESS_VALID_MINUTES = 15;

/**
 * GET - Indique si l'admin a accès à la liste des IP (demande approuvée dans les 15 dernières min)
 * et s'il a une demande en attente.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      return NextResponse.json({ hasAccess: false, requestPending: false });
    }

    const cutoff = new Date(Date.now() - ACCESS_VALID_MINUTES * 60 * 1000).toISOString();

    const { data: approvedRequest } = await admin
      .from('superadmin_ip_requests')
      .select('id')
      .eq('requested_by', user.id)
      .eq('status', 'approved')
      .gte('approved_at', cutoff)
      .order('approved_at', { ascending: false })
      .limit(1)
      .single();

    const { data: pendingRequest } = await admin
      .from('superadmin_ip_requests')
      .select('id')
      .eq('requested_by', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      hasAccess: !!approvedRequest,
      requestPending: !!pendingRequest,
      requestId: pendingRequest?.id ?? undefined,
    });
  } catch (e) {
    console.error('[superadmin ip-access-status]', e);
    return NextResponse.json({ hasAccess: false, requestPending: false });
  }
}
