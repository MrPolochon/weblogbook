import { NextResponse } from 'next/server';
// Old clients must upgrade: Cloudflare tickets are not LiveKit JWTs.
export function POST() { return NextResponse.json({ error: 'Mettez à jour la radio VHF pour utiliser Cloudflare.' }, { status: 410 }); }
export function OPTIONS() { return new NextResponse(null, { status: 204 }); }
