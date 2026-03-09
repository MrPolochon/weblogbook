import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.EMAIL_FROM ?? 'PTFS Logbook <onboarding@resend.dev>';

/**
 * Envoie le code de vérification de connexion par email.
 * Retourne true si l'envoi a réussi, false sinon (ex: RESEND_API_KEY non configuré).
 */
export async function sendLoginCodeEmail(to: string, code: string): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY non configuré, envoi de code désactivé');
    return { ok: false, error: 'Envoi d\'email non configuré' };
  }
  try {
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
      console.error('[email] Resend error:', error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.error('[email] sendLoginCodeEmail:', e);
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur envoi email' };
  }
}

/**
 * Envoie le code de vérification pour une demande d'accès à la liste des IP (superadmin).
 */
export async function sendSuperadminAccessCodeEmail(to: string, code: string): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY non configuré');
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
      console.error('[email] Resend error:', error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.error('[email] sendSuperadminAccessCodeEmail:', e);
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur envoi email' };
  }
}

/**
 * Envoie le code de vérification quand un admin réinitialise le mot de passe d'un compte.
 * Le code est envoyé à l'email enregistré sur le compte (profiles.email).
 */
export async function sendAdminPasswordResetCodeEmail(to: string, code: string): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY non configuré');
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
      console.error('[email] Resend error:', error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.error('[email] sendAdminPasswordResetCodeEmail:', e);
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur envoi email' };
  }
}

/**
 * Envoie le lien de réinitialisation de mot de passe (mot de passe oublié).
 */
export async function sendPasswordResetLinkEmail(to: string, resetUrl: string): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY non configuré');
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
      console.error('[email] Resend error:', error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.error('[email] sendPasswordResetLinkEmail:', e);
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur envoi email' };
  }
}
