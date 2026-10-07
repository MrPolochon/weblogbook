import { NextResponse } from 'next/server';
import { hasDiscordOAuthConfig } from '@/lib/discord-link';
export const dynamic = 'force-dynamic';
export async function GET() { return NextResponse.json({ discord: hasDiscordOAuthConfig(), passkey: true }); }
