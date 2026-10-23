import React, { useCallback, useEffect, useRef, useState } from 'react';
import { theme } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useRefreshable } from '../contexts/RefreshContext';
import { useResponsive } from '../hooks/useResponsive';
import { PageHeader, Card, Button, Spinner, EmptyState } from '../components/ui';
import { Scope } from '../lib/attendanceStaff';
import {
  ClassProgress,
  EvaluationClass,
  EvaluationSettings,
  loadClassProgress,
  loadEvaluationClasses,
  loadEvaluationSettings,
  lockReason,
  progressText,
} from '../lib/evaluations';
import ClassSheet from '../components/evaluations/ClassSheet';
import SettingsCard from '../components/evaluations/SettingsCard';
import LookupTab from '../components/evaluations/LookupTab';

/**
 * Evaluations — the staff side.
 *
 * A teacher opens on THEIR classes for the open round, with "N of M submitted"
 * on each, taps a class for its roster and a dancer for the form. That is the
 * whole screen for a teacher. The switch and the round name are read first and
 * shown as a lock before any form, so nobody types fifteen comments into a
 * round that is closed.
 *
 * An admin gets two more tabs, gated the way AttendancePage gates Records:
 * Lookup & export, and Settings (the switch). The gate is a courtesy, not the
 * control — the functions refuse a non-admin regardless.
 *
 * Copied from the attendance screen's shape on purpose (EVALUATIONS-BUILD.md),
 * including the 'mine' / 'all' scope toggle for an admin who also teaches.
 */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const meeting = (c: EvaluationClass): string => {
  const day = c.dayOfWeek !== null && c.dayOfWeek >= 0 && c.dayOfWeek <= 6 ? DAYS[c.dayOfWeek] : null;
  const time = c.startTime ? c.startTime.slice(0, 5) : null;
  return [day, time, c.instructorName].filter(Boolean).join(' · ');
};

type Tab = 'evaluate' | 'lookup' | 'settings';

const EvaluationsPage: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();
  const { isMobileOrTablet } = useResponsive();
  const profileId = currentUser?.id ?? '';

  const [settings, setSettings] = useState<EvaluationSettings | null>(null);
  const [classes, setClasses] = useState<EvaluationClass[]>([]);
  const [progress, setProgress] = useState<Map<string, ClassProgress>>(new Map());
  const [myCount, setMyCount] = useState(0);
  const [scope, setScope] = useState<Scope>('mine');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openClassId, setOpenClassId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('evaluate');
  // Scope flips fire a read each; only the latest may land (CLAUDE.md).
  const seq = useRef(0);

  const load = useCallback(async (silent = false) => {
    if (!profileId) return;
    const mine = ++seq.current;
    if (!silent) setLoading(true);

    const [{ settings: s, error: sErr }, { classes: list, myCount: held, error: cErr }] = await Promise.all([
      loadEvaluationSettings(),
      loadEvaluationClasses(profileId, isAdmin, scope),
    ]);
    const round = s?.round ?? '';
    const { progress: p } = await loadClassProgress(list, round);
    if (mine !== seq.current) return;

    setSettings(s);
    setClasses(list);
    setMyCount(held);
    setProgress(p);

    const err = sErr || cErr;
    setError(err);
    setLoading(false);
    if (err) throw new Error(err);
  }, [profileId, isAdmin, scope]);

  useEffect(() => { load().catch(() => {}); }, [load]);
  const reload = useCallback(() => load(true), [load]);
  useRefreshable(reload, Boolean(profileId));

  const lock = lockReason(settings, isAdmin);
  const canSave = Boolean(settings && settings.round.trim() && (settings.enabled || isAdmin));
  const open = classes.find(c => c.id === openClassId) ?? null;

  const subtitle = !isAdmin || myCount === 0
    ? (isAdmin ? 'Every class in the studio' : 'Your classes')
    : scope === 'mine' ? `Your ${myCount} classes` : 'Every class in the studio';

  return (
    <div style={{ padding: isMobileOrTablet ? theme.spacing.md : '40px', maxWidth: 1000, margin: '0 auto' }}>
      <PageHeader
        title="Evaluations"
        subtitle={settings?.round ? `${settings.round} · ${subtitle}` : subtitle}
      />

      {isAdmin && !open && (
        <div role="tablist" aria-label="Evaluation views" style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs, marginBottom: theme.spacing.md }}>
          {([['evaluate', 'Evaluate'], ['lookup', 'Lookup & export'], ['settings', 'Settings']] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              style={{
                minHeight: 44,
                padding: `0 ${theme.spacing.md}`,
                borderRadius: theme.borderRadius.full,
                border: `2px solid ${tab === key ? theme.colors.primary : theme.colors.bdr.primary}`,
                background: tab === key ? theme.colors.primary : 'transparent',
                color: tab === key ? '#FFFFFF' : theme.colors.txt.secondary,
                fontFamily: theme.fonts.primary,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {open ? (
        <ClassSheet
          klass={open}
          round={settings?.round ?? ''}
          canSave={canSave}
          onBack={() => { setOpenClassId(null); load(true).catch(() => {}); }}
        />
      ) : isAdmin && tab === 'settings' ? (
        loading || !settings ? (
          <div style={{ padding: theme.spacing.xl, textAlign: 'center' }}><Spinner /></div>
        ) : (
          <SettingsCard settings={settings} onChange={next => { setSettings(next); load(true).catch(() => {}); }} />
        )
      ) : isAdmin && tab === 'lookup' ? (
        loading || !settings ? (
          <div style={{ padding: theme.spacing.xl, textAlign: 'center' }}><Spinner /></div>
        ) : (
          <LookupTab settings={settings} />
        )
      ) : (
        <>
          {isAdmin && myCount > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs, marginBottom: theme.spacing.md }}>
              {(['mine', 'all'] as const).map(key => (
                <Button key={key} variant={scope === key ? 'primary' : 'secondary'} size="sm" onClick={() => setScope(key)}>
                  {key === 'mine' ? `My classes (${myCount})` : 'All classes'}
                </Button>
              ))}
            </div>
          )}

          {lock && (
            <Card padding="md" style={{ borderColor: theme.colors.status.warning, marginBottom: theme.spacing.md }}>
              <div role="status" style={{ fontWeight: 700, color: theme.colors.txt.primary }}>
                {settings && !settings.round.trim() ? 'No round is open' : 'Evaluations are closed'}
              </div>
              <div style={{ fontSize: '0.85rem', color: theme.colors.txt.secondary, marginTop: 4 }}>{lock}</div>
              {isAdmin && (
                <div style={{ marginTop: theme.spacing.sm }}>
                  <Button variant="secondary" size="sm" onClick={() => setTab('settings')}>Open settings</Button>
                </div>
              )}
            </Card>
          )}

          {loading ? (
            <div style={{ padding: theme.spacing.xl, textAlign: 'center' }}><Spinner /></div>
          ) : error ? (
            <Card>
              <div role="alert" style={{ color: theme.colors.txt.primary }}>
                {error}
                <div style={{ marginTop: theme.spacing.md }}>
                  <Button variant="secondary" onClick={() => { load().catch(() => {}); }}>Try again</Button>
                </div>
              </div>
            </Card>
          ) : classes.length === 0 ? (
            <EmptyState
              title="No classes to evaluate"
              description={isAdmin
                ? 'There are no active classes.'
                : 'You do not hold any classes. If that looks wrong, the office assigns classes in Portal Manager.'}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
              {classes.map(c => {
                const p = progress.get(c.id) ?? { total: 0, submitted: 0, draft: 0 };
                const done = p.total > 0 && p.submitted >= p.total;
                const hasRound = Boolean(settings?.round.trim());
                return (
                  <Card key={c.id} hover={hasRound} onClick={hasRound ? () => setOpenClassId(c.id) : undefined} padding="md">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: theme.colors.txt.primary, overflowWrap: 'anywhere' }}>{c.name}</div>
                        <div style={{ fontSize: '0.8rem', color: theme.colors.txt.tertiary, overflowWrap: 'anywhere' }}>
                          {meeting(c) || c.season || ''}
                        </div>
                        {p.draft > 0 && (
                          <div style={{ fontSize: '0.78rem', color: theme.colors.status.warning, marginTop: 4 }}>
                            {p.draft} {p.draft === 1 ? 'draft' : 'drafts'} not yet submitted
                          </div>
                        )}
                      </div>
                      {hasRound && (
                        <span style={{
                          padding: `6px ${theme.spacing.sm}`,
                          borderRadius: theme.borderRadius.full,
                          whiteSpace: 'nowrap',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          background: p.total === 0 ? theme.colors.bg.tertiary : done ? theme.colors.status.success : theme.colors.status.warning,
                          color: p.total === 0 ? theme.colors.txt.tertiary : '#FFFFFF',
                        }}>
                          {p.total === 0 ? 'No roster' : done ? 'Done' : progressText(p.submitted, p.total)}
                        </span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EvaluationsPage;
