import React, { useMemo } from 'react';
import { theme } from '../../../theme';
import { Badge, SearchInput } from '../../ui';
import { ManagerList } from '../shared';
import { formatClassSchedule } from '../../../lib/portal';
import {
  ViewerClass,
  ViewerHousehold,
  ViewerStudent,
  ageFrom,
  accessLabel,
  classMatches,
  householdMatches,
  studentFullName,
  studentMatches,
} from '../../../lib/portalViewer';
import { CategoryChips, ChipRow, ResultCount, RowSub, RowTitle, ViewerRow } from './ViewerShared';

/**
 * The three lists: families, dancers, classes.
 *
 * All three are the same screen — search box, count, rows — because they answer
 * the same question from three directions. The front desk knows one of: the
 * parent's email, the child's name, or the class. Whichever they have should
 * reach the same place in one search.
 *
 * Filtering is local. Every list is fetched whole (343 / 388 / 103 rows) and
 * searched in memory, so typing is instant and costs no requests.
 *
 * THE QUERY IS OWNED BY THE PAGE, NOT BY THESE COMPONENTS
 *
 * Opening a family REPLACES the list rather than sitting under it, so a list
 * holding its own search state was unmounted on every drill-down and came back
 * empty. Typing "Kettenbrink" again after each family is the exact friction
 * local search existed to remove, so the page holds the query and hands it
 * down.
 */

// ------------------------------------------------------------------ families

export const HouseholdList: React.FC<{
  households: ViewerHousehold[];
  loading: boolean;
  error: string | null;
  onOpen: (id: string) => void;
  query: string;
  setQuery: (value: string) => void;
}> = ({ households, loading, error, onOpen, query, setQuery }) => {

  const shown = useMemo(
    () => households.filter(h => householdMatches(h, query)),
    [households, query],
  );

  return (
    <>
      <div style={{ marginBottom: theme.spacing.sm }}>
        <SearchInput
          placeholder="Search a family by name or email…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onClear={() => setQuery('')}
        />
      </div>
      <ResultCount shown={shown.length} total={households.length} noun="families" />

      <ManagerList
        loading={loading}
        error={error}
        isEmpty={shown.length === 0}
        emptyTitle={query ? 'No family matches that' : 'No families imported yet'}
        emptyDescription={
          query
            ? 'Try the email instead — Enrolio spells some surnames two ways.'
            : 'Families arrive with the Enrolio import.'
        }
      >
        {shown.map(h => {
          const access = accessLabel(h);
          return (
            <ViewerRow key={h.id} label={`Open ${h.name}`} onClick={() => onOpen(h.id)}>
              <RowTitle>{h.name}</RowTitle>
              {/* Enrolio does not always carry a contact name, and the mapper
                  falls back to the email — so printing the email underneath as
                  well renders the same long address twice on one row. */}
              {h.name !== h.email && <RowSub mono>{h.email}</RowSub>}
              <ChipRow>
                <Badge variant={access.ok ? 'success' : 'default'} size="sm">{access.text}</Badge>
                <Badge variant="default" size="sm">
                  {h.studentCount === 1 ? '1 dancer' : `${h.studentCount} dancers`}
                </Badge>
                <CategoryChips categories={h.categories} />
                {h.status !== 'active' && <Badge variant="warning" size="sm">Inactive</Badge>}
              </ChipRow>
            </ViewerRow>
          );
        })}
      </ManagerList>
    </>
  );
};

// ------------------------------------------------------------------- dancers

export const StudentList: React.FC<{
  students: ViewerStudent[];
  loading: boolean;
  error: string | null;
  today: Date;
  onOpenHousehold: (id: string) => void;
  query: string;
  setQuery: (value: string) => void;
}> = ({ students, loading, error, today, onOpenHousehold, query, setQuery }) => {

  const shown = useMemo(
    () => students.filter(s => studentMatches(s, query)),
    [students, query],
  );

  return (
    <>
      <div style={{ marginBottom: theme.spacing.sm }}>
        <SearchInput
          placeholder="Search a dancer by name, or their parent…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onClear={() => setQuery('')}
        />
      </div>
      <ResultCount shown={shown.length} total={students.length} noun="dancers" />

      <ManagerList
        loading={loading}
        error={error}
        isEmpty={shown.length === 0}
        emptyTitle={query ? 'No dancer matches that' : 'No dancers imported yet'}
      >
        {shown.map(s => {
          const age = ageFrom(s.dateOfBirth, today);
          return (
            <ViewerRow
              key={s.id}
              label={`Open the household of ${studentFullName(s)}`}
              onClick={() => onOpenHousehold(s.householdId)}
            >
              <RowTitle>
                {studentFullName(s)}
                {/* The age is the point of storing a date of birth: it is what
                    tells two children with the same name apart. */}
                {age !== null && (
                  <span style={{ color: theme.colors.txt.tertiary, fontWeight: 400 }}> · {age}</span>
                )}
              </RowTitle>
              <RowSub>{s.householdName}</RowSub>
              {s.householdName !== s.householdEmail && <RowSub mono>{s.householdEmail}</RowSub>}
              <ChipRow>
                <Badge variant="default" size="sm">
                  {s.enrollmentCount === 1 ? '1 class' : `${s.enrollmentCount} classes`}
                </Badge>
                {s.status !== 'active' && <Badge variant="warning" size="sm">Inactive</Badge>}
              </ChipRow>
            </ViewerRow>
          );
        })}
      </ManagerList>
    </>
  );
};

// ------------------------------------------------------------------- classes

export const ClassList: React.FC<{
  classes: ViewerClass[];
  loading: boolean;
  error: string | null;
  onOpen: (id: string) => void;
  query: string;
  setQuery: (value: string) => void;
}> = ({ classes, loading, error, onOpen, query, setQuery }) => {

  const shown = useMemo(
    () => classes.filter(c => classMatches(c, query)),
    [classes, query],
  );

  return (
    <>
      <div style={{ marginBottom: theme.spacing.sm }}>
        <SearchInput
          placeholder="Search a class, category or instructor…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onClear={() => setQuery('')}
        />
      </div>
      <ResultCount shown={shown.length} total={classes.length} noun="classes" />

      <ManagerList
        loading={loading}
        error={error}
        isEmpty={shown.length === 0}
        emptyTitle={query ? 'No class matches that' : 'No classes yet'}
      >
        {shown.map(c => {
          const when = formatClassSchedule(c.dayOfWeek, c.startTime, c.endTime);
          return (
            <ViewerRow key={c.id} label={`Open the roster for ${c.name}`} onClick={() => onOpen(c.id)}>
              <RowTitle>{c.name}</RowTitle>
              {when && <RowSub>{when}</RowSub>}
              <ChipRow>
                <Badge variant="primary" size="sm">
                  {c.activeEnrollments === 1 ? '1 dancer' : `${c.activeEnrollments} dancers`}
                </Badge>
                {c.category && <Badge variant="info" size="sm">{c.category}</Badge>}
                {c.instructorName && <Badge variant="default" size="sm">{c.instructorName}</Badge>}
                {!c.isActive && <Badge variant="warning" size="sm">Hidden</Badge>}
              </ChipRow>
            </ViewerRow>
          );
        })}
      </ManagerList>
    </>
  );
};
