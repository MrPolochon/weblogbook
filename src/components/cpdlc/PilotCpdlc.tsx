'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useCpdlc } from '@/hooks/useCpdlc';
import { useCpdlcAlarm } from './useCpdlcAlarm';
import type { CpdlcCommand, CpdlcInit } from '@/lib/cpdlc/types';
import styles from './pilot.module.css';
import { departureRequestText, validateInit } from '@/lib/cpdlc/policy';

type Page = 'MAIN' | 'ATC_MENU' | 'AOC_MENU' | 'LOGON' | 'REQ' | 'POS' | 'INIT' | 'WX' | 'ATIS' | 'FREE' | 'RECEIVED' | 'SENT';
const REASONS = ['NONE', 'DUE TO WEATHER', 'DUE TO A/C PERF', 'DUE TO TURBULENCE'] as const;
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
  const [closed, setClosed] = useState(false);
  const [messagePage, setMessagePage] = useState(0);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [brightness, setBrightness] = useState(1);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<Page>('MAIN');
  const [init, setInit] = useState<CpdlcInit>(emptyInit);
  const [currentAtc, setCurrentAtc] = useState('');
  const [logonStation, setLogonStation] = useState('');
  const [reqAlt, setReqAlt] = useState('');
  const [reqDirect, setReqDirect] = useState('');
  const [reqSpeed, setReqSpeed] = useState('');
  const [reqHeading, setReqHeading] = useState('');
  const [reqReasonIndex, setReqReasonIndex] = useState(0);
  const [posFix, setPosFix] = useState('');
  const [posTime, setPosTime] = useState('');
  const [posAlt, setPosAlt] = useState('');
  const [posNext, setPosNext] = useState('');
  const [posEta, setPosEta] = useState('');
  const [posEnsuing, setPosEnsuing] = useState('');
  const [airports, setAirports] = useState(['', '', '', '']);
  const [wxType, setWxType] = useState<'METAR' | 'TAF'>('METAR');
  const [atisAirport, setAtisAirport] = useState('');
  const [to, setTo] = useState('');
  const [freeText, setFreeText] = useState('');
  const [scratch, setScratch] = useState('');
  const [target, setTarget] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<{ command: CpdlcCommand; body: string; success: string; onSent?: () => void } | null>(null);
  const [historyPage, setHistoryPage] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const scratchInput = useRef<HTMLInputElement>(null);
  const newestSeen = useRef<string | null>(null);
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const island = useRef<HTMLDivElement>(null);
  const [mcduScale, setMcduScale] = useState(1);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const message = closed ? undefined : (messages.find(item => item.id === selected) ?? messages[0]);
  const messageIndex = message ? messages.findIndex(item => item.id === message.id) : -1;
  const messagePages = useMemo(() => pagesFor(draft?.body || message?.body || ''), [draft?.body, message?.body]);
  const unavailable = !data?.available;

  const activeLogonRef = useRef({ planId, currentAtc: '', flightNo: '', act });
  useEffect(() => {
    activeLogonRef.current = {
      planId,
      currentAtc,
      flightNo: init.flight_no || data?.station || 'PILOT',
      act,
    };
  }, [planId, currentAtc, init.flight_no, data?.station, act]);

  const sendAutoLogoff = useCallback(() => {
    const { planId: pid, currentAtc: atc, flightNo, act: sendAct } = activeLogonRef.current;
    if (!atc) return;
    activeLogonRef.current.currentAtc = '';
    setCurrentAtc('');
    void sendAct({
      action: 'free_text',
      plan_id: pid,
      flight_no: flightNo,
      to: atc.split('_')[0],
      text: `LOGOFF NOTIFICATION\nFLT ${flightNo}`,
      client_request_id: crypto.randomUUID(),
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!loading && data && !data.available && currentAtc) {
      sendAutoLogoff();
    }
  }, [loading, data, currentAtc, sendAutoLogoff]);

  useEffect(() => {
    return () => {
      sendAutoLogoff();
    };
  }, [planId, sendAutoLogoff]);

  useEffect(() => {
    const newest = unread[0];
    if (newest && newest.id !== newestSeen.current) {
      newestSeen.current = newest.id;
      setClosed(false);
      setSelected(newest.id);
      setMessagePage(0);
      const bodyUpper = upper(newest.body);
      const ndaMatch = bodyUpper.match(/NEXT DATA AUTHORITY\s+([A-Z0-9_]{4,12})/);
      if (ndaMatch) {
        const nextAtc = ndaMatch[1];
        setCurrentAtc(nextAtc);
        setLogonStation(nextAtc);
        setTo(nextAtc);
        setInit(prev => ({ ...prev, station: nextAtc }));
      } else if (bodyUpper.includes('LOGON ACCEPTED')) {
        setCurrentAtc(upper(newest.from_station));
      } else if (bodyUpper.includes('CPDLC SERVICE TERMINATED')) {
        activeLogonRef.current.currentAtc = '';
        setCurrentAtc('');
      }
    }
  }, [unread]);
  useEffect(() => { setMessagePage(0); setSelectedAction(null); }, [message?.id, message?.status, message?.acknowledged, draft, closed]);
  const close = useCallback(() => { setOpen(false); trigger.current?.focus(); }, []);
  const clamp = useCallback((x: number, y: number) => ({
    x: Math.max(8, Math.min(x, window.innerWidth - (island.current?.getBoundingClientRect().width || Math.min(480, window.innerWidth - 16)) - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - (island.current?.getBoundingClientRect().height || Math.min(800, window.innerHeight - 16)) - 8)),
  }), []);
  useEffect(() => {
    if (!open) return;
    setPosition(previous => clamp(previous.x, previous.y));
    const resize = () => {
      const element = island.current;
      if (!element) return;
      const scale = Math.min(1, (window.innerWidth - 16) / element.offsetWidth, (window.innerHeight - 16) / element.offsetHeight);
      setMcduScale(scale);
      setPosition(previous => ({
        x: Math.max(8, Math.min(previous.x, window.innerWidth - element.offsetWidth * scale - 8)),
        y: Math.max(8, Math.min(previous.y, window.innerHeight - element.offsetHeight * scale - 8)),
      }));
    };
    resize();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(); } };
    window.addEventListener('resize', resize); window.addEventListener('keydown', key);
    const observer = new ResizeObserver(resize);
    if (island.current) observer.observe(island.current);
    scratchInput.current?.focus();
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); window.removeEventListener('keydown', key); };
  }, [open, close, clamp]);
  const navigate = (next: Page) => {
    setPage(next);
    setTarget('');
    setScratch('');
    setNotice('');
    setHistoryPage(0);
    if (next === 'FREE' && !to && currentAtc) setTo(currentAtc);
    if (next === 'INIT' && !init.station && currentAtc) setInit(prev => ({ ...prev, station: currentAtc }));
    if (next === 'LOGON' && !logonStation && currentAtc) setLogonStation(currentAtc);
  };
  const execute = async (command: CpdlcCommand, success = 'MESSAGE SENT', onSent?: () => void) => {
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
        setDraft({ command, body: upper(body), success, onSent }); setOpen(false);
        setNotice('REVIEW ON DCDU - SEND OR CANCEL');
      } catch (reason) { setNotice(upper(reason instanceof Error ? reason.message : 'INVALID FORMAT')); }
      return;
    }
    try { await act(command); setNotice(success); } catch (reason) { setNotice(upper(reason instanceof Error ? reason.message : 'TRANSMISSION FAILED')); }
  };
  const sendDraft = async () => {
    if (!draft || busy) return;
    try {
      await act(draft.command);
      draft.onSent?.();
      setNotice(draft.success);
      setDraft(null);
    }
    catch (reason) { setNotice(upper(reason instanceof Error ? reason.message : 'TRANSMISSION FAILED')); }
  };
  const buildEnrouteRequest = () => {
    const dest = currentAtc || logonStation;
    if (!dest) { setNotice('LOGON OR ENTER ATC STATION FIRST'); return; }
    if (!init.flight_no) { setNotice('ENTER ATC FLT NBR FIRST'); return; }
    const parts: string[] = [];
    if (reqAlt) parts.push(`REQUEST LEVEL ${reqAlt}`);
    if (reqDirect) parts.push(`REQUEST DIRECT TO ${reqDirect}`);
    if (reqSpeed) parts.push(`REQUEST SPEED ${reqSpeed}`);
    if (reqHeading) parts.push(`REQUEST HEADING ${reqHeading}`);
    if (!parts.length) { setNotice('ENTER AT LEAST ONE REQUEST PARAMETER'); return; }
    const reason = REASONS[reqReasonIndex];
    if (reason !== 'NONE') parts.push(reason);
    const text = `ATC REQUEST\nFLT ${init.flight_no}\n${parts.join('\n')}`;
    void execute({ action: 'free_text', plan_id: planId, flight_no: init.flight_no, to: dest, text, client_request_id: crypto.randomUUID() }, 'ATC REQUEST SENT', () => {
      setReqAlt(''); setReqDirect(''); setReqSpeed(''); setReqHeading(''); setReqReasonIndex(0);
    });
  };
  const buildPositionReport = () => {
    const dest = currentAtc || logonStation;
    if (!dest) { setNotice('LOGON OR ENTER ATC STATION FIRST'); return; }
    if (!init.flight_no) { setNotice('ENTER ATC FLT NBR FIRST'); return; }
    if (!posFix || !posAlt) { setNotice('POS AND ALTITUDE REQUIRED'); return; }
    const lines = [
      'POSITION REPORT',
      `FLT ${init.flight_no}`,
      `POS ${posFix}${posTime ? ' AT ' + posTime : ''}`,
      `ALT ${posAlt}`,
    ];
    if (posNext) lines.push(`NEXT ${posNext}${posEta ? ' EST ' + posEta : ''}`);
    if (posEnsuing) lines.push(`ENSUING ${posEnsuing}`);
    void execute({ action: 'free_text', plan_id: planId, flight_no: init.flight_no, to: dest, text: lines.join('\n'), client_request_id: crypto.randomUUID() }, 'POSITION REPORT SENT');
  };
  const submit = async () => {
    const client_request_id = crypto.randomUUID();
    if (page === 'LOGON') {
      if (!init.flight_no) { setNotice('ENTER ATC FLT NBR'); return; }
      if (!/^[A-Z0-9_]{4,12}$/.test(logonStation)) { setNotice('INVALID STATION FORMAT'); return; }
      const targetAtc = logonStation;
      return execute(
        { action: 'free_text', plan_id: planId, flight_no: init.flight_no, to: targetAtc, text: `LOGON REQUEST\nFLT ${init.flight_no}\nSTATION ${targetAtc}`, client_request_id },
        `LOGON SENT TO ${targetAtc}`,
        () => setCurrentAtc(targetAtc),
      );
    }
    if (page === 'REQ') return buildEnrouteRequest();
    if (page === 'POS') return buildPositionReport();
    if (page === 'INIT') return execute({ action: 'clearance', plan_id: planId, init, client_request_id });
    if (page === 'WX') return execute({ action: 'weather', plan_id: planId, flight_no: init.flight_no, airports: airports.filter(Boolean), wx_type: wxType, client_request_id });
    if (page === 'ATIS') return execute({ action: 'atis', plan_id: planId, flight_no: init.flight_no, airport: atisAirport, client_request_id });
    if (page === 'FREE') return execute({ action: 'free_text', plan_id: planId, flight_no: init.flight_no, to, text: freeText, client_request_id });
  };
  const put = (key: string, value: string) => {
    const text = upper(value).trim();
    if (key === 'route') { if (text && !/^[A-Z]{4}\/[A-Z]{4}$/.test(text)) { setNotice('ORIG/DEST FORMAT XXXX/XXXX'); return; } const [dep = '', dest = ''] = text.split('/'); setInit(previous => ({ ...previous, dep, dest })); }
    else if (key.startsWith('init.')) setInit(previous => ({ ...previous, [key.slice(5)]: text }));
    else if (key === 'logon.station') setLogonStation(text);
    else if (key === 'req.alt') setReqAlt(text);
    else if (key === 'req.direct') setReqDirect(text);
    else if (key === 'req.speed') setReqSpeed(text);
    else if (key === 'req.heading') setReqHeading(text);
    else if (key === 'pos.fix') setPosFix(text);
    else if (key === 'pos.time') setPosTime(text);
    else if (key === 'pos.alt') setPosAlt(text);
    else if (key === 'pos.next') setPosNext(text);
    else if (key === 'pos.eta') setPosEta(text);
    else if (key === 'pos.ensuing') setPosEnsuing(text);
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
  if (page === 'MAIN') {
    left[0] = navLine('ATC COMM', 'ATC_MENU');
    left[1] = navLine('AOC MENU', 'AOC_MENU');
    right[0] = navLine('RECEIVED MESSAGES', 'RECEIVED');
    right[1] = navLine('SENT MESSAGES', 'SENT');
  } else if (page === 'ATC_MENU') {
    left[0] = navLine('NOTIFICATION', 'LOGON');
    left[1] = navLine('ATC REQUEST', 'REQ');
    left[2] = navLine('POSITION REPORT', 'POS');
    right[0] = navLine('DEPARTURE REQ', 'INIT');
    right[1] = navLine('FREE TEXT', 'FREE');
    right[2] = navLine('MSG LOG', 'RECEIVED');
    left[5] = navLine('RETURN', 'MAIN');
  } else if (page === 'AOC_MENU') {
    left[0] = navLine('WX REQUEST', 'WX');
    left[1] = navLine('ATIS', 'ATIS');
    right[0] = navLine('FREE TEXT', 'FREE');
    right[1] = navLine('RECEIVED MESSAGES', 'RECEIVED');
    right[2] = navLine('SENT MESSAGES', 'SENT');
    left[5] = navLine('RETURN', 'MAIN');
  } else {
    const parentMenu: Page = ['LOGON', 'REQ', 'POS', 'INIT'].includes(page) ? 'ATC_MENU' : ['WX', 'ATIS'].includes(page) ? 'AOC_MENU' : 'MAIN';
    left[5] = navLine('RETURN', parentMenu);
    if (['INIT', 'WX', 'ATIS', 'FREE'].includes(page)) right[5] = { label: 'SEND*', action: () => void submit(), disabled: busy || unavailable };
    if (['REQ', 'POS'].includes(page)) right[5] = { label: 'XFER TO DCDU*', action: () => void submit(), disabled: busy || unavailable };
    if (page === 'LOGON') {
      left[0] = editLine('ATC FLT NBR', 'init.flight_no', init.flight_no);
      right[0] = editLine('NOTIFY TO', 'logon.station', logonStation, '[    ]');
      left[2] = { label: 'CURRENT ATC', value: currentAtc || 'NONE', action: () => {} };
      right[2] = { label: 'STATUS', value: currentAtc ? 'LOGGED ON' : 'NOT LOGGED', action: () => {} };
      if (currentAtc) {
        left[4] = {
          label: 'LOGOFF*',
          disabled: busy || unavailable,
          action: () => void execute(
            { action: 'free_text', plan_id: planId, flight_no: init.flight_no || data?.station || 'PILOT', to: currentAtc.split('_')[0], text: `LOGOFF NOTIFICATION\nFLT ${init.flight_no || data?.station || ''}`, client_request_id: crypto.randomUUID() },
            'LOGOFF SENT',
            () => { activeLogonRef.current.currentAtc = ''; setCurrentAtc(''); },
          ),
        };
      }
      right[5] = { label: 'NOTIFY*', action: () => void submit(), disabled: busy || unavailable };
    } else if (page === 'REQ') {
      left[0] = editLine('CLIMB / DESC TO', 'req.alt', reqAlt, '[FL350/8000FT]');
      right[0] = editLine('HEADING', 'req.heading', reqHeading, '[   ]');
      left[1] = editLine('DIRECT TO', 'req.direct', reqDirect, '[     ]');
      right[1] = { label: 'REASON', value: REASONS[reqReasonIndex], action: () => setReqReasonIndex(i => (i + 1) % REASONS.length) };
      left[2] = editLine('SPEED / MACH', 'req.speed', reqSpeed, '[280KT/M0.80]');
      right[2] = { label: 'CURRENT ATC', value: currentAtc || 'NONE', action: () => navigate('LOGON') };
      left[3] = editLine('ATC FLT NBR', 'init.flight_no', init.flight_no);
    } else if (page === 'POS') {
      left[0] = editLine('REPORTING POS', 'pos.fix', posFix, '[     ]');
      right[0] = editLine('UTC TIME', 'pos.time', posTime, '[HHMMZ]');
      left[1] = editLine('ALTITUDE / FL', 'pos.alt', posAlt, '[FL350]');
      right[1] = editLine('NEXT FIX', 'pos.next', posNext, '[     ]');
      left[2] = editLine('NEXT FIX ETA', 'pos.eta', posEta, '[HHMMZ]');
      right[2] = editLine('ENSUING FIX', 'pos.ensuing', posEnsuing, '[     ]');
      left[3] = editLine('ATC FLT NBR', 'init.flight_no', init.flight_no);
      right[3] = { label: 'CURRENT ATC', value: currentAtc || 'NONE', action: () => navigate('LOGON') };
    } else if (page === 'INIT') {
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
        left[index] = { label: time(item.created_at) + ' ' + (item.incoming ? item.from_station : item.to_station), value: item.kind.replace('_', ' '), action: () => { setClosed(false); setSelected(item.id); setMessagePage(0); setNotice('MESSAGE SELECTED ON DCDU'); } };
      });
      right[4] = { label: 'PREV PAGE', disabled: historyPage === 0, action: () => setHistoryPage(value => value - 1) };
      right[5] = { label: 'NEXT PAGE', disabled: historyPage + 1 >= historyPages, action: () => setHistoryPage(value => value + 1) };
    }
  }
  const dcduLeft: (Line | undefined)[] = [undefined, undefined], dcduRight: (Line | undefined)[] = [undefined, undefined];
  if (draft) {
    dcduLeft[0] = { label: '*CANCEL', disabled: busy, action: () => { setDraft(null); setNotice('MESSAGE CANCELLED'); } };
    dcduRight[1] = { label: busy ? 'SENDING' : 'SEND*', disabled: busy || unavailable, action: () => void sendDraft() };
  } else if (!message && messages.length > 0) {
    dcduRight[1] = { label: 'RECALL*', action: () => { setClosed(false); setSelected(messages[0]?.id ?? null); setMessagePage(0); } };
  } else if (message?.incoming) {
    const isFinalStatus = ['WILCO', 'UNABLE', 'ROGER', 'REFUSED', 'CLEAR', 'CLEARED', 'CLOSED'].includes(message.status);
    if (!message.acknowledged) {
      dcduRight[1] = { label: 'ACK*', disabled: busy, action: () => void execute({ action: 'ack', plan_id: planId, message_id: message.id }, 'MESSAGE ACKNOWLEDGED') };
    } else if (message.response_required && !isFinalStatus) {
      dcduLeft[0] = { label: '*UNABLE', disabled: busy, action: () => response('UNABLE') };
      dcduRight[0] = { label: 'STBY*', disabled: busy, action: () => response('STANDBY') };
      dcduRight[1] = { label: 'WILCO*', disabled: busy, action: () => response('WILCO') };
    } else if (message.kind === 'FREE_TEXT' && !message.response_required && !isFinalStatus) {
      dcduRight[1] = { label: 'ROGER*', disabled: busy, action: () => response('ROGER') };
    } else {
      dcduRight[1] = { label: 'CLOSE*', action: () => setClosed(true) };
    }
  } else if (message) {
    dcduRight[1] = { label: 'CLOSE*', action: () => setClosed(true) };
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
    <div className={styles.sectionHeader}><div><span className={styles.eyebrow}>DATALINK COMMUNICATIONS</span><h2>DCDU <span>{data?.station || 'NOT CONNECTED'}{currentAtc ? ` · ATC: ${currentAtc}` : ''}</span></h2></div><button ref={trigger} type="button" className={styles.openButton} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(value => !value)}>MCDU {open ? '−' : '+'}</button></div>
    {alarm.blocked && <button className={styles.audioWarning} type="button" onClick={() => void alarm.enable()}>ENABLE MESSAGE SOUND — {unread.length} UNACKNOWLEDGED</button>}
    <div className={styles.dcdu}>
      <div className={styles.hardwareColumn}>
        <div className={styles.brightnessKeys}><button type="button" aria-label="Increase DCDU brightness" onClick={() => setBrightness(value => Math.min(1, value + .1))}>BRT</button><button type="button" aria-label="Decrease DCDU brightness" onClick={() => setBrightness(value => Math.max(.5, value - .1))}>DIM</button></div>
        <button type="button" disabled={Boolean(draft) || (closed ? messages.length === 0 : messageIndex <= 0)} onClick={() => { if (closed) { setClosed(false); setSelected(messages[0]?.id ?? null); } else setSelected(messages[messageIndex - 1]?.id); }}>MSG−</button>
        <button type="button" disabled={Boolean(draft) || (closed ? messages.length === 0 : (messageIndex < 0 || messageIndex >= messages.length - 1))} onClick={() => { if (closed) { setClosed(false); setSelected(messages[0]?.id ?? null); } else setSelected(messages[messageIndex + 1]?.id); }}>MSG+</button>
        {dcduLeft.map((line, index) => <div className={styles.physicalSlot} key={index}>{physicalKey(line, 'DCDU L' + (index + 1))}</div>)}
      </div>
      <div className={styles.dcduScreen} style={{ filter: 'brightness(' + brightness + ')' }} aria-label={draft ? 'DCDU outgoing preview' : 'DCDU display'}>
        <div className={styles.messageMeta}>{draft ? 'OUTGOING MESSAGE — NOT SENT' : message ? `${time(message.created_at)} ${message.incoming ? `FROM ${message.from_station}` : `TO ${message.to_station}`} ${message.incoming && message.status === 'SENT' ? (message.acknowledged ? 'OPEN' : 'NEW') : message.status.replace('_', ' ')}` : currentAtc ? `CPDLC READY · ATC ${currentAtc}` : 'CPDLC READY'}</div>
        <pre className={styles.messageBody}>{draft || message ? messagePages[Math.min(messagePage, messagePages.length - 1)] : error ? 'DATALINK UNAVAILABLE' : 'NO MESSAGES'}</pre>
        <div className={styles.dcduLower}>
          <div>{dcduLeft.map((line, index) => <span key={index} className={selectedAction === "DCDU L" + (index + 1) + ":" + line?.label ? styles.actionSelected : undefined}>{line?.label}</span>)}</div>
          <div className={styles.dcduCenter}><span>{message?.late && !draft ? 'LATE RESPONSE' : !draft && message && messages.length > 0 ? `MSG ${messageIndex + 1}/${messages.length}` : ''}</span><span>{messagePage + 1}/{messagePages.length} PGE</span></div>
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
    {open && typeof document !== 'undefined' && createPortal(<div ref={island} role="dialog" aria-label="DATALINK MCDU" className={styles.island} style={{ left: position.x, top: position.y, transform: `scale(${mcduScale})`, transformOrigin: 'top left' }}>
      <div className={styles.dragHandle} onPointerDown={dragStart} onPointerMove={event => { if (drag.current) setPosition(clamp(drag.current.left + event.clientX - drag.current.x, drag.current.top + event.clientY - drag.current.y)); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <span>⠿ DATALINK MCDU <small>DRAG TO MOVE</small></span><button type="button" onClick={close} aria-label="Close MCDU">✕</button>
      </div>
      <div className={styles.mcduBody}>
        <div className={styles.mcduAssembly}>
          <div className={styles.lineKeys}>{left.map((line, index) => <div key={index}>{physicalKey(line, 'MCDU L' + (index + 1))}</div>)}</div>
          <div className={styles.mcduScreen}>
            <h3>{({ MAIN: 'DATALINK MENU', ATC_MENU: 'ATC COMM MENU', AOC_MENU: 'AOC MENU', LOGON: 'ATC NOTIFICATION', REQ: 'ATC REQUEST', POS: 'ATC POSITION REPORT', INIT: 'ATC DEPARTURE REQUEST', WX: 'AOC WEATHER REQUEST', ATIS: 'AOC ATIS REQUEST', FREE: 'DATALINK FREE TEXT', RECEIVED: 'RECEIVED MESSAGES', SENT: 'SENT MESSAGES' })[page]}</h3>
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
        <div className={styles.functionKeys}><button type="button" onClick={() => navigate('ATC_MENU')}>ATC<br />MENU</button><button type="button" onClick={() => navigate('AOC_MENU')}>AOC<br />MENU</button><button type="button" onClick={() => navigate('RECEIVED')}>RECEIVED<br />MSG</button><button type="button" onClick={insert}>INSERT</button></div>
        <div className={styles.keypad}>{'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789./-'.split('').map(key => <button type="button" key={key} onClick={() => setScratch(value => (value + key).slice(0, 1500))}>{key}</button>)}<button type="button" onClick={() => setScratch(value => (value + ' ').slice(0, 1500))}>SP</button><button type="button" onClick={() => setScratch(value => value.slice(0, -1))}>⌫</button><button type="button" onClick={() => { if (target) put(target, ''); setScratch(''); }}>CLR</button></div>
        <p className={styles.instructions}>TYPE INTO THE SCRATCHPAD, THEN PRESS A FIELD LINE KEY. SELECT AN EXISTING FIELD TO EDIT IT, THEN INSERT.</p>
      </div>
    </div>, document.body)}
  </section>;
}
