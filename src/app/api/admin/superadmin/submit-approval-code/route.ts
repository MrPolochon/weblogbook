import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

/**
 * POST - Soumet le code de l'autre admin (validation croisée).
 * Si le code est incorrect : demande annulée + les deux admins sont mis en security_logout (déconnexion forcée).
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
    const code = typeof body.code === 'string' ? body.code.trim().replace(/\s/g, '') : '';
    if (!requestId || code.length !== 6 || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Demande ou code invalide.' }, { status: 400 });
    }

    const { data: request } = await admin
      .from('superadmin_ip_requests')
      .select('id, requested_by, approver_id, status, code_requester, code_approver, requester_validated, approver_validated')
      .eq('id', requestId)
      .single();

    if (!request) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
    if (request.status !== 'pending') {
      return NextResponse.json({ error: 'Demande déjà traitée.', approved: request.status === 'approved' }, { status: 400 });
    }

    const isRequester = request.requested_by === user.id;
    const isApprover = request.approver_id === user.id;
    if (!isRequester && !isApprover) {
      return NextResponse.json({ error: 'Vous ne participez pas à cette demande.' }, { status: 403 });
    }

    const expectedCode = isRequester ? (request.code_approver ?? '') : (request.code_requester ?? '');
    if (code !== expectedCode) {
      await admin.from('superadmin_ip_requests').update({ status: 'rejected' }).eq('id', requestId);
      const userIds = [request.requested_by];
      if (request.approver_id) userIds.push(request.approver_id);
      await admin.from('security_logout').upsert(
        userIds.map((uid) => ({ user_id: uid })),
        { onConflict: 'user_id' }
      );
      return NextResponse.json({
        error: 'Code incorrect. La demande est annulée et les deux comptes sont déconnectés par mesure de sécurité.',
        forceLogout: true,
      }, { status: 400 });
    }

    if (isRequester) {
      await admin.from('superadmin_ip_requests').update({ requester_validated: true }).eq('id', requestId);
    } else {
      await admin.from('superadmin_ip_requests').update({ approver_validated: true }).eq('id', requestId);
    }

    const { data: updated } = await admin
      .from('superadmin_ip_requests')
      .select('requester_validated, approver_validated')
      .eq('id', requestId)
      .single();

    const bothValidated = updated?.requester_validated && updated?.approver_validated;
    if (bothValidated) {
      await admin
        .from('superadmin_ip_requests')
        .update({
          status: 'approved',
          approved_by: request.approver_id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', requestId);
    }

    return NextResponse.json({ ok: true, approved: bothValidated });
  } catch (e) {
    console.error('[superadmin submit-approval-code]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
