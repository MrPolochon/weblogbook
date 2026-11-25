'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadYoutubePlayer, type YoutubePlayer } from '@/lib/youtube-player';

export const LOGIN_CHRISTMAS_VIDEO = 'vf4ZXBzbAio';

export default function LoginChristmasVideo() {
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<YoutubePlayer | null>(null);
  const activated = useRef(false);
  const paused = useRef(false);
  const sound = useRef(false);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(true);
  const [isPaused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);

  const startSound = useCallback(() => {
    const current = player.current;
    if (!current) return;
    activated.current = true; paused.current = false; sound.current = true;
    current.unMute(); current.playVideo(); setMuted(false); setPaused(false);
  }, []);

  useEffect(() => {
    let disposed = false, instance: YoutubePlayer | null = null;
    let clicked = false;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Login inputs keep their normal behavior. Later page clicks never toggle playback.
    const firstInteraction = (event: Event) => {
      if (!event.isTrusted || activated.current || (event.target instanceof Element && event.target.closest('[data-login-video-controls]'))) return;
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
        playerVars: { autoplay: 0, controls: 0, playsinline: 1, loop: 1, playlist: LOGIN_CHRISTMAS_VIDEO, rel: 0, disablekb: 1, origin: window.location.origin },
        events: {
          onReady: event => {
            if (disposed) return;
            player.current = event.target;
            const frame = event.target.getIframe();
            frame.title = 'Darlene Love — Christmas (Baby Please Come Home)';
            frame.tabIndex = -1;
            event.target.setVolume(35); event.target.mute(); setReady(true);
            if (clicked) startSound();
            else if (!reducedMotion) event.target.playVideo();
            else { paused.current = true; setPaused(true); }
          },
          onStateChange: event => {
            if (disposed) return;
            // Repeat only this track; never follow the linked YouTube radio playlist.
            if (event.data === 0 && !paused.current) player.current?.playVideo();
          },
          onError: () => {
            if (disposed) return;
            instance?.destroy(); instance = null; player.current = null; setFailed(true);
          },
          onAutoplayBlocked: () => {
            if (disposed) return;
            activated.current = false; sound.current = false; player.current?.mute(); setMuted(true);
          },
        },
      });
      instance.getIframe().allow = 'autoplay; encrypted-media; picture-in-picture';
      instance.getIframe().referrerPolicy = 'strict-origin-when-cross-origin';
    }).catch(() => { if (!disposed) setFailed(true); });
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
    <div data-login-video-controls className="fixed bottom-3 left-3 right-3 z-30 flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/15 bg-slate-950/85 px-3 py-2 text-xs text-white shadow-lg backdrop-blur-md sm:left-auto sm:max-w-md">
      {failed ? <span>Vidéo indisponible — la connexion reste accessible.</span> : <>
        <button type="button" disabled={!ready} className="rounded-lg px-3 py-2 hover:bg-white/10 disabled:opacity-60" onClick={() => {
          if (sound.current) { activated.current = true; sound.current = false; player.current?.mute(); setMuted(true); }
          else startSound();
        }}>{!ready ? 'Chargement de Noël…' : muted ? '♫ Activer le son' : '♫ Couper le son'}</button>
        <button type="button" disabled={!ready} className="rounded-lg px-3 py-2 hover:bg-white/10 disabled:opacity-60" onClick={() => {
          activated.current = true;
          paused.current = !paused.current; setPaused(paused.current);
          if (paused.current) player.current?.pauseVideo(); else player.current?.playVideo();
        }}>{isPaused ? 'Reprendre' : 'Pause'}</button>
      </>}
      <a href={`https://www.youtube.com/watch?v=${LOGIN_CHRISTMAS_VIDEO}`} target="_blank" rel="noopener noreferrer" className="rounded-lg px-2 py-2 text-slate-300 underline hover:text-white">YouTube</a>
    </div>
  </>;
}
