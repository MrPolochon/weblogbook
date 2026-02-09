'use client';

import Link from 'next/link';
import { ArrowLeft, Smartphone, Monitor, Apple, Download, ExternalLink } from 'lucide-react';

export default function DownloadPage() {
  const apps = [
    {
      platform: 'Android',
      icon: Smartphone,
      description: 'Application pour smartphones et tablettes Android',
      version: 'Bientôt disponible',
      downloadUrl: null,
      color: 'from-green-500 to-emerald-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      available: false,
    },
    {
      platform: 'Windows',
      icon: Monitor,
      description: 'Application de bureau pour Windows 10/11',
      version: 'Bientôt disponible',
      downloadUrl: null,
      color: 'from-blue-500 to-indigo-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      available: false,
    },
    {
      platform: 'iOS',
      icon: Apple,
      description: 'Application pour iPhone et iPad',
      version: 'Bientôt disponible',
      downloadUrl: null,
      color: 'from-slate-600 to-slate-800',
      bgColor: 'bg-slate-50',
      borderColor: 'border-slate-200',
      available: false,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      {/* Header */}
      <header className="p-4">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          Retour à la connexion
        </Link>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="max-w-4xl w-full">
          {/* Title */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center p-4 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 mb-6">
              <Download className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-4">
              Télécharger l&apos;application
            </h1>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              Accédez à WebLogBook sur tous vos appareils. Suivez vos vols, gérez vos plans de vol et restez connecté où que vous soyez.
            </p>
          </div>

          {/* Apps grid */}
          <div className="grid md:grid-cols-3 gap-6">
            {apps.map((app) => {
              const Icon = app.icon;
              return (
                <div
                  key={app.platform}
                  className={`relative rounded-2xl border ${app.borderColor} ${app.bgColor} p-6 transition-all hover:shadow-lg hover:scale-[1.02]`}
                >
                  {/* Platform icon */}
                  <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${app.color} mb-4`}>
                    <Icon className="h-8 w-8 text-white" />
                  </div>

                  {/* Platform info */}
                  <h2 className="text-xl font-bold text-slate-900 mb-2">{app.platform}</h2>
                  <p className="text-slate-600 text-sm mb-4">{app.description}</p>

                  {/* Version badge */}
                  <div className="mb-4">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                      app.available 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {app.version}
                    </span>
                  </div>

                  {/* Download button */}
                  {app.available && app.downloadUrl ? (
                    <a
                      href={app.downloadUrl}
                      className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r ${app.color} text-white font-medium hover:opacity-90 transition-opacity`}
                    >
                      <Download className="h-5 w-5" />
                      Télécharger
                    </a>
                  ) : (
                    <button
                      disabled
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-200 text-slate-500 font-medium cursor-not-allowed"
                    >
                      <Download className="h-5 w-5" />
                      Bientôt disponible
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Web app notice */}
          <div className="mt-12 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800 border border-slate-700">
              <ExternalLink className="h-4 w-4 text-sky-400" />
              <span className="text-slate-300 text-sm">
                En attendant, utilisez la 
                <Link href="/login" className="text-sky-400 hover:text-sky-300 ml-1 font-medium">
                  version web
                </Link>
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 text-center text-slate-500 text-sm">
        <p>WebLogBook — Application de gestion de vols pour PTFS</p>
      </footer>
    </div>
  );
}
