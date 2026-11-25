'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { disableYoutubeCaptions, loadYoutubePlayer, type YoutubePlayer } from '@/lib/youtube-player';

export const LOGIN_CHRISTMAS_VIDEO = 'vf4ZXBzbAio';

export default function LoginChristmasVideo() {
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<YoutubePlayer | null>(null);
  const activated = useRef(false);
  const paused = useRef(false);
  const volumeRef = useRef(10);
  const [volume, setVolume] = useState(10);

  const startSound = useCallback(() => {
    const current = player.current;
    if (!current) return;
    activated.current = true; paused.current = false;
    current.unMute(); current.playVideo();
  }, []);

  useEffect(() => {
    let disposed = false, instance: YoutubePlayer | null = null;
    let clicked = false;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Login inputs keep their normal behavior. Later page clicks never toggle playback.
    const firstInteraction = (event: Event) => {
      if (!event.isTrusted || activated.current) return;
      clicked = true;
      if (player.current) startSound();
    };
    document.addEventListener('click', firstInteraction, true);
    document.addEventListener('keydown', firstInteraction, true);
    void loadYoutubePlayer().then(api => {
      if (disposed || !container.current) return;
      const mount = document.createElement('div'); container.current.appendChild(mount);
      instance = new api.Player(mount, {
        host: 'https://www.youtube-nocookie.com', videoId: LOGIN_CHRISTMAS_VIDEO, width: '100%', height: '100%',
        playerVars: { autoplay: 0, controls: 0, cc_load_policy: 0, playsinline: 1, loop: 1, playlist: LOGIN_CHRISTMAS_VIDEO, rel: 0, disablekb: 1, origin: window.location.origin },
        events: {
          onReady: event => {
            if (disposed) return;
            player.current = event.target;
            disableYoutubeCaptions(event.target);
            const frame = event.target.getIframe();
            frame.title = 'Darlene Love — Christmas (Baby Please Come Home)';
            frame.tabIndex = -1;
            event.target.setVolume(volumeRef.current); event.target.mute();
            if (clicked) startSound();
            else if (!reducedMotion) event.target.playVideo();
            else { paused.current = true; }
          },
          onStateChange: event => {
            if (disposed) return;
            if (event.data === 1) disableYoutubeCaptions(player.current);
            // Repeat only this track; never follow the linked YouTube radio playlist.
            if (event.data === 0 && !paused.current) player.current?.playVideo();
          },
          onApiChange: () => { if (!disposed) disableYoutubeCaptions(player.current); },
          onError: () => {
            if (disposed) return;
            instance?.destroy(); instance = null; player.current = null;
          },
          onAutoplayBlocked: () => {
            if (disposed) return;
            activated.current = false; player.current?.mute();
          },
        },
      });
      instance.getIframe().allow = 'autoplay; encrypted-media; picture-in-picture';
      instance.getIframe().referrerPolicy = 'strict-origin-when-cross-origin';
    }).catch(() => { /* Keep the static background and login usable if YouTube is unavailable. */ });
    return () => {
      disposed = true;
      document.removeEventListener('click', firstInteraction, true);
      document.removeEventListener('keydown', firstInteraction, true);
      player.current = null; instance?.destroy();
    };
  }, [startSound]);

  return <>
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <div ref={container} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: 'max(100vw, 177.78vh)', height: 'max(100vh, 56.25vw)' }} />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/45 via-slate-950/55 to-slate-950/80" />
    </div>
    <label className="fixed bottom-3 right-3 z-30 flex items-center gap-3 rounded-xl border border-white/15 bg-slate-950/85 px-4 py-3 text-xs text-white shadow-lg backdrop-blur-md">
      <span>Volume</span>
      <input aria-label="Volume de la musique" type="range" min="10" max="100" step="1" value={volume}
        className="w-28 accent-emerald-400 sm:w-36" onChange={event => {
          const requested = Number(event.target.value);
          const next = Number.isFinite(requested) ? Math.max(10, Math.min(100, requested)) : 10;
          volumeRef.current = next; setVolume(next); player.current?.setVolume(next);
          if (!activated.current) startSound();
        }} />
      <span className="w-9 text-right tabular-nums">{volume} %</span>
    </label>
  </>;
}

