import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { acceptInvitation } from '@/lib/ground/teams';

/**
 * PATCH /api/ground/invitations/[id]
 * Accepter ou refuser une invitation.
 * Body : { status: 'accepted' | 'declined' }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const admin = createAdminClient();
  const body = await request.json() as { status?: 'accepted' | 'declined' };

  if (!body.status || !['accepted', 'declined'].includes(body.status)) {
    return NextResponse.json({ error: 'status "accepted" ou "declined" requis' }, { status: 400 });
  }

  if (body.status === 'declined') {
    const { error } = await admin
      .from('ground_crew_team_invitations')
      .update({ status: 'declined' })
      .eq('id', id)
      .eq('to_user_id', user.id)
      .eq('status', 'pending');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // Accepter
  try {
    await acceptInvitation(admin, id, user.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    const status = msg.includes('expirée') ? 410 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
