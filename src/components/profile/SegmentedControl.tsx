import React from 'react';
import { theme } from '../../theme';

/**
 * A small pill group — the range filter and the child switcher both use it.
 *
 * WRAPS, ALWAYS
 *
 * A household can have four children and the labels are names, so the row's
 * width is not knowable in advance. CLAUDE.md's third mobile rule exists
 * because a centred non-wrapping flex row splits its overflow BOTH ways and the
 * first item ends up at a negative x, unreachable — a child simply missing from
 * their own family's switcher. This is left-aligned and wraps.
 */
interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}

function SegmentedControl<T extends string>({ options, value, onChange, ariaLabel }: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: theme.spacing.xs,
      }}
    >
      {options.map(option => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            style={{
              ...theme.typography.captionSmall,
              fontFamily: theme.fonts.primary,
              fontWeight: 600,
              padding: '6px 12px',
              minHeight: '32px',
              borderRadius: theme.borderRadius.full,
              cursor: 'pointer',
              // Active state is the one place the brand accent earns its 5%:
              // it is the only thing on the card the parent actually operates.
              border: `1px solid ${active ? theme.colors.primary : theme.colors.bdr.primary}`,
              background: active ? theme.colors.primary : 'transparent',
              color: active ? '#FFFFFF' : theme.colors.txt.secondary,
              transition: 'background 140ms ease, border-color 140ms ease',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedControl;
