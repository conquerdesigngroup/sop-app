import React, { useMemo } from 'react';
import { theme } from '../../theme';
import { Card, EmptyState, Spinner } from '../../components/ui';
import PortalLayout from '../../components/portal/PortalLayout';
import { usePortal } from '../../contexts/PortalContext';
import {
  portalRoutes,
  formatEventDate,
  formatEventTime,
  eventDayOfMonth,
  eventMonthKey,
  startOfToday,
} from '../../lib/portal';
import { useProgramPage, useProgramQuery } from './useProgramPage';
import { PortalEvent } from '../../types';

/**
 * Program calendar, as an agenda grouped by month.
 *
 * An agenda rather than a month grid, deliberately. This is opened on a phone
 * to answer "when is the next thing and where", and a 7-column grid at 375px
 * either truncates every title or needs a tap-through per day. A studio season
 * is tens of events, not hundreds, so a list shows more in less space.
 *
 * Past events are dropped rather than shown greyed out — a parent scrolling for
 * the next rehearsal does not want to scroll through October first.
 */

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

const EventRow: React.FC<{ event: PortalEvent }> = ({ event }) => {
  const start = new Date(event.startsAt);
  const end = event.endsAt ? new Date(event.endsAt) : null;

  const time = event.isAllDay
    ? 'All day'
    : end && end.toDateString() === start.toDateString()
      ? `${formatEventTime(event.startsAt, false)} – ${formatEventTime(event.endsAt!, false)}`
      : formatEventTime(event.startsAt, false);

  return (
    <Card>
      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
        {/* Date chip — the thing being scanned for. */}
        <div
          style={{
            flexShrink: 0,
            width: '52px',
            textAlign: 'center',
            paddingTop: '2px',
          }}
        >
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

        <div style={{ flex: 1, minWidth: 0 }}>
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
            {time}{event.location ? ` · ${event.location}` : ''}
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
};

const ProgramCalendar: React.FC = () => {
  const { slug, program } = useProgramPage();
  const { fetchEvents } = usePortal();
  const { data: events, loading, error } = useProgramQuery<PortalEvent[]>(program?.id, fetchEvents, []);

  const groups = useMemo(() => {
    const today = startOfToday();
    return groupByMonth(events.filter(e => new Date(e.startsAt) >= today));
  }, [events]);

  return (
    <PortalLayout
      title="Calendar"
      subtitle={program?.name}
      backTo={portalRoutes.program(slug)}
      slug={slug}
    >
      <div style={{ maxWidth: '720px' }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
            <Spinner size={28} color={theme.colors.primary} />
          </div>
        )}

        {!loading && error && (
          <Card><p style={{ ...theme.typography.body, fontFamily: theme.fonts.primary, color: theme.colors.txt.secondary, margin: 0 }}>{error}</p></Card>
        )}

        {!loading && !error && groups.length === 0 && (
          <EmptyState
            title="Nothing scheduled yet"
            description="Rehearsals, competitions and studio dates will appear here."
          />
        )}

        {!loading && !error && groups.map(group => (
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
      </div>
    </PortalLayout>
  );
};

export default ProgramCalendar;
