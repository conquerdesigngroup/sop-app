import React, { useCallback, useMemo, useState } from 'react';
import { theme } from '../../theme';
import {
  Card, EmptyState, Spinner, ChevronLeftIcon, CalendarIcon,
} from '../../components/ui';
import PortalLayout from '../../components/portal/PortalLayout';
import EventBar from '../../components/calendar/EventBar';
import EventCard from '../../components/portal/EventCard';
import AddToCalendarSheet from '../../components/portal/AddToCalendarSheet';
import SubscribeSheet from '../../components/portal/SubscribeSheet';
import { usePortal } from '../../contexts/PortalContext';
import {
  portalRoutes,
  formatEventDate,
  eventDayOfMonth,
  eventMonthKey,
  eventDayKey,
  eventDayKeys,
  eventLastDayKey,
  describeEventWhen,
  dateKey,
} from '../../lib/portal';
import {
  monthWeeks,
  layoutWeek,
  hiddenPerColumn,
  addDays,
  parseDayKey,
} from '../../lib/calendarLayout';
import { useProgramPage, useProgramQuery } from './useProgramPage';
import { PortalEvent } from '../../types';

/**
 * Program calendar, in two modes.
 *
 * AGENDA is the default and is what this page was originally built as: opened
 * on a phone to answer "when is the next thing and where", which a list answers
 * in one scroll. Past events are dropped — a parent looking for the next
 * rehearsal does not want to scroll through October first.
 *
 * MONTH answers the other question, the one an agenda is bad at: "is there
 * anything on the week of the 12th". It cannot show titles at 375px — seven
 * columns leaves about 48px each — so the grid carries dots and the day's
 * events render underneath it when a day is tapped.
 *
 * The choice is remembered, because a parent who prefers one has that
 * preference every time they open it, not once.
 */

type ViewMode = 'list' | 'month';

const VIEW_KEY = 'didc_portal_calendar_view';

/**
 * Month is the default now. A parent opening this wants to see the shape of
 * the term — which weeks have something in them — and a list only answers
 * that by being read end to end. Anyone who prefers the list still gets it:
 * the choice is remembered, so this only changes the first visit.
 */
const readViewMode = (): ViewMode => {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'month';
  } catch {
    // Safari private mode throws on localStorage access.
    return 'month';
  }
};

const writeViewMode = (mode: ViewMode): void => {
  try {
    window.localStorage.setItem(VIEW_KEY, mode);
  } catch {
    /* no-op — the parent just gets the default next launch */
  }
};

// ------------------------------------------------------------------ shared

interface MonthGroup {
  key: string;
  label: string;
  events: PortalEvent[];
}

const groupByMonth = (events: PortalEvent[]): MonthGroup[] => {
  const groups = new Map<string, MonthGroup>();

  for (const event of events) {
    // Grouped in the event's own frame: an all-day event on the 1st read in
    // local time would otherwise fall into the previous month.
    const key = eventMonthKey(event.startsAt, event.isAllDay);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: formatEventDate(event.startsAt, event.isAllDay, { month: 'long', year: 'numeric' }),
        events: [],
      });
    }
    groups.get(key)!.events.push(event);
  }

  // Array.from rather than [...groups.values()]: tsconfig targets ES5 without
  // downlevelIteration, so spreading a Map iterator does not compile.
  return Array.from(groups.values());
};

const EventRow: React.FC<{
  event: PortalEvent;
  onOpen: (event: PortalEvent) => void;
  onAdd: (event: PortalEvent) => void;
}> = ({ event, onOpen, onAdd }) => (
  <Card hover onClick={() => onOpen(event)}>
    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
      {/* Date chip — the thing being scanned for. */}
      <div style={{ flexShrink: 0, width: '52px', textAlign: 'center', paddingTop: '2px' }}>
        <div style={{
          ...theme.typography.captionSmall,
          fontFamily: theme.fonts.mono,
          color: theme.colors.primary,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}>
          {formatEventDate(event.startsAt, event.isAllDay, { weekday: 'short' })}
        </div>
        <div style={{
          fontFamily: theme.fonts.display,
          fontStyle: 'italic',
          fontWeight: 800,
          fontSize: '26px',
          lineHeight: 1.1,
          color: theme.colors.txt.primary,
        }}>
          {eventDayOfMonth(event.startsAt, event.isAllDay)}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
        <div style={{
          ...theme.typography.body,
          fontFamily: theme.fonts.primary,
          fontWeight: 600,
          color: theme.colors.txt.primary,
          marginBottom: '4px',
        }}>
          {event.title}
        </div>

        <div style={{
          ...theme.typography.caption,
          fontFamily: theme.fonts.mono,
          color: theme.colors.txt.secondary,
        }}>
          {describeEventWhen(event.startsAt, event.endsAt, event.isAllDay)}
          {event.location ? ` · ${event.location}` : ''}
        </div>

        {/*
          No description here on purpose. These come from the studio's Google
          entries and open with bookkeeping — "Status: Confirmed" on every one,
          and occasionally a whole note written for staff. Printed on each row
          it buried the three things a parent is actually scanning for: what,
          when, where. The full text is still one tap away in the card.
        */}
      </div>

      {/* stopPropagation, or choosing a calendar also opens the event card
          behind the sheet. flexShrink so it keeps its touch target at 320px
          while the title column absorbs the squeeze. */}
      <button
        type="button"
        aria-label={`Add ${event.title} to my calendar`}
        onClick={e => { e.stopPropagation(); onAdd(event); }}
        style={{
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '3px',
          width: '48px',
          // 44px is the smallest reliable touch target.
          minHeight: '44px',
          padding: '5px 0',
          background: 'transparent',
          border: `1px solid ${theme.colors.bdr.primary}`,
          borderRadius: theme.borderRadius.md,
          color: theme.colors.txt.secondary,
          cursor: 'pointer',
        }}
      >
        <CalendarIcon size={15} />
        <span style={{
          fontFamily: theme.fonts.mono,
          fontSize: '9px',
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          Add
        </span>
      </button>
    </div>
  </Card>
);

// ------------------------------------------------------------------- toggle

const ViewToggle: React.FC<{ value: ViewMode; onChange: (v: ViewMode) => void }> = ({
  value, onChange,
}) => {
  const option = (mode: ViewMode, label: string) => {
    const active = value === mode;
    return (
      <button
        key={mode}
        type="button"
        onClick={() => onChange(mode)}
        aria-pressed={active}
        style={{
          flex: 1,
          minWidth: 0,
          padding: '9px 12px',
          border: 'none',
          borderRadius: theme.borderRadius.md,
          cursor: 'pointer',
          background: active ? theme.colors.primary : 'transparent',
          // Hardcoded white on the crimson fill: the mode-dependent text tokens
          // flip dark in light mode and lose contrast against it.
          color: active ? '#FFFFFF' : theme.colors.txt.secondary,
          fontFamily: theme.fonts.mono,
          fontSize: '12px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      role="group"
      aria-label="Calendar view"
      style={{
        display: 'flex',
        gap: '4px',
        padding: '4px',
        marginBottom: '16px',
        background: theme.colors.bg.tertiary,
        border: `1px solid ${theme.colors.bdr.primary}`,
        borderRadius: theme.borderRadius.lg,
      }}
    >
      {option('list', 'List')}
      {option('month', 'Month')}
    </div>
  );
};

// ---------------------------------------------------------------- subscribe

/**
 * The one thing on this page that keeps working after the app is closed.
 *
 * Everything else here — the grid, the agenda, the Add button — needs a parent
 * to come back and look. A subscription does not: the studio's next edit
 * arrives in their own calendar on its own. So it gets the page's only pink,
 * and it sits above the fold rather than at the bottom with the housekeeping.
 *
 * NOT DISMISSIBLE, deliberately. The handoff leaves this app — webcal:// goes
 * to the OS, the others open a vendor tab — so nothing here can ever learn
 * whether the parent actually finished subscribing. A banner that hides itself
 * on tap would vanish for the family who opened the sheet and changed their
 * mind, and they would never find it again. One 56px row on a page that scrolls
 * a whole term is a cheaper mistake than that.
 */
const SubscribeBanner: React.FC<{ onOpen: () => void }> = ({ onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      width: '100%',
      minHeight: '56px',
      padding: '12px 14px',
      marginBottom: '12px',
      textAlign: 'left',
      background: theme.colors.bg.secondary,
      border: `1px solid ${theme.colors.primary}`,
      borderRadius: theme.borderRadius.lg,
      cursor: 'pointer',
    }}
  >
    <span
      aria-hidden="true"
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '24px',
        color: theme.colors.primary,
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" />
      </svg>
    </span>

    {/* minWidth: 0 AND overflowWrap: a flex item will not shrink below its
        content's min-content width. Both, or this overflows at 320px. */}
    <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
      <span style={{
        display: 'block',
        ...theme.typography.body,
        fontFamily: theme.fonts.primary,
        fontWeight: 600,
        color: theme.colors.txt.primary,
      }}>
        Subscribe to this calendar
      </span>
      <span style={{
        display: 'block',
        ...theme.typography.captionSmall,
        fontFamily: theme.fonts.mono,
        color: theme.colors.txt.tertiary,
        marginTop: '2px',
      }}>
        New dates arrive on their own
      </span>
    </span>

    <span aria-hidden="true" style={{ flexShrink: 0, display: 'flex', color: theme.colors.txt.tertiary }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </span>
  </button>
);

// -------------------------------------------------------------- month grid

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// Month-row geometry. The bars are absolutely positioned, so their height and
// the space reserved above them for the date have to add up to the cell.
const MONTH_BAR_HEIGHT = 13;
const MONTH_NUMBER_HEIGHT = 18;
const MONTH_LANES = 3;
const MONTH_CELL_HEIGHT =
  MONTH_NUMBER_HEIGHT + MONTH_LANES * (MONTH_BAR_HEIGHT + 2) + 6;

/** Inclusive first and last day an event covers, for the span layout. */
const spanOf = (event: PortalEvent) => ({
  start: eventDayKey(event.startsAt, event.isAllDay),
  end: eventLastDayKey(event.startsAt, event.endsAt, event.isAllDay),
});

interface ViewProps {
  events: PortalEvent[];
  onOpen: (event: PortalEvent) => void;
  onAdd: (event: PortalEvent) => void;
}

const MonthView: React.FC<ViewProps> = ({ events, onOpen, onAdd }) => {
  const todayKey = dateKey(new Date());

  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(todayKey);

  // Every day an event covers, so a two-week closure paints across the grid
  // rather than marking only the day it began.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, PortalEvent[]>();
    for (const event of events) {
      for (const key of eventDayKeys(event.startsAt, event.endsAt, event.isAllDay)) {
        const list = map.get(key);
        if (list) list.push(event);
        else map.set(key, [event]);
      }
    }
    return map;
  }, [events]);

  // Clamped to what PortalContext actually fetches — a month back and a year
  // forward. Paging past that shows empty months and reads as a bug.
  const { min, max } = useMemo(() => {
    const now = new Date();
    return {
      min: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      max: new Date(now.getFullYear(), now.getMonth() + 12, 1),
    };
  }, []);

  const step = useCallback((delta: number) => {
    setCursor(c => new Date(c.getFullYear(), c.getMonth() + delta, 1));
    setSelectedKey(null);
  }, []);

  const canPrev = cursor > min;
  const canNext = cursor < max;

  // With a day selected, that day. Without one, everything in the month on
  // show — more use than an empty panel telling the parent to tap something.
  const listed = useMemo(() => {
    if (selectedKey) return eventsByDay.get(selectedKey) ?? [];

    // Walk the month itself rather than the grid, which also carried the
    // neighbouring months' edge days only to skip them again.
    const first = dateKey(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    const last = dateKey(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));

    const seen = new Set<string>();
    const out: PortalEvent[] = [];
    for (let key = first; key <= last; key = addDays(key, 1)) {
      for (const event of eventsByDay.get(key) ?? []) {
        // A multi-day event is filed under every day it covers.
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        out.push(event);
      }
    }
    return out;
  }, [selectedKey, eventsByDay, cursor]);

  const arrow = (dir: 'prev' | 'next', enabled: boolean) => (
    <button
      type="button"
      onClick={() => step(dir === 'prev' ? -1 : 1)}
      disabled={!enabled}
      aria-label={dir === 'prev' ? 'Previous month' : 'Next month'}
      style={{
        width: '40px',
        height: '40px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: `1px solid ${theme.colors.bdr.primary}`,
        borderRadius: theme.borderRadius.md,
        color: theme.colors.txt.secondary,
        cursor: enabled ? 'pointer' : 'default',
        opacity: enabled ? 1 : 0.35,
      }}
    >
      <span style={{
        display: 'flex',
        transform: dir === 'next' ? 'rotate(180deg)' : undefined,
      }}>
        <ChevronLeftIcon size={18} />
      </span>
    </button>
  );

  return (
    <>
      <Card padding="sm">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          marginBottom: '10px',
        }}>
          {arrow('prev', canPrev)}

          <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
            <div style={{
              fontFamily: theme.fonts.display,
              fontStyle: 'italic',
              fontWeight: 800,
              fontSize: '18px',
              textTransform: 'uppercase',
              color: theme.colors.txt.primary,
              overflowWrap: 'anywhere',
            }}>
              {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </div>
          </div>

          {arrow('next', canNext)}
        </div>

        {/*
          * minmax(0, 1fr), never plain 1fr. `1fr` is shorthand for
          * minmax(auto, 1fr), and the auto floor is the item's min-content
          * width — which for a <button> is 44px whatever is inside it. Seven of
          * those plus the gaps is 320px, so at 320 the columns stopped dividing
          * the row and started overflowing it, and the Saturday column sat
          * outside the card's right border. Same trap as the minWidth: 0 rule
          * for flex children, wearing grid's clothes.
          */}
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
            {WEEKDAYS.map((label, i) => (
              <div
                key={i}
                aria-hidden
                style={{
                  ...theme.typography.captionSmall,
                  fontFamily: theme.fonts.mono,
                  color: theme.colors.txt.tertiary,
                  textAlign: 'center',
                  padding: '4px 0 6px',
                  letterSpacing: '0.04em',
                }}
              >
                {label}
              </div>
            ))}
          </div>

          {/*
            One positioned row per week, the same shape as the staff calendar:
            the cells underneath are the tap targets, and every event is drawn
            in an overlay above them. A day cell can only ever draw its own
            square, which is why this used to be a dot per day and a week-long
            closure looked like seven unrelated marks.

            The bars carry no onClick. At 375px a column is about 49px, and a
            stack of individually tappable 13px bars in that space is a mis-tap
            generator — the whole cell selects the day, and the list below is
            where an event is actually opened.
          */}
          {monthWeeks(cursor.getFullYear(), cursor.getMonth()).map(weekStart => {
            const { segments } = layoutWeek(events, weekStart, spanOf);
            const shown = segments.filter(s => s.lane < MONTH_LANES);
            const hidden = hiddenPerColumn(segments, MONTH_LANES);

            return (
              <div key={weekStart} style={{ position: 'relative' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                  {Array.from({ length: 7 }).map((_, col) => {
                    const key = addDays(weekStart, col);
                    const day = parseDayKey(key);
                    const inMonth = day.getMonth() === cursor.getMonth();
                    const isToday = key === todayKey;
                    const isSelected = key === selectedKey;
                    const count = eventsByDay.get(key)?.length ?? 0;

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedKey(k => (k === key ? null : key))}
                        aria-pressed={isSelected}
                        aria-label={`${day.toLocaleDateString(undefined, {
                          weekday: 'long', month: 'long', day: 'numeric',
                        })}${count ? `, ${count} event${count === 1 ? '' : 's'}` : ''}`}
                        style={{
                          // Both halves are needed, and each is useless alone.
                          // The track is minmax(0, 1fr); this shrinks the
                          // BUTTON inside it, which defaults to min-width: auto
                          // and otherwise stays 44px wide in a 35px column and
                          // hangs past the card's edge.
                          minWidth: 0,
                          height: `${MONTH_CELL_HEIGHT}px`,
                          padding: '3px 0 0',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'flex-start',
                          background: isSelected ? theme.colors.primary : 'transparent',
                          border: isToday && !isSelected
                            ? `1px solid ${theme.colors.primary}`
                            : '1px solid transparent',
                          borderRadius: theme.borderRadius.md,
                          cursor: 'pointer',
                          opacity: inMonth ? 1 : 0.38,
                        }}
                      >
                        <span style={{
                          ...theme.typography.bodySmall,
                          fontFamily: theme.fonts.mono,
                          fontWeight: isToday || isSelected ? 700 : 400,
                          lineHeight: 1,
                          color: isSelected ? '#FFFFFF' : theme.colors.txt.primary,
                        }}>
                          {day.getDate()}
                        </span>

                        {hidden[col] > 0 && (
                          <span style={{
                            marginTop: 'auto',
                            fontFamily: theme.fonts.mono,
                            fontSize: '8px',
                            lineHeight: 1,
                            paddingBottom: '2px',
                            color: isSelected ? '#FFFFFF' : theme.colors.txt.tertiary,
                          }}>
                            +{hidden[col]}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div style={{
                  position: 'absolute',
                  top: `${MONTH_NUMBER_HEIGHT}px`,
                  left: 0,
                  right: 0,
                  pointerEvents: 'none',
                }}>
                  {shown.map(seg => (
                    <div
                      key={`${seg.item.id}-${weekStart}`}
                      style={{
                        position: 'absolute',
                        left: `${(seg.startCol / 7) * 100}%`,
                        width: `${(seg.span / 7) * 100}%`,
                        top: `${seg.lane * (MONTH_BAR_HEIGHT + 2)}px`,
                        height: `${MONTH_BAR_HEIGHT}px`,
                      }}
                    >
                      {/*
                        A neutral chip rather than the brand pink. The staff
                        calendar colours bars by which of the three studio
                        calendars an event came from; a parent sees one
                        programme, so there is nothing to tell apart — and a
                        grid of pink bars would blow past the rule that keeps
                        electric to about 5% of a view. Pink stays on today
                        and the selected day, where it means something.
                      */}
                      <EventBar
                        title={seg.item.title}
                        color={theme.colors.bdr.secondary}
                        filled
                        /* The bar is neutral here, not saturated, so the
                           default white label would sit on #CFCFD6 in light
                           mode. This one has to re-theme with the page. */
                        textColor={theme.colors.txt.primary}
                        continuesBefore={seg.continuesBefore}
                        continuesAfter={seg.continuesAfter}
                        compact
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div style={{ marginTop: '16px' }}>
        <h2 style={{
          ...theme.typography.captionSmall,
          fontFamily: theme.fonts.mono,
          color: theme.colors.txt.tertiary,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          margin: '0 0 10px',
        }}>
          {selectedKey
            ? formatEventDate(`${selectedKey}T00:00:00.000Z`, true, {
                weekday: 'long', month: 'long', day: 'numeric',
              })
            : `All of ${cursor.toLocaleDateString(undefined, { month: 'long' })}`}
        </h2>

        {listed.length === 0 ? (
          <Card>
            <p style={{
              ...theme.typography.body,
              fontFamily: theme.fonts.primary,
              color: theme.colors.txt.secondary,
              margin: 0,
            }}>
              {selectedKey ? 'Nothing on this day.' : 'Nothing scheduled this month.'}
            </p>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {listed.map(event => (
              <EventRow key={event.id} event={event} onOpen={onOpen} onAdd={onAdd} />
            ))}
          </div>
        )}
      </div>
    </>
  );
};

// -------------------------------------------------------------- agenda view

const ListView: React.FC<ViewProps> = ({ events, onOpen, onAdd }) => {
  const groups = useMemo(() => {
    const todayKey = dateKey(new Date());
    // Filtered on the LAST day, not the first. A two-week closure that started
    // on the 21st is still the answer to "are we closed today" on the 28th,
    // and filtering on starts_at dropped it the moment it began.
    return groupByMonth(
      events.filter(e => eventLastDayKey(e.startsAt, e.endsAt, e.isAllDay) >= todayKey)
    );
  }, [events]);

  if (groups.length === 0) {
    return (
      <EmptyState
        title="Nothing scheduled yet"
        description="Rehearsals, competitions and studio dates will appear here."
      />
    );
  }

  return (
    <>
      {groups.map(group => (
        <section key={group.key} style={{ marginBottom: '28px' }}>
          {/* The count turns a heading into a signpost: it tells you whether
              a month is worth scrolling into before you scroll into it. */}
          <h2 style={{
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.mono,
            color: theme.colors.txt.tertiary,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            margin: '0 0 10px',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: '12px',
          }}>
            <span>{group.label}</span>
            <span style={{ letterSpacing: '0.04em', textTransform: 'none' }}>
              {group.events.length} {group.events.length === 1 ? 'event' : 'events'}
            </span>
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {group.events.map(event => (
              <EventRow key={event.id} event={event} onOpen={onOpen} onAdd={onAdd} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
};

// -------------------------------------------------------------------- page

const ProgramCalendar: React.FC = () => {
  const { slug, program } = useProgramPage();
  const { fetchEvents } = usePortal();
  const { data: events, loading, error } = useProgramQuery<PortalEvent[]>(program?.id, fetchEvents, []);

  const [view, setView] = useState<ViewMode>(readViewMode);
  const [opened, setOpened] = useState<PortalEvent | null>(null);
  /**
   * Separate from `opened` on purpose. The sheet is reachable from a row
   * WITHOUT opening the card, and from inside the card without closing it, so
   * one piece of state cannot describe both.
   */
  const [addingTo, setAddingTo] = useState<PortalEvent | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  const changeView = useCallback((next: ViewMode) => {
    setView(next);
    writeViewMode(next);
  }, []);

  const closeCard = useCallback(() => setOpened(null), []);
  const closeSheet = useCallback(() => setAddingTo(null), []);
  const openSubscribe = useCallback(() => setSubscribing(true), []);
  const closeSubscribe = useCallback(() => setSubscribing(false), []);

  return (
    <PortalLayout
      title="Calendar"
      subtitle={program?.name}
      backTo={portalRoutes.program(slug)}
      slug={slug}
    >
      <div style={{ maxWidth: '720px' }}>
        <ViewToggle value={view} onChange={changeView} />

        <SubscribeBanner onOpen={openSubscribe} />

        {/*
          Said once here rather than repeated on every row. The calendar
          button used to be a bare icon — obvious the moment you have pressed
          it, and cryptic until then.
        */}
        <p style={{
          ...theme.typography.bodySmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.tertiary,
          margin: '0 0 16px',
        }}>
          Tap an event for full details, or press{' '}
          <span style={{ color: theme.colors.txt.secondary, fontWeight: 600 }}>Add</span>
          {' '}to save one date to Google, Apple or Outlook.
        </p>

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

        {!loading && !error && (
          view === 'month'
            ? <MonthView events={events} onOpen={setOpened} onAdd={setAddingTo} />
            : <ListView events={events} onOpen={setOpened} onAdd={setAddingTo} />
        )}
      </div>

      <EventCard event={opened} onClose={closeCard} onAddToCalendar={setAddingTo} />
      <AddToCalendarSheet event={addingTo} onClose={closeSheet} />
      <SubscribeSheet
        isOpen={subscribing}
        onClose={closeSubscribe}
        slug={slug}
        programName={program?.name ?? 'Calendar'}
      />
    </PortalLayout>
  );
};

export default ProgramCalendar;
