import React, { useMemo, useState } from 'react';
import { WorkCategory } from '../../types';
import { theme } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';
import { Button, Select, Input, Textarea } from '../ui';
import {
  TIME_OPTIONS,
  formatHours,
  todayISO,
  shiftDays,
  formatDateLong,
} from './hoursUtils';

export interface HoursFormValues {
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  categoryId: string;
  notes: string;
}

interface HoursEntryFormProps {
  categories: WorkCategory[];
  /** True when migration v7 is missing, so the category column cannot be written. */
  categoriesUnavailable?: boolean;
  initialValues?: Partial<HoursFormValues>;
  submitLabel?: string;
  onSubmit: (values: HoursFormValues) => Promise<void>;
  onCancel?: () => void;
  /** Keep the entered date/time after a successful save (create mode). */
  resetOnSuccess?: boolean;
}

/**
 * Built fresh on each call, never hoisted to a module constant.
 *
 * As a constant, todayISO() would run once when the bundle is evaluated and
 * that date would be reused for the life of the tab — so a phone left open
 * overnight, or a shift logged either side of midnight, would file hours
 * against yesterday with today's label.
 */
const makeDefaults = (): HoursFormValues => ({
  workDate: todayISO(),
  startTime: '09:00',
  endTime: '17:00',
  breakMinutes: 0,
  categoryId: '',
  notes: '',
});

/**
 * Mirrors calculateTotalHours() in WorkHoursContext so the number shown
 * while typing is the number the database trigger will store.
 */
const previewHours = (start: string, end: string, breakMinutes: number): number => {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const net = (eh * 60 + em) - (sh * 60 + sm) - (breakMinutes || 0);
  return Math.max(0, Math.round((net / 60) * 100) / 100);
};

const HoursEntryForm: React.FC<HoursEntryFormProps> = ({
  categories,
  categoriesUnavailable = false,
  initialValues,
  submitLabel = 'Log Hours',
  onSubmit,
  onCancel,
  resetOnSuccess = false,
}) => {
  const { isMobileOrTablet } = useResponsive();
  const [values, setValues] = useState<HoursFormValues>({ ...makeDefaults(), ...initialValues });
  const [errors, setErrors] = useState<Partial<Record<keyof HoursFormValues, string>>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof HoursFormValues>(key: K, value: HoursFormValues[K]) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setErrors(prev => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const activeCategories = useMemo(
    () => categories.filter(c => c.isActive || c.id === values.categoryId),
    [categories, values.categoryId]
  );

  const total = previewHours(values.startTime, values.endTime, values.breakMinutes);

  const validate = (): boolean => {
    const next: Partial<Record<keyof HoursFormValues, string>> = {};

    if (!values.workDate) {
      next.workDate = 'Pick a date.';
    }
    if (values.endTime <= values.startTime) {
      // The model is one date plus two clock times, so a shift that runs
      // past midnight cannot be represented. Log it as two entries.
      next.endTime = 'End time must be after start time. For an overnight shift, log two entries.';
    } else if (values.breakMinutes > 0) {
      const span =
        (Number(values.endTime.split(':')[0]) * 60 + Number(values.endTime.split(':')[1])) -
        (Number(values.startTime.split(':')[0]) * 60 + Number(values.startTime.split(':')[1]));
      if (values.breakMinutes >= span) {
        next.breakMinutes = 'Break is longer than the shift.';
      }
    }
    if (activeCategories.length > 0 && !values.categoryId) {
      next.categoryId = 'Pick what you worked on.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !validate()) return;

    setSaving(true);
    try {
      await onSubmit(values);
      if (resetOnSuccess) {
        // Keep the date and category — logging several entries for one day
        // is the common case, and re-picking them every time is friction.
        setValues(prev => ({
          ...makeDefaults(),
          workDate: prev.workDate,
          categoryId: prev.categoryId,
        }));
      }
    } catch {
      // The caller has already surfaced this to the user via a toast and
      // rethrown so we keep what was typed. Swallow it here rather than
      // letting it escape an async handler as an unhandled rejection.
    } finally {
      setSaving(false);
    }
  };

  const quickDate = (label: string, iso: string) => {
    const active = values.workDate === iso;
    return (
      <button
        key={label}
        type="button"
        onClick={() => set('workDate', iso)}
        style={{
          padding: '6px 14px',
          borderRadius: theme.borderRadius.full,
          border: `1px solid ${active ? theme.colors.primary : theme.colors.bdr.primary}`,
          backgroundColor: active ? theme.colors.primary : 'transparent',
          color: active ? '#FFFFFF' : theme.colors.txt.secondary,
          fontSize: '13px',
          fontFamily: theme.fonts.primary,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* ---- Date ---- */}
      <div style={{ marginBottom: theme.spacing.lg }}>
        <Input
          type="date"
          label="What day?"
          value={values.workDate}
          max={todayISO()}
          error={errors.workDate}
          onChange={e => set('workDate', e.target.value)}
        />
        <div style={{ display: 'flex', gap: theme.spacing.sm, marginTop: theme.spacing.sm, flexWrap: 'wrap' }}>
          {quickDate('Today', todayISO())}
          {quickDate('Yesterday', shiftDays(todayISO(), -1))}
          {values.workDate &&
            values.workDate !== todayISO() &&
            values.workDate !== shiftDays(todayISO(), -1) && (
              <span style={{
                alignSelf: 'center',
                fontSize: '13px',
                color: theme.colors.txt.tertiary,
                fontFamily: theme.fonts.primary,
              }}>
                {formatDateLong(values.workDate)}
              </span>
            )}
        </div>
      </div>

      {/* ---- Times ---- */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobileOrTablet ? '1fr' : '1fr 1fr',
        gap: theme.spacing.md,
        marginBottom: theme.spacing.lg,
      }}>
        <Select
          label="Time in"
          options={TIME_OPTIONS}
          value={values.startTime}
          onChange={e => set('startTime', e.target.value)}
        />
        <Select
          label="Time out"
          options={TIME_OPTIONS}
          value={values.endTime}
          error={errors.endTime}
          onChange={e => set('endTime', e.target.value)}
        />
      </div>

      {/* ---- Break + running total ---- */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobileOrTablet ? '1fr' : '1fr 1fr',
        gap: theme.spacing.md,
        marginBottom: theme.spacing.lg,
        alignItems: 'start',
      }}>
        <Input
          type="number"
          inputMode="numeric"
          label="Unpaid break (minutes)"
          min={0}
          step={5}
          value={String(values.breakMinutes)}
          error={errors.breakMinutes}
          // Rounded, not just clamped: break_minutes is an INTEGER column,
          // and 7.5 would reach Postgres as an invalid-input error.
          onChange={e => set('breakMinutes', Math.max(0, Math.round(Number(e.target.value) || 0)))}
        />
        <div style={{
          backgroundColor: theme.colors.bg.tertiary,
          border: `1px solid ${theme.colors.bdr.primary}`,
          borderRadius: theme.borderRadius.md,
          padding: theme.spacing.md,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minHeight: '58px',
        }}>
          <span style={{
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: theme.colors.txt.tertiary,
            fontFamily: theme.fonts.mono,
          }}>
            Total
          </span>
          <span style={{
            fontSize: '22px',
            fontWeight: 700,
            color: total > 0 ? theme.colors.txt.primary : theme.colors.txt.tertiary,
            fontFamily: theme.fonts.mono,
          }}>
            {formatHours(total)} hrs
          </span>
        </div>
      </div>

      {/* ---- Category ---- */}
      <div style={{ marginBottom: theme.spacing.lg }}>
        {activeCategories.length > 0 ? (
          <Select
            label="What did you work on?"
            placeholder="Select…"
            options={activeCategories.map(c => ({ value: c.id, label: c.name }))}
            value={values.categoryId}
            error={errors.categoryId}
            onChange={e => set('categoryId', e.target.value)}
          />
        ) : (
          <div style={{
            padding: theme.spacing.md,
            borderRadius: theme.borderRadius.md,
            border: `1px dashed ${theme.colors.bdr.secondary}`,
            color: theme.colors.txt.tertiary,
            fontSize: '13px',
            fontFamily: theme.fonts.primary,
          }}>
            {categoriesUnavailable
              ? 'Categories are not set up on the server yet (migration v7 has not been run). You can still log hours — just say what you worked on in the note.'
              : 'No work categories yet — an admin can add them under Team Hours. You can still log hours without one.'}
          </div>
        )}
      </div>

      {/* ---- Note ---- */}
      <div style={{ marginBottom: theme.spacing.lg }}>
        <Textarea
          label="Note (optional)"
          placeholder="What were you working on?"
          rows={3}
          value={values.notes}
          onChange={e => set('notes', e.target.value)}
        />
      </div>

      {/* ---- Actions ---- */}
      <div style={{ display: 'flex', gap: theme.spacing.md, flexDirection: onCancel ? 'row' : 'column' }}>
        {onCancel && (
          <Button type="button" variant="secondary" fullWidth onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" size="lg" fullWidth loading={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
};

export default HoursEntryForm;
