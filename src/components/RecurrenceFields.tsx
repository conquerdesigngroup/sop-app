import React from 'react';
import { RecurrencePattern } from '../types';
import { theme } from '../theme';
import { Button, Input, Select } from './ui';
import { describeRecurrence, formatShortDate, nextOccurrence, weekdayOf, WEEKDAY_SHORT } from '../lib/recurrence';
import { studioToday } from '../lib/studioDate';

type Frequency = RecurrencePattern['frequency'];

interface RecurrenceFieldsProps {
  value: RecurrencePattern;
  onChange: (next: RecurrencePattern) => void;
  /** The task's start date (its scheduled date). Drives defaults and the preview. */
  startDate: string;
}

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];
const UNIT: Record<Frequency, [string, string]> = {
  daily: ['day', 'days'],
  weekly: ['week', 'weeks'],
  monthly: ['month', 'months'],
};

/** Problems that should stop a save, in words. Empty when the rule is usable. */
export const recurrenceProblems = (p: RecurrencePattern, startDate: string): string | null => {
  if (!p.interval || p.interval < 1 || p.interval > 99) return 'Repeat every must be a number from 1 to 99.';
  if (p.frequency === 'weekly' && (!p.daysOfWeek || p.daysOfWeek.length === 0)) return 'Pick at least one day of the week.';
  if (p.endDate && startDate && p.endDate < startDate) return 'The end date is before the start date.';
  return null;
};

/** A fresh rule for a task starting on `startDate`. */
export const defaultRecurrence = (startDate: string): RecurrencePattern => ({
  frequency: 'weekly',
  interval: 1,
  daysOfWeek: startDate ? [weekdayOf(startDate)] : [1],
});

/**
 * The repeat controls for a job task: how often, which days, until when, with
 * a plain-words preview of what will happen. Used by the create/edit task
 * modal for both new and existing recurring tasks.
 */
export const RecurrenceFields: React.FC<RecurrenceFieldsProps> = ({ value, onChange, startDate }) => {
  const set = (patch: Partial<RecurrencePattern>) => onChange({ ...value, ...patch });
  const interval = value.interval ?? 1;
  const days = value.daysOfWeek ?? [];
  const [one, many] = UNIT[value.frequency];

  const setFrequency = (frequency: Frequency) => {
    const patch: Partial<RecurrencePattern> = { frequency };
    if (frequency === 'weekly' && days.length === 0 && startDate) patch.daysOfWeek = [weekdayOf(startDate)];
    if (frequency === 'monthly' && !value.dayOfMonth && startDate) patch.dayOfMonth = Number(startDate.slice(8, 10));
    set(patch);
  };

  const toggleDay = (d: number) =>
    set({ daysOfWeek: days.includes(d) ? days.filter(x => x !== d) : [...days, d] });

  const problem = startDate ? recurrenceProblems(value, startDate) : null;
  const next = !problem && startDate ? nextOccurrence(value, startDate, studioToday()) : null;

  return (
    <div style={styles.wrap}>
      <div style={styles.field}>
        <span style={styles.label} id="recurrence-frequency-label">Repeats</span>
        <div style={styles.chips} role="radiogroup" aria-labelledby="recurrence-frequency-label">
          {(['daily', 'weekly', 'monthly'] as Frequency[]).map(f => (
            <Button
              key={f}
              type="button"
              size="sm"
              role="radio"
              aria-checked={value.frequency === f}
              variant={value.frequency === f ? 'primary' : 'outline'}
              onClick={() => setFrequency(f)}
            >
              {f === 'daily' ? 'Daily' : f === 'weekly' ? 'Weekly' : 'Monthly'}
            </Button>
          ))}
        </div>
      </div>

      <div style={styles.field}>
        <label style={styles.label} htmlFor="recurrence-interval">Every</label>
        <div style={styles.inline}>
          <div style={{ width: 88 }}>
            <Input
              id="recurrence-interval"
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              value={interval}
              onChange={e => set({ interval: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
            />
          </div>
          <span style={styles.unit}>{interval === 1 ? one : many}</span>
        </div>
      </div>

      {value.frequency === 'weekly' && (
        <div style={styles.field}>
          <span style={styles.label} id="recurrence-days-label">On</span>
          <div style={styles.chips} role="group" aria-labelledby="recurrence-days-label">
            {MONDAY_FIRST.map(d => (
              <Button
                key={d}
                type="button"
                size="sm"
                aria-pressed={days.includes(d)}
                variant={days.includes(d) ? 'primary' : 'outline'}
                onClick={() => toggleDay(d)}
                style={styles.dayChip}
              >
                {WEEKDAY_SHORT[d]}
              </Button>
            ))}
          </div>
          <div style={styles.chips}>
            <Button type="button" size="sm" variant="ghost" onClick={() => set({ daysOfWeek: [1, 2, 3, 4, 5] })}>
              Weekdays
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => set({ daysOfWeek: [0, 1, 2, 3, 4, 5, 6] })}>
              Every day
            </Button>
          </div>
        </div>
      )}

      {value.frequency === 'monthly' && (
        <div style={styles.field}>
          <Select
            label="On day"
            value={String(value.dayOfMonth ?? (startDate ? Number(startDate.slice(8, 10)) : 1))}
            onChange={e => set({ dayOfMonth: Number(e.target.value) })}
            options={Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
          />
          {(value.dayOfMonth ?? 0) > 28 && (
            <span style={styles.hint}>In shorter months it lands on the last day.</span>
          )}
        </div>
      )}

      <div style={styles.field}>
        <span style={styles.label} id="recurrence-ends-label">Ends</span>
        <div style={styles.chips} role="radiogroup" aria-labelledby="recurrence-ends-label">
          <Button
            type="button"
            size="sm"
            role="radio"
            aria-checked={!value.endDate}
            variant={!value.endDate ? 'primary' : 'outline'}
            onClick={() => set({ endDate: undefined })}
          >
            Never
          </Button>
          <Button
            type="button"
            size="sm"
            role="radio"
            aria-checked={!!value.endDate}
            variant={value.endDate ? 'primary' : 'outline'}
            onClick={() => {
              if (!value.endDate) {
                // A sensible default to adjust: three months after the start.
                const base = startDate || studioToday();
                const d = new Date(`${base}T00:00:00Z`);
                d.setUTCMonth(d.getUTCMonth() + 3);
                set({ endDate: d.toISOString().slice(0, 10) });
              }
            }}
          >
            On a date
          </Button>
        </div>
        {value.endDate && (
          <div style={{ maxWidth: 220 }}>
            <Input
              type="date"
              aria-label="Last day it repeats"
              value={value.endDate}
              min={startDate || undefined}
              onChange={e => set({ endDate: e.target.value || undefined })}
            />
          </div>
        )}
      </div>

      <div style={{ ...styles.preview, ...(problem ? styles.previewError : null) }} role="status" aria-live="polite">
        {problem ? (
          problem
        ) : (
          <>
            <strong>{describeRecurrence(value, startDate)}</strong>
            {value.endDate ? ` until ${formatShortDate(value.endDate)}` : ''}
            {startDate ? `, starting ${formatShortDate(startDate)}.` : '.'}
            {next ? ` Next one: ${formatShortDate(next)}.` : ' It has no dates left to land on.'}
            <span style={styles.hint}> Each repeat shows up as its own task for the people assigned.</span>
          </>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
    minWidth: 0,
  },
  label: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.txt.secondary,
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  dayChip: {
    minWidth: 52,
  },
  inline: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  unit: {
    color: theme.colors.txt.secondary,
    fontSize: '15px',
  },
  hint: {
    color: theme.colors.txt.tertiary,
    fontSize: '13px',
  },
  preview: {
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: theme.colors.bdr.primary,
    background: theme.colors.bg.tertiary,
    color: theme.colors.txt.primary,
    fontSize: '14px',
    lineHeight: 1.5,
    overflowWrap: 'anywhere',
  },
  previewError: {
    borderColor: theme.colors.status.error,
    color: theme.colors.status.error,
  },
};

export default RecurrenceFields;
