import React from 'react';
import { theme } from '../../theme';
import { Skeleton } from '../Skeleton';
import { useResponsive } from '../../hooks/useResponsive';

/**
 * The portal's loading states, shaped like the thing that is coming.
 *
 * WHY NOT THE SPINNER
 *
 * Every portal page used to load as a <Spinner> centred in an otherwise empty
 * column, and then the content appeared underneath it and shoved the page. Two
 * separate problems: the spinner says "something is happening" without saying
 * what, and it occupies a height that has nothing to do with what replaces it,
 * so every load ends in a jump. On a phone on studio wifi that jump lands
 * exactly as a parent goes to tap something.
 *
 * A skeleton answers both. It reserves roughly the right height, so the arrival
 * is a fill rather than a shove, and its shape is a promise about what is
 * coming — three tiles, a class list, an update.
 *
 * IT MUST READ AS LOADING WITH THE ANIMATION SWITCHED OFF
 *
 * index.css freezes every animation under prefers-reduced-motion, so the pulse
 * these inherit from `.skeleton-pulse` is not guaranteed to run. That is fine —
 * blank blocks in the shape of content already read as "not here yet" — but it
 * does mean the pulse may never carry the meaning on its own. The screen-reader
 * announcement below is what actually says "loading", for everybody.
 *
 * BUILT ON THE EXISTING PRIMITIVE
 *
 * `Skeleton` in src/components/Skeleton.tsx is the staff side's block, pulse
 * and all. These are portal-shaped arrangements of it, not a second
 * implementation — there is one skeleton look in this app.
 */

/** Same technique NavTile uses for its "opens in a new tab" note. */
const SR_ONLY: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};

/**
 * The wrapper every skeleton below goes through.
 *
 * `role="status"` + the hidden label is what a screen reader hears, because the
 * blocks themselves are decorative and are hidden from it. Without this the
 * page would simply go quiet during a load, which is worse than the spinner it
 * replaced — the spinner at least had an aria-label somewhere. `aria-busy`
 * tells assistive tech the region is mid-update rather than finished and empty.
 */
const Loading: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div role="status" aria-busy="true" style={{ display: 'block' }}>
    <span style={SR_ONLY}>{label}</span>
    <div aria-hidden="true">{children}</div>
  </div>
);

/** Card's own spec — bg.secondary, 2px bdr.primary, radius lg. Kept in step by hand. */
const cardShell = (padding: string): React.CSSProperties => ({
  backgroundColor: theme.colors.bg.secondary,
  border: `2px solid ${theme.colors.bdr.primary}`,
  borderRadius: theme.borderRadius.lg,
  padding,
});

// ---------------------------------------------------------------- nav tiles

/**
 * The shape of a NavTile: icon square, label, description, chevron.
 *
 * Used on the portal home and each program overview, which are the two screens
 * where the whole page is tiles and a spinner therefore replaced everything.
 */
export const TileSkeleton: React.FC<{ count?: number; withIcon?: boolean }> = ({
  count = 3,
  withIcon = true,
}) => {
  const { isMobileOrTablet } = useResponsive();
  const pad = isMobileOrTablet ? '18px' : '22px';

  return (
    <Loading label="Loading sections…">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            style={{
              ...cardShell(pad),
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
            }}
          >
            {withIcon && <Skeleton width={40} height={40} borderRadius={theme.borderRadius.md} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Skeleton width="52%" height={18} style={{ marginBottom: '8px' }} />
              <Skeleton width="78%" height={13} />
            </div>
            <Skeleton width={8} height={14} borderRadius={theme.borderRadius.sm} />
          </div>
        ))}
      </div>
    </Loading>
  );
};

// -------------------------------------------------------------- content cards

/**
 * A card with a mono kicker, a heading and a couple of body lines — the shape
 * of an update, an announcement, or the "coming up" card.
 *
 * The last body line is deliberately short. Every real paragraph ends
 * mid-width, and a stack of full-width bars reads as a table rather than prose.
 */
export const ContentCardSkeleton: React.FC<{ count?: number; lines?: number }> = ({
  count = 1,
  lines = 2,
}) => (
  <Loading label="Loading…">
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={cardShell('16px 18px')}>
          <Skeleton width={92} height={11} style={{ marginBottom: '12px' }} />
          <Skeleton width="64%" height={19} style={{ marginBottom: '12px' }} />
          {Array.from({ length: lines }).map((_, line) => (
            <Skeleton
              key={line}
              width={line === lines - 1 ? '48%' : '100%'}
              height={12}
              style={{ marginBottom: line === lines - 1 ? 0 : '8px' }}
            />
          ))}
        </div>
      ))}
    </div>
  </Loading>
);

// ------------------------------------------------------------------ lists

/**
 * A row of the class schedule or the calendar list: a leading date/time block,
 * a title, and a line of metadata.
 */
export const RowSkeleton: React.FC<{ count?: number; label?: string }> = ({
  count = 4,
  label = 'Loading…',
}) => (
  <Loading label={label}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            ...cardShell('14px 16px'),
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <Skeleton width={44} height={44} borderRadius={theme.borderRadius.md} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton width="58%" height={16} style={{ marginBottom: '8px' }} />
            <Skeleton width="36%" height={12} />
          </div>
        </div>
      ))}
    </div>
  </Loading>
);

// ------------------------------------------------------------- profile cards

/**
 * A row inside the attendance card: class name, percentage, and the bar.
 *
 * Not wrapped in a card shell — this one renders INSIDE Card, unlike everything
 * above it, because the attendance card's own heading and period switcher stay
 * on screen while its body loads.
 */
export const AttendanceRowSkeleton: React.FC<{ count?: number }> = ({ count = 2 }) => (
  <Loading label="Loading attendance…">
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, marginBottom: '8px' }}>
            <Skeleton width="46%" height={16} />
            <Skeleton width={40} height={16} style={{ marginLeft: 'auto' }} />
          </div>
          <Skeleton width="30%" height={11} style={{ marginBottom: '10px' }} />
          <Skeleton width="100%" height={8} borderRadius={theme.borderRadius.full} />
        </div>
      ))}
    </div>
  </Loading>
);
