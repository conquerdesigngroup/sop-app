import React, { useEffect, useState } from 'react';
import { theme } from '../../theme';
import { Button, Card, Input, Modal, Select, Textarea, Badge, Divider, PlusIcon } from '../ui';
import { CustomCheckbox } from '../CustomCheckbox';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../hooks/useConfirm';
import { useResponsive } from '../../hooks/useResponsive';
import { useAuth } from '../../contexts/AuthContext';
import { usePortalAdmin, describeWriteError, ClassInput } from '../../contexts/PortalAdminContext';
import { PortalClass, PortalProgram } from '../../types';
import { DAY_OPTIONS, timeColumnToInput, timeInputToColumn } from '../../lib/portalAdmin';
import { ManagerList, RowActions, RowMeta, classSummary, FieldPair, useAutoFocus } from './shared';

/**
 * The class list, and who may publish to each one.
 *
 * ADMIN-ONLY, AND NOT BY CONVENTION
 *
 * portal_classes_write is FOR ALL USING is_admin(), so a teacher's save is
 * refused by Postgres regardless of what this component renders. They still get
 * the list — read-only — because it is the only place to see which classes they
 * hold.
 *
 * TWO DIFFERENT PEOPLE
 *
 * instructor_name is a display string ("Miss Sarah") shown to parents.
 * portal_class_instructors is a set of profile ids that decides who may post.
 * v9 kept them apart on purpose: the teacher listed on the schedule and the
 * account allowed to publish are not always the same, and conflating them would
 * mean either granting write access by typing a name or exposing account
 * details to parents.
 */

const emptyDraft = (programId: string, sortOrder: number): ClassInput => ({
  programId,
  name: '',
  dayOfWeek: null,
  startTime: null,
  endTime: null,
  level: '',
  location: '',
  description: '',
  instructorName: '',
  sortOrder,
  isActive: true,
});

const toDraft = (c: PortalClass): ClassInput => ({
  id: c.id,
  programId: c.programId,
  name: c.name,
  dayOfWeek: c.dayOfWeek,
  startTime: c.startTime,
  endTime: c.endTime,
  level: c.level ?? '',
  location: c.location ?? '',
  description: c.description,
  instructorName: c.instructorName ?? '',
  sortOrder: c.sortOrder,
  isActive: c.isActive,
});

const ClassesSection: React.FC<{
  program: PortalProgram;
  classes: PortalClass[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}> = ({ program, classes, loading, error, reload }) => {
  const {
    saveClass, deleteClass, fetchClassInstructors, setClassInstructors, editableClassIds,
  } = usePortalAdmin();
  const { isAdmin, users } = useAuth();
  const { success, error: toastError } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const { isMobileOrTablet } = useResponsive();

  const [draft, setDraft] = useState<ClassInput | null>(null);
  const [instructorIds, setInstructorIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const focusRef = useAutoFocus(draft !== null);

  const staff = users.filter(u => u.isActive !== false);

  // Existing grants for the class being edited. A new class starts with none.
  useEffect(() => {
    if (!draft?.id) {
      setInstructorIds([]);
      return;
    }
    let cancelled = false;
    fetchClassInstructors(draft.id)
      .then(ids => { if (!cancelled) setInstructorIds(ids); })
      .catch(e => console.error('Could not load class instructors:', e));
    return () => { cancelled = true; };
  }, [draft?.id, fetchClassInstructors]);

  const startNew = () => {
    setFormError('');
    setDraft(emptyDraft(program.id, classes.length + 1));
  };

  const handleSave = async () => {
    if (!draft) return;

    if (!draft.name.trim()) {
      setFormError('Give the class a name.');
      return;
    }
    if (draft.startTime && draft.endTime && draft.endTime <= draft.startTime) {
      setFormError('The class ends before it starts.');
      return;
    }

    setSaving(true);
    try {
      const classId = await saveClass({
        ...draft,
        level: draft.level?.trim() || null,
        location: draft.location?.trim() || null,
        instructorName: draft.instructorName?.trim() || null,
      });
      await setClassInstructors(classId, instructorIds);
      success(draft.id ? 'Class updated.' : 'Class added.');
      setDraft(null);
      reload();
    } catch (e) {
      setFormError(describeWriteError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: PortalClass) => {
    const ok = await confirm({
      title: `Delete ${c.name}?`,
      message:
        'Updates and files posted to this class are deleted with it, and calendar events lose their class. ' +
        'To take a class off the schedule without losing any of that, edit it and untick "Show on the schedule" instead.',
      confirmLabel: 'Delete anyway',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      await deleteClass(c.id);
      success('Class deleted.');
      reload();
    } catch (e) {
      toastError(describeWriteError(e));
    }
  };

  const toggleInstructor = (profileId: string, on: boolean) =>
    setInstructorIds(prev => on ? [...prev, profileId] : prev.filter(id => id !== profileId));

  return (
    <>
      {isAdmin ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
          <Button leftIcon={<PlusIcon />} onClick={startNew}>New class</Button>
        </div>
      ) : (
        <p style={{
          ...theme.typography.bodySmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.tertiary,
          margin: '0 0 16px',
        }}>
          Classes are managed by an admin. Yours are marked below — those are the ones you can
          post updates, files and events to.
        </p>
      )}

      <ManagerList
        loading={loading}
        error={error}
        isEmpty={classes.length === 0}
        emptyTitle="No classes yet"
        emptyDescription="Add the class list and it becomes the schedule parents see."
        emptyAction={isAdmin ? <Button leftIcon={<PlusIcon />} onClick={startNew}>New class</Button> : undefined}
      >
        {classes.map(c => (
          <Card key={c.id} style={c.isActive ? undefined : { opacity: 0.6 }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                  {!c.isActive && <Badge variant="default" size="sm">Hidden</Badge>}
                  {editableClassIds.includes(c.id) && <Badge variant="info" size="sm">Yours</Badge>}
                </div>

                <h3 style={{
                  ...theme.typography.h3,
                  color: theme.colors.txt.primary,
                  margin: '0 0 6px',
                  wordBreak: 'break-word',
                }}>
                  {c.name}
                </h3>

                <RowMeta>
                  <span>{classSummary(c)}</span>
                  {c.location && <span>· {c.location}</span>}
                  {c.instructorName && <span>· {c.instructorName}</span>}
                </RowMeta>
              </div>

              {isAdmin && (
                <RowActions
                  onEdit={() => { setFormError(''); setDraft(toDraft(c)); }}
                  onDelete={() => handleDelete(c)}
                  editLabel={`Edit ${c.name}`}
                  deleteLabel={`Delete ${c.name}`}
                />
              )}
            </div>
          </Card>
        ))}
      </ManagerList>

      <Modal
        isOpen={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit class' : 'New class'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>Save</Button>
          </>
        }
      >
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Input
              ref={focusRef}
              label="Class name"
              value={draft.name}
              placeholder="Senior Elite Jazz"
              onChange={e => setDraft({ ...draft, name: e.target.value })}
            />

            <Select
              label="Day"
              options={DAY_OPTIONS}
              value={draft.dayOfWeek === null ? '' : String(draft.dayOfWeek)}
              onChange={e => setDraft({
                ...draft,
                dayOfWeek: e.target.value === '' ? null : Number(e.target.value),
              })}
            />

            <FieldPair stack={isMobileOrTablet}>
              <Input
                label="Starts"
                type="time"
                value={timeColumnToInput(draft.startTime)}
                onChange={e => setDraft({ ...draft, startTime: timeInputToColumn(e.target.value) })}
              />
              <Input
                label="Ends"
                type="time"
                value={timeColumnToInput(draft.endTime)}
                onChange={e => setDraft({ ...draft, endTime: timeInputToColumn(e.target.value) })}
              />
            </FieldPair>

            <p style={{
              ...theme.typography.captionSmall,
              fontFamily: theme.fonts.mono,
              color: theme.colors.txt.tertiary,
              margin: '-8px 0 0',
            }}>
              Studio time. Class times have no timezone and are shown exactly as typed.
            </p>

            <FieldPair stack={isMobileOrTablet}>
              <Input
                label="Level (optional)"
                value={draft.level ?? ''}
                placeholder="Senior"
                onChange={e => setDraft({ ...draft, level: e.target.value })}
              />
              <Input
                label="Room (optional)"
                value={draft.location ?? ''}
                placeholder="Studio A"
                onChange={e => setDraft({ ...draft, location: e.target.value })}
              />
            </FieldPair>

            <Input
              label="Teacher shown to parents (optional)"
              value={draft.instructorName ?? ''}
              placeholder="Miss Sarah"
              helperText="A display name only. Posting rights are set below."
              onChange={e => setDraft({ ...draft, instructorName: e.target.value })}
            />

            <Textarea
              label="Description (optional)"
              value={draft.description}
              placeholder="Jazz shoes and a water bottle every week."
              onChange={e => setDraft({ ...draft, description: e.target.value })}
            />

            <FieldPair stack={isMobileOrTablet}>
              <Input
                label="Order in the list"
                type="number"
                value={String(draft.sortOrder)}
                onChange={e => setDraft({ ...draft, sortOrder: Number(e.target.value) || 0 })}
              />
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '10px' }}>
                <CustomCheckbox
                  checked={draft.isActive}
                  onChange={isActive => setDraft({ ...draft, isActive })}
                  label="Show on the schedule"
                />
              </div>
            </FieldPair>

            <Divider margin="sm" />

            <div>
              <h4 style={{
                ...theme.typography.caption,
                fontFamily: theme.fonts.primary,
                color: theme.colors.txt.secondary,
                margin: '0 0 4px',
              }}>
                Who can post to this class
              </h4>
              <p style={{
                ...theme.typography.captionSmall,
                fontFamily: theme.fonts.primary,
                color: theme.colors.txt.tertiary,
                margin: '0 0 12px',
              }}>
                These employees can publish updates, files and events to this class and nothing
                else. Admins can already post everywhere.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {staff.map(u => (
                  <CustomCheckbox
                    key={u.id}
                    checked={instructorIds.includes(u.id)}
                    onChange={on => toggleInstructor(u.id, on)}
                    label={`${u.firstName} ${u.lastName}${u.role === 'admin' ? ' — admin' : ''}`}
                  />
                ))}
              </div>
            </div>

            {formError && (
              <p style={{
                ...theme.typography.bodySmall,
                fontFamily: theme.fonts.primary,
                color: theme.colors.status.error,
                margin: 0,
              }}>
                {formError}
              </p>
            )}
          </div>
        )}
      </Modal>

      {confirmDialog}
    </>
  );
};

export default ClassesSection;
