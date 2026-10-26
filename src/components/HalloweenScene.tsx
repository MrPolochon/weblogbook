'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { halloweenCalendar, untilNextUtcDay } from '@/lib/halloween-calendar';

export default function HalloweenScene() {
  const [calendar, setCalendar] = useState({ stage: 0, finale: false, decorations: 0 });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const now = new Date();
      setCalendar(halloweenCalendar(now));
      timer = setTimeout(refresh, untilNextUtcDay(now) + 50);
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return <div className="login-scene" data-halloween-stage={calendar.stage} data-halloween-finale={calendar.finale} aria-hidden="true">
    <div className="login-halloween-night" />
    <div className="login-scene-fog login-scene-fog-orange" />
    <div className="login-scene-fog login-scene-fog-purple" />
    <div className="login-scene-halo" />
    <div className="login-scene-moon" />
    {Array.from({ length: calendar.decorations }, (_, index) => {
      const side = index % 2 ? 'right' : 'left';
      const kind = (['pumpkin', 'bat', 'ghost', 'candle', 'web', 'pumpkin'] as const)[Math.floor(index / 2) % 6];
      return <span key={`decoration-${index}`} className={`login-halloween-object login-halloween-${kind}`} style={{
        [side]: `${2 + (index * 7 % 20)}%`, top: `${8 + (index * 19 % 81)}%`,
        '--decoration-delay': `${-index * 1.7}s`, '--decoration-scale': .7 + (index % 4) * .16,
      } as CSSProperties}>
        {kind === 'bat' ? <svg viewBox="0 0 100 50" fill="currentColor"><path d="M50 22 43 10 40 20Q22 0 0 8Q12 17 8 32Q23 23 30 41Q40 28 50 48Q60 28 70 41Q77 23 92 32Q88 17 100 8Q78 0 60 20L57 10Z" /></svg> : kind === 'web' ? <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1"><path d="M50 0V100M0 50H100M15 15 85 85M15 85 85 15M50 10 78 22 90 50 78 78 50 90 22 78 10 50 22 22ZM50 28 66 34 72 50 66 66 50 72 34 66 28 50 34 34Z" /></svg> : { pumpkin: '🎃', ghost: '👻', candle: '🕯️' }[kind]}
      </span>;
    })}
    {calendar.finale && <>
      <div className="login-halloween-greeting"><span>Happy</span><strong>Halloween</strong><small>31 OCTOBRE · LA NUIT DES CITROUILLES</small></div>
      <div className="login-halloween-horizon" />
      {Array.from({ length: 6 }, (_, burst) => <div key={burst} className="login-halloween-firework" style={{
        left: `${burst % 2 ? 82 + burst % 3 * 4 : 8 + burst % 3 * 4}%`, top: `${15 + burst % 3 * 27}%`,
        '--burst-delay': `${burst * -1.3}s`, '--burst-color': burst % 2 ? '#d8b4fe' : '#fdba74',
      } as CSSProperties}>{Array.from({ length: 12 }, (_, spark) => <i key={spark} style={{ '--spark-angle': `${spark * 30}deg` } as CSSProperties} />)}</div>)}
    </>}
    {Array.from({ length: 72 }, (_, index) => <span key={index} className={`login-scene-ember${index >= 36 ? " login-scene-ember-drop" : ""}`} style={{
      left: `${(index * 37 + 7) % 100}%`,
      '--ember-drift': `${(index % 2 ? 1 : -1) * (20 + index * 3)}px`,
      '--ember-duration': `${11 + index % 7 * 1.5}s`, animationDelay: `${-index * 2.7}s`,
    } as CSSProperties} />)}
  </div>;
}
