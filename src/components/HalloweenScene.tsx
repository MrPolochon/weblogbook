import type { CSSProperties } from 'react';

export default function HalloweenScene() {
  return <div className="login-scene" aria-hidden="true">
    <div className="login-scene-fog login-scene-fog-orange" />
    <div className="login-scene-fog login-scene-fog-purple" />
    <div className="login-scene-halo" />
    <div className="login-scene-moon" />
    {Array.from({ length: 72 }, (_, index) => <span key={index} className={`login-scene-ember${index >= 36 ? " login-scene-ember-drop" : ""}`} style={{
      left: `${(index * 37 + 7) % 100}%`,
      '--ember-drift': `${(index % 2 ? 1 : -1) * (20 + index * 3)}px`,
      '--ember-duration': `${11 + index % 7 * 1.5}s`, animationDelay: `${-index * 2.7}s`,
    } as CSSProperties} />)}
  </div>;
}
