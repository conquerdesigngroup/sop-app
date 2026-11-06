import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Button, Textarea, Input, SearchInput } from '../ui';
import StaffAvatar from '../StaffAvatar';
import { theme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { User } from '../../types';
import { studioToday } from '../../lib/studioDate';
import {
  MAX_REPORT_LENGTH,
  ShiftReport,
  ShiftType,
  SHIFT_TYPE_LABEL,
  guessShiftType,
} from '../../lib/shiftReports';

export interface ShiftReportFormValues {
  shiftType: ShiftType;
  shiftDate: string;
  body: string;
  tagUserIds: string[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Present when editing; absent for "Create new report". */
  report?: ShiftReport | null;
  onSubmit: (values: ShiftReportFormValues) => Promise<void>;
}

/** Active staff, excluding parents and anyone switched off, by name. */
export const taggableStaff = (users: User[], excludeId?: string): User[] =>
  users
    .filter(u => u.isActive !== false && u.role !== 'client' && u.id !== excludeId)
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

const ShiftReportForm: React.FC<Props> = ({ isOpen, onClose, report, onSubmit }) => {
  const { users, currentUser } = useAuth();
  const [shiftType, setShiftType] = useState<ShiftType>(guessShiftType());
  const [shiftDate, setShiftDate] = useState(studioToday());
  const [body, setBody] = useState('');
  const [tagged, setTagged] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    setShiftType(report?.shiftType ?? guessShiftType());
    setShiftDate(report?.shiftDate ?? studioToday());
    setBody(report?.body ?? '');
    setTagged(report?.tags.map(t => t.userId) ?? []);
    setTagSearch('');
    setError(null);
  }, [isOpen, report]);

  const staff = useMemo(() => taggableStaff(users, report?.authorId ?? currentUser?.id), [users, report, currentUser]);
  const shown = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter(u => `${u.firstName} ${u.lastName}`.toLowerCase().includes(q));
  }, [staff, tagSearch]);

  const toggleTag = (id: string) =>
    setTagged(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const handleSubmit = async () => {
    if (busy.current) return;
    if (!body.trim()) {
      setError('Write something in the report before saving.');
      return;
    }
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ shiftType, shiftDate, body, tagUserIds: tagged });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn\'t save the report. Check your connection and try again.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const typeButton = (type: ShiftType) => {
    const active = shiftType === type;
    return (
      <button
        key={type}
        type="button"
        role="radio"
        aria-checked={active}
        onClick={() => setShiftType(type)}
        disabled={saving}
        style={{
          flex: '1 1 0',
          minWidth: 0,
          padding: '12px 8px',
          borderRadius: theme.borderRadius.md,
          border: `2px solid ${active ? theme.colors.primary : theme.colors.bdr.primary}`,
          backgroundColor: active ? theme.colors.primary : theme.colors.bg.tertiary,
          color: active ? '#FFFFFF' : theme.colors.txt.primary,
          fontFamily: theme.fonts.primary,
          fontSize: '15px',
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2px',
        }}
      >
        <span>{SHIFT_TYPE_LABEL[type]} shift</span>
        <span style={{ fontSize: '12px', fontWeight: 500, opacity: 0.85 }}>
          {type === 'opening' ? 'Start of my shift' : 'End of my shift'}
        </span>
      </button>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? () => {} : onClose}
      title={report ? 'Edit report' : 'New shift report'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} loading={saving} disabled={saving}>
            {saving ? 'Saving…' : report ? 'Save changes' : 'Post report'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
        <div>
          <div id="shift-type-label" style={labelStyle}>Which report is this?</div>
          <div role="radiogroup" aria-labelledby="shift-type-label" style={{ display: 'flex', gap: theme.spacing.sm }}>
            {typeButton('opening')}
            {typeButton('closing')}
          </div>
        </div>

        <Input
          type="date"
          label="Shift date"
          value={shiftDate}
          onChange={e => setShiftDate(e.target.value || studioToday())}
          disabled={saving}
        />

        <Textarea
          label="Report"
          placeholder="What happened on your shift? Anything the manager or the next shift needs to know…"
          value={body}
          onChange={e => setBody(e.target.value)}
          maxLength={MAX_REPORT_LENGTH}
          rows={8}
          disabled={saving}
          style={{ minHeight: '180px' }}
        />

        <div>
          <div style={labelStyle}>
            Tag team members {tagged.length > 0 && <span style={{ color: theme.colors.txt.tertiary }}>· {tagged.length} tagged</span>}
          </div>
          <p style={{ margin: '0 0 8px', fontSize: '13px', color: theme.colors.txt.tertiary }}>
            Anyone you tag sees this report on their dashboard until they open it.
          </p>
          {staff.length > 6 && (
            <div style={{ marginBottom: theme.spacing.sm }}>
              <SearchInput
                placeholder="Find someone…"
                value={tagSearch}
                onChange={e => setTagSearch(e.target.value)}
                onClear={() => setTagSearch('')}
                size="sm"
              />
            </div>
          )}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            maxHeight: '220px',
            overflowY: 'auto',
            padding: '2px',
          }}>
            {shown.map(u => {
              const on = tagged.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleTag(u.id)}
                  disabled={saving}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    maxWidth: '100%',
                    minWidth: 0,
                    padding: '4px 12px 4px 4px',
                    borderRadius: theme.borderRadius.full,
                    border: `2px solid ${on ? theme.colors.primary : theme.colors.bdr.primary}`,
                    backgroundColor: on ? theme.colors.bg.tertiary : 'transparent',
                    color: theme.colors.txt.primary,
                    fontFamily: theme.fonts.primary,
                    fontSize: '13px',
                    fontWeight: on ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  <StaffAvatar firstName={u.firstName} lastName={u.lastName} avatarPath={u.avatarPath} size={24} />
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{u.firstName} {u.lastName}</span>
                  {on && <span aria-hidden="true" style={{ color: theme.colors.primary }}>✓</span>}
                </button>
              );
            })}
            {shown.length === 0 && (
              <span style={{ fontSize: '13px', color: theme.colors.txt.tertiary }}>No one matches.</span>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" style={{ margin: 0, color: theme.colors.status.error, fontSize: '14px' }}>{error}</p>
        )}
      </div>
    </Modal>
  );
};

const labelStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: theme.colors.txt.primary,
  marginBottom: '8px',
};

export default ShiftReportForm;
