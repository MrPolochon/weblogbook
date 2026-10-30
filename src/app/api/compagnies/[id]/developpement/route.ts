export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimitShared } from '@/lib/rate-limit-shared';
import { DEVELOPMENT_ACTIONS, developmentDashboard, developmentError } from '@/lib/company-development/server';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
 try {
  const { id } = await params;
  if (!uuid.test(id)) return NextResponse.json({ error: 'Compagnie invalide.' }, { status: 400 });
  const client = await createClient(); const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  const { data, error } = await developmentDashboard(user.id, id);
  if (error) { const e = developmentError(error); return NextResponse.json({ error: e.message }, { status: e.status }); }
  if (!data) return NextResponse.json({ error: 'Développement indisponible.' }, { status: 503 });
  const url = new URL(request.url);
  if (url.searchParams.get('partners') === '1') {
    const admin = createAdminClient();
    let query = admin.from('compagnies').select('id,nom').neq('id', id).order('nom').limit(100);
    const search = url.searchParams.get('q')?.trim().slice(0, 80);
    if (search) query = query.ilike('nom', `%${search.replace(/[%_]/g, '')}%`);
    const partners = await query;
    if (partners.error) return NextResponse.json({ error: 'La recherche de partenaires est indisponible.' }, { status: 503 });
    return NextResponse.json({ partners: (partners.data || []).map(c => ({ id: c.id, name: c.nom })) });
  }
  return NextResponse.json(data);
 } catch {
   return NextResponse.json({ error: 'Développement indisponible. Réessayez.' }, { status: 503 });
 }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!uuid.test(id)) return NextResponse.json({ error: 'Compagnie invalide.' }, { status: 400 });
    const client = await createClient(); const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
    if (!(await rateLimitShared(`company-development:${user.id}`, 30, 60_000)).allowed) return NextResponse.json({ error: 'Veuillez patienter avant une nouvelle opération.' }, { status: 429 });
    const body = await request.json();
    if (!body || typeof body !== 'object' || !DEVELOPMENT_ACTIONS.has(body.action) || JSON.stringify(body).length > 16_000) return NextResponse.json({ error: 'Demande invalide.' }, { status: 400 });
    const { data, error } = await createAdminClient().rpc('company_development_action', { p_actor: user.id, p_company: id, p_action: body.action, p_input: body });
    if (error) { const e = developmentError(error); return NextResponse.json({ error: e.message }, { status: e.status }); }
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Demande invalide.' }, { status: 400 });
    console.error('Company development operation failed');
    return NextResponse.json({ error: 'Opération indisponible. Réessayez.' }, { status: 503 });
  }
}
