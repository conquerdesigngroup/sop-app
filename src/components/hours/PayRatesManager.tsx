import React, { useEffect, useMemo, useState } from 'react';
import { theme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkHours } from '../../contexts/WorkHoursContext';
import { useToast } from '../../contexts/ToastContext';
import { useResponsive } from '../../hooks/useResponsive';
import { Modal, Button, EmptyState, SearchInput, Select, Badge } from '../ui';

interface PayRatesManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Admin-only editor for what each employee earns per hour in each category.
 *
 * One person at a time. The old employee × category grid needed sideways
 * scrolling as soon as there were more than four categories, and on a phone
 * it was unusable; this shows a person list on the left and that person's
 * rates as a plain vertical form on the right, so every category label sits
 * next to its box and nothing is ever clipped.
 *
 * Rates are enforced admin-only by RLS (migration v7 §11) — this component
 * being admin-gated is convenience, not the security boundary.
 *
 * A blank box means no rate is configured, which pays 0.00. It is shown as
 * blank rather than "0" so a rate you have not set yet is distinguishable
 * from one you deliberately set to zero.
 */
const PayRatesManager: React.FC<PayRatesManagerProps> = ({ isOpen, onClose }) => {
  const { users } = useAuth();
  const { workCategories, employeePayRates, setEmployeePayRate, getEmployeePayRate } = useWorkHours();
  const { showToast } = useToast();
  const { isMobileOrTablet } = useResponsive();

  // Box currently being typed into, keyed `${employeeId}:${categoryId}`.
  // Held separately so a half-typed "4" is not committed as $4/hr.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fillAll, setFillAll] = useState('');
  const [copyFrom, setCopyFrom] = useState('');

  const categories = useMemo(
    () => workCategories.filter(c => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [workCategories]
  );

  const employees = useMemo(
    () => users
      .filter(u => u.isActive)
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)),
    [users]
  );

  const nameOf = (id: string) => {
    const u = employees.find(e => e.id === id);
    return u ? `${u.firstName} ${u.lastName}` : '';
  };

  // How many of the active categories this person has a rate for.
  const setCountFor = (employeeId: string) =>
    categories.filter(c => getEmployeePayRate(employeeId, c.id) !== undefined).length;

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(u => `${u.firstName} ${u.lastName}`.toLowerCase().includes(q));
  }, [employees, search]);

  // Always have someone selected once the list exists, and drop the
  // selection if that person is deactivated while the dialog is open.
  useEffect(() => {
    if (!isOpen) return;
    if (selectedId && employees.some(u => u.id === selectedId)) return;
    setSelectedId(employees[0]?.id ?? null);
  }, [isOpen, employees, selectedId]);

  // Quick-action inputs are per person; clear them when switching.
  useEffect(() => {
    setFillAll('');
    setCopyFrom('');
  }, [selectedId]);

  const keyFor = (employeeId: string, categoryId: string) => `${employeeId}:${categoryId}`;

  const clearDraft = (k: string) =>
    setDraft(prev => {
      const next = { ...prev };
      delete next[k];
      return next;
    });

  /**
   * `raw` comes straight from the input rather than from `draft` state.
   *
   * Reading `draft` here would close over whatever the last render saw: a
   * keystroke and a blur dispatched in the same task (paste-and-tab, or
   * anything scripted) commit before React has re-rendered, so the closure
   * still holds the pre-edit value and the save is silently skipped.
   */
  const commit = async (employeeId: string, categoryId: string, raw: string) => {
    const k = keyFor(employeeId, categoryId);
    const trimmed = raw.trim();
    const existing = getEmployeePayRate(employeeId, categoryId);

    // Clearing the box is not the same as typing 0 — but there is no way to
    // un-set a rate through upsert, so treat an emptied field as "leave it
    // alone" and let the admin type 0 explicitly if they mean zero.
    if (trimmed === '') {
      clearDraft(k);
      return;
    }

    const value = Number(trimmed);
    if (!Number.isFinite(value) || value < 0) {
      showToast('Enter a rate of 0 or more', 'error');
      return;
    }
    if (existing !== undefined && Math.round(value * 100) === Math.round(existing * 100)) {
      // Unchanged — skip the round-trip.
      clearDraft(k);
      return;
    }

    setSavingKey(k);
    try {
      await setEmployeePayRate(employeeId, categoryId, value);
      clearDraft(k);
    } catch (error: any) {
      showToast(error?.message || 'Could not save this rate', 'error');
    } finally {
      setSavingKey(null);
    }
  };

  /** Set every category for the selected person to one rate. */
  const applyToAll = async () => {
    if (!selectedId) return;
    const value = Number(fillAll.trim());
    if (fillAll.trim() === '' || !Number.isFinite(value) || value < 0) {
      showToast('Enter a rate of 0 or more', 'error');
      return;
    }
    setBulkBusy(true);
    try {
      for (const c of categories) {
        await setEmployeePayRate(selectedId, c.id, value);
        clearDraft(keyFor(selectedId, c.id));
      }
      setFillAll('');
      showToast(`Set $${value.toFixed(2)}/hr for all ${categories.length} categories`, 'success');
    } catch (error: any) {
      showToast(error?.message || 'Could not save those rates', 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  /** Copy another person's rates onto the selected person, category by category. */
  const copyRates = async () => {
    if (!selectedId || !copyFrom) return;
    const pairs = categories
      .map(c => [c.id, getEmployeePayRate(copyFrom, c.id)] as const)
      .filter((p): p is readonly [string, number] => p[1] !== undefined);
    if (pairs.length === 0) {
      showToast(`${nameOf(copyFrom)} has no rates set yet`, 'error');
      return;
    }
    setBulkBusy(true);
    try {
      for (const [categoryId, rate] of pairs) {
        await setEmployeePayRate(selectedId, categoryId, rate);
        clearDraft(keyFor(selectedId, categoryId));
      }
      setCopyFrom('');
      showToast(`Copied ${pairs.length} rate${pairs.length === 1 ? '' : 's'} from ${nameOf(copyFrom)}`, 'success');
    } catch (error: any) {
      showToast(error?.message || 'Could not copy those rates', 'error');
    } finally {
      setBulkBusy(false);
    }
  };

  const rateInput = (employeeId: string, categoryId: string) => {
    const k = keyFor(employeeId, categoryId);
    const stored = getEmployeePayRate(employeeId, categoryId);
    const isDraft = draft[k] !== undefined;
    const value = isDraft ? draft[k] : (stored !== undefined ? String(stored.toFixed(2)) : '');
    const unset = stored === undefined && !isDraft;
    const busy = savingKey === k || bulkBusy;

    return (
      <div style={{ position: 'relative', width: '100%' }}>
        <span style={{
          position: 'absolute',
          left: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '15px',
          color: unset ? theme.colors.txt.tertiary : theme.colors.txt.secondary,
          fontFamily: theme.fonts.mono,
          pointerEvents: 'none',
        }}>
          $
        </span>
        <input
          id={`rate-${employeeId}-${categoryId}`}
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          placeholder="not set"
          value={value}
          disabled={busy}
          onChange={e => setDraft(prev => ({ ...prev, [k]: e.target.value }))}
          onBlur={e => commit(employeeId, categoryId, e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              clearDraft(k);
              (e.target as HTMLInputElement).blur();
            }
          }}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px 12px 10px 26px',
            fontSize: '16px',
            fontFamily: theme.fonts.mono,
            backgroundColor: theme.colors.bg.tertiary,
            color: theme.colors.txt.primary,
            border: `1px solid ${isDraft ? theme.colors.primary : theme.colors.bdr.primary}`,
            borderRadius: theme.borderRadius.sm,
            outline: 'none',
            opacity: busy ? 0.5 : 1,
          }}
        />
      </div>
    );
  };

  const ratesSet = employeePayRates.filter(r =>
    employees.some(u => u.id === r.employeeId) && categories.some(c => c.id === r.categoryId)
  ).length;
  const totalCells = employees.length * categories.length;

  const selected = employees.find(u => u.id === selectedId) ?? null;
  const selectedSetCount = selected ? setCountFor(selected.id) : 0;

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: theme.colors.txt.tertiary,
    fontFamily: theme.fonts.mono,
  };

  const countBadge = (count: number) => (
    <Badge
      size="sm"
      variant={count === 0 ? 'warning' : count === categories.length ? 'success' : 'default'}
    >
      {count === 0 ? 'Not set' : `${count}/${categories.length}`}
    </Badge>
  );

  // Left column on desktop; a dropdown on a phone, where a second column
  // would leave the rate boxes too narrow to read.
  const employeePicker = isMobileOrTablet ? (
    <Select
      label="Employee"
      fullWidth
      value={selectedId ?? ''}
      onChange={e => setSelectedId(e.target.value)}
      options={employees.map(u => {
        const n = setCountFor(u.id);
        return {
          value: u.id,
          label: `${u.firstName} ${u.lastName} — ${n === 0 ? 'not set' : `${n}/${categories.length} set`}`,
        };
      })}
    />
  ) : (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      height: '100%',
      borderRight: `1px solid ${theme.colors.bdr.primary}`,
      paddingRight: theme.spacing.md,
    }}>
      <SearchInput
        size="sm"
        placeholder="Find a person"
        value={search}
        onChange={e => setSearch(e.target.value)}
        onClear={() => setSearch('')}
      />
      <div
        role="listbox"
        aria-label="Employees"
        // scroll-visible keeps the bar on screen so it is obvious the list
        // continues past the bottom (macOS hides overlay scrollbars at rest).
        className="scroll-visible"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          marginTop: theme.spacing.sm,
          paddingRight: theme.spacing.xs,
        }}
      >
        {filteredEmployees.length === 0 && (
          <div style={{ padding: theme.spacing.sm, fontSize: '13px', color: theme.colors.txt.tertiary }}>
            No one matches “{search}”.
          </div>
        )}
        {filteredEmployees.map(u => {
          const active = u.id === selectedId;
          return (
            <button
              key={u.id}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => setSelectedId(u.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: theme.spacing.sm,
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                marginBottom: '2px',
                cursor: 'pointer',
                fontSize: '14px',
                fontFamily: theme.fonts.primary,
                color: theme.colors.txt.primary,
                backgroundColor: active ? theme.colors.bg.tertiary : 'transparent',
                border: `1px solid ${active ? theme.colors.primary : 'transparent'}`,
                borderRadius: theme.borderRadius.md,
              }}
            >
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {u.firstName} {u.lastName}
              </span>
              {countBadge(setCountFor(u.id))}
            </button>
          );
        })}
      </div>
    </div>
  );

  const editor = selected && (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        flexWrap: 'wrap',
        marginBottom: theme.spacing.md,
      }}>
        <div style={{
          fontSize: '18px',
          fontWeight: 600,
          color: theme.colors.txt.primary,
          fontFamily: theme.fonts.primary,
          minWidth: 0,
          overflowWrap: 'anywhere',
        }}>
          {selected.firstName} {selected.lastName}
        </div>
        <span style={{ fontSize: '13px', color: theme.colors.txt.tertiary, fontFamily: theme.fonts.primary }}>
          {selectedSetCount} of {categories.length} rates set
        </span>
      </div>

      {/* Quick actions. Each one is label-above-controls so it wraps to its
          own line on a phone instead of running off the right edge. */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: theme.spacing.md,
        padding: theme.spacing.sm,
        marginBottom: theme.spacing.md,
        backgroundColor: theme.colors.bg.tertiary,
        borderRadius: theme.borderRadius.md,
      }}>
        <div style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
          <span style={labelStyle}>Same rate for every category</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs, minWidth: 0 }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <span style={{
                position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)',
                fontSize: '13px', color: theme.colors.txt.tertiary, fontFamily: theme.fonts.mono, pointerEvents: 'none',
              }}>$</span>
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                aria-label="Rate for all categories"
                placeholder="0.00"
                value={fillAll}
                disabled={bulkBusy}
                onChange={e => setFillAll(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') applyToAll(); }}
                style={{
                  width: '100%',
                  minWidth: 0,
                  boxSizing: 'border-box',
                  padding: '8px 8px 8px 22px',
                  fontSize: '14px',
                  fontFamily: theme.fonts.mono,
                  backgroundColor: theme.colors.bg.secondary,
                  color: theme.colors.txt.primary,
                  border: `1px solid ${theme.colors.bdr.primary}`,
                  borderRadius: theme.borderRadius.sm,
                  outline: 'none',
                }}
              />
            </div>
            <Button size="sm" variant="outline" onClick={applyToAll} disabled={bulkBusy || fillAll.trim() === ''}>
              Apply
            </Button>
          </div>
        </div>

        <div style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
          <span style={labelStyle}>Copy another person's rates</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs, minWidth: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Select
                size="sm"
                fullWidth
                aria-label="Copy rates from"
                placeholder="Choose a person"
                value={copyFrom}
                disabled={bulkBusy}
                onChange={e => setCopyFrom(e.target.value)}
                options={employees
                  .filter(u => u.id !== selected.id && setCountFor(u.id) > 0)
                  .map(u => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))}
              />
            </div>
            <Button size="sm" variant="outline" onClick={copyRates} disabled={bulkBusy || !copyFrom}>
              Copy
            </Button>
          </div>
        </div>
      </div>

      {/* One row per category */}
      <div className="scroll-visible" style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: theme.spacing.xs }}>
        {categories.map(c => (
          <div
            key={c.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.md,
              padding: `${theme.spacing.sm} 0`,
              borderBottom: `1px solid ${theme.colors.bdr.primary}`,
            }}
          >
            <label
              htmlFor={`rate-${selected.id}-${c.id}`}
              style={{
                flex: '1 1 0',
                minWidth: 0,
                fontSize: '15px',
                color: theme.colors.txt.primary,
                fontFamily: theme.fonts.primary,
                overflowWrap: 'anywhere',
              }}
            >
              {c.name}
            </label>
            <div style={{ flex: '0 0 150px', maxWidth: '45%' }}>
              {rateInput(selected.id, c.id)}
            </div>
          </div>
        ))}
        <div style={{ ...labelStyle, textTransform: 'none', letterSpacing: 0, fontFamily: theme.fonts.primary, fontSize: '12px', marginTop: theme.spacing.sm }}>
          Rates save on their own when you leave a box. Enter also saves; Escape puts the old value back.
        </div>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Pay rates"
      size="xl"
      footer={<Button variant="secondary" onClick={onClose}>Done</Button>}
    >
      <p style={{
        fontSize: '13px',
        color: theme.colors.txt.tertiary,
        fontFamily: theme.fonts.primary,
        marginTop: 0,
      }}>
        What each person earns per hour, per category. Only admins can see or
        change this — employees never see rates or dollar amounts anywhere in
        the app. A rate is locked onto an entry when you approve it, so
        changing a rate here never re-prices hours you have already approved.
      </p>

      {totalCells > 0 && ratesSet < totalCells && (
        <div style={{
          padding: theme.spacing.sm,
          marginBottom: theme.spacing.md,
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${theme.colors.status.warning}`,
          color: theme.colors.status.warning,
          fontSize: '13px',
          fontFamily: theme.fonts.primary,
        }}>
          {totalCells - ratesSet} of {totalCells} rates are not set. Hours logged
          against those pay <strong>$0.00</strong>.
        </div>
      )}

      {employees.length === 0 || categories.length === 0 ? (
        <EmptyState
          title={categories.length === 0 ? 'No categories yet' : 'No employees yet'}
          description={
            categories.length === 0
              ? 'Add work categories first — rates attach to them.'
              : 'Add team members under Admin → Team.'
          }
        />
      ) : isMobileOrTablet ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          {employeePicker}
          {editor}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '240px minmax(0, 1fr)',
          gap: theme.spacing.md,
          // Fixed height so the person list and the rate list scroll on
          // their own instead of pushing the Done button off screen.
          height: 'min(58dvh, 560px)',
          minHeight: 0,
        }}>
          {employeePicker}
          {editor}
        </div>
      )}
    </Modal>
  );
};

export default PayRatesManager;
