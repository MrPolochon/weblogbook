import type { CSSProperties } from 'react';

export default function HalloweenScene() {
  return <div className="login-scene" aria-hidden="true">
    <div className="login-scene-fog login-scene-fog-orange" />
    <div className="login-scene-fog login-scene-fog-purple" />
    <div className="login-scene-halo" />
    <div className="login-scene-moon" />
    {Array.from({ length: 18 }, (_, index) => <span key={index} className="login-scene-ember" style={{
      left: `${(index * 37 + 7) % 100}%`,
      '--ember-drift': `${(index % 2 ? 1 : -1) * (20 + index * 3)}px`,
      animationDuration: `${18 + index % 7 * 3}s`, animationDelay: `${-index * 2.7}s`,
    } as CSSProperties} />)}
  </div>;
}
