import React, { useEffect, useState } from 'react';
import { theme } from '../../theme';
import { Card, Spinner } from '../ui';
import { PortalDocument } from '../../types';
import { formatFileSize } from '../../lib/portal';
import { withDownload } from '../../lib/portalMedia';
import { signDocumentUrls } from '../../lib/portalStorage';
import { LoadError, loadMyDocuments } from '../../lib/attendanceQueries';
import CardError from './CardError';
import { ProfileCardProps } from '../../lib/profileCards';
import { useHousehold } from './useHousehold';

/**
 * Every file that applies to this family, in one place.
 *
 * WHY A ROLL-UP AND NOT A LINK TO THE CLASS PAGE
 *
 * Files already live on the class they belong to, which is the right place to
 * PUT them and the wrong place to FIND them. A parent looking for the recital
 * pack does not remember which of their child's three classes it was attached
 * to — they remember that the studio sent it. So this collects the studio-wide
 * files and the ones for classes the household is enrolled in, and leaves them
 * on their class pages too.
 *
 * URLS ARE SIGNED FOR THE WHOLE LIST AT ONCE
 *
 * Same reasoning as DocumentList: an await between the tap and the navigation
 * is what makes downloads silently fail on iOS, because Safari drops a popup
 * opened outside the gesture that caused it. With every URL already signed each
 * row is a plain anchor, and a plain anchor is never blocked.
 */

const FileGlyph: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path
      d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z M13 2v7h7"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

const DocumentsCard: React.FC<ProfileCardProps> = ({ ctx }) => {
  const { data } = useHousehold(ctx.source);
  const [docs, setDocs] = useState<PortalDocument[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<LoadError>(null);
  const [attempt, setAttempt] = useState(0);

  const classIds = data?.enrolledClassIds;
  const isDemo = ctx.source.source === 'fixture';

  useEffect(() => {
    if (!classIds) return;
    let cancelled = false;

    loadMyDocuments(ctx.source, classIds).then(async result => {
      if (cancelled) return;
      setDocs(result.rows);
      setError(result.error);

      // Fixture rows have no storage object behind them, so there is nothing to
      // sign and nothing to offer — the rows render without a link and say so.
      if (result.error || isDemo || result.rows.length === 0) return;

      const signed = await signDocumentUrls(result.rows.map(d => d.storagePath));
      if (!cancelled) setUrls(signed);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classIds?.join(','), ctx.source.source, attempt]);

  if (error) {
    return (
      <Card>
        <h3 style={{
          ...theme.typography.h3,
          fontFamily: theme.fonts.display,
          color: theme.colors.txt.primary,
          margin: `0 0 ${theme.spacing.md}`,
        }}>
          Files &amp; forms
        </h3>
        <CardError message={error} onRetry={() => setAttempt(n => n + 1)} />
      </Card>
    );
  }

  if (docs === null) {
    return (
      <Card>
        <div style={{ display: 'flex', justifyContent: 'center', padding: theme.spacing.lg }}>
          <Spinner size={20} color={theme.colors.primary} />
        </div>
      </Card>
    );
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: `${theme.spacing.sm} 0`,
    color: theme.colors.txt.primary,
    textDecoration: 'none',
  };

  return (
    <Card>
      <h3 style={{
        ...theme.typography.h3,
        fontFamily: theme.fonts.display,
        color: theme.colors.txt.primary,
        margin: `0 0 ${theme.spacing.md}`,
      }}>
        Files &amp; forms
      </h3>

      {docs.length === 0 ? (
        <p style={{
          ...theme.typography.bodySmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.tertiary,
          margin: 0,
        }}>
          Nothing to download yet.
        </p>
      ) : (
        docs.map((docRow, index) => {
          const signed = urls[docRow.storagePath];
          const meta = [
            docRow.category,
            formatFileSize(docRow.sizeBytes),
            isDemo ? 'demo file' : null,
          ].filter(Boolean).join(' · ');

          const body = (
            <>
              <FileGlyph />
              <span style={{ minWidth: 0, flex: 1, overflowWrap: 'anywhere' }}>
                <span style={{
                  ...theme.typography.bodySmall,
                  fontFamily: theme.fonts.primary,
                  fontWeight: 600,
                  color: theme.colors.txt.primary,
                  display: 'block',
                }}>
                  {docRow.title}
                </span>
                {meta && (
                  <span style={{
                    ...theme.typography.captionSmall,
                    fontFamily: theme.fonts.mono,
                    color: theme.colors.txt.tertiary,
                  }}>
                    {meta}
                  </span>
                )}
              </span>
            </>
          );

          const border = index === 0 ? 'none' : `1px solid ${theme.colors.bdr.primary}`;

          return signed ? (
            <a
              key={docRow.id}
              href={withDownload(signed, docRow.fileName)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...rowStyle, borderTop: border }}
              aria-label={`Download ${docRow.title}`}
            >
              {body}
            </a>
          ) : (
            <div
              key={docRow.id}
              style={{ ...rowStyle, borderTop: border, opacity: isDemo ? 0.6 : 1 }}
              // A row with no signed URL is not a broken link — it is a file
              // whose object is missing or, in the demo, never existed.
              title={isDemo ? 'Demo data — no file behind this row' : undefined}
            >
              {body}
            </div>
          );
        })
      )}
    </Card>
  );
};

export default DocumentsCard;
