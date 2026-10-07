import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CODES_OACI_VALIDES } from '@/lib/aeroports-ptfs';
export async function POST(request: Request, {params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser();
  if(!user) return NextResponse.json({error:'Non autorisé'},{status:401});
  const body=await request.json().catch(()=>({})); const destination=typeof body.aeroport==='string'?body.aeroport.trim().toUpperCase():'';
  if(!CODES_OACI_VALIDES.has(destination)) return NextResponse.json({error:'Aéroport invalide'},{status:400});
  const admin=createAdminClient();
  const {data:plan,error}=await admin.from('plans_vol').select('id,pilote_id,statut,aeroport_arrivee,deroutement_at').eq('id',id).maybeSingle();
  if(error) return NextResponse.json({error:'Chargement indisponible'},{status:503});
  if(!plan || plan.pilote_id!==user.id) return NextResponse.json({error:'Accès refusé'},{status:403});
  if(!['accepte','en_cours','automonitoring'].includes(plan.statut)) return NextResponse.json({error:'Le déroutement nécessite un vol actif, avant la demande de clôture.'},{status:409});
  if(destination===plan.aeroport_arrivee) return NextResponse.json({error:'Choisissez une autre destination.'},{status:400});
  if(plan.deroutement_at) return NextResponse.json({error:'Ce vol est déjà dérouté.'},{status:409});
  const {data:changed,error:changeError}=await admin.rpc('divert_active_flight',{p_plan:id,p_user:user.id,p_destination:destination});
  if(changeError || !changed) return NextResponse.json({error:'Déroutement impossible. Réessayez.'},{status:503});
  if(changed.error) return NextResponse.json({error:changed.error},{status:changed.status || 409});
  return NextResponse.json({ok:true});
}
