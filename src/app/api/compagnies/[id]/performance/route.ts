import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCoPdg } from '@/lib/co-pdg-utils';
export const dynamic = 'force-dynamic';
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({error:'Non authentifié'},{status:401});
  const admin = createAdminClient();
  const { data: compagnie } = await admin.from('compagnies').select('pdg_id').eq('id',params.id).maybeSingle();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id',user.id).single();
  if (!compagnie || !(compagnie.pdg_id===user.id || profile?.role==='admin' || await isCoPdg(user.id,params.id,admin))) return NextResponse.json({error:'Non autorisé'},{status:403});
  const results = await Promise.all([
    admin.from('plans_vol').select('aeroport_depart,aeroport_arrivee,revenue_effectif,revenue_net,cloture_at').eq('compagnie_id',params.id).eq('statut','cloture').gte('cloture_at',new Date(Date.now()-30*86400000).toISOString()).limit(1000),
    admin.from('compagnie_avions').select('statut').eq('compagnie_id',params.id),
    admin.from('reparation_demandes').select('statut,prix_total').eq('compagnie_id',params.id).gte('created_at',new Date(Date.now()-30*86400000).toISOString()).limit(1000),
    admin.from('prets_bancaires').select('montant_total_du,montant_rembourse,statut').eq('compagnie_id',params.id).eq('statut','actif'),
  ]);
  if (results.some(r=>r.error)) return NextResponse.json({error:'Le bilan est temporairement indisponible. Réessayez.'},{status:503});
  const routes = new Map<string,{route:string;vols:number;traced:number;gross:number;net:number}>();
  for (const p of results[0].data ?? []) {
    const route = `${p.aeroport_depart} → ${p.aeroport_arrivee}`;
    const entry = routes.get(route) ?? {route,vols:0,traced:0,gross:0,net:0};
    entry.vols++;
    if (p.revenue_net != null) { entry.traced++; entry.net+=Number(p.revenue_net)||0; entry.gross+=Number(p.revenue_effectif)||0; }
    routes.set(route,entry);
  }
  const repairs = (results[2].data ?? []).filter(r=>['payee','retour_transit','completee'].includes(r.statut)).reduce((n,r)=>n+(Number(r.prix_total)||0),0);
  const outstanding = (results[3].data ?? []).reduce((n,p)=>n+Math.max(0,Number(p.montant_total_du)-Number(p.montant_rembourse)),0);
  return NextResponse.json({routes:[...routes.values()].sort((a,b)=>b.net-a.net),repairs,outstanding,
    fleet:(results[1].data ?? []).length,unavailable:(results[1].data ?? []).filter(a=>!['ground','disponible','au_sol'].includes(a.statut)).length,
    truncated:(results[0].data?.length ?? 0)>=1000 || (results[2].data?.length ?? 0)>=1000 });
}
