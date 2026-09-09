import React from 'react';
import { theme } from '../../theme';
import { AttendanceStatus } from '../../types/attendance';
import { STATUS_COLORS, STATUS_LABELS, STATUS_ORDER } from '../../lib/attendanceColors';

/**
 * The five statuses, as something a teacher can hit on a phone.
 *
 * WHY THE OPTIONS ARE ALWAYS VISIBLE ONCE A ROW IS OPEN, RATHER THAN A <select>
 *
 * A native select is the snappiest control on a phone and was the first thing
 * tried. It loses on the one requirement that matters here: the studio asked
 * for the statuses to be colour-coded, and a native option list cannot be
 * coloured reliably on iOS. Two taps through an uncoloured wheel is also worse
 * than one tap on a coloured target when the whole job is thirty of these in a
 * row.
 *
 * THE COLOURS ARE NOT A GRADE
 *
 * They separate five things that must not be confused at a glance; they do not
 * rank them. That is why absent is a plain red rather than the brand electric,
 * and why this palette is deliberately not the one the parent's screen uses —
 * see the note on STATUS_COLORS.
 */

const HIT = 44; // Apple's minimum touch target. Non-negotiable at 5:20pm.

export const StatusPills: React.FC<{
  value: AttendanceStatus | null;
  onPick: (status: AttendanceStatus) => void;
  disabled?: boolean;
}> = ({ value, onPick, disabled }) => (
  <div
    role="radiogroup"
    aria-label="Attendance"
    style={{
      display: 'flex',
      // Wrap, always. Five pills do not fit across a 320px phone, and a row
      // that cannot wrap puts the last one off the edge where nothing can
      // reach it.
      flexWrap: 'wrap',
      gap: theme.spacing.xs,
      marginTop: theme.spacing.sm,
    }}
  >
    {STATUS_ORDER.map(status => {
      const active = value === status;
      const color = STATUS_COLORS[status];

      return (
        <button
          key={status}
          type="button"
          role="radio"
          aria-checked={active}
          disabled={disabled}
          onClick={() => onPick(status)}
          style={{
            flex: '1 1 auto',
            minWidth: 88,
            minHeight: HIT,
            padding: `0 ${theme.spacing.sm}`,
            // Literal hex, so an alpha suffix is safe here in a way it never is
            // on a theme token.
            background: active ? color : `${color}1A`,
            color: active ? '#FFFFFF' : color,
            border: `2px solid ${active ? color : `${color}59`}`,
            borderRadius: theme.borderRadius.full,
            font: 'inherit',
            fontFamily: theme.fonts.primary,
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: disabled ? 'default' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            transition: 'background 120ms ease, border-color 120ms ease',
          }}
        >
          {STATUS_LABELS[status]}
        </button>
      );
    })}
  </div>
);

/**
 * The collapsed state: what this dancer is currently marked as.
 *
 * An unmarked dancer gets a dashed outline and the word "Not marked" rather
 * than an empty space. Empty reads as "nothing to do here", which is the
 * opposite of true — an unmarked dancer is the entire thing the teacher is
 * looking for.
 */
export const StatusChip: React.FC<{ value: AttendanceStatus | null }> = ({ value }) => {
  if (!value) {
    return (
      <span
        style={{
          padding: `4px ${theme.spacing.sm}`,
          borderRadius: theme.borderRadius.full,
          border: `1px dashed ${theme.colors.bdr.secondary}`,
          color: theme.colors.txt.tertiary,
          fontSize: '0.8rem',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        Not marked
      </span>
    );
  }

  const color = STATUS_COLORS[value];
  return (
    <span
      style={{
        padding: `4px ${theme.spacing.sm}`,
        borderRadius: theme.borderRadius.full,
        background: color,
        color: '#FFFFFF',
        fontSize: '0.8rem',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {STATUS_LABELS[value]}
    </span>
  );
};
