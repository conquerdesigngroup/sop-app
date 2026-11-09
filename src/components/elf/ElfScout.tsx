import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { theme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { useElfScout } from '../../hooks/useElfScout';
import { isPortalPath } from '../../lib/portal';
import { localDayKey } from '../../lib/homeScenes';
import {
  ELF_MESSAGE,
  ELF_RESET_EVENT,
  ElfAudience,
  elfFoundToday,
  elfIsOut,
  elfPageFor,
  elfPageKey,
  elfPerchPlan,
  markElfFound,
} from '../../lib/elfScout';
import { burstSparkles } from '../../lib/sparkles';

const ElfStage = lazy(() => import('./ElfStage'));

/**
 * The Christmas elf scout's host. Mounted once for the whole app (App.tsx).
 *
 * Cheap until he is needed: it reads one setting, and only when he is out,
 * today's hiding page is the one on screen, and he has not been found on
 * this device today does it look for a perch and lazy-load the WebGL stage.
 *
 * A perch is a visible card-like box in the page (or anything marked
 * data-elf-perch). He sits on its top edge, his legs over the front, and the
 * hiding place is picked from the date so every device agrees. He is drawn in
 * the page (absolute, not fixed), under the sticky header and bottom bar, so
 * he scrolls with his card like a real thing on a real shelf.
 *
 * Tap him: he pops, bursts into sparkles, says "You found me, fa la la la
 * la!", and stays gone on this device until tomorrow, when he has moved.
 */

const HEADER_CLEARANCE = 72;

interface Placement {
  left: number;
  top: number;
  along: number;
}

const transparent = (c: string) => !c || c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);

/** Box with a border or its own background, rounded: what this app draws as a card. */
const looksLikeCard = (el: HTMLElement, r: DOMRect, bodyBg: string): boolean => {
  if (r.width < 150 || r.height < 56) return false;
  const cs = getComputedStyle(el);
  if (cs.position === 'fixed' || cs.position === 'sticky') return false;
  if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.5) return false;
  if (parseFloat(cs.borderTopLeftRadius) < 4) return false;
  const bordered = parseFloat(cs.borderTopWidth) >= 1 && cs.borderTopStyle !== 'none' && !transparent(cs.borderTopColor);
  const filled = !transparent(cs.backgroundColor) && cs.backgroundColor !== bodyBg;
  return bordered || filled;
};

/** He lives in the document, so his card has to scroll with the document. */
const usable = (el: HTMLElement, r: DOMRect, elfHeight: number): boolean => {
  if (r.left < 0 || r.right > window.innerWidth + 1) return false;
  if (r.top + window.scrollY < HEADER_CLEARANCE + elfHeight * 0.7) return false;
  for (let p: HTMLElement | null = el; p && p !== document.body; p = p.parentElement) {
    if (p.matches('nav, header, aside, dialog, [role="dialog"], [aria-hidden="true"], [data-elf-perch="off"]')) return false;
    if (p === el) continue;
    const cs = getComputedStyle(p);
    if (cs.position === 'fixed' || cs.position === 'sticky') return false;
    if (/(auto|scroll|hidden)/.test(cs.overflowY) || /(auto|scroll)/.test(cs.overflowX)) return false;
  }
  return true;
};

export const findPerches = (elfHeight: number): HTMLElement[] => {
  const explicit = Array.from(document.querySelectorAll<HTMLElement>('[data-elf-perch]:not([data-elf-perch="off"])'))
    .filter(el => usable(el, el.getBoundingClientRect(), elfHeight));
  if (explicit.length) return explicit;
  const scope = document.querySelector<HTMLElement>('main') || document.querySelector<HTMLElement>('.App') || document.body;
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const out: HTMLElement[] = [];
  const tops: number[] = [];
  const all = scope.querySelectorAll<HTMLElement>('div, section, article, li, a, form');
  for (let i = 0; i < all.length && out.length < 12; i++) {
    const el = all[i];
    const r = el.getBoundingClientRect();
    if (!looksLikeCard(el, r, bodyBg) || !usable(el, r, elfHeight)) continue;
    // A card inside a card that shares its top edge is the same shelf.
    const top = r.top + window.scrollY;
    if (out.some((o, k) => o.contains(el) && Math.abs(tops[k] - top) < 30)) continue;
    out.push(el);
    tops.push(top);
  }
  return out;
};

const ElfScout: React.FC = () => {
  const { pathname } = useLocation();
  const { isAuthenticated } = useAuth();
  const { setting } = useElfScout(true);
  const [day, setDay] = useState(localDayKey);
  const [found, setFound] = useState(() => elfFoundToday());
  const [perch, setPerch] = useState<HTMLElement | null>(null);
  const [place, setPlace] = useState<Placement | null>(null);
  const [edge, setEdge] = useState<number | null>(null);
  const [popping, setPopping] = useState(false);
  const [gone, setGone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [bubble, setBubble] = useState<{ left: number; top: number } | null>(null);
  const busy = useRef(false);

  const audience: ElfAudience | null = isPortalPath(pathname)
    ? (pathname === '/' ? null : 'portal')
    : isAuthenticated ? 'staff' : null;
  const out = elfIsOut(setting, day) && !!audience && (audience === 'staff' || !!setting?.onPortal);
  const here = out && !!audience && elfPageKey(pathname, audience) === elfPageFor(day, audience).key;
  const wanted = here && !found && !failed;

  const small = typeof window !== 'undefined' && window.innerWidth < 480;
  const H = small ? 124 : 172;
  const W = Math.round(H * 0.62);

  // A new day: he has moved, and he is back for everyone who found him.
  useEffect(() => {
    const check = () => {
      const now = localDayKey();
      setDay(d => (d === now ? d : now));
      setFound(elfFoundToday(now));
    };
    const id = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener(ELF_RESET_EVENT, check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener(ELF_RESET_EVENT, check);
    };
  }, []);

  // Find today's perch once the page has drawn its data; look again while
  // the page is still filling in.
  useEffect(() => {
    setPerch(null);
    setPlace(null);
    setPopping(false);
    setGone(false);
    if (!wanted || !audience) return;
    let cancelled = false;
    let timer = 0;
    const scan = () => {
      if (cancelled) return;
      const perches = findPerches(H);
      if (perches.length === 0) return;
      const plan = elfPerchPlan(day, audience, perches.length);
      setPerch(perches[plan.index]);
      mo.disconnect();
    };
    const mo = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(scan, 400);
    });
    const first = window.setTimeout(() => {
      scan();
      if (!cancelled) mo.observe(document.body, { childList: true, subtree: true });
    }, 900);
    const giveUp = window.setTimeout(() => mo.disconnect(), 12_000);
    return () => {
      cancelled = true;
      mo.disconnect();
      window.clearTimeout(first);
      window.clearTimeout(timer);
      window.clearTimeout(giveUp);
    };
  }, [wanted, audience, day, pathname, H]);

  // Keep him on his card as the page reflows.
  useEffect(() => {
    if (!perch || !audience) return;
    const plan = elfPerchPlan(day, audience, 1);
    const measure = () => {
      if (!perch.isConnected) { setPerch(null); return; }
      const r = perch.getBoundingClientRect();
      const docW = document.documentElement.clientWidth;
      const x = r.left + window.scrollX + plan.along * r.width - W / 2;
      const left = Math.round(Math.max(8, Math.min(docW - W - 8, x)));
      const top = Math.round(r.top + window.scrollY);
      setPlace(p => (p && p.left === left && p.top === top ? p : { left, top, along: plan.along }));
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(perch);
    ro?.observe(document.body);
    const id = window.setInterval(measure, 1000);
    return () => {
      window.removeEventListener('resize', measure);
      ro?.disconnect();
      window.clearInterval(id);
    };
  }, [perch, audience, day, W]);

  const onFind = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (busy.current || !place) return;
    busy.current = true;
    const r = e.currentTarget.getBoundingClientRect();
    burstSparkles(r.left + r.width / 2, r.top + r.height * 0.4);
    markElfFound(day);
    setPopping(true);
    // Centred over him, but never past either edge of the screen.
    const docW = document.documentElement.clientWidth;
    const half = Math.min(140, (docW - 32) / 2);
    const left = Math.min(Math.max(16 + half, place.left + W / 2), docW - 16 - half);
    setBubble({ left, top: place.top - H * (edge ?? 0.7) });
    window.setTimeout(() => setBubble(null), 4800);
  }, [place, day, W, H, edge]);

  const onGone = useCallback(() => {
    setGone(true);
    setFound(true);
    busy.current = false;
  }, []);

  const showElf = !!place && !gone && (wanted || popping);

  return createPortal(
    <>
      {showElf && place && (
        <div
          data-elf-scout=""
          style={{
            position: 'absolute',
            left: place.left,
            top: place.top - H * (edge ?? 0.7),
            width: W,
            height: H,
            zIndex: 50,
            pointerEvents: 'none',
            opacity: edge == null ? 0 : 1,
            transition: 'opacity 0.4s ease',
          }}
        >
          <Suspense fallback={null}>
            <ElfStage
              width={W}
              height={H}
              facing={place.along < 0.5 ? 1 : -1}
              popping={popping}
              onLayout={setEdge}
              onGone={onGone}
              onFail={() => setFailed(true)}
            />
          </Suspense>
          <button
            type="button"
            onClick={onFind}
            disabled={popping}
            aria-label="A Christmas elf is hiding here. Tap to find him."
            style={{
              position: 'absolute',
              left: '18%',
              width: '64%',
              top: '4%',
              height: '94%',
              padding: 0,
              border: 'none',
              background: 'transparent',
              borderRadius: theme.borderRadius.lg,
              cursor: 'pointer',
              pointerEvents: popping ? 'none' : 'auto',
              WebkitTapHighlightColor: 'transparent',
            }}
          />
        </div>
      )}
      {bubble && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            left: bubble.left,
            top: bubble.top,
            transform: 'translate(-50%, -30%)',
            zIndex: 60,
            pointerEvents: 'none',
            maxWidth: 'min(280px, calc(100vw - 32px))',
            boxSizing: 'border-box',
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            borderRadius: theme.borderRadius.xl,
            backgroundColor: theme.colors.bg.secondary,
            border: `2px solid ${theme.colors.bdr.secondary}`,
            color: theme.colors.txt.primary,
            fontFamily: theme.fonts.primary,
            fontWeight: 700,
            fontSize: 15,
            lineHeight: 1.3,
            textAlign: 'center',
            boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
            animation: 'elf-bubble 4.8s ease both',
            overflowWrap: 'anywhere',
          }}
        >
          {ELF_MESSAGE}
          <span style={{ display: 'block', fontWeight: 500, fontSize: 12, color: theme.colors.txt.tertiary, marginTop: 2 }}>
            See you tomorrow somewhere new.
          </span>
        </div>
      )}
    </>,
    document.body,
  );
};

export default ElfScout;
