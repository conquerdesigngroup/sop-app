/**
 * alert-push — Web Push digests for management.
 *
 * WHY THIS EXISTS
 *
 * Overdue and unassigned tasks used to be visible only to whoever opened the
 * Alerts page. This sends them to management's phones instead. Storage and
 * the schedule are in migration v38; the browser side is src/lib/push.ts.
 *
 * ACTIONS (POST, JSON body)
 *
 *   { action: 'public-key' }   any signed-in staff. Returns the VAPID public
 *                              key, generating and storing the pair on the
 *                              very first call so nothing is pasted anywhere.
 *   { action: 'test' }         management. Sends a notification to the
 *                              caller's own subscriptions right now.
 *   { source: 'cron' }         the pg_cron hook, authenticated with the
 *                              service-role key. Runs the digest for every
 *                              opted-in manager, at most once per 20 hours
 *                              per subscription.
 *   { action: 'digest' }       management. Same as cron, on demand.
 *
 * TWO CLIENTS, as in admin-users: `admin` (service role) reads every table
 * regardless of RLS and is the only thing that may fetch the private key;
 * `caller` (anon key + the request's Authorization) is what tells us who is
 * asking.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

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

type Role = 'super_admin' | 'admin' | 'team' | 'client';

interface SubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  last_sent_at: string | null;
  failures: number;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  scheduled_date: string;
  assigned_to: string[] | null;
}

const THROTTLE_HOURS = 20;
// The studio's zone — the calendar sync reports its Google calendars in
// America/Los_Angeles, so "today" here must mean today in California.
const TZ = Deno.env.get('ALERT_TZ') ?? 'America/Los_Angeles';

/** Today's date, YYYY-MM-DD, in the studio's timezone — not the server's. */
const todayIso = (): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) return json(500, { error: 'Function is missing its environment' });

  const authHeader = req.headers.get('Authorization') ?? '';
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let body: { action?: string; source?: string } = {};
  try { body = await req.json(); } catch { /* empty body is fine for cron */ }

  // Who is asking. The cron hook sends the service-role key itself; anyone
  // else must be a signed-in staff member.
  //
  // Recognised by the token's role claim, not by comparing it to the env
  // value: the gateway has already verified the signature (verify_jwt), and
  // the copy in Vault need not be byte-identical to the one in Deno.env — a
  // trailing newline was enough to make a string compare answer "Not signed
  // in" to the cron job.
  const isServiceCall = (() => {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload?.role === 'service_role';
    } catch {
      return false;
    }
  })();
  let callerId: string | null = null;
  let callerRole: Role | null = null;
  if (!isServiceCall) {
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
    callerRole = profile.role as Role;
  }
  const callerIsManagement = callerRole === 'admin' || callerRole === 'super_admin';

  // ---------------------------------------------------------------- keys

  const ensureKeys = async (): Promise<{ publicKey: string; privateKey: string }> => {
    const { data: existing } = await admin.from('push_vapid').select('public_key').maybeSingle();
    const { data: priv } = await admin.rpc('push_vapid_private_key');
    if (existing?.public_key && priv) {
      return { publicKey: existing.public_key, privateKey: priv as string };
    }
    const pair = webpush.generateVAPIDKeys();
    const { error } = await admin.rpc('push_vapid_store', {
      p_public: pair.publicKey, p_private: pair.privateKey,
    });
    if (error) throw new Error(`Could not store VAPID keys: ${error.message}`);
    return pair;
  };

  if (body.action === 'public-key') {
    if (!callerId && !isServiceCall) return json(401, { error: 'Not signed in' });
    try {
      const { publicKey } = await ensureKeys();
      return json(200, { publicKey });
    } catch (e) {
      return json(500, { error: (e as Error).message });
    }
  }

  // ---------------------------------------------------------------- sending

  const send = async (
    subs: SubscriptionRow[],
    payload: { title: string; body: string; url: string; tag: string },
    keys: { publicKey: string; privateKey: string },
  ) => {
    webpush.setVapidDetails('mailto:conquerdesigngroup@gmail.com', keys.publicKey, keys.privateKey);
    const text = JSON.stringify(payload);
    let sent = 0, dropped = 0, failed = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          text,
          { TTL: 60 * 60 * 12 },
        );
        sent++;
        await admin.from('push_subscriptions')
          .update({ last_sent_at: new Date().toISOString(), failures: 0 })
          .eq('id', sub.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 404/410: the browser unsubscribed or the endpoint expired. Gone
        // for good, so drop the row rather than fail every morning.
        if (status === 404 || status === 410) {
          dropped++;
          await admin.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          failed++;
          console.error('push failed', sub.id, status, (e as Error).message);
          await admin.from('push_subscriptions')
            .update({ failures: (sub.failures ?? 0) + 1 })
            .eq('id', sub.id);
        }
      }
    }
    return { sent, dropped, failed };
  };

  if (body.action === 'test') {
    if (!callerIsManagement) return json(403, { error: 'Management only' });
    const { data: subs } = await admin
      .from('push_subscriptions').select('*').eq('user_id', callerId!);
    if (!subs?.length) return json(200, { sent: 0, note: 'No subscription for this account' });
    try {
      const keys = await ensureKeys();
      const result = await send(subs as SubscriptionRow[], {
        title: 'DIDC test notification',
        body: 'Push is working on this device.',
        url: '/alerts',
        tag: 'didc-test',
      }, keys);
      return json(200, result);
    } catch (e) {
      return json(500, { error: (e as Error).message });
    }
  }

  // ---------------------------------------------------------------- digest

  if (body.source === 'cron' || body.action === 'digest') {
    if (!isServiceCall && !callerIsManagement) return json(403, { error: 'Management only' });

    const today = todayIso();
    const { data: tasks, error: tasksError } = await admin
      .from('job_tasks')
      .select('id, title, status, scheduled_date, assigned_to')
      .not('status', 'in', '("completed","archived","draft")');
    if (tasksError) return json(500, { error: tasksError.message });

    const rows = (tasks ?? []) as TaskRow[];
    const overdue = rows.filter(t => t.status === 'overdue' || t.scheduled_date < today);
    const unassigned = rows.filter(t => !t.assigned_to || t.assigned_to.length === 0);

    if (overdue.length === 0 && unassigned.length === 0) {
      return json(200, { sent: 0, note: 'Nothing to report' });
    }

    // Opted-in management: role, active, and both preference flags not off.
    // Preferences default to on in the schema, so a null is a yes.
    const { data: managers } = await admin
      .from('profiles')
      .select('id, notification_preferences')
      .in('role', ['admin', 'super_admin'])
      .neq('is_active', false);
    const wanted = new Set(
      (managers ?? [])
        .filter(m => {
          const p = (m.notification_preferences ?? {}) as Record<string, unknown>;
          return p.pushEnabled !== false && p.overdueAlerts !== false;
        })
        .map(m => m.id),
    );
    if (wanted.size === 0) return json(200, { sent: 0, note: 'Nobody opted in' });

    const { data: subs } = await admin
      .from('push_subscriptions').select('*').in('user_id', Array.from(wanted));
    if (!subs?.length) return json(200, { sent: 0, note: 'Nobody has subscribed a device yet' });
    const cutoff = Date.now() - THROTTLE_HOURS * 60 * 60 * 1000;
    const due = ((subs ?? []) as SubscriptionRow[]).filter(s =>
      isServiceCall ? !s.last_sent_at || new Date(s.last_sent_at).getTime() < cutoff : true,
    );
    if (due.length === 0) return json(200, { sent: 0, note: 'All subscriptions notified recently' });

    const parts: string[] = [];
    if (overdue.length) parts.push(`${overdue.length} overdue`);
    if (unassigned.length) parts.push(`${unassigned.length} unassigned`);
    const named = overdue.slice(0, 3).map(t => t.title);
    const more = overdue.length - named.length;
    const bodyText = named.length
      ? `${named.join(' · ')}${more > 0 ? ` · +${more} more` : ''}`
      : `${unassigned.length} task${unassigned.length === 1 ? '' : 's'} with nobody assigned`;

    try {
      const keys = await ensureKeys();
      const result = await send(due, {
        title: `DIDC: ${parts.join(', ')}`,
        body: bodyText,
        url: '/alerts',
        tag: 'didc-alert-digest',
      }, keys);
      return json(200, { ...result, overdue: overdue.length, unassigned: unassigned.length });
    } catch (e) {
      return json(500, { error: (e as Error).message });
    }
  }

  return json(400, { error: 'Unknown action' });
});
