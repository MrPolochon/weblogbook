import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6 p-8 rounded-2xl border border-slate-700/50 bg-slate-900/60 backdrop-blur-md shadow-elevated">
        <div className="flex justify-center">
          <div className="p-4 rounded-full bg-red-500/15 border border-red-500/30">
            <ShieldAlert className="h-10 w-10 text-red-400" aria-hidden="true" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-100">Accès non autorisé</h1>
          <p className="text-sm text-slate-400">
            Vous n&apos;avez pas les permissions nécessaires pour accéder à cette page.
            Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur, contactez un administrateur.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/logbook"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors"
          >
            Retour au logbook
          </Link>
          <Link
            href="/compte"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-slate-600 hover:bg-slate-800 text-slate-200 font-medium transition-colors"
          >
            Mon compte
          </Link>
        </div>
      </div>
    </div>
  );
}
