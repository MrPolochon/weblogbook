import { createAdminClient } from '@/lib/supabase/admin';
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

// Construit le payload Discord embed pour le webhook
function buildDiscordEmbed(
  formTitle: string,
  sections: Section[],
  answers: Record<string, unknown>,
  score: number,
  maxScore: number,
  moduleQuestionTitles?: Record<string, string>,
) {
  const EMBED_COLOR = 0xF59E0B;
  const fields: { name: string; value: string; inline: boolean }[] = [];

  for (const section of sections) {
    const questions = Array.isArray(section.questions) ? section.questions : [];
    if (sections.length > 1 && section.title) {
      fields.push({
        name: `\u200B`,
        value: `**── ${section.title} ──**`,
        inline: false,
      });
    }

    for (const q of questions) {
      if (q.type === 'question_module') {
        const prefix = `module_${q.module_id}_`;
        for (const [key, answer] of Object.entries(answers)) {
          if (typeof key === 'string' && key.startsWith(prefix)) {
            const questionId = key.slice(prefix.length);
            const title = moduleQuestionTitles?.[key] || `Question ${questionId.slice(0, 8)}`;
            const displayAnswer = answer === undefined || answer === null || answer === ''
              ? '*Non répondu*'
              : Array.isArray(answer) ? (answer.length > 0 ? answer.join(', ') : '*Non répondu*') : String(answer);
            fields.push({
              name: title.length > 256 ? title.slice(0, 253) + '...' : title,
              value: displayAnswer.length > 1024 ? displayAnswer.slice(0, 1021) + '...' : displayAnswer,
              inline: false,
            });
          }
        }
        continue;
      }
      const answer = answers[q.id];
      let displayAnswer: string;

      if (answer === undefined || answer === null || answer === '') {
        displayAnswer = '*Non répondu*';
      } else if (Array.isArray(answer)) {
        displayAnswer = answer.length > 0 ? answer.join(', ') : '*Non répondu*';
      } else {
        displayAnswer = String(answer);
      }

      if (displayAnswer.length > 1024) {
        displayAnswer = displayAnswer.slice(0, 1021) + '...';
      }

      fields.push({
        name: q.title || 'Question',
        value: displayAnswer,
        inline: false,
      });
    }
  }

  // Footer avec score si applicable
  let footerText = `AeroSchool — ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  if (maxScore > 0) {
    footerText = `Score : ${score} / ${maxScore} — ${footerText}`;
  }

  return {
    embeds: [
      {
        title: `📋 ${formTitle}`,
        description: 'Nouvelle réponse reçue via AeroSchool.',
        color: EMBED_COLOR,
        fields,
        footer: { text: footerText },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

// Ajoute la mention de rôle dans le content (hors embed) pour que Discord ping
function buildWebhookPayload(
  embedPayload: ReturnType<typeof buildDiscordEmbed>,
  webhookRoleId?: string | null,
) {
  if (webhookRoleId && /^\d+$/.test(webhookRoleId)) {
    return {
      content: `<@&${webhookRoleId}>`,
      allowed_mentions: { roles: [webhookRoleId] },
      ...embedPayload,
    };
  }
  return embedPayload;
}

// POST — soumettre une réponse (public, pas besoin d'auth)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { answers, cheating_detected, time_expired } = body;

    if (!answers || typeof answers !== 'object') {
      return NextResponse.json({ error: 'Réponses manquantes' }, { status: 400 });
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

    // Calculer le score si des questions sont notées
    let score = 0;
    let maxScore = 0;
    const sections: Section[] = Array.isArray(form.sections) ? form.sections : [];

    for (const section of sections) {
      const questions = Array.isArray(section.questions) ? section.questions : [];
      for (const q of questions) {
        if (q.type === 'question_module' && q.module_id?.trim()) {
          const prefix = `module_${q.module_id}_`;
          const moduleAnswers = Object.entries(answers).filter(
            (entry): entry is [string, string | string[]] =>
              typeof entry[0] === 'string' && entry[0].startsWith(prefix)
          );
          if (moduleAnswers.length === 0) continue;

          const { data: mod } = await admin
            .from('aeroschool_question_modules')
            .select('questions')
            .eq('id', q.module_id.trim())
            .single();

          const modQuestions: ModuleQuestion[] = Array.isArray(mod?.questions) ? mod.questions : [];
          const byId = new Map(modQuestions.map((mq) => [mq.id, mq]));

          for (const [key, answer] of moduleAnswers) {
            const questionId = key.slice(prefix.length);
            const mq = byId.get(questionId);
            if (!mq) continue;
            maxScore += 1;
            const correct = mq.correct_answers || [];
            if (correct.length > 0 && answer) {
              const ans = String(Array.isArray(answer) ? answer[0] : answer);
              if (correct.includes(ans)) score += 1;
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

    // Statut : temps dépassé > triche > soumis
    const status = time_expired ? 'time_expired' : (cheating_detected ? 'trashed' : 'submitted');

    const responseRow = {
      form_id: id,
      answers,
      score: maxScore > 0 ? score : null,
      max_score: maxScore > 0 ? maxScore : null,
      cheating_detected: Boolean(cheating_detected),
      status,
    };

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
            moduleQuestionTitles[`module_${q.module_id}_${mq.id}`] = mq.title || 'Question';
          }
        }
      }
    }

    // Mode webhook : envoyer un embed Discord puis ne pas stocker (sauf si triche)
    if (form.delivery_mode === 'webhook' && form.webhook_url && !cheating_detected && !time_expired) {
      try {
        const embedPayload = buildDiscordEmbed(
          form.title,
          sections,
          answers as Record<string, unknown>,
          score,
          maxScore,
          moduleQuestionTitles,
        );

        const payload = buildWebhookPayload(embedPayload, form.webhook_role_id);

        const webhookRes = await fetch(form.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

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
