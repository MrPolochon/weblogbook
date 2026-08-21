import { NextResponse } from 'next/server';
import { getPfTesterAdmin } from '@/lib/pftester-odw-auth';
import { configuredServerId } from '@/lib/pftester-odw';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { isAdmin } = await getPfTesterAdmin();
    return NextResponse.json({
      isAdmin,
      defaultServerId: configuredServerId(),
    });
  } catch {
    return NextResponse.json({ isAdmin: false, defaultServerId: configuredServerId() });
  }
}
