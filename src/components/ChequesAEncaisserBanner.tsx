import Link from 'next/link';
import { CreditCard } from 'lucide-react';

export default function ChequesAEncaisserBanner({
  count,
  href = '/messagerie',
}: {
  count: number;
  href?: string;
}) {
  if (count <= 0) return null;

  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-amber-700 bg-amber-950 px-4 py-3 text-amber-100 hover:bg-amber-900 transition-colors"
    >
      <CreditCard className="h-5 w-5 shrink-0 text-amber-400" />
      <p className="text-sm font-medium">
        Vous avez <span className="tabular-nums font-bold">{count}</span> chèque
        {count > 1 ? 's' : ''} à encaisser dans la messagerie — le solde Felitz
        n&apos;est crédité qu&apos;après encaissement.
      </p>
    </Link>
  );
}
