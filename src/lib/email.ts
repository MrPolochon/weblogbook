import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

if (!process.env.RESEND_API_KEY) {
  console.error('[email] ❌ RESEND_API_KEY manquante — aucun email ne sera envoyé. Configurez cette variable dans Vercel (Settings > Environment Variables).');
}

const FROM_EMAIL = process.env.EMAIL_FROM ?? 'PTFS Logbook <onboarding@resend.dev>';

// onboarding@resend.dev est un domaine de test Resend : en production, les emails
// ne sont livrés qu'à l'adresse du propriétaire du compte Resend.
// Configurez EMAIL_FROM avec un domaine vérifié dans Resend pour la production.
if (process.env.NODE_ENV === 'production' && !process.env.EMAIL_FROM) {
  console.warn('[email] ⚠ EMAIL_FROM non défini — utilisation de onboarding@resend.dev (domaine de test). Les emails ne seront livrés qu\'à l\'adresse du compte Resend. Configurez EMAIL_FROM avec un domaine vérifié sur resend.com pour envoyer à tous les utilisateurs.');
}

function maskEmailLog(address: string): string {
  const match = address.match(/<(.+)>/) ?? [null, address];
  const email = match[1] ?? address;
  const [local = '', domain = ''] = email.split('@');
  return `${local[0] ?? '*'}***@${domain}`;
}

/**
 * Envoie le code de vérification de connexion par email.
 * Retourne { ok: true } si l'envoi a réussi, { ok: false, error } sinon.
 */
export async function sendLoginCodeEmail(to: string, code: string): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    console.error('[email] sendLoginCodeEmail — RESEND_API_KEY non configuré, envoi impossible vers', maskEmailLog(to));
    return { ok: false, error: 'Envoi d\'email non configuré (RESEND_API_KEY manquante). Contactez l\'administrateur.' };
  }
  try {
    console.log('[email] Envoi code de connexion vers', maskEmailLog(to), '— from:', FROM_EMAIL);
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: 'Votre code de connexion PTFS Logbook',
      html: `
        <p>Bonjour,</p>
        <p>Voici votre code de vérification pour confirmer votre connexion :</p>
        <p style="font-size:24px;font-weight:bold;letter-spacing:4px;margin:20px 0;">${code}</p>
        <p>Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, changez votre mot de passe.</p>
        <p>— PTFS Logbook</p>
      `,
    });
    if (error) {
      console.error('[email] ❌ Resend a refusé l\'envoi vers', maskEmailLog(to), '— erreur:', error);
      return { ok: false, error: error.message };
    }
    console.log('[email] ✓ Code envoyé avec succès vers', maskEmailLog(to));
    return { ok: true };
  } catch (e) {
    console.error('[email] ❌ Exception lors de sendLoginCodeEmail vers', maskEmailLog(to), ':', e);
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur envoi email' };
  }
}

/**
 * Envoie le code de vérification pour une demande d'accès à la liste des IP (superadmin).
 */
export async function sendSuperadminAccessCodeEmail(to: string, code: string): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    console.error('[email] sendSuperadminAccessCodeEmail — RESEND_API_KEY non configuré');
    return { ok: false, error: 'Envoi d\'email non configuré' };
  }
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: 'Code d\'accès liste des IP — PTFS Logbook',
      html: `
        <p>Bonjour,</p>
        <p>Vous avez demandé l'accès à la liste des adresses IP. Voici votre code :</p>
        <p style="font-size:24px;font-weight:bold;letter-spacing:4px;margin:20px 0;">${code}</p>
        <p>Ce code n&apos;expire pas. Un autre administrateur devra participer à l&apos;approbation : vous afficherez chacun un code et saisirez le code de l&apos;autre. Code incorrect = demande annulée et déconnexion des deux comptes.</p>
        <p>— PTFS Logbook</p>
      `,
    });
    if (error) {
      console.error('[email] ❌ Resend error (sendSuperadminAccessCodeEmail):', error);
      return { ok: false, error: error.message };
    }
    console.log('[email] ✓ Code superadmin envoyé vers', maskEmailLog(to));
    return { ok: true };
  } catch (e) {
    console.error('[email] ❌ sendSuperadminAccessCodeEmail:', e);
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur envoi email' };
  }
}

/**
 * Envoie le code de vérification quand un admin réinitialise le mot de passe d'un compte.
 * Le code est envoyé à l'email enregistré sur le compte (profiles.email).
 */
export async function sendAdminPasswordResetCodeEmail(to: string, code: string): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    console.error('[email] sendAdminPasswordResetCodeEmail — RESEND_API_KEY non configuré');
    return { ok: false, error: 'Envoi d\'email non configuré' };
  }
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: 'Code de réinitialisation de mot de passe — PTFS Logbook',
      html: `
        <p>Bonjour,</p>
        <p>Un administrateur a demandé la réinitialisation du mot de passe de votre compte. Voici le code de vérification :</p>
        <p style="font-size:24px;font-weight:bold;letter-spacing:4px;margin:20px 0;">${code}</p>
        <p>Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, contactez un administrateur.</p>
        <p>— PTFS Logbook</p>
      `,
    });
    if (error) {
      console.error('[email] ❌ Resend error (sendAdminPasswordResetCodeEmail):', error);
      return { ok: false, error: error.message };
    }
    console.log('[email] ✓ Code reset mot de passe envoyé vers', maskEmailLog(to));
    return { ok: true };
  } catch (e) {
    console.error('[email] ❌ sendAdminPasswordResetCodeEmail:', e);
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur envoi email' };
  }
}

/**
 * Envoie le lien de réinitialisation de mot de passe (mot de passe oublié).
 */
export async function sendPasswordResetLinkEmail(to: string, resetUrl: string): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    console.error('[email] sendPasswordResetLinkEmail — RESEND_API_KEY non configuré');
    return { ok: false, error: 'Envoi d\'email non configuré' };
  }
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: 'Réinitialisation de votre mot de passe — PTFS Logbook',
      html: `
        <p>Bonjour,</p>
        <p>Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le lien ci-dessous pour en choisir un nouveau :</p>
        <p><a href="${resetUrl}" style="color:#0ea5e9;">${resetUrl}</a></p>
        <p>Ce lien expire dans 24 heures. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
        <p>— PTFS Logbook</p>
      `,
    });
    if (error) {
      console.error('[email] ❌ Resend error (sendPasswordResetLinkEmail):', error);
      return { ok: false, error: error.message };
    }
    console.log('[email] ✓ Lien reset mot de passe envoyé vers', maskEmailLog(to));
    return { ok: true };
  } catch (e) {
    console.error('[email] ❌ sendPasswordResetLinkEmail:', e);
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur envoi email' };
  }
}
