'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Users2, UserPlus, LogOut, Check, X, Loader2,
  Circle, Trophy, AlertTriangle,
} from 'lucide-react';

type TeamMember = {
  user_id: string;
  identifiant: string;
  online: boolean;
  score_moyen: number;
  montant_total: number;
};

type TeamData = {
  id: string;
  aeroport: string;
  created_by: string;
  members: TeamMember[];
  score_equipe: number;
  nb_services_completes: number;
} | null;

type GcDisponible = {
  user_id: string;
  identifiant: string;
};

type Invitation = {
  id: string;
  team_id: string;
  from_user_id: string;
  aeroport: string;
  status: string;
  expires_at: string;
  from_profile: { identifiant: string } | null;
  team: { id: string; aeroport: string } | null;
};

interface Props {
  userId: string;
  aeroport: string;
  myTeamId: string | null;
  onTeamChange: (teamId: string | null) => void;
}

export default function EquipeTab({ userId, aeroport, myTeamId, onTeamChange }: Props) {
  const [team, setTeam] = useState<TeamData>(null);
  const [gcDisponibles, setGcDisponibles] = useState<GcDisponible[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showInvitePicker, setShowInvitePicker] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const loadData = useCallback(async () => {
    const [teamRes, invRes] = await Promise.all([
      fetch(`/api/ground/teams?aeroport=${aeroport}`),
      fetch('/api/ground/invitations'),
    ]);

    if (teamRes.ok) {
      const d = await teamRes.json() as { myTeam: TeamData; gcDisponibles: GcDisponible[] };
      setTeam(d.myTeam);
      setGcDisponibles(d.gcDisponibles);
      onTeamChange(d.myTeam?.id ?? null);
    }
    if (invRes.ok) {
      const d = await invRes.json() as { invitations: Invitation[] };
      setInvitations(d.invitations);
    }
    setLoading(false);
  }, [aeroport, onTeamChange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime : écouter les nouvelles invitations
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`equipe-invitations-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ground_crew_team_invitations',
          filter: `to_user_id=eq.${userId}`,
        },
        () => loadData()
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ground_crew_team_members',
        },
        () => loadData()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, loadData]);

  async function handleInvite(toUserId: string) {
    setActionLoading(`invite-${toUserId}`);
    try {
      await fetch('/api/ground/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_user_id: toUserId }),
      });
      await loadData();
      setShowInvitePicker(false);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleInvitationResponse(invId: string, status: 'accepted' | 'declined') {
    setActionLoading(`inv-${invId}`);
    try {
      await fetch(`/api/ground/invitations/${invId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await loadData();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleLeave() {
    if (!myTeamId) return;
    setActionLoading('leave');
    try {
      await fetch(`/api/ground/teams/${myTeamId}/leave`, { method: 'POST' });
      await loadData();
      setShowLeaveConfirm(false);
    } finally {
      setActionLoading(null);
    }
  }

  // Calcul de la répartition estimée du salaire
  function calculerRepartition(): Array<{ identifiant: string; part: number }> {
    if (!team || team.members.length === 0) return [];
    const totalMontant = team.members.reduce((s, m) => s + m.montant_total, 0);
    if (totalMontant === 0) {
      const partEgale = Math.round(100 / team.members.length);
      return team.members.map((m) => ({ identifiant: m.identifiant, part: partEgale }));
    }
    return team.members.map((m) => ({
      identifiant: m.identifiant,
      part: Math.round((m.montant_total / totalMontant) * 100),
    }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  const repartition = calculerRepartition();

  return (
    <div className="space-y-4">
      {/* Invitations reçues */}
      {invitations.length > 0 && (
        <div className="space-y-2">
          {invitations.map((inv) => {
            const expiresIn = Math.max(
              0,
              Math.round((new Date(inv.expires_at).getTime() - Date.now()) / 60000)
            );
            return (
              <div
                key={inv.id}
                className="rounded-xl border border-emerald-700/40 bg-emerald-900/10 p-4"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-emerald-200">
                      Invitation de {inv.from_profile?.identifiant ?? '…'}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Aéroport {inv.aeroport} · expire dans {expiresIn} min
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleInvitationResponse(inv.id, 'accepted')}
                      disabled={actionLoading === `inv-${inv.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                    >
                      {actionLoading === `inv-${inv.id}` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Rejoindre
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInvitationResponse(inv.id, 'declined')}
                      disabled={actionLoading === `inv-${inv.id}`}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-700/40 text-red-400 text-xs hover:bg-red-900/20 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pas d'équipe */}
      {!team ? (
        <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-8 text-center space-y-4">
          <Users2 className="h-10 w-10 text-slate-600 mx-auto" />
          <div>
            <p className="text-slate-300 font-semibold">Vous travaillez en solo</p>
            <p className="text-slate-500 text-sm mt-1">
              Invitez un collègue pour former une équipe et partager les services
            </p>
          </div>

          {gcDisponibles.length > 0 ? (
            <div className="text-left space-y-2 pt-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                GC disponibles sur {aeroport}
              </p>
              {gcDisponibles.map((gc) => (
                <div
                  key={gc.user_id}
                  className="flex items-center justify-between rounded-xl border border-slate-700/40 bg-slate-800/30 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400" />
                    <span className="text-sm text-slate-200 font-medium">{gc.identifiant}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleInvite(gc.user_id)}
                    disabled={actionLoading === `invite-${gc.user_id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-700/40 text-emerald-300 text-xs font-semibold hover:bg-emerald-600/30 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === `invite-${gc.user_id}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="h-3.5 w-3.5" />
                    )}
                    Inviter
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">
              Aucun autre GC disponible sur cet aéroport pour le moment
            </p>
          )}
        </div>
      ) : (
        /* Équipe active */
        <div className="space-y-4">
          {/* Header équipe */}
          <div className="rounded-xl border border-emerald-700/40 bg-emerald-900/10 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-800/30 border border-emerald-700/40">
                  <Users2 className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <p className="font-bold text-emerald-200 text-sm">
                    Équipe · {team.members.length} membre{team.members.length > 1 ? 's' : ''}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Trophy className="h-3 w-3 text-amber-400" />
                    <span className="text-xs text-slate-400">
                      Score moyen : {Math.round(team.score_equipe * 100)}%
                      · {team.nb_services_completes} service{team.nb_services_completes !== 1 ? 's' : ''} complété{team.nb_services_completes !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLeaveConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-700/40 text-red-400 text-xs hover:bg-red-900/20 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                Quitter
              </button>
            </div>
          </div>

          {/* Confirmation quitter */}
          {showLeaveConfirm && (
            <div className="rounded-xl border border-red-700/40 bg-red-900/10 p-4 space-y-3">
              <div className="flex items-center gap-2 text-red-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <p className="text-sm font-semibold">
                  {team.members.length === 1
                    ? 'En quittant, l\'équipe sera dissoute et les avions assignés seront réassignés.'
                    : 'Vous allez quitter l\'équipe. Les autres membres pourront continuer.'}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleLeave}
                  disabled={actionLoading === 'leave'}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {actionLoading === 'leave' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <LogOut className="h-3.5 w-3.5" />
                  )}
                  Confirmer
                </button>
                <button
                  type="button"
                  onClick={() => setShowLeaveConfirm(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700/40 text-slate-400 text-xs hover:text-slate-200 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Liste des membres */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Membres</p>
            <div className="space-y-1.5">
              {team.members.map((membre) => (
                <div
                  key={membre.user_id}
                  className="flex items-center justify-between rounded-xl border border-slate-700/40 bg-slate-800/20 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <Circle
                      className={`h-2.5 w-2.5 ${
                        membre.online
                          ? 'fill-emerald-400 text-emerald-400'
                          : 'fill-slate-600 text-slate-600'
                      }`}
                    />
                    <span className="text-sm text-slate-200 font-medium">{membre.identifiant}</span>
                    {membre.user_id === userId && (
                      <span className="text-[10px] text-slate-500">(vous)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    {membre.score_moyen > 0 && (
                      <span className="flex items-center gap-1">
                        <Trophy className="h-3 w-3 text-amber-400" />
                        {Math.round(membre.score_moyen * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Répartition estimée du salaire */}
          {repartition.length > 0 && team.nb_services_completes > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Répartition estimée du salaire
              </p>
              <div className="rounded-xl border border-slate-700/40 bg-slate-800/20 p-3 space-y-2">
                {repartition.map((r) => (
                  <div key={r.identifiant} className="flex items-center gap-2">
                    <span className="text-xs text-slate-300 w-24 truncate">{r.identifiant}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-700 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${r.part}%` }}
                      />
                    </div>
                    <span className="text-xs text-emerald-400 font-semibold w-8 text-right">
                      {r.part}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inviter un collègue */}
          {gcDisponibles.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowInvitePicker((p) => !p)}
                className="flex items-center gap-2 text-sm font-semibold text-emerald-300 hover:text-emerald-200 transition-colors"
              >
                <UserPlus className="h-4 w-4" />
                Inviter un collègue ({gcDisponibles.length} disponible{gcDisponibles.length > 1 ? 's' : ''})
              </button>

              {showInvitePicker && (
                <div className="mt-2 space-y-1.5">
                  {gcDisponibles.map((gc) => (
                    <div
                      key={gc.user_id}
                      className="flex items-center justify-between rounded-xl border border-slate-700/40 bg-slate-800/30 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <Circle className="h-2 w-2 fill-emerald-400 text-emerald-400" />
                        <span className="text-sm text-slate-200">{gc.identifiant}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleInvite(gc.user_id)}
                        disabled={actionLoading === `invite-${gc.user_id}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-700/40 text-emerald-300 text-xs font-semibold hover:bg-emerald-600/30 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === `invite-${gc.user_id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UserPlus className="h-3.5 w-3.5" />
                        )}
                        Inviter
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
