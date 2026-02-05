import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a721640d-e3c8-4a56-a4cc-d919b111b0c0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'siavi/answer/route.ts:entry',message:'SIAVI answer entry',data:{userId:user?.id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5-answer'})}).catch(()=>{});
    // #endregion
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

    const body = await request.json();
    const { callId } = body;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a721640d-e3c8-4a56-a4cc-d919b111b0c0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'siavi/answer/route.ts:callId',message:'SIAVI answer callId',data:{callId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5-answer'})}).catch(()=>{});
    // #endregion

    const admin = createAdminClient();

    // Récupérer l'appel
    const { data: call, error: callErr } = await admin.from('atc_calls')
      .select('id, is_emergency, to_user_id, from_user_id, status')
      .eq('id', callId)
      .single();

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a721640d-e3c8-4a56-a4cc-d919b111b0c0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'siavi/answer/route.ts:call-lookup',message:'SIAVI answer call lookup',data:{call,callErr:callErr?.message,userId:user.id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5-answer'})}).catch(()=>{});
    // #endregion

    if (!call) {
      return NextResponse.json({ error: 'Appel non trouvé' }, { status: 404 });
    }

    if (call.status !== 'ringing') {
      return NextResponse.json({ error: 'Appel déjà répondu ou terminé' }, { status: 400 });
    }

    // Vérifier les permissions : soit c'est un appel d'urgence, soit l'appel est pour nous
    const isForMe = call.to_user_id === user.id;
    const canAnswerEmergency = call.is_emergency && call.from_user_id !== user.id;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a721640d-e3c8-4a56-a4cc-d919b111b0c0',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'siavi/answer/route.ts:permissions',message:'SIAVI answer permissions',data:{isForMe,canAnswerEmergency,callToUserId:call.to_user_id,userId:user.id,isEmergency:call.is_emergency},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5-answer'})}).catch(()=>{});
    // #endregion
    
    if (!isForMe && !canAnswerEmergency) {
      return NextResponse.json({ error: 'Cet appel ne vous est pas destiné' }, { status: 403 });
    }

    // Pour les appels d'urgence, réassigner à l'utilisateur qui répond
    const { error } = await admin.from('atc_calls')
      .update({ 
        status: 'connected', 
        connected_at: new Date().toISOString(),
        to_user_id: user.id // Réassigner à celui qui répond
      })
      .eq('id', callId)
      .eq('status', 'ringing'); // Double vérification pour éviter les race conditions

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Si c'est un appel d'urgence (911/112), vérifier si l'agent est pompier seul et le payer
    if (call.is_emergency) {
      const { data: session } = await admin.from('afis_sessions')
        .select('aeroport, est_afis')
        .eq('user_id', user.id)
        .single();

      // Payer seulement si pompier seul (pas AFIS)
      if (session && !session.est_afis) {
        await admin.rpc('pay_siavi_intervention', {
          p_user_id: user.id,
          p_call_id: callId,
          p_aeroport: session.aeroport
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('SIAVI answer:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
