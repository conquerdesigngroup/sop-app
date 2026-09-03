import { supabase, isSupabaseConfigured } from './supabase';

/**
 * Web Push, browser side.
 *
 * The Settings toggle used to write `pushEnabled` to the profile and stop.
 * This is the part that was missing: ask the browser, subscribe through the
 * service worker, and hand the subscription to the alert-push function's
 * table so the daily digest has somewhere to go. Migration v38 has the
 * storage; supabase/functions/alert-push does the sending.
 *
 * Only ever called from a click. Browsers refuse a permission prompt that
 * is not the direct result of a gesture, and rightly so.
 */

export type PushSupport =
  | 'ok'
  /** No Push API at all (old browser, some in-app browsers). */
  | 'unsupported'
  /** iPhone or iPad in Safari: Web Push only works once installed to the Home Screen. */
  | 'needs-install'
  /** Permission was denied earlier; only the browser's site settings can undo that. */
  | 'blocked';

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches
  || (navigator as unknown as { standalone?: boolean }).standalone === true;

export const pushSupport = (): PushSupport => {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIos() && !isInstalled() ? 'needs-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'blocked';
  return 'ok';
};

const urlBase64ToUint8Array = (base64: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

/**
 * The registration, or an explanation. `serviceWorker.ready` never resolves
 * when nothing is registered — which is every dev build, since registration
 * is gated on NODE_ENV === 'production' — so wait a bounded time instead.
 */
const getRegistration = async (): Promise<ServiceWorkerRegistration> => {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  const ready = navigator.serviceWorker.ready;
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('No service worker is installed on this page. Push works on the installed app and on production builds only.')), 4000),
  );
  return Promise.race([ready, timeout]);
};

export const hasPushSubscription = async (): Promise<boolean> => {
  if (pushSupport() !== 'ok') return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
};

const fetchPublicKey = async (): Promise<string> => {
  const { data, error } = await supabase.functions.invoke('alert-push', {
    body: { action: 'public-key' },
  });
  if (error) throw new Error(error.message || 'Could not reach the notification service');
  if (!data?.publicKey) throw new Error('The notification service returned no key');
  return data.publicKey as string;
};

/** Ask, subscribe, and record. Throws with a message fit to show. */
export const enablePush = async (userId: string): Promise<void> => {
  if (!isSupabaseConfigured() || !supabase) throw new Error('Notifications need the online app');
  const support = pushSupport();
  if (support === 'needs-install') throw new Error('On iPhone, add the app to your Home Screen first, then turn this on from there.');
  if (support === 'unsupported') throw new Error('This browser cannot receive push notifications.');
  if (support === 'blocked') throw new Error('Notifications are blocked for this site. Allow them in your browser settings, then try again.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed.');

  const reg = await getRegistration();
  const publicKey = await fetchPublicKey();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  const raw = sub.toJSON();
  const keys = raw.keys ?? {};
  if (!raw.endpoint || !keys.p256dh || !keys.auth) throw new Error('The browser returned an incomplete subscription.');

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: raw.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: navigator.userAgent.slice(0, 200),
    },
    { onConflict: 'endpoint' },
  );
  if (error) throw new Error(error.message);
};

/** Forget this browser. Safe to call when nothing was subscribed. */
export const disablePush = async (): Promise<void> => {
  if (pushSupport() === 'unsupported') return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  if (supabase) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  }
  await sub.unsubscribe();
};

/** Management only, enforced by the function. Resolves with what it did. */
export const sendTestPush = async (): Promise<{ sent: number; note?: string }> => {
  const { data, error } = await supabase.functions.invoke('alert-push', {
    body: { action: 'test' },
  });
  if (error) throw new Error(error.message || 'Could not reach the notification service');
  return data as { sent: number; note?: string };
};
