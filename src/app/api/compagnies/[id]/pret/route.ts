export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { calculerOffrePret, loanUuid, parseMontantPret } from '@/lib/company-loans';
import { rateLimitShared } from '@/lib/rate-limit-shared';

function failure(error: { code?: string; message?: string } | null) {
  const unavailable = !error || ['PGRST202', '42P01', '42703'].includes(error.code ?? '');
  const status = unavailable ? 503 : error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 409;
  if (unavailable) console.error('Banking migration unavailable:', error);
  return NextResponse.json({ error: unavailable ? 'Service bancaire temporairement indisponible.' : error?.message || 'Opération bancaire impossible.' }, { status });
}
async function context(params: Promise<{ id: string }>) {
  const { id } = await params;
  if (!loanUuid.test(id)) return { error: NextResponse.json({ error: 'Compagnie invalide.' }, { status: 400 }) };
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Non authentifié.' }, { status: 401 }) };
  return { id, user };
}
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await context(params);
    if (ctx.error) return ctx.error;
    const { data, error } = await createAdminClient().rpc('company_loan_dashboard', { p_actor: ctx.user.id, p_company: ctx.id });
    if (error || !data) return failure(error);
    return NextResponse.json(data);
  } catch (error) {
    console.error('GET company loan:', error);
    return NextResponse.json({ error: 'Impossible de charger les prêts.' }, { status: 503 });
  }
}
async function mutate(request: Request, params: Promise<{ id: string }>, operation: 'borrow' | 'repay') {
  try {
    const ctx = await context(params);
    if (ctx.error) return ctx.error;
    if (!(await rateLimitShared('company-loan:' + ctx.user.id, 20, 60_000)).allowed)
      return NextResponse.json({ error: 'Trop de demandes. Patientez un instant.' }, { status: 429 });
    const body = await request.json();
    const montant = parseMontantPret(body?.montant);
    if (!montant || !loanUuid.test(body?.request_id ?? ''))
      return NextResponse.json({ error: 'Montant entier positif et identifiant de demande requis.' }, { status: 400 });
    if (operation === 'borrow' && (!['standard', 'personnalise'].includes(body.offre) ||
        !['quotidien', 'echeance'].includes(body.mode_remboursement) ||
        !calculerOffrePret(montant, body.duree_jours, body.offre)))
      return NextResponse.json({ error: 'Prêt personnalisé : de 1 à 10 millions de F$, sur 1 à 90 jours. Choisissez un mode de remboursement.' }, { status: 400 });
    if (operation === 'repay' && !loanUuid.test(body.pret_id ?? ''))
      return NextResponse.json({ error: 'Identifiant du prêt requis.' }, { status: 400 });
    const { data, error } = await createAdminClient().rpc('manage_company_loan', {
      p_actor: ctx.user.id, p_company: ctx.id, p_operation: operation, p_request: body.request_id,
      p_input: operation === 'borrow'
        ? { montant, duree_jours: body.duree_jours, offre: body.offre, mode_remboursement: body.mode_remboursement }
        : { montant, pret_id: body.pret_id },
    });
    if (error || !data) return failure(error);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
    console.error('Company loan operation:', error);
    return NextResponse.json({ error: 'Opération non confirmée. Réessayez avec la même demande.' }, { status: 503 });
  }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { return mutate(request, params, 'borrow'); }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { return mutate(request, params, 'repay'); }
