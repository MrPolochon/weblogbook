export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessSiavi } from '@/lib/siavi/permissions';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const admin = createAdminClient();
    if (!(await canAccessSiavi(admin, user.id))) {
      return NextResponse.json({ error: 'Espace SIAVI en cours de maintenance.' }, { status: 503 });
    }

    const { data, error } = await admin.from('siavi_rapports_medevac')
      .select(`
        id, numero_mission, date_mission, operator_base,
        aircraft_registration, aircraft_type, commander, co_pilot,
        outcome, created_at,
        plan_vol:plan_vol_id(id, numero_vol, aeroport_depart, aeroport_arrivee)
      `)
      .order('numero_mission', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data || []);
  } catch (e) {
    console.error('SIAVI rapports GET:', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: Request) {
 try {
  const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser();
  if(!user) return NextResponse.json({error:'Non authentifié'},{status:401});
  const admin=createAdminClient();
  if(!(await canAccessSiavi(admin,user.id))) return NextResponse.json({error:'Accès SIAVI requis'},{status:403});
  const body=await request.json().catch(()=>null);
  if(!body || typeof body.plan_vol_id!=='string' || !/^[0-9a-f-]{36}$/i.test(body.plan_vol_id)) return NextResponse.json({error:'Plan de vol invalide'},{status:400});
  if(!Array.isArray(body.participant_ids) || body.participant_ids.length>100 || body.participant_ids.some((id:unknown)=>typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))) return NextResponse.json({error:'Participants invalides'},{status:400});
  const fields=['commander','co_pilot','medical_team','medical_summary','ground_event','outcome','safety_remarks'];
  if(fields.some(key=>body[key]!=null&&(typeof body[key]!=='string'||body[key].length>20000))) return NextResponse.json({error:'Champs du rapport invalides'},{status:400});
  if(!Array.isArray(body.mission_timeline)||body.mission_timeline.length>200) return NextResponse.json({error:'Chronologie invalide'},{status:400});
  const report:Record<string,unknown>={mission_timeline:body.mission_timeline}; for(const key of fields) report[key]=body[key]??null;
  const {data,error}=await admin.rpc('submit_medevac_report',{p_plan_id:body.plan_vol_id,p_author_id:user.id,p_report:report,p_participant_ids:body.participant_ids});
  if(error) { console.error('MEDEVAC report:',error); return NextResponse.json({error:error.code==='PGRST202'?'La mise à jour MEDEVAC doit être appliquée à la base avant de valider un rapport.':error.message},{status:error.code==='PGRST202'?503:400}); }
  return NextResponse.json(data);
 } catch(e) { console.error('SIAVI rapport:',e); return NextResponse.json({error:'Erreur serveur'},{status:500}); }
}
