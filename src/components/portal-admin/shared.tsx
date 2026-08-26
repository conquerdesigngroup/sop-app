import React, { useEffect, useState } from 'react';
import { theme } from '../../theme';
import { Badge, Card, EmptyState, IconButton, Select, Spinner, EditIcon, TrashIcon } from '../ui';
import { PortalClass } from '../../types';
import { formatClassSchedule } from '../../lib/portal';

/**
 * Pieces shared by the five portal-manager sections.
 *
 * Each section is a list of rows plus a modal editor, and these are the parts
 * that were identical across them. Nothing here talks to Supabase.
 */

/** Loading, error and empty handled once, so five sections cannot disagree. */
export const ManagerList: React.FC<{
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  children: React.ReactNode;
}> = ({ loading, error, isEmpty, emptyTitle, emptyDescription, emptyAction, children }) => {
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
        <Spinner size={28} color={theme.colors.primary} />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <p style={{
          ...theme.typography.body,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.secondary,
          margin: 0,
        }}>
          {error}
        </p>
      </Card>
    );
  }

  if (isEmpty) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{children}</div>;
};

/**
 * Which class a row belongs to.
 *
 * "Studio-wide" is only offered to admins, because class_id NULL is exactly
 * what can_edit_portal_class() refuses for everyone else — offering it to a
 * teacher would be offering them a save that the database will reject.
 */
export const ClassSelect: React.FC<{
  label?: string;
  classes: PortalClass[];
  value: string | null;
  onChange: (classId: string | null) => void;
  allowStudioWide: boolean;
  editableClassIds: string[];
  isAdmin: boolean;
  disabled?: boolean;
}> = ({ label = 'Audience', classes, value, onChange, allowStudioWide, editableClassIds, isAdmin, disabled }) => {
  const selectable = classes.filter(c => isAdmin || editableClassIds.includes(c.id));

  const options = [
    ...(allowStudioWide
      ? [{ value: '', label: 'Everyone in this program' }]
      : [{ value: '', label: 'Choose a class…', disabled: true }]),
    ...selectable.map(c => ({
      value: c.id,
      label: c.isActive ? c.name : `${c.name} (hidden)`,
    })),
  ];

  return (
    <Select
      label={label}
      options={options}
      value={value ?? ''}
      disabled={disabled}
      onChange={e => onChange(e.target.value === '' ? null : e.target.value)}
    />
  );
};

/** "Everyone in this program" or the class name, for a list row. */
export const audienceLabel = (classId: string | null, classes: PortalClass[]): string => {
  if (classId === null) return 'Everyone in this program';
  return classes.find(c => c.id === classId)?.name ?? 'A deleted class';
};

export const PublishedBadge: React.FC<{ published: boolean }> = ({ published }) =>
  published
    ? <Badge variant="success" size="sm">Live</Badge>
    : <Badge variant="default" size="sm">Draft</Badge>;

/** Edit and delete, right-aligned. Icon-only, so both carry a label. */
export const RowActions: React.FC<{
  onEdit: () => void;
  onDelete: () => void;
  editLabel: string;
  deleteLabel: string;
  canDelete?: boolean;
}> = ({ onEdit, onDelete, editLabel, deleteLabel, canDelete = true }) => (
  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
    <IconButton variant="ghost" size="sm" aria-label={editLabel} title={editLabel} onClick={onEdit}>
      <EditIcon size={16} />
    </IconButton>
    {canDelete && (
      <IconButton variant="ghost" size="sm" aria-label={deleteLabel} title={deleteLabel} onClick={onDelete}>
        <TrashIcon size={16} />
      </IconButton>
    )}
  </div>
);

/** Meta line under a row title: audience, schedule, dates. */
export const RowMeta: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    ...theme.typography.captionSmall,
    fontFamily: theme.fonts.mono,
    color: theme.colors.txt.tertiary,
  }}>
    {children}
  </div>
);

/** Two fields side by side on a desktop, stacked on a phone. */
export const FieldPair: React.FC<{ stack: boolean; children: React.ReactNode }> = ({ stack, children }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: stack ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: '12px',
  }}>
    {children}
  </div>
);

export const classSummary = (c: PortalClass): string =>
  formatClassSchedule(c.dayOfWeek, c.startTime, c.endTime) ?? 'No set time';

/**
 * Focus the first field when a modal editor opens.
 *
 * The Modal component does not move focus itself, so without this a keyboard
 * user lands on the page behind it.
 */
export const useAutoFocus = (isOpen: boolean) => {
  const [node, setNode] = useState<HTMLInputElement | null>(null);
  useEffect(() => {
    if (isOpen && node) {
      const t = window.setTimeout(() => node.focus(), 50);
      return () => window.clearTimeout(t);
    }
  }, [isOpen, node]);
  return setNode;
};


/**
 * A row of tabs.
 *
 * Lives here rather than in PortalManagerPage because the class workspace needs
 * the same control for its Files/Updates switch, and a second copy of forty
 * lines of tab styling is how two tab rows end up looking subtly different.
 *
 * `panelId` turns it into a real tab set — tablist, tabs and the panel they
 * control. Callers whose choices swap the whole screen rather than one panel
 * leave it off and are announced as a plain group, because claiming otherwise
 * gives a screen reader a contract the page does not keep.
 */
export const TabRow: React.FC<{
  options: { key: string; label: string }[];
  active: string;
  onSelect: (key: string) => void;
  emphasis?: boolean;
  panelId?: string;
  groupLabel?: string;
}> = ({ options, active, onSelect, emphasis, panelId, groupLabel }) => (
  <div
    role={panelId ? 'tablist' : 'group'}
    aria-label={groupLabel}
    style={{
      display: 'flex',
      gap: '4px',
      flexWrap: 'wrap',
      borderBottom: `1px solid ${theme.colors.bdr.primary}`,
      marginBottom: emphasis ? '16px' : '24px',
    }}
  >
    {options.map(opt => {
      const isActive = opt.key === active;
      return (
        <button
          key={opt.key}
          role={panelId ? 'tab' : undefined}
          aria-selected={panelId ? isActive : undefined}
          aria-controls={panelId}
          aria-current={panelId ? undefined : isActive}
          onClick={() => onSelect(opt.key)}
          style={{
            appearance: 'none',
            background: 'none',
            border: 'none',
            borderBottom: `2px solid ${isActive ? theme.colors.primary : 'transparent'}`,
            padding: emphasis ? '10px 16px' : '8px 14px',
            cursor: 'pointer',
            color: isActive ? theme.colors.txt.primary : theme.colors.txt.tertiary,
            fontFamily: theme.fonts.primary,
            fontSize: emphasis ? '15px' : '14px',
            fontWeight: isActive ? 700 : 500,
            letterSpacing: '0.01em',
          }}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);
