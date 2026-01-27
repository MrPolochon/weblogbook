import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const callId = request.nextUrl.searchParams.get('callId');
    if (!callId) {
      return NextResponse.json({ error: 'callId manquant' }, { status: 400 });
    }

    // Utiliser admin pour bypasser les RLS
    const admin = createAdminClient();

    // Récupérer l'appel
    const { data: call, error } = await admin
      .from('atc_calls')
      .select('*')
      .eq('id', callId)
      .single();

    if (error || !call) {
      return NextResponse.json({ call: null, status: 'ended' });
    }

    // Vérifier que l'utilisateur est bien un participant de l'appel
    if (call.from_user_id !== user.id && call.to_user_id !== user.id) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    return NextResponse.json({ 
      call,
      status: call.status 
    });
  } catch (error) {
    console.error('Erreur status appel:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
