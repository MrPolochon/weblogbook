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

    // Chercher un appel entrant pour cet AFIS (appel direct)
    const { data: call } = await admin.from('atc_calls')
      .select('*')
      .eq('to_user_id', user.id)
      .eq('status', 'ringing')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (call) {
      return NextResponse.json({ call });
    }

    // Chercher aussi les appels d'urgence (911/112) que n'importe quel agent SIAVI (AFIS ou pompier) peut prendre
    // On cherche tous les appels d'urgence en attente, même s'ils sont assignés à quelqu'un d'autre
    const { data: emergencyCall } = await admin.from('atc_calls')
      .select('*')
      .eq('is_emergency', true)
      .eq('status', 'ringing')
      .neq('from_user_id', user.id) // Ne pas voir ses propres appels
      .order('created_at', { ascending: true }) // Le plus ancien d'abord
      .limit(1)
      .maybeSingle();

    if (emergencyCall) {
      // Réassigner l'appel d'urgence à cet agent qui le prend (premier arrivé, premier servi)
      const { error: updateError } = await admin.from('atc_calls')
        .update({ to_user_id: user.id })
        .eq('id', emergencyCall.id)
        .eq('status', 'ringing'); // Seulement si toujours en attente
      
      if (!updateError) {
        return NextResponse.json({ call: { ...emergencyCall, to_user_id: user.id } });
      }
    }

    return NextResponse.json({ call: null });
  } catch (err) {
    console.error('SIAVI incoming:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
