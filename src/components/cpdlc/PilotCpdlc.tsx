'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useCpdlc } from '@/hooks/useCpdlc';
import { useCpdlcAlarm } from './useCpdlcAlarm';
import type { CpdlcCommand, CpdlcInit } from '@/lib/cpdlc/types';
import styles from './pilot.module.css';
import { departureRequestText, validateInit } from '@/lib/cpdlc/policy';

type Page = 'MENU' | 'INIT' | 'WX' | 'ATIS' | 'FREE' | 'RECEIVED' | 'SENT';
const emptyInit: CpdlcInit = { flight_no: '', dep: '', dest: '', altn: '', ete: '', utc: '', date: '', gate: '', atis_id: '', aircraft_type: '', station: '', text: '' };
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
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
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
  const messagePages = useMemo(() => pagesFor(draft?.body || message?.body || ''), [draft?.body, message?.body]);
  const unavailable = !data?.available;

  useEffect(() => {
    const newest = unread[0];
    if (newest && newest.id !== newestSeen.current) { newestSeen.current = newest.id; setSelected(newest.id); setMessagePage(0); }
  }, [unread]);
  useEffect(() => { setMessagePage(0); setSelectedAction(null); }, [message?.id, message?.status, message?.acknowledged, draft]);
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
          body = departureRequestText(fields);
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
    if (key === 'route') { if (text && !/^[A-Z]{4}\/[A-Z]{4}$/.test(text)) { setNotice('ORIG/DEST FORMAT XXXX/XXXX'); return; } const [dep = '', dest = ''] = text.split('/'); setInit(previous => ({ ...previous, dep, dest })); }
    else if (key.startsWith('init.')) setInit(previous => ({ ...previous, [key.slice(5)]: text }));
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
  const history = messages.filter(item => page === 'RECEIVED' ? item.incoming : !item.incoming);
  const historyPages = Math.max(1, Math.ceil(history.length / 5));
  const response = (reply: 'WILCO' | 'UNABLE' | 'STANDBY' | 'ROGER') => {
    if (message) void execute({ action: 'respond', plan_id: planId, message_id: message.id, response: reply, client_request_id: crypto.randomUUID() }, `${reply} SENT`);
  };

  type Line = { label: string; value?: string; action: () => void; disabled?: boolean };
  const left: (Line | undefined)[] = Array(6).fill(undefined), right: (Line | undefined)[] = Array(6).fill(undefined);
  const editLine = (label: string, key: string, value: string, hint = '[          ]'): Line => ({ label, value: value || hint, action: () => selectField(key, value) });
  const navLine = (label: string, next: Page): Line => ({ label, action: () => navigate(next) });
  if (page === 'MENU') {
    left[0] = navLine('DEPARTURE REQUEST', 'INIT'); left[1] = navLine('WX REQUEST', 'WX'); left[2] = navLine('ATIS', 'ATIS');
    right[0] = navLine('FREE TEXT', 'FREE'); right[1] = navLine('RECEIVED MESSAGES', 'RECEIVED'); right[2] = navLine('SENT MESSAGES', 'SENT');
  } else {
    left[5] = navLine('RETURN', 'MENU');
    if (['INIT', 'WX', 'ATIS', 'FREE'].includes(page)) right[5] = { label: 'SEND*', action: () => void submit(), disabled: busy || unavailable };
    if (page === 'INIT') {
      left[0] = editLine('ORIG/DEST', 'route', init.dep || init.dest ? init.dep + '/' + init.dest : '', '[    /    ]');
      right[0] = editLine('ATC CALLSIGN', 'init.flight_no', init.flight_no);
      left[1] = editLine('GATE NUMBER', 'init.gate', init.gate || ''); right[1] = editLine('ATIS ID', 'init.atis_id', init.atis_id || '');
      left[2] = editLine('OPTIONAL FREE TEXT', 'init.text', init.text || '');
      left[4] = editLine('A/C TYPE', 'init.aircraft_type', init.aircraft_type || ''); right[4] = editLine('STATION', 'init.station', init.station || '');
    } else if (page === 'WX') {
      left[0] = editLine('FLT NO', 'init.flight_no', init.flight_no);
      right[0] = { label: 'WX TYPE', value: wxType, action: () => setWxType(value => value === 'METAR' ? 'TAF' : 'METAR') };
      airports.forEach((airport, index) => { right[index + 1] = editLine('AIRPORT ' + (index + 1), 'wx.' + index, airport); });
    } else if (page === 'ATIS') {
      left[0] = editLine('FLT NO', 'init.flight_no', init.flight_no); right[0] = editLine('AIRPORT', 'airport', atisAirport);
    } else if (page === 'FREE') {
      left[0] = editLine('FLT NO', 'init.flight_no', init.flight_no); right[0] = editLine('TO STATION', 'to', to);
      left[2] = editLine('MESSAGE', 'text', freeText);
    } else {
      history.slice(historyPage * 5, historyPage * 5 + 5).forEach((item, index) => {
        left[index] = { label: time(item.created_at) + ' ' + (item.incoming ? item.from_station : item.to_station), value: item.kind.replace('_', ' '), action: () => { setSelected(item.id); setMessagePage(0); setNotice('MESSAGE SELECTED ON DCDU'); } };
      });
      right[4] = { label: 'PREV PAGE', disabled: historyPage === 0, action: () => setHistoryPage(value => value - 1) };
      right[5] = { label: 'NEXT PAGE', disabled: historyPage + 1 >= historyPages, action: () => setHistoryPage(value => value + 1) };
    }
  }
  const dcduLeft: (Line | undefined)[] = [undefined, undefined], dcduRight: (Line | undefined)[] = [undefined, undefined];
  if (draft) {
    dcduLeft[0] = { label: '*CANCEL', disabled: busy, action: () => { setDraft(null); setNotice('MESSAGE CANCELLED'); } };
    dcduRight[1] = { label: busy ? 'SENDING' : 'SEND*', disabled: busy || unavailable, action: () => void sendDraft() };
  } else if (message?.incoming) {
    if (!message.acknowledged) dcduRight[1] = { label: 'ACK*', disabled: busy, action: () => void execute({ action: 'ack', plan_id: planId, message_id: message.id }, 'MESSAGE ACKNOWLEDGED') };
    else if (message.response_required && !['WILCO', 'UNABLE', 'ROGER', 'REFUSED'].includes(message.status)) {
      dcduLeft[0] = { label: '*UNABLE', disabled: busy, action: () => response('UNABLE') };
      dcduRight[0] = { label: 'STBY*', disabled: busy, action: () => response('STANDBY') };
      dcduRight[1] = { label: 'WILCO*', disabled: busy, action: () => response('WILCO') };
    } else if (message.kind === 'FREE_TEXT' && !message.response_required && message.status !== 'ROGER') dcduRight[1] = { label: 'ROGER*', disabled: busy, action: () => response('ROGER') };
  }
  const physicalKey = (line: Line | undefined, name: string) => <button type="button" aria-label={name + (line ? ': ' + line.label : '')} aria-pressed={name.startsWith('DCDU') ? selectedAction === name + ':' + line?.label : undefined} disabled={!line || line.disabled} onClick={() => {
    if (!line || line.disabled) return;
    if (name.startsWith('DCDU')) {
      const id = name + ':' + line.label;
      if (selectedAction !== id) { setSelectedAction(id); return; }
      setSelectedAction(null);
    }
    line.action();
  }}>—</button>;
  const dragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, left: position.x, top: position.y };
  };

  return <section className={styles.root} aria-label="CPDLC datalink">
    <div className={styles.sectionHeader}><div><span className={styles.eyebrow}>DATALINK COMMUNICATIONS</span><h2>DCDU <span>{data?.station || 'NOT CONNECTED'}</span></h2></div><button ref={trigger} type="button" className={styles.openButton} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(value => !value)}>MCDU {open ? '−' : '+'}</button></div>
    {alarm.blocked && <button className={styles.audioWarning} type="button" onClick={() => void alarm.enable()}>ENABLE MESSAGE SOUND — {unread.length} UNACKNOWLEDGED</button>}
    <div className={styles.dcdu}>
      <div className={styles.hardwareColumn}>
        <div className={styles.brightnessKeys}><button type="button" aria-label="Increase DCDU brightness" onClick={() => setBrightness(value => Math.min(1, value + .1))}>BRT</button><button type="button" aria-label="Decrease DCDU brightness" onClick={() => setBrightness(value => Math.max(.5, value - .1))}>DIM</button></div>
        <button type="button" disabled={Boolean(draft) || messageIndex <= 0} onClick={() => setSelected(messages[messageIndex - 1]?.id)}>MSG−</button>
        <button type="button" disabled={Boolean(draft) || messageIndex < 0 || messageIndex >= messages.length - 1} onClick={() => setSelected(messages[messageIndex + 1]?.id)}>MSG+</button>
        {dcduLeft.map((line, index) => <div className={styles.physicalSlot} key={index}>{physicalKey(line, 'DCDU L' + (index + 1))}</div>)}
      </div>
      <div className={styles.dcduScreen} style={{ filter: 'brightness(' + brightness + ')' }} aria-label={draft ? 'DCDU outgoing preview' : 'DCDU display'}>
        <div className={styles.messageMeta}>{draft ? 'OUTGOING MESSAGE — NOT SENT' : message ? time(message.created_at) + ' ' + (message.incoming ? 'FROM ' + message.from_station : 'TO ' + message.to_station) + ' ' + message.status.replace('_', ' ') : 'CPDLC READY'}</div>
        <pre className={styles.messageBody}>{draft || message ? messagePages[Math.min(messagePage, messagePages.length - 1)] : error ? 'DATALINK UNAVAILABLE' : 'NO MESSAGES'}</pre>
        <div className={styles.dcduLower}>
          <div>{dcduLeft.map((line, index) => <span key={index} className={selectedAction === "DCDU L" + (index + 1) + ":" + line?.label ? styles.actionSelected : undefined}>{line?.label}</span>)}</div>
          <div className={styles.dcduCenter}><span>{message?.late && !draft ? 'LATE RESPONSE' : ''}</span><span>{messagePage + 1}/{messagePages.length} PGE</span></div>
          <div>{dcduRight.map((line, index) => <span key={index} className={selectedAction === "DCDU R" + (index + 1) + ":" + line?.label ? styles.actionSelected : undefined}>{line?.label}</span>)}</div>
        </div>
      </div>
      <div className={styles.hardwareColumn}>
        <button type="button" disabled={!message || Boolean(draft)} onClick={() => message && printMessage(time(message.created_at), message.body)}>PRINT</button>
        <button type="button" disabled={messagePage === 0} onClick={() => setMessagePage(value => value - 1)}>PGE−</button>
        <button type="button" disabled={messagePage >= messagePages.length - 1} onClick={() => setMessagePage(value => value + 1)}>PGE+</button>
        {dcduRight.map((line, index) => <div className={styles.physicalSlot} key={index}>{physicalKey(line, 'DCDU R' + (index + 1))}</div>)}
      </div>
    </div>
    {(error || notice) && <p className={styles.notice} role="status">{upper(notice || error)}</p>}
    {open && typeof document !== 'undefined' && createPortal(<div ref={island} role="dialog" aria-label="AOC MCDU" className={styles.island} style={{ left: position.x, top: position.y }}>
      <div className={styles.dragHandle} onPointerDown={dragStart} onPointerMove={event => { if (drag.current) setPosition(clamp(drag.current.left + event.clientX - drag.current.x, drag.current.top + event.clientY - drag.current.y)); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <span>⠿ AOC MCDU <small>DRAG TO MOVE</small></span><button type="button" onClick={close} aria-label="Close MCDU">✕</button>
      </div>
      <div className={styles.mcduBody}>
        <div className={styles.mcduAssembly}>
          <div className={styles.lineKeys}>{left.map((line, index) => <div key={index}>{physicalKey(line, 'MCDU L' + (index + 1))}</div>)}</div>
          <div className={styles.mcduScreen}>
            <h3>{({ MENU: 'AOC MENU', INIT: 'AOC DEPARTURE REQUEST', WX: 'AOC WEATHER REQUEST', ATIS: 'AOC ATIS REQUEST', FREE: 'AOC FREE TEXT', RECEIVED: 'RECEIVED MESSAGES', SENT: 'SENT MESSAGES' })[page]}</h3>
            <div className={styles.displayLines}>{left.map((line, index) => <div className={styles.displayRow} key={index}>
              {[line, right[index]].map((item, side) => <div key={side} className={styles.displayCell}><span>{item?.label}</span><strong>{item?.value}</strong></div>)}
            </div>)}</div>
            <p className={styles.mcduNotice} role="status">{upper(notice || error || '')}</p>
            <div className={styles.scratchDisplay}>{scratch || '[ SCRATCHPAD ]'}</div>
          </div>
          <div className={styles.lineKeys}>{right.map((line, index) => <div key={index}>{physicalKey(line, 'MCDU R' + (index + 1))}</div>)}</div>
        </div>
        <label className={styles.keyboardEntry}>KEYBOARD INPUT
          <input ref={scratchInput} className={styles.scratchpad} aria-label="MCDU scratchpad" value={scratch} maxLength={1500} autoComplete="off" spellCheck={false} onChange={event => setScratch(upper(event.target.value))} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); close(); } else if (event.key === 'Enter') { event.preventDefault(); insert(); } }} placeholder="[ SCRATCHPAD ]" />
        </label>
        <div className={styles.functionKeys}><button type="button" onClick={() => navigate('MENU')}>AOC<br />MENU</button><button type="button" onClick={() => navigate('RECEIVED')}>RECEIVED<br />MSG</button><button type="button" onClick={() => navigate('SENT')}>SENT<br />MSG</button><button type="button" onClick={insert}>INSERT</button></div>
        <div className={styles.keypad}>{'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789./-'.split('').map(key => <button type="button" key={key} onClick={() => setScratch(value => (value + key).slice(0, 1500))}>{key}</button>)}<button type="button" onClick={() => setScratch(value => (value + ' ').slice(0, 1500))}>SP</button><button type="button" onClick={() => setScratch(value => value.slice(0, -1))}>⌫</button><button type="button" onClick={() => { if (target) put(target, ''); setScratch(''); }}>CLR</button></div>
        <p className={styles.instructions}>TYPE INTO THE SCRATCHPAD, THEN PRESS A FIELD LINE KEY. SELECT AN EXISTING FIELD TO EDIT IT, THEN INSERT.</p>
      </div>
    </div>, document.body)}
  </section>;
}
