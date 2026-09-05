import React, { useCallback, useEffect, useRef, useState } from 'react';
import { theme } from '../../theme';
import { Card, Divider, Spinner, Toggle } from '../ui';
import CardError from './CardError';
import InstallAppGuide from '../InstallAppGuide';
import { usePortalAuth } from '../../contexts/PortalAuthContext';
import { useRefreshable } from '../../contexts/RefreshContext';
import { disablePush, enablePush, hasPushSubscription, pushSupport } from '../../lib/push';
import {
  DEFAULT_PORTAL_PREFS,
  PORTAL_NOTIFICATION_CATEGORIES,
  PortalCategoryKey,
  PortalNotificationPrefs,
  PrefsError,
  readPortalPrefs,
  writePortalPrefs,
} from '../../lib/portalNotifications';
import { ProfileCardProps } from '../../lib/profileCards';

/**
 * Notifications — the parent's own on/off switch.
 *
 * WHAT THE MASTER SWITCH MEANS
 *
 * It means BOTH "subscribe this browser" and "my account wants these", and it
 * has to, because those are two different records and a parent is being shown
 * one switch.
 *
 *   on  → subscribe this browser (push_subscriptions) AND set pushEnabled
 *   off → unsubscribe this browser AND clear pushEnabled
 *
 * Clearing the account preference on "off" is the arguable half. A family with
 * a phone and an iPad who switch off on the phone will find the iPad quiet
 * too. The alternative — off means this device only — leaves the account
 * saying yes while the switch says no, and produces a notification on the
 * other device ten minutes after somebody deliberately turned it off. That is
 * the worse surprise, and it is not recoverable by the person who caused it.
 * This one is: the iPad's switch shows off, and turning it on there restores
 * both. The helper text below names both facts rather than hiding the
 * distinction.
 *
 * THE THIRD SWITCH IS NOT OURS
 *
 * The OS permission sits above both records and only the parent can change it.
 * pushSupport() reports which of the four situations they are in, and each one
 * gets a real answer here — a dead toggle with no explanation is how this
 * feature gets abandoned. 'needs-install' is the DEFAULT case for this
 * audience, not an edge case: iPhone Safari delivers Web Push only to a site
 * on the Home Screen, and most of these families are on iPhones. It reuses
 * InstallAppGuide rather than writing a second set of instructions that would
 * drift from the ones on the front door.
 */

const CATEGORY_NOTE =
  'These apply everywhere you are signed in. The switch above is just this device.';

const NotificationsCard: React.FC<ProfileCardProps> = () => {
  const { profile } = usePortalAuth();
  const userId = profile?.id ?? null;

  // Recomputed each render on purpose: granting permission moves this from
  // 'ok'-with-no-subscription to 'ok', and denying it moves it to 'blocked'.
  const support = pushSupport();

  const [onThisDevice, setOnThisDevice] = useState<boolean | null>(null);
  const [prefs, setPrefs] = useState<PortalNotificationPrefs | null>(null);
  const [loadError, setLoadError] = useState<PrefsError>(null);
  const [attempt, setAttempt] = useState(0);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  // `disabled` lands on the next render; a second tap can arrive before it.
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    hasPushSubscription().then(v => { if (!cancelled) setOnThisDevice(v); });
    return () => { cancelled = true; };
  }, [attempt]);

  /**
   * Silent when the app-wide refresh calls it: replace the data, never flip a
   * loading flag under someone who is looking at the page, and throw so the
   * refresh button can say it failed.
   */
  const load = useCallback(async (silent = false) => {
    if (!userId) {
      setPrefs(DEFAULT_PORTAL_PREFS);
      return;
    }
    const { prefs: next, error: readError } = await readPortalPrefs(userId);
    if (readError) {
      if (silent) throw new Error(readError);
      setLoadError(readError);
      return;
    }
    setPrefs(next);
    setLoadError(null);
  }, [userId]);

  useEffect(() => { load(); }, [load, attempt]);

  const reload = useCallback(() => load(true), [load]);
  useRefreshable(reload, !!userId);

  const handleMaster = async (next: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setStatus(next ? 'Turning notifications on…' : 'Turning notifications off…');

    try {
      if (next) {
        if (!userId) throw new Error('Sign in to turn notifications on.');
        await enablePush(userId);
        const { error: writeError } = await writePortalPrefs(userId, { pushEnabled: true });
        if (writeError) throw new Error(writeError);
        setOnThisDevice(true);
        setPrefs(p => ({ ...(p ?? DEFAULT_PORTAL_PREFS), pushEnabled: true }));
        setStatus('On for this device. Choose what you hear about below.');
      } else {
        await disablePush();
        if (userId) {
          const { error: writeError } = await writePortalPrefs(userId, { pushEnabled: false });
          if (writeError) throw new Error(writeError);
        }
        setOnThisDevice(false);
        setPrefs(p => ({ ...(p ?? DEFAULT_PORTAL_PREFS), pushEnabled: false }));
        setStatus('Off. You will not get notifications on any device.');
      }
    } catch (e) {
      setError((e as Error).message || 'Could not change your notifications.');
      setStatus('');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  /** Optimistic, with the switch put back if the write fails. */
  const handleCategory = async (key: PortalCategoryKey, next: boolean) => {
    if (busyRef.current || !userId || !prefs) return;
    busyRef.current = true;
    setBusy(true);
    setError('');

    const previous = prefs;
    setPrefs({ ...prefs, [key]: next });

    const { error: writeError } = await writePortalPrefs(userId, { [key]: next });
    if (writeError) {
      setPrefs(previous);
      setError(writeError);
    }

    busyRef.current = false;
    setBusy(false);
  };

  const heading = (
    <h3 style={{
      ...theme.typography.h3,
      fontFamily: theme.fonts.display,
      color: theme.colors.txt.primary,
      margin: `0 0 ${theme.spacing.sm}`,
    }}>
      Notifications
    </h3>
  );

  const note = (text: string, extra?: React.ReactNode) => (
    <Card>
      {heading}
      <p style={{
        ...theme.typography.bodySmall,
        fontFamily: theme.fonts.primary,
        color: theme.colors.txt.secondary,
        margin: 0,
        maxWidth: '46ch',
      }}>
        {text}
      </p>
      {extra}
    </Card>
  );

  if (support === 'unsupported') {
    return note('This browser cannot receive notifications. On a phone, adding the app to your home screen is the way to get them.');
  }

  // The common case on an iPhone, and the reason a plain toggle here would be
  // a dead control for most of this audience.
  if (support === 'needs-install') {
    return note(
      'To get notifications on an iPhone or iPad, the app has to be on your home screen first. It takes about ten seconds.',
      <div style={{ marginTop: theme.spacing.xs }}><InstallAppGuide /></div>,
    );
  }

  if (support === 'blocked') {
    return note('Notifications are blocked for this site in your browser settings. Allow them there, then come back and turn this on.');
  }

  if (loadError) {
    return (
      <Card>
        {heading}
        <CardError message={loadError} onRetry={() => setAttempt(n => n + 1)} />
      </Card>
    );
  }

  if (prefs === null || onThisDevice === null) {
    return (
      <Card>
        {heading}
        <div style={{ display: 'flex', justifyContent: 'center', padding: theme.spacing.lg }}>
          <Spinner size={20} color={theme.colors.primary} />
        </div>
      </Card>
    );
  }

  const masterOn = onThisDevice && prefs.pushEnabled;

  return (
    <Card>
      {heading}

      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <span
            id="notif-master-label"
            style={{
              ...theme.typography.body,
              fontFamily: theme.fonts.primary,
              color: theme.colors.txt.primary,
              display: 'block',
            }}
          >
            Notifications on this device
          </span>
          <span
            id="notif-master-desc"
            style={{
              ...theme.typography.captionSmall,
              fontFamily: theme.fonts.primary,
              color: theme.colors.txt.tertiary,
              display: 'block',
              overflowWrap: 'anywhere',
            }}
          >
            {masterOn
              ? 'This device will buzz when the studio posts something for you.'
              : 'Turn this on to hear about cancellations and messages without opening the app.'}
          </span>
        </div>
        <Toggle
          checked={!!masterOn}
          onChange={handleMaster}
          disabled={busy}
          labelledBy="notif-master-label"
          describedBy="notif-master-desc"
        />
      </div>

      {/* Words, not just a moving dot — index.css freezes the animation under
          prefers-reduced-motion, so the text has to carry the meaning alone. */}
      {(status || error) && (
        <p
          role="status"
          aria-live="polite"
          style={{
            ...theme.typography.bodySmall,
            fontFamily: theme.fonts.primary,
            color: error ? theme.colors.status.error : theme.colors.txt.secondary,
            margin: `${theme.spacing.sm} 0 0`,
            maxWidth: '46ch',
          }}
        >
          {error || status}
        </p>
      )}

      {masterOn && (
        <>
          <Divider />

          <p style={{
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.tertiary,
            margin: `0 0 ${theme.spacing.sm}`,
            maxWidth: '46ch',
          }}>
            {CATEGORY_NOTE}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
            {PORTAL_NOTIFICATION_CATEGORIES.map(category => (
              <div
                key={category.key}
                style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span
                    id={`notif-${category.key}-label`}
                    style={{
                      ...theme.typography.bodySmall,
                      fontFamily: theme.fonts.primary,
                      color: theme.colors.txt.primary,
                      display: 'block',
                    }}
                  >
                    {category.label}
                  </span>
                  <span
                    id={`notif-${category.key}-desc`}
                    style={{
                      ...theme.typography.captionSmall,
                      fontFamily: theme.fonts.primary,
                      color: theme.colors.txt.tertiary,
                      display: 'block',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {category.description}
                  </span>
                </div>
                <Toggle
                  checked={prefs[category.key]}
                  onChange={value => handleCategory(category.key, value)}
                  disabled={busy || !userId}
                  labelledBy={`notif-${category.key}-label`}
                  describedBy={`notif-${category.key}-desc`}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
};

export default NotificationsCard;
