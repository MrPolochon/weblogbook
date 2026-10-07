export const BULLETIN_CATEGORIES = ['Loi', 'Décision', 'Communiqué', 'Information'] as const;
export function validateBulletin(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  if (typeof body.title !== 'string' || typeof body.content !== 'string' || typeof body.category !== 'string') return null;
  const title = body.title.trim();
  const content = body.content.trim();
  const category = body.category;
  if (title.length < 3 || title.length > 200 || content.length < 10 || content.length > 50000 || !BULLETIN_CATEGORIES.some(c => c === category)) return null;
  return { title, content, category };
}

export function isPublicBulletinPath(path: string) {
  return path === '/journal' || /^\/journal\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path);
}
