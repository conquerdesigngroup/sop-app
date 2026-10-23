import React, { useCallback, useEffect, useState } from 'react';
import { theme } from '../../theme';
import { Card, Spinner } from '../ui';
import { useRefreshable } from '../../contexts/RefreshContext';
import {
  FamilyGroup,
  LoadError,
  SHOW_MOVE_UP_TO_FAMILIES,
  groupFamilyEvaluations,
  loadFamilyEvaluations,
  snapshotOfFamily,
} from '../../lib/evaluations';
import SnapshotCard from '../evaluations/SnapshotCard';
import CardError from './CardError';
import { ProfileCardProps } from '../../lib/profileCards';

/**
 * The family's Evaluations tab: what each teacher said about each dancer,
 * once it was submitted.
 *
 * READS THROUGH family_evaluations() (v71), NOT THE TABLE. The policy already
 * limits the table to submitted rows for the caller's own dancers, but the
 * class NAME would come from portal_classes under the family's class policy,
 * which drops inactive and all-stars classes — so a kept record could lose its
 * name. The function attaches the name under the same visibility rule.
 *
 * SHOWS NOTHING FOR THE FIXTURE. The demo scenarios have no evaluations and
 * this card has no fixture of its own, so a development build reads the calm
 * empty state, which is also what a real family with nothing submitted sees.
 *
 * GROUPED dancer → season → round, newest first, because a parent asks "how is
 * Maya doing" before "what happened in the fall".
 */
const Title: React.FC = () => (
  <h3 style={{
    ...theme.typography.h3,
    fontFamily: theme.fonts.display,
    color: theme.colors.txt.primary,
    margin: `0 0 ${theme.spacing.md}`,
  }}>
    Evaluations
  </h3>
);

const EvaluationsCard: React.FC<ProfileCardProps> = ({ ctx }) => {
  const [groups, setGroups] = useState<FamilyGroup[] | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const [attempt, setAttempt] = useState(0);
  const live = ctx.source.source === 'live';

  const load = useCallback(async () => {
    if (!live) {
      setGroups([]);
      return;
    }
    const { rows, error: err } = await loadFamilyEvaluations();
    setError(err);
    setGroups(groupFamilyEvaluations(rows));
    if (err) throw new Error(err);
  }, [live]);

  useEffect(() => { load().catch(() => {}); }, [load, attempt]);
  useRefreshable(load, live);

  if (error) {
    return (
      <Card>
        <Title />
        <CardError message={error} onRetry={() => setAttempt(n => n + 1)} />
      </Card>
    );
  }

  if (groups === null) {
    return (
      <Card>
        <div style={{ display: 'flex', justifyContent: 'center', padding: theme.spacing.lg }}>
          <Spinner size={20} color={theme.colors.primary} />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <Title />
      {groups.length === 0 ? (
        <p style={{
          ...theme.typography.bodySmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.tertiary,
          margin: 0,
          maxWidth: '46ch',
        }}>
          Nothing here yet. Teachers write an evaluation for each dancer a couple of times a season, and it appears here once it is submitted.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.lg }}>
          {groups.map(g => (
            <div key={g.studentId}>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: theme.colors.txt.primary, marginBottom: theme.spacing.sm, overflowWrap: 'anywhere' }}>
                {g.name}
              </div>
              {g.seasons.map(season => (
                <div key={season.season} style={{ marginBottom: theme.spacing.sm }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: theme.colors.txt.tertiary, marginBottom: theme.spacing.xs }}>
                    {season.season}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
                    {season.rounds.map(r => (
                      <div key={r.id} style={{ border: `1px solid ${theme.colors.bdr.primary}`, borderRadius: theme.borderRadius.md, padding: theme.spacing.sm }}>
                        <SnapshotCard snapshot={snapshotOfFamily(r)} showName={false} showMoveUp={SHOW_MOVE_UP_TO_FAMILIES} compact />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export default EvaluationsCard;
