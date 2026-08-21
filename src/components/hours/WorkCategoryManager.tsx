import React, { useState } from 'react';
import { WorkCategory } from '../../types';
import { theme } from '../../theme';
import { useWorkHours } from '../../contexts/WorkHoursContext';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../hooks/useConfirm';
import { Modal, Button, Input, EmptyState } from '../ui';

interface WorkCategoryManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Admin-only editor for the list behind "What did you work on?".
 *
 * Retiring a category (is_active = false) rather than deleting it is
 * deliberate: hours already logged against it keep their label, so past
 * payroll stays readable. Retired categories disappear from the employee
 * dropdown but still render on historical entries.
 */
const WorkCategoryManager: React.FC<WorkCategoryManagerProps> = ({ isOpen, onClose }) => {
  const { workCategories, addWorkCategory, updateWorkCategory, deleteWorkCategory } = useWorkHours();
  const { showToast } = useToast();
  const { confirm, confirmDialog } = useConfirm();

  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const active = workCategories.filter(c => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const retired = workCategories.filter(c => !c.isActive).sort((a, b) => a.sortOrder - b.sortOrder);

  const handleAdd = async () => {
    if (!newName.trim() || busy) return;
    setBusy(true);
    try {
      await addWorkCategory(newName);
      setNewName('');
      showToast('Category added', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Could not add category', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (category: WorkCategory) => {
    const name = editingName.trim();
    if (!name || name === category.name) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    try {
      await updateWorkCategory(category.id, { name });
      showToast('Category renamed', 'success');
      setEditingId(null);
    } catch (error: any) {
      showToast(error?.message || 'Could not rename category', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRetire = async (category: WorkCategory) => {
    const confirmed = await confirm({
      title: `Retire "${category.name}"?`,
      message:
        'It will stop appearing in the dropdown for new entries. Hours already logged against it keep the label.',
      confirmLabel: 'Retire',
      variant: 'warning',
    });
    if (!confirmed) return;

    setBusy(true);
    try {
      await deleteWorkCategory(category.id);
      showToast('Category retired', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Could not retire category', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (category: WorkCategory) => {
    setBusy(true);
    try {
      await updateWorkCategory(category.id, { isActive: true });
      showToast('Category restored', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Could not restore category', 'error');
    } finally {
      setBusy(false);
    }
  };

  const move = async (category: WorkCategory, direction: -1 | 1) => {
    const index = active.findIndex(c => c.id === category.id);
    const swapWith = active[index + direction];
    if (!swapWith) return;

    // Guard against a pair that already shares a sort_order (possible if an
    // earlier swap half-failed). Swapping equal values is a no-op the user
    // cannot distinguish from a frozen UI, so renumber instead.
    if (category.sortOrder === swapWith.sortOrder) {
      setBusy(true);
      try {
        await renumberAll();
      } catch (error: any) {
        showToast(error?.message || 'Could not reorder', 'error');
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    const originalSort = category.sortOrder;
    let firstWriteLanded = false;
    try {
      // Two round-trips with no transaction between them. If the second
      // fails we undo the first, otherwise both rows end up holding
      // swapWith's value and the pair is stuck.
      await updateWorkCategory(category.id, { sortOrder: swapWith.sortOrder });
      firstWriteLanded = true;
      await updateWorkCategory(swapWith.id, { sortOrder: originalSort });
    } catch (error: any) {
      if (firstWriteLanded) {
        try {
          await updateWorkCategory(category.id, { sortOrder: originalSort });
        } catch {
          // Compensation failed too — renumbering on the next move will
          // recover, and the toast below tells the user to retry.
        }
      }
      showToast(error?.message || 'Could not reorder', 'error');
    } finally {
      setBusy(false);
    }
  };

  /** Rewrite every active category's sort_order as 10, 20, 30… */
  const renumberAll = async () => {
    for (let i = 0; i < active.length; i += 1) {
      const want = (i + 1) * 10;
      if (active[i].sortOrder !== want) {
        await updateWorkCategory(active[i].id, { sortOrder: want });
      }
    }
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: `${theme.spacing.sm} 0`,
    borderTop: `1px solid ${theme.colors.bdr.primary}`,
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Work categories"
        size="md"
        footer={<Button variant="secondary" onClick={onClose}>Done</Button>}
      >
        <p style={{
          fontSize: '13px',
          color: theme.colors.txt.tertiary,
          fontFamily: theme.fonts.primary,
          marginTop: 0,
        }}>
          These are the options employees pick from when logging hours. Order here
          is the order they appear in the dropdown.
        </p>

        {/* ---- Add ---- */}
        <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'flex-end', marginBottom: theme.spacing.md }}>
          <div style={{ flex: 1 }}>
            <Input
              label="Add a category"
              placeholder="e.g. Install, Shop time, Travel"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            />
          </div>
          <Button variant="primary" onClick={handleAdd} disabled={busy || !newName.trim()}>
            Add
          </Button>
        </div>

        {/* ---- Active ---- */}
        {active.length === 0 ? (
          <EmptyState
            title="No categories yet"
            description="Add your first one above — for example Normal Rate, Install, or Admin."
          />
        ) : (
          <div>
            {active.map((category, i) => (
              <div key={category.id} style={rowStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <button
                    type="button"
                    aria-label={`Move ${category.name} up`}
                    onClick={() => move(category, -1)}
                    disabled={busy || i === 0}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: i === 0 ? 'default' : 'pointer',
                      color: i === 0 ? theme.colors.txt.tertiary : theme.colors.txt.secondary,
                      opacity: i === 0 ? 0.4 : 1,
                      fontSize: '11px',
                      lineHeight: 1,
                      padding: '2px',
                    }}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${category.name} down`}
                    onClick={() => move(category, 1)}
                    disabled={busy || i === active.length - 1}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: i === active.length - 1 ? 'default' : 'pointer',
                      color: i === active.length - 1 ? theme.colors.txt.tertiary : theme.colors.txt.secondary,
                      opacity: i === active.length - 1 ? 0.4 : 1,
                      fontSize: '11px',
                      lineHeight: 1,
                      padding: '2px',
                    }}
                  >
                    ▼
                  </button>
                </div>

                {editingId === category.id ? (
                  <>
                    <div style={{ flex: 1 }}>
                      <Input
                        value={editingName}
                        autoFocus
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleRename(category);
                          }
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                    </div>
                    <Button size="sm" variant="primary" onClick={() => handleRename(category)} disabled={busy}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <span style={{
                      flex: 1,
                      fontSize: '15px',
                      color: theme.colors.txt.primary,
                      fontFamily: theme.fonts.primary,
                      wordBreak: 'break-word',
                    }}>
                      {category.name}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(category.id);
                        setEditingName(category.name);
                      }}
                    >
                      Rename
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleRetire(category)} disabled={busy}>
                      Retire
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ---- Retired ---- */}
        {retired.length > 0 && (
          <div style={{ marginTop: theme.spacing.lg }}>
            <div style={{
              fontSize: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: theme.colors.txt.tertiary,
              fontFamily: theme.fonts.mono,
              marginBottom: theme.spacing.xs,
            }}>
              Retired
            </div>
            {retired.map(category => (
              <div key={category.id} style={rowStyle}>
                <span style={{
                  flex: 1,
                  fontSize: '14px',
                  color: theme.colors.txt.tertiary,
                  fontFamily: theme.fonts.primary,
                  textDecoration: 'line-through',
                }}>
                  {category.name}
                </span>
                <Button size="sm" variant="ghost" onClick={() => handleRestore(category)} disabled={busy}>
                  Restore
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>
      {confirmDialog}
    </>
  );
};

export default WorkCategoryManager;
