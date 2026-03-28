'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Radio, X, Eye, Loader2, MapPin, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAtcTheme } from '@/contexts/AtcThemeContext';

interface AtcSession {
  aeroport: string;
  position: string;
  user_id: string;
  identifiant: string;
}

interface AtcEnLigneModalProps {
  totalAtc: number;
  sessionsEnService: AtcSession[];
}

export default function AtcEnLigneModal({ totalAtc, sessionsEnService }: AtcEnLigneModalProps) {
  const { theme } = useAtcTheme();
  const isDark = theme === 'dark';
  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState<AtcSession[]>(sessionsEnService);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Récupérer l'ID et le rôle de l'utilisateur courant
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        setCurrentUserId(data.user.id);
        // Vérifier si admin
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single();
        setIsAdmin(profile?.role === 'admin');
      }
    });
  }, []);

  // Actualiser les sessions
  const fetchSessions = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: sessionsData } = await supabase
        .from('atc_sessions')
        .select('aeroport, position, user_id')
        .order('aeroport');

      if (sessionsData) {
        // Enrichir avec les identifiants
        const enriched = await Promise.all(sessionsData.map(async (sess) => {
          let identifiant = '—';
          if (sess.user_id) {
            const { data } = await supabase.from('profiles').select('identifiant').eq('id', sess.user_id).single();
            identifiant = data?.identifiant || '—';
          }
          return { ...sess, identifiant };
        }));
        setSessions(enriched);
      }
    } catch (error) {
      console.error('Erreur chargement sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  // Ouvrir le modal
  const handleOpen = () => {
    setIsOpen(true);
    fetchSessions();
  };

  // Aller en mode spectateur
  const handleSpectate = (atcUserId: string) => {
    setIsOpen(false);
    router.push(`/atc/spectateur/${atcUserId}`);
  };

  // Fermer le modal en cliquant dehors
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Grouper par aéroport
  const byAeroport = sessions.reduce<Record<string, AtcSession[]>>((acc, s) => {
    if (!acc[s.aeroport]) acc[s.aeroport] = [];
    acc[s.aeroport].push(s);
    return acc;
  }, {});

  return (
    <>
      {/* Badge cliquable */}
      <button
        onClick={handleOpen}
        className={`text-center px-4 py-2 rounded-xl border transition-all cursor-pointer group ${
          isDark
            ? 'border-emerald-500/25 bg-emerald-500/12 hover:bg-emerald-500/18 hover:border-emerald-500/40'
            : 'bg-emerald-100 border-emerald-200 hover:bg-emerald-200 hover:border-emerald-300'
        }`}
      >
        <p className={`text-2xl font-bold group-hover:scale-110 transition-transform ${isDark ? 'text-emerald-300' : 'text-emerald-600'}`}>{totalAtc}</p>
        <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-emerald-200/80' : 'text-emerald-700'}`}>ATC en ligne</p>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div 
            ref={modalRef}
            className={`w-full max-w-2xl max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden animate-slide-in ${
              isDark
                ? 'border border-slate-800 bg-slate-950 text-slate-100'
                : 'bg-white'
            }`}
          >
            {/* Header */}
            <div className={`flex items-center justify-between p-4 border-b ${
              isDark
                ? 'border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-950/40'
                : 'border-slate-200 bg-gradient-to-r from-emerald-50 to-green-50'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${isDark ? 'bg-emerald-500/15' : 'bg-emerald-100'}`}>
                  <Radio className={`h-5 w-5 ${isDark ? 'text-emerald-300' : 'text-emerald-600'}`} />
                </div>
                <div>
                  <h2 className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Contrôleurs en ligne</h2>
                  <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{sessions.length} contrôleur(s) actif(s)</p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}
              >
                <X className={`h-5 w-5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[60vh] p-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
                </div>
              ) : Object.keys(byAeroport).length === 0 ? (
                <div className="text-center py-12">
                  <Radio className={`h-12 w-12 mx-auto mb-3 ${isDark ? 'text-slate-700' : 'text-slate-300'}`} />
                  <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>Aucun contrôleur en ligne</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(byAeroport).map(([aeroport, controllers]) => (
                    <div key={aeroport} className={`rounded-xl overflow-hidden ${
                      isDark ? 'border border-slate-800 bg-slate-900/80' : 'bg-slate-50 border border-slate-200'
                    }`}>
                      {/* Aéroport header */}
                      <div className={`px-4 py-3 border-b ${
                        isDark
                          ? 'border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800'
                          : 'bg-gradient-to-r from-slate-100 to-slate-50 border-slate-200'
                      }`}>
                        <div className="flex items-center gap-2">
                          <MapPin className={`h-4 w-4 ${isDark ? 'text-emerald-300' : 'text-emerald-600'}`} />
                          <span className={`text-lg font-bold font-mono ${isDark ? 'text-emerald-300' : 'text-emerald-600'}`}>{aeroport}</span>
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        </div>
                      </div>

                      {/* Controllers */}
                      <div className={isDark ? 'divide-y divide-slate-800' : 'divide-y divide-slate-100'}>
                        {controllers.map((controller, idx) => (
                          <div 
                            key={`${controller.user_id}-${idx}`}
                            className={`flex items-center justify-between p-4 transition-colors ${isDark ? 'hover:bg-slate-800/80' : 'hover:bg-white'}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${isDark ? 'bg-emerald-500/12' : 'bg-emerald-100'}`}>
                                <User className={`h-4 w-4 ${isDark ? 'text-emerald-300' : 'text-emerald-600'}`} />
                              </div>
                              <div>
                                <p className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{controller.identifiant}</p>
                                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{controller.position}</p>
                              </div>
                            </div>

                            {/* Bouton spectateur (admin uniquement, pas pour soi-même) */}
                            {controller.user_id === currentUserId ? (
                              <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${
                                isDark ? 'border border-emerald-500/25 bg-emerald-500/10 text-emerald-200' : 'bg-emerald-100 text-emerald-700'
                              }`}>
                                C&apos;est vous
                              </span>
                            ) : isAdmin ? (
                              <button
                                onClick={() => handleSpectate(controller.user_id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium text-sm ${
                                  isDark ? 'border border-sky-500/25 bg-sky-500/10 text-sky-200 hover:bg-sky-500/18' : 'bg-sky-100 text-sky-700 hover:bg-sky-200'
                                }`}
                              >
                                <Eye className="h-4 w-4" />
                                Observer
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className={`p-4 border-t flex items-center justify-between ${
              isDark ? 'border-slate-800 bg-slate-950/80' : 'border-slate-200 bg-slate-50'
            }`}>
              {isAdmin ? (
                <p className={`text-xs flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  <Eye className="h-3 w-3" />
                  Cliquez sur « Observer » pour voir l&apos;interface d&apos;un contrôleur
                </p>
              ) : (
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Liste des contrôleurs actuellement en service
                </p>
              )}
              <button
                onClick={fetchSessions}
                disabled={loading}
                className={`text-sm font-medium disabled:opacity-50 ${isDark ? 'text-sky-300 hover:text-sky-200' : 'text-sky-600 hover:text-sky-700'}`}
              >
                Actualiser
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
