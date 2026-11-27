'use client';

import { useEffect, useRef, useState } from 'react';

// One playback loop shared by pilot and controller views in this tab.
const consumers = new Set<symbol>();
const listeners = new Set<(value: boolean) => void>();
let player: HTMLAudioElement | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let lockRequest: AbortController | null = null;
let releaseLock: (() => void) | null = null;
let ownsLock = false;
let blocked = false;
function publish(value: boolean) { blocked = value; listeners.forEach(listener => listener(value)); }
function stopPlayback() {
  if (timer) clearInterval(timer);
  timer = null;
  player?.pause();
}
function releaseOwnership() {
  const release = releaseLock;
  releaseLock = null;
  ownsLock = false;
  lockRequest = null;
  release?.();
}
async function play() {
  if (!consumers.size || (typeof navigator !== 'undefined' && navigator.locks && !ownsLock)) return;
  const ownerRequest = lockRequest;
  player ??= new Audio('/audio/cpdlc-message.mp3');
  player.currentTime = 0;
  try { await player.play(); if (consumers.size && (!navigator.locks || (ownsLock && lockRequest === ownerRequest))) publish(false); }
  catch {
    if (!consumers.size || (navigator.locks && (!ownsLock || lockRequest !== ownerRequest))) return;
    publish(true);
    // An autoplay-blocked background tab must not silence an interactive tab.
    // Release the lock and wait for a local user gesture before competing again.
    if (ownsLock) { stopPlayback(); releaseOwnership(); }
  }
}
function sync() {
  if (!consumers.size) {
    lockRequest?.abort();
    releaseOwnership();
    stopPlayback(); publish(false); return;
  }
  if (navigator.locks) {
    if (lockRequest) return;
    const controller = new AbortController();
    lockRequest = controller;
    // A waiting tab takes over automatically when the sounding tab closes or
    // acknowledges its messages. Browsers without Web Locks still share one
    // loop per tab, never one loop per message/component.
    void navigator.locks.request('weblogbook-cpdlc-reception-audio', { signal: controller.signal }, async () => {
      if (controller.signal.aborted || !consumers.size) return;
      ownsLock = true;
      await new Promise<void>(resolve => {
        releaseLock = resolve;
        void play(); timer = setInterval(() => void play(), 3000);
      });
    }).catch(() => { /* A queued request is cancelled when messages are read. */ })
      .finally(() => { if (lockRequest === controller) releaseOwnership(); });
  } else if (!timer) { void play(); timer = setInterval(() => void play(), 3000); }
}
async function enable() {
  if (navigator.locks && !ownsLock) { sync(); return; }
  await play();
}
export function useCpdlcAlarm(active: boolean) {
  const id = useRef(Symbol('cpdlc-alarm'));
  const [audioBlocked, setAudioBlocked] = useState(blocked);
  useEffect(() => { listeners.add(setAudioBlocked); return () => { listeners.delete(setAudioBlocked); }; }, []);
  useEffect(() => {
    const key = id.current;
    if (active) consumers.add(key); else consumers.delete(key);
    sync();
    const unlock = () => { if (blocked) void enable(); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => { consumers.delete(key); sync(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, [active]);
  return { blocked: audioBlocked, enable };
}
