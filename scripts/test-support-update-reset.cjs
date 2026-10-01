// Simulations hors ligne : aucun appel au site, à Discord ou à Supabase.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadTs(relative, stubs = {}) {
  const filename = path.resolve(__dirname, '..', relative);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod);
  mod.require = (id) => Object.hasOwn(stubs, id) ? stubs[id] : original(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return mod.exports;
}

const workflow = loadTs('src/lib/support/update-reset-workflow.ts');
const { executeTicketUpdateReset, assertResetTarget, UPDATE_RESET_CUTOFF } = workflow;

function scenario(failAt) {
  const item = { ticket_id: 'old-ticket', deleted_at: null, dm_status: 'pending' };
  const events = [];
  const step = (name) => async () => {
    events.push(name);
    if (name === failAt) throw new Error(name);
  };
  const deps = {
    validateChannel: step('validate'), archive: step('archive'), deleteChannel: step('delete'),
    notify: step('notify'), isDmUnavailable: (error) => error.code === 50007,
    save: async (patch) => { events.push('save'); Object.assign(item, patch); },
  };
  return { item, events, deps };
}

test('archive et suppression précèdent le MP ; les étapes restent enregistrées', async () => {
  const s = scenario();
  await executeTicketUpdateReset(s.item, s.deps);
  assert.deepEqual(s.events, ['validate', 'archive', 'delete', 'save', 'notify', 'save', 'save']);
  assert.equal(s.item.dm_status, 'sent');
  assert.ok(s.item.deleted_at && s.item.completed_at);
});

for (const failure of ['validate', 'archive', 'delete']) {
  test(`échec ${failure} : aucune annonce de suppression ni validation finale`, async () => {
    const s = scenario(failure);
    await assert.rejects(() => executeTicketUpdateReset(s.item, s.deps), new RegExp(failure));
    assert.ok(!s.events.includes('notify'));
    assert.ok(!s.item.completed_at && !s.item.deleted_at);
    if (failure !== 'delete') assert.ok(!s.events.includes('delete'));
  });
}

test('panne de sauvegarde du point de reprise : pas de MP annoncé', async () => {
  const s = scenario();
  s.deps.save = async () => { throw new Error('base indisponible'); };
  await assert.rejects(() => executeTicketUpdateReset(s.item, s.deps), /base indisponible/);
  assert.ok(!s.events.includes('notify'));
});

test('MP fermé : terminer le ticket en signalant que le demandeur n’a pas reçu le MP', async () => {
  const s = scenario();
  s.deps.notify = async () => { throw Object.assign(new Error('Cannot send messages'), { code: 50007 }); };
  await executeTicketUpdateReset(s.item, s.deps);
  assert.equal(s.item.dm_status, 'unavailable');
  assert.match(s.item.dm_error, /50007/);
  assert.ok(s.item.completed_at);
});

test('panne temporaire de MP : reprise sans nouvelle suppression', async () => {
  const s = scenario('notify');
  await assert.rejects(() => executeTicketUpdateReset(s.item, s.deps), /notify/);
  assert.ok(s.item.deleted_at && !s.item.completed_at);
  s.deps.notify = async () => { s.events.push('notify-ok'); };
  await executeTicketUpdateReset(s.item, s.deps);
  assert.equal(s.events.filter((e) => e === 'delete').length, 1);
  assert.equal(s.item.dm_status, 'sent');
});

test('MP déjà enregistré : une reprise termine sans double envoi', async () => {
  const s = scenario();
  s.item.deleted_at = UPDATE_RESET_CUTOFF;
  s.item.dm_status = 'sent';
  await executeTicketUpdateReset(s.item, s.deps);
  assert.deepEqual(s.events, ['save']);
});

test('protection des nouveaux tickets, des salons réservés et des dates invalides', () => {
  const old = { channel_id: 'ticket-channel', created_at: UPDATE_RESET_CUTOFF };
  assert.doesNotThrow(() => assertResetTarget(old, ['panel', 'logs', 'category']));
  for (const channel_id of ['panel', 'logs', 'category', '']) {
    assert.throws(() => assertResetTarget({ ...old, channel_id }, ['panel', 'logs', 'category']));
  }
  assert.throws(() => assertResetTarget({ ...old, created_at: '2026-10-01T22:06:32Z' }, []));
  assert.throws(() => assertResetTarget({ ...old, created_at: 'invalide' }, []));
  const sql = fs.readFileSync(path.resolve(__dirname, '../supabase/reset_support_tickets_october_2026.sql'), 'utf8');
  assert.ok(sql.includes(UPDATE_RESET_CUTOFF), 'la borne du SQL doit rester identique à celle du serveur');
});

// Adaptateur Supabase en mémoire pour exercer le vrai traitement, y compris
// la sélection, la prise de verrou et les points de reprise de la file.
function integration({ channelGuild = 'guild', dmError, missingTable = false, deleted = false } = {}) {
  const queue = [{ ticket_id: 'old', deleted_at: null, dm_status: 'pending', completed_at: null,
    next_attempt_at: '2000-01-01T00:00:00Z', requested_at: '2000-01-01T00:00:00Z', lease_until: null }];
  const tickets = [{ id: 'old', channel_id: '123456789012345678', discord_user_id: 'owner', short_id: 'abc1',
    created_at: '2026-09-30T00:00:00Z' },
  { id: 'new', channel_id: 'new-channel', created_at: '2026-10-02T00:00:00Z' }];
  const events = [];
  let deletedChannel = deleted;
  const admin = { from(table) {
    const filters = [];
    let patch, limit = Infinity, single = false;
    const q = {
      select: () => q, update: (value) => { patch = value; return q; },
      eq: (key, value) => { filters.push((r) => r[key] === value); return q; },
      is: (key, value) => { filters.push((r) => r[key] === value); return q; },
      lte: (key, value) => { filters.push((r) => r[key] <= value); return q; },
      or: (expression) => {
        const date = expression.slice(expression.indexOf('.lt.') + 4);
        filters.push((r) => r.lease_until === null || r.lease_until < date); return q;
      },
      order: () => q, limit: (value) => { limit = value; return q; },
      single: () => { single = true; return q; },
      then(resolve, reject) {
        if (missingTable && table === 'support_ticket_update_resets') {
          return Promise.resolve({ data: null, error: { code: 'PGRST205' } }).then(resolve, reject);
        }
        const source = table === 'support_tickets' ? tickets : queue;
        const rows = source.filter((r) => filters.every((fn) => fn(r))).slice(0, limit);
        if (patch) rows.forEach((r) => Object.assign(r, patch));
        return Promise.resolve({ data: structuredClone(single ? rows[0] : rows), error: null }).then(resolve, reject);
      },
    };
    return q;
  } };
  const processor = loadTs('src/lib/support/update-reset.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/support/bot-auth': { getSupportConfig: async () => ({ guild_id: 'guild', panel_channel_id: 'panel', logs_channel_id: 'logs', category_ids: { support: 'category' } }) },
    '@/lib/support/close-ticket': { closeSupportTicket: async (args) => {
      assert.equal(args.deleteChannel, false);
      assert.equal(args.requireDiscordHistory, true);
      events.push(['archive', args.channelId]); return { ok: true };
    } },
    '@/lib/support/discord-api': {
      discordDeleteChannel: async (id) => {
        events.push(['delete', id]);
        if (deletedChannel) throw Object.assign(new Error('Unknown Channel'), { status: 404 });
        deletedChannel = true;
      },
      discordFetch: async (url, init) => {
        if (url === '/channels/123456789012345678') {
          if (deletedChannel) throw Object.assign(new Error('Unknown Channel'), { status: 404 });
          return { guild_id: channelGuild, type: 0 };
        }
        if (url === '/users/@me/channels') {
          assert.equal(JSON.parse(init.body).recipient_id, 'owner'); return { id: 'dm' };
        }
        assert.equal(url, '/channels/dm/messages');
        if (dmError) throw dmError;
        const payload = JSON.parse(init.body);
        assert.match(payload.content, /rouvrir|ouvrir un nouveau ticket/);
        assert.match(payload.content, /https:\/\/discord.com\/channels\/guild\/panel/);
        assert.deepEqual(payload.allowed_mentions, { parse: [] });
        assert.equal(payload.enforce_nonce, true);
        assert.ok(payload.nonce.length <= 25);
        events.push(['dm', 'owner']); return { id: 'message' };
      },
    },
    '@/lib/support/update-reset-workflow': workflow,
  });
  return { process: processor.processTicketUpdateReset, queue, events };
}

test('deux workers simultanés : un seul traitement, nouveau ticket conservé', async () => {
  const s = integration();
  const results = await Promise.all([s.process(), s.process()]);
  assert.equal(results.filter((r) => r.status === 'processed').length, 1);
  assert.deepEqual(s.events, [['archive', '123456789012345678'], ['delete', '123456789012345678'], ['dm', 'owner']]);
  assert.equal((await s.process()).status, 'idle');
});

test('migration absente : aucune suppression', async () => {
  const s = integration({ missingTable: true });
  assert.equal((await s.process()).status, 'migration_required');
  assert.deepEqual(s.events, []);
});

test('salon d’un autre serveur : refus sans archivage, suppression ou MP', async () => {
  const s = integration({ channelGuild: 'other' });
  assert.equal((await s.process()).status, 'retry');
  assert.deepEqual(s.events, []);
});

test('ticket nouveau placé par erreur dans la file : refus sans effet Discord', async () => {
  const s = integration();
  s.queue[0].ticket_id = 'new';
  assert.equal((await s.process()).status, 'retry');
  assert.deepEqual(s.events, []);
});

test('salon déjà supprimé : 404 accepté et demandeur averti', async () => {
  const s = integration({ deleted: true });
  assert.equal((await s.process()).status, 'processed');
  assert.equal(s.queue[0].dm_status, 'sent');
});

test('erreur temporaire Discord : état conservé et attente avant nouvelle tentative', async () => {
  const s = integration({ dmError: Object.assign(new Error('rate limited'), { status: 429 }) });
  assert.equal((await s.process()).status, 'retry');
  assert.ok(s.queue[0].deleted_at);
  assert.equal(s.queue[0].dm_status, 'pending');
  assert.equal(s.queue[0].lease_token, null);
  assert.equal((await s.process()).status, 'idle');
});

test('erreur Discord 50007 conservée par le client HTTP', async () => {
  const api = loadTs('src/lib/support/discord-api.ts', { '@/lib/discord-link': { getDiscordGuildId: () => '' } });
  const originalFetch = global.fetch;
  const originalToken = process.env.SUPPORT_BOT_TOKEN;
  process.env.SUPPORT_BOT_TOKEN = 'offline-test';
  global.fetch = async () => new Response(JSON.stringify({ code: 50007, message: 'Cannot send messages to this user' }), { status: 403 });
  try {
    await assert.rejects(() => api.discordFetch('/channels/dm/messages'), (error) => error.code === 50007 && error.status === 403);
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.SUPPORT_BOT_TOKEN;
    else process.env.SUPPORT_BOT_TOKEN = originalToken;
  }
});

function archiveScenario({ readError, saveError } = {}) {
  const events = [];
  const admin = { from() {
    let patch;
    const q = {
      select: () => q, eq: () => q, update: (value) => { patch = value; return q; },
      maybeSingle: async () => ({ data: { id: 'old', short_id: 'abc1', conversation: [], closed_at: null } }),
      then(resolve, reject) {
        events.push(['save', patch]);
        return Promise.resolve({ error: saveError || null }).then(resolve, reject);
      },
    };
    return q;
  } };
  const { closeSupportTicket } = loadTs('src/lib/support/close-ticket.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/support/bot-auth': { getSupportConfig: async () => null },
    '@/lib/support/discord-api': {
      discordGetMessages: async () => { if (readError) throw readError; return []; },
      discordDeleteChannel: async () => { events.push(['delete']); },
    },
    '@/lib/support/transcript': {
      parseDiscordMessages: () => [], messagesFromConversation: () => [],
      newTranscriptToken: () => 'token', textTranscriptDump: () => 'transcript',
    },
  });
  return { events, close: closeSupportTicket };
}

test('vrai archivage : panne de lecture bloque toute fermeture pendant la remise à zéro', async () => {
  const s = archiveScenario({ readError: Object.assign(new Error('Discord unavailable'), { status: 503 }) });
  await assert.rejects(() => s.close({ channelId: 'old', closedBy: 'mise_a_jour_bot', requireDiscordHistory: true, deleteChannel: false }));
  assert.deepEqual(s.events, []);
});

test('vrai archivage : deux échecs de sauvegarde interdisent la suppression', async () => {
  const s = archiveScenario({ saveError: { message: 'database unavailable' } });
  await assert.rejects(() => s.close({ channelId: 'old', closedBy: 'mise_a_jour_bot', requireDiscordHistory: true, deleteChannel: false }));
  assert.equal(s.events.filter((e) => e[0] === 'save').length, 2);
  assert.ok(!s.events.some((e) => e[0] === 'delete'));
});

test('vrai archivage : sauvegarder sans supprimer ; fermeture habituelle inchangée', async () => {
  const s = archiveScenario();
  assert.equal((await s.close({ channelId: 'old', closedBy: 'mise_a_jour_bot', deleteChannel: false })).ok, true);
  assert.deepEqual(s.events.map((e) => e[0]), ['save']);
  await s.close({ channelId: 'another', closedBy: 'user:owner' });
  assert.deepEqual(s.events.map((e) => e[0]), ['save', 'save', 'delete']);
});
