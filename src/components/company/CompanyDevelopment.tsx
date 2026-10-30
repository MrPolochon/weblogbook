'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Leaf, LockKeyhole, RefreshCw, ShieldQuestion, Sparkles, Wifi, Globe2 } from 'lucide-react';
import { fetchJson } from '@/lib/fetch-json';
import type { CompanyResearch } from '@/lib/company-research-tree';
import CompanyResearchTree from './CompanyResearchTree';
import CompanyItineraries from './CompanyItineraries';
import styles from './CompanyDevelopment.module.css';

type Research = CompanyResearch;
type Card = { id: string; catalog_id: string; title: string; description: string; cost: number; delay_seconds: number; research_id: string | null; target_label?: string; expires_month: string };
type Commitment = { id: string; title: string; cost: number; committed_at: string; active_at: string; status: 'installing' | 'active'; revenue_percent: number; signature: string; target_label?: string };
type ServiceSettings = { wifi_enabled: boolean; wifi_price: number; seat_ratio: number; ife_level: number; service_flags?: { restauration?: boolean; bagages?: boolean; correspondance?: boolean } };
type Agreement = { id: string; partner_id: string; partner_name: string; share_percent: number; status: 'proposed' | 'active' | 'rejected' | 'cancelled'; proposer_company_id: string; created_at: string };
type Dossier = { id: string; research_id: string; title: string; body: string; created_at: string };
type GlobalEvent = { title: string; description: string; starts_at: string; ends_at: string; effects: { revenue_percent?: number; fuel_percent?: number; repair_percent?: number; repair_delay_percent?: number; airport_tax_percent?: number; grounded?: boolean; inspection_required?: boolean; selector?: unknown } };
type Development = {
  can_manage: boolean;
  research?: Research[]; hand?: Card[]; commitments?: Commitment[];
  monthly?: { month: string; used: number; remaining: number; next_refill_at: string };
  global_event: GlobalEvent | null;
  services: { unlocks: string[]; settings: ServiceSettings; dossiers: Dossier[]; codeshares: Agreement[] };
};
type PendingAction = { kind: 'research' | 'commit' | 'discard'; id: string; title: string; cost?: number; delay?: number; target?: string; key: string };
const money = (value: number) => `${Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} F$`;
const percent = (value: number) => `${value > 0 ? '+' : ''}${Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
const utc = (value: string | null) => {
  if (!value || !Number.isFinite(Date.parse(value))) return 'À confirmer';
  return `${new Date(value).toLocaleString('fr-FR', { timeZone: 'UTC', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} UTC`;
};
function duration(seconds: number) {
  if (seconds <= 0) return 'Immédiat';
  if (seconds >= 86400 && seconds % 86400 === 0) return `${seconds / 86400} jour${seconds > 86400 ? 's' : ''}`;
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)} h${Math.ceil(seconds % 3600 / 60) ? ` ${Math.ceil(seconds % 3600 / 60)} min` : ''}`;
  return `${Math.ceil(seconds / 60)} min`;
}

export default function CompanyDevelopment({ compagnieId, canManage, section, onBalanceChange }: { compagnieId: string; canManage: boolean; section: string; onBalanceChange: () => void }) {
  const [data, setData] = useState<Development | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [settings, setSettings] = useState<ServiceSettings>({ wifi_enabled: false, wifi_price: 0, seat_ratio: 1, ife_level: 0 });
  const settingsInitialized = useRef(false);
  const confirmationRef = useRef<HTMLElement>(null);
  const refreshGeneration = useRef(0);
  const [partnerQuery, setPartnerQuery] = useState('');
  const [partners, setPartners] = useState<Array<{ id: string; name: string }>>([]);
  const [partnersError, setPartnersError] = useState('');
  const [partner, setPartner] = useState('');
  const [share, setShare] = useState('5');
  const [dossierResearch, setDossierResearch] = useState('');
  const [dossierTitle, setDossierTitle] = useState('');
  const [dossierBody, setDossierBody] = useState('');
  const endpoint = `/api/compagnies/${compagnieId}/developpement`;

  useEffect(() => {
    if (pending) {
      confirmationRef.current?.focus({ preventScroll: true });
      confirmationRef.current?.scrollIntoView({ block: 'center' });
    }
  }, [pending]);

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    const result = await fetchJson<Development>(endpoint, { cache: 'no-store' });
    if (generation !== refreshGeneration.current) return result;
    setData(result);
    if (!settingsInitialized.current && result.services?.settings) {
      setSettings(result.services.settings);
      settingsInitialized.current = true;
    }
    return result;
  }, [endpoint]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void refresh().catch(e => { if (active) setError(e instanceof Error ? e.message : 'Chargement impossible.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  const research = data?.research ?? [];
  const hand = data?.hand ?? [];
  const commitments = data?.commitments ?? [];
  const unlocks = data?.services?.unlocks ?? [];
  const manages = canManage && data?.can_manage === true;
  const has = (key: string) => unlocks.includes(key);
  const hasCodeshare = unlocks.includes('codeshare');
  const relevant = section === 'direction' || (canManage && ['recherche', 'rse', 'services'].includes(section));

  useEffect(() => {
    if (!relevant || !data || busy) return;
    const needsRefresh = (data.research ?? []).some(item => item.status === 'running') || (data.commitments ?? []).some(item => item.status === 'installing');
    if (!needsRefresh) return;
    const interval = window.setInterval(() => { void refresh().catch(() => {}); }, 60_000);
    return () => window.clearInterval(interval);
  }, [relevant, data, busy, refresh]);

  useEffect(() => {
    if (section !== 'services' || !hasCodeshare || !manages) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setPartnersError('');
      void fetchJson<{ partners: Array<{ id: string; name: string }> }>(`${endpoint}?partners=1&q=${encodeURIComponent(partnerQuery)}`, { signal: controller.signal })
        .then(result => setPartners(result.partners ?? []))
        .catch(e => { if (!controller.signal.aborted) setPartnersError(e instanceof Error ? e.message : 'Recherche indisponible.'); });
    }, 300);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [section, hasCodeshare, manages, endpoint, partnerQuery]);

  async function mutate(body: Record<string, unknown>, message: string) {
    if (busy || !manages) return false;
    setBusy(true); setError(''); setNotice('');
    try {
      await fetchJson(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setPending(null);
      setNotice(message);
      // La mutation a réussi même si la relecture réseau échoue : ne pas la rejouer.
      try { await refresh(); } catch { setError('Opération enregistrée. Actualisez pour consulter son résultat.'); }
      onBalanceChange();
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Enregistrement impossible.'); return false; }
    finally { setBusy(false); }
  }

  async function confirmAction() {
    if (!pending) return;
    if (pending.kind === 'research') await mutate({ action: 'research_start', research_id: pending.id, idempotency_key: pending.key }, 'Recherche financée. Son déploiement est en cours.');
    if (pending.kind === 'commit') await mutate({ action: 'card_commit', card_id: pending.id, idempotency_key: pending.key }, 'Action engagée. Son résultat est maintenant révélé ci-dessous.');
    if (pending.kind === 'discard') await mutate({ action: 'card_discard', card_id: pending.id }, 'Carte retirée de votre main.');
  }

  const choose = (kind: PendingAction['kind'], item: { id: string; title: string; cost?: number; delay_seconds?: number; target_label?: string }) => {
    setPending({ kind, id: item.id, title: item.title, cost: item.cost, delay: item.delay_seconds, target: item.target_label, key: crypto.randomUUID() });
    setNotice(''); setError('');
  };

  if (!relevant) return null;
  if (loading) return <div role="status" className={styles.state}><RefreshCw aria-hidden className="h-4 w-4 motion-safe:animate-spin" />Chargement du développement de la compagnie…</div>;
  if (!data) return <div role="alert" className={styles.state}><span>{error || 'Développement temporairement indisponible.'}</span><button type="button" onClick={() => { setLoading(true); void refresh().then(() => setError('')).catch(e => setError(e instanceof Error ? e.message : 'Chargement impossible.')).finally(() => setLoading(false)); }} className={styles.secondary}>Réessayer</button></div>;
  if (section !== 'direction' && !manages) return <p className={styles.state}>La gestion du développement est réservée à la direction de cette compagnie.</p>;

  const researchById = new Map(research.map(item => [item.id, item]));
  const dossierChoices = research.filter(item => item.status === 'completed' && item.panel);

  return <div id={section === 'direction' ? undefined : section} className={styles.development}>
    {section === 'direction' && data.global_event && <GlobalEventCard event={data.global_event} />}
    {section !== 'direction' && <>
      <header className={styles.heading}><div><p className={styles.eyebrow}>Développement de la compagnie</p><h2>{section === 'recherche' ? 'Recherche et innovation' : section === 'rse' ? 'Engagements RSE' : 'Services et contrats'}</h2><p>{section === 'recherche' ? 'Financez les prérequis, laissez les projets se déployer, puis exploitez leurs nouvelles possibilités.' : section === 'rse' ? 'Choisissez vos projets mensuels. Leur résultat se révèle après engagement et prend effet à la fin du déploiement.' : 'Configurez les services débloqués et formalisez vos accords avec les autres compagnies.'}</p></div><button type="button" disabled={busy} onClick={() => { setError(''); void refresh().catch(e => setError(e instanceof Error ? e.message : 'Actualisation impossible.')); }} className={styles.secondary}><RefreshCw aria-hidden className="h-4 w-4" />Actualiser</button></header>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.success}>{notice}</p>}
      {pending && <section ref={confirmationRef} tabIndex={-1} aria-label="Confirmer l’opération" className={styles.confirmation}>
        <h3>{pending.kind === 'discard' ? 'Retirer cette carte ?' : pending.kind === 'commit' ? 'Engager ce projet ?' : 'Financer cette recherche ?'}</h3><p className="font-medium text-slate-100">{pending.title}</p>{pending.target && <p>Cible : <strong>{pending.target}</strong></p>}
        {pending.kind !== 'discard' && <p>Débit immédiat : <strong>{money(pending.cost ?? 0)}</strong> · Déploiement : <strong>{duration(pending.delay ?? 0)}</strong>.</p>}
        <p>{pending.kind === 'commit' ? 'Le bonus ou malus et son pourcentage sont inconnus avant validation. Après déploiement, cet engagement affectera durablement les recettes des vols éligibles.' : pending.kind === 'discard' ? 'Cette carte sera retirée sans être engagée. La prochaine distribution suit le calendrier mensuel.' : 'Les prérequis et la trésorerie seront vérifiés lors de la validation. Les avantages se débloquent à la fin de la recherche.'}</p>
        <div className={styles.actions}><button type="button" disabled={busy} onClick={() => void confirmAction()} className={styles.primary}>{busy ? 'Enregistrement…' : pending.kind === 'discard' ? 'Retirer la carte' : 'Confirmer et financer'}</button><button type="button" disabled={busy} onClick={() => setPending(null)} className={styles.secondary}>Annuler</button></div>
      </section>}
    </>}

    {section === 'recherche' && <CompanyResearchTree research={research} busy={busy} onFinance={item=>choose('research',item)} onRefresh={()=>{void refresh().catch(e=>setError(e instanceof Error?e.message:'Actualisation impossible.'));}} />}

    {section === 'rse' && <>
      <div className={styles.monthly}><div><p className={styles.eyebrow}>Capacité mensuelle</p><strong>{data.monthly?.remaining ?? 0} action{data.monthly?.remaining === 1 ? '' : 's'} encore possible{data.monthly?.remaining === 1 ? '' : 's'}</strong><p>{data.monthly?.used ?? 0} engagée{data.monthly?.used === 1 ? '' : 's'} ce mois-ci</p></div><div><span>Prochaine distribution</span><p>{utc(data.monthly?.next_refill_at ?? null)}</p></div></div>
      <div className={styles.sectionTitle}><Leaf aria-hidden className="h-5 w-5" /><h3>Vos propositions</h3></div>
      {!hand.length && <p className={styles.empty}>Aucune carte dans votre main actuellement. La prochaine distribution complétera les possibilités selon les recherches acquises et votre capacité mensuelle.</p>}
      <div className={styles.cardGrid}>{hand.map(item => <article key={item.id} className={styles.card}><div className={styles.cardTop}><span className={styles.eyebrow}>Projet RSE</span><ShieldQuestion aria-label="Résultat révélé après engagement" className="h-5 w-5 text-violet-300" /></div><h3>{item.title}</h3><p>{item.description}</p><dl className={styles.facts}><div><dt>Coût immédiat</dt><dd>{money(item.cost)}</dd></div><div><dt>Activation après</dt><dd>{duration(item.delay_seconds)}</dd></div></dl>{item.research_id && <p className={styles.hint}>Issu de : {researchById.get(item.research_id)?.title ?? item.research_id}</p>}{item.target_label && <p className={styles.hint}>Cible : {item.target_label}</p>}<p className={styles.secret}>Bonus ou malus inconnu avant engagement.</p><div className={styles.actions}><button type="button" disabled={busy || (data.monthly?.remaining ?? 0) <= 0} onClick={() => choose('commit', item)} className={styles.primary}>Examiner l’engagement</button><button type="button" disabled={busy} onClick={() => choose('discard', item)} className={styles.secondary}>Écarter</button></div></article>)}</div>
      <div className={styles.sectionTitle}><Sparkles aria-hidden className="h-5 w-5" /><h3>Projets engagés</h3></div>
      {!commitments.length && <p className={styles.empty}>Vos engagements et leurs résultats apparaîtront ici après financement.</p>}
      <div className={styles.cardGrid}>{commitments.map(item => <article key={item.id} className={styles.card}><div className={styles.cardTop}><span className={styles.badge} data-status={item.status === 'active' ? 'completed' : 'running'}>{item.status === 'active' ? 'Actif · permanent' : 'En déploiement'}</span><strong className={item.revenue_percent < 0 ? 'text-rose-300' : item.revenue_percent > 0 ? 'text-emerald-300' : 'text-slate-300'}>{percent(item.revenue_percent)}</strong></div><h3>{item.title}</h3>{item.target_label && <p className={styles.hint}>Cible : {item.target_label}</p>}<p>Impact sur la recette totale des vols éligibles.</p><p className={styles.hint}>Investissement : {money(item.cost)} · {item.status === 'active' ? 'Activé le' : 'Activation le'} {utc(item.active_at)}</p></article>)}</div>
    </>}

    {section === 'services' && <>
      {data.global_event && <GlobalEventCard event={data.global_event} />}
      <CompanyItineraries compagnieId={compagnieId} canManage={manages} unlocked={has('correspondance')} />
      <form className={styles.card} onSubmit={event => { event.preventDefault(); void mutate({ action: 'settings', settings }, 'Configuration des services enregistrée.'); }}>
        <div className={styles.sectionTitle}><Wifi aria-hidden className="h-5 w-5" /><h3>Expérience à bord</h3></div><p>Les options deviennent configurables une fois leur recherche terminée.</p>
        <div className={styles.formGrid}>
          <fieldset disabled={!has('wifi') || busy}><legend>Connexion Wi-Fi</legend>{has('wifi') ? <><label className={styles.checkbox}><input type="checkbox" disabled={!has('wifi_metered') && !has('wifi_free')} checked={settings.wifi_enabled} onChange={e => setSettings({ ...settings, wifi_enabled: e.target.checked })} />Service disponible à bord</label><label>Prix par Mo (F$)<input type="number" min={has('wifi_free') || !settings.wifi_enabled ? 0 : 0.01} max={has('wifi_metered') ? 100 : 0} step="0.01" disabled={!has('wifi_metered') && !has('wifi_free')} value={settings.wifi_price} onChange={e => setSettings({ ...settings, wifi_price: Number(e.target.value) })} /></label><p className={styles.hint}>{has('wifi_free') ? 'La gratuité est disponible avec un prix de 0 F$/Mo.' : has('wifi_metered') ? 'La tarification à l’usage est débloquée.' : 'Recherchez une formule payante ou gratuite avant d’activer le service.'}</p></> : <Locked text="Débloquez la recherche Wi-Fi pour activer ce service." />}</fieldset>
          <fieldset disabled={!has('seats') || busy}><legend>Aménagement cabine</legend>{has('seats') ? <><label>Capacité conservée (%)<input type="number" min="70" max="100" step="1" value={Number((settings.seat_ratio * 100).toFixed(2))} onChange={e => setSettings({ ...settings, seat_ratio: Number(e.target.value) / 100 })} /></label><p className={styles.hint}>Une capacité réduite laisse davantage d’espace entre les sièges. Le remplissage reste calculé par le serveur.</p></> : <Locked text="Débloquez l’aménagement des sièges pour modifier la cabine." />}</fieldset>
          <fieldset disabled={!has('ife') || busy}><legend>Divertissement IFE</legend>{has('ife') ? <label>Programme à bord<select value={settings.ife_level} onChange={e => setSettings({ ...settings, ife_level: Number(e.target.value) })}><option value="0">Sans programme</option><option value="1">Catalogue standard</option>{has('ife_recent') && <option value="2">Nouveautés et contenus récents</option>}{has('ife_refresh') && <option value="3">Renouvellement régulier du catalogue</option>}</select></label> : <Locked text="Débloquez l’IFE pour proposer des programmes à bord." />}</fieldset>
          <fieldset disabled={busy}><legend>Services complémentaires</legend>{(['restauration', 'bagages', 'correspondance'] as const).map(key => <label key={key} className={styles.checkbox}><input type="checkbox" disabled={!has(key)} checked={settings.service_flags?.[key] ?? false} onChange={event => setSettings({ ...settings, service_flags: { ...settings.service_flags, [key]: event.target.checked } })} />{key === 'restauration' ? 'Restauration à bord' : key === 'bagages' ? 'Gestion des bagages' : 'Correspondances accompagnées'}{!has(key) && <LockKeyhole aria-label="Recherche requise" className="h-3.5 w-3.5 shrink-0 text-slate-500" />}</label>)}</fieldset>
        </div><button type="submit" disabled={busy || !['wifi', 'seats', 'ife', 'restauration', 'bagages', 'correspondance'].some(key => has(key))} className={styles.primary}>{busy ? 'Enregistrement…' : 'Enregistrer les services'}</button>
      </form>
      <section className={styles.card}><div className={styles.sectionTitle}><Globe2 aria-hidden className="h-5 w-5" /><h3>Accords de partage de code</h3></div>{!hasCodeshare ? <Locked text="La recherche d’agrément codeshare ouvre les contrats avec d’autres compagnies." /> : <>
        <p>La compagnie partenaire doit accepter l’accord pour qu’il devienne actif.</p>
        <form onSubmit={event => { event.preventDefault(); if (partner) void mutate({ action: 'codeshare_propose', partner_id: partner, share_percent: Number(share) }, 'Proposition de contrat transmise à la compagnie partenaire.'); }}>
          <div className={styles.formGrid}><label>Rechercher une compagnie<input type="search" value={partnerQuery} onChange={e => { setPartnerQuery(e.target.value); setPartner(''); }} placeholder="Nom de la compagnie" /></label><label>Compagnie partenaire<select required value={partner} onChange={e => setPartner(e.target.value)}><option value="">Choisir une compagnie</option>{partners.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Part contractuelle (%)<input required type="number" min="0" max="10" step="0.01" value={share} onChange={e => setShare(e.target.value)} /></label></div>
          {partnersError && <p role="alert" className={styles.error}>{partnersError}</p>}<button type="submit" disabled={busy || !partner} className={styles.primary}>Proposer l’accord</button>
        </form>
      </>}
        <div className={styles.list}>{(data.services?.codeshares ?? []).map(item => <article key={item.id}><div><h4>{item.partner_name}</h4><p>{percent(item.share_percent)} · {item.status === 'active' ? 'Accord actif' : item.status === 'proposed' ? 'En attente d’acceptation' : item.status === 'rejected' ? 'Refusé' : 'Annulé'}</p></div><div className={styles.actions}>
          {item.status === 'proposed' && item.proposer_company_id !== compagnieId && <><button type="button" disabled={busy || !hasCodeshare} onClick={() => void mutate({ action: 'codeshare_accept', agreement_id: item.id }, 'Accord de partage de code accepté.')} className={styles.secondary}>Accepter l’accord</button><button type="button" disabled={busy} onClick={() => void mutate({ action: 'codeshare_reject', agreement_id: item.id }, 'Proposition de contrat refusée.')} className={styles.secondary}>Refuser</button></>}
          {(item.status === 'active' || (item.status === 'proposed' && item.proposer_company_id === compagnieId)) && <button type="button" disabled={busy} onClick={() => { if (window.confirm('Mettre fin à cet accord de partage de code ?')) void mutate({ action: 'codeshare_cancel', agreement_id: item.id }, 'Accord de partage de code annulé.'); }} className={styles.secondary}>{item.status === 'active' ? 'Résilier l’accord' : 'Retirer la proposition'}</button>}
        </div></article>)}</div>
      </section>
      <section className={styles.card}><h3>Dossiers de mise en œuvre</h3><p>Documentez les services et procédures ouverts par vos recherches.</p>{dossierChoices.length > 0 ? <form onSubmit={event => { event.preventDefault(); void mutate({ action: 'dossier', research_id: dossierResearch, title: dossierTitle, body: dossierBody, data: {} }, 'Dossier enregistré.').then(ok => { if (ok) { setDossierTitle(''); setDossierBody(''); } }); }}><div className={styles.formGrid}><label>Recherche concernée<select required value={dossierResearch} onChange={e => setDossierResearch(e.target.value)}><option value="">Choisir un service débloqué</option>{dossierChoices.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>Titre du dossier<input required maxLength={150} value={dossierTitle} onChange={e => setDossierTitle(e.target.value)} /></label></div><label>Procédure ou engagement<textarea required maxLength={8000} rows={4} value={dossierBody} onChange={e => setDossierBody(e.target.value)} /></label><button type="submit" disabled={busy} className={styles.primary}>Enregistrer le dossier</button></form> : <Locked text="Les recherches ouvrant un nouveau panneau permettent de créer ses dossiers de mise en œuvre." />}
        <div className={styles.list}>{(data.services?.dossiers ?? []).map(item => <details key={item.id}><summary>{item.title}<span>{utc(item.created_at)}</span></summary><p className="whitespace-pre-wrap">{item.body}</p></details>)}</div>
      </section>
    </>}
  </div>;
}

function Locked({ text }: { text: string }) { return <p className={styles.locked}><LockKeyhole aria-hidden className="h-4 w-4 shrink-0" />{text}</p>; }
function GlobalEventCard({ event }: { event: GlobalEvent }) {
  const effects = event.effects ?? {};
  const lines: string[] = [];
  if (effects.revenue_percent) lines.push(`Recettes des vols : ${percent(effects.revenue_percent)}`);
  if (effects.fuel_percent) lines.push(`Carburant : ${percent(effects.fuel_percent)}`);
  if (effects.repair_percent) lines.push(`Réparations : ${percent(effects.repair_percent)}`);
  if (effects.repair_delay_percent) lines.push(`Délais de réparation : ${percent(effects.repair_delay_percent)}`);
  if (effects.airport_tax_percent) lines.push(`Taxes aéroportuaires : ${percent(effects.airport_tax_percent)}`);
  if (effects.grounded) lines.push('Immobilisation des appareils concernés');
  if (effects.inspection_required) lines.push('Passage en maintenance obligatoire pour les appareils concernés');
  return <aside className={styles.event}><div className={styles.cardTop}><span className={styles.eyebrow}>Aléa commun au réseau</span><span className={styles.hint}>Jusqu’au {utc(event.ends_at)}</span></div><h3>{event.title}</h3><p>{event.description}</p>{lines.length > 0 && <ul>{lines.map(line => <li key={line}>{line}</li>)}</ul>}</aside>;
}
