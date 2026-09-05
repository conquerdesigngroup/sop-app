import React, { useCallback, useMemo, useState } from 'react';
import { theme } from '../../theme';
import { Card, EmptyState, Spinner } from '../../components/ui';
import PortalLayout from '../../components/portal/PortalLayout';
import AddToCalendarSheet from '../../components/portal/AddToCalendarSheet';
import ClassFilterBar from '../../components/portal/ClassFilterBar';
import ClassMobileSchedule from '../../components/portal/ClassMobileSchedule';
import {
  ClassListView, ClassMonthView, ClassWeekView,
} from '../../components/portal/ClassScheduleViews';
import { usePortal } from '../../contexts/PortalContext';
import { useResponsive } from '../../hooks/useResponsive';
import { PROGRAM_CLASS_CATEGORIES, portalRoutes } from '../../lib/portal';
import {
  ClassFilters, ClassSort, ClassView, EMPTY_FILTERS, applyFilters, buildFacets,
  initialMonth, readClassView, sortClasses, writeClassView,
} from '../../lib/portalClasses';
import { classTarget } from '../../lib/classCalendar';
import { useProgramPage, useProgramQuery } from './useProgramPage';
import { PortalClass } from '../../types';

/**
 * The schedule.
 *
 * WHAT THIS PAGE SHOWS
 *
 * Not "this program's classes" — the categories in PROGRAM_CLASS_CATEGORIES.
 * The All-Star schedule is the whole studio, because a company dancer takes
 * Academy technique on Tuesday and started in TNT; the Academy/TNT schedule is
 * Academy and TNT only, because company routines are closed. The fetch is
 * scoped by category in PortalContext, so nothing here filters for access.
 *
 * TWO LAYOUTS, NOT ONE RESPONSIVE ONE
 *
 * A phone gets ClassMobileSchedule: a sticky day strip, a dense timeline, and
 * the filters in a bottom sheet. A desktop gets the three views below. That is
 * a real fork rather than a breakpoint, because the desktop shape reflowed to
 * 390px put the first class 697 pixels down the page and ran the list to
 * eighteen thousand — twenty-two phone screens. The header comment in
 * ClassMobileSchedule has the rest of the reasoning.
 *
 * What they share is everything that is not layout: the same fetch, the same
 * ClassFilters, the same facet controls, the same recurrence maths. Only the
 * arrangement forks.
 *
 * WHY THREE VIEWS ON A DESKTOP
 *
 * A hundred and two classes is past the point where a single list answers a
 * question. "What is on Tuesday" is a week; "is there anything on the 14th" is
 * a month; "what Hip Hop could my nine-year-old do" is a filtered list. Each
 * view reads the same filtered, sorted array — the filters are not per-view,
 * so switching between them never silently changes what you are looking at.
 *
 * Filter state is component state rather than the URL. It resets when a parent
 * navigates away, which is the right default for something used to answer one
 * question and then leave. The VIEW does persist — see readClassView.
 */

const VIEWS: { value: ClassView; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const ViewSwitch: React.FC<{ value: ClassView; onChange: (v: ClassView) => void }> = ({
  value, onChange,
}) => (
  <div
    role="group"
    aria-label="How to show the schedule"
    style={{
      display: 'inline-flex',
      gap: '2px',
      padding: '3px',
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.bg.tertiary,
      border: `1px solid ${theme.colors.bdr.primary}`,
      maxWidth: '100%',
    }}
  >
    {VIEWS.map(v => {
      const active = v.value === value;
      return (
        <button
          key={v.value}
          type="button"
          onClick={() => onChange(v.value)}
          aria-pressed={active}
          style={{
            padding: '7px 16px',
            border: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            borderRadius: theme.borderRadius.full,
            backgroundColor: active ? theme.colors.primary : 'transparent',
            // Hardcoded on the crimson — the mode-aware tokens flip dark in
            // light mode and disappear against the pink.
            color: active ? '#FFFFFF' : theme.colors.txt.secondary,
            fontFamily: theme.fonts.primary,
            fontSize: '13px',
            fontWeight: 600,
            transition: 'background-color 0.2s ease, color 0.2s ease',
          }}
        >
          {v.label}
        </button>
      );
    })}
  </div>
);

const ProgramClasses: React.FC = () => {
  const { slug, program } = useProgramPage();
  const { fetchClasses } = usePortal();
  const { isMobileOrTablet } = useResponsive();

  // useProgramQuery keys its effect on the program id; slug and id are 1:1, so
  // this closure is refreshed exactly when the effect re-runs.
  const run = useCallback(() => fetchClasses(slug), [fetchClasses, slug]);
  const { data: classes, loading, error } = useProgramQuery<PortalClass[]>(program?.id, run, []);

  // Lazy initialiser: reading localStorage on every render would be wasted
  // work, and useState calls this once.
  const [view, setView] = useState<ClassView>(readClassView);
  const chooseView = useCallback((next: ClassView) => {
    setView(next);
    writeClassView(next);
  }, []);
  const [filters, setFilters] = useState<ClassFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<ClassSort>('schedule');

  /**
   * One sheet for the page, not one per card.
   *
   * A hundred and two classes means a hundred and two cards, and each of them
   * owning its own sheet would be a hundred and two sets of hooks to service a
   * panel only one of them can ever show. The page holds the class being added
   * and the views pass a callback down — the same shape ProgramCalendar uses.
   *
   * The target is rebuilt on each render of the open sheet rather than stored,
   * so the .ics can never describe a class the schedule has since refreshed.
   */
  const [addingTo, setAddingTo] = useState<PortalClass | null>(null);
  const closeSheet = useCallback(() => setAddingTo(null), []);

  // The month view opens on the start of the season rather than on today, so
  // that looking at the schedule in August does not show an empty grid.
  const [cursor, setCursor] = useState<{ year: number; month: number } | null>(null);
  const month = cursor ?? initialMonth(classes, new Date());

  const facets = useMemo(() => buildFacets(classes), [classes]);
  const visible = useMemo(
    () => sortClasses(applyFilters(classes, filters), sort),
    [classes, filters, sort]
  );

  // A badge saying "Academy" on a page where everything is Academy is noise.
  const showCategory = PROGRAM_CLASS_CATEGORIES[slug].length > 1;

  return (
    <PortalLayout
      title="Classes"
      subtitle={program?.name}
      backTo={portalRoutes.program(slug)}
      slug={slug}
    >
      {/* Wider than the rest of the portal: the week view is six columns and
          the month view is seven, and 720px squeezes both. The phone gets a
          tighter gap because its shell is a stack of small pieces rather than
          three big ones.

          THE WEEK GETS MORE THAN THE OTHER TWO

          1100px was picked to be generous and is 100px short of what six
          190px day columns and their gaps actually need, so the week view
          overflowed and clipped Saturday on every desktop — including a
          1920px one, which had 800px going spare outside the cap.

          So the week takes the whole shell, which PortalLayout already caps
          at theme.pageLayout.maxWidth (1400px, less 40px padding a side =
          1320px of content). Six columns and their gaps want 1200px, so they
          now fit with room to grow into. The list and month keep 1100, where
          a full-width row holding one class name would just be a long thin
          line. Any number above 1320 here would be a fiction — the shell
          clamps it — which is why this says 100% and not a bigger figure. */}
      <div
        style={{
          maxWidth: view === 'week' && !isMobileOrTablet ? '100%' : '1100px',
          display: 'flex',
          flexDirection: 'column',
          gap: isMobileOrTablet ? '12px' : '20px',
        }}
      >
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
            <Spinner size={28} color={theme.colors.primary} />
          </div>
        )}

        {!loading && error && (
          <Card>
            <p style={{
              ...theme.typography.body,
              fontFamily: theme.fonts.primary,
              color: theme.colors.txt.secondary,
              margin: 0,
            }}>
              {error}
            </p>
          </Card>
        )}

        {!loading && !error && classes.length === 0 && (
          <EmptyState
            title="No classes listed yet"
            description="Class schedules for this program will appear here once the studio adds them."
          />
        )}

        {!loading && !error && classes.length > 0 && isMobileOrTablet && (
          <ClassMobileSchedule
            classes={classes}
            slug={slug}
            filters={filters}
            onFiltersChange={setFilters}
            facets={facets}
          />
        )}

        {!loading && !error && classes.length > 0 && !isMobileOrTablet && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
              <ViewSwitch value={view} onChange={chooseView} />
            </div>

            <ClassFilterBar
              filters={filters}
              onChange={setFilters}
              facets={facets}
              sort={sort}
              onSortChange={setSort}
              shown={visible.length}
              total={classes.length}
            />

            {visible.length === 0 ? (
              <EmptyState
                title="Nothing matches those filters"
                description="Try clearing a filter, or search for the class name instead."
              />
            ) : view === 'list' ? (
              <ClassListView
                classes={visible}
                slug={slug}
                showCategory={showCategory}
                onAddToCalendar={setAddingTo}
                // Only group under day headings when the list is actually in
                // day order; grouping a teacher-sorted list would misdescribe it.
                grouped={sort === 'schedule'}
              />
            ) : view === 'week' ? (
              <ClassWeekView classes={visible} slug={slug} showCategory={showCategory} />
            ) : (
              <ClassMonthView
                classes={visible}
                slug={slug}
                showCategory={showCategory}
                onAddToCalendar={setAddingTo}
                year={month.year}
                month={month.month}
                onMonthChange={(year, m) => setCursor({ year, month: m })}
              />
            )}
          </>
        )}
      </div>

      <AddToCalendarSheet
        target={addingTo ? classTarget(addingTo, new Date()) : null}
        onClose={closeSheet}
      />
    </PortalLayout>
  );
};

export default ProgramClasses;
