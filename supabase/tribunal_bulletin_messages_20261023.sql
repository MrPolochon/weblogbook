-- Chaque nouveau bulletin public déclenche une diffusion interne dans la même transaction.
-- Aucun envoi rétroactif et aucun message lors d'une mise à jour.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS messages_journal_bulletin_recipient_uidx
ON public.messages(destinataire_id, (metadata->>'bulletin_id'))
WHERE metadata->>'source'='tribunal_journal';

CREATE OR REPLACE FUNCTION public.notify_new_tribunal_bulletin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  bulletin_url text := 'https://www.mixouairlinesptfsweblogbook.com/journal/' || NEW.id::text;
  excerpt text := left(NEW.content, 400);
BEGIN
  INSERT INTO public.messages(expediteur_id,destinataire_id,titre,contenu,type_message,lu,metadata)
  SELECT NULL,p.id,
    left(format('[Journal] Bulletin n° %s - %s',NEW.number,NEW.title),200),
    format(E'Une nouvelle publication est disponible dans le journal du tribunal administratif.\n\nBulletin n° %s : %s\nCatégorie : %s\nPublié par : %s\nDate : %s UTC\n\nAperçu :\n%s%s\n\nLire le bulletin complet :\n%s',
      NEW.number,NEW.title,NEW.category,NEW.author_name,
      to_char(NEW.published_at AT TIME ZONE 'UTC','DD/MM/YYYY HH24:MI'),
      excerpt,CASE WHEN char_length(NEW.content)>400 THEN '…' ELSE '' END,bulletin_url),
    'broadcast',false,
    jsonb_build_object('source','tribunal_journal','bulletin_id',NEW.id,
      'broadcast_id',NEW.id,'broadcast_audience','all','link',bulletin_url)
  FROM public.profiles p
  ON CONFLICT (destinataire_id,(metadata->>'bulletin_id'))
    WHERE metadata->>'source'='tribunal_journal' DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_new_tribunal_bulletin() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS notify_new_tribunal_bulletin ON public.tribunal_bulletins;
CREATE TRIGGER notify_new_tribunal_bulletin AFTER INSERT ON public.tribunal_bulletins
FOR EACH ROW EXECUTE FUNCTION public.notify_new_tribunal_bulletin();
COMMIT;
