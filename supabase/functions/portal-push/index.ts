/**
 * portal-push — Web Push for families.
 *
 * WHY THIS IS NOT PART OF alert-push
 *
 * They share the VAPID keypair and nothing else. alert-push is
 * management-shaped: it checks for admin/super_admin, builds a once-a-day
 * digest of overdue tasks, and throttles each subscription to one send per 20
 * hours. A cancelled class at 4pm cannot wait 20 hours, and a parent is not an
 * admin. Bending one function to serve both audiences is how the role checks
 * end up wrong in the direction that matters.
 *
 * ACTIONS (POST, JSON body)
 *
 *   { source: 'cron' }      the pg_cron hook (v42), service-role key. Drains
 *                           push_outbox.
 *   { action: 'drain' }     management. The same drain, on demand, so a change
 *                           can be tested without waiting for the minute.
 *   { action: 'test' }      ANY signed-in account, staff or client. Sends to
 *                           the caller's OWN subscriptions and nowhere else,
 *                           which is the only way to prove push works on a
 *                           real phone before real notices depend on it.
 *
 * WHAT LIMITS THE RATE
 *
 * Coalescing, and only coalescing. Everything pending in one drain becomes ONE
 * notification per person, so five notices published in half a minute produce
 * one buzz saying there are five. That is the entire rate limit and it is
 * deliberate — a per-recipient throttle would have to hold a notice back for
 * SOME of its audience, which needs per-recipient state, and the version
 * without that state silently drops the notice for whoever was throttled.
 * Coalescing has no such failure mode.
 *
 * Quiet hours are the other half, and they hold the whole outbox row rather
 * than any subset of its audience, so they cannot drop anything either: the
 * row simply stays pending until the window opens.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  PushPayload,
  SubscriptionRow,
  ensureKeys,
  isServiceCall,
  sendToSubscriptions,
} from '../_shared/webpush.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-application-name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

/** The studio's zone. "Evening" has to mean evening in California. */
const TZ = Deno.env.get('ALERT_TZ') ?? 'America/Los_Angeles';

// Nothing non-urgent goes out before 08:00 or after 21:00 local. A pinned
// notice ignores this: is_pinned is the studio saying it matters, and a
// cancellation for tomorrow morning is worth a 9pm buzz.
const QUIET_END_HOUR = 8;
const QUIET_START_HOUR = 21;

const BATCH = 100;
const MAX_ATTEMPTS = 5;

/** hourCycle h23, or midnight formats as 24 and every comparison below is off. */
const localHour = (): number => {
  const text = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', hourCycle: 'h23',
  }).format(new Date());
  return Number.parseInt(text, 10);
};

const inQuietHours = (): boolean => {
  const hour = localHour();
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
};

interface OutboxRow {
  id: string;
  kind: string;
  source_id: string;
  attempts: number;
}

interface Payload {
  valid: boolean;
  reason?: string;
  title: string;
  body: string;
  url: string;
  urgent: boolean;
  preference: string;
  recipients: string[];
}

/** One notice owed to one person. */
interface Notice {
  sourceId: string;
  title: string;
  body: string;
  url: string;
}

/**
 * The body is plain text with blank lines between paragraphs (the admin form
 * says so). A notification gets the first real line of it — the rest is what
 * tapping through is for.
 */
const firstLine = (body: string): string => {
  const line = body.split('\n').map(l => l.trim()).find(Boolean) ?? '';
  return line.length > 140 ? `${line.slice(0, 139)}…` : line;
};

/**
 * ONE TAG PER NOTICE, never one per kind.
 *
 * A tag REPLACES any notification already showing with the same tag. That is
 * right for alert-push, where the second digest supersedes the first. It is
 * wrong here: two different announcements sharing a tag would collapse into
 * one and the first would vanish from the tray unread.
 */
const compose = (notices: Notice[]): PushPayload => {
  if (notices.length === 1) {
    const only = notices[0];
    return {
      title: only.title,
      body: firstLine(only.body) || 'Tap to read it in the portal.',
      url: only.url,
      tag: `didc-portal-${only.sourceId}`,
    };
  }

  const newest = notices[notices.length - 1];
  const sameDestination = notices.every(n => n.url === notices[0].url);

  // Named, then counted. A teacher uploading a class album publishes fifty
  // documents in one go, and fifty titles joined together is not a
  // notification — every push service truncates it, and the reader learns
  // nothing from the half that survives.
  const named = notices.slice(0, 3).map(n => n.title);
  const more = notices.length - named.length;

  return {
    title: `DIDC · ${notices.length} new notices`,
    body: `${named.join(' · ')}${more > 0 ? ` · +${more} more` : ''}`,
    // Where they disagree, the portal home is the honest destination: it is
    // the one page that leads to all of them.
    url: sameDestination ? notices[0].url : '/portal',
    tag: `didc-portal-${newest.sourceId}`,
  };
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) {
    return json(500, { error: 'Function is missing its environment' });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let body: { action?: string; source?: string } = {};
  try { body = await req.json(); } catch { /* an empty body is fine for cron */ }

  // Two clients, as in alert-push: `admin` reads every table regardless of RLS
  // and is the only thing that may fetch the private key; `caller` is what
  // tells us who is asking.
  const service = isServiceCall(authHeader);
  let callerId: string | null = null;
  let callerRole: string | null = null;

  if (!service) {
    const caller = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error } = await caller.auth.getUser();
    if (error || !user) return json(401, { error: 'Not signed in' });
    const { data: profile } = await admin
      .from('profiles').select('role, is_active').eq('id', user.id).maybeSingle();
    if (!profile || profile.is_active === false) return json(403, { error: 'No active profile' });
    callerId = user.id;
    callerRole = profile.role as string;
  }

  const callerIsManagement = callerRole === 'admin' || callerRole === 'super_admin';

  // ---------------------------------------------------------------- test
  //
  // Reaches the caller's own subscriptions and nothing else, so it needs no
  // role beyond "is a real, active account" — a parent proving notifications
  // work on their phone is the whole point of it.

  if (body.action === 'test') {
    if (!callerId) return json(401, { error: 'Not signed in' });
    const { data: subs } = await admin
      .from('push_subscriptions').select('*').eq('user_id', callerId);
    if (!subs?.length) return json(200, { sent: 0, note: 'No subscription for this device yet' });
    try {
      const keys = await ensureKeys(admin);
      const result = await sendToSubscriptions(admin, subs as SubscriptionRow[], {
        title: 'DIDC',
        body: 'Notifications are working on this device.',
        url: '/portal',
        tag: 'didc-portal-test',
      }, keys);
      return json(200, result);
    } catch (e) {
      return json(500, { error: (e as Error).message });
    }
  }

  // ---------------------------------------------------------------- drain

  if (body.source === 'cron' || body.action === 'drain') {
    if (!service && !callerIsManagement) return json(403, { error: 'Management only' });

    const { data: pending, error: outboxError } = await admin
      .from('push_outbox')
      .select('id, kind, source_id, attempts')
      .is('sent_at', null)
      .lt('attempts', MAX_ATTEMPTS)
      .order('created_at', { ascending: true })
      .limit(BATCH);

    if (outboxError) return json(500, { error: outboxError.message });
    if (!pending?.length) return json(200, { processed: 0, note: 'Nothing waiting' });

    const quiet = inQuietHours();
    const byProfile = new Map<string, Notice[]>();
    const resolved: string[] = [];   // outbox ids to mark sent after the pass
    let held = 0;
    let dropped = 0;

    for (const row of pending as OutboxRow[]) {
      const { data, error } = await admin.rpc('portal_push_payload', {
        p_kind: row.kind,
        p_source_id: row.source_id,
      });

      // A transient failure. Leave it pending and count the attempt, so a row
      // that can never be resolved stops being retried after MAX_ATTEMPTS
      // rather than forever.
      if (error) {
        console.error('payload lookup failed', row.id, error.message);
        await admin.from('push_outbox')
          .update({ attempts: row.attempts + 1, last_error: error.message })
          .eq('id', row.id);
        continue;
      }

      const payload = data as Payload;

      // Deleted or unpublished inside the minute. Resolved, not failed.
      if (!payload?.valid) {
        dropped++;
        await admin.from('push_outbox')
          .update({ sent_at: new Date().toISOString(), last_error: payload?.reason ?? 'not sendable' })
          .eq('id', row.id);
        continue;
      }

      // Holds the whole row, so nobody in its audience is skipped — it goes
      // out intact when the window opens.
      if (quiet && !payload.urgent) {
        held++;
        continue;
      }

      if (!payload.recipients?.length) {
        dropped++;
        await admin.from('push_outbox')
          .update({ sent_at: new Date().toISOString(), last_error: 'nobody opted in' })
          .eq('id', row.id);
        continue;
      }

      resolved.push(row.id);
      for (const profileId of payload.recipients) {
        const notices = byProfile.get(profileId) ?? [];
        notices.push({
          sourceId: row.source_id,
          title: payload.title,
          body: payload.body,
          url: payload.url,
        });
        byProfile.set(profileId, notices);
      }
    }

    if (byProfile.size === 0) {
      return json(200, { processed: pending.length, sent: 0, held, dropped });
    }

    const profileIds = Array.from(byProfile.keys());
    const { data: subs } = await admin
      .from('push_subscriptions').select('*').in('user_id', profileIds);

    const subsByProfile = new Map<string, SubscriptionRow[]>();
    for (const sub of (subs ?? []) as SubscriptionRow[]) {
      const list = subsByProfile.get(sub.user_id) ?? [];
      list.push(sub);
      subsByProfile.set(sub.user_id, list);
    }

    let sent = 0, failed = 0, endpointsDropped = 0, noDevice = 0;

    try {
      const keys = await ensureKeys(admin);

      for (const [profileId, notices] of byProfile) {
        const theirSubs = subsByProfile.get(profileId);
        // Opted in on the profile but never subscribed a browser. Not an
        // error: they turned the switch on and then cleared their site data,
        // or they only ever signed in on a desktop that refused permission.
        if (!theirSubs?.length) { noDevice++; continue; }

        const result = await sendToSubscriptions(admin, theirSubs, compose(notices), keys);
        sent += result.sent;
        failed += result.failed;
        endpointsDropped += result.dropped;
      }
    } catch (e) {
      // The keypair could not be reached. Nothing was sent, so nothing is
      // marked sent, and the next minute tries again.
      return json(500, { error: (e as Error).message });
    }

    // Marked after one full pass, not per recipient. Retrying a notice because
    // one endpoint was unreachable would re-notify everyone else who already
    // has it; the failure is recorded on the subscription instead.
    if (resolved.length) {
      await admin.from('push_outbox')
        .update({ sent_at: new Date().toISOString() })
        .in('id', resolved);
    }

    return json(200, {
      processed: pending.length,
      notices: resolved.length,
      people: byProfile.size,
      sent,
      failed,
      endpointsDropped,
      noDevice,
      held,
      dropped,
      quiet,
    });
  }

  return json(400, { error: 'Unknown action' });
});
