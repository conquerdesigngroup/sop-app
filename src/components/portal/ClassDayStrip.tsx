import React, { useEffect, useRef } from 'react';
import { theme } from '../../theme';
import { DAY_SHORT } from '../../lib/portalClasses';

/**
 * The day picker, and the phone's primary navigation for the schedule.
 *
 * It replaces three things at once: the week view, the day filter chips, and
 * most of the scrolling. A hundred and two classes in one list is
 * eighteen thousand pixels — twenty-two phone screens — and nobody reads that.
 * One day is about twenty classes and fits in two.
 *
 * STICKY, AND BELOW THE HEADER
 *
 * `top` comes from --portal-header-h, which PortalLayout measures and
 * publishes, because the header's height depends on the safe-area inset and is
 * 0 in a browser tab, 47px on a notched phone in standalone mode, and changes
 * on rotation. The 56px fallback is for the frame before the observer fires.
 *
 * WHY THE COUNTS ARE LIVE
 *
 * Each pill counts the classes that would show if you tapped it, WITH the
 * current filters applied. Static counts would send you into an empty day and
 * leave you wondering whether the app was broken or the studio was shut.
 */

export type DaySelection = number | 'all';

interface Props {
  /** Weekdays the studio actually runs, ascending. */
  days: number[];
  /** Weekday -> how many classes match the current filters. */
  counts: Map<DaySelection, number>;
  selected: DaySelection;
  onSelect: (day: DaySelection) => void;
  /** 0-6, or null out of season — see anyClassOn. */
  todayDay: number | null;
}

const Pill: React.FC<{
  label: string;
  count: number;
  active: boolean;
  isToday: boolean;
  onClick: () => void;
  innerRef?: React.Ref<HTMLButtonElement>;
}> = ({ label, count, active, isToday, onClick, innerRef }) => (
  <button
    ref={innerRef}
    type="button"
    onClick={onClick}
    aria-pressed={active}
    aria-label={`${label}, ${count} ${count === 1 ? 'class' : 'classes'}`}
    style={{
      flexShrink: 0,
      scrollSnapAlign: 'center',
      // 44px + 6px gaps + 32px page padding puts all seven pills — All plus
      // six days — inside 390px with room to spare, so the whole week is
      // visible without scrolling on the commonest phone. It still scrolls at
      // 320px, and the selected pill is brought into view on mount.
      minWidth: '44px',
      padding: '7px 6px 8px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '1px',
      borderRadius: theme.borderRadius.lg,
      border: `1px solid ${active ? theme.colors.primary : theme.colors.bdr.primary}`,
      backgroundColor: active ? theme.colors.primary : theme.colors.bg.secondary,
      cursor: 'pointer',
      // A day with nothing in it stays tappable — greying it out and leaving it
      // live is worse than either extreme — but says so at a glance.
      opacity: count === 0 && !active ? 0.45 : 1,
      transition: 'background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease',
    }}
  >
    <span
      style={{
        fontFamily: theme.fonts.primary,
        fontSize: '11.5px',
        fontWeight: 700,
        letterSpacing: '0.01em',
        textTransform: 'uppercase',
        // Hardcoded white on the crimson: the mode-aware text tokens flip dark
        // in light mode and vanish against the pink.
        color: active ? '#FFFFFF' : theme.colors.txt.primary,
      }}
    >
      {label}
    </span>
    <span
      style={{
        fontFamily: theme.fonts.mono,
        fontSize: '11px',
        lineHeight: 1.2,
        color: active ? '#FFFFFF' : theme.colors.txt.tertiary,
      }}
    >
      {count}
    </span>
    {/* Today's marker. A dot rather than the word, which does not fit, and
        placed under the count so every pill is the same height with or
        without it. */}
    <span
      aria-hidden="true"
      style={{
        width: '4px',
        height: '4px',
        marginTop: '1px',
        borderRadius: '50%',
        backgroundColor: isToday
          ? (active ? '#FFFFFF' : theme.colors.primary)
          : 'transparent',
      }}
    />
  </button>
);

const ClassDayStrip: React.FC<Props> = ({ days, counts, selected, onSelect, todayDay }) => {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // 'nearest', not 'center'. Centring scrolls even when the pill is already
    // fully visible, which on a 390px screen shoved "All" off the left edge on
    // first paint and hid the one control that shows the whole week. This
    // scrolls only when it has to — which is what a 320px screen needs.
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selected]);

  return (
    <div
      style={{
        position: 'sticky',
        top: 'var(--portal-header-h, 56px)',
        zIndex: 90,
        // Full-bleed: the strip is the only thing on the page allowed to touch
        // the screen edges, so a day can scroll off rather than stopping short
        // and looking clipped. The negative margin undoes PortalLayout's 16px.
        margin: '0 -16px',
        padding: '10px 0 11px',
        backgroundColor: theme.colors.bg.primary,
        borderBottom: `1px solid ${theme.colors.bdr.primary}`,
      }}
    >
      <div
        role="group"
        aria-label="Day of the week"
        style={{
          display: 'flex',
          gap: '6px',
          padding: '0 16px',
          overflowX: 'auto',
          scrollSnapType: 'x proximity',
          WebkitOverflowScrolling: 'touch',
          // Firefox; WebKit hides its bar on touch devices anyway and showing
          // one over a 60px strip eats a fifth of it.
          scrollbarWidth: 'none',
        }}
      >
        <Pill
          label="All"
          count={counts.get('all') ?? 0}
          active={selected === 'all'}
          isToday={false}
          onClick={() => onSelect('all')}
          innerRef={selected === 'all' ? activeRef : undefined}
        />

        {days.map(day => (
          <Pill
            key={day}
            label={DAY_SHORT[day]}
            count={counts.get(day) ?? 0}
            active={selected === day}
            isToday={todayDay === day}
            onClick={() => onSelect(day)}
            innerRef={selected === day ? activeRef : undefined}
          />
        ))}
      </div>
    </div>
  );
};

export default ClassDayStrip;
