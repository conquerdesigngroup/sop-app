import React from 'react';
import { theme } from '../../theme';
import { Card } from '../../components/ui';
import PortalLayout from '../../components/portal/PortalLayout';
import NavTile from '../../components/portal/NavTile';
import { ContentCardSkeleton } from '../../components/portal/PortalSkeleton';
import CountdownBand from '../../components/portal/CountdownBand';
import ProgramHero from '../../components/portal/ProgramHero';
import { usePortal } from '../../contexts/PortalContext';
import { portalRoutes, eventLastDayKey } from '../../lib/portal';
import { studioToday } from '../../lib/studioDate';
import { useProgramPage, useProgramQuery } from './useProgramPage';
import { PortalUpdate, PortalEvent } from '../../types';

/**
 * A program's overview: the four content areas, plus whatever is most likely to
 * be the reason a parent opened the app — the newest announcement and the next
 * thing on the calendar.
 */

const icon = (d: string) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ProgramHome: React.FC = () => {
  const { slug, program } = useProgramPage();
  const { fetchUpdates, fetchEvents, heroUrls } = usePortal();

  const updates = useProgramQuery<PortalUpdate[]>(program?.id, fetchUpdates, []);
  const events = useProgramQuery<PortalEvent[]>(program?.id, fetchEvents, []);

  const latest = updates.data[0];
  // Two bugs lived in one line here. Comparing startsAt to `now` skipped an
  // all-day event happening TODAY — it is stored at UTC midnight, which is
  // already in the past by breakfast in California — and the `?? events.data[0]`
  // fallback put a finished event under the heading "Coming up", because
  // fetchEvents deliberately reaches a month back.
  //
  // Comparing the event's LAST day against today's key fixes both: a run of
  // days stays "coming up" while it is still running, and no match means the
  // card simply does not render.
  // The STUDIO's today, not the reader's. It was dateKey(new Date()) — the
  // viewer's local date — which is the wrong frame for a studio date and would
  // put the countdown below a day out for a grandparent watching from Chicago
  // at 10pm. Same reasoning as lib/studioDate.ts, and the band is handed this
  // exact string so the page has one clock rather than two.
  const todayKey = studioToday();
  const nextEvent = events.data.find(
    e => eventLastDayKey(e.startsAt, e.endsAt, e.isAllDay) >= todayKey
  );
  const busy = updates.loading || events.loading;

  return (
    <PortalLayout
      title={program?.name ?? 'Loading…'}
      subtitle={program?.blurb}
      backTo={portalRoutes.home}
      slug={slug}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '720px' }}>
        {/* Above the summary cards and outside the `busy` branch: the hero is
            already in the provider by the time this page mounts, so gating it
            on the updates fetch would hide a picture that is ready. It renders
            nothing when the program has none. */}
        {program && (
          <ProgramHero url={heroUrls[program.id]} alt={program.heroAlt} />
        )}
        {/* What's new — only rendered when there is something to show, so an
            empty section reads as deliberate rather than broken. */}
        {/* Only the two summary cards are skeletoned. The three nav tiles
            below do not wait on a fetch — they are always there — so standing
            them in as well would flash a placeholder over content that is
            already on screen. */}
        {busy && <ContentCardSkeleton count={2} lines={2} />}

        {!busy && (latest || nextEvent) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {latest && (
              <Card>
                <div style={{
                  ...theme.typography.captionSmall,
                  fontFamily: theme.fonts.mono,
                  color: theme.colors.primary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '8px',
                }}>
                  {latest.isPinned ? 'Pinned' : 'Latest update'}
                </div>
                <div style={{ ...theme.typography.h3, color: theme.colors.txt.primary, marginBottom: '6px' }}>
                  {latest.title}
                </div>
                <p style={{
                  ...theme.typography.bodySmall,
                  fontFamily: theme.fonts.primary,
                  color: theme.colors.txt.secondary,
                  margin: 0,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {latest.body}
                </p>
              </Card>
            )}

            {nextEvent && (
              <CountdownBand
                event={nextEvent}
                today={todayKey}
                to={portalRoutes.calendar(slug)}
              />
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <NavTile
            label="Classes"
            description="Schedules, and the info and files for each one"
            to={portalRoutes.classes(slug)}
            icon={icon('M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87')}
          />
          <NavTile
            label="Info"
            description="Announcements from the studio and your teachers"
            to={portalRoutes.updates(slug)}
            icon={icon('M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0')}
            meta={updates.data.length ? String(updates.data.length) : undefined}
          />
          <NavTile
            label="Calendar"
            description="Rehearsals, competitions and studio dates"
            to={portalRoutes.calendar(slug)}
            icon={icon('M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z M16 2v4 M8 2v4 M3 10h18')}
          />
        </div>
      </div>
    </PortalLayout>
  );
};

export default ProgramHome;
