import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { theme } from '../../theme';
import { useRefreshable } from '../../contexts/RefreshContext';
import { useToast } from '../../contexts/ToastContext';
import { callPortalAdmin } from '../../lib/portalAdminApi';
import { Badge, Button, Card, EmptyState, Select, Spinner } from '../ui';
import {
  ACCESS_STATE,
  AccessEvent,
  AccessPerson,
  EVENT_LABEL,
  EVENT_VARIANT,
  REJECT_REASON,
  accessState,
  describeCounts,
  describeWhen,
  sortPeople,
  summarise,
} from '../../lib/portalAccessEvents';

/**
 * Who has tried to get into the portal, and whether they could.
 *
 * WHY THIS IS NOT JUST THE ACTIVITY LOG
 *
 * Every event here already writes an activity_logs row, and /activity-log even
 * ships a saved "Failed sign-ins (7d)" view. It was not enough: the log shows
 * forty rows all reading "failed to sign in", and the thing the front desk
 * needs to know — whether there is an account behind the address at all — is
 * not in any of them. This screen answers that, groups by family, and puts the
 * ones nobody can help themselves at the top.
 *
 * IT LIVES ON THE ROSTER PAGE ON PURPOSE. The fixes are all here: Change email
 * for a family using the wrong address, the roster row for a family who is not
 * on it. "Find in roster" drops the address into this page's own search rather
 * than sending anyone to a second screen.
 */

const DAY_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

const COLLAPSED_ROWS = 6;

const label: React.CSSProperties = {
  ...theme.typography.caption,
  fontFamily: theme.fonts.primary,
  color: theme.colors.txt.tertiary,
};

const mono: React.CSSProperties = {
  ...theme.typography.bodySmall,
  fontFamily: theme.fonts.mono,
  color: theme.colors.txt.secondary,
  minWidth: 0,
  overflowWrap: 'anywhere',
};

/**
 * One number and what it counts.
 *
 * `tone` is only ever set for a count that means somebody is locked out, so a
 * quiet week is a row of plain grey rather than a wall of red.
 */
const Stat: React.FC<{ n: number; children: React.ReactNode; tone?: boolean }> = ({
  n,
  children,
  tone,
}) => (
  <div
    style={{
      flex: '1 1 120px',
      minWidth: 0,
      padding: '10px 12px',
      borderRadius: theme.borderRadius.md,
      border: `1px solid ${tone && n > 0 ? theme.colors.status.error : theme.colors.bdr.primary}`,
      background: theme.colors.bg.tertiary,
    }}
  >
    <div
      style={{
        ...theme.typography.h3,
        fontFamily: theme.fonts.primary,
        color: tone && n > 0 ? theme.colors.status.error : theme.colors.txt.primary,
        lineHeight: 1.1,
      }}
    >
      {n}
    </div>
    <div style={{ ...label, overflowWrap: 'anywhere' }}>{children}</div>
  </div>
);

const PersonRow: React.FC<{
  person: AccessPerson;
  onFindInRoster?: (email: string) => void;
}> = ({ person, onFindInRoster }) => {
  const state = accessState(person);
  const badge = ACCESS_STATE[state];

  return (
    <div
      style={{
        padding: '12px',
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.bdr.primary}`,
        background: theme.colors.bg.secondary,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Badge variant={badge.variant}>{badge.text}</Badge>
        <span
          style={{
            ...theme.typography.body,
            fontFamily: theme.fonts.primary,
            fontWeight: 600,
            color: theme.colors.txt.primary,
            minWidth: 0,
            overflowWrap: 'anywhere',
          }}
        >
          {person.householdName ?? 'Unknown family'}
        </span>
        {person.studentCount > 0 && (
          <span style={label}>
            {person.studentCount === 1 ? '1 dancer' : `${person.studentCount} dancers`}
          </span>
        )}
      </div>

      <span style={mono}>{person.email}</span>

      <p
        style={{
          ...theme.typography.bodySmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.secondary,
          margin: 0,
        }}
      >
        {badge.help}
      </p>

      <div style={{ ...label, overflowWrap: 'anywhere' }}>
        {describeCounts(person.counts)} · last {describeWhen(person.lastAt)}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <a
          href={`mailto:${person.email}`}
          style={{ textDecoration: 'none' }}
          aria-label={`Email ${person.email}`}
        >
          <Button variant="outline" size="sm">Email them</Button>
        </a>
        {onFindInRoster && (
          <Button variant="ghost" size="sm" onClick={() => onFindInRoster(person.email)}>
            Find in roster
          </Button>
        )}
      </div>
    </div>
  );
};

const EventRow: React.FC<{ event: AccessEvent }> = ({ event }) => (
  <div
    style={{
      display: 'flex',
      gap: '8px',
      flexWrap: 'wrap',
      alignItems: 'center',
      padding: '10px 12px',
      borderRadius: theme.borderRadius.md,
      border: `1px solid ${theme.colors.bdr.primary}`,
      background: theme.colors.bg.secondary,
    }}
  >
    <Badge variant={EVENT_VARIANT[event.kind]} size="sm">
      {EVENT_LABEL[event.kind]}
    </Badge>
    <span style={{ ...mono, flex: '1 1 200px' }}>{event.email}</span>
    <span style={label}>{describeWhen(event.at)}</span>
    {event.reason && (
      <span style={label}>({REJECT_REASON[event.reason] ?? event.reason})</span>
    )}
  </div>
);

const AccessEventsPanel: React.FC<{ onFindInRoster?: (email: string) => void }> = ({
  onFindInRoster,
}) => {
  const { error: toastError } = useToast();

  const [days, setDays] = useState('30');
  const [people, setPeople] = useState<AccessPerson[]>([]);
  const [events, setEvents] = useState<AccessEvent[]>([]);
  const [view, setView] = useState<'people' | 'events'>('people');
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // `silent` is the app-wide refresh: the list stays on screen while it
  // reloads rather than dropping to a spinner under the reader's thumb.
  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await callPortalAdmin({
          action: 'client_access_events',
          days: Number(days),
        });
        setPeople(data.people ?? []);
        setEvents(data.events ?? []);
        setLoaded(true);
      } catch (e: any) {
        // Rethrown for the refresh button, which reports how many loaders
        // failed; the toast is for the first load, where there is no button.
        if (!silent) toastError(e.message || 'Could not load sign-in activity');
        else throw e;
      } finally {
        setLoading(false);
      }
    },
    [days, toastError],
  );

  useEffect(() => {
    load();
  }, [load]);

  const reload = useCallback(() => load(true), [load]);
  useRefreshable(reload);

  const sorted = useMemo(() => sortPeople(people), [people]);
  const stats = useMemo(() => summarise(people), [people]);

  const rows = view === 'people' ? sorted : events;
  const shown = showAll ? rows : rows.slice(0, COLLAPSED_ROWS);

  return (
    <Card padding="md" style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <h2
            style={{
              ...theme.typography.h3,
              fontFamily: theme.fonts.display,
              color: theme.colors.txt.primary,
              margin: 0,
              flex: '1 1 200px',
              minWidth: 0,
            }}
          >
            Sign-in activity
          </h2>
          <div style={{ flex: '0 1 170px', minWidth: '150px' }}>
            <Select
              options={DAY_OPTIONS}
              value={days}
              onChange={e => { setDays(e.target.value); setShowAll(false); }}
              aria-label="How far back to look"
            />
          </div>
        </div>

        {loading && !loaded ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
            <Spinner size={28} color={theme.colors.primary} />
          </div>
        ) : (
          <>
            {/* Wraps — a four-across strip is two-across on a phone. */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Stat n={stats.stuck} tone>Never signed up</Stat>
              <Stat n={stats.notLinked} tone>Account not linked</Stat>
              <Stat n={stats.unknownEmail}>Wrong address</Stat>
              <Stat n={stats.registered}>Registered</Stat>
            </div>

            {stats.stuck > 0 && (
              <p
                style={{
                  ...theme.typography.bodySmall,
                  fontFamily: theme.fonts.primary,
                  color: theme.colors.status.error,
                  margin: 0,
                }}
              >
                {stats.stuck === 1
                  ? 'One family is trying to log in to an account that does not exist.'
                  : `${stats.stuck} families are trying to log in to accounts that do not exist.`}{' '}
                They cannot fix this by trying again — they have to tap Sign up.
              </p>
            )}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button
                variant={view === 'people' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => { setView('people'); setShowAll(false); }}
              >
                By family ({people.length})
              </Button>
              <Button
                variant={view === 'events' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => { setView('events'); setShowAll(false); }}
              >
                Every event ({events.length})
              </Button>
            </div>

            {rows.length === 0 ? (
              <EmptyState
                title="Nothing to report"
                description="No family has failed a sign-in, asked for a reset or registered in this window."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {view === 'people'
                  ? (shown as AccessPerson[]).map(p => (
                      <PersonRow key={p.email} person={p} onFindInRoster={onFindInRoster} />
                    ))
                  : (shown as AccessEvent[]).map(e => (
                      <EventRow key={`${e.at}-${e.email}-${e.kind}`} event={e} />
                    ))}

                {rows.length > COLLAPSED_ROWS && (
                  <Button variant="ghost" size="sm" onClick={() => setShowAll(v => !v)}>
                    {showAll ? 'Show fewer' : `Show all ${rows.length}`}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
};

export default AccessEventsPanel;
