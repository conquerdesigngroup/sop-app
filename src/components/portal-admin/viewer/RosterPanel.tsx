import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { theme } from '../../../theme';
import { Badge, Button, Card, ChevronLeftIcon, SearchInput } from '../../ui';
import { ManagerList } from '../shared';
import { formatClassSchedule } from '../../../lib/portal';
import {
  ViewerClass,
  ViewerRosterRow,
  ageFrom,
  loadClassRoster,
} from '../../../lib/portalViewer';
import { CategoryChips, ChipRow, ResultCount, RowSub, RowTitle, ViewerRow } from './ViewerShared';

/**
 * Who is actually in one class.
 *
 * The register the studio already has lives in Enrolio; this one exists because
 * it is joined to the portal side — every name here is a link back to the
 * family whose login it belongs to, which is the question staff have when a
 * parent says "I can't see my daughter's class".
 *
 * Dropped enrollments are shown, not hidden. A roster that silently omits them
 * cannot explain why a child appears in the attendance history and not in the
 * list, and that gap is exactly what somebody would come here to check.
 */

const RosterPanel: React.FC<{
  klass: ViewerClass;
  onBack: () => void;
  onOpenHousehold: (id: string) => void;
  today: Date;
}> = ({ klass, onBack, onOpenHousehold, today }) => {
  const [rows, setRows] = useState<ViewerRosterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const result = await loadClassRoster(klass.id);
    setRows(result.rows);
    setError(result.error);
    setLoading(false);
  }, [klass.id]);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.studentName.toLowerCase().indexOf(q) !== -1 ||
      r.householdName.toLowerCase().indexOf(q) !== -1 ||
      r.householdEmail.toLowerCase().indexOf(q) !== -1);
  }, [rows, query]);

  const active = rows.filter(r => r.status === 'active').length;
  const when = formatClassSchedule(klass.dayOfWeek, klass.startTime, klass.endTime);

  return (
    <>
      <Button variant="ghost" size="sm" leftIcon={<ChevronLeftIcon size={16} />} onClick={onBack}>
        All classes
      </Button>

      <Card style={{ marginTop: theme.spacing.sm }}>
        <h2 style={{
          ...theme.typography.h3,
          fontFamily: theme.fonts.display,
          color: theme.colors.txt.primary,
          margin: 0,
          overflowWrap: 'anywhere',
        }}>
          {klass.name}
        </h2>
        {when && (
          <p style={{
            ...theme.typography.bodySmall,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.secondary,
            margin: `${theme.spacing.xs} 0 0`,
          }}>
            {when}{klass.location ? ` · ${klass.location}` : ''}
          </p>
        )}
        <ChipRow>
          <Badge variant="primary" size="sm">
            {active === 1 ? '1 enrolled' : `${active} enrolled`}
          </Badge>
          <CategoryChips categories={klass.category ? [klass.category] : []} />
          {klass.level && <Badge variant="default" size="sm">{klass.level}</Badge>}
          {klass.instructorName && <Badge variant="default" size="sm">{klass.instructorName}</Badge>}
        </ChipRow>
        {/* The Enrolio title is the join key for every attendance import, so it
            is worth being able to read it here when a file will not match. */}
        {klass.externalClassId && (
          <p style={{
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.mono,
            color: theme.colors.txt.tertiary,
            margin: `${theme.spacing.sm} 0 0`,
            overflowWrap: 'anywhere',
          }}>
            Enrolio title: {klass.externalClassId}
          </p>
        )}
      </Card>

      <div style={{ margin: `${theme.spacing.lg} 0 ${theme.spacing.sm}` }}>
        <SearchInput
          placeholder="Search this roster…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onClear={() => setQuery('')}
        />
      </div>
      <ResultCount shown={shown.length} total={rows.length} noun="on the roster" />

      <ManagerList
        loading={loading}
        error={error}
        isEmpty={shown.length === 0}
        emptyTitle={query ? 'Nobody on this roster matches' : 'Nobody is enrolled in this class'}
      >
        {shown.map(r => {
          const age = ageFrom(r.dateOfBirth, today);
          return (
            <ViewerRow
              key={r.enrollmentId}
              label={`Open the household of ${r.studentName}`}
              onClick={() => onOpenHousehold(r.householdId)}
            >
              <RowTitle>
                {r.studentName}
                {age !== null && (
                  <span style={{ color: theme.colors.txt.tertiary, fontWeight: 400 }}> · {age}</span>
                )}
              </RowTitle>
              <RowSub>{r.householdName}</RowSub>
              {r.householdName !== r.householdEmail && <RowSub mono>{r.householdEmail}</RowSub>}
              {r.status !== 'active' && (
                <ChipRow><Badge variant="warning" size="sm">{r.status}</Badge></ChipRow>
              )}
            </ViewerRow>
          );
        })}
      </ManagerList>
    </>
  );
};

export default RosterPanel;
