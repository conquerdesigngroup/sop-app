import React, { useState } from 'react';
import { theme } from '../../theme';
import { Badge, Button, SearchInput, Select } from '../ui';
import { useResponsive } from '../../hooks/useResponsive';
import { CLASS_CATEGORY_LABEL, dayName } from '../../lib/portal';
import {
  ClassFacets, ClassFilters, ClassSort, CLASS_SORTS, TIME_BANDS,
  activeFilterCount,
} from '../../lib/portalClasses';
import type { PortalClassCategory } from '../../types';

/**
 * The filters above the class schedule.
 *
 * TWO TIERS, NOT ONE LONG WALL
 *
 * Search, day and category sit in the open because they are what almost every
 * visit uses. Style, age group, teacher, studio, time of day and the dancer's
 * age live behind "More filters", collapsed by default. All eight facets
 * expanded is about 90 chips, which on a phone pushes the actual schedule two
 * screens down — the filters would be the page.
 *
 * The count on the toggle is what makes collapsing safe: a filter you set,
 * then collapsed, then forgot about is the failure mode, and the button says
 * "More filters (2)" until you clear it.
 *
 * Chips are real <button>s with aria-pressed, matching ThemeToggle. Every one
 * of these toggles state rather than navigating, and a styled div announces as
 * nothing.
 */

// ------------------------------------------------------------------ chips

const Chip: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    style={{
      padding: '6px 12px',
      borderRadius: theme.borderRadius.full,
      border: `1px solid ${active ? theme.colors.primary : theme.colors.bdr.primary}`,
      backgroundColor: active ? theme.colors.primary : theme.colors.bg.tertiary,
      // Hardcoded white on the crimson: the mode-aware text tokens flip dark in
      // light mode and vanish against the pink.
      color: active ? '#FFFFFF' : theme.colors.txt.secondary,
      fontFamily: theme.fonts.primary,
      fontSize: '13px',
      fontWeight: 600,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      transition: 'background-color 0.15s ease, border-color 0.15s ease',
    }}
  >
    {label}
  </button>
);

/**
 * One facet: a label and its chips.
 *
 * flexWrap is not optional here. These rows hold a variable number of items —
 * 15 teachers, 15 styles — and a row that cannot wrap overflows its card. See
 * the flex rule in CLAUDE.md.
 */
const ChipRow: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div>
    <div
      style={{
        ...theme.typography.captionSmall,
        fontFamily: theme.fonts.mono,
        color: theme.colors.txt.tertiary,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: '8px',
      }}
    >
      {label}
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>{children}</div>
  </div>
);

// ------------------------------------------------------------------ bar

interface Props {
  filters: ClassFilters;
  onChange: (next: ClassFilters) => void;
  facets: ClassFacets;
  sort: ClassSort;
  onSortChange: (sort: ClassSort) => void;
  /** Shown next to the clear button: "34 of 102 classes". */
  shown: number;
  total: number;
}

const ClassFilterBar: React.FC<Props> = ({
  filters, onChange, facets, sort, onSortChange, shown, total,
}) => {
  const { isMobileOrTablet } = useResponsive();
  const [expanded, setExpanded] = useState(false);

  /** Add or remove one value from a multi-select facet. */
  const toggle = <K extends keyof ClassFilters>(key: K, value: any) => {
    const current = filters[key] as unknown as any[];
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    onChange({ ...filters, [key]: next });
  };

  const active = activeFilterCount(filters);
  const advanced =
    filters.styles.length + filters.ageGroups.length + filters.instructors.length +
    filters.rooms.length + filters.bands.length + (filters.age !== null ? 1 : 0);

  return (
    <div
      style={{
        backgroundColor: theme.colors.bg.secondary,
        border: `2px solid ${theme.colors.bdr.primary}`,
        borderRadius: theme.borderRadius.lg,
        padding: isMobileOrTablet ? '14px' : '18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {/* Search and sort. Wraps rather than shrinking: a select squeezed to
          80px is a select nobody can read the current value of. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <SearchInput
            placeholder="Search classes, teachers, studios…"
            value={filters.search}
            onChange={e => onChange({ ...filters, search: e.target.value })}
            onClear={() => onChange({ ...filters, search: '' })}
            aria-label="Search classes"
          />
        </div>
        <div style={{ flex: '0 1 170px', minWidth: '150px' }}>
          <Select
            aria-label="Sort classes"
            options={CLASS_SORTS.map(s => ({ value: s.value, label: `Sort: ${s.label}` }))}
            value={sort}
            onChange={e => onSortChange(e.target.value as ClassSort)}
          />
        </div>
      </div>

      {facets.categories.length > 1 && (
        <ChipRow label="Program">
          {facets.categories.map(cat => (
            <Chip
              key={cat}
              label={CLASS_CATEGORY_LABEL[cat]}
              active={filters.categories.includes(cat)}
              onClick={() => toggle('categories', cat as PortalClassCategory)}
            />
          ))}
        </ChipRow>
      )}

      <ChipRow label="Day">
        {facets.days.map(day => (
          <Chip
            key={day}
            // The initial three letters, so six of them fit across a 320px
            // phone without wrapping to a third row.
            label={(dayName(day) ?? '').slice(0, 3)}
            active={filters.days.includes(day)}
            onClick={() => toggle('days', day)}
          />
        ))}
      </ChipRow>

      {expanded && (
        <>
          {facets.bands.length > 1 && (
            <ChipRow label="Time of day">
              {TIME_BANDS.filter(b => facets.bands.includes(b.value)).map(b => (
                <Chip
                  key={b.value}
                  label={b.label}
                  active={filters.bands.includes(b.value)}
                  onClick={() => toggle('bands', b.value)}
                />
              ))}
            </ChipRow>
          )}

          {facets.styles.length > 1 && (
            <ChipRow label="Style">
              {facets.styles.map(style => (
                <Chip
                  key={style}
                  label={style}
                  active={filters.styles.includes(style)}
                  onClick={() => toggle('styles', style)}
                />
              ))}
            </ChipRow>
          )}

          {facets.ageGroups.length > 1 && (
            <ChipRow label="Age group">
              {facets.ageGroups.map(group => (
                <Chip
                  key={group}
                  label={group}
                  active={filters.ageGroups.includes(group)}
                  onClick={() => toggle('ageGroups', group)}
                />
              ))}
            </ChipRow>
          )}

          {facets.instructors.length > 1 && (
            <ChipRow label="Teacher">
              {facets.instructors.map(name => (
                <Chip
                  key={name}
                  label={name}
                  active={filters.instructors.includes(name)}
                  onClick={() => toggle('instructors', name)}
                />
              ))}
            </ChipRow>
          )}

          {facets.rooms.length > 1 && (
            <ChipRow label="Studio">
              {facets.rooms.map(room => (
                <Chip
                  key={room}
                  label={room}
                  active={filters.rooms.includes(room)}
                  onClick={() => toggle('rooms', room)}
                />
              ))}
            </ChipRow>
          )}

          {/* The one numeric facet. It reads the class's own age range rather
              than its age-group label, which is the only way "my dancer is 6"
              can tell TNT Combo from Junior Hip Hop — both are labelled by
              name, not by number. */}
          <ChipRow label="Dancer’s age">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              <input
                type="number"
                min={2}
                max={18}
                inputMode="numeric"
                placeholder="Any"
                aria-label="Dancer’s age in years"
                value={filters.age === null ? '' : String(filters.age)}
                onChange={e => {
                  const raw = e.target.value.trim();
                  const n = Number(raw);
                  onChange({
                    ...filters,
                    age: raw === '' || Number.isNaN(n) ? null : n,
                  });
                }}
                style={{
                  width: '84px',
                  padding: '8px 10px',
                  borderRadius: theme.borderRadius.md,
                  border: `1px solid ${theme.colors.bdr.primary}`,
                  backgroundColor: theme.colors.bg.tertiary,
                  color: theme.colors.txt.primary,
                  fontFamily: theme.fonts.primary,
                  fontSize: '14px',
                }}
              />
              <span
                style={{
                  ...theme.typography.captionSmall,
                  fontFamily: theme.fonts.primary,
                  color: theme.colors.txt.tertiary,
                }}
              >
                shows only classes they are old enough for
              </span>
            </div>
          </ChipRow>
        </>
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: `1px solid ${theme.colors.bdr.primary}`,
          paddingTop: '14px',
        }}
      >
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
          >
            {expanded ? 'Fewer filters' : 'More filters'}
          </Button>
          {/* Only when collapsed: an advanced filter you cannot see is the one
              that makes the list look wrong for no reason. */}
          {!expanded && advanced > 0 && <Badge variant="primary" size="sm">{advanced}</Badge>}
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span
            style={{
              ...theme.typography.captionSmall,
              fontFamily: theme.fonts.mono,
              color: theme.colors.txt.tertiary,
            }}
          >
            {shown === total ? `${total} classes` : `${shown} of ${total}`}
          </span>
          {active > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onChange({
                search: '', categories: [], days: [], styles: [], ageGroups: [],
                instructors: [], rooms: [], bands: [], age: null,
              })}
            >
              Clear ({active})
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClassFilterBar;
