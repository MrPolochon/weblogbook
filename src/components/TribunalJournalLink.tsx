import Link from 'next/link';
import { Newspaper, ArrowUpRight } from 'lucide-react';

export default function TribunalJournalLink() {
  return <Link href="/journal" className="flex items-center gap-3 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-4 text-purple-300 hover:bg-purple-500/20">
    <Newspaper className="h-6 w-6 shrink-0" />
    <span className="flex-1"><span className="block font-semibold">Journal du tribunal administratif</span><span className="block text-sm opacity-80">Lois, décisions et communiqués · Archives publiques</span></span>
    <ArrowUpRight className="h-4 w-4" />
  </Link>;
}
