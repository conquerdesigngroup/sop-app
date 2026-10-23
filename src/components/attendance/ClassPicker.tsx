import React, { useEffect, useMemo, useState } from 'react';
import { theme } from '../../theme';
import { Button, Modal, SearchInput, Select } from '../ui';
import { ClassOption, TeacherOption } from '../../lib/attendanceRecords';
import { clockTime, weekdayName } from './RecordsControls';

/**
 * Choosing which classes a report covers.
 *
 * The questions the office actually asks are "all of mine", "everything that
 * runs on a Monday" and "Ada's classes", and then "...except that one". So the
 * quick picks REPLACE the selection — one tap gets you to the right starting
 * set — and the checkboxes underneath adjust it. Adding to a selection by
 * tapping two weekdays is rarely meant and hard to see on a phone; replacing it
 * is always visible in the count on the button.
 */

export interface ClassSelection {
  /** Null means every class, with no WHERE at all. */
  ids: string[] | null;
  /** How a quick pick names itself — "Monday classes" — kept until the set is edited by hand. */
  label?: string;
}

export const ALL_CLASSES: ClassSelection = { ids: null };

export const describeSelection = (sel: ClassSelection, classes: ClassOption[]): string => {
  if (sel.ids === null) return 'All classes';
  if (sel.label) return sel.label;
  if (sel.ids.length === 1) return classes.find(c => c.id === sel.ids![0])?.name ?? '1 class';
  return `${sel.ids.length} classes`;
};

const byTime = (a: ClassOption, b: ClassOption) =>
  (a.startTime ?? '99').localeCompare(b.startTime ?? '99') || a.name.localeCompare(b.name);

interface Props {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassOption[];
  teachers: TeacherOption[];
  /** The signed-in person's own classes. Empty hides "My classes". */
  myClassIds: string[];
  value: ClassSelection;
  onApply: (next: ClassSelection) => void;
}

const ClassPicker: React.FC<Props> = ({ isOpen, onClose, classes, teachers, myClassIds, value, onApply }) => {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [label, setLabel] = useState<string | undefined>();
  const [search, setSearch] = useState('');

  // Start from what is applied every time it opens, so Cancel really cancels.
  useEffect(() => {
    if (!isOpen) return;
    setPicked(new Set(value.ids ?? classes.map(c => c.id)));
    setLabel(value.ids === null ? 'All classes' : value.label);
    setSearch('');
  }, [isOpen, value, classes]);

  const known = useMemo(() => new Set(classes.map(c => c.id)), [classes]);
  const mine = useMemo(() => myClassIds.filter(id => known.has(id)), [myClassIds, known]);

  const weekdays = useMemo(() => {
    const m = new Map<number | null, ClassOption[]>();
    classes.forEach(c => {
      const list = m.get(c.dayOfWeek) ?? [];
      list.push(c);
      m.set(c.dayOfWeek, list);
    });
    // Sunday-first like day_of_week, and the unscheduled ones last.
    return Array.from(m.entries())
      .sort(([a], [b]) => (a ?? 7) - (b ?? 7))
      .map(([dow, list]) => ({ dow, list: [...list].sort(byTime) }));
  }, [classes]);

  const needle = search.trim().toLowerCase();
  const shown = weekdays
    .map(g => ({ ...g, list: g.list.filter(c => !needle || c.name.toLowerCase().includes(needle)) }))
    .filter(g => g.list.length > 0);
  const shownIds = shown.flatMap(g => g.list.map(c => c.id));

  const replace = (ids: string[], name: string) => {
    setPicked(new Set(ids.filter(id => known.has(id))));
    setLabel(name);
  };

  const toggle = (id: string) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setLabel(undefined);
  };

  const apply = () => {
    const all = picked.size === classes.length;
    onApply(all ? ALL_CLASSES : { ids: Array.from(picked), label });
    onClose();
  };

  const chip = (key: string, text: string, onClick: () => void, on: boolean) => (
    <Button key={key} size="sm" variant={on ? 'primary' : 'secondary'} aria-pressed={on} onClick={onClick}>
      {text}
    </Button>
  );

  const sameAs = (ids: string[]) => ids.length === picked.size && ids.every(id => picked.has(id));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Choose classes"
      size="lg"
      footer={
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, justifyContent: 'flex-end', width: '100%' }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={apply} disabled={picked.size === 0}>
            {picked.size === 0 ? 'Pick at least one' : picked.size === classes.length ? 'Show all classes' : `Show ${picked.size} ${picked.size === 1 ? 'class' : 'classes'}`}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs }}>
        {chip('all', 'All classes', () => replace(classes.map(c => c.id), 'All classes'), sameAs(classes.map(c => c.id)))}
        {mine.length > 0 && chip('mine', `My classes (${mine.length})`, () => replace(mine, 'My classes'), sameAs(mine))}
      </div>

      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: theme.colors.txt.tertiary, margin: `${theme.spacing.md} 0 ${theme.spacing.xs}` }}>
        A day's worth of classes
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs }}>
        {weekdays.filter(g => g.dow !== null).map(g => {
          const ids = g.list.map(c => c.id);
          return chip(
            `d${g.dow}`,
            `${weekdayName(g.dow).slice(0, 3)} (${ids.length})`,
            () => replace(ids, `${weekdayName(g.dow)} classes`),
            sameAs(ids),
          );
        })}
      </div>

      {teachers.length > 0 && (
        <div style={{ marginTop: theme.spacing.md }}>
          <Select
            label="A teacher's classes"
            value=""
            onChange={e => {
              const t = teachers.find(x => x.id === e.target.value);
              if (t) replace(t.classIds, `${t.name}'s classes`);
            }}
            options={[
              { value: '', label: 'Pick a teacher…' },
              ...teachers.map(t => ({ value: t.id, label: `${t.name} (${t.classIds.filter(id => known.has(id)).length})` })),
            ]}
          />
        </div>
      )}

      <div style={{ marginTop: theme.spacing.md }}>
        <SearchInput
          placeholder="Find a class"
          aria-label="Find a class"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onClear={() => setSearch('')}
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs, margin: `${theme.spacing.sm} 0` }}>
        <Button size="sm" variant="ghost" onClick={() => { setPicked(prev => new Set([...Array.from(prev), ...shownIds])); setLabel(undefined); }}>
          {needle ? 'Tick all found' : 'Tick all'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setPicked(prev => { const n = new Set(prev); shownIds.forEach(id => n.delete(id)); return n; }); setLabel(undefined); }}>
          {needle ? 'Untick all found' : 'Untick all'}
        </Button>
        <span style={{ alignSelf: 'center', fontSize: '0.85rem', color: theme.colors.txt.tertiary }}>
          {picked.size} of {classes.length} ticked
        </span>
      </div>

      {shown.length === 0 && (
        <div style={{ color: theme.colors.txt.tertiary, padding: theme.spacing.md }}>No class matches “{search}”.</div>
      )}

      {shown.map(g => (
        <div key={String(g.dow)} style={{ marginBottom: theme.spacing.sm }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: theme.colors.txt.tertiary, padding: `${theme.spacing.xs} 0` }}>
            {weekdayName(g.dow)}
          </div>
          {g.list.map(c => (
            <label
              key={c.id}
              style={{
                display: 'flex', alignItems: 'center', gap: theme.spacing.sm,
                minHeight: 44, padding: `0 ${theme.spacing.xs}`,
                borderTop: `1px solid ${theme.colors.bdr.primary}`,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={picked.has(c.id)}
                onChange={() => toggle(c.id)}
                style={{ width: 20, height: 20, flex: '0 0 auto', accentColor: theme.colors.primary }}
              />
              <span style={{ flex: '1 1 auto', minWidth: 0, overflowWrap: 'anywhere', color: theme.colors.txt.primary }}>
                {c.name}
              </span>
              {clockTime(c.startTime) && (
                <span style={{ fontSize: '0.8rem', color: theme.colors.txt.tertiary, whiteSpace: 'nowrap' }}>
                  {clockTime(c.startTime)}
                </span>
              )}
            </label>
          ))}
        </div>
      ))}
    </Modal>
  );
};

export default ClassPicker;
