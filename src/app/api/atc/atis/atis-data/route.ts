import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { fetchAtisBot } from '@/lib/atis-bot-api';
import { getControlledInstance } from '@/lib/atis-instance-resolver';

export const dynamic = 'force-dynamic';

interface AtcContext {
  userId: string;
  isAdmin: boolean;
}

async function checkAtc(): Promise<{ error: string; status: number } | AtcContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Non autorisé', status: 401 };
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, atc')
    .eq('id', user.id)
    .single();
  const canAtc = profile?.role === 'admin' || profile?.role === 'atc' || Boolean(profile?.atc);
  if (!canAtc) return { error: 'Accès ATC requis.', status: 403 };
  return { userId: user.id, isAdmin: profile?.role === 'admin' };
}

/**
 * Détermine l'instance à utiliser en fonction de l'URL et de la state DB.
 * - ?instance_id=X -> utilise X (pour les admins ou l'instance contrôlée par l'utilisateur)
 * - sinon -> instance contrôlée par l'utilisateur (si actif)
 * - sinon -> instance 1 (lecture par défaut)
 */
async function resolveInstance(
  request: NextRequest,
  ctx: AtcContext,
  requireOwnership: boolean
): Promise<{ instanceId: number; error?: string; status?: number }> {
  const explicit = request.nextUrl.searchParams.get('instance_id');
  if (explicit) {
    const id = parseInt(explicit, 10);
    if (!Number.isFinite(id) || id < 1) {
      return { instanceId: 0, error: 'instance_id invalide', status: 400 };
    }
    if (requireOwnership && !ctx.isAdmin) {
      // Vérifie que l'utilisateur contrôle bien cette instance.
      const owned = await getControlledInstance(ctx.userId);
      if (owned !== id) {
        return {
          instanceId: 0,
          error: 'Vous ne contrôlez pas cette instance ATIS',
          status: 403,
        };
      }
    }
    return { instanceId: id };
  }

  const owned = await getControlledInstance(ctx.userId);
  if (owned) return { instanceId: owned };

  if (requireOwnership) {
    return {
      instanceId: 0,
      error: 'Démarrez d\'abord un ATIS depuis le panneau pour modifier ses données.',
      status: 409,
    };
  }
  // Lecture par défaut sur instance 1.
  return { instanceId: 1 };
}

export async function GET(request: NextRequest) {
  const ctx = await checkAtc();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { instanceId, error, status } = await resolveInstance(request, ctx, false);
  if (error) return NextResponse.json({ error }, { status: status ?? 400 });

  const result = await fetchAtisBot<Record<string, unknown>>('/webhook/atis-data', { instanceId });
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}

export async function PATCH(request: NextRequest) {
  const ctx = await checkAtc();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { instanceId, error, status } = await resolveInstance(request, ctx, true);
  if (error) return NextResponse.json({ error }, { status: status ?? 400 });

  const body = await request.json().catch(() => ({}));
  const result = await fetchAtisBot<{ ok: boolean; data?: Record<string, unknown> }>(
    '/webhook/atis-data',
    {
      method: 'PATCH',
      body,
      instanceId,
    }
  );
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
