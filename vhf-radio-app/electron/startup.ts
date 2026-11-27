import type { DesktopUpdateState } from './update-state';

/** Only a confirmed current version unlocks navigation. Downloads never unlock it. */
export class StartupGate {
  ready = false;
  private installing = false;
  constructor(private open: () => void, private install: () => void) {}
  update(state: DesktopUpdateState) {
    if (this.ready) return;
    if (state.status === 'up-to-date') { this.ready = true; this.open(); }
    else if (state.status === 'downloaded' && !this.installing) { this.installing = true; this.install(); }
    else if (state.status === 'error') this.installing = false;
  }
}

export const startupUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html>
<html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>Démarrage · WebLogbook</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(ellipse at top,#123343,#080d19 65%);color:#e7f4ff;font:16px system-ui;padding:24px}
main{max-width:460px;width:100%;padding:36px;border:1px solid #294352;border-radius:24px;background:#101c2dcc;box-shadow:0 24px 90px #0006}
.brand{color:#58e2bd;letter-spacing:3px;font-size:12px;font-weight:700}h1{font-size:28px;margin:16px 0}p{color:#acc0d2;line-height:1.6}progress{width:100%;height:9px;accent-color:#58e2bd}button{background:#19465b;color:white;border:1px solid #5bc9e7;border-radius:10px;padding:12px 20px;font:inherit;cursor:pointer}small{color:#89a0b4}
</style><main><div class="brand">WEBLOGBOOK · WINDOWS</div><h1>Préparation de l’application</h1>
<p id="status" role="status" aria-live="polite">Vérification de la version…</p><progress id="progress" max="100"></progress>
<p id="detail">La dernière version est nécessaire pour continuer.</p><button id="retry" hidden>Réessayer</button><p><small id="version"></small></p></main>
<script>
const api=window.electronAPI;
function render(s){if(!s)return;document.getElementById('version').textContent='Version installée : '+s.currentVersion;
const progress=document.getElementById('progress');const retry=document.getElementById('retry');retry.hidden=s.status!=='error';
if(s.status==='downloading')progress.value=s.percent||0;else progress.removeAttribute('value');
document.getElementById('status').textContent=({idle:'Vérification de la version…',checking:'Vérification de la version…',downloading:'Téléchargement de la version '+s.version+' · '+(s.percent||0)+' %',downloaded:'Installation et redémarrage…','up-to-date':'Application à jour. Ouverture…',error:'Impossible de terminer la mise à jour.'})[s.status];
document.getElementById('detail').textContent=s.status==='error'?'Vérifie ta connexion Internet, puis réessaie. La connexion au site reste bloquée.':'Si une mise à jour est disponible, elle sera installée automatiquement avant l’ouverture du site.';}
api.onUpdateState(render);api.getUpdateState().then(render);document.getElementById('retry').onclick=()=>api.checkForUpdate();
</script></html>`);
