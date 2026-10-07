import { NextResponse } from 'next/server';
export async function POST() {
  return NextResponse.json({ error: 'La connexion directe par passkey est désactivée. Utilisez votre identifiant ou votre Discord déjà lié.' }, { status: 410 });
}
