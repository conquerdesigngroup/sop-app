import React from 'react';
import { Link } from 'react-router-dom';
import { theme } from '../../theme';
import { Card, EmptyState, Spinner } from '../../components/ui';
import PortalLayout from '../../components/portal/PortalLayout';
import { usePortal } from '../../contexts/PortalContext';
import { portalRoutes, formatClassSchedule } from '../../lib/portal';
import { useProgramPage, useProgramQuery } from './useProgramPage';
import { PortalClass } from '../../types';

/**
 * Every class in a program. Each one links to its own page, where its teacher's
 * updates live.
 */
const ProgramClasses: React.FC = () => {
  const { slug, program } = useProgramPage();
  const { fetchClasses } = usePortal();
  const { data: classes, loading, error } = useProgramQuery<PortalClass[]>(program?.id, fetchClasses, []);

  return (
    <PortalLayout
      title="Classes"
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

        {!loading && !error && classes.length === 0 && (
          <EmptyState
            title="No classes listed yet"
            description="Class schedules for this program will appear here once the studio adds them."
          />
        )}

        {!loading && !error && classes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {classes.map(c => {
              const schedule = formatClassSchedule(c.dayOfWeek, c.startTime, c.endTime);
              return (
                <Link
                  key={c.id}
                  to={portalRoutes.classDetail(slug, c.id)}
                  style={{
                    backgroundColor: theme.colors.bg.secondary,
                    border: `2px solid ${theme.colors.bdr.primary}`,
                    borderRadius: theme.borderRadius.lg,
                    padding: '18px',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, display: 'block' }}>
                    <span style={{
                      ...theme.typography.h3,
                      color: theme.colors.txt.primary,
                      display: 'block',
                      marginBottom: '6px',
                    }}>
                      {c.name}
                    </span>

                    {schedule && (
                      <span style={{
                        ...theme.typography.bodySmall,
                        fontFamily: theme.fonts.mono,
                        color: theme.colors.txt.secondary,
                        display: 'block',
                      }}>
                        {schedule}
                      </span>
                    )}

                    {(c.instructorName || c.level || c.location) && (
                      <span style={{
                        ...theme.typography.caption,
                        fontFamily: theme.fonts.primary,
                        color: theme.colors.txt.tertiary,
                        display: 'block',
                        marginTop: '4px',
                      }}>
                        {[c.instructorName, c.level, c.location].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>

                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }} aria-hidden="true">
                    <path d="M9 18l6-6-6-6" style={{ stroke: theme.colors.txt.tertiary }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </PortalLayout>
  );
};

export default ProgramClasses;
