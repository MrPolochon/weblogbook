-- Relais staff = état PERSISTANT du ticket, plus une décision reprise à chaque message.
--
-- Pourquoi des colonnes et pas une déduction depuis `statut` : `statut` est
-- réécrit par tous les autres chemins (réponse IA → 'waiting', escalade →
-- 'staff_needed'), ce qui remettait le relais à zéro et faisait re-poster
-- « Un staff a pris le relais. Je me tais. » à chaque message de staff, puis
-- laissait l'IA répondre par-dessus le staff dès que le demandeur écrivait.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS staff_takeover_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS staff_takeover_notified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_pinged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_discord_message_id TEXT;

COMMENT ON COLUMN public.support_tickets.staff_takeover_at IS
  'Non nul = un staff a pris le relais : l''IA reste muette sur ce ticket jusqu''à une reprise explicite (mention du bot ou /ticketia).';
COMMENT ON COLUMN public.support_tickets.staff_takeover_notified IS
  'L''annonce « Un staff a pris le relais » a déjà été postée pour le relais en cours ; remise à false lors d''une reprise IA explicite.';
COMMENT ON COLUMN public.support_tickets.staff_pinged_at IS
  'Dernier ping @staff envoyé pour ce ticket. Tant qu''il est non nul et que la situation n''a pas changé, on n''en renvoie pas.';
COMMENT ON COLUMN public.support_tickets.last_discord_message_id IS
  'Dernier message Discord traité (idempotence) : un même id rejoué ne produit pas une seconde réponse.';
