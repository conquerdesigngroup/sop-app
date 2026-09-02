import React from 'react';
import { theme } from '../../../theme';

/**
 * A wrapping row of filter chips.
 *
 * WRAPS, AND IS LEFT-ALIGNED
 *
 * CLAUDE.md's third rule: a centred flex row that cannot wrap splits its
 * overflow BOTH ways, and the first item ends up at a negative x where nothing
 * can reach it — that is how six employees became four on the /hours legend.
 * The division row holds four chips plus a label on a 320px screen, so it is
 * flex-start and it wraps.
 *
 * MULTI AND SINGLE ARE THE SAME CONTROL
 *
 * Divisions are multi-select ("show me anyone in All-Stars or TNT"); access and
 * day are single-select. Rather than two components that drift apart visually,
 * one control takes `multi` and reports the right ARIA state for each:
 * aria-pressed for a toggle, aria-checked inside a radiogroup for a choice.
 */
export interface ChipOption {
  value: string;
  label: string;
}

const FilterChips: React.FC<{
  label: string;
  options: ChipOption[];
  /** Selected values. For single-select this holds zero or one entry. */
  selected: string[];
  onToggle: (value: string) => void;
  multi?: boolean;
}> = ({ label, options, selected, onToggle, multi = false }) => (
  <div style={{
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  }}>
    <span
      id={`filter-${label.replace(/\s+/g, '-').toLowerCase()}`}
      style={{
        ...theme.typography.captionSmall,
        fontFamily: theme.fonts.mono,
        color: theme.colors.txt.tertiary,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        // A fixed width would put "DIVISION" and "ACCESS" out of line the
        // moment either wraps to its own row on a phone, so they simply sit
        // in front of their chips.
        marginRight: '2px',
      }}
    >
      {label}
    </span>

    <div
      role={multi ? 'group' : 'radiogroup'}
      aria-labelledby={`filter-${label.replace(/\s+/g, '-').toLowerCase()}`}
      style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs }}
    >
      {options.map(opt => {
        const active = selected.indexOf(opt.value) !== -1;
        return (
          <button
            key={opt.value}
            type="button"
            role={multi ? undefined : 'radio'}
            aria-pressed={multi ? active : undefined}
            aria-checked={multi ? undefined : active}
            onClick={() => onToggle(opt.value)}
            style={{
              ...theme.typography.captionSmall,
              fontFamily: theme.fonts.primary,
              fontWeight: 600,
              padding: '5px 11px',
              // 32px so it is still a comfortable target on a phone; the rest
              // of the portal-admin chips use the same height.
              minHeight: '32px',
              borderRadius: theme.borderRadius.full,
              cursor: 'pointer',
              border: `1px solid ${active ? theme.colors.primary : theme.colors.bdr.primary}`,
              background: active ? theme.colors.primary : 'transparent',
              // Hardcoded white on the crimson fill: the text tokens flip dark
              // in light mode and would vanish against the accent.
              color: active ? '#FFFFFF' : theme.colors.txt.secondary,
              transition: 'background 140ms ease, border-color 140ms ease',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  </div>
);

export default FilterChips;
