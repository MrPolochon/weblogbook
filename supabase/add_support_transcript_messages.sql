-- Transcript conversation : jeton + messages structurés (bouton Discord).
alter table public.support_tickets
  add column if not exists transcript_token text,
  add column if not exists transcript_messages jsonb;

create unique index if not exists idx_support_tickets_transcript_token
  on public.support_tickets (transcript_token)
  where transcript_token is not null;

comment on column public.support_tickets.transcript_token is
  'Jeton opaque pour ouvrir la page conversation du transcript (bouton Discord).';
comment on column public.support_tickets.transcript_messages is
  'Messages Discord structurés (auteur, date, texte) pour l’affichage conversation.';
