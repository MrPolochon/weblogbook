'use client';

import Link from 'next/link';
import { ArrowLeft, Smartphone, Monitor, Apple, Download, ExternalLink, Radar } from 'lucide-react';

export default function DownloadPage() {
  const apps = [
    {
      platform: 'RadarCapture',
      icon: Radar,
      description: 'Outil de capture radar pour ATC. Le téléchargement est temporairement suspendu.',
      version: 'En maintenance',
      downloadUrl: null,
      color: 'from-slate-600 to-slate-700',
      bgColor: 'bg-slate-800/50',
      borderColor: 'border-slate-700',
      available: false,
      maintenance: true,
    },
    {
      platform: 'Android',
      icon: Smartphone,
      description: 'Radio VHF avec bulle push-to-talk au-dessus de Roblox. Android 8 et plus.',
      version: 'v1.2.0 bêta 4',
      downloadUrl: 'https://github.com/MrPolochon/weblogbook/releases/download/android-v1.2.0-beta.4/VHF-Radio-Android-1.2.0-beta.4.apk',
      color: 'from-green-500 to-emerald-600',
      bgColor: 'bg-emerald-950/30',
      borderColor: 'border-emerald-800',
      available: true,
      maintenance: false,
    },
    {
      platform: 'Windows',
      icon: Monitor,
      description: 'WebLogBook et radio VHF avec push-to-talk global pour Windows 10/11',
      version: 'v1.5.1 — Disponible',
      downloadUrl: 'https://github.com/MrPolochon/weblogbook/releases/download/v1.5.1/VHF-Radio-Setup-1.5.1.exe',
      color: 'from-blue-500 to-indigo-600',
      bgColor: 'bg-blue-950/30',
      borderColor: 'border-blue-800',
      available: true,
      maintenance: false,
    },
    {
      platform: 'iOS',
      icon: Apple,
      description: 'Application pour iPhone et iPad',
      version: 'Bientôt disponible',
      downloadUrl: null,
      color: 'from-slate-600 to-slate-800',
      bgColor: 'bg-slate-800/50',
      borderColor: 'border-slate-700',
      available: false,
      maintenance: false,
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
                  className={`relative rounded-2xl border ${app.borderColor} ${app.bgColor} p-6 transition-all ${app.maintenance ? 'opacity-70 grayscale' : 'hover:shadow-lg hover:scale-[1.02]'}`}
                >
                  {/* Platform icon */}
                  <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${app.color} mb-4`}>
                    <Icon className="h-8 w-8 text-white" />
                  </div>

                  {/* Platform info */}
                  <h2 className="text-xl font-bold text-slate-100 mb-2">{app.platform}</h2>
                  <p className="text-slate-300 text-sm mb-4">{app.description}</p>

                  {/* Version badge */}
                  <div className="mb-4">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                      app.maintenance ? 'bg-slate-700 text-slate-300' : app.available
                        ? 'bg-emerald-900 text-emerald-200'
                        : 'bg-amber-900 text-amber-200'
                    }`}>
                      {app.version}
                    </span>
                  </div>

                  {/* Download button */}
                  {app.available && app.downloadUrl ? (
                    <a
                      href={app.downloadUrl}
                      download
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
                      {app.maintenance ? 'En maintenance' : 'Bientôt disponible'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 rounded-xl border border-emerald-800 bg-emerald-950/20 p-5 text-sm text-slate-300">
            <h3 className="font-semibold text-emerald-200 mb-2">Radio Android — version bêta</h3>
            <p>Connecte-toi avec ton compte WebLogBook, règle la fréquence en attente puis bascule-la pour te connecter. Sans plan de vol actif, tu peux écouter en OBS.</p>
            <p className="mt-2">Pour parler depuis Roblox, active PTT dans la radio, autorise le microphone puis la bulle flottante. Fais glisser « Déplacer » ou la bulle réduite où tu veux : sa position est mémorisée. Utilise un autre appareil pour le cockpit Discord.</p>
            <p className="mt-2">Réception amplifiée à 200 % par défaut, réglable jusqu&apos;à 300 % dans la COM BOX.</p>
            <p className="mt-2">L&apos;application recherche les nouvelles versions au lancement. Utilise « Mettre à jour », puis éteins la radio avec OFF pour installer la mise à jour et confirmer dans Android.</p>
            <p className="mt-2 text-slate-400">Depuis la bêta 3, mets à jour directement sans désinstaller. Si tu utilises encore la bêta 1 ou 2, désinstalle-la une dernière fois : les versions récentes conservent la même signature permanente. Les essais audio sur téléphone restent à valider. <a href="https://github.com/MrPolochon/weblogbook/releases/tag/android-v1.2.0-beta.4" className="text-emerald-300 underline hover:text-emerald-200">Détails de la version</a></p>
          </div>

          {apps[0].available && <>
          {/* Configuration RadarCapture */}
          <div className="mt-8 max-w-2xl mx-auto">
            <div className="rounded-xl border border-sky-300/30 bg-sky-50/5 p-5 mb-4">
              <h3 className="text-sky-300 font-bold text-sm mb-3">Guide d&apos;utilisation de RadarCapture</h3>

              <p className="text-slate-300 text-sm font-semibold mb-2">1. Configuration initiale</p>
              <p className="text-slate-400 text-sm mb-2">Au lancement, renseignez :</p>
              <div className="space-y-2 mb-4">
                <div>
                  <p className="text-slate-300 text-xs font-semibold mb-1">URL du serveur</p>
                  <code className="block bg-slate-800 px-3 py-2 rounded-lg text-sky-300 text-sm select-all">https://www.mixouairlinesptfsweblogbook.com</code>
                </div>
                <div>
                  <p className="text-slate-300 text-xs font-semibold mb-1">Token API</p>
                  <p className="text-slate-400 text-sm">
                    <strong className="text-slate-300">Espace ATC</strong> &rarr; <strong className="text-slate-300">Mon compte</strong> &rarr; <strong className="text-slate-300">Radar ATC</strong> &rarr; <strong className="text-slate-300">&quot;Generer un token&quot;</strong>. Copiez-le et collez-le dans l&apos;app.
                  </p>
                </div>
              </div>

              <p className="text-slate-300 text-sm font-semibold mb-2">2. Selectionner la zone de capture</p>
              <p className="text-slate-400 text-sm mb-1">
                Ouvrez PTFS avec la minimap visible, puis dans RadarCapture :
              </p>
              <ul className="text-slate-400 text-sm space-y-1 list-disc list-inside mb-4">
                <li><strong className="text-slate-300">Auto minimap</strong> : detecte automatiquement la zone en bas a droite de l&apos;ecran</li>
                <li><strong className="text-slate-300">Selectionner zone</strong> : dessinez manuellement un rectangle autour de la minimap</li>
                <li><strong className="text-slate-300">Previsualiser zone</strong> : verifiez que la capture correspond bien a la minimap</li>
              </ul>

              <p className="text-slate-300 text-sm font-semibold mb-2">3. Calibrer (obligatoire)</p>
              <p className="text-slate-400 text-sm mb-1">
                Cliquez <strong className="text-slate-300">&quot;Calibrer (3 aeroports)&quot;</strong>. Une capture de la minimap s&apos;affiche :
              </p>
              <ul className="text-slate-400 text-sm space-y-1 list-disc list-inside mb-4">
                <li>Cliquez sur un aeroport visible sur la minimap</li>
                <li>Entrez son code OACI (ex: IRFD, ITKO, IPPH...)</li>
                <li>Repetez pour 3 aeroports differents et espaces</li>
                <li>Choisissez des aeroports bien eloignes les uns des autres pour une meilleure precision</li>
              </ul>

              <p className="text-slate-300 text-sm font-semibold mb-2">4. Demarrer la capture</p>
              <p className="text-slate-400 text-sm mb-4">
                Cliquez <strong className="text-slate-300">&quot;Demarrer la capture&quot;</strong>. L&apos;application capture la minimap toutes les 2 secondes, detecte les avions (points rouges) et envoie leurs positions au radar ATC en temps reel. Laissez l&apos;app tourner en arriere-plan pendant que vous jouez.
              </p>

              <div className="p-3 bg-slate-800/50 rounded-lg">
                <p className="text-slate-500 text-xs">
                  <strong className="text-slate-400">Astuce :</strong> la configuration (URL, token, zone, calibration) est sauvegardee automatiquement. Au prochain lancement, cliquez simplement &quot;Demarrer la capture&quot;.
                </p>
              </div>
            </div>
          </div>

          {/* Avertissement Windows */}
          <div className="max-w-2xl mx-auto">
            <div className="rounded-xl border border-amber-300/30 bg-amber-50/5 p-5">
              <h3 className="text-amber-300 font-bold text-sm mb-2">Windows bloque le fichier ?</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-3">
                RadarCapture n&apos;est pas encore signe numeriquement. Windows SmartScreen ou Smart App Control peuvent bloquer son execution.
              </p>
              <ul className="text-slate-400 text-sm space-y-1.5 list-disc list-inside">
                <li><strong className="text-slate-300">SmartScreen</strong> : cliquez &quot;Informations complementaires&quot; puis &quot;Executer quand meme&quot;</li>
                <li><strong className="text-slate-300">Smart App Control</strong> : Parametres &rarr; Securite Windows &rarr; Controle des applications &rarr; Smart App Control &rarr; Desactiver temporairement</li>
                <li><strong className="text-slate-300">Proprietes</strong> : clic droit sur le fichier &rarr; Proprietes &rarr; cocher &quot;Debloquer&quot; en bas &rarr; OK</li>
              </ul>
              <p className="text-slate-500 text-xs mt-3">
                Vous pouvez aussi lancer directement le script Python : installez Python, puis executez <code className="bg-slate-800 px-1.5 py-0.5 rounded text-sky-300">python main.py</code> depuis le dossier <code className="bg-slate-800 px-1.5 py-0.5 rounded text-sky-300">radar-capture/</code>.
              </p>
            </div>
          </div>

          </>}
          {/* Web app notice */}
          <div className="mt-8 text-center">
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
