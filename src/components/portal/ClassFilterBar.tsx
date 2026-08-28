import React, { useState } from 'react';
import { theme } from '../../theme';
import { Badge, Button, SearchInput, Select } from '../ui';
import { FacetGroups } from './classFilterControls';
import {
  ClassFacets, ClassFilters, ClassSort, CLASS_SORTS, EMPTY_FILTERS,
  activeFilterCount,
} from '../../lib/portalClasses';

/**
 * The filters above the class schedule, on a desktop.
 *
 * The phone does not use this — it has a day strip and a bottom sheet, because
 * this bar reflowed to 390px pushed the first class 697 pixels down the page.
 * See ClassMobileSchedule. Both surfaces render the SAME facet controls from
 * classFilterControls.tsx, so a ninth filter appears in both or neither.
 *
 * TWO TIERS, NOT ONE LONG WALL
 *
 * Search, day and program sit in the open because that is what almost every
 * visit uses. The rest live behind "More filters", collapsed by default: all
 * eight expanded is about ninety chips, which is more bar than schedule.
 *
 * The count on the toggle is what makes collapsing safe. A filter you set, then
 * collapsed, then forgot about is the failure mode, and the badge stays lit
 * until you clear it.
 */

interface Props {
  filters: ClassFilters;
  onChange: (next: ClassFilters) => void;
  facets: ClassFacets;
  sort: ClassSort;
  onSortChange: (sort: ClassSort) => void;
  /** Shown next to the clear button: "34 of 102". */
  shown: number;
  total: number;
}

const ClassFilterBar: React.FC<Props> = ({
  filters, onChange, facets, sort, onSortChange, shown, total,
}) => {
  const [expanded, setExpanded] = useState(false);

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
        padding: '18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {/* Wraps rather than shrinking: a select squeezed to 80px is a select
          nobody can read the current value of. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <SearchInput
            placeholder="Search classes, teachers, studios…"
            value={filters.search}
            onChange={e => onChange({ ...filters, search: e.target.value })}
            onClear={() => onChange({ ...filters, search: '' })}
            aria-label="Search classes"
          />
        </div>
        <div style={{ flex: '0 1 190px', minWidth: '170px' }}>
          <Select
            aria-label="Sort classes"
            options={CLASS_SORTS.map(s => ({ value: s.value, label: `Sort: ${s.label}` }))}
            value={sort}
            onChange={e => onSortChange(e.target.value as ClassSort)}
          />
        </div>
      </div>

      <FacetGroups
        filters={filters}
        onChange={onChange}
        facets={facets}
        show={expanded
          ? ['categories', 'days', 'bands', 'styles', 'ageGroups', 'instructors', 'rooms', 'age']
          : ['categories', 'days']}
      />

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
            <Button variant="outline" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
              Clear ({active})
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClassFilterBar;
