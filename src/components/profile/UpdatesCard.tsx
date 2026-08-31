import React, { useEffect, useState } from 'react';
import { theme } from '../../theme';
import { Button, Card, Spinner } from '../ui';
import { PortalUpdate } from '../../types';
import { LoadError, loadMyUpdates } from '../../lib/attendanceQueries';
import CardError from './CardError';
import { ProfileCardProps } from '../../lib/profileCards';
import { useHousehold } from './useHousehold';

/**
 * Studio notices, filtered to the ones that apply to this family.
 *
 * THE FILTER IS THE FEATURE
 *
 * `portal_updates.class_id` has existed since v9 and has never been used to
 * decide who sees what — the program pages show every update for a program, so
 * a Ballet family reads Hip Hop notices, learns the page is mostly not for
 * them, and stops reading it. Then the one notice that mattered gets missed.
 *
 * A null class_id is studio-wide and still reaches everyone. A set one now
 * reaches only the enrolled. That is the entire change, and it needs no schema
 * work at all — only knowing which classes the household is in.
 *
 * READ STATE IS LOCAL AND DELIBERATELY FORGIVING
 *
 * "New" is computed against a last-seen timestamp in localStorage rather than a
 * server-side read receipt. A parent who opens the portal on a second phone
 * seeing a notice marked new again is a much cheaper mistake than a table of
 * per-user read state, and nothing here is important enough to warrant one.
 */

const SEEN_KEY = 'didc.portal.updatesSeenAt';

const readSeenAt = (): string => {
  try {
    return window.localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    // Safari private mode throws on access rather than returning null.
    return '';
  }
};

const writeSeenAt = (value: string): void => {
  try {
    window.localStorage.setItem(SEEN_KEY, value);
  } catch {
    /* Nothing to do — "new" badges simply persist. */
  }
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const stamp = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

const UpdatesCard: React.FC<ProfileCardProps> = ({ ctx }) => {
  const { data } = useHousehold(ctx.source);
  const [updates, setUpdates] = useState<PortalUpdate[] | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [seenAt] = useState(readSeenAt);

  const classIds = data?.enrolledClassIds;

  useEffect(() => {
    if (!classIds) return;
    let cancelled = false;

    loadMyUpdates(ctx.source, classIds).then(result => {
      if (cancelled) return;
      setUpdates(result.rows);
      setError(result.error);
      // Mark seen only once they have actually been rendered — and never on a
      // failed load, which would silently clear the NEW badges for updates the
      // parent has not seen.
      if (result.error) return;
      const newest = result.rows[0]?.publishedAt ?? result.rows[0]?.createdAt;
      if (newest) writeSeenAt(newest);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classIds?.join(','), ctx.source.source, attempt]);

  if (error) {
    return (
      <Card>
        <h3 style={{
          ...theme.typography.h3,
          fontFamily: theme.fonts.display,
          color: theme.colors.txt.primary,
          margin: `0 0 ${theme.spacing.md}`,
        }}>
          Updates
        </h3>
        <CardError message={error} onRetry={() => setAttempt(n => n + 1)} />
      </Card>
    );
  }

  if (updates === null) {
    return (
      <Card>
        <div style={{ display: 'flex', justifyContent: 'center', padding: theme.spacing.lg }}>
          <Spinner size={20} color={theme.colors.primary} />
        </div>
      </Card>
    );
  }

  const shown = showAll ? updates : updates.slice(0, 3);

  return (
    <Card>
      <h3 style={{
        ...theme.typography.h3,
        fontFamily: theme.fonts.display,
        color: theme.colors.txt.primary,
        margin: `0 0 ${theme.spacing.md}`,
      }}>
        Updates
      </h3>

      {updates.length === 0 ? (
        <p style={{
          ...theme.typography.bodySmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.tertiary,
          margin: 0,
        }}>
          Nothing new from the studio.
        </p>
      ) : (
        <>
          {shown.map((update, index) => {
            const published = update.publishedAt ?? update.createdAt;
            const isNew = !!seenAt && published > seenAt;
            const open = expanded === update.id;

            return (
              <div
                key={update.id}
                style={{
                  padding: `${theme.spacing.sm} 0`,
                  borderTop: index === 0 ? 'none' : `1px solid ${theme.colors.bdr.primary}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : update.id)}
                  aria-expanded={open}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: theme.spacing.sm,
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ minWidth: 0, flex: 1, overflowWrap: 'anywhere' }}>
                    <span style={{
                      ...theme.typography.bodySmall,
                      fontFamily: theme.fonts.primary,
                      fontWeight: 600,
                      color: theme.colors.txt.primary,
                    }}>
                      {update.title}
                    </span>
                    {update.isPinned && (
                      <span style={{
                        ...theme.typography.captionSmall,
                        fontFamily: theme.fonts.mono,
                        color: theme.colors.txt.tertiary,
                      }}>
                        {'  '}PINNED
                      </span>
                    )}
                    {isNew && (
                      <span style={{
                        ...theme.typography.captionSmall,
                        fontFamily: theme.fonts.mono,
                        color: '#FFFFFF',
                        background: theme.colors.primary,
                        borderRadius: theme.borderRadius.full,
                        padding: '1px 7px',
                        marginLeft: theme.spacing.xs,
                      }}>
                        NEW
                      </span>
                    )}
                  </span>

                  <span style={{
                    ...theme.typography.captionSmall,
                    fontFamily: theme.fonts.mono,
                    color: theme.colors.txt.tertiary,
                    flexShrink: 0,
                  }}>
                    {stamp(published)}
                  </span>
                </button>

                {open && (
                  <p style={{
                    ...theme.typography.bodySmall,
                    fontFamily: theme.fonts.primary,
                    color: theme.colors.txt.secondary,
                    margin: `${theme.spacing.xs} 0 0`,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                  }}>
                    {update.body}
                  </p>
                )}
              </div>
            );
          })}

          {updates.length > 3 && (
            <div style={{ marginTop: theme.spacing.sm }}>
              <Button variant="ghost" size="sm" onClick={() => setShowAll(v => !v)}>
                {showAll ? 'Show fewer' : `Show all ${updates.length}`}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
};

export default UpdatesCard;
