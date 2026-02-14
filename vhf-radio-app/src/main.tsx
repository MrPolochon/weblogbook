import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Global error handler — shows errors on screen in case React fails to mount
window.onerror = (msg, src, line, col, err) => {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="padding:24px;color:#f87171;font-family:monospace;font-size:12px;white-space:pre-wrap;">
      <h2 style="color:#ef4444;margin-bottom:8px;">Erreur au démarrage</h2>
      <p>${msg}</p>
      <p style="color:#94a3b8;">${src}:${line}:${col}</p>
      <p style="color:#94a3b8;margin-top:8px;">${err?.stack || ''}</p>
    </div>`;
  }
};

window.addEventListener('unhandledrejection', (event) => {
  const root = document.getElementById('root');
  if (root && !root.hasChildNodes()) {
    root.innerHTML = `<div style="padding:24px;color:#f87171;font-family:monospace;font-size:12px;white-space:pre-wrap;">
      <h2 style="color:#ef4444;margin-bottom:8px;">Erreur async</h2>
      <p>${event.reason?.message || event.reason}</p>
      <p style="color:#94a3b8;margin-top:8px;">${event.reason?.stack || ''}</p>
    </div>`;
  }
});

try {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (err: unknown) {
  const root = document.getElementById('root');
  if (root) {
    const e = err as Error;
    root.innerHTML = `<div style="padding:24px;color:#f87171;font-family:monospace;font-size:12px;white-space:pre-wrap;">
      <h2 style="color:#ef4444;margin-bottom:8px;">Erreur fatale</h2>
      <p>${e.message}</p>
      <p style="color:#94a3b8;margin-top:8px;">${e.stack || ''}</p>
    </div>`;
  }
}
