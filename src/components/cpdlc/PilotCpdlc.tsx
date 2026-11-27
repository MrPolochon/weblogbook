'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useCpdlc } from '@/hooks/useCpdlc';
import { useCpdlcAlarm } from './useCpdlcAlarm';
import type { CpdlcCommand, CpdlcInit } from '@/lib/cpdlc/types';
import styles from './pilot.module.css';
import { validateInit } from '@/lib/cpdlc/policy';

type Page = 'MENU' | 'INIT' | 'WX' | 'ATIS' | 'FREE' | 'RECEIVED' | 'SENT';
const emptyInit: CpdlcInit = { flight_no: '', dep: '', dest: '', altn: '', ete: '', utc: '', date: '' };
const upper = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const time = (value: string) => new Date(value).toISOString().slice(11, 16).replace(':', '') + 'Z';
function pagesFor(body: string): string[] {
  const lines: string[] = [];
  for (const paragraph of upper(body).split('\n')) {
    if (!paragraph) { lines.push(''); continue; }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (line && line.length + word.length + 1 > 34) { lines.push(line); line = ''; }
      let rest = word;
      while (rest.length > 34) { if (line) { lines.push(line); line = ''; } lines.push(rest.slice(0, 34)); rest = rest.slice(34); }
      line += (line ? ' ' : '') + rest;
    }
    if (line) lines.push(line);
  }
  const pages: string[] = [];
  for (let index = 0; index < lines.length; index += 7) pages.push(lines.slice(index, index + 7).join('\n'));
  return pages.length ? pages : [''];
}

function printMessage(header: string, body: string) {
  const frame = document.createElement('iframe');
  frame.title = 'CPDLC message printout';
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', width: '1px', height: '1px', left: '-9999px', border: '0' });
  frame.onload = () => {
    const printWindow = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!doc || !printWindow) { frame.remove(); return; }
    doc.title = 'CPDLC MESSAGE';
    const text = doc.createElement('pre');
    text.textContent = upper(`${header}\n\n${body}`);
    Object.assign(text.style, { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: '14px/1.6 monospace', margin: '24px' });
    doc.body.appendChild(text);
    printWindow.addEventListener('afterprint', () => frame.remove(), { once: true });
    printWindow.focus();
    printWindow.print();
    // Some browsers do not emit afterprint for an iframe.
    window.setTimeout(() => frame.remove(), 60000);
  };
  document.body.appendChild(frame);
}

export default function PilotCpdlc({ planId }: { planId: string }) {
  const { data, error, loading, busy, act } = useCpdlc(planId);
  const messages = data?.messages ?? [];
  const unread = messages.filter(message => message.incoming && !message.acknowledged);
  const alarm = useCpdlcAlarm(unread.length > 0);
  const [selected, setSelected] = useState<string | null>(null);
  const [messagePage, setMessagePage] = useState(0);
  const [brightness, setBrightness] = useState(1);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<Page>('MENU');
  const [init, setInit] = useState<CpdlcInit>(emptyInit);
  const [airports, setAirports] = useState(['', '', '', '']);
  const [wxType, setWxType] = useState<'METAR' | 'TAF'>('METAR');
  const [atisAirport, setAtisAirport] = useState('');
  const [to, setTo] = useState('');
  const [freeText, setFreeText] = useState('');
  const [scratch, setScratch] = useState('');
  const [target, setTarget] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<{ command: CpdlcCommand; body: string; success: string } | null>(null);
  const [historyPage, setHistoryPage] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const scratchInput = useRef<HTMLInputElement>(null);
  const newestSeen = useRef<string | null>(null);
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const island = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const message = messages.find(item => item.id === selected) ?? messages[0];
  const messageIndex = message ? messages.findIndex(item => item.id === message.id) : -1;
  const messagePages = useMemo(() => pagesFor(message?.body || ''), [message?.body]);
  const unavailable = !data?.available;

  useEffect(() => {
    const newest = unread[0];
    if (newest && newest.id !== newestSeen.current) { newestSeen.current = newest.id; setSelected(newest.id); setMessagePage(0); }
  }, [unread]);
  useEffect(() => { setMessagePage(0); }, [message?.id]);
  const close = useCallback(() => { setOpen(false); trigger.current?.focus(); }, []);
  const clamp = useCallback((x: number, y: number) => ({
    x: Math.max(8, Math.min(x, window.innerWidth - (island.current?.offsetWidth || Math.min(480, window.innerWidth - 16)) - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - Math.min(island.current?.offsetHeight || 560, window.innerHeight - 16) - 8)),
  }), []);
  useEffect(() => {
    if (!open) return;
    setPosition(previous => clamp(previous.x, previous.y));
    const resize = () => setPosition(previous => clamp(previous.x, previous.y));
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(); } };
    window.addEventListener('resize', resize); window.addEventListener('keydown', key);
    const observer = new ResizeObserver(resize);
    if (island.current) observer.observe(island.current);
    scratchInput.current?.focus();
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); window.removeEventListener('keydown', key); };
  }, [open, close, clamp]);
  const navigate = (next: Page) => { setPage(next); setTarget(''); setScratch(''); setNotice(''); setHistoryPage(0); };
  const execute = async (command: CpdlcCommand, success = 'MESSAGE SENT') => {
    setNotice('');
    if (command.action !== 'ack') {
      if (draft) { setNotice('SEND OR CANCEL THE CURRENT DCDU DRAFT FIRST'); return; }
      try {
        let body = '';
        if (command.action === 'clearance') {
          const fields = validateInit(command.init);
          command = { ...command, init: fields };
          body = 'CLEARANCE REQUEST\n' + Object.entries(fields).filter(([, value]) => value).map(([key, value]) => `${key.replace('flight_no', 'FLT NO').toUpperCase()} ${value}`).join('\n');
        } else if (command.action === 'weather') body = `${command.wx_type} REQUEST\nFROM ${command.flight_no}\nAIRPORTS ${command.airports.join(' ')}`;
        else if (command.action === 'atis') body = `ATIS REQUEST\nFROM ${command.flight_no}\nFOR ${command.airport}`;
        else if (command.action === 'free_text') body = `TO ${command.to}\n${command.text}`;
        else if (command.action === 'respond') body = `${command.response}\nIN REPLY TO ${message?.from_station || ''}`;
        setDraft({ command, body: upper(body), success }); setOpen(false);
        setNotice('REVIEW ON DCDU - SEND OR CANCEL');
      } catch (reason) { setNotice(upper(reason instanceof Error ? reason.message : 'INVALID FORMAT')); }
      return;
    }
    try { await act(command); setNotice(success); } catch (reason) { setNotice(upper(reason instanceof Error ? reason.message : 'TRANSMISSION FAILED')); }
  };
  const sendDraft = async () => {
    if (!draft || busy) return;
    try { await act(draft.command); setNotice(draft.success); setDraft(null); }
    catch (reason) { setNotice(upper(reason instanceof Error ? reason.message : 'TRANSMISSION FAILED')); }
  };
  const submit = async () => {
    const client_request_id = crypto.randomUUID();
    if (page === 'INIT') return execute({ action: 'clearance', plan_id: planId, init, client_request_id });
    if (page === 'WX') return execute({ action: 'weather', plan_id: planId, flight_no: init.flight_no, airports: airports.filter(Boolean), wx_type: wxType, client_request_id });
    if (page === 'ATIS') return execute({ action: 'atis', plan_id: planId, flight_no: init.flight_no, airport: atisAirport, client_request_id });
    if (page === 'FREE') return execute({ action: 'free_text', plan_id: planId, flight_no: init.flight_no, to, text: freeText, client_request_id });
  };
  const put = (key: string, value: string) => {
    const text = upper(value).trim();
    if (key.startsWith('init.')) setInit(previous => ({ ...previous, [key.slice(5)]: text }));
    else if (key.startsWith('wx.')) setAirports(previous => previous.map((old, index) => index === Number(key.slice(3)) ? text : old));
    else if (key === 'airport') setAtisAirport(text);
    else if (key === 'to') setTo(text);
    else if (key === 'text') setFreeText(text);
  };
  const selectField = (key: string, value: string) => {
    setTarget(key);
    if (scratch) { put(key, scratch); setScratch(''); }
    else setScratch(value);
    scratchInput.current?.focus();
  };
  const insert = () => { if (target) { put(target, scratch); setScratch(''); setTarget(''); } else setNotice('SELECT A FIELD WITH A LINE KEY'); };
  const field = (label: string, key: string, value: string, hint = '[          ]') => <button type="button" key={key} className={`${styles.field} ${target === key ? styles.fieldSelected : ''}`} onClick={() => selectField(key, value)} aria-label={`${label}: ${value || 'EMPTY'}`}><span>{label}</span><strong>{value || hint}</strong></button>;
  const flightField = field('FLT NO', 'init.flight_no', init.flight_no);
  const history = messages.filter(item => page === 'RECEIVED' ? item.incoming : !item.incoming);
  const historyPages = Math.max(1, Math.ceil(history.length / 5));
  const response = (reply: 'WILCO' | 'UNABLE' | 'STANDBY' | 'ROGER') => {
    if (message) void execute({ action: 'respond', plan_id: planId, message_id: message.id, response: reply, client_request_id: crypto.randomUUID() }, `${reply} SENT`);
  };
  const dragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, left: position.x, top: position.y };
  };

  return <section className={styles.root} aria-label="CPDLC datalink">
    <div className={styles.sectionHeader}><div><span className={styles.eyebrow}>DATALINK COMMUNICATIONS</span><h2>DCDU <span>{data?.station || 'NOT CONNECTED'}</span></h2></div><button ref={trigger} type="button" className={styles.openButton} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(value => !value)}>MCDU {open ? '−' : '+'}</button></div>
    {alarm.blocked && <button className={styles.audioWarning} type="button" onClick={() => void alarm.enable()}>ENABLE MESSAGE SOUND — {unread.length} UNACKNOWLEDGED</button>}
    {draft && <div className={styles.dcduScreen} aria-label="DCDU outgoing preview"><div className={styles.messageMeta}>OUTGOING MESSAGE — NOT SENT</div><pre className={styles.messageBody}>{draft.body}</pre><div className={styles.dcduActions}><button type="button" disabled={busy} onClick={() => { setDraft(null); setNotice('MESSAGE CANCELLED'); }}>CANCEL*</button><button type="button" disabled={busy || unavailable} onClick={() => void sendDraft()}>{busy ? 'SENDING…' : 'SEND*'}</button></div></div>}<div className={styles.dcdu} hidden={Boolean(draft)} style={draft ? { display: 'none' } : undefined}>
      <div className={styles.hardwareColumn}><span className={styles.screw}>✕</span><button type="button" aria-label="Increase DCDU brightness" onClick={() => setBrightness(value => Math.min(1, value + .1))}>BRT</button><button type="button" aria-label="Decrease DCDU brightness" onClick={() => setBrightness(value => Math.max(.5, value - .1))}>DIM</button><button type="button" disabled={messageIndex <= 0} onClick={() => setSelected(messages[messageIndex - 1]?.id)}>MSG−</button><button type="button" disabled={messageIndex < 0 || messageIndex >= messages.length - 1} onClick={() => setSelected(messages[messageIndex + 1]?.id)}>MSG+</button><span className={styles.screw}>✕</span></div>
      <div className={styles.dcduScreen} style={{ filter: `brightness(${brightness})` }}>
        <div className={styles.messageMeta}><span>{message ? `${time(message.created_at)} ${message.incoming ? 'FROM' : 'TO'} ${message.incoming ? message.from_station : message.to_station}` : 'CPDLC'}</span><span>{message?.status.replace('_', ' ') || (loading ? 'CONNECTING' : 'READY')}</span></div>
        {message?.late && <div className={styles.late}>LATE RESPONSE</div>}
        <pre className={styles.messageBody}>{message ? messagePages[Math.min(messagePage, messagePages.length - 1)] : error ? 'DATALINK UNAVAILABLE\nRETRYING CONNECTION' : 'NO MESSAGES\n\nOPEN MCDU TO SEND A REQUEST'}</pre>
        <div className={styles.pageCounter}>{message ? `${messageIndex + 1}/${messages.length} MSG · ${messagePage + 1}/${messagePages.length} PGE` : 'AOC DATALINK'}{unread.length > 0 && <span>{unread.length} NEW</span>}</div>
        <div className={styles.dcduActions}>
          {message?.incoming && !message.acknowledged ? <button type="button" disabled={busy} onClick={() => void execute({ action: 'ack', plan_id: planId, message_id: message.id }, 'MESSAGE ACKNOWLEDGED')}>ACK*</button> : <span>{message?.incoming ? 'ACKNOWLEDGED' : 'SENT'}</span>}
          {message?.incoming && message.acknowledged && message.response_required && !['WILCO', 'UNABLE', 'ROGER', 'REFUSED'].includes(message.status) && <div className={styles.responses}>{(['WILCO', 'UNABLE', 'STANDBY'] as const).map(reply => <button type="button" disabled={busy} key={reply} onClick={() => response(reply)}>{reply}</button>)}</div>}
          {message?.incoming && message.acknowledged && message.kind === 'FREE_TEXT' && !message.response_required && message.status !== 'ROGER' && <button type="button" disabled={busy} onClick={() => response('ROGER')}>ROGER*</button>}
        </div>
      </div>
      <div className={styles.hardwareColumn}><span className={styles.screw}>✕</span><button type="button" aria-label="Print current message" disabled={!message} onClick={() => message && printMessage(`${time(message.created_at)} FROM ${message.from_station} TO ${message.to_station}`, message.body)}>PRINT</button><button type="button" disabled={messagePage === 0} onClick={() => setMessagePage(value => value - 1)}>PGE−</button><button type="button" disabled={messagePage >= messagePages.length - 1} onClick={() => setMessagePage(value => value + 1)}>PGE+</button><button type="button" aria-label="Acknowledge current message" disabled={!message?.incoming || message.acknowledged || busy} onClick={() => message && void execute({ action: 'ack', plan_id: planId, message_id: message.id }, 'MESSAGE ACKNOWLEDGED')}>—</button><span className={styles.screw}>✕</span></div>
    </div>
    {(error || notice) && <p className={styles.notice} role="status">{upper(notice || error)}</p>}
    {open && typeof document !== 'undefined' && createPortal(<div ref={island} role="dialog" aria-label="AOC MCDU" className={styles.island} style={{ left: position.x, top: position.y }}>
      <div className={styles.dragHandle} onPointerDown={dragStart} onPointerMove={event => { if (drag.current) setPosition(clamp(drag.current.left + event.clientX - drag.current.x, drag.current.top + event.clientY - drag.current.y)); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <span>⠿ AOC MCDU <small>DRAG TO MOVE</small></span><button type="button" onClick={close} aria-label="Close MCDU">✕</button>
      </div>
      <div className={styles.mcduBody}>
        <div className={styles.mcduScreen}>
          <h3>{({ MENU: 'AOC MENU', INIT: 'AOC FLT INIT', WX: 'AOC WEATHER REQUEST', ATIS: 'AOC ATIS REQUEST', FREE: 'AOC FREE TEXT', RECEIVED: 'RECEIVED MESSAGES', SENT: 'SENT MESSAGES' })[page]}</h3>
          {page === 'MENU' ? <div className={styles.menuGrid}>
            <button onClick={() => navigate('INIT')}>〈INIT/PRES</button><button onClick={() => navigate('FREE')}>FREE TEXT〉</button>
            <button onClick={() => navigate('WX')}>〈WX REQUEST</button><button onClick={() => navigate('RECEIVED')}>RECEIVED<br />MESSAGES〉</button>
            <button onClick={() => navigate('ATIS')}>〈ATIS</button><button onClick={() => navigate('SENT')}>SENT<br />MESSAGES〉</button>
            <span className={styles.inactive}>〈W/B</span><span className={styles.inactive}>DIVERSION〉</span>
            <span className={styles.inactive}>ATSU DLK</span><span className={styles.inactive}>MISC〉</span>
          </div> : page === 'INIT' ? <div className={styles.fieldsGrid}>
            {flightField}{field('UTC', 'init.utc', init.utc, 'HHMM')}
            {field('DEP', 'init.dep', init.dep)}{field('DATE', 'init.date', init.date, 'DD/MM/YYYY')}
            {field('DEST', 'init.dest', init.dest)}<span />
            {field('ALTN', 'init.altn', init.altn)}<span />
            {field('ETE', 'init.ete', init.ete, 'HHMM')}<span />
          </div> : page === 'WX' ? <div className={styles.fieldsGrid}>
            {flightField}<button type="button" className={styles.field} onClick={() => setWxType(value => value === 'METAR' ? 'TAF' : 'METAR')}><span>WX TYPE</span><strong>↓{wxType}</strong></button>
            {airports.map((airport, index) => field(`AIRPORT ${index + 1}`, `wx.${index}`, airport, '[    ]'))}
          </div> : page === 'ATIS' ? <div className={styles.fieldsGrid}>{flightField}{field('AIRPORT', 'airport', atisAirport)}<p className={styles.screenHelp}>REQUEST THE CURRENT PUBLISHED ATIS.</p></div> : page === 'FREE' ? <div className={styles.fieldsGrid}>{flightField}{field('TO STATION', 'to', to)}<div className={styles.fullWidth}>{field('MESSAGE', 'text', freeText, '[ FREE TEXT ]')}</div><p className={styles.screenHelp}>ENTER AN AIRPORT OR FLIGHT NUMBER.</p></div> : <div className={styles.history}>
            {history.length === 0 && <p>NO MESSAGES</p>}
            {history.slice(historyPage * 5, historyPage * 5 + 5).map(item => <button type="button" key={item.id} onClick={() => { setSelected(item.id); setMessagePage(0); setNotice('MESSAGE SELECTED ON DCDU'); }}><span>{time(item.created_at)} {item.incoming ? item.from_station : item.to_station}</span><strong>{item.kind.replace('_', ' ')}{item.incoming && !item.acknowledged ? ' *' : ''}</strong></button>)}
            <div className={styles.historyPages}><button type="button" disabled={!historyPage} onClick={() => setHistoryPage(value => value - 1)}>←</button><span>{historyPage + 1}/{historyPages}</span><button type="button" disabled={historyPage + 1 >= historyPages} onClick={() => setHistoryPage(value => value + 1)}>→</button></div>
          </div>}
          <div className={styles.screenFooter}>{page !== 'MENU' ? <button type="button" onClick={() => navigate('MENU')}>〈AOC MENU</button> : <span className={styles.connected}>{unavailable ? 'DATALINK UNAVAILABLE' : 'DATALINK READY'}</span>}{['INIT', 'WX', 'ATIS', 'FREE'].includes(page) && <button type="button" disabled={busy || unavailable} onClick={() => void submit()}>{busy ? 'SENDING…' : page === 'INIT' ? 'INIT DATA REQ*' : 'SEND*'}</button>}</div>
          <p className={styles.mcduNotice} role="status">{upper(notice || error || (target ? `EDIT ${target.replace('init.', '').replace('wx.', 'AIRPORT ')}` : ''))}</p>
          <input ref={scratchInput} className={styles.scratchpad} aria-label="MCDU scratchpad" value={scratch} maxLength={1500} autoComplete="off" spellCheck={false} onChange={event => setScratch(upper(event.target.value))} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); close(); } else if (event.key === 'Enter') { event.preventDefault(); insert(); } }} placeholder="[ SCRATCHPAD ]" />
        </div>
        <div className={styles.functionKeys}><button type="button" onClick={() => navigate('MENU')}>AOC<br />MENU</button><button type="button" onClick={() => navigate('RECEIVED')}>RECEIVED<br />MSG</button><button type="button" onClick={() => navigate('SENT')}>SENT<br />MSG</button><button type="button" onClick={insert}>INSERT</button></div>
        <div className={styles.keypad}>{'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789./-'.split('').map(key => <button type="button" key={key} onClick={() => setScratch(value => (value + key).slice(0, 1500))}>{key}</button>)}<button type="button" onClick={() => setScratch(value => (value + ' ').slice(0, 1500))}>SP</button><button type="button" onClick={() => setScratch(value => value.slice(0, -1))}>⌫</button><button type="button" onClick={() => { if (target) put(target, ''); setScratch(''); }}>CLR</button></div>
        <p className={styles.instructions}>TYPE INTO THE SCRATCHPAD, THEN PRESS A FIELD LINE KEY. SELECT AN EXISTING FIELD TO EDIT IT, THEN INSERT.</p>
      </div>
    </div>, document.body)}
  </section>;
}
