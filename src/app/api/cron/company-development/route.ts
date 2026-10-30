import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic='force-dynamic';

export async function GET(request:Request) {
  const secret=request.headers.get('authorization')?.replace(/^Bearer /,'') || request.headers.get('x-cron-secret');
  if (!process.env.CRON_SECRET || secret!==process.env.CRON_SECRET) return NextResponse.json({error:'Accès refusé.'},{status:401});
  const admin=createAdminClient();
  const {error}=await admin.rpc('company_development_tick');
  if (error) { console.error('Développement mensuel:',error.message);return NextResponse.json({error:'Le traitement sera repris.'},{status:503}); }
  // Research and card activation is evaluated against server UTC timestamps;
  // it does not rely on a timer in the user's browser.
  return NextResponse.json({ok:true});
}
export const POST=GET;
