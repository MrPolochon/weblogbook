import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rewriteFlightReviews, type ReviewPayload } from '@/lib/flight-review-ai';
import { buildAttempts } from '@/lib/support/llm';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Accès refusé.' }, { status: 401 });
  }
  const providerConfigured = buildAttempts().length > 0;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('claim_flight_review_rewrites', { p_process: providerConfigured });
  if (error) {
    console.error('Flight review queue:', error.code);
    return NextResponse.json({ error: 'File des avis indisponible.' }, { status: 503 });
  }
  const jobs = (data ?? []) as Array<{ plan_id: string; payload: ReviewPayload; attempts: number }>;
  const results = await Promise.all(jobs.map(async job => {
    const texts = await rewriteFlightReviews(job.payload);
    if (!texts) return false;
    const result = await admin.rpc('finish_flight_review_rewrite', {
      p_plan: job.plan_id, p_attempt: job.attempts, p_texts: texts,
    });
    return !result.error && result.data === true;
  }));
  return NextResponse.json({ rewritten: results.filter(Boolean).length, processed: jobs.length, provider_configured: providerConfigured });
}
