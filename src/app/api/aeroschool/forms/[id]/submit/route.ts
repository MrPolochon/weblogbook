export const dynamic = 'force-dynamic';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  formatModuleAnswerKey,
  getModuleAnswerEntries,
  getModuleQuestionIdFromKey,
} from '@/lib/aeroschool-module-answers';
import { getAeroSchoolRespondent, requireAeroSchoolRespondent } from '@/lib/aeroschool-auth';
import {
  buildDiscordEmbed,
  buildWebhookPayload,
  sendDiscordWebhook,
} from '@/lib/aeroschool/discord-webhook';
import { loadAeroSchoolRespondentProfiles } from '@/lib/aeroschool-respondent-profiles';
import { renderCartePng } from '@/lib/cartes/render-carte-png';
import { verifyAeroSchoolTestToken } from '@/lib/aeroschool-test-token';
import { NextResponse } from 'next/server';

interface ModuleQuestion {
  id: string;
  title: string;
  options: string[];
  correct_answers: string[];
}

interface Question {
  id: string;
  title: string;
  type: string;
  is_graded?: boolean;
  points?: number;
  correct_answers?: string[];
  required?: boolean;
  module_id?: string;
  module_count?: number;
}

interface Section {
  title?: string;
  questions?: Question[];
}

// POST — soumettre une réponse (public, pas besoin d'auth)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { answers, cheating_detected, time_expired, cheat_reason, status_override, test_token } = body;

    if (!answers || typeof answers !== 'object') {
      return NextResponse.json({ error: 'Réponses manquantes' }, { status: 400 });
    }

    const sanitizedCheatReason =
      typeof cheat_reason === 'string' && cheat_reason.length > 0 && cheat_reason.length <= 100
        ? cheat_reason
        : null;

    if (cheating_detected && sanitizedCheatReason) {
      console.warn(`[AeroSchool] Triche détectée sur form ${id} — raison: ${sanitizedCheatReason}`);
    }

    const isAbandoned = status_override === 'abandoned';
    if (isAbandoned) {
      console.info(`[AeroSchool] Session abandonnée sur form ${id} (fermeture de page)`);
    }

    const admin = createAdminClient();

    // Récupérer le formulaire
    const { data: form, error: formError } = await admin
      .from('aeroschool_forms')
      .select('*')
      .eq('id', id)
      .eq('is_published', true)
      .single();

    if (formError || !form) {
      return NextResponse.json({ error: 'Formulaire introuvable ou non publié' }, { status: 404 });
    }

    let respondent = await getAeroSchoolRespondent();
    if (form.requires_auth) {
      const auth = await requireAeroSchoolRespondent();
      if (!auth.ok) {
        return NextResponse.json({ error: 'Connexion requise pour soumettre ce formulaire' }, { status: 401 });
      }
      respondent = auth.profile;
    }

    const antitricheOn = form.antitriche_enabled !== false;
    const isCheatOrAbandon = Boolean(cheating_detected) || status_override === 'abandoned';
    // Jeton HMAC uniquement pour les examens en mode review — ne pas bloquer l'envoi Discord webhook.
    const needsTestToken =
      antitricheOn &&
      form.delivery_mode !== 'webhook' &&
      !isCheatOrAbandon &&
      !time_expired;
    if (needsTestToken) {
      if (typeof test_token !== 'string' || !verifyAeroSchoolTestToken(test_token, id)) {
        return NextResponse.json({ error: 'Session de test invalide ou expirée. Recommencez le formulaire.' }, { status: 403 });
      }
    }

    // Calculer le score si des questions sont notées
    let score = 0;
    let maxScore = 0;
    const sections: Section[] = Array.isArray(form.sections) ? form.sections : [];
    const processedModuleAnswerKeys = new Set<string>();

    for (const section of sections) {
      const questions = Array.isArray(section.questions) ? section.questions : [];
      for (const q of questions) {
        if (q.type === 'question_module' && q.module_id?.trim()) {
          const moduleAnswers = getModuleAnswerEntries(q, answers) as [string, string | string[]][];
          if (moduleAnswers.length === 0) continue;

          const { data: mod } = await admin
            .from('aeroschool_question_modules')
            .select('questions')
            .eq('id', q.module_id.trim())
            .single();

          const modQuestions: ModuleQuestion[] = Array.isArray(mod?.questions) ? mod.questions : [];
          const byId = new Map(modQuestions.map((mq) => [mq.id, mq]));

          for (const [key, answer] of moduleAnswers) {
            if (processedModuleAnswerKeys.has(key)) continue;
            processedModuleAnswerKeys.add(key);
            const questionId = getModuleQuestionIdFromKey(key, q);
            const mq = byId.get(questionId);
            if (!mq) continue;
            maxScore += 1;
            const correct = mq.correct_answers || [];
            if (correct.length > 0 && answer) {
              const ans = String(Array.isArray(answer) ? answer[0] : answer).trim();
              const correctTrimmed = correct.map((c) => String(c).trim());
              if (correctTrimmed.some((c) => c === ans)) score += 1;
            }
          }
          continue;
        }
        if (q.is_graded && q.points) {
          maxScore += q.points;
          const answer = answers[q.id];
          if (answer && q.correct_answers && q.correct_answers.length > 0) {
            if (q.type === 'checkbox' && Array.isArray(answer)) {
              const correctSet = new Set(q.correct_answers);
              const answerSet = new Set(answer as string[]);
              if (correctSet.size === answerSet.size && Array.from(correctSet).every((a) => answerSet.has(a))) {
                score += q.points;
              }
            } else {
              if (q.correct_answers.includes(String(answer))) {
                score += q.points;
              }
            }
          }
        }
      }
    }

    // Statut : abandon (fermeture page) > temps dépassé > triche > soumis
    const status = isAbandoned
      ? 'abandoned'
      : time_expired
        ? 'time_expired'
        : cheating_detected
          ? 'trashed'
          : 'submitted';

    const responseRow: Record<string, unknown> = {
      form_id: id,
      answers,
      score: maxScore > 0 ? score : null,
      max_score: maxScore > 0 ? maxScore : null,
      cheating_detected: Boolean(cheating_detected),
      status,
    };

    if (respondent) {
      responseRow.user_id = respondent.userId;
      responseRow.respondent_identifiant = respondent.identifiant;
    }
    if (sanitizedCheatReason) {
      responseRow.cheat_reason = sanitizedCheatReason;
    }

    // Récupérer les titres des questions module pour l'embed Discord
    let moduleQuestionTitles: Record<string, string> | undefined;
    for (const section of sections) {
      for (const q of section.questions || []) {
        if (q.type === 'question_module' && q.module_id?.trim()) {
          const { data: mod } = await admin
            .from('aeroschool_question_modules')
            .select('questions')
            .eq('id', q.module_id.trim())
            .single();
          const modQuestions: ModuleQuestion[] = Array.isArray(mod?.questions) ? mod.questions : [];
          moduleQuestionTitles = moduleQuestionTitles || {};
          for (const mq of modQuestions) {
            const t = mq.title || 'Question';
            moduleQuestionTitles[formatModuleAnswerKey(q.id, q.module_id, mq.id)] = t;
            if (q.module_id?.trim()) {
              moduleQuestionTitles[`module_${q.module_id.trim()}_${mq.id}`] = t;
            }
          }
        }
      }
    }

    // Mode webhook : envoyer un embed Discord puis ne pas stocker (sauf si triche/abandon/temps écoulé)
    if (form.delivery_mode === 'webhook' && form.webhook_url && !cheating_detected && !time_expired && !isAbandoned) {
      try {
        let respondentInfo: { identifiant: string; discordUsername: string | null } | undefined;
        let cartePng: Buffer | null = null;

        if (respondent?.userId) {
          const profiles = await loadAeroSchoolRespondentProfiles(admin, [respondent.userId]);
          const profile = profiles.get(respondent.userId);
          if (profile) {
            respondentInfo = {
              identifiant: profile.identifiant,
              discordUsername: profile.discord_username,
            };
            if (profile.carte) {
              cartePng = await renderCartePng(profile.carte, profile.identifiant);
            }
          } else {
            respondentInfo = {
              identifiant: respondent.identifiant,
              discordUsername: respondent.discordUsername,
            };
          }
        }

        const embedPayload = buildDiscordEmbed(
          form.title,
          sections,
          answers as Record<string, unknown>,
          score,
          maxScore,
          moduleQuestionTitles,
          respondentInfo,
          Boolean(cartePng),
        );

        const payload = buildWebhookPayload(embedPayload, form.webhook_role_id);

        const webhookRes = await sendDiscordWebhook(form.webhook_url, payload, cartePng);

        if (!webhookRes.ok) {
          console.error('[AeroSchool] Webhook HTTP error:', webhookRes.status, await webhookRes.text().catch(() => ''));
          // Fallback : stocker en BDD
          const { error: insertErr } = await admin.from('aeroschool_responses').insert(responseRow);
          if (insertErr) console.error('[AeroSchool] Fallback insert error:', insertErr);
          return NextResponse.json({ ok: true, score: maxScore > 0 ? score : undefined, maxScore: maxScore > 0 ? maxScore : undefined, webhookFailed: true });
        }
      } catch (webhookErr) {
        console.error('[AeroSchool] Webhook error:', webhookErr);
        const { error: insertErr } = await admin.from('aeroschool_responses').insert(responseRow);
        if (insertErr) console.error('[AeroSchool] Fallback insert error:', insertErr);
        return NextResponse.json({ ok: true, score: maxScore > 0 ? score : undefined, maxScore: maxScore > 0 ? maxScore : undefined, webhookFailed: true });
      }
      return NextResponse.json({ ok: true, score: maxScore > 0 ? score : undefined, maxScore: maxScore > 0 ? maxScore : undefined });
    }

    // Mode review ou triche : stocker en BDD
    const { error: insertErr } = await admin.from('aeroschool_responses').insert(responseRow);
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, score: maxScore > 0 ? score : undefined, maxScore: maxScore > 0 ? maxScore : undefined });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
