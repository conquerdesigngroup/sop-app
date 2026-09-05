/**
 * The Web Push bits both senders need.
 *
 * alert-push (v38) still carries its own copy of all of this. It is deployed,
 * it works, and it sends management's morning digest — so it was left alone
 * rather than refactored blind. When it is next touched, this is where its
 * copy should go.
 *
 * The three things worth having in one place are each a bug that was already
 * paid for once:
 *
 *   - a 404/410 from a push service means the endpoint is GONE, and the row
 *     has to be deleted or it fails every single run, forever;
 *   - the service-role check must read the JWT's role CLAIM, never compare the
 *     token to Deno.env — a trailing newline on the copy in Vault was enough
 *     to make the cron job authenticate as nobody;
 *   - the VAPID keypair is generated on first use and stored through
 *     push_vapid_store(), so nothing is ever pasted into a dashboard. BOTH
 *     senders must use the SAME pair: re-keying invalidates every subscription
 *     already stored in every browser.
 */

import webpush from 'npm:web-push@3.6.7';

export interface SubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  last_sent_at: string | null;
  failures: number;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

/**
 * Is this the cron hook calling?
 *
 * By the role claim, because the gateway has already verified the signature
 * (verify_jwt) and the copy of the key in Vault need not be byte-identical to
 * the one in Deno.env.
 */
export const isServiceCall = (authHeader: string): boolean => {
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
};

/** The stored pair, generating and storing one on the very first call. */
export const ensureKeys = async (admin: Admin): Promise<VapidKeys> => {
  const { data: existing } = await admin.from('push_vapid').select('public_key').maybeSingle();
  const { data: priv } = await admin.rpc('push_vapid_private_key');
  if (existing?.public_key && priv) {
    return { publicKey: existing.public_key, privateKey: priv as string };
  }
  const pair = webpush.generateVAPIDKeys();
  const { error } = await admin.rpc('push_vapid_store', {
    p_public: pair.publicKey,
    p_private: pair.privateKey,
  });
  if (error) throw new Error(`Could not store VAPID keys: ${error.message}`);
  return pair;
};

export interface SendResult {
  sent: number;
  dropped: number;
  failed: number;
}

export const sendToSubscriptions = async (
  admin: Admin,
  subs: SubscriptionRow[],
  payload: PushPayload,
  keys: VapidKeys,
): Promise<SendResult> => {
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
      if (status === 404 || status === 410) {
        // The browser unsubscribed, or the endpoint expired. Gone for good.
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
