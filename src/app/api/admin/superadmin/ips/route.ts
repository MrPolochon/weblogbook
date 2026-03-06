import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ACCESS_VALID_MINUTES = 15;

/**
 * GET - Retourne la liste des IP (dernière par compte + historique des changements).
 * Réservé aux admins ayant une demande approuvée dans les 15 dernières minutes.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

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

    if (!approvedRequest) {
      return NextResponse.json({ error: 'Accès expiré ou non autorisé. Refaites une demande et faites-la approuver.' }, { status: 403 });
    }

    const [profilesRes, trackingRes, historyRes] = await Promise.all([
      admin.from('profiles').select('id, identifiant, role').order('identifiant'),
      admin.from('user_login_tracking').select('user_id, last_login_ip, last_login_at'),
      admin.from('login_ip_history').select('id, user_id, ip, previous_ip, user_agent, created_at').order('created_at', { ascending: false }),
    ]);

    const profiles = profilesRes.data ?? [];
    const tracking = trackingRes.data ?? [];
    const history = historyRes.data ?? [];
    const trackingByUser = new Map(tracking.map((t) => [t.user_id, t]));

    const profilesWithIp = profiles.map((p) => {
      const t = trackingByUser.get(p.id);
      return {
        id: p.id,
        identifiant: p.identifiant,
        role: p.role,
        last_login_ip: t?.last_login_ip ?? null,
        last_login_at: t?.last_login_at ?? null,
      };
    }).filter((p) => p.last_login_ip != null || p.last_login_at != null);

    const historyWithIdentifiant = history.map((h) => {
      const p = profiles.find((x) => x.id === h.user_id);
      return { ...h, identifiant: p?.identifiant ?? '—' };
    });

    return NextResponse.json({
      profiles: profilesWithIp,
      history: historyWithIdentifiant,
    });
  } catch (e) {
    console.error('[superadmin ips]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
