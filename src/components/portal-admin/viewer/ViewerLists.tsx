import React, { useMemo } from 'react';
import { theme } from '../../../theme';
import { Badge, Button, SearchInput } from '../../ui';
import { ManagerList } from '../shared';
import { CLASS_CATEGORY_LABEL, CLASS_CATEGORY_ORDER, dayName, formatClassSchedule } from '../../../lib/portal';
import { PortalClassCategory } from '../../../types';
import {
  NO_DIVISION,
  ViewerClass,
  ViewerFilters,
  ViewerHousehold,
  ViewerStudent,
  accessLabel,
  ageFrom,
  classPasses,
  filtersAreEmpty,
  householdPasses,
  studentFullName,
  studentPasses,
  toggleDivision,
} from '../../../lib/portalViewer';
import FilterChips from './FilterChips';
import { CategoryChips, ChipRow, ResultCount, RowSub, RowTitle, ViewerRow } from './ViewerShared';

/**
 * The three lists: families, dancers, classes.
 *
 * All three are the same screen — search box, filters, count, rows — because
 * they answer the same question from three directions. The front desk knows one
 * of the parent's email, the child's name, or the class. Whichever they have
 * should reach the same place in one search.
 *
 * Filtering is local. Every list is fetched whole (343 / 388 / 103 rows) and
 * searched in memory, so typing is instant and costs no requests.
 *
 * THE QUERY AND THE FILTERS ARE OWNED BY THE PAGE, NOT BY THESE COMPONENTS
 *
 * Opening a family REPLACES the list rather than sitting under it, so a list
 * holding its own state was unmounted on every drill-down and came back empty.
 * Narrowing 343 families to the four All-Stars ones and having that thrown away
 * by looking at one of them is the exact friction filtering exists to remove.
 */

const DIVISION_OPTIONS = CLASS_CATEGORY_ORDER
  .map(c => ({ value: c as string, label: CLASS_CATEGORY_LABEL[c as PortalClassCategory] }))
  // 72 households and 70 dancers have no active enrollment. Without this chip
  // they are unreachable by any division filter, and they are a group worth
  // finding on purpose.
  .concat([{ value: NO_DIVISION, label: 'Not enrolled' }]);

const DAY_OPTIONS = [0, 1, 2, 3, 4, 5, 6].map(d => ({
  value: String(d),
  label: (dayName(d) ?? '').slice(0, 3),
}));

/** Shared header: search box, filter rows, a way out, and the count. */
const ListHeader: React.FC<{
  placeholder: string;
  query: string;
  setQuery: (v: string) => void;
  filters: ViewerFilters;
  setFilters: (f: ViewerFilters) => void;
  children?: React.ReactNode;
  shown: number;
  total: number;
  noun: string;
}> = ({ placeholder, query, setQuery, filters, setFilters, children, shown, total, noun }) => (
  <>
    <div style={{ marginBottom: theme.spacing.sm }}>
      <SearchInput
        placeholder={placeholder}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onClear={() => setQuery('')}
      />
    </div>

    <FilterChips
      label="Division"
      multi
      options={DIVISION_OPTIONS}
      selected={filters.divisions}
      onToggle={v => setFilters({ ...filters, divisions: toggleDivision(filters.divisions, v) })}
    />

    {children}

    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.sm,
    }}>
      <ResultCount shown={shown} total={total} noun={noun} />
      {/* Only offered when there is something to clear. A permanently visible
          "Clear" is a button that does nothing most of the time. */}
      {(!filtersAreEmpty(filters) || query !== '') && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setQuery(''); setFilters({ divisions: [], access: 'any', activity: 'any', dayOfWeek: null }); }}
        >
          Clear
        </Button>
      )}
    </div>
  </>
);

/**
 * Single-select chips clear themselves when the active one is tapped again.
 * Without that, the only way out of a one-choice filter is a separate "Any"
 * chip on every row, and four of those cost more space on a phone than they buy.
 */
const single = <T extends string>(current: T, value: T, none: T): T =>
  current === value ? none : value;

// ------------------------------------------------------------------ families

export const HouseholdList: React.FC<{
  households: ViewerHousehold[];
  loading: boolean;
  error: string | null;
  onOpen: (id: string) => void;
  query: string;
  setQuery: (value: string) => void;
  filters: ViewerFilters;
  setFilters: (f: ViewerFilters) => void;
}> = ({ households, loading, error, onOpen, query, setQuery, filters, setFilters }) => {
  const shown = useMemo(
    () => households.filter(h => householdPasses(h, query, filters)),
    [households, query, filters],
  );

  return (
    <>
      <ListHeader
        placeholder="Search a family by name or email…"
        query={query} setQuery={setQuery}
        filters={filters} setFilters={setFilters}
        shown={shown.length} total={households.length} noun="families"
      >
        {/* The filter the beta actually needs: who still has to sign up. */}
        <FilterChips
          label="Access"
          options={[
            { value: 'signed-up', label: 'Signed up' },
            { value: 'not-signed-up', label: 'Not signed up' },
          ]}
          selected={filters.access === 'any' ? [] : [filters.access]}
          onToggle={v => setFilters({ ...filters, access: single(filters.access, v as any, 'any') })}
        />
      </ListHeader>

      <ManagerList
        loading={loading}
        error={error}
        isEmpty={shown.length === 0}
        emptyTitle={query || !filtersAreEmpty(filters) ? 'Nothing matches that' : 'No families imported yet'}
        emptyDescription={
          query || !filtersAreEmpty(filters)
            ? 'Try the email instead — Enrolio spells some surnames two ways — or clear a filter.'
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
  filters: ViewerFilters;
  setFilters: (f: ViewerFilters) => void;
}> = ({ students, loading, error, today, onOpenHousehold, query, setQuery, filters, setFilters }) => {
  const shown = useMemo(
    () => students.filter(s => studentPasses(s, query, filters)),
    [students, query, filters],
  );

  return (
    <>
      <ListHeader
        placeholder="Search a dancer by name, or their parent…"
        query={query} setQuery={setQuery}
        filters={filters} setFilters={setFilters}
        shown={shown.length} total={students.length} noun="dancers"
      >
        <FilterChips
          label="Status"
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Withdrawn' },
          ]}
          selected={filters.activity === 'any' ? [] : [filters.activity]}
          onToggle={v => setFilters({ ...filters, activity: single(filters.activity, v as any, 'any') })}
        />
      </ListHeader>

      <ManagerList
        loading={loading}
        error={error}
        isEmpty={shown.length === 0}
        emptyTitle={query || !filtersAreEmpty(filters) ? 'Nothing matches that' : 'No dancers imported yet'}
        emptyDescription={query || !filtersAreEmpty(filters) ? 'Try their parent’s email, or clear a filter.' : undefined}
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
                <CategoryChips categories={s.categories} />
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
  filters: ViewerFilters;
  setFilters: (f: ViewerFilters) => void;
}> = ({ classes, loading, error, onOpen, query, setQuery, filters, setFilters }) => {
  const shown = useMemo(
    () => classes.filter(c => classPasses(c, query, filters)),
    [classes, query, filters],
  );

  return (
    <>
      <ListHeader
        placeholder="Search a class, category or instructor…"
        query={query} setQuery={setQuery}
        filters={filters} setFilters={setFilters}
        shown={shown.length} total={classes.length} noun="classes"
      >
        <FilterChips
          label="Day"
          options={DAY_OPTIONS}
          selected={filters.dayOfWeek === null ? [] : [String(filters.dayOfWeek)]}
          onToggle={v => setFilters({
            ...filters,
            dayOfWeek: filters.dayOfWeek === Number(v) ? null : Number(v),
          })}
        />
      </ListHeader>

      <ManagerList
        loading={loading}
        error={error}
        isEmpty={shown.length === 0}
        emptyTitle={query || !filtersAreEmpty(filters) ? 'No class matches that' : 'No classes yet'}
        emptyDescription={query || !filtersAreEmpty(filters) ? 'Clear a filter to widen the search.' : undefined}
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
                <CategoryChips categories={c.category ? [c.category] : []} />
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
