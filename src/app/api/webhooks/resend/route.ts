import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { createAdminClient } from '@/lib/supabase/admin';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({error:'Webhook unavailable'},{status:503});
  if (Number(req.headers.get('content-length')) > 100000) return new NextResponse(null,{status:413});
  const body = await req.text();
  if (body.length > 100000) return new NextResponse(null,{status:413});
  let event: {type:string;created_at:string;data:{email_id?:string}};
  const id = req.headers.get('svix-id') ?? '';
  try {
    new Webhook(secret).verify(body,{'svix-id':id,'svix-timestamp':req.headers.get('svix-timestamp') ?? '', 'svix-signature':req.headers.get('svix-signature') ?? ''});
    event = JSON.parse(body);
  } catch { return NextResponse.json({error:'Invalid signature'},{status:400}); }
  if (!['email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed'].includes(event.type)) return NextResponse.json({ok:true});
  if (!event.data?.email_id || Number.isNaN(Date.parse(event.created_at))) return NextResponse.json({error:'Invalid event'},{status:400});
  // No recipient addresses, email content, OTPs or provider tokens are retained.
  const { error } = await createAdminClient().from('email_delivery_events').upsert({event_id:id,provider_message_id:event.data.email_id,event_type:event.type,occurred_at:event.created_at},{onConflict:'event_id',ignoreDuplicates:true});
  if (error) return NextResponse.json({error:'Storage unavailable'},{status:503});
  return NextResponse.json({ok:true});
}
