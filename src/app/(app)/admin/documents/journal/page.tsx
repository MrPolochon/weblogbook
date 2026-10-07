import Link from 'next/link';
import PublishBulletinForm from './PublishBulletinForm';
export default function AdminJournalPage() {
  return <div className="space-y-6"><Link href="/admin/documents" className="text-purple-300">← Gestion des documents</Link><header><h1 className="text-2xl font-semibold text-slate-100">Publier un bulletin du tribunal</h1><p className="mt-2 text-slate-400">Publication réservée aux administrateurs. Le texte sera immédiatement public, avec un numéro et un lien permanent.</p></header><PublishBulletinForm /><Link href="/journal" className="inline-block text-purple-300">Consulter les archives publiques →</Link></div>;
}
