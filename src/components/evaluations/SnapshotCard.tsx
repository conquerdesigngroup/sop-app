import React from 'react';
import { theme } from '../../theme';
import { Badge } from '../ui';
import { CRITERIA, EvaluationSnapshot, prettyDate, ratingLabel } from '../../lib/evaluations';

/**
 * One evaluation, read-only — the card an admin opens from the lookup and the
 * one a family reads on the dashboard. The PDF (evaluationPdf.ts) draws the
 * same fields in the same order, so what is on screen is what gets exported.
 *
 * `showName` is off for a family, who is looking at their own child under a
 * heading that already says who; it is on for an admin scanning a class.
 */

const Dots: React.FC<{ value: number | null }> = ({ value }) => (
  <span aria-hidden="true" style={{ display: 'inline-flex', gap: 3 }}>
    {[1, 2, 3, 4, 5].map(i => (
      <span
        key={i}
        style={{
          width: 10,
          height: 10,
          borderRadius: 2,
          border: `1.5px solid ${theme.colors.txt.secondary}`,
          background: value !== null && i <= value ? theme.colors.txt.secondary : 'transparent',
        }}
      />
    ))}
  </span>
);

const SnapshotCard: React.FC<{
  snapshot: EvaluationSnapshot;
  showName?: boolean;
  showMoveUp?: boolean;
  compact?: boolean;
}> = ({ snapshot: s, showName = true, showMoveUp = true, compact = false }) => (
  <div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs, alignItems: 'baseline', justifyContent: 'space-between' }}>
      <div style={{ minWidth: 0, flex: '1 1 160px' }}>
        {showName && (
          <div style={{ fontWeight: 700, color: theme.colors.txt.primary, overflowWrap: 'anywhere' }}>
            {s.firstName} {s.lastName}
          </div>
        )}
        <div style={{ fontSize: '0.85rem', color: theme.colors.txt.secondary, overflowWrap: 'anywhere' }}>
          {s.className}
          {s.instructorName ? ` · ${s.instructorName}` : ''}
        </div>
        <div style={{ fontSize: '0.78rem', color: theme.colors.txt.tertiary, overflowWrap: 'anywhere' }}>
          {s.season} · {s.round}
          {s.state === 'submitted' && s.submittedAt ? ` · ${prettyDate(s.submittedAt)}` : ''}
        </div>
      </div>
      {s.state !== 'submitted' && <Badge variant="warning" size="sm">Draft</Badge>}
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : theme.spacing.xs, marginTop: theme.spacing.sm }}>
      {CRITERIA.map(c => {
        const v = s[c.key];
        return (
          <div
            key={c.key}
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing.sm, minHeight: 24 }}
          >
            <span style={{ flex: '0 0 104px', fontSize: '0.85rem', color: theme.colors.txt.secondary }}>{c.label}</span>
            <Dots value={v} />
            <span style={{ fontSize: '0.85rem', color: theme.colors.txt.primary, fontWeight: 600 }}>
              {ratingLabel(v)}
              <span style={{ color: theme.colors.txt.tertiary, fontWeight: 400 }}>{v !== null ? ` · ${v}/5` : ''}</span>
            </span>
          </div>
        );
      })}
    </div>

    <p style={{
      margin: `${theme.spacing.sm} 0 0`,
      fontSize: '0.92rem',
      lineHeight: 1.5,
      color: s.comment.trim() ? theme.colors.txt.primary : theme.colors.txt.tertiary,
      // Plain text, preserved line breaks, never HTML.
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
    }}>
      {s.comment.trim() || 'No comment left.'}
    </p>

    {showMoveUp && s.moveUp && (
      <div style={{ marginTop: theme.spacing.sm }}>
        <Badge variant="success" size="sm">Recommended to move up</Badge>
      </div>
    )}
  </div>
);

export default SnapshotCard;
