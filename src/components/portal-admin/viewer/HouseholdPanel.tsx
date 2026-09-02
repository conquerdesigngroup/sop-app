import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { theme } from '../../../theme';
import { useResponsive } from '../../../hooks/useResponsive';
import { useToast } from '../../../contexts/ToastContext';
import { useConfirm } from '../../../hooks/useConfirm';
import { logActivity } from '../../../lib/activityLog';
import { formatClassSchedule } from '../../../lib/portal';
import {
  Badge,
  Button,
  Card,
  ChevronLeftIcon,
  Divider,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
} from '../../ui';
import { PortalProgram } from '../../../types';
import {
  ViewerHouseholdDetail,
  accessLabel,
  ageFrom,
  deleteHouseholdNote,
  loadHouseholdDetail,
  sendHouseholdNote,
  studentFullName,
} from '../../../lib/portalViewer';
import { CategoryChips, ChipRow, DetailField } from './ViewerShared';

/**
 * One family, in full — and the one place the studio can say something to just
 * them.
 *
 * WHAT A "NOTE" IS AND IS NOT
 *
 * It is a portal_updates row with household_id set, which makes it visible only
 * to that household's members and invisible to anon, to every other family, and
 * to instructors. It lands in their Updates card beside the studio-wide
 * notices, marked as theirs.
 *
 * It is NOT a message: there is no reply. If a conversation is wanted, that is
 * a different feature with a different table, and pretending this one is it
 * would leave parents typing into a void.
 *
 * It is also NOT an email or a push. Nothing leaves the app. A parent sees it
 * the next time they open the portal, which is the honest promise to make
 * about it until there is a notification path — so the form says so.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const shortDate = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

/** A date column stored as YYYY-MM-DD, which must not go through Date(). */
const plainDate = (value: string | null): string => {
  if (!value) return '—';
  const parts = value.split('-');
  if (parts.length !== 3) return value;
  const month = MONTHS[Number(parts[1]) - 1];
  return month ? `${Number(parts[2])} ${month} ${parts[0]}` : value;
};

const HouseholdPanel: React.FC<{
  householdId: string;
  programs: PortalProgram[];
  canSendNotes: boolean;
  today: Date;
  onBack: () => void;
}> = ({ householdId, programs, canSendNotes, today, onBack }) => {
  const { isMobileOrTablet } = useResponsive();
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();

  const [detail, setDetail] = useState<ViewerHouseholdDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [programId, setProgramId] = useState('');
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    const result = await loadHouseholdDetail(householdId);
    setDetail(result.detail);
    setError(result.error);
    setLoading(false);
  }, [householdId]);

  useEffect(() => { void reload(); }, [reload]);

  /**
   * A note's program is bookkeeping — visibility comes from household_id — but
   * the column is NOT NULL, so it needs a sane default. The programme the
   * family's own classes belong to is the only defensible one.
   */
  const defaultProgramId = useMemo(() => {
    const enrolled = (detail?.students ?? []).flatMap(s => s.enrollments);
    const first = enrolled.find(e => e.programId);
    return first?.programId ?? programs[0]?.id ?? '';
  }, [detail, programs]);

  const openCompose = () => {
    setTitle('');
    setBody('');
    setFormError('');
    setProgramId(defaultProgramId);
    setComposing(true);
  };

  const handleSend = async () => {
    setFormError('');
    if (!title.trim()) { setFormError('Give the note a title.'); return; }
    if (!programId) { setFormError('Pick a program to file this under.'); return; }

    setSending(true);
    const result = await sendHouseholdNote({
      householdId,
      programId,
      title,
      body,
      authorId: null,
    });
    setSending(false);

    if (result.error) { setFormError(result.error); return; }

    void logActivity({
      action: 'household_note_sent',
      entityType: 'update',
      entityId: result.id ?? undefined,
      entityTitle: title.trim(),
      details: { householdId, programId, householdEmail: detail?.household.email },
    });

    setComposing(false);
    toast.success('Note sent — they will see it next time they open the portal.');
    void reload();
  };

  const handleDeleteNote = async (id: string, noteTitle: string) => {
    const ok = await confirm({
      title: 'Delete this note?',
      message: `"${noteTitle}" will disappear from the family's portal.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    const err = await deleteHouseholdNote(id);
    if (err) { toast.error(err); return; }
    void logActivity({
      action: 'household_note_deleted',
      entityType: 'update',
      entityId: id,
      entityTitle: noteTitle,
      details: { householdId },
    });
    void reload();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
        <Spinner size={28} color={theme.colors.primary} />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <Card>
        <p style={{ ...theme.typography.body, fontFamily: theme.fonts.primary, margin: 0 }}>
          {error ?? 'That family could not be found.'}
        </p>
        <div style={{ marginTop: theme.spacing.md }}>
          <Button variant="secondary" size="sm" onClick={onBack}>Back to families</Button>
        </div>
      </Card>
    );
  }

  const { household, students, notes } = detail;
  const access = accessLabel(household);

  return (
    <>
      <Button variant="ghost" size="sm" leftIcon={<ChevronLeftIcon size={16} />} onClick={onBack}>
        All families
      </Button>

      <Card style={{ marginTop: theme.spacing.sm }}>
        <h2 style={{
          ...theme.typography.h3,
          fontFamily: theme.fonts.display,
          color: theme.colors.txt.primary,
          margin: 0,
          overflowWrap: 'anywhere',
        }}>
          {household.name}
        </h2>

        <ChipRow>
          <Badge variant={access.ok ? 'success' : 'default'} size="sm">{access.text}</Badge>
          <CategoryChips categories={household.categories} />
          {household.status !== 'active' && <Badge variant="warning" size="sm">Inactive</Badge>}
        </ChipRow>

        <div style={{
          display: 'grid',
          // Two columns where there is room, one where there is not. `auto-fit`
          // with a minimum rather than a media query, so it also behaves in the
          // 480–660px band the audit found nothing else was covering.
          gridTemplateColumns: isMobileOrTablet ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: theme.spacing.md,
          marginTop: theme.spacing.md,
        }}>
          <DetailField label="Email">{household.email}</DetailField>
          <DetailField label="Enrolio account">{household.externalAccountId ?? '—'}</DetailField>
          <DetailField label="Dancers">{household.studentCount}</DetailField>
          <DetailField label="Active enrollments">{household.enrollmentCount}</DetailField>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
          {/* The login side of this family — change their email, resend an
              invite — lives on the accounts page. Seeded with their address so
              it opens on them rather than on 388 rows. */}
          <Link
            to={`/portal-admin/clients?q=${encodeURIComponent(household.email)}`}
            style={{ textDecoration: 'none' }}
          >
            <Button variant="outline" size="sm">Login &amp; roster</Button>
          </Link>
          {canSendNotes && (
            <Button variant="primary" size="sm" onClick={openCompose}>
              Send this family a note
            </Button>
          )}
        </div>
      </Card>

      {/* ------------------------------------------------------------ notes */}
      {notes.length > 0 && (
        <div style={{ marginTop: theme.spacing.lg }}>
          <h3 style={{
            ...theme.typography.h3,
            fontFamily: theme.fonts.display,
            color: theme.colors.txt.primary,
            margin: `0 0 ${theme.spacing.sm}`,
          }}>
            Notes sent to this family
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {notes.map(n => (
              <Card key={n.id} padding="sm">
                <div style={{
                  display: 'flex',
                  gap: theme.spacing.sm,
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                }}>
                  <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <div style={{
                      ...theme.typography.body,
                      fontFamily: theme.fonts.primary,
                      fontWeight: 600,
                      color: theme.colors.txt.primary,
                      overflowWrap: 'anywhere',
                    }}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div style={{
                        ...theme.typography.bodySmall,
                        fontFamily: theme.fonts.primary,
                        color: theme.colors.txt.secondary,
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                        marginTop: '4px',
                      }}>
                        {n.body}
                      </div>
                    )}
                    <div style={{
                      ...theme.typography.captionSmall,
                      fontFamily: theme.fonts.mono,
                      color: theme.colors.txt.tertiary,
                      marginTop: '6px',
                    }}>
                      {shortDate(n.publishedAt ?? n.createdAt)}
                    </div>
                  </div>
                  {canSendNotes && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleDeleteNote(n.id, n.title)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------- dancers */}
      <div style={{ marginTop: theme.spacing.lg }}>
        <h3 style={{
          ...theme.typography.h3,
          fontFamily: theme.fonts.display,
          color: theme.colors.txt.primary,
          margin: `0 0 ${theme.spacing.sm}`,
        }}>
          Dancers
        </h3>

        {students.length === 0 && (
          <Card>
            <p style={{
              ...theme.typography.body,
              fontFamily: theme.fonts.primary,
              color: theme.colors.txt.secondary,
              margin: 0,
            }}>
              No dancers are attached to this account.
            </p>
          </Card>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {students.map(({ student, enrollments }) => {
            const age = ageFrom(student.dateOfBirth, today);
            return (
              <Card key={student.id} padding="sm">
                <div style={{
                  ...theme.typography.body,
                  fontFamily: theme.fonts.primary,
                  fontWeight: 600,
                  color: theme.colors.txt.primary,
                  overflowWrap: 'anywhere',
                }}>
                  {studentFullName(student)}
                  {student.displayName && (
                    <span style={{ color: theme.colors.txt.tertiary, fontWeight: 400 }}>
                      {' '}“{student.displayName}”
                    </span>
                  )}
                </div>
                <div style={{
                  ...theme.typography.captionSmall,
                  fontFamily: theme.fonts.mono,
                  color: theme.colors.txt.tertiary,
                  marginTop: '2px',
                }}>
                  {plainDate(student.dateOfBirth)}{age !== null ? ` · age ${age}` : ''}
                </div>

                {enrollments.length === 0 ? (
                  <p style={{
                    ...theme.typography.bodySmall,
                    fontFamily: theme.fonts.primary,
                    color: theme.colors.txt.tertiary,
                    margin: `${theme.spacing.sm} 0 0`,
                  }}>
                    Not enrolled in any class.
                  </p>
                ) : (
                  <div style={{ marginTop: theme.spacing.sm }}>
                    {enrollments.map(e => {
                      const when = formatClassSchedule(e.dayOfWeek, e.startTime, null);
                      return (
                        <div
                          key={e.id}
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '8px',
                            alignItems: 'baseline',
                            padding: '6px 0',
                            borderTop: `1px solid ${theme.colors.bdr.primary}`,
                          }}
                        >
                          <span style={{
                            ...theme.typography.bodySmall,
                            fontFamily: theme.fonts.primary,
                            color: theme.colors.txt.primary,
                            flex: '1 1 160px',
                            minWidth: 0,
                            overflowWrap: 'anywhere',
                          }}>
                            {e.className}
                          </span>
                          {when && (
                            <span style={{
                              ...theme.typography.captionSmall,
                              fontFamily: theme.fonts.mono,
                              color: theme.colors.txt.tertiary,
                            }}>
                              {when}
                            </span>
                          )}
                          {e.status !== 'active' && (
                            <Badge variant="warning" size="sm">
                              {e.status === 'dropped' && e.droppedOn
                                ? `Dropped ${plainDate(e.droppedOn)}`
                                : e.status}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      <Divider />

      {/* --------------------------------------------------------- compose */}
      <Modal
        isOpen={composing}
        onClose={() => setComposing(false)}
        title={`Note to ${household.name}`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setComposing(false)}>Cancel</Button>
            <Button variant="primary" loading={sending} onClick={() => void handleSend()}>
              Send note
            </Button>
          </>
        }
      >
        <p style={{
          ...theme.typography.bodySmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.secondary,
          margin: `0 0 ${theme.spacing.md}`,
        }}>
          Only this family will see it, in their portal. It is not emailed and it
          is not a message they can reply to.
        </p>

        <Input
          label="Title"
          placeholder="Costume fitting on Saturday"
          value={title}
          onChange={e => setTitle(e.target.value)}
          // 16px or iOS zooms the whole modal on focus.
          style={isMobileOrTablet ? { fontSize: '16px' } : undefined}
        />
        <Textarea
          label="Note"
          rows={5}
          placeholder="Anything you would otherwise have texted them."
          value={body}
          onChange={e => setBody(e.target.value)}
          style={isMobileOrTablet ? { fontSize: '16px' } : undefined}
        />
        <Select
          label="File under"
          options={programs.map(p => ({ value: p.id, label: p.name }))}
          value={programId}
          onChange={e => setProgramId(e.target.value)}
        />
        <p style={{
          ...theme.typography.captionSmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.tertiary,
          margin: `${theme.spacing.xs} 0 0`,
        }}>
          Filing only — the note reaches this family whichever program it is filed under.
        </p>

        {formError && (
          <p style={{
            ...theme.typography.bodySmall,
            fontFamily: theme.fonts.primary,
            color: theme.colors.status.error,
            margin: `${theme.spacing.sm} 0 0`,
          }}>
            {formError}
          </p>
        )}
      </Modal>

      {confirmDialog}
    </>
  );
};

export default HouseholdPanel;
