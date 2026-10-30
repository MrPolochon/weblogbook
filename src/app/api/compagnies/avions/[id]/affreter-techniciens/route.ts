import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { applyRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request,{ params }: { params: Promise<{id:string}> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error:'Non authentifié.' },{ status:401 });
  if (!applyRateLimit(request,'default',`maintenance:${user.id}`).allowed) return NextResponse.json({ error:'Veuillez patienter avant de réessayer.' },{ status:429 });
  const { id } = await params;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error:'Avion invalide.' },{ status:400 });
  const admin = createAdminClient();
  const { data,error } = await admin.rpc('start_company_maintenance',{ p_actor:user.id,p_aircraft:id });
  if (error) {
    console.error('Maintenance technique:',error);
    return NextResponse.json({ error: error.code==='42501'?'Accès refusé.':error.code==='22023'?error.message:'Le service de maintenance est temporairement indisponible.' },{ status:error.code==='42501'?403:error.code==='22023'?400:503 });
  }
  return NextResponse.json(data);
}
