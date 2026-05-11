import type { ZodSchema } from 'zod';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Wrapper pour valider le body JSON d'un route handler avec un schema Zod.
 *
 * Usage :
 *   export const POST = withValidation(MonSchema, async (data, req) => { ... });
 *
 * Le body est consomme par ce wrapper. Si le handler doit relire le body brut,
 * faire la validation manuellement avec `schema.safeParse(await req.json())`.
 */
export function withValidation<T>(
  schema: ZodSchema<T>,
  handler: (data: T, req: NextRequest) => Promise<NextResponse> | NextResponse
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const result = schema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Données invalides',
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    try {
      return await handler(result.data, req);
    } catch (err) {
      console.error('[withValidation] handler error:', err);
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
  };
}

/**
 * Valide directement les query params de l'URL.
 * Utile pour GET handlers.
 */
export function parseSearchParams<T>(
  schema: ZodSchema<T>,
  searchParams: URLSearchParams
): { success: true; data: T } | { success: false; response: NextResponse } {
  const raw: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    raw[key] = value;
  });

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Paramètres invalides', details: result.error.flatten().fieldErrors },
        { status: 400 }
      ),
    };
  }
  return { success: true, data: result.data };
}
