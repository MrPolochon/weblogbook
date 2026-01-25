import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

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

    // Récupérer l'appel
    const { data: call, error } = await supabase
      .from('atc_calls')
      .select('*')
      .eq('id', callId)
      .single();

    if (error || !call) {
      return NextResponse.json({ call: null, status: 'ended' });
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
