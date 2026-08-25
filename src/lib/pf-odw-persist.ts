import { waitUntil } from '@vercel/functions';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadCursors, pfPlaneKey, writeIngest, type PfTrailCursor } from '@/lib/pf-odw-ingest';
import type { PfLiveAircraft } from '@/lib/pftester-odw';

/**
 * Enregistre les positions en tâche de fond. Ne doit jamais bloquer ni faire
 * échouer la réponse live : le worker Railway reste la source principale.
 */
export function persistPfTracks(planes: PfLiveAircraft[]): void {
  waitUntil(
    (async () => {
      if (!planes.length) return;
      const db = createAdminClient();
      const cursors: Map<string, PfTrailCursor> = await loadCursors(
        db,
        planes.map(pfPlaneKey),
      );
      await writeIngest(db, planes, cursors);
    })().catch((err) => {
      console.error('[pftester-odw] ingest', err instanceof Error ? err.message : err);
    }),
  );
}
