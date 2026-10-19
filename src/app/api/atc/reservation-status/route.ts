import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enforceAtcHandover, cleanupAtcHandovers } from '@/lib/events/atc-handover';
export const dynamic='force-dynamic';
export async function GET() {
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return NextResponse.json({error:'Non autorisé'},{status:401});
  try {
    await enforceAtcHandover();
    const admin=createAdminClient();
    const {data:session,error}=await admin.from('atc_sessions').select('id,aeroport,position').eq('user_id',user.id).maybeSingle();
    if(error) throw error;
    if(!session) {
      await cleanupAtcHandovers(user.id);
      return NextResponse.json({session:null,serverNow:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
    }
    const {data:reservation,error:bookingError}=await admin.from('event_reservations').select('id,starts_at,ends_at')
      .eq('role','atc').eq('status','confirmed').eq('airport',session.aeroport).eq('position',session.position)
      .neq('user_id',user.id).gt('ends_at',new Date().toISOString()).order('starts_at').limit(1).maybeSingle();
    if(bookingError) throw bookingError;
    return NextResponse.json({session,reservation,serverNow:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({error:'Vérification de relève indisponible'},{status:503}); }
}
