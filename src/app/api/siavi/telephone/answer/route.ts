import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { canAccessSiavi } from '@/lib/siavi/permissions';
import { ensureComptePersonnel } from '@/lib/felitz/ensure-comptes';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
 try {
  const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:'Non autorisé'},{status:401});
  const admin=createAdminClient();if(!(await canAccessSiavi(admin,user.id)))return NextResponse.json({error:'Accès SIAVI indisponible'},{status:403});
  const {callId}=await request.json().catch(()=>({}));if(typeof callId!=='string'||! /^[a-f0-9-]{36}$/i.test(callId))return NextResponse.json({error:'Appel invalide'},{status:400});
  if(!(await ensureComptePersonnel(admin,user.id)))return NextResponse.json({error:'Compte personnel indisponible. Réessayez.'},{status:503});
  const {data,error}=await admin.rpc('answer_siavi_call',{p_user:user.id,p_call:callId});
  if(error||!data)return NextResponse.json({error:'La prise d’appel a échoué. Aucun paiement partiel n’a été effectué.'},{status:503});
  if(data.error)return NextResponse.json({error:data.error},{status:data.status||409});
  return NextResponse.json({ok:true});
 }catch{return NextResponse.json({error:'Service téléphonique indisponible'},{status:503});}
}
