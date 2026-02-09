'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Clock, X, Plane, ArrowRight, AlertTriangle, Trash2, Eye, CheckCircle, Loader2, User, Building2 } from 'lucide-react';
import Link from 'next/link';

interface PlanEnAttente {
  id: string;
  numero_vol: string;
  aeroport_depart: string;
  aeroport_arrivee: string;
  type_vol: string;
  statut: string;
  created_at: string;
  pilote?: { identifiant: string } | null;
  compagnie?: { nom: string } | null;
}

interface PlansEnAttenteModalProps {
  totalPlans: number;
  initialPlans?: PlanEnAttente[];
}

export default function PlansEnAttenteModal({ totalPlans, initialPlans = [] }: PlansEnAttenteModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [plans, setPlans] = useState<PlanEnAttente[]>(initialPlans);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Charger les plans en attente
  const fetchPlans = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: plansData } = await supabase
        .from('plans_vol')
        .select('id, numero_vol, aeroport_depart, aeroport_arrivee, type_vol, statut, created_at, pilote_id, compagnie_id')
        .in('statut', ['depose', 'en_attente'])
        .order('created_at', { ascending: false });

      if (plansData) {
        // Enrichir avec pilote et compagnie
        const enrichedPlans = await Promise.all(plansData.map(async (plan) => {
          let pilote = null;
          let compagnie = null;

          if (plan.pilote_id) {
            const { data } = await supabase.from('profiles').select('identifiant').eq('id', plan.pilote_id).single();
            pilote = data;
          }
          if (plan.compagnie_id) {
            const { data } = await supabase.from('compagnies').select('nom').eq('id', plan.compagnie_id).single();
            compagnie = data;
          }

          return { ...plan, pilote, compagnie };
        }));
        setPlans(enrichedPlans);
      }
    } catch (error) {
      console.error('Erreur chargement plans:', error);
    } finally {
      setLoading(false);
    }
  };

  // Ouvrir le modal et charger les données
  const handleOpen = () => {
    setIsOpen(true);
    fetchPlans();
  };

  // Annuler un plan
  const handleAnnuler = async (planId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir annuler ce plan de vol ?')) return;
    
    setActionLoading(planId);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('plans_vol')
        .update({ statut: 'annule' })
        .eq('id', planId);

      if (error) throw error;
      
      // Retirer le plan de la liste
      setPlans(prev => prev.filter(p => p.id !== planId));
    } catch (error) {
      console.error('Erreur annulation:', error);
      alert('Erreur lors de l\'annulation du plan');
    } finally {
      setActionLoading(null);
    }
  };

  // Accepter un plan rapidement
  const handleAccepter = async (planId: string) => {
    setActionLoading(planId);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non connecté');

      const { error } = await supabase
        .from('plans_vol')
        .update({ 
          statut: 'accepte',
          current_holder_user_id: user.id,
          accepted_at: new Date().toISOString()
        })
        .eq('id', planId);

      if (error) throw error;
      
      // Retirer le plan de la liste
      setPlans(prev => prev.filter(p => p.id !== planId));
    } catch (error) {
      console.error('Erreur acceptation:', error);
      alert('Erreur lors de l\'acceptation du plan');
    } finally {
      setActionLoading(null);
    }
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

  // Format date relative
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    
    if (diffMin < 1) return 'À l\'instant';
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  return (
    <>
      {/* Badge cliquable */}
      <button
        onClick={handleOpen}
        className="text-center px-4 py-2 rounded-lg bg-amber-100 border border-amber-200 hover:bg-amber-200 hover:border-amber-300 transition-all cursor-pointer group"
      >
        <p className="text-2xl font-bold text-amber-600 group-hover:scale-110 transition-transform">{totalPlans}</p>
        <p className="text-xs text-amber-700 uppercase tracking-wide">Plans en attente</p>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div 
            ref={modalRef}
            className="w-full max-w-2xl max-h-[80vh] bg-white rounded-2xl shadow-2xl overflow-hidden animate-slide-in"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-gradient-to-r from-amber-50 to-orange-50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-100">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Plans en attente</h2>
                  <p className="text-sm text-slate-600">{plans.length} plan(s) à traiter</p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[60vh] p-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
                </div>
              ) : plans.length === 0 ? (
                <div className="text-center py-12">
                  <Plane className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">Aucun plan en attente</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {plans.map((plan) => (
                    <div 
                      key={plan.id}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          {/* Info vol */}
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className="font-bold text-slate-900 font-mono text-lg">{plan.numero_vol}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              plan.statut === 'depose' 
                                ? 'bg-amber-100 text-amber-700' 
                                : 'bg-orange-100 text-orange-700'
                            }`}>
                              {plan.statut === 'depose' ? 'Déposé' : 'En attente'}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-600">{plan.type_vol}</span>
                          </div>

                          {/* Route */}
                          <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                            <span className="font-mono text-sky-600 font-semibold">{plan.aeroport_depart}</span>
                            <ArrowRight className="h-4 w-4 text-slate-400" />
                            <span className="font-mono text-emerald-600 font-semibold">{plan.aeroport_arrivee}</span>
                          </div>

                          {/* Pilote / Compagnie */}
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            {plan.pilote?.identifiant && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {plan.pilote.identifiant}
                              </span>
                            )}
                            {plan.compagnie?.nom && (
                              <span className="flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {plan.compagnie.nom}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(plan.created_at)}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <Link
                            href={`/atc/plan/${plan.id}`}
                            onClick={() => setIsOpen(false)}
                            className="p-2 rounded-lg bg-sky-100 text-sky-600 hover:bg-sky-200 transition-colors"
                            title="Voir le plan"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          <button
                            onClick={() => handleAccepter(plan.id)}
                            disabled={actionLoading === plan.id}
                            className="p-2 rounded-lg bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-colors disabled:opacity-50"
                            title="Accepter"
                          >
                            {actionLoading === plan.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleAnnuler(plan.id)}
                            disabled={actionLoading === plan.id}
                            className="p-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors disabled:opacity-50"
                            title="Annuler"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Cliquez sur un plan pour plus de détails
              </p>
              <button
                onClick={fetchPlans}
                disabled={loading}
                className="text-sm text-sky-600 hover:text-sky-700 font-medium disabled:opacity-50"
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
