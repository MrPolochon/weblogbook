'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, ChevronRight, MessageSquare, RefreshCw, Send, Volume2, X } from 'lucide-react';
import { useCpdlc } from '@/hooks/useCpdlc';
import { useCpdlcAlarm } from './useCpdlcAlarm';
import type { CpdlcCommand, CpdlcMessage } from '@/lib/cpdlc/types';
import { useAtcTheme } from '@/contexts/AtcThemeContext';
import { ATC_NAV_BTN, atcNavIdle, atcNavOpen } from '@/lib/atc-ui';
import { clearanceText, routeStation } from '@/lib/cpdlc/policy';
import { cn } from '@/lib/utils';

type Clearance = NonNullable<Extract<CpdlcCommand, { action: 'respond' }>['clearance']>;
type Editor = 'choice' | 'clearance' | 'preview' | 'text' | 'transfer' | 'compose' | null;
const upper = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const emptyClearance: Clearance = { destination: '', departure: '', altitude: '', squawk: '', frequency: '', text: '' };
const time = (value: string) => new Date(value).toISOString().slice(11, 16) + 'Z';
const kindLabel = (message: CpdlcMessage) => message.kind.replace('_', ' ');

export function clearancePreview(clearance: Clearance): string {
  return clearanceText(clearance);
}

export default function AtcCpdlcPanel() {
  const { theme } = useAtcTheme();
  const dark = theme === 'dark';
  const { data, error, loading, busy, refresh, act } = useCpdlc();
  const messages = data?.messages ?? [];
  const unread = messages.filter(message => message.incoming && !message.acknowledged);
  const alarm = useCpdlcAlarm(unread.length > 0);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const [clearance, setClearance] = useState<Clearance>(emptyClearance);
  const [replyText, setReplyText] = useState('');
  const [recipient, setRecipient] = useState('');
  const [transferSession, setTransferSession] = useState('');
  const [actionError, setActionError] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const inboxScroll = useRef(0);
  const draftMessageId = useRef<string | null>(null);
  const requestId = useRef<string | null>(null);
  const requestContent = useRef<string | null>(null);
  const selected = messages.find(message => message.id === selectedId);
  const selectedRequestPending = Boolean(selected && ['SENT', 'STANDBY', 'TIMED_OUT'].includes(selected.status));
  const selectedRequestAnswered = selected?.kind === 'CLEARANCE' && !selectedRequestPending;
  const transferStations = selected ? (data?.stations ?? []).filter(station => station.user_id !== data?.user_id && routeStation([station], selected.to_station, selected.kind === 'CLEARANCE')) : [];
  const visibleMessages = (filter === 'unread' ? unread : messages).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const shell = dark ? 'bg-[#0b1220] text-slate-100 border-slate-700' : 'bg-white text-slate-900 border-slate-300';
  const muted = dark ? 'text-slate-400' : 'text-slate-600';
  const field = cn('w-full rounded-lg border px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-sky-500', dark ? 'bg-slate-950 border-slate-700' : 'bg-slate-50 border-slate-300');
  const button = cn('inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40', dark ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-300 hover:bg-slate-100');

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
      if (event.key !== 'Tab' || !panel.current) return;
      const elements = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]')).filter(element => element.getClientRects().length > 0);
      const first = elements[0], last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus(); };
  }, [open]);

  useEffect(() => {
    if (content.current) content.current.scrollTop = selectedId || editor ? 0 : inboxScroll.current;
  }, [selectedId, editor]);

  useEffect(() => {
    if (selectedRequestAnswered && ['choice', 'clearance', 'preview', 'transfer'].includes(editor ?? '')) setEditor(null);
  }, [selectedRequestAnswered, editor]);

  // Keep a selected message visible when its automatic ACK removes it from UNREAD.
  async function openMessage(message: CpdlcMessage) {
    if (!selectedId) inboxScroll.current = content.current?.scrollTop ?? 0;
    if (draftMessageId.current !== message.id) {
      draftMessageId.current = message.id;
      setClearance(emptyClearance); setReplyText(''); setTransferSession('');
    }
    setSelectedId(message.id); setEditor(null); setActionError('');
    if (message.incoming && !message.acknowledged) {
      try { await act({ action: 'ack', message_id: message.id }); }
      catch (reason) { setActionError(reason instanceof Error ? reason.message : 'ACKNOWLEDGEMENT FAILED'); }
    }
  }

  async function submit(command: CpdlcCommand) {
    setActionError('');
    // A retry of the same message keeps its nonce; editing a failed draft must
    // not reuse an identity that may already have been accepted by the server.
    let payload = command;
    if ('client_request_id' in command) {
      const content = JSON.stringify({ ...command, client_request_id: undefined });
      if (content !== requestContent.current) requestId.current = crypto.randomUUID();
      requestContent.current = content;
      payload = { ...command, client_request_id: requestId.current! };
    }
    try { await act(payload); requestId.current = null; requestContent.current = null; setEditor(null); setReplyText(''); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'MESSAGE NOT SENT. RETRY.'); }
  }

  function startEditor(next: Editor) {
    requestId.current = crypto.randomUUID(); requestContent.current = null; setActionError(''); setEditor(next);
    if (next === 'compose') { inboxScroll.current = content.current?.scrollTop ?? 0; setReplyText(''); }
  }

  function statusTone(message: CpdlcMessage) {
    const blinking = message.incoming && !message.acknowledged && ['UNABLE', 'STANDBY'].includes(message.status);
    return cn('border-b border-slate-500/15', blinking && 'animate-pulse motion-reduce:animate-none',
      message.status === 'UNABLE' ? dark ? 'bg-red-950/60 text-red-200' : 'bg-red-100 text-red-900'
        : message.status === 'STANDBY' ? dark ? 'bg-blue-900/50 text-blue-100' : 'bg-blue-100 text-blue-900'
          : message.status === 'WILCO' ? dark ? 'bg-emerald-950/50 text-emerald-200' : 'bg-emerald-100 text-emerald-900'
            : selectedId === message.id ? dark ? 'bg-slate-800' : 'bg-slate-100' : '');
  }

  const dialog = open && typeof document !== 'undefined' ? createPortal(<div className="fixed inset-0 z-[120]">
    <button className="absolute inset-0 bg-black/30" tabIndex={-1} aria-label="Close CPDLC panel" onClick={() => setOpen(false)} />
    <aside ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="atc-cpdlc-title" className={cn('absolute inset-y-0 right-0 flex w-[540px] max-w-full flex-col border-l shadow-2xl outline-none', shell)}>
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-500/20 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-500"><MessageSquare className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1"><h2 id="atc-cpdlc-title" className="font-bold tracking-wide">CPDLC <span className={cn('ml-2 text-sm font-mono', muted)}>{data?.station ?? 'ATC'}</span></h2><p className={cn('text-xs', muted)}>{unread.length} UNACKNOWLEDGED · {messages.length} MESSAGES</p></div>
        <button onClick={() => void refresh()} className={button} title="Refresh messages" aria-label="Refresh messages" disabled={loading}><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /></button>
        <button onClick={() => setOpen(false)} className={button} aria-label="Close CPDLC panel"><X className="h-4 w-4" /></button>
      </header>
      {(error || actionError) && <p role="alert" className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">{actionError || error}</p>}
      {alarm.blocked && <button className="m-3 flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-black" onClick={() => void alarm.enable()}><Volume2 className="h-4 w-4" /> ENABLE MESSAGE SOUND</button>}
      <div ref={content} className="min-h-0 flex-1 overflow-y-auto">
        {editor ? <div className="space-y-4 p-4">
          <button className={button} disabled={busy} onClick={() => { setEditor(null); setActionError(''); }}><ArrowLeft className="h-4 w-4" /> BACK TO MESSAGE</button>
          <h3 className="font-semibold">{editor === 'compose' ? 'NEW FREE TEXT' : editor === 'transfer' ? 'TRANSFER MESSAGE' : `REPLY TO ${selected?.from_station ?? ''}`}</h3>
          {editor === 'choice' && selected && <div className="space-y-4"><p className={cn('text-sm', muted)}>Select the clearance decision. No additional fields are required for refusal.</p><div className="grid grid-cols-2 gap-3"><button className="rounded-xl border border-emerald-500 bg-emerald-500/10 p-5 font-bold text-emerald-500" disabled={busy} onClick={() => setEditor('clearance')}>CLEAR <ChevronRight className="ml-1 inline h-4 w-4" /></button><button className="rounded-xl border border-red-500 bg-red-500/10 p-5 font-bold text-red-500" disabled={busy} onClick={() => void submit({ action: 'respond', message_id: selected.id, response: 'REFUSED', client_request_id: requestId.current ?? crypto.randomUUID() })}>REFUSED</button></div></div>}
          {editor === 'clearance' && <form className="space-y-4" onSubmit={event => {
            event.preventDefault();
            try { clearancePreview(clearance); }
            catch (reason) { setActionError(reason instanceof Error ? reason.message : 'CHECK THE CLEARANCE FIELDS'); return; }
            setActionError(''); setEditor('preview');
          }}>
            <label className="block space-y-1 text-xs font-semibold">CLEARED TO (AIRPORT)<input autoFocus required pattern="[A-Za-z]{4}" maxLength={4} className={field} value={clearance.destination} onChange={event => setClearance({ ...clearance, destination: upper(event.target.value) })} placeholder="IRFD" /></label>
            <label className="block space-y-1 text-xs font-semibold">SID / EXPECT VECTORS / DIRECT FIX<input required maxLength={80} className={field} value={clearance.departure} onChange={event => setClearance({ ...clearance, departure: upper(event.target.value) })} placeholder="EXPECT VECTORS" /></label>
            <label className="block space-y-1 text-xs font-semibold">INITIAL ALTITUDE<input required pattern="([0-9]{1,5} FT|FL[0-9]{3})" maxLength={10} className={field} value={clearance.altitude} onChange={event => setClearance({ ...clearance, altitude: upper(event.target.value) })} placeholder="5000 FT OR FL050" /><span className={muted}>Enter feet followed by FT, or a three-digit flight level.</span></label>
            <div className="grid grid-cols-2 gap-3"><label className="block space-y-1 text-xs font-semibold">SQUAWK<input required inputMode="numeric" pattern="[0-7]{4}" maxLength={4} className={field} value={clearance.squawk} onChange={event => setClearance({ ...clearance, squawk: event.target.value })} placeholder="2000" /></label><label className="block space-y-1 text-xs font-semibold">CONTACT FREQUENCY<input required inputMode="decimal" pattern="[0-9]{3}\.[0-9]{3}" maxLength={7} className={field} value={clearance.frequency} onChange={event => setClearance({ ...clearance, frequency: event.target.value.replace(',', '.') })} placeholder="124.850" /></label></div>
            <label className="block space-y-1 text-xs font-semibold">ADDITIONAL FREE TEXT (OPTIONAL)<textarea className={field} rows={3} maxLength={500} value={clearance.text} onChange={event => setClearance({ ...clearance, text: upper(event.target.value) })} /></label>
            <button type="submit" className={cn(button, 'w-full bg-sky-600 text-white')}>REVIEW MESSAGE <ArrowRight className="h-4 w-4" /></button>
          </form>}
          {editor === 'preview' && selected && <div className="space-y-4"><p className={cn('text-xs', muted)}>CHECK THE CLEARANCE BEFORE SENDING</p><pre className="whitespace-pre-wrap break-words rounded-xl border border-sky-900 bg-[#050e18] p-4 font-mono text-sm leading-relaxed text-cyan-300">{clearancePreview(clearance)}</pre><div className="flex gap-2"><button className={button} disabled={busy} onClick={() => setEditor('clearance')}>EDIT</button><button className={cn(button, 'flex-1 bg-sky-600 text-white')} disabled={busy} onClick={() => void submit({ action: 'respond', message_id: selected.id, response: 'CLEAR', clearance, client_request_id: requestId.current ?? crypto.randomUUID() })}><Send className="h-4 w-4" /> {busy ? 'SENDING…' : 'SEND CLEARANCE'}</button></div></div>}
          {(editor === 'text' || editor === 'compose') && <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (editor === 'compose') void submit({ action: 'free_text', to: upper(recipient.trim()), text: replyText, client_request_id: requestId.current ?? crypto.randomUUID() }); else if (selected) void submit({ action: 'respond', message_id: selected.id, response: 'FREE_TEXT', text: replyText, client_request_id: requestId.current ?? crypto.randomUUID() }); }}>
            {editor === 'compose' && <label className="block space-y-1 text-xs font-semibold">TO STATION<input required className={field} value={recipient} maxLength={16} onChange={event => setRecipient(upper(event.target.value))} placeholder="IRFD / DLH324" /></label>}
            <label className="block space-y-1 text-xs font-semibold">MESSAGE<textarea autoFocus required className={field} rows={6} maxLength={1000} value={replyText} onChange={event => setReplyText(upper(event.target.value))} /></label><button disabled={busy || !replyText.trim()} className={cn(button, 'w-full bg-sky-600 text-white')}><Send className="h-4 w-4" /> {busy ? 'SENDING…' : 'SEND MESSAGE'}</button>
          </form>}
          {editor === 'transfer' && selected && <form className="space-y-4" onSubmit={event => { event.preventDefault(); void submit({ action: 'transfer', message_id: selected.id, session_id: transferSession, client_request_id: requestId.current ?? crypto.randomUUID() }); }}><label className="block space-y-1 text-xs font-semibold">ONLINE CONTROLLER<select required className={field} value={transferSession} onChange={event => setTransferSession(event.target.value)}><option value="">SELECT A POSITION</option>{transferStations.map(station => <option key={station.session_id} value={station.session_id}>{station.code} {station.position.toUpperCase()}</option>)}</select></label><p className={cn('text-sm', muted)}>{transferStations.length ? 'The receiving controller will be alerted. The conversation history is retained.' : 'NO OTHER CONTROLLER COVERS THIS AIRPORT.'}</p><button disabled={busy || !transferSession} className={cn(button, 'w-full bg-sky-600 text-white')}>TRANSFER MESSAGE</button></form>}
        </div> : selected ? <section className="space-y-4 p-4" aria-label="Selected message">
          <button className={button} onClick={() => { setSelectedId(null); setActionError(''); }}><ArrowLeft className="h-4 w-4" /> BACK TO INBOX</button>
          <div className="rounded-xl border border-slate-500/30 p-4">
            <p className="font-mono text-sm font-bold">{selected.from_station} → {selected.to_station}</p>
            <p className={cn('mt-1 text-xs', muted)}>{time(selected.created_at)} · {kindLabel(selected)} · {selected.status.replace('_', ' ')}{selected.late ? ' · LATE REPLY' : ''}</p>
            <pre className="mt-4 whitespace-pre-wrap break-words rounded-lg bg-[#050e18] p-3 font-mono text-sm leading-relaxed text-cyan-300">{upper(selected.body)}</pre>
          </div>
          {selected.status === 'TIMED_OUT' && <p className="text-xs text-amber-500">TIMED OUT — YOU MAY STILL SEND A LATE REPLY.</p>}
          {selectedRequestAnswered && <p className={cn('text-xs', muted)}>THIS CLEARANCE REQUEST HAS ALREADY BEEN ANSWERED.</p>}
          {selected.incoming && <div className="flex flex-wrap gap-2">
            {!selectedRequestAnswered && !['SYSTEM', 'WX', 'ATIS'].includes(selected.kind) && <button disabled={busy || !data?.available} className={cn(button, 'bg-sky-600 text-white')} onClick={() => startEditor(selected.kind === 'CLEARANCE' ? 'choice' : 'text')}><Send className="h-4 w-4" /> REPLY</button>}
            {selectedRequestPending && ['CLEARANCE', 'FREE_TEXT'].includes(selected.kind) && <button disabled={busy || !data?.available} className={button} onClick={() => startEditor('transfer')}>TRANSFER</button>}
            {!selected.acknowledged && <button className={button} disabled={busy} onClick={() => void act({ action: 'ack', message_id: selected.id }).catch(reason => setActionError(String(reason)))}><Check className="h-4 w-4" /> ACK</button>}
          </div>}
        </section> : <>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-500/20 p-3"><button className={cn(button, filter === 'all' && 'ring-1 ring-sky-500')} onClick={() => setFilter('all')}>ALL</button><button className={cn(button, filter === 'unread' && 'ring-1 ring-sky-500')} onClick={() => setFilter('unread')}>UNREAD ({unread.length})</button><button className={cn(button, 'ml-auto')} disabled={!data?.available || busy} onClick={() => startEditor('compose')}><Send className="h-4 w-4" /> NEW</button></div>
          <table className="w-full table-fixed text-left text-xs"><thead className={cn('border-b border-slate-500/20', muted)}><tr><th className="w-[32%] px-3 py-3">IDENT</th><th className="w-[25%] px-2 py-3">TYPE</th><th className="w-[28%] px-2 py-3">STATUS</th><th className="w-[15%] px-2 py-3"><span className="sr-only">OPEN</span></th></tr></thead><tbody>{visibleMessages.map(message => <tr key={message.id} className={cn(statusTone(message), 'cursor-pointer')} onClick={() => void openMessage(message)}><td className="break-words px-3 py-3"><span className="font-mono font-bold">{message.incoming ? message.from_station : message.to_station}</span><span className={cn('mt-1 block text-[10px]', muted)}>{message.incoming ? 'FROM' : 'TO'} · {time(message.created_at)}</span></td><td className="px-2 py-3 font-semibold">{kindLabel(message)}{message.late && <span className="mt-1 block text-[10px] text-amber-500">LATE REPLY</span>}</td><td className="px-2 py-3"><button title={message.response_required ? 'Open this message to acknowledge and reply' : message.incoming && !message.acknowledged ? 'Acknowledge message without opening' : 'Message acknowledged'} disabled={!message.incoming || message.acknowledged || message.response_required || busy} className="min-h-9 max-w-full break-words rounded-md border border-current/30 px-2 py-1 text-[10px] font-bold disabled:cursor-default" onClick={event => { event.stopPropagation(); void act({ action: 'ack', message_id: message.id }).catch(reason => setActionError(reason instanceof Error ? reason.message : 'ACK FAILED')); }}>{message.status.replace('_', ' ')}{message.incoming && <span className="block">{message.acknowledged ? 'ACK' : 'ACK ▸'}</span>}</button></td><td className="px-1 py-3"><button aria-label={`Open ${kindLabel(message)} ${message.incoming ? 'from' : 'to'} ${message.incoming ? message.from_station : message.to_station}`} className="min-h-10 min-w-10 rounded-lg hover:bg-sky-500/15" onClick={event => { event.stopPropagation(); void openMessage(message); }}><ChevronRight className="mx-auto h-4 w-4" /></button></td></tr>)}</tbody></table>
          {!visibleMessages.length && <p className={cn('px-4 py-10 text-center text-sm', muted)}>{loading ? 'LOADING MESSAGES…' : data?.available === false ? 'CPDLC IS NOT AVAILABLE' : 'NO MESSAGES'}</p>}
        </>}
      </div>
      <footer className={cn('shrink-0 border-t border-slate-500/20 px-4 py-2 text-[10px]', muted)}>OPEN A MESSAGE TO ACKNOWLEDGE · ACK DOES NOT GRANT A CLEARANCE</footer>
    </aside>
  </div>, document.body) : null;

  return <><button ref={trigger} type="button" onClick={() => { setOpen(value => !value); void alarm.enable(); }} aria-expanded={open} aria-haspopup="dialog" aria-label={`CPDLC, ${unread.length} unacknowledged messages`} className={cn(ATC_NAV_BTN, 'relative', open ? atcNavOpen(dark) : atcNavIdle(dark))}><MessageSquare className="h-4 w-4" /><span>CPDLC</span>{unread.length > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-black">{unread.length}</span>}{alarm.blocked && unread.length > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500" />}</button>{dialog}</>;
}
