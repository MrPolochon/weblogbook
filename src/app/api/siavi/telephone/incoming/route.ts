import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    // Vérifier si AFIS en service
    const { data: session } = await supabase.from('afis_sessions').select('id, aeroport').eq('user_id', user.id).single();
    if (!session) return NextResponse.json({ call: null });

    const admin = createAdminClient();

    // Chercher un appel entrant pour cet AFIS
    const { data: call } = await admin.from('atc_calls')
      .select('*')
      .eq('to_user_id', user.id)
      .eq('status', 'ringing')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!call) {
      // Chercher aussi les appels d'urgence (911/112) pour n'importe quel AFIS
      const { data: emergencyCall } = await admin.from('atc_calls')
        .select('*')
        .eq('is_emergency', true)
        .eq('to_position', 'AFIS')
        .eq('status', 'ringing')
        .is('to_user_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (emergencyCall) {
        // Assigner l'appel d'urgence à cet AFIS
        await admin.from('atc_calls')
          .update({ to_user_id: user.id })
          .eq('id', emergencyCall.id);
        
        return NextResponse.json({ call: { ...emergencyCall, to_user_id: user.id } });
      }
    }

    return NextResponse.json({ call });
  } catch (err) {
    console.error('SIAVI incoming:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
