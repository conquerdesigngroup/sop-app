import React, { useEffect, useMemo, useState } from 'react';
import { theme } from '../../theme';
import { useResponsive } from '../../hooks/useResponsive';
import { Button, Modal, Badge } from '../ui';
import { DateRange, DeliveryResult, formatHours, shareOrDownloadCSV, shareOrDownloadFile } from './hoursUtils';
import { buildPayrollCSV, EmployeeRollup, PayrollLookups } from './payrollExport';
import {
  COLUMNS,
  ColumnKey,
  DEFAULT_COLUMNS,
  MINIMAL_COLUMNS,
  PDF_DEFAULT_COLUMNS,
  buildFlatCSV,
  orderColumns,
} from './timesheetExport';

export type ExportFormat = 'payroll' | 'table' | 'pdf';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Everyone in the current period, already rolled up by the panel. */
  rollups: EmployeeRollup[];
  range: DateRange;
  lookups: PayrollLookups;
  generatedBy?: string;
  /** Opened from one person's card: start with only them ticked. */
  initialEmployeeId?: string | null;
  onDone: (message: string, tone: 'success' | 'warning' | 'error') => void;
}

/** A spreadsheet has room for the reasoning; a printed page does not. */
const defaultColumnsFor = (format: ExportFormat): ColumnKey[] =>
  format === 'pdf' ? PDF_DEFAULT_COLUMNS : DEFAULT_COLUMNS;

const FORMATS: { key: ExportFormat; label: string; blurb: string }[] = [
  {
    key: 'payroll',
    label: 'Payroll report',
    blurb: 'CSV for the accountant. Per-person totals, a breakdown by rate, then every shift. Fixed layout — the column picks below do not apply.',
  },
  {
    key: 'table',
    label: 'Simple table',
    blurb: 'CSV with one header row and one row per shift, and nothing else. This is the one that imports into other software.',
  },
  {
    key: 'pdf',
    label: 'Timesheets',
    blurb: 'PDF, one page per person, with a signature line. Downloads like the others.',
  },
];

/**
 * Choose what leaves this screen: which of the three files, who is in it, and
 * which columns.
 *
 * The period is not repeated here — it is already set on the panel behind
 * this dialog and is shown read-only, so there is one place to change it
 * rather than two that can disagree.
 */
const ExportHoursModal: React.FC<Props> = ({
  isOpen, onClose, rollups, range, lookups, generatedBy, initialEmployeeId, onDone,
}) => {
  const { isMobileOrTablet } = useResponsive();

  const [format, setFormat] = useState<ExportFormat>('table');
  const [columns, setColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  /**
   * Whether the columns on screen are this person's choice or just the
   * default for the file they picked. Switching file follows the new default
   * only while they have not touched the ticks — otherwise changing from CSV
   * to PDF would silently throw away the set they just built.
   */
  const [columnsTouched, setColumnsTouched] = useState(false);

  useEffect(() => {
    if (!columnsTouched) setColumns(defaultColumnsFor(format));
  }, [format, columnsTouched]);

  // Everyone who logged something, plus anyone explicitly asked for. People
  // with nothing logged are not offered — there is nothing to put in a file.
  const people = useMemo(
    () => rollups.filter(r => r.entries.length > 0).sort((a, b) => a.name.localeCompare(b.name)),
    [rollups]
  );

  // Reset each time it opens, so a previous run's picks cannot silently
  // narrow the next export.
  const [openedFor, setOpenedFor] = useState<string | null | undefined>(undefined);
  if (isOpen && openedFor !== initialEmployeeId) {
    setOpenedFor(initialEmployeeId);
    setSelected(initialEmployeeId ? [initialEmployeeId] : people.map(p => p.employeeId));
    setColumns(defaultColumnsFor(format));
    setColumnsTouched(false);
  }
  if (!isOpen && openedFor !== undefined) setOpenedFor(undefined);

  const chosen = useMemo(
    () => people.filter(p => selected.includes(p.employeeId)),
    [people, selected]
  );

  const entryCount = chosen.reduce((s, r) => s + r.entries.length, 0);
  const hourTotal = chosen.reduce((s, r) => s + r.total, 0);

  const allPicked = people.length > 0 && selected.length === people.length;
  const usesColumns = format !== 'payroll';
  const nothingToExport = entryCount === 0;
  // Employee, Email and Employee ID head the page rather than sitting in the
  // table, so a PDF built from only those has pages with nothing on them.
  const printable = orderColumns(columns).filter(c => !c.identifies);
  const noColumns = usesColumns
    && (format === 'pdf' ? printable.length === 0 : columns.length === 0);

  const togglePerson = (id: string) =>
    setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));

  const toggleColumn = (key: ColumnKey) => {
    setColumnsTouched(true);
    setColumns(c => (c.includes(key) ? c.filter(x => x !== key) : [...c, key]));
  };

  const deliver = async (
    filename: string,
    run: () => Promise<DeliveryResult>,
    summary: string
  ) => {
    try {
      const how = await run();
      if (how === 'cancelled') return;
      onDone(`${how === 'shared' ? 'Shared' : 'Exported'} ${summary}`, 'success');
      onClose();
    } catch (error: any) {
      onDone(error?.message || `Could not produce ${filename}`, 'error');
    }
  };

  const handleExport = async () => {
    if (busy || nothingToExport || noColumns) return;
    setBusy(true);

    const who = chosen.length === 1 ? chosen[0].name : undefined;
    const summary = `${entryCount} ${entryCount === 1 ? 'shift' : 'shifts'}`
      + (who ? ` for ${who}` : ` for ${chosen.length} ${chosen.length === 1 ? 'person' : 'people'}`);

    try {
      if (format === 'payroll') {
        const { csv, filename } = buildPayrollCSV({ rollups: chosen, range, lookups, generatedBy });
        await deliver(filename, () => shareOrDownloadCSV(filename, csv), summary);
      } else if (format === 'table') {
        const { csv, filename } = buildFlatCSV({ rollups: chosen, range, lookups, columns, subject: who });
        await deliver(filename, () => shareOrDownloadCSV(filename, csv), summary);
      } else {
        // Imported here, not at the top: jsPDF is a large chunk and must not
        // load for an admin who only ever exports CSVs.
        const { buildTimesheetPDF } = await import('./timesheetPdf');
        const { blob, filename } = await buildTimesheetPDF({
          rollups: chosen, range, lookups, columns, generatedBy, subject: who,
        });
        await deliver(filename, () => shareOrDownloadFile(filename, blob, 'application/pdf'), summary);
      }
    } catch (error: any) {
      onDone(error?.message || 'Could not build that export', 'error');
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------------ bits

  const label = (children: React.ReactNode) => (
    <div style={{
      fontSize: '11px',
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: theme.colors.txt.tertiary,
      fontFamily: theme.fonts.mono,
      marginBottom: theme.spacing.sm,
    }}>
      {children}
    </div>
  );

  const tickbox = (
    key: string,
    text: string,
    checked: boolean,
    onToggle: () => void,
    hint?: string
  ) => (
    <label
      key={key}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: theme.spacing.sm,
        padding: '7px 10px',
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${checked ? theme.colors.bdr.secondary : theme.colors.bdr.primary}`,
        backgroundColor: checked ? theme.colors.bg.tertiary : 'transparent',
        cursor: 'pointer',
        fontFamily: theme.fonts.primary,
        fontSize: '14px',
        color: theme.colors.txt.primary,
        minWidth: 0,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        style={{ marginTop: '2px', accentColor: theme.colors.primary, flexShrink: 0 }}
      />
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
        {text}
        {hint && (
          <span style={{ color: theme.colors.txt.tertiary, fontSize: '12px' }}> · {hint}</span>
        )}
      </span>
    </label>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Export hours"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleExport}
            loading={busy}
            disabled={nothingToExport || noColumns}
          >
            {format === 'pdf' ? 'Download PDF' : 'Download CSV'}
          </Button>
        </>
      }
    >
      {/* ---- what is being exported ---- */}
      <div style={{
        display: 'flex',
        gap: theme.spacing.sm,
        flexWrap: 'wrap',
        alignItems: 'center',
        marginBottom: theme.spacing.lg,
        fontFamily: theme.fonts.primary,
        fontSize: '13px',
        color: theme.colors.txt.secondary,
      }}>
        <Badge variant="info" size="sm">{range.label}</Badge>
        <span>
          {entryCount === 0
            ? 'Nothing selected to export'
            : `${entryCount} ${entryCount === 1 ? 'shift' : 'shifts'} · ${formatHours(hourTotal)} hrs · `
              + `${chosen.length} ${chosen.length === 1 ? 'person' : 'people'}`}
        </span>
      </div>

      {/* ---- format ---- */}
      {label('File')}
      <div style={{ display: 'grid', gap: theme.spacing.sm, marginBottom: theme.spacing.lg }}>
        {FORMATS.map(f => {
          const active = format === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFormat(f.key)}
              style={{
                textAlign: 'left',
                padding: theme.spacing.md,
                borderRadius: theme.borderRadius.md,
                border: `1px solid ${active ? theme.colors.primary : theme.colors.bdr.primary}`,
                backgroundColor: active ? theme.colors.bg.tertiary : 'transparent',
                cursor: 'pointer',
                fontFamily: theme.fonts.primary,
              }}
            >
              <div style={{
                fontSize: '15px',
                fontWeight: 600,
                color: theme.colors.txt.primary,
                marginBottom: '2px',
              }}>
                {f.label}
              </div>
              <div style={{ fontSize: '12px', color: theme.colors.txt.tertiary, lineHeight: 1.45 }}>
                {f.blurb}
              </div>
            </button>
          );
        })}
      </div>

      {/* ---- who ---- */}
      {label(
        <span style={{ display: 'flex', gap: theme.spacing.md, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>Who</span>
          <button
            type="button"
            onClick={() => setSelected(allPicked ? [] : people.map(p => p.employeeId))}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: theme.colors.primary, font: 'inherit', textTransform: 'none',
            }}
          >
            {allPicked ? 'Clear all' : 'Select all'}
          </button>
        </span>
      )}
      {people.length === 0 ? (
        <div style={{
          fontSize: '13px',
          color: theme.colors.txt.tertiary,
          fontFamily: theme.fonts.primary,
          marginBottom: theme.spacing.lg,
        }}>
          Nobody logged hours in this period.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobileOrTablet ? '1fr' : 'repeat(2, minmax(0, 1fr))',
          gap: theme.spacing.sm,
          marginBottom: theme.spacing.lg,
        }}>
          {people.map(p => tickbox(
            p.employeeId,
            p.name,
            selected.includes(p.employeeId),
            () => togglePerson(p.employeeId),
            `${formatHours(p.total)} hrs`
          ))}
        </div>
      )}

      {/* ---- columns ---- */}
      {usesColumns && (
        <>
          {label(
            <span style={{ display: 'flex', gap: theme.spacing.md, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>Columns</span>
              <button
                type="button"
                onClick={() => { setColumnsTouched(true); setColumns(DEFAULT_COLUMNS); }}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  color: theme.colors.primary, font: 'inherit', textTransform: 'none',
                }}
              >
                Everything
              </button>
              <button
                type="button"
                onClick={() => { setColumnsTouched(true); setColumns(MINIMAL_COLUMNS); }}
                style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  color: theme.colors.primary, font: 'inherit', textTransform: 'none',
                }}
              >
                Just hours and category
              </button>
            </span>
          )}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobileOrTablet ? '1fr' : 'repeat(3, minmax(0, 1fr))',
            gap: theme.spacing.sm,
          }}>
            {COLUMNS.map(c => tickbox(
              c.key,
              c.label,
              columns.includes(c.key),
              () => toggleColumn(c.key),
              format === 'pdf' && c.identifies ? 'not on the PDF' : undefined
            ))}
          </div>
          {noColumns && (
            <div style={{
              marginTop: theme.spacing.sm,
              fontSize: '13px',
              color: theme.colors.status.error,
              fontFamily: theme.fonts.primary,
            }}>
              {format === 'pdf'
                ? 'Pick at least one column other than Employee, Email and Employee ID — those name the page rather than fill the table.'
                : 'Pick at least one column — an export with none is an empty file.'}
            </div>
          )}
          {format === 'pdf' && (
            <div style={{
              marginTop: theme.spacing.sm,
              fontSize: '12px',
              color: theme.colors.txt.tertiary,
              fontFamily: theme.fonts.primary,
            }}>
              Each person is named at the top of their own page, so Employee, Email
              and Employee ID are left out of the table itself. Pay basis is off by
              default here — Status already says approved or pending, and it is the
              widest column on the page — but tick it if you want the reasoning printed.
            </div>
          )}
        </>
      )}
    </Modal>
  );
};

export default ExportHoursModal;
