import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 if(!process.env.CRON_SECRET||request.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:'Non autorisé'},{status:401});
 const {data,error}=await createAdminClient().rpc('pay_active_siavi_services');
 if(error){console.error('SIAVI payroll:',error);return NextResponse.json({error:'Versement SIAVI indisponible'},{status:503});}
 return NextResponse.json({ok:true,services_paid:data});
}
