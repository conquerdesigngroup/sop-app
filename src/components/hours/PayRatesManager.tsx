import React, { useMemo, useState } from 'react';
import { theme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkHours } from '../../contexts/WorkHoursContext';
import { useToast } from '../../contexts/ToastContext';
import { useResponsive } from '../../hooks/useResponsive';
import { Modal, Button, EmptyState } from '../ui';

interface PayRatesManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Admin-only editor for what each employee earns per hour in each category.
 *
 * A grid of employee × category. Rates are enforced admin-only by RLS
 * (migration v7 §11) — this component being admin-gated is convenience, not
 * the security boundary.
 *
 * A blank cell means no rate is configured, which pays 0.00. The cell is
 * marked rather than shown as "0" so a rate you have not set yet is
 * distinguishable from one you deliberately set to zero.
 */
const PayRatesManager: React.FC<PayRatesManagerProps> = ({ isOpen, onClose }) => {
  const { users } = useAuth();
  const { workCategories, employeePayRates, setEmployeePayRate, getEmployeePayRate } = useWorkHours();
  const { showToast } = useToast();
  const { isMobileOrTablet } = useResponsive();

  // Cell currently being typed into, keyed `${employeeId}:${categoryId}`.
  // Held separately so a half-typed "4" is not committed as $4/hr.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

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

  const keyFor = (employeeId: string, categoryId: string) => `${employeeId}:${categoryId}`;

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
      setDraft(prev => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
      return;
    }

    const value = Number(trimmed);
    if (!Number.isFinite(value) || value < 0) {
      showToast('Enter a rate of 0 or more', 'error');
      return;
    }
    if (existing !== undefined && Math.round(value * 100) === Math.round(existing * 100)) {
      // Unchanged — skip the round-trip.
      setDraft(prev => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
      return;
    }

    setSavingKey(k);
    try {
      await setEmployeePayRate(employeeId, categoryId, value);
      setDraft(prev => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
    } catch (error: any) {
      showToast(error?.message || 'Could not save this rate', 'error');
    } finally {
      setSavingKey(null);
    }
  };

  const rateCell = (employeeId: string, categoryId: string) => {
    const k = keyFor(employeeId, categoryId);
    const stored = getEmployeePayRate(employeeId, categoryId);
    const isDraft = draft[k] !== undefined;
    const value = isDraft ? draft[k] : (stored !== undefined ? String(stored.toFixed(2)) : '');
    const unset = stored === undefined && !isDraft;

    return (
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <span style={{
          position: 'absolute',
          left: '10px',
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '13px',
          color: unset ? theme.colors.txt.tertiary : theme.colors.txt.secondary,
          fontFamily: theme.fonts.mono,
          pointerEvents: 'none',
        }}>
          $
        </span>
        <input
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          placeholder="—"
          value={value}
          disabled={savingKey === k}
          onChange={e => setDraft(prev => ({ ...prev, [k]: e.target.value }))}
          onBlur={e => commit(employeeId, categoryId, e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setDraft(prev => {
                const next = { ...prev };
                delete next[k];
                return next;
              });
              (e.target as HTMLInputElement).blur();
            }
          }}
          style={{
            width: '100%',
            padding: '8px 8px 8px 22px',
            fontSize: '14px',
            fontFamily: theme.fonts.mono,
            backgroundColor: theme.colors.bg.tertiary,
            color: theme.colors.txt.primary,
            border: `1px solid ${isDraft ? theme.colors.primary : theme.colors.bdr.primary}`,
            borderRadius: theme.borderRadius.sm,
            outline: 'none',
            opacity: savingKey === k ? 0.5 : 1,
          }}
        />
      </div>
    );
  };

  const ratesSet = employeePayRates.length;
  const totalCells = employees.length * categories.length;

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
        // Stacked: a grid this wide is unusable on a phone.
        employees.map(u => (
          <div key={u.id} style={{
            paddingBottom: theme.spacing.md,
            marginBottom: theme.spacing.md,
            borderBottom: `1px solid ${theme.colors.bdr.primary}`,
          }}>
            <div style={{
              fontSize: '15px',
              fontWeight: 600,
              color: theme.colors.txt.primary,
              fontFamily: theme.fonts.primary,
              marginBottom: theme.spacing.sm,
            }}>
              {u.firstName} {u.lastName}
            </div>
            {categories.map(c => (
              <div key={c.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.sm,
                marginBottom: theme.spacing.xs,
              }}>
                <span style={{
                  flex: 1,
                  fontSize: '13px',
                  color: theme.colors.txt.secondary,
                  fontFamily: theme.fonts.primary,
                }}>
                  {c.name}
                </span>
                <div style={{ width: '110px' }}>{rateCell(u.id, c.id)}</div>
              </div>
            ))}
          </div>
        ))
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: `${180 + categories.length * 120}px` }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              gap: theme.spacing.sm,
              paddingBottom: theme.spacing.xs,
              borderBottom: `1px solid ${theme.colors.bdr.primary}`,
            }}>
              <div style={{
                width: '180px',
                flexShrink: 0,
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: theme.colors.txt.tertiary,
                fontFamily: theme.fonts.mono,
              }}>
                Employee
              </div>
              {categories.map(c => (
                <div key={c.id} style={{
                  flex: 1,
                  minWidth: '110px',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: theme.colors.txt.tertiary,
                  fontFamily: theme.fonts.mono,
                }}>
                  {c.name}
                </div>
              ))}
            </div>

            {/* Rows */}
            {employees.map(u => (
              <div key={u.id} style={{
                display: 'flex',
                gap: theme.spacing.sm,
                alignItems: 'center',
                padding: `${theme.spacing.sm} 0`,
                borderBottom: `1px solid ${theme.colors.bdr.primary}`,
              }}>
                <div style={{
                  width: '180px',
                  flexShrink: 0,
                  fontSize: '14px',
                  color: theme.colors.txt.primary,
                  fontFamily: theme.fonts.primary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {u.firstName} {u.lastName}
                </div>
                {categories.map(c => (
                  <div key={c.id} style={{ flex: 1, minWidth: '110px', display: 'flex' }}>
                    {rateCell(u.id, c.id)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default PayRatesManager;
