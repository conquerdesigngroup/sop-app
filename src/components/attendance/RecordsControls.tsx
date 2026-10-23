import React from 'react';
import { theme } from '../../theme';
import { Button, Input } from '../ui';
import { STATUS_COLORS } from '../../lib/attendanceColors';
import { RecordRow } from '../../lib/attendanceRecords';
import { Delivery } from './useAttendanceExport';
import {
  DateRange,
  QUICK_RANGES,
  QuickRange,
  Tally,
  customRange,
  quickRange,
  reasonLabel,
  statusLabel,
} from './attendanceExport';

/**
 * The pieces the records list and a class's history share, so the two screens
 * pick dates, count and export the same way.
 */

export interface RangeChoice {
  key: QuickRange | 'custom';
  range: DateRange;
}

export const choose = (key: QuickRange, today: string): RangeChoice => ({ key, range: quickRange(key, today) });

/**
 * Quick picks for the ranges people ask for, and two plain date fields for
 * everything else. Editing either field makes the range custom; the chips never
 * fight the fields, because the chips only ever write into them.
 */
export const RangePicker: React.FC<{
  value: RangeChoice;
  onChange: (next: RangeChoice) => void;
  today: string;
  extra?: { key: QuickRange; label: string }[];
}> = ({ value, onChange, today, extra = [] }) => {
  const chips = [...QUICK_RANGES, ...extra];
  const shownFrom = value.key === 'to-date' ? '' : value.range.from;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs }}>
        {chips.map(c => (
          <Button
            key={c.key}
            size="sm"
            variant={value.key === c.key ? 'primary' : 'secondary'}
            aria-pressed={value.key === c.key}
            onClick={() => onChange(choose(c.key, today))}
          >
            {c.label}
          </Button>
        ))}
      </div>
      {/* 180px each, so on a phone they stack rather than clip the year. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
          <Input
            label="From"
            type="date"
            value={shownFrom}
            max={value.range.to}
            onChange={e => e.target.value && onChange({ key: 'custom', range: customRange(e.target.value, value.range.to) })}
          />
        </div>
        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
          <Input
            label="To"
            type="date"
            value={value.range.to}
            min={shownFrom || undefined}
            onChange={e => {
              const v = e.target.value;
              if (!v) return;
              // "Everything up to" keeps meaning everything; only its end moves.
              onChange(value.key === 'to-date'
                ? { key: 'to-date', range: quickRange('to-date', v) }
                : { key: 'custom', range: customRange(value.range.from, v) });
            }}
          />
        </div>
      </div>
      <div style={{ marginTop: theme.spacing.xs, fontSize: '0.85rem', color: theme.colors.txt.tertiary, overflowWrap: 'anywhere' }}>
        {value.range.label}
      </div>
    </div>
  );
};

const TallyCell: React.FC<{ label: string; n: number; color: string }> = ({ label, n, color }) => (
  <div style={{ flex: '1 1 90px', minWidth: 0 }}>
    <div style={{ fontSize: '1.3rem', fontWeight: 800, color }}>{n}</div>
    <div style={{ fontSize: '0.75rem', color: theme.colors.txt.tertiary, overflowWrap: 'anywhere' }}>{label}</div>
  </div>
);

export const TallyStrip: React.FC<{ t: Tally }> = ({ t }) => (
  <>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm }}>
      <TallyCell label="Present" n={t.present} color={STATUS_COLORS.present} />
      <TallyCell label="Absent" n={t.absent} color={STATUS_COLORS.absent} />
      <TallyCell label="Late" n={t.late} color={STATUS_COLORS.late} />
      <TallyCell label="Excused" n={t.excused} color={STATUS_COLORS.excused} />
      <TallyCell label="Sick" n={t.sick} color={STATUS_COLORS.sick} />
      <TallyCell label="Not marked" n={t.unmarked} color={theme.colors.txt.tertiary} />
    </div>
    <div style={{ marginTop: theme.spacing.sm, color: theme.colors.txt.secondary, fontSize: '0.9rem' }}>
      {t.percent === null
        ? 'Nothing in this range counts yet.'
        : `${t.attended} of ${t.counted} counted attendances — ${t.percent}%`}
    </div>
  </>
);

export const ExportButtons: React.FC<{
  onCSV: () => void;
  onPDF: () => void;
  delivery: Delivery;
  disabled?: boolean;
}> = ({ onCSV, onPDF, delivery, disabled }) => {
  const busy = delivery.kind === 'busy';
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
        <Button variant="secondary" onClick={onCSV} disabled={busy || disabled}>Export CSV</Button>
        <Button variant="secondary" onClick={onPDF} disabled={busy || disabled}>Export PDF</Button>
      </div>
      <div
        role="status"
        aria-live="polite"
        style={{
          minHeight: 20,
          marginTop: theme.spacing.xs,
          fontSize: '0.85rem',
          fontWeight: 600,
          overflowWrap: 'anywhere',
          color: delivery.kind === 'error' ? theme.colors.status.error : theme.colors.txt.tertiary,
        }}
      >
        {delivery.kind === 'busy' && delivery.what}
        {delivery.kind === 'done' && delivery.message}
        {delivery.kind === 'error' && delivery.message}
      </div>
    </>
  );
};

/** One mark, as a coloured pill, with the reason beside it when there is one. */
export const MarkPill: React.FC<{ row: RecordRow }> = ({ row }) => (
  <span style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs, alignItems: 'center', justifyContent: 'flex-end' }}>
    {reasonLabel(row) && (
      <span style={{ fontSize: '0.75rem', color: theme.colors.txt.tertiary, overflowWrap: 'anywhere' }}>
        {reasonLabel(row)}
      </span>
    )}
    <span style={{
      padding: `2px ${theme.spacing.sm}`,
      borderRadius: theme.borderRadius.full,
      fontSize: '0.75rem',
      fontWeight: 700,
      whiteSpace: 'nowrap',
      background: row.status ? STATUS_COLORS[row.status] : 'transparent',
      border: row.status ? 'none' : `1px dashed ${theme.colors.bdr.secondary}`,
      // White on a filled status colour: the mode-dependent tokens flip dark in
      // light mode and lose the contrast.
      color: row.status ? '#FFFFFF' : theme.colors.txt.tertiary,
    }}>
      {statusLabel(row)}
    </span>
  </span>
);

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const weekdayName = (dow: number | null): string => (dow === null ? 'No set day' : DAYS[dow] ?? 'No set day');

/** "Tue Oct 13" — UTC-anchored so no local zone can move the weekday. */
export const shortDay = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  const [, m, day] = iso.split('-').map(Number);
  return `${DAYS[d.getUTCDay()].slice(0, 3)} ${SHORT_MONTHS[m - 1]} ${day}`;
};

/** "17:30:00" -> "5:30 PM". */
export const clockTime = (t: string | null): string | null => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
