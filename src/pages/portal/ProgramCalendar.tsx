import React, { useCallback, useMemo, useState } from 'react';
import { theme } from '../../theme';
import { Card, EmptyState, Spinner, ChevronLeftIcon } from '../../components/ui';
import PortalLayout from '../../components/portal/PortalLayout';
import { usePortal } from '../../contexts/PortalContext';
import {
  portalRoutes,
  formatEventDate,
  formatEventTime,
  eventDayOfMonth,
  eventMonthKey,
  eventDayKey,
  eventDayKeys,
  eventLastDayKey,
  monthGridDays,
  dateKey,
} from '../../lib/portal';
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

const readViewMode = (): ViewMode => {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'month' ? 'month' : 'list';
  } catch {
    // Safari private mode throws on localStorage access.
    return 'list';
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

/** "4:30 PM – 6:00 PM", "All day", or "Dec 21 – Jan 3" for a run of days. */
const describeWhen = (event: PortalEvent): string => {
  const firstDay = eventDayKey(event.startsAt, event.isAllDay);
  const lastDay = eventLastDayKey(event.startsAt, event.endsAt, event.isAllDay);

  if (lastDay !== firstDay) {
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    const from = formatEventDate(event.startsAt, event.isAllDay, opts);
    const to = formatEventDate(event.endsAt!, event.isAllDay, opts);
    return `${from} – ${to}`;
  }

  if (event.isAllDay) return 'All day';

  return event.endsAt
    ? `${formatEventTime(event.startsAt, false)} – ${formatEventTime(event.endsAt, false)}`
    : formatEventTime(event.startsAt, false);
};

const EventRow: React.FC<{ event: PortalEvent }> = ({ event }) => (
  <Card>
    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
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
          {describeWhen(event)}{event.location ? ` · ${event.location}` : ''}
        </div>

        {event.description && (
          <p style={{
            ...theme.typography.bodySmall,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.tertiary,
            margin: '8px 0 0',
            whiteSpace: 'pre-wrap',
          }}>
            {event.description}
          </p>
        )}
      </div>
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

// -------------------------------------------------------------- month grid

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** Dots rather than titles: seven columns leaves ~48px each on a phone. */
const DayDots: React.FC<{ count: number; muted: boolean }> = ({ count, muted }) => (
  <div style={{
    display: 'flex',
    // A centred row must be able to wrap — overflow under justifyContent
    // 'center' is split both ways and the left half is unreachable.
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '3px',
    height: '7px',
    marginTop: '3px',
  }}>
    {Array.from({ length: Math.min(count, 3) }, (_, i) => (
      <span
        key={i}
        style={{
          width: '5px',
          height: '5px',
          borderRadius: theme.borderRadius.full,
          background: muted ? theme.colors.txt.tertiary : theme.colors.primary,
        }}
      />
    ))}
  </div>
);

const MonthView: React.FC<{ events: PortalEvent[] }> = ({ events }) => {
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

  const days = useMemo(
    () => monthGridDays(cursor.getFullYear(), cursor.getMonth()),
    [cursor]
  );

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

    const seen = new Set<string>();
    const out: PortalEvent[] = [];
    for (const day of days) {
      if (day.getMonth() !== cursor.getMonth()) continue;
      for (const event of eventsByDay.get(dateKey(day)) ?? []) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        out.push(event);
      }
    }
    return out;
  }, [selectedKey, eventsByDay, days, cursor]);

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '2px' }}>
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

          {days.map(day => {
            const key = dateKey(day);
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
                  // Both halves are needed, and each is useless alone. The
                  // track is sized by minmax(0, 1fr) above; this shrinks the
                  // BUTTON inside it, which defaults to min-width: auto and
                  // otherwise stays 44px wide in a 35px column and hangs past
                  // the card's edge.
                  minWidth: 0,
                  // Height, not width: 44px is the smallest reliable touch
                  // target, and a short row is the part that must not shrink.
                  minHeight: '44px',
                  padding: '5px 0 4px',
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
                <DayDots count={count} muted={isSelected} />
              </button>
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
            {listed.map(event => <EventRow key={event.id} event={event} />)}
          </div>
        )}
      </div>
    </>
  );
};

// -------------------------------------------------------------- agenda view

const ListView: React.FC<{ events: PortalEvent[] }> = ({ events }) => {
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
          <h2 style={{
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.mono,
            color: theme.colors.txt.tertiary,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            margin: '0 0 10px',
          }}>
            {group.label}
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {group.events.map(event => <EventRow key={event.id} event={event} />)}
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

  const changeView = useCallback((next: ViewMode) => {
    setView(next);
    writeViewMode(next);
  }, []);

  return (
    <PortalLayout
      title="Calendar"
      subtitle={program?.name}
      backTo={portalRoutes.program(slug)}
      slug={slug}
    >
      <div style={{ maxWidth: '720px' }}>
        <ViewToggle value={view} onChange={changeView} />

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
            ? <MonthView events={events} />
            : <ListView events={events} />
        )}
      </div>
    </PortalLayout>
  );
};

export default ProgramCalendar;
