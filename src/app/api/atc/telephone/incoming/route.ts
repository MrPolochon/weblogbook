import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET - Vérifier les appels entrants
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();

    // Nettoyer les anciens appels expirés de l'utilisateur (ringing > 30s, connected > 10min)
    const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
    const tenMinutesAgo = new Date(Date.now() - 600000).toISOString();
    
    await admin.from('atc_calls')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .eq('status', 'ringing')
      .lt('started_at', thirtySecondsAgo);
    
    await admin.from('atc_calls')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
      .eq('status', 'connected')
      .lt('started_at', tenMinutesAgo);

    // Chercher les appels entrants en attente (récents uniquement)
    const sixtySecondsAgo = new Date(Date.now() - 60000).toISOString();
    const { data: incomingCall } = await admin
      .from('atc_calls')
      .select('id, from_user_id, from_aeroport, from_position, number_dialed, started_at, is_emergency')
      .eq('to_user_id', user.id)
      .eq('status', 'ringing')
      .gte('started_at', sixtySecondsAgo)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (incomingCall) {
      return NextResponse.json({
        call: {
          id: incomingCall.id,
          from_aeroport: incomingCall.from_aeroport,
          from_position: incomingCall.from_position,
          number_dialed: incomingCall.number_dialed,
          is_emergency: incomingCall.is_emergency,
        },
      });
    }

    return NextResponse.json({ call: null });
  } catch (e) {
    // Si aucun appel trouvé, retourner null (normal)
    return NextResponse.json({ call: null });
  }
}
