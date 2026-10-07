import { NextResponse } from 'next/server';
import { resolveTxt } from 'node:dns/promises';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
export const dynamic = 'force-dynamic';
export async function GET() {
  const supabase = await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:'Non authentifié'},{status:401});
  const {data:profile}=await supabase.from('profiles').select('role').eq('id',user.id).single();
  if(profile?.role!=='admin')return NextResponse.json({error:'Non autorisé'},{status:403});
  const admin=createAdminClient(); const yesterday=new Date(Date.now()-86400000).toISOString();
  const rows=await Promise.all([
    admin.from('ground_service_requests').select('id',{count:'exact',head:true}).in('statut',['pending','accepted','in_progress']).lt('requested_at',new Date(Date.now()-3600000).toISOString()),
    admin.from('plans_vol').select('id',{count:'exact',head:true}).eq('statut','en_attente_cloture').lt('demande_cloture_at',new Date(Date.now()-3600000).toISOString()),
    admin.from('plans_vol').select('id',{count:'exact',head:true}).eq('statut','cloture').is('revenue_net',null).gte('cloture_at',yesterday),
    admin.from('email_delivery_events').select('event_type,occurred_at,provider_message_id').gte('occurred_at',yesterday).order('occurred_at',{ascending:false}).limit(100),
  ]);
  const sender=process.env.EMAIL_FROM ?? ''; const domain=sender.match(/@([^>\s]+)/)?.[1] ?? '';
  const deadline=<T,>(promise:Promise<T>)=>Promise.race([promise,new Promise<null>(resolve=>setTimeout(()=>resolve(null),3000))]);
  const txt = domain ? await deadline(resolveTxt(`_dmarc.${domain}`).catch(()=>null)) : null;
  return NextResponse.json({queues:rows.slice(0,3).map(r=>({count:r.count ?? null,unavailable:Boolean(r.error)})),
    email:{configured:Boolean(process.env.RESEND_API_KEY && sender && domain!=='resend.dev'),domain,webhookConfigured:Boolean(process.env.RESEND_WEBHOOK_SECRET),dmarc:txt?.flat().some(t=>t.startsWith('v=DMARC1')) ?? false,
    events:rows[3].data ?? [],unavailable:Boolean(rows[3].error)},observedAt:new Date().toISOString()});
}
