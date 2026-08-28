import React, { useEffect, useState } from 'react';
import { theme } from '../../theme';
import {
  Button, Card, Input, Modal, Select, Textarea, Badge, Divider, EmptyState,
  PlusIcon, SearchInput,
} from '../ui';
import { CustomCheckbox } from '../CustomCheckbox';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../hooks/useConfirm';
import { useResponsive } from '../../hooks/useResponsive';
import { useAuth } from '../../contexts/AuthContext';
import { usePortalAdmin, describeWriteError, ClassInput } from '../../contexts/PortalAdminContext';
import { PortalClass, PortalClassCategory, PortalProgram } from '../../types';
import { isManagementRole, roleLabel } from '../../lib/roles';
import { DAY_OPTIONS, timeColumnToInput, timeInputToColumn } from '../../lib/portalAdmin';
import { CLASS_CATEGORY_LABEL, CLASS_CATEGORY_ORDER, dayName } from '../../lib/portal';
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
 *
 * AND TWO DIFFERENT PLACES
 *
 * The same distinction runs through the program/category pair added in v25.
 * The program a class is filed under owns its updates and files and decides
 * which half of this manager lists it. Its CATEGORY decides which parent-facing
 * schedules show it — All-Stars lists all three, Academy/TNT lists two. A TNT
 * class filed under the Academy program is the normal case, not a mistake.
 */

const CATEGORY_OPTIONS = CLASS_CATEGORY_ORDER.map(value => ({
  value,
  label: CLASS_CATEGORY_LABEL[value],
}));

/**
 * A number field that keeps "cleared" distinct from zero.
 *
 * `Number('') === 0`, so the obvious `Number(e.target.value) || null` turns a
 * deleted price into a free class and a deleted capacity into a class nobody
 * may join.
 */
const numberOrNull = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
};

/**
 * A new class inherits the season of the ones already in the program.
 *
 * Retyping four date fields per class is how a schedule ends up with three
 * different season end dates and a month view that stops early for no visible
 * reason. Taken from the first existing class rather than a constant so it
 * follows the studio into next year without a code change.
 */
/**
 * One past the highest, not one past the count.
 *
 * `classes.length + 1` collides the moment anything has ever been deleted, and
 * after the v25 import the numbers are the schedule order 1..102 — so a new
 * class numbered 73 lands in the middle of Thursday evening rather than at the
 * end of the list.
 */
const nextSortOrder = (siblings: PortalClass[]): number =>
  siblings.reduce((max, c) => Math.max(max, c.sortOrder), 0) + 1;

const emptyDraft = (
  program: PortalProgram,
  sortOrder: number,
  siblings: PortalClass[]
): ClassInput => {
  const template = siblings.find(c => c.seasonStart) ?? siblings[0];
  return {
    programId: program.id,
    category: program.slug === 'allstars' ? 'allstars' : 'academy',
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
    style: '',
    ageGroup: '',
    ageMinYears: null,
    ageMaxYears: null,
    capacity: null,
    tuitionFee: null,
    season: template?.season ?? '',
    seasonStart: template?.seasonStart ?? null,
    seasonEnd: template?.seasonEnd ?? null,
  };
};

const toDraft = (c: PortalClass): ClassInput => ({
  id: c.id,
  programId: c.programId,
  category: c.category,
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
  style: c.style ?? '',
  ageGroup: c.ageGroup ?? '',
  ageMinYears: c.ageMinYears,
  ageMaxYears: c.ageMaxYears,
  capacity: c.capacity,
  tuitionFee: c.tuitionFee,
  season: c.season ?? '',
  seasonStart: c.seasonStart,
  seasonEnd: c.seasonEnd,
});

const ClassesSection: React.FC<{
  program: PortalProgram;
  classes: PortalClass[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Opens the class workspace — its files, its updates, its own audience. */
  onOpenClass?: (classId: string) => void;
}> = ({ program, classes, loading, error, reload, onOpenClass }) => {
  const {
    saveClass, deleteClass, fetchClassInstructors, setClassInstructors, editableClassIds,
  } = usePortalAdmin();
  const { isAdmin, users } = useAuth();
  const { success, error: toastError } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const { isMobileOrTablet } = useResponsive();

  const [draft, setDraft] = useState<ClassInput | null>(null);
  const [instructorIds, setInstructorIds] = useState<string[]>([]);
  /**
   * Whether the tick boxes below reflect the database yet.
   *
   * setClassInstructors treats the array it is given as the whole truth and
   * DELETEs anything missing from it. The list starts empty and arrives from an
   * async fetch, so a Save in that window — or any time after the fetch failed
   * — used to hand it `[]` and silently revoke every teacher on the class,
   * while the toast said "Class updated." An empty list and an unloaded list
   * look identical on screen; this is the flag that tells them apart.
   */
  const [grantsLoaded, setGrantsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const focusRef = useAutoFocus(draft !== null);

  const staff = users.filter(u => u.isActive !== false);

  /**
   * A search box, because this list is now 72 rows in Academy and 30 in
   * All-Stars where it used to be nine.
   *
   * Deliberately not the parent-facing filter bar. An admin arrives knowing
   * which class they want and needs to reach it in one action; browsing by
   * style and age band is the parent's job. Matching the day name as well as
   * the fields means "thursday" and "studio 3" both work, which is how
   * somebody who only knows when a class runs will look for it.
   */
  const needle = search.trim().toLowerCase();
  const visible = needle
    ? classes.filter(c =>
        [c.name, c.instructorName, c.style, c.level, c.ageGroup, c.location,
         dayName(c.dayOfWeek), CLASS_CATEGORY_LABEL[c.category]]
          .filter(Boolean).join(' ').toLowerCase().includes(needle))
    : classes;

  // Existing grants for the class being edited. A new class starts with none.
  useEffect(() => {
    if (!draft?.id) {
      // A new class genuinely has no grants, so there is nothing to wait for.
      setInstructorIds([]);
      setGrantsLoaded(true);
      return;
    }
    let cancelled = false;
    setGrantsLoaded(false);
    setInstructorIds([]);
    fetchClassInstructors(draft.id)
      .then(ids => {
        if (cancelled) return;
        setInstructorIds(ids);
        setGrantsLoaded(true);
      })
      .catch(e => {
        console.error('Could not load class instructors:', e);
        // Left false on purpose. The class record can still be saved; the grant
        // write is the part that must not run on a guess.
        if (!cancelled) {
          setFormError(
            'Could not load who can post to this class. You can still save the class — ' +
            'reopen it to change who posts.'
          );
        }
      });
    return () => { cancelled = true; };
  }, [draft?.id, fetchClassInstructors]);

  const startNew = () => {
    setFormError('');
    setDraft(emptyDraft(program, nextSortOrder(classes), classes));
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
    // Both CHECK constraints from v25, caught here so the message is a
    // sentence rather than a Postgres constraint name.
    if (draft.ageMinYears !== null && draft.ageMaxYears !== null
        && draft.ageMaxYears < draft.ageMinYears) {
      setFormError('The oldest age is younger than the youngest.');
      return;
    }
    // All three are smallint. Without this, "2.5" reaches Postgres and the
    // whole save fails — the times and description too — under the message
    // `invalid input syntax for type smallint: "2.5"`.
    const whole = [draft.ageMinYears, draft.ageMaxYears, draft.capacity];
    if (whole.some(n => n !== null && !Number.isInteger(n))) {
      setFormError('Ages and class size have to be whole numbers.');
      return;
    }
    if (whole.some(n => n !== null && (n < 0 || n > 999))) {
      setFormError('Ages and class size have to be between 0 and 999.');
      return;
    }
    if (draft.seasonStart && draft.seasonEnd && draft.seasonEnd < draft.seasonStart) {
      setFormError('The season ends before it starts.');
      return;
    }

    setSaving(true);
    try {
      const classId = await saveClass({
        ...draft,
        level: draft.level?.trim() || null,
        location: draft.location?.trim() || null,
        instructorName: draft.instructorName?.trim() || null,
        style: draft.style?.trim() || null,
        ageGroup: draft.ageGroup?.trim() || null,
        season: draft.season?.trim() || null,
      });
      // Only when the boxes are known to reflect the database. Writing an
      // unloaded list here deletes every grant on the class.
      if (grantsLoaded) await setClassInstructors(classId, instructorIds);
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
        'Info posts and files posted to this class are deleted with it, and calendar events lose their class. ' +
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
          Classes are managed by an admin. Yours are marked below — open one to post its
          updates and files.
        </p>
      )}

      {/* Only once the list is long enough to need it. Three classes and a
          search box is furniture. */}
      {classes.length > 8 && (
        <div style={{ marginBottom: '16px' }}>
          <SearchInput
            placeholder="Search by name, teacher, day or studio"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onClear={() => setSearch('')}
            aria-label="Search classes"
          />
          <p style={{
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.mono,
            color: theme.colors.txt.tertiary,
            margin: '8px 0 0',
          }}>
            {needle ? `${visible.length} of ${classes.length}` : `${classes.length} classes`}
          </p>
        </div>
      )}

      {/* A search that matches nothing is not the same as a program with no
          classes, and offering "New class" here would be answering the wrong
          question. */}
      {needle && visible.length === 0 && classes.length > 0 && (
        <EmptyState
          title="No classes match that"
          description="Try a teacher’s name, a day, or part of the class name."
        />
      )}

      <ManagerList
        loading={loading}
        error={error}
        isEmpty={classes.length === 0}
        emptyTitle="No classes yet"
        emptyDescription="Add the class list and it becomes the schedule parents see."
        emptyAction={isAdmin ? <Button leftIcon={<PlusIcon />} onClick={startNew}>New class</Button> : undefined}
      >
        {visible.map(c => (
          <Card key={c.id} style={c.isActive ? undefined : { opacity: 0.6 }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                  <Badge variant={c.category === 'allstars' ? 'primary' : 'default'} size="sm">
                    {CLASS_CATEGORY_LABEL[c.category]}
                  </Badge>
                  {c.style && <Badge variant="default" size="sm">{c.style}</Badge>}
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
                  {/* The three "Combo" rows and the six "Creative Movement"
                      ones are told apart by day, time, studio and teacher —
                      all of which are on this line. */}
                  {c.ageGroup && <span>· {c.ageGroup}</span>}
                </RowMeta>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                {/* Open is offered to a teacher for their own classes, not just
                    to admins: posting to the class they hold is the entire
                    reason the per-class grants exist. Editing the class RECORD
                    stays admin-only below, because its write policy is. */}
                {onOpenClass && (isAdmin || editableClassIds.includes(c.id)) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenClass(c.id)}
                    aria-label={`Open ${c.name}`}
                  >
                    Open
                  </Button>
                )}

                {isAdmin && (
                  <RowActions
                    onEdit={() => { setFormError(''); setDraft(toDraft(c)); }}
                    onDelete={() => handleDelete(c)}
                    editLabel={`Edit ${c.name}`}
                    deleteLabel={`Delete ${c.name}`}
                  />
                )}
              </div>
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

            {/* Select has no helperText prop, so the note is its own line —
                the same shape as the studio-time note under the times below. */}
            <div>
              <Select
                label="Shown on"
                options={CATEGORY_OPTIONS}
                value={draft.category}
                onChange={e => setDraft({ ...draft, category: e.target.value as PortalClassCategory })}
              />
              <p style={{
                ...theme.typography.captionSmall,
                fontFamily: theme.fonts.primary,
                color: theme.colors.txt.tertiary,
                margin: '6px 0 0',
              }}>
                The All-Star schedule lists all three. The Academy/TNT schedule lists
                Academy and TNT only.
              </p>
            </div>

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

            <Divider margin="sm" />

            {/* The filters parents actually use. Every one of these is
                optional and every one is also a facet on the schedule page —
                a class left with a blank Style simply never appears under a
                style chip, which is the honest behaviour but worth knowing. */}
            <div>
              <h4 style={{
                ...theme.typography.caption,
                fontFamily: theme.fonts.primary,
                color: theme.colors.txt.secondary,
                margin: '0 0 4px',
              }}>
                How parents find it
              </h4>
              <p style={{
                ...theme.typography.captionSmall,
                fontFamily: theme.fonts.primary,
                color: theme.colors.txt.tertiary,
                margin: '0 0 12px',
              }}>
                These become the filters on the schedule. Leave one blank and the class
                just will not appear under that filter.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <FieldPair stack={isMobileOrTablet}>
                  <Input
                    label="Style (optional)"
                    value={draft.style ?? ''}
                    placeholder="Hip Hop"
                    helperText="Ballet, Jazz, Acro, Turns & Jumps…"
                    onChange={e => setDraft({ ...draft, style: e.target.value })}
                  />
                  <Input
                    label="Age group (optional)"
                    value={draft.ageGroup ?? ''}
                    placeholder="Junior / Teen"
                    helperText="A slash makes it two filters: Junior AND Teen."
                    onChange={e => setDraft({ ...draft, ageGroup: e.target.value })}
                  />
                </FieldPair>

                <FieldPair stack={isMobileOrTablet}>
                  <Input
                    label="Youngest age"
                    type="number"
                    step="1" min="0" max="99"
                    value={draft.ageMinYears === null ? '' : String(draft.ageMinYears)}
                    placeholder="7"
                    onChange={e => setDraft({ ...draft, ageMinYears: numberOrNull(e.target.value) })}
                  />
                  <Input
                    label="Oldest age"
                    type="number"
                    step="1" min="0" max="99"
                    value={draft.ageMaxYears === null ? '' : String(draft.ageMaxYears)}
                    placeholder="18"
                    helperText="Drives the “my dancer is 8” filter."
                    onChange={e => setDraft({ ...draft, ageMaxYears: numberOrNull(e.target.value) })}
                  />
                </FieldPair>

                <FieldPair stack={isMobileOrTablet}>
                  <Input
                    label="Class size (optional)"
                    type="number"
                    step="1" min="0" max="999"
                    value={draft.capacity === null ? '' : String(draft.capacity)}
                    placeholder="20"
                    onChange={e => setDraft({ ...draft, capacity: numberOrNull(e.target.value) })}
                  />
                  <Input
                    label="Monthly tuition (optional)"
                    type="number"
                    value={draft.tuitionFee === null ? '' : String(draft.tuitionFee)}
                    placeholder="77.50"
                    helperText="Dollars. Billing itself still lives in Enrollio."
                    onChange={e => setDraft({ ...draft, tuitionFee: numberOrNull(e.target.value) })}
                  />
                </FieldPair>

                {/* The season bounds the weekly recurrence the month view
                    draws. A class with no dates shows on its weekday forever,
                    which is right for a class nobody has dated and wrong for
                    one that stops in June. */}
                <Input
                  label="Season (optional)"
                  value={draft.season ?? ''}
                  placeholder="2026-2027"
                  onChange={e => setDraft({ ...draft, season: e.target.value })}
                />

                <FieldPair stack={isMobileOrTablet}>
                  <Input
                    label="First class"
                    type="date"
                    value={draft.seasonStart ?? ''}
                    onChange={e => setDraft({ ...draft, seasonStart: e.target.value || null })}
                  />
                  <Input
                    label="Last class"
                    type="date"
                    value={draft.seasonEnd ?? ''}
                    helperText="Bounds the month calendar. Blank means it runs indefinitely."
                    onChange={e => setDraft({ ...draft, seasonEnd: e.target.value || null })}
                  />
                </FieldPair>
              </div>
            </div>

            <Divider margin="sm" />

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
                    label={`${u.firstName} ${u.lastName}${isManagementRole(u.role) ? ` — ${roleLabel(u.role).toLowerCase()}` : ''}`}
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
