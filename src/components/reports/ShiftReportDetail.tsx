import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Button, Badge } from '../ui';
import StaffAvatar from '../StaffAvatar';
import { theme } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { useShiftReports } from '../../contexts/ShiftReportContext';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../hooks/useConfirm';
import {
  MAX_COMMENT_LENGTH,
  ShiftReport,
  ShiftReportComment,
  SHIFT_TYPE_LABEL,
  formatShiftDate,
  formatTimestamp,
} from '../../lib/shiftReports';
import { personName } from './ShiftReportCard';

interface Props {
  report: ShiftReport | null;
  onClose: () => void;
  onEdit: (report: ShiftReport) => void;
}

/**
 * One report in full, with its chat underneath — the same idea as a task's
 * Team Discussion, kept in its own table so two people posting at once
 * cannot overwrite each other (see v77).
 */
const ShiftReportDetail: React.FC<Props> = ({ report, onClose, onEdit }) => {
  const { users, currentUser, isAdmin } = useAuth();
  const { markSeen, setArchived, loadComments, addComment, deleteComment } = useShiftReports();
  const { showToast } = useToast();
  const { confirm, confirmDialog } = useConfirm();

  const [comments, setComments] = useState<ShiftReportComment[] | null>(null);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const sendBusy = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const reportId = report?.id;

  const fetchComments = useCallback(async (id: string) => {
    setCommentsError(null);
    try {
      const rows = await loadComments(id);
      setComments(rows);
    } catch {
      setCommentsError('Couldn\'t load the chat. Check your connection and reopen the report.');
      setComments([]);
    }
  }, [loadComments]);

  useEffect(() => {
    if (!reportId) return;
    setComments(null);
    setDraft('');
    fetchComments(reportId);
    markSeen(reportId).catch(() => { /* the alert stays; harmless */ });
    // markSeen changes identity with the report list; once per open is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, fetchComments]);

  // Keep the newest message in view inside the chat box only. scrollIntoView
  // would also scroll the modal, and open every report at its chat instead of
  // at the report someone came to read.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [comments?.length]);

  if (!report) return null;

  const isAuthor = currentUser?.id === report.authorId;
  const archived = !!report.archivedAt;
  const author = users.find(u => u.id === report.authorId);

  const send = async () => {
    const text = draft.trim();
    if (!text || sendBusy.current) return;
    sendBusy.current = true;
    setSending(true);
    try {
      const comment = await addComment(report.id, text);
      setComments(prev => [...(prev || []), comment]);
      setDraft('');
    } catch {
      showToast('Couldn\'t send your message. Check your connection and try again.', 'error');
    } finally {
      sendBusy.current = false;
      setSending(false);
    }
  };

  const remove = async (comment: ShiftReportComment) => {
    const ok = await confirm({
      title: 'Delete message?',
      message: 'It will be removed from this report\'s chat for everyone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteComment(comment);
      setComments(prev => (prev || []).filter(c => c.id !== comment.id));
    } catch {
      showToast('Couldn\'t delete that message.', 'error');
    }
  };

  const toggleArchive = async () => {
    if (archiving) return;
    if (!archived) {
      const ok = await confirm({
        title: 'Archive this report?',
        message: 'It leaves the Reports list for everyone. You can restore it from the archive.',
        confirmLabel: 'Archive',
        variant: 'warning',
      });
      if (!ok) return;
    }
    setArchiving(true);
    try {
      await setArchived(report.id, !archived);
      showToast(archived ? 'Report restored' : 'Report archived', 'success');
      onClose();
    } catch {
      showToast(archived ? 'Couldn\'t restore the report.' : 'Couldn\'t archive the report.', 'error');
    } finally {
      setArchiving(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={!!report}
        onClose={onClose}
        title={`${SHIFT_TYPE_LABEL[report.shiftType]} shift report`}
        size="lg"
        footer={
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, justifyContent: 'flex-end', width: '100%' }}>
            {isAdmin && (
              <Button variant={archived ? 'outline' : 'danger'} onClick={toggleArchive} loading={archiving} disabled={archiving}>
                {archived ? 'Restore' : 'Archive'}
              </Button>
            )}
            {isAuthor && !archived && (
              <Button variant="outline" onClick={() => onEdit(report)}>Edit</Button>
            )}
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <StaffAvatar firstName={author?.firstName} lastName={author?.lastName} avatarPath={author?.avatarPath} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '16px', color: theme.colors.txt.primary, overflowWrap: 'anywhere' }}>
                {personName(users, report.authorId)}
              </div>
              <div style={{ fontSize: '13px', color: theme.colors.txt.tertiary }}>
                {formatShiftDate(report.shiftDate)} · posted {formatTimestamp(report.createdAt)}
                {report.updatedAt.slice(0, 16) !== report.createdAt.slice(0, 16) && ` · edited ${formatTimestamp(report.updatedAt)}`}
              </div>
            </div>
            <Badge variant={report.shiftType === 'opening' ? 'info' : 'warning'} size="sm">
              {SHIFT_TYPE_LABEL[report.shiftType]}
            </Badge>
          </div>

          {archived && (
            <p style={{ margin: 0, fontSize: '13px', color: theme.colors.txt.tertiary }}>
              Archived {formatTimestamp(report.archivedAt!)}
              {report.archivedBy ? ` by ${personName(users, report.archivedBy)}` : ''}.
            </p>
          )}

          <div style={{
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            fontSize: '15px',
            lineHeight: 1.6,
            color: theme.colors.txt.primary,
            padding: theme.spacing.md,
            backgroundColor: theme.colors.bg.tertiary,
            borderRadius: theme.borderRadius.md,
          }}>
            {report.body}
          </div>

          {report.tags.length > 0 && (
            <div>
              <div style={sectionLabel}>Tagged</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {report.tags.map(t => (
                  <span key={t.userId} style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    maxWidth: '100%',
                    padding: '3px 10px',
                    borderRadius: theme.borderRadius.full,
                    border: `1px solid ${theme.colors.bdr.primary}`,
                    fontSize: '13px',
                    color: theme.colors.txt.secondary,
                    overflowWrap: 'anywhere',
                  }}>
                    {personName(users, t.userId)}
                    <span style={{ fontSize: '11px', color: t.seenAt ? theme.colors.status.success : theme.colors.txt.tertiary }}>
                      {t.seenAt ? 'seen' : 'not opened yet'}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Chat */}
          <section aria-label="Chat" style={{
            border: `1px solid ${theme.colors.bdr.primary}`,
            borderRadius: theme.borderRadius.md,
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 12px',
              borderBottom: `1px solid ${theme.colors.bdr.primary}`,
              fontWeight: 700,
              fontSize: '15px',
              color: theme.colors.txt.primary,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2" style={{ stroke: theme.colors.primary }} aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Chat
              {comments && comments.length > 0 && (
                <span style={{ fontSize: '12px', color: theme.colors.txt.tertiary, fontWeight: 600 }}>{comments.length}</span>
              )}
            </div>

            <div ref={listRef} style={{ maxHeight: '300px', overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {comments === null ? (
                <p style={emptyText} role="status">Loading the chat…</p>
              ) : commentsError ? (
                <p style={{ ...emptyText, color: theme.colors.status.error }} role="alert">{commentsError}</p>
              ) : comments.length === 0 ? (
                <p style={emptyText}>No messages yet. Ask a question or reply to the report here.</p>
              ) : (
                comments.map(c => {
                  const who = users.find(u => u.id === c.authorId);
                  const canDelete = c.authorId === currentUser?.id || isAdmin;
                  return (
                    <div key={c.id} style={{
                      display: 'flex',
                      gap: '10px',
                      padding: '10px',
                      backgroundColor: theme.colors.bg.tertiary,
                      borderRadius: theme.borderRadius.md,
                      minWidth: 0,
                    }}>
                      <StaffAvatar firstName={who?.firstName} lastName={who?.lastName} avatarPath={who?.avatarPath} size={30} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 8px' }}>
                          <span style={{ fontWeight: 600, fontSize: '13px', color: theme.colors.txt.primary }}>
                            {personName(users, c.authorId)}
                          </span>
                          <span style={{ fontSize: '12px', color: theme.colors.txt.tertiary }}>{formatTimestamp(c.createdAt)}</span>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => remove(c)}
                              aria-label="Delete message"
                              style={{
                                marginLeft: 'auto',
                                background: 'none',
                                border: 'none',
                                padding: '0 2px',
                                fontSize: '12px',
                                color: theme.colors.txt.tertiary,
                                cursor: 'pointer',
                              }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                        <p style={{
                          margin: '2px 0 0',
                          fontSize: '14px',
                          lineHeight: 1.5,
                          color: theme.colors.txt.secondary,
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                        }}>
                          {c.body}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: '8px',
              padding: '10px 12px',
              borderTop: `1px solid ${theme.colors.bdr.primary}`,
            }}>
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Write a message…"
                aria-label="Write a message"
                maxLength={MAX_COMMENT_LENGTH}
                rows={1}
                disabled={sending}
                style={{
                  flex: 1,
                  minWidth: 0,
                  resize: 'vertical',
                  minHeight: '40px',
                  maxHeight: '140px',
                  padding: '9px 12px',
                  fontFamily: theme.fonts.primary,
                  fontSize: '16px',
                  color: theme.colors.txt.primary,
                  backgroundColor: theme.colors.bg.tertiary,
                  border: `1px solid ${theme.colors.bdr.primary}`,
                  borderRadius: theme.borderRadius.md,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <Button variant="primary" onClick={send} loading={sending} disabled={!draft.trim() || sending}>
                Send
              </Button>
            </div>
          </section>
        </div>
      </Modal>
      {confirmDialog}
    </>
  );
};

const sectionLabel: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  color: theme.colors.txt.tertiary,
  marginBottom: '6px',
};

const emptyText: React.CSSProperties = {
  margin: 0,
  padding: '16px 4px',
  textAlign: 'center',
  fontSize: '14px',
  color: theme.colors.txt.tertiary,
};

export default ShiftReportDetail;
