import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { theme } from '../../theme';
import { Badge, EmptyState } from '../ui';
import { useResponsive } from '../../hooks/useResponsive';
import {
  CLASS_CATEGORY_LABEL, ProgramSlug, dayName, formatTime, portalRoutes,
} from '../../lib/portal';
import {
  DAY_INITIALS, DAY_SHORT, MONTH_NAMES, ageRangeLabel, durationLabel,
  groupByDay, isoDate, minutesOfDay, monthGrid, occursOn,
} from '../../lib/portalClasses';
import type { PortalClass, PortalClassCategory } from '../../types';

/**
 * The three ways to read the schedule: as a list, as a week, as a month.
 *
 * They share one card and one set of labels so that a class looks the same
 * wherever you meet it, and they all take an already-filtered, already-sorted
 * array — none of them filters anything itself.
 *
 * WHY THERE IS NO TIME-GRID WEEK VIEW
 *
 * The obvious week view is a timetable with hours down the side and classes
 * positioned by minute. It is also the one that breaks: the studio runs four
 * rooms at once, so 9pm on a Tuesday is four overlapping blocks that have to
 * be laid out side by side inside a 45px column on a phone. The column of
 * time-stamped cards below says the same thing, stays legible at 320px, and
 * cannot overlap anything.
 */

const CATEGORY_VARIANT: Record<PortalClassCategory, 'primary' | 'info' | 'warning'> = {
  allstars: 'primary',
  academy: 'info',
  tnt: 'warning',
};

/** '4:00 – 5:00 PM'. Falls back to whichever end exists. */
const timeRange = (c: PortalClass): string | null => {
  const start = formatTime(c.startTime);
  const end = formatTime(c.endTime);
  if (start && end) return `${start} – ${end}`;
  return start ?? end;
};

// ------------------------------------------------------------------ card

interface CardProps {
  klass: PortalClass;
  slug: ProgramSlug;
  /** Off on a schedule that only holds one category — the badge says nothing. */
  showCategory: boolean;
  /** The week and month views already say which day it is. */
  showDay?: boolean;
  compact?: boolean;
}

export const ClassCard: React.FC<CardProps> = ({
  klass: c, slug, showCategory, showDay = false, compact = false,
}) => {
  const [active, setActive] = useState(false);

  const when = [showDay ? dayName(c.dayOfWeek) : null, timeRange(c), durationLabel(c)]
    .filter(Boolean).join(' · ');
  const who = [c.instructorName, c.location].filter(Boolean).join(' · ');
  // No price, no class size, no age-group label. All three are held on the
  // row and are editable in the manager, but the studio does not want money or
  // capacity on a page parents browse, and the age GROUP is a filter rather
  // than a fact — it repeats what the class name already says ("Junior Hip
  // Hop 1" is a Junior class) and it is the age RANGE that answers the actual
  // question. Removed here and in ClassDetail together.
  const spec = [ageRangeLabel(c), c.level ? `Level ${c.level}` : null]
    .filter(Boolean).join(' · ');

  return (
    <Link
      to={portalRoutes.classDetail(slug, c.id)}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      style={{
        display: 'block',
        backgroundColor: theme.colors.bg.secondary,
        border: `2px solid ${active ? theme.colors.primary : theme.colors.bdr.primary}`,
        borderRadius: theme.borderRadius.lg,
        padding: compact ? '10px 12px' : '16px 18px',
        textDecoration: 'none',
        transition: 'border-color 0.15s ease',
        // A class name has no natural break point and several are long
        // ("Jr/Teen Turns & Jumps 2"), so say the cell may break anywhere
        // rather than letting it push the column open.
        minWidth: 0,
        overflowWrap: 'anywhere',
      }}
    >
      {(showCategory || c.style) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
          {showCategory && (
            <Badge variant={CATEGORY_VARIANT[c.category]} size="sm">
              {CLASS_CATEGORY_LABEL[c.category]}
            </Badge>
          )}
          {c.style && <Badge variant="default" size="sm">{c.style}</Badge>}
        </div>
      )}

      <div
        style={{
          ...theme.typography.h3,
          fontSize: compact ? '14px' : undefined,
          color: theme.colors.txt.primary,
          marginBottom: '6px',
        }}
      >
        {c.name}
      </div>

      {when && (
        <div
          style={{
            ...theme.typography.bodySmall,
            fontFamily: theme.fonts.mono,
            fontSize: compact ? '12px' : undefined,
            color: theme.colors.txt.secondary,
          }}
        >
          {when}
        </div>
      )}

      {who && (
        <div
          style={{
            ...theme.typography.caption,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.tertiary,
            marginTop: '3px',
          }}
        >
          {who}
        </div>
      )}

      {!compact && spec && (
        <div
          style={{
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.mono,
            color: theme.colors.txt.tertiary,
            marginTop: '6px',
          }}
        >
          {spec}
        </div>
      )}
    </Link>
  );
};

// ------------------------------------------------------------------ headings

const DayHeading: React.FC<{ day: number | null; count: number }> = ({ day, count }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'baseline',
      gap: '10px',
      marginBottom: '12px',
      paddingBottom: '8px',
      borderBottom: `1px solid ${theme.colors.bdr.primary}`,
    }}
  >
    <h2 style={{ ...theme.typography.h3, color: theme.colors.txt.primary, margin: 0 }}>
      {dayName(day) ?? 'No set day'}
    </h2>
    <span
      style={{
        ...theme.typography.captionSmall,
        fontFamily: theme.fonts.mono,
        color: theme.colors.txt.tertiary,
      }}
    >
      {count} {count === 1 ? 'class' : 'classes'}
    </span>
  </div>
);

// ------------------------------------------------------------------ list

interface ViewProps {
  classes: PortalClass[];
  slug: ProgramSlug;
  showCategory: boolean;
}

/**
 * Grouped by weekday when that is the order, flat otherwise.
 *
 * Grouping a list sorted by teacher under day headings would be a lie about
 * the order, so `grouped` follows the sort rather than being a separate choice.
 */
export const ClassListView: React.FC<ViewProps & { grouped: boolean }> = ({
  classes, slug, showCategory, grouped,
}) => {
  if (!grouped) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {classes.map(c => (
          <ClassCard key={c.id} klass={c} slug={slug} showCategory={showCategory} showDay />
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {groupByDay(classes).map(group => (
        <section key={group.day === null ? 'none' : group.day}>
          <DayHeading day={group.day} count={group.classes.length} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {group.classes.map(c => (
              <ClassCard key={c.id} klass={c} slug={slug} showCategory={showCategory} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

// ------------------------------------------------------------------ week

/**
 * One column per weekday, classes stacked in time order.
 *
 * The columns are a fixed 210px and the whole row scrolls sideways rather than
 * six columns shrinking to 50px each on a phone. Per CLAUDE.md the scroll
 * belongs to this container, never to the page body.
 */
export const ClassWeekView: React.FC<ViewProps> = ({ classes, slug, showCategory }) => {
  const { isMobileOrTablet } = useResponsive();
  const groups = groupByDay(classes);

  return (
    <div style={{ overflowX: 'auto', paddingBottom: '8px', WebkitOverflowScrolling: 'touch' }}>
      <div
        style={{
          display: 'grid',
          gridAutoFlow: 'column',
          gridAutoColumns: isMobileOrTablet ? '210px' : `minmax(190px, 1fr)`,
          gap: '12px',
          // Only stretch to fill on desktop. On a phone the columns keep their
          // 210px and the row is meant to be wider than the screen.
          minWidth: isMobileOrTablet ? 'min-content' : '100%',
          alignItems: 'start',
        }}
      >
        {groups.map(group => (
          <div key={group.day === null ? 'none' : group.day} style={{ minWidth: 0 }}>
            <div
              style={{
                position: 'sticky',
                top: 0,
                backgroundColor: theme.colors.bg.primary,
                paddingBottom: '8px',
                marginBottom: '10px',
                borderBottom: `2px solid ${theme.colors.bdr.primary}`,
                zIndex: 1,
              }}
            >
              <div style={{ ...theme.typography.h3, fontSize: '15px', color: theme.colors.txt.primary }}>
                {group.day === null ? 'No set day' : DAY_SHORT[group.day]}
              </div>
              <div
                style={{
                  ...theme.typography.captionSmall,
                  fontFamily: theme.fonts.mono,
                  color: theme.colors.txt.tertiary,
                }}
              >
                {group.classes.length} {group.classes.length === 1 ? 'class' : 'classes'}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {group.classes.map(c => (
                <ClassCard key={c.id} klass={c} slug={slug} showCategory={showCategory} compact />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ month

/**
 * A month of the season, and the classes on whichever day you pick.
 *
 * The cells carry a COUNT rather than the classes themselves. Every class here
 * recurs weekly, so a Tuesday in term time holds twenty of them — a cell that
 * tried to list them would be a scrolling column three inches wide. The count
 * answers "is anything on", and the list below answers "what".
 */
export const ClassMonthView: React.FC<
  ViewProps & { year: number; month: number; onMonthChange: (year: number, month: number) => void }
> = ({ classes, slug, showCategory, year, month, onMonthChange }) => {
  const { isMobileOrTablet } = useResponsive();
  const [selected, setSelected] = useState<string | null>(null);

  const todayIso = useMemo(() => isoDate(new Date()), []);
  const cells = useMemo(() => monthGrid(year, month), [year, month]);

  /** Counts per date, computed once for the grid rather than per cell. */
  const byDate = useMemo(() => {
    const map = new Map<string, PortalClass[]>();
    for (const cell of cells) {
      const iso = isoDate(cell);
      map.set(iso, classes.filter(c => occursOn(c, cell)));
    }
    return map;
  }, [cells, classes]);

  const step = (delta: number) => {
    // Through a Date so December + 1 rolls the year rather than becoming
    // month 12, which every renderer below would read as an empty January.
    const next = new Date(year, month + delta, 1);
    onMonthChange(next.getFullYear(), next.getMonth());
    setSelected(null);
  };

  const selectedClasses = selected ? (byDate.get(selected) ?? []) : [];

  const navButton = (label: string, aria: string, delta: number) => (
    <button
      type="button"
      onClick={() => step(delta)}
      aria-label={aria}
      style={{
        width: '36px',
        height: '36px',
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.bdr.primary}`,
        backgroundColor: theme.colors.bg.tertiary,
        color: theme.colors.txt.primary,
        cursor: 'pointer',
        fontFamily: theme.fonts.primary,
        fontSize: '16px',
        lineHeight: 1,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        {navButton('‹', 'Previous month', -1)}
        <h2 style={{ ...theme.typography.h3, color: theme.colors.txt.primary, margin: 0 }}>
          {MONTH_NAMES[month]} {year}
        </h2>
        {navButton('›', 'Next month', 1)}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gap: isMobileOrTablet ? '4px' : '6px',
        }}
      >
        {DAY_INITIALS.map((initial, i) => (
          <div
            key={i}
            aria-hidden="true"
            style={{
              ...theme.typography.captionSmall,
              fontFamily: theme.fonts.mono,
              color: theme.colors.txt.tertiary,
              textAlign: 'center',
              paddingBottom: '4px',
            }}
          >
            {initial}
          </div>
        ))}

        {cells.map(cell => {
          const iso = isoDate(cell);
          const count = (byDate.get(iso) ?? []).length;
          const inMonth = cell.getMonth() === month;
          const isToday = iso === todayIso;
          const isSelected = iso === selected;

          return (
            <button
              key={iso}
              type="button"
              disabled={count === 0}
              onClick={() => setSelected(isSelected ? null : iso)}
              aria-label={`${cell.getDate()} ${MONTH_NAMES[cell.getMonth()]} — ${count} classes`}
              aria-pressed={isSelected}
              style={{
                aspectRatio: '1 / 1',
                minWidth: 0,
                padding: '2px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                borderRadius: theme.borderRadius.md,
                border: `1px solid ${
                  isSelected ? theme.colors.primary
                    : isToday ? theme.colors.bdr.secondary
                      : 'transparent'
                }`,
                backgroundColor: isSelected
                  ? theme.colors.primary
                  : count > 0 ? theme.colors.bg.secondary : 'transparent',
                cursor: count > 0 ? 'pointer' : 'default',
                // Days outside the month stay visible but recede — removing
                // them entirely leaves holes that break the week rows. A
                // selected one comes back to full: the first days of September
                // sit in the August grid, and a muted crimson reads as
                // disabled rather than chosen.
                opacity: inMonth || isSelected ? 1 : 0.35,
                fontFamily: theme.fonts.primary,
              }}
            >
              <span
                style={{
                  fontSize: isMobileOrTablet ? '13px' : '15px',
                  fontWeight: isToday ? 800 : 600,
                  color: isSelected ? '#FFFFFF' : theme.colors.txt.primary,
                }}
              >
                {cell.getDate()}
              </span>
              {count > 0 && (
                <span
                  style={{
                    fontFamily: theme.fonts.mono,
                    fontSize: isMobileOrTablet ? '9px' : '10px',
                    color: isSelected ? '#FFFFFF' : theme.colors.txt.tertiary,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected ? (
        <div>
          <DayHeading
            day={new Date(`${selected}T00:00:00`).getDay()}
            count={selectedClasses.length}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {selectedClasses
              .slice()
              .sort((a, b) => (minutesOfDay(a.startTime) ?? 0) - (minutesOfDay(b.startTime) ?? 0))
              .map(c => (
                <ClassCard key={c.id} klass={c} slug={slug} showCategory={showCategory} />
              ))}
          </div>
        </div>
      ) : (
        <EmptyState
          title="Pick a day"
          description="Tap any date with a number under it to see what is on that day."
        />
      )}
    </div>
  );
};
