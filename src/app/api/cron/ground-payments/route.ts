import { NextRequest,NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { emettreChequesServiceGround } from '@/lib/ground/cheques';
import { finaliserContributions } from '@/lib/ground/teams';
import type { ServiceType } from '@/lib/types';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 if(!process.env.CRON_SECRET || req.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:'Non autorisé'},{status:401});
 const admin=createAdminClient();const {data:rows,error}=await admin.from('ground_service_requests').select('id,service_type,aeroport,accepted_by,completed_by,team_id,montant_paye,score_minijeu').eq('statut','completed').is('cheques_emitted_at',null).order('completed_at',{ascending:true}).limit(50);
 if(error)return NextResponse.json({error:'Chargement des paiements impossible'},{status:503});
 let emitted=0,failed=0;
 for(const r of rows ?? []){
  try{
   if(!r.accepted_by && Number(r.montant_paye)>0)throw new Error('Bénéficiaire manquant');
   if(r.team_id && r.completed_by)await finaliserContributions(admin,r.id,r.completed_by,Number(r.score_minijeu) || 0,Number(r.montant_paye) || 0);
   await emettreChequesServiceGround(admin,{serviceRequestId:r.id,serviceType:r.service_type as ServiceType,aeroport:r.aeroport,acceptedBy:r.accepted_by,teamId:r.team_id,montantPaye:Number(r.montant_paye)||0});
   const {error:markError}=await admin.from('ground_service_requests').update({cheques_emitted_at:new Date().toISOString()}).eq('id',r.id).is('cheques_emitted_at',null);
   if(markError)throw markError;emitted++;
  }catch{failed++;}
 }
 return NextResponse.json({emitted,failed},{status:failed?207:200});
}
