import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  return NextResponse.json({
    configured: !!(apiKey && apiSecret && livekitUrl),
    hasApiKey: !!apiKey,
    hasApiSecret: !!apiSecret,
    hasUrl: !!livekitUrl,
    url: livekitUrl || 'non configurée',
  });
}
