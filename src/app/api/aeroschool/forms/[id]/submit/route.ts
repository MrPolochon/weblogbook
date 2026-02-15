import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

interface Question {
  id: string;
  title: string;
  type: string;
  is_graded?: boolean;
  points?: number;
  correct_answers?: string[];
  required?: boolean;
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
) {
  // Couleur dorée/ambre pour AeroSchool
  const EMBED_COLOR = 0xF59E0B;

  // Construire les fields de l'embed à partir des sections/questions
  const fields: { name: string; value: string; inline: boolean }[] = [];

  for (const section of sections) {
    const questions = Array.isArray(section.questions) ? section.questions : [];
    // Séparateur de section si plusieurs sections
    if (sections.length > 1 && section.title) {
      fields.push({
        name: `\u200B`,
        value: `**── ${section.title} ──**`,
        inline: false,
      });
    }

    for (const q of questions) {
      const answer = answers[q.id];
      let displayAnswer: string;

      if (answer === undefined || answer === null || answer === '') {
        displayAnswer = '*Non répondu*';
      } else if (Array.isArray(answer)) {
        displayAnswer = answer.length > 0 ? answer.join(', ') : '*Non répondu*';
      } else {
        displayAnswer = String(answer);
      }

      // Discord field value max 1024 chars
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

// POST — soumettre une réponse (public, pas besoin d'auth)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { answers, cheating_detected } = body;

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

    // Si triche détectée, marquer comme trashed
    const cheatingStatus = cheating_detected ? 'trashed' : 'submitted';

    const responseRow = {
      form_id: id,
      answers,
      score: maxScore > 0 ? score : null,
      max_score: maxScore > 0 ? maxScore : null,
      cheating_detected: Boolean(cheating_detected),
      status: cheatingStatus,
    };

    // Mode webhook : envoyer un embed Discord puis ne pas stocker (sauf si triche)
    if (form.delivery_mode === 'webhook' && form.webhook_url && !cheating_detected) {
      try {
        const embedPayload = buildDiscordEmbed(
          form.title,
          sections,
          answers as Record<string, unknown>,
          score,
          maxScore,
        );

        const webhookRes = await fetch(form.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(embedPayload),
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
