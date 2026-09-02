import React from 'react';
import { theme } from '../../../theme';
import { Badge, Card } from '../../ui';

/**
 * The parts every Viewer list shares.
 *
 * PHONE FIRST, AND THE EMAIL IS WHY
 *
 * Every row here carries an email address, and an email is the worst case for
 * a flex layout: arbitrary length, no spaces to break at. `minWidth: 0` plus
 * `overflowWrap: 'anywhere'` are both required — one without the other still
 * pushes the row off the right edge of a 320px screen, which is the exact bug
 * the mobile audit was built to catch.
 */

/**
 * A tappable list row. Whole-card target, because this is used on a phone.
 *
 * ONE CLICK TARGET, NOT TWO
 *
 * This first passed onClick to the Card AS WELL AS to the button inside it.
 * Card renders a plain <div onClick>, so a tap ran the button's handler and
 * then bubbled to the div and ran it again — every row fired twice. It happened
 * to be harmless because opening a household is idempotent, and it would have
 * stopped being harmless the first time a row toggled anything.
 *
 * So the button is the only handler, and it is stretched to fill the card:
 * the whole row is still the target, but there is exactly one of it, and a
 * <div onClick> no longer wraps a real control.
 */
export const ViewerRow: React.FC<{
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}> = ({ onClick, label, children }) => (
  <Card hover padding="none">
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        appearance: 'none',
        background: 'none',
        border: 'none',
        margin: 0,
        // The padding Card would have applied, moved onto the button so the
        // tap target covers the row rather than sitting inside a dead margin.
        padding: '12px 16px',
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        color: 'inherit',
        font: 'inherit',
        // Without this the button is a flex item that will not shrink, and the
        // email inside it decides the row's width.
        minWidth: 0,
      }}
    >
      {children}
    </button>
  </Card>
);

export const RowTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    ...theme.typography.body,
    fontFamily: theme.fonts.primary,
    fontWeight: 600,
    color: theme.colors.txt.primary,
    minWidth: 0,
    overflowWrap: 'anywhere',
  }}>
    {children}
  </div>
);

/** Secondary line. Emails live here, hence overflowWrap. */
export const RowSub: React.FC<{ children: React.ReactNode; mono?: boolean }> = ({ children, mono }) => (
  <div style={{
    ...theme.typography.bodySmall,
    fontFamily: mono ? theme.fonts.mono : theme.fonts.primary,
    color: theme.colors.txt.tertiary,
    minWidth: 0,
    overflowWrap: 'anywhere',
    marginTop: '2px',
  }}>
    {children}
  </div>
);

/**
 * A row of small facts. Wraps, because it holds a variable number of chips and
 * a nowrap flex row of those is how six employees became four on the /hours
 * legend.
 */
export const ChipRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  }}>
    {children}
  </div>
);

/** Program entitlement, derived from the classes a family is actually in. */
export const CategoryChips: React.FC<{ categories: string[] }> = ({ categories }) => {
  if (!categories.length) return null;
  return (
    <>
      {categories.map(c => (
        <Badge key={c} variant="info" size="sm">{c}</Badge>
      ))}
    </>
  );
};

/** A labelled value in a detail panel. */
export const DetailField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{
      ...theme.typography.captionSmall,
      fontFamily: theme.fonts.mono,
      color: theme.colors.txt.tertiary,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
    }}>
      {label}
    </div>
    <div style={{
      ...theme.typography.body,
      fontFamily: theme.fonts.primary,
      color: theme.colors.txt.primary,
      minWidth: 0,
      overflowWrap: 'anywhere',
    }}>
      {children}
    </div>
  </div>
);

/** Counts under a search box: "12 of 343 families". */
export const ResultCount: React.FC<{ shown: number; total: number; noun: string }> = ({ shown, total, noun }) => (
  <p style={{
    ...theme.typography.captionSmall,
    fontFamily: theme.fonts.mono,
    color: theme.colors.txt.tertiary,
    margin: `0 0 ${theme.spacing.sm}`,
  }}>
    {shown === total ? `${total} ${noun}` : `${shown} of ${total} ${noun}`}
  </p>
);
