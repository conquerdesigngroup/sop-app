import React from 'react';
import { theme } from '../../theme';

/**
 * One continuous bar for a run of days, in a month grid or an all-day row.
 *
 * The square edge is the load-bearing detail. An event that carries on past
 * Saturday is cut flush at the boundary and picked up flush on the Sunday
 * below, so the two rows read as one object interrupted by the grid rather
 * than two events that happen to share a name. Rounding every segment on both
 * ends is precisely what made a fortnight-long closure look like fourteen
 * unrelated stickers.
 *
 * Deliberately knows nothing about CalendarEvent or PortalEvent. The staff
 * calendar and the parent portal hold different shapes and the only thing they
 * need to agree on is how a bar looks, so they map their own fields and both
 * get the same object on screen.
 */

export interface EventBarProps {
  title: string;
  color: string;
  /** Solid bar (all-day or multi-day) rather than a dot and a time. */
  filled: boolean;
  /** Ran before this row — square the left edge. */
  continuesBefore?: boolean;
  /** Runs past this row — square the right edge. */
  continuesAfter?: boolean;
  /** Shown before the title on unfilled bars, e.g. "2:30p". */
  timeLabel?: string | null;
  /** Phone sizing: smaller type, tighter padding, no time label. */
  compact?: boolean;
  /**
   * Label colour on a filled bar. The default is white, which is right for the
   * saturated per-calendar colours the staff side passes. A caller that fills a
   * bar with a NEUTRAL token must override it — the portal does, and its bars
   * were white-on-pale-grey in light mode until it did.
   */
  textColor?: string;
  /**
   * Omit to make the bar inert. The parent portal does that on purpose: at
   * 375px a column is about 49px wide, and a stack of individually tappable
   * bars in that space is a mis-tap generator. There the whole day cell is the
   * target and the bars are there to be read, not pressed.
   */
  onClick?: (e: React.MouseEvent) => void;
}

const RADIUS = 4;

const EventBar: React.FC<EventBarProps> = ({
  title,
  color,
  filled,
  continuesBefore = false,
  continuesAfter = false,
  timeLabel = null,
  compact = false,
  textColor = '#FFFFFF',
  onClick,
}) => (
  <div
    onClick={onClick}
    title={title}
    style={{
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      fontFamily: theme.fonts.primary,
      fontWeight: 600,
      fontSize: compact ? '9px' : '11px',
      cursor: onClick ? 'pointer' : 'inherit',
      // Inset only at a real end. Insetting a cut edge would open a gap at the
      // week boundary and break the run back into separate objects.
      marginLeft: continuesBefore ? 0 : 2,
      marginRight: continuesAfter ? 0 : 2,
      paddingLeft: filled ? (compact ? 4 : 6) : 2,
      paddingRight: compact ? 4 : 6,
      borderTopLeftRadius: continuesBefore ? 0 : RADIUS,
      borderBottomLeftRadius: continuesBefore ? 0 : RADIUS,
      borderTopRightRadius: continuesAfter ? 0 : RADIUS,
      borderBottomRightRadius: continuesAfter ? 0 : RADIUS,
      backgroundColor: filled ? color : 'transparent',
      // White by default, because the mode-dependent text tokens flip dark in
      // light mode and would vanish against a saturated bar. Only true while
      // the bar IS saturated — see textColor.
      color: filled ? textColor : theme.colors.txt.primary,
    }}
  >
    {!filled && (
      <span style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        flexShrink: 0,
        backgroundColor: color,
      }} />
    )}
    {!filled && !compact && timeLabel && (
      <span style={{
        fontFamily: theme.fonts.mono,
        fontWeight: 500,
        opacity: 0.75,
        flexShrink: 0,
      }}>
        {timeLabel}
      </span>
    )}
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {title}
    </span>
  </div>
);

/** "14:30" -> "2:30p", "14:00" -> "2p". Compact enough to sit inside a bar. */
export const formatClock = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? 'p' : 'a';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, '0')}${period}` : `${hour}${period}`;
};

export default EventBar;
