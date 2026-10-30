import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

async function handle(req: Request, params: Promise<{ id: string }>, action: 'propose' | 'respond') {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = action === 'propose'
    ? await admin.rpc('propose_company_aircraft_transfer', { p_actor: user.id, p_alliance: id, p_input: body })
    : await admin.rpc('respond_company_aircraft_transfer', { p_actor: user.id, p_alliance: id, p_transfer: body.transfert_id, p_company: body.compagnie_dest_id || null, p_action: body.action });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) { return handle(req, params, 'propose'); }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) { return handle(req, params, 'respond'); }
