import React from 'react';
import { theme } from '../../theme';
import { CLASS_CATEGORY_LABEL, dayName } from '../../lib/portal';
import { ClassFacets, ClassFilters, TIME_BANDS } from '../../lib/portalClasses';
import type { PortalClassCategory } from '../../types';

/**
 * The facet controls, shared by the desktop filter bar and the mobile sheet.
 *
 * One definition on purpose. These started as a single component and the
 * mobile sheet was going to get its own copy of eight chip rows — which is
 * exactly how the two surfaces end up offering different filters after
 * somebody adds a ninth to one of them.
 *
 * The two surfaces differ only in which facets they ask for. Mobile omits
 * `days`, because the day strip owns that and having it in two places means
 * two things can disagree about what day you are looking at.
 */

export type Facet =
  | 'categories' | 'days' | 'bands' | 'styles'
  | 'ageGroups' | 'instructors' | 'rooms' | 'age';

export const Chip: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    style={{
      // 34px tall rather than the 44px a touch target normally wants. These sit
      // in dense wrapping rows of up to fifteen, and at 44 the style row alone
      // is a third of a phone screen. The row gap gives the extra slop.
      padding: '7px 13px',
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
 * fifteen teachers, fifteen styles — and a centred or nowrap row that cannot
 * fit them overflows its container. See the flex rule in CLAUDE.md.
 */
export const ChipRow: React.FC<{ label: string; children: React.ReactNode }> = ({
  label, children,
}) => (
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

interface Props {
  filters: ClassFilters;
  onChange: (next: ClassFilters) => void;
  facets: ClassFacets;
  /** Which facets to render, in order. */
  show: Facet[];
}

export const FacetGroups: React.FC<Props> = ({ filters, onChange, facets, show }) => {
  /** Add or remove one value from a multi-select facet. */
  const toggle = <K extends keyof ClassFilters>(key: K, value: any) => {
    const current = filters[key] as unknown as any[];
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    onChange({ ...filters, [key]: next });
  };

  const rows: Record<Facet, React.ReactNode> = {
    // A single option is not a choice — it filters nothing out, and a lone
    // chip reads as a button that does not work.
    categories: facets.categories.length > 1 && (
      <ChipRow key="categories" label="Program">
        {facets.categories.map(cat => (
          <Chip
            key={cat}
            label={CLASS_CATEGORY_LABEL[cat]}
            active={filters.categories.includes(cat)}
            onClick={() => toggle('categories', cat as PortalClassCategory)}
          />
        ))}
      </ChipRow>
    ),

    days: facets.days.length > 1 && (
      <ChipRow key="days" label="Day">
        {facets.days.map(day => (
          <Chip
            key={day}
            // Three letters, so six of them fit across a 320px phone.
            label={(dayName(day) ?? '').slice(0, 3)}
            active={filters.days.includes(day)}
            onClick={() => toggle('days', day)}
          />
        ))}
      </ChipRow>
    ),

    bands: facets.bands.length > 1 && (
      <ChipRow key="bands" label="Time of day">
        {TIME_BANDS.filter(b => facets.bands.includes(b.value)).map(b => (
          <Chip
            key={b.value}
            label={b.label}
            active={filters.bands.includes(b.value)}
            onClick={() => toggle('bands', b.value)}
          />
        ))}
      </ChipRow>
    ),

    styles: facets.styles.length > 1 && (
      <ChipRow key="styles" label="Style">
        {facets.styles.map(style => (
          <Chip
            key={style}
            label={style}
            active={filters.styles.includes(style)}
            onClick={() => toggle('styles', style)}
          />
        ))}
      </ChipRow>
    ),

    ageGroups: facets.ageGroups.length > 1 && (
      <ChipRow key="ageGroups" label="Age group">
        {facets.ageGroups.map(group => (
          <Chip
            key={group}
            label={group}
            active={filters.ageGroups.includes(group)}
            onClick={() => toggle('ageGroups', group)}
          />
        ))}
      </ChipRow>
    ),

    instructors: facets.instructors.length > 1 && (
      <ChipRow key="instructors" label="Teacher">
        {facets.instructors.map(name => (
          <Chip
            key={name}
            label={name}
            active={filters.instructors.includes(name)}
            onClick={() => toggle('instructors', name)}
          />
        ))}
      </ChipRow>
    ),

    rooms: facets.rooms.length > 1 && (
      <ChipRow key="rooms" label="Studio">
        {facets.rooms.map(room => (
          <Chip
            key={room}
            label={room}
            active={filters.rooms.includes(room)}
            onClick={() => toggle('rooms', room)}
          />
        ))}
      </ChipRow>
    ),

    // The one numeric facet. It reads the class's own age range rather than
    // its age-group label, which is the only way "my dancer is 6" can tell TNT
    // Combo from Junior Hip Hop — both are named rather than numbered.
    age: (
      <ChipRow key="age" label="Dancer’s age">
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
              onChange({ ...filters, age: raw === '' || Number.isNaN(n) ? null : n });
            }}
            style={{
              width: '84px',
              padding: '9px 10px',
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
    ),
  };

  return <>{show.map(facet => rows[facet] || null)}</>;
};
