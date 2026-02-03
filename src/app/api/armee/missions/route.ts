import { NextResponse } from 'next/server';
import { ARME_MISSIONS } from '@/lib/armee-missions';

export async function GET() {
  return NextResponse.json(ARME_MISSIONS);
}
