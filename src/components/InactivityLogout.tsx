'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

const INACTIVITY_MS = 60 * 60 * 1000; // 1 heure
const CHECK_INTERVAL_MS = 60 * 1000;  // Vérifier toutes les minutes

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'] as const;

/**
 * Déconnecte l'utilisateur après 1 h sans aucune activité (clic, touche, mouvement).
 * Ne déconnecte pas si le compte est en service ATC ou SIAVI.
 */
export default function InactivityLogout() {
  const lastActivityRef = useRef(Date.now());

  const checkInactivity = useCallback(async () => {
    const elapsed = Date.now() - lastActivityRef.current;
    if (elapsed < INACTIVITY_MS) return;

    try {
      const res = await fetch('/api/auth/session-service');
      const data = await res.json();
      if (data.inAtcSession || data.inSiaviSession) {
        // En service : ne pas déconnecter, repousser la prochaine vérification
        lastActivityRef.current = Date.now();
        return;
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.href = '/login?message=inactivity';
    } catch {
      lastActivityRef.current = Date.now();
    }
  }, []);

  useEffect(() => {
    const onActivity = () => {
      lastActivityRef.current = Date.now();
    };

    ACTIVITY_EVENTS.forEach((ev) => {
      window.addEventListener(ev, onActivity);
    });

    const interval = setInterval(checkInactivity, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((ev) => {
        window.removeEventListener(ev, onActivity);
      });
      clearInterval(interval);
    };
  }, [checkInactivity]);

  return null;
}
