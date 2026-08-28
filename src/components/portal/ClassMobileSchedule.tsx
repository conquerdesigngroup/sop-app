import React, { useEffect, useMemo, useRef, useState } from 'react';
import { theme } from '../../theme';
import { Button, EmptyState, SearchInput } from '../ui';
import PortalSheet from './PortalSheet';
import ClassDayStrip, { DaySelection } from './ClassDayStrip';
import ClassTimeline from './ClassTimeline';
import { ClassMonthView } from './ClassScheduleViews';
import { FacetGroups } from './classFilterControls';
import { ProgramSlug, dayName } from '../../lib/portal';
import {
  ClassFacets, ClassFilters, EMPTY_FILTERS, activeFilterCount, anyClassOn,
  applyFilters, defaultDay, initialMonth, minutesOfDay,
} from '../../lib/portalClasses';
import type { PortalClass } from '../../types';

/**
 * The schedule, on a phone.
 *
 * WHAT WAS WRONG WITH RESPONSIVE
 *
 * The desktop layout reflowed to 390px produced a page where the first class
 * sat 697 pixels down — a title, a view switch and a filter panel, and not one
 * class above the fold — and where the list view ran to eighteen thousand
 * pixels, twenty-two phone screens. The week view scrolled in two axes at once
 * inside a page that also scrolled. None of that is fixable by shrinking
 * padding; the page was answering "show me everything" when the question on a
 * phone is "what is on today".
 *
 * SO THE SHAPE IS DIFFERENT, NOT SMALLER
 *
 *   one row      search, plus a calendar and a filter button
 *   sticky strip the day picker, which IS the week view
 *   timeline     that day, ~20 rows at 72px, sectioned by afternoon/evening
 *
 * The eight facets moved into a bottom sheet behind a counted button, the month
 * calendar into another. Both are one tap away and neither costs a pixel until
 * it is asked for. Opening on today rather than on everything takes the first
 * paint from 102 classes to about 20, and the page height from 18,000px to
 * roughly 1,600.
 *
 * ONE SOURCE OF TRUTH FOR THE DAY
 *
 * The strip writes into `filters.days` rather than holding its own state, and
 * the sheet does not offer the Day facet. Two controls for one value is how
 * the strip ends up saying Thursday while the list shows Monday.
 *
 * There is no sort control here. Sorting twenty rows by teacher is not a real
 * need when a teacher is one tap away in the filters, and the two ways of
 * ordering — by day, then by time — are the two the timeline already uses.
 */

interface Props {
  classes: PortalClass[];
  slug: ProgramSlug;
  filters: ClassFilters;
  onFiltersChange: (next: ClassFilters) => void;
  facets: ClassFacets;
}

const IconButton: React.FC<{
  label: string;
  badge?: number;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, badge, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    style={{
      position: 'relative',
      width: '42px',
      height: '42px',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.borderRadius.md,
      border: `1px solid ${badge ? theme.colors.primary : theme.colors.bdr.primary}`,
      backgroundColor: theme.colors.bg.secondary,
      color: theme.colors.txt.secondary,
      cursor: 'pointer',
    }}
  >
    {children}
    {!!badge && (
      <span
        style={{
          position: 'absolute',
          top: '-6px',
          right: '-6px',
          minWidth: '18px',
          height: '18px',
          padding: '0 4px',
          borderRadius: theme.borderRadius.full,
          backgroundColor: theme.colors.primary,
          // Hardcoded on the crimson — mode-aware text tokens flip dark in
          // light mode and vanish against the pink.
          color: '#FFFFFF',
          fontFamily: theme.fonts.mono,
          fontSize: '11px',
          fontWeight: 700,
          lineHeight: '18px',
          textAlign: 'center',
        }}
      >
        {badge}
      </span>
    )}
  </button>
);

const ClassMobileSchedule: React.FC<Props> = ({
  classes, slug, filters, onFiltersChange, facets,
}) => {
  const [filterSheet, setFilterSheet] = useState(false);
  const [monthSheet, setMonthSheet] = useState(false);
  const [cursor, setCursor] = useState<{ year: number; month: number } | null>(null);

  const today = useMemo(() => new Date(), []);

  // Derived, not stored: the strip reads the same value it writes.
  const selected: DaySelection = filters.days.length === 1 ? filters.days[0] : 'all';
  const selectDay = (day: DaySelection) =>
    onFiltersChange({ ...filters, days: day === 'all' ? [] : [day] });

  // Open on today. Once — a ref rather than a dependency, so choosing "All"
  // does not get overwritten the next time this list settles.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || classes.length === 0) return;
    opened.current = true;
    const day = defaultDay(facets.days, today);
    if (day !== null) onFiltersChange({ ...filters, days: [day] });
    // Deliberately not reacting to filters/facets: this is a one-time default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes.length]);

  /**
   * Everything except the day, which is what the pill counts are counting.
   *
   * Counting the fully filtered list would make every pill but the selected one
   * read 0, and counting the unfiltered one would send you into a day that
   * turns out to be empty.
   */
  const withoutDay = useMemo(
    () => applyFilters(classes, { ...filters, days: [] }),
    [classes, filters]
  );

  const counts = useMemo(() => {
    const map = new Map<DaySelection, number>([['all', withoutDay.length]]);
    for (const c of withoutDay) {
      if (c.dayOfWeek === null) continue;
      map.set(c.dayOfWeek, (map.get(c.dayOfWeek) ?? 0) + 1);
    }
    return map;
  }, [withoutDay]);

  const visible = useMemo(() => {
    const scoped = selected === 'all'
      ? withoutDay
      : withoutDay.filter(c => c.dayOfWeek === selected);
    return [...scoped].sort(
      (a, b) =>
        (a.dayOfWeek ?? 7) - (b.dayOfWeek ?? 7) ||
        (minutesOfDay(a.startTime) ?? 0) - (minutesOfDay(b.startTime) ?? 0) ||
        a.name.localeCompare(b.name)
    );
  }, [withoutDay, selected]);

  // Only mark today when the studio is actually running that day — in the
  // summer gap there is a Thursday schedule but not this Thursday.
  const todayDay = anyClassOn(classes, today) ? today.getDay() : null;

  const month = cursor ?? initialMonth(classes, today);
  const active = activeFilterCount({ ...filters, days: [] });

  const heading = selected === 'all' ? 'All days' : dayName(selected) ?? 'All days';

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SearchInput
            placeholder="Search classes"
            value={filters.search}
            onChange={e => onFiltersChange({ ...filters, search: e.target.value })}
            onClear={() => onFiltersChange({ ...filters, search: '' })}
            aria-label="Search classes"
          />
        </div>

        <IconButton label="Open the month calendar" onClick={() => setMonthSheet(true)}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </IconButton>

        <IconButton label="Filter classes" badge={active} onClick={() => setFilterSheet(true)}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 6h16M7 12h10M10 18h4"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            />
          </svg>
        </IconButton>
      </div>

      <ClassDayStrip
        days={facets.days}
        counts={counts}
        selected={selected}
        onSelect={selectDay}
        todayDay={todayDay}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '8px',
          flexWrap: 'wrap',
          padding: '14px 0 2px',
        }}
      >
        <h2 style={{ ...theme.typography.h3, fontSize: '17px', color: theme.colors.txt.primary, margin: 0 }}>
          {heading}
        </h2>
        <span
          style={{
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.mono,
            color: theme.colors.txt.tertiary,
          }}
        >
          {visible.length} {visible.length === 1 ? 'class' : 'classes'}
        </span>
        {active > 0 && (
          <button
            type="button"
            onClick={() => onFiltersChange({ ...EMPTY_FILTERS, days: filters.days })}
            style={{
              marginLeft: 'auto',
              border: 'none',
              background: 'none',
              padding: '2px 0',
              cursor: 'pointer',
              fontFamily: theme.fonts.primary,
              fontSize: '13px',
              fontWeight: 600,
              color: theme.colors.primary,
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={selected === 'all' ? 'Nothing matches those filters' : `Nothing on ${heading}`}
          description={
            active > 0
              ? 'Try clearing a filter, or pick another day.'
              : 'Pick another day from the strip above.'
          }
        />
      ) : (
        <ClassTimeline classes={visible} slug={slug} byDay={selected === 'all'} />
      )}

      <PortalSheet
        isOpen={filterSheet}
        onClose={() => setFilterSheet(false)}
        title="Filters"
        footer={
          <>
            <Button
              variant="secondary"
              fullWidth
              disabled={active === 0}
              onClick={() => onFiltersChange({ ...EMPTY_FILTERS, days: filters.days })}
            >
              Clear all
            </Button>
            <Button variant="primary" fullWidth onClick={() => setFilterSheet(false)}>
              {/* The count is the point of the button: it answers "will this
                  leave me anything" before the sheet closes over the list. */}
              Show {visible.length} {visible.length === 1 ? 'class' : 'classes'}
            </Button>
          </>
        }
      >
        {/* No `days`. The strip owns that, and it is still visible behind the
            sheet's scrim. */}
        <FacetGroups
          filters={filters}
          onChange={onFiltersChange}
          facets={facets}
          show={['categories', 'bands', 'styles', 'ageGroups', 'instructors', 'rooms', 'age']}
        />
      </PortalSheet>

      <PortalSheet
        isOpen={monthSheet}
        onClose={() => setMonthSheet(false)}
        title="Season calendar"
      >
        <p
          style={{
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.tertiary,
            margin: 0,
          }}
        >
          Every date the studio runs, with how many classes. Tap one to jump the
          schedule to that day.
        </p>

        <ClassMonthView
          classes={withoutDay}
          slug={slug}
          showCategory={false}
          year={month.year}
          month={month.month}
          onMonthChange={(year, m) => setCursor({ year, month: m })}
          onPickDate={date => {
            selectDay(date.getDay());
            setMonthSheet(false);
          }}
        />
      </PortalSheet>
    </div>
  );
};

export default ClassMobileSchedule;
