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
 *
 * "NOT MARKED" IS THE SIXTH OPTION, AND IT IS NOT A SIXTH STATUS
 *
 * It is this radiogroup's null — the value the row has before anyone touches
 * it — so it belongs in the group the same way the others do, and `aria-checked`
 * on it is simply `value === null`. Until v55 there was no way back to it: a
 * teacher who tapped the wrong pill could change the mark forever but never
 * take it back, and a dancer marked by mistake stayed in that family's
 * attendance percentage with nothing on screen suggesting anything was wrong.
 *
 * It is drawn in the chip's own neutral grey rather than a sixth hue, because
 * giving it a colour would put it in the row of five things a teacher scans for
 * and it is the absence of those, not another one of them. It is always shown,
 * including on a row that is already unmarked: a control that appears and
 * disappears moves the other five under a thumb that is already travelling.
 */

const HIT = 44; // Apple's minimum touch target. Non-negotiable at 5:20pm.

export const StatusPills: React.FC<{
  value: AttendanceStatus | null;
  /** Null clears the mark — see the note above. */
  onPick: (status: AttendanceStatus | null) => void;
  disabled?: boolean;
  /** Named in the clear option's label, so a screen reader says whose mark. */
  studentName?: string;
}> = ({ value, onPick, disabled, studentName }) => {
  // Shape and hit area only — colour is per pill. Shared so the sixth option
  // cannot drift out of line with the five it sits beside.
  const pill: React.CSSProperties = {
    flex: '1 1 auto',
    minWidth: 88,
    minHeight: HIT,
    padding: `0 ${theme.spacing.sm}`,
    borderRadius: theme.borderRadius.full,
    font: 'inherit',
    fontFamily: theme.fonts.primary,
    fontSize: '0.9rem',
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'background 120ms ease, border-color 120ms ease',
  };

  return (
    <div
      role="radiogroup"
      aria-label="Attendance"
      style={{
        display: 'flex',
        // Wrap, always. Six pills do not fit across a 320px phone, and a row
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
              ...pill,
              // Literal hex, so an alpha suffix is safe here in a way it never
              // is on a theme token.
              background: active ? color : `${color}1A`,
              color: active ? '#FFFFFF' : color,
              border: `2px solid ${active ? color : `${color}59`}`,
            }}
          >
            {STATUS_LABELS[status]}
          </button>
        );
      })}

      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        disabled={disabled}
        onClick={() => onPick(null)}
        aria-label={studentName ? `Not marked — clear ${studentName}'s attendance` : 'Not marked'}
        style={{
          ...pill,
          background: value === null ? theme.colors.bg.tertiary : 'transparent',
          color: theme.colors.txt.tertiary,
          // Dashed, matching the chip it returns the row to, so the two read as
          // the same state rather than two different empty-ish things.
          border: `2px dashed ${theme.colors.bdr.secondary}`,
        }}
      >
        Not marked
      </button>
    </div>
  );
};

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
