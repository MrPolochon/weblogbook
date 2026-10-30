import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { applyRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

async function administrator() {
  const client=await createClient();
  const { data: { user } }=await client.auth.getUser();
  if (!user) return null;
  const {data:profile}=await client.from('profiles').select('role').eq('id',user.id).single();
  return profile?.role==='admin'?user:null;
}

export async function GET() {
  if (!await administrator()) return NextResponse.json({error:'Accès refusé.'},{status:403});
  const admin=createAdminClient();
  const [state,checks,audit]=await Promise.all([
    admin.from('economy_release_settings').select('enabled,activated_at,config_version').eq('id',true).single(),
    admin.rpc('economy_release_readiness'),
    admin.from('economy_release_audit').select('id,enabled,created_at').order('created_at',{ascending:false}).limit(15),
  ]);
  if (state.error||checks.error||audit.error) return NextResponse.json({error:'Installation ou diagnostic indisponible.'},{status:503});
  return NextResponse.json({state:state.data,checks:checks.data,audit:audit.data});
}

export async function POST(request:Request) {
  const user=await administrator();
  if (!user) return NextResponse.json({error:'Accès refusé.'},{status:403});
  if (!applyRateLimit(request,'auth',`release-economy:${user.id}`).allowed) return NextResponse.json({error:'Veuillez patienter.'},{status:429});
  const body=await request.json().catch(()=>null);
  if (typeof body?.enabled!=='boolean') return NextResponse.json({error:'État invalide.'},{status:400});
  const {data,error}=await createAdminClient().rpc('set_economy_release',{p_actor:user.id,p_enabled:body.enabled});
  if (error) return NextResponse.json({error:error.code==='23514'?error.message:'Le changement d’activation a échoué.'},{status:409});
  return NextResponse.json(data);
}
