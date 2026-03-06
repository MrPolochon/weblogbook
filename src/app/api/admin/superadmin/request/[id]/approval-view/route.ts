import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse, NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET - Retourne le code à afficher pour la demande d'accès IP.
 * - Si l'utilisateur est le demandeur : code_requester (son code à montrer à l'autre admin).
 * - Si l'utilisateur est un autre admin : assigne approver_id si pas encore fait, retourne code_approver.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: requestId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from('profiles').select('role, identifiant').eq('id', user.id).single();
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Réservé aux admins' }, { status: 403 });

    const { data: request } = await admin
      .from('superadmin_ip_requests')
      .select('id, requested_by, status, code_requester, code_approver, approver_id')
      .eq('id', requestId)
      .single();

    if (!request) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
    if (request.status !== 'pending') {
      return NextResponse.json({ error: 'Demande déjà traitée' }, { status: 400 });
    }

    if (request.requested_by === user.id) {
      return NextResponse.json({
        role: 'requester',
        codeToDisplay: request.code_requester ?? '',
      });
    }

    // Autre admin : on l'assigne comme approbateur s'il n'y en a pas encore
    if (!request.approver_id) {
      await admin
        .from('superadmin_ip_requests')
        .update({ approver_id: user.id })
        .eq('id', requestId);
    } else if (request.approver_id !== user.id) {
      return NextResponse.json({ error: 'Un autre admin participe déjà à cette approbation.' }, { status: 400 });
    }

    const { data: requesterProfile } = await admin
      .from('profiles')
      .select('identifiant')
      .eq('id', request.requested_by)
      .single();

    return NextResponse.json({
      role: 'approver',
      codeToDisplay: request.code_approver ?? '',
      requesterIdentifiant: requesterProfile?.identifiant ?? '—',
    });
  } catch (e) {
    console.error('[superadmin approval-view]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
