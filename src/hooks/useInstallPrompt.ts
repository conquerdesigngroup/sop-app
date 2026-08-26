import { useCallback, useEffect, useState } from 'react';

/**
 * Everything needed to tell one person how to put this app on their home screen.
 *
 * WHY A HOOK AND NOT JUST INSTRUCTIONS
 *
 * "Add to Home Screen" is three different features wearing one name. Android
 * Chrome fires a real event and can install in a single tap. iOS has no such
 * event and never will — Apple exposes no install API, so the only route is the
 * Share sheet, by hand. Desktop hides it in the address bar.
 *
 * Showing a parent all three sets of steps and asking them to find their own is
 * how you get a phone call. So this reports which situation the visitor is
 * actually in, and the guide renders exactly one answer.
 *
 * WHY THE LISTENER IS AT MODULE SCOPE
 *
 * `beforeinstallprompt` fires once, early — routinely before React has mounted
 * the component that wants it. A listener registered inside an effect misses it
 * and the one-tap install silently degrades to manual steps. Registering at
 * import time means the event is captured whenever it lands, and late
 * subscribers are handed the stashed copy.
 */

/** Not in TypeScript's DOM lib: Chromium-only, and still not on a standards track. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const subscribers = new Set<() => void>();

const notify = () => subscribers.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Without preventDefault Chrome may show its own mini-infobar, which then
    // competes with our button for the same job.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });

  // Fired after a successful install. The stashed event is single-use and now
  // spent, so drop it and let the UI stop offering something already done.
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export type InstallPlatform = 'ios' | 'android' | 'desktop';

export interface InstallPromptState {
  platform: InstallPlatform;
  /**
   * iOS only. Third-party iOS browsers have been able to add to the home screen
   * since 16.4, but the menu differs per browser and Safari is the one every
   * parent already has, so the guide steers there rather than guessing.
   */
  isIosSafari: boolean;
  /** Already launched from the home screen — the guide has nothing to offer. */
  isStandalone: boolean;
  /** A real one-tap install is available right now. */
  canPromptDirectly: boolean;
  /** Returns true if the install was accepted. False if unavailable or declined. */
  promptInstall: () => Promise<boolean>;
}

const detectPlatform = (): InstallPlatform => {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;

  // iPadOS 13+ reports itself as Macintosh. The touch-point count is what still
  // separates an iPad from a trackpad Mac, so a real iPad is not misfiled as
  // desktop and shown instructions that do not exist on it.
  const isIpadOs = /Macintosh/.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;

  if (/iPad|iPhone|iPod/.test(ua) || isIpadOs) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
};

const detectIosSafari = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // Every iOS browser is WebKit underneath, so engine sniffing cannot tell them
  // apart. Each wrapper does append its own token, and their absence is what
  // identifies Safari.
  return !/CriOS|FxiOS|EdgiOS|OPiOS|Brave/.test(ua);
};

const detectStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  // matchMedia covers Android and modern iOS. navigator.standalone is the older
  // iOS-only flag, still the only signal on versions before 16.4.
  const byDisplayMode = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const byIosLegacy = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return byDisplayMode || byIosLegacy;
};

export const useInstallPrompt = (): InstallPromptState => {
  const [hasPrompt, setHasPrompt] = useState(() => deferredPrompt !== null);
  const [isStandalone, setIsStandalone] = useState(detectStandalone);

  useEffect(() => {
    const onChange = () => setHasPrompt(deferredPrompt !== null);
    subscribers.add(onChange);
    onChange();
    return () => {
      subscribers.delete(onChange);
    };
  }, []);

  // Installing does not reload the tab, so display-mode can flip while this is
  // mounted. Without watching it the button lingers after a successful install.
  useEffect(() => {
    const mq = window.matchMedia?.('(display-mode: standalone)');
    if (!mq) return;
    const onChange = () => setIsStandalone(detectStandalone());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    const event = deferredPrompt;
    // Spend it before awaiting: the event cannot be reused, and leaving it in
    // place lets a second tap call prompt() on a dead event and throw.
    deferredPrompt = null;
    notify();
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      return outcome === 'accepted';
    } catch {
      return false;
    }
  }, []);

  return {
    platform: detectPlatform(),
    isIosSafari: detectIosSafari(),
    isStandalone,
    canPromptDirectly: hasPrompt,
    promptInstall,
  };
};
