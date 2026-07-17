import {
  getModuleAnswerEntries,
  getModuleQuestionIdFromKey,
} from '@/lib/aeroschool-module-answers';

interface Question {
  id: string;
  title: string;
  type: string;
  module_id?: string;
}

interface Section {
  title?: string;
  questions?: Question[];
}

export interface DiscordRespondentInfo {
  identifiant: string;
  discordUsername: string | null;
}

const CARTE_ATTACHMENT_FILENAME = 'carte-pilote.png';

export function buildDiscordEmbed(
  formTitle: string,
  sections: Section[],
  answers: Record<string, unknown>,
  score: number,
  maxScore: number,
  moduleQuestionTitles?: Record<string, string>,
  respondent?: DiscordRespondentInfo,
  includeCarteImage = false,
) {
  const EMBED_COLOR = 0xf59e0b;
  const fields: { name: string; value: string; inline: boolean }[] = [];

  if (respondent) {
    fields.push(
      { name: 'Répondant', value: respondent.identifiant, inline: true },
      {
        name: 'Discord',
        value: respondent.discordUsername || '*Non lié*',
        inline: true,
      },
      { name: '\u200B', value: '\u200B', inline: false },
    );
  }

  for (const section of sections) {
    const questions = Array.isArray(section.questions) ? section.questions : [];
    if (sections.length > 1 && section.title) {
      fields.push({
        name: '\u200B',
        value: `**── ${section.title} ──**`,
        inline: false,
      });
    }

    for (const q of questions) {
      if (q.type === 'question_module') {
        for (const [key, answer] of getModuleAnswerEntries(q, answers)) {
          const questionId = getModuleQuestionIdFromKey(key, q);
          const title = moduleQuestionTitles?.[key] || `Question ${questionId.slice(0, 8)}`;
          const displayAnswer =
            answer === undefined || answer === null || answer === ''
              ? '*Non répondu*'
              : Array.isArray(answer)
                ? answer.length > 0
                  ? answer.join(', ')
                  : '*Non répondu*'
                : String(answer);
          fields.push({
            name: title.length > 256 ? `${title.slice(0, 253)}...` : title,
            value:
              displayAnswer.length > 1024
                ? `${displayAnswer.slice(0, 1021)}...`
                : displayAnswer,
            inline: false,
          });
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
        displayAnswer = `${displayAnswer.slice(0, 1021)}...`;
      }

      fields.push({
        name: q.title || 'Question',
        value: displayAnswer,
        inline: false,
      });
    }
  }

  let footerText = `AeroSchool — ${new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
  if (maxScore > 0) {
    footerText = `Score : ${score} / ${maxScore} — ${footerText}`;
  }

  const embed: Record<string, unknown> = {
    title: `📋 ${formTitle}`,
    description: 'Nouvelle réponse reçue via AeroSchool.',
    color: EMBED_COLOR,
    fields,
    footer: { text: footerText },
    timestamp: new Date().toISOString(),
  };

  if (includeCarteImage) {
    embed.image = { url: `attachment://${CARTE_ATTACHMENT_FILENAME}` };
  }

  return { embeds: [embed] };
}

export function buildWebhookPayload(
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

export async function sendDiscordWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>,
  cartePng?: Buffer | null,
): Promise<Response> {
  if (cartePng && cartePng.length > 0) {
    const form = new FormData();
    form.append('payload_json', JSON.stringify(payload));
    form.append(
      'files[0]',
      new Blob([new Uint8Array(cartePng)], { type: 'image/png' }),
      CARTE_ATTACHMENT_FILENAME,
    );
    return fetch(webhookUrl, { method: 'POST', body: form });
  }

  return fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export { CARTE_ATTACHMENT_FILENAME };
