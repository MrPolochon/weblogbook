import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';

/** Only call after a cryptographically verified, already-linked identity. Never match by email. */
export async function createSessionFromVerifiedIdentity(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user?.email || data.user.banned_until && new Date(data.user.banned_until) > new Date()) {
    throw new Error('Connexion indisponible pour ce compte.');
  }
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: data.user.email });
  if (linkError || !link.properties?.hashed_token) throw new Error('Connexion indisponible. Réessayez.');
  // Keep any partially-created session behind the existing verification gate.
  const cookieStore = await cookies();
  cookieStore.set('pending_login_verification','1',{path:'/',sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:600});
  const supabase = await createClient();
  const { data: verified, error: sessionError } = await supabase.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (sessionError) throw new Error('Connexion indisponible. Réessayez.');
  if (verified.user?.id !== userId) { await supabase.auth.signOut(); throw new Error('Compte non reconnu.'); }
  return supabase;
}
