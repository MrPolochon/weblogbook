export interface YoutubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): void;
  setVolume(volume: number): void;
  destroy(): void;
  getIframe(): HTMLIFrameElement;
  getOptions?(): string[];
  unloadModule?(module: string): void;
}
export interface YoutubeApi {
  Player: new (element: HTMLElement, options: {
    videoId: string; host: string; width: string; height: string;
    playerVars: Record<string, string | number>;
    events: {
      onReady: (event: { target: YoutubePlayer }) => void;
      onStateChange: (event: { data: number }) => void;
      onError: () => void;
      onAutoplayBlocked: () => void;
      onApiChange?: () => void;
    };
  }) => YoutubePlayer;
}

/** Caption modules can load after ready or again when the video loops. */
export function disableYoutubeCaptions(player: YoutubePlayer | null) {
  try {
    if (player?.getOptions?.().includes('captions')) player.unloadModule?.('captions');
  } catch { /* Optional player capabilities must never interrupt playback. */ }
}
type YoutubeWindow = Window & { YT?: YoutubeApi; onYouTubeIframeAPIReady?: () => void };
let pending: Promise<YoutubeApi> | null = null;

export function loadYoutubePlayer(): Promise<YoutubeApi> {
  const host = window as YoutubeWindow;
  if (host.YT?.Player) return Promise.resolve(host.YT);
  if (pending) return pending;
  pending = new Promise<YoutubeApi>((resolve, reject) => {
    const script = document.createElement('script');
    const previous = host.onYouTubeIframeAPIReady;
    const finish = () => {
      clearTimeout(timeout);
      if (host.onYouTubeIframeAPIReady === ready) host.onYouTubeIframeAPIReady = previous;
    };
    const failed = () => { finish(); script.remove(); reject(new Error('YouTube unavailable')); };
    const ready = () => {
      finish();
      if (host.YT?.Player) resolve(host.YT); else reject(new Error('YouTube unavailable'));
      previous?.();
    };
    const timeout = setTimeout(failed, 20_000);
    host.onYouTubeIframeAPIReady = ready;
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = failed;
    document.head.appendChild(script);
  }).catch(error => { pending = null; throw error; });
  return pending;
}
