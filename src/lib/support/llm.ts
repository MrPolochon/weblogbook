import { finalizeReply } from '@/lib/support/reply-format';

/**
 * Appel du modèle de l'IA tickets, piloté entièrement par variables
 * d'environnement : changer de fournisseur ne demande aucune modification de
 * code, seulement de nouvelles valeurs sur Vercel.
 *
 * Pourquoi une chaîne de repli plutôt qu'un seul modèle : chez Groq les quotas
 * sont comptés PAR MODÈLE. Le plan gratuit donne 8K tokens/minute à
 * `openai/gpt-oss-120b` (≈ 3 à 4 messages de ticket par minute, un message
 * complet pesant ~2200 tokens) mais 70K tokens/minute à `groq/compound-mini`,
 * qui ne dispose en revanche que de 250 requêtes/jour contre 1000. Enchaîner
 * les deux additionne des quotas indépendants : le modèle courant absorbe le
 * quotidien, le second absorbe les pics de tickets simultanés.
 *
 * Variables reconnues :
 * - `SUPPORT_LLM_BASE_URL`, `SUPPORT_LLM_API_KEY` (ou `GROQ_API_KEY` /
 *   `OPENAI_API_KEY`), `SUPPORT_LLM_MODEL`, `SUPPORT_LLM_FALLBACK_MODEL`
 *   (liste séparée par des virgules) pour le fournisseur principal ;
 * - `SUPPORT_LLM_BASE_URL_2`, `SUPPORT_LLM_API_KEY_2`, `SUPPORT_LLM_MODEL_2`
 *   pour un second fournisseur, essayé si le premier est totalement indisponible.
 */

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

/** Modèle Groq de production courant (llama-3.3-70b-versatile a été retiré le 16/08/2026). */
export const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-120b';
/**
 * Replis par défaut, dans cet ordre : `groq/compound-mini` pour son quota de
 * 70K tokens/minute (il tient les rafales), puis `openai/gpt-oss-20b` comme
 * dernier seau de secours si le modèle principal a disparu du catalogue.
 */
export const GROQ_DEFAULT_FALLBACKS = ['groq/compound-mini', 'openai/gpt-oss-20b'];

export type LlmResult = { ok: true; text: string } | { ok: false; reason: string };

export type LlmMessage = { role: 'system' | 'user' | 'assistant'; content: string };

interface Attempt {
  base: string;
  key: string;
  model: string;
}

function splitModels(raw: string | undefined): string[] {
  return (raw || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
}

function trimBase(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Ordre des essais : tous les modèles du fournisseur principal, puis ceux du
 * second. Les doublons sont écartés — réessayer le même couple ne sert à rien.
 */
export function buildAttempts(env: NodeJS.ProcessEnv = process.env): Attempt[] {
  const primaryKey = env.SUPPORT_LLM_API_KEY || env.GROQ_API_KEY || env.OPENAI_API_KEY || '';
  const useGroq = Boolean(
    env.SUPPORT_LLM_BASE_URL?.includes('groq') ||
      (!env.SUPPORT_LLM_BASE_URL && (env.GROQ_API_KEY || env.SUPPORT_LLM_API_KEY))
  );
  const primaryBase = trimBase(env.SUPPORT_LLM_BASE_URL || (useGroq ? GROQ_BASE_URL : OPENAI_BASE_URL));
  const configured = env.SUPPORT_LLM_MODEL || (useGroq ? GROQ_DEFAULT_MODEL : 'gpt-4o-mini');
  const declaredFallbacks = splitModels(env.SUPPORT_LLM_FALLBACK_MODEL);
  // Les replis par défaut ne valent que pour Groq : ces identifiants n'existent
  // nulle part ailleurs. Un autre fournisseur doit déclarer les siens.
  const fallbacks =
    declaredFallbacks.length > 0 ? declaredFallbacks : useGroq ? GROQ_DEFAULT_FALLBACKS : [];

  const attempts: Attempt[] = [];
  const seen = new Set<string>();
  const push = (base: string, key: string, model: string) => {
    if (!base || !key || !model) return;
    const id = `${base}|${model}`;
    if (seen.has(id)) return;
    seen.add(id);
    attempts.push({ base, key, model });
  };

  for (const model of [configured, ...fallbacks]) push(primaryBase, primaryKey, model);

  const secondBase = trimBase(env.SUPPORT_LLM_BASE_URL_2 || '');
  const secondKey = env.SUPPORT_LLM_API_KEY_2 || '';
  for (const model of splitModels(env.SUPPORT_LLM_MODEL_2)) push(secondBase, secondKey, model);

  return attempts;
}

/**
 * Erreurs qui disparaissent en changeant de modèle ou de fournisseur : quota
 * atteint (compté par modèle), modèle retiré du catalogue, panne côté serveur.
 */
function worthRetryingElsewhere(status: number, data: unknown): boolean {
  if (status === 429 || status >= 500) return true;
  if (status !== 404 && status !== 400) return false;
  const blob = JSON.stringify(data ?? {});
  return /model_not_found|model_decommissioned|does not exist|decommissioned|not found/i.test(blob);
}

function isBadParamError(status: number, data: unknown): boolean {
  if (status !== 400) return false;
  return /unsupported|unrecognized|not supported|invalid.*(parameter|argument)|reasoning_effort|compound_custom/i.test(
    JSON.stringify(data ?? {})
  );
}

/**
 * Options propres au modèle. Le plafond de tokens est partagé avec les tokens
 * de raisonnement : un modèle qui réfléchit a besoin de plus de marge, sinon la
 * réponse visible est vide. Les systèmes Compound sont bridés au seul
 * interpréteur de code : sans ça ils partent chercher sur le web, ce qui n'a
 * aucun sens pour un support qui ne doit citer que la documentation du site
 * (et se facture à part dès qu'on quitte le plan gratuit).
 */
function modelExtras(model: string, budget: number | undefined, withExtras: boolean): Record<string, unknown> {
  const compound = /compound/i.test(model);
  const reasoning = compound || /gpt-oss|qwen3/i.test(model);
  return {
    max_tokens: budget ?? (reasoning ? 1100 : 500),
    ...(!withExtras
      ? {}
      : compound
        ? { compound_custom: { tools: { enabled_tools: ['code_interpreter'] } } }
        : reasoning
          ? { reasoning_effort: 'low' }
          : {}),
  };
}

async function callLlm(
  attempt: Attempt,
  messages: LlmMessage[],
  budget?: number,
  withExtras = true
): Promise<{ text: string | null; status: number; data: unknown }> {
  const res = await fetch(`${attempt.base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${attempt.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: attempt.model,
      temperature: 0.2,
      ...modelExtras(attempt.model, budget, withExtras),
      messages,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(
      '[support-llm] HTTP',
      res.status,
      attempt.model,
      JSON.stringify(data).slice(0, 600)
    );
    if (withExtras && isBadParamError(res.status, data)) {
      console.warn('[support-llm] paramètre refusé, nouvel essai sans options', attempt.model);
      return callLlm(attempt, messages, budget, false);
    }
    return { text: null, status: res.status, data };
  }
  const choice = (data as { choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }> })
    ?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === 'string' && content.trim()) {
    const truncated = choice?.finish_reason === 'length';
    if (truncated) {
      console.warn('[support-llm] réponse plafonnée par max_tokens, recoupe propre', attempt.model);
    }
    return { text: finalizeReply(content, truncated), status: res.status, data };
  }
  console.error(
    '[support-llm] 200 sans contenu',
    attempt.model,
    'finish_reason=',
    choice?.finish_reason,
    JSON.stringify(data).slice(0, 600)
  );
  return { text: null, status: res.status, data };
}

/**
 * `budget` : plafond de tokens de sortie imposé par l'appelant (le second
 * passage documentaire se contente d'une réponse plus courte).
 */
export async function llmReply(messages: LlmMessage[], budget?: number): Promise<LlmResult> {
  const attempts = buildAttempts();
  if (attempts.length === 0) {
    console.error('[support-llm] aucune clé LLM (GROQ_API_KEY / SUPPORT_LLM_API_KEY / OPENAI_API_KEY)');
    return { ok: false, reason: 'no_api_key' };
  }

  let reason = 'unknown';
  // Un 401 ou une clé révoquée condamne tous les modèles du même fournisseur :
  // inutile de les essayer un par un, on saute au fournisseur suivant.
  const deadBases = new Set<string>();
  for (const [index, attempt] of attempts.entries()) {
    if (deadBases.has(attempt.base)) continue;
    try {
      const { text, status, data } = await callLlm(attempt, messages, budget);
      if (text) {
        if (index > 0) {
          console.warn('[support-llm] modèle de secours utilisé', attempt.model, `(essai ${index + 1})`);
        }
        return { ok: true, text };
      }
      reason = `http_${status}`;
      if (!worthRetryingElsewhere(status, data)) deadBases.add(attempt.base);
    } catch (e) {
      console.error('[support-llm] fetch', attempt.model, e);
      reason = 'fetch_error';
      deadBases.add(attempt.base);
    }
  }
  return { ok: false, reason };
}
