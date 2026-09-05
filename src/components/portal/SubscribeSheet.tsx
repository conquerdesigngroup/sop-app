import React from 'react';
import { theme } from '../../theme';
import PortalSheet from './PortalSheet';
import { useToast } from '../../contexts/ToastContext';
import { ProgramSlug } from '../../lib/portal';
import {
  downloadFeed,
  feedUrl,
  googleSubscribeUrl,
  outlookSubscribeUrl,
  webcalUrl,
} from '../../lib/portalFeed';
import { openCalendarUrl } from '../../lib/calendarTarget';
import { copyCalendarLink } from '../../utils/calendarExport';

/**
 * "Subscribe to this calendar" — the whole season in one tap.
 *
 * WHY THIS SITS NEXT TO "ADD" RATHER THAN REPLACING IT
 *
 * They answer different questions. Add is for the one date a parent cares about
 * right now — the showcase they want in front of a partner tonight. Subscribe
 * is for never having to do that again: the studio's edits, cancellations and
 * additions arrive on their own for the rest of the season.
 *
 * Add is the smaller promise and the more immediate one, so it stays where it
 * is, on every row. This is offered once, at the top of the page, where a
 * parent who has just scrolled a term of dates can see why it would help.
 *
 * ORDER
 *
 * Apple first, unlike the Add sheet. That is not inconsistency — it is the same
 * rule applied to a different mechanism. Add leads with Google because Google
 * is what most of these parents use and its link lands on a filled-in event.
 * Subscribing, though, is a webcal:// hand-off that iOS resolves to Calendar in
 * one tap with no account involved at all, and this studio's parents are mostly
 * on iPhones. Google's route needs a signed-in Google account and a second
 * confirmation screen.
 *
 * The download sits last and says "snapshot" out loud, because it is the one
 * row here that does NOT keep working — and a parent who picks it thinking
 * otherwise would find out months later, silently, which is the worst way.
 */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  slug: ProgramSlug;
  /** Programme name, for the calendar Outlook is about to create. */
  programName: string;
}

// ------------------------------------------------------------------- marks

const AppleMark: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    {/* style, not a fill attribute: an SVG presentation attribute cannot
        resolve a var(), and these tokens are variables. See CLAUDE.md. */}
    <path
      style={{ fill: theme.colors.txt.primary }}
      d="M17.05 12.54c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.9-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.02 2.28-1.27 3.13-2.53.99-1.45 1.4-2.85 1.42-2.92-.03-.01-2.72-1.04-2.75-4.12z"
    />
    <path
      style={{ fill: theme.colors.txt.primary }}
      d="M14.47 4.85c.72-.87 1.2-2.08 1.07-3.28-1.03.04-2.28.69-3.02 1.55-.66.77-1.24 2-1.09 3.18 1.15.09 2.32-.58 3.04-1.45z"
    />
  </svg>
);

const GoogleMark: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const OutlookMark: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M13.5 4.5H22a.5.5 0 0 1 .5.5v14a.5.5 0 0 1-.5.5h-8.5V4.5z" fill="#0F6CBD" />
    <path d="M13.5 11.2h9v7.8a.5.5 0 0 1-.5.5h-8.5v-8.3z" fill="#1A8FE3" />
    <path d="M1.5 3.6 12.6 1.8a.5.5 0 0 1 .58.5v19.4a.5.5 0 0 1-.58.5L1.5 20.4a.5.5 0 0 1-.42-.5V4.1a.5.5 0 0 1 .42-.5z" fill="#0C5A9E" />
    <path
      d="M7.1 8.2c1.9 0 3.1 1.5 3.1 3.8s-1.2 3.8-3.1 3.8S4 14.3 4 12s1.2-3.8 3.1-3.8zm0 1.6c-.9 0-1.5.85-1.5 2.2s.6 2.2 1.5 2.2 1.5-.85 1.5-2.2-.6-2.2-1.5-2.2z"
      fill="#FFFFFF"
    />
  </svg>
);

const CopyIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const DownloadIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const ChevronIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// -------------------------------------------------------------------- rows

/**
 * The same 56px row as the Add sheet. Copied rather than lifted into a shared
 * component on purpose: two callers is not yet a pattern, and the pair is
 * small enough that a shared version would take props for every difference
 * before it earned anything.
 */
const Row: React.FC<{
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}> = ({ icon, label, hint, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      width: '100%',
      minHeight: '56px',
      padding: '12px 14px',
      textAlign: 'left',
      background: theme.colors.bg.tertiary,
      border: `1px solid ${theme.colors.bdr.primary}`,
      borderRadius: theme.borderRadius.lg,
      color: theme.colors.txt.primary,
      cursor: 'pointer',
    }}
  >
    <span style={{
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '24px',
      color: theme.colors.txt.secondary,
    }}>
      {icon}
    </span>

    {/* minWidth: 0 AND overflowWrap: a flex item will not shrink below its
        content's min-content width, and a URL has nothing to break at. */}
    <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
      <span style={{
        display: 'block',
        ...theme.typography.body,
        fontFamily: theme.fonts.primary,
        fontWeight: 600,
        color: theme.colors.txt.primary,
      }}>
        {label}
      </span>
      <span style={{
        display: 'block',
        ...theme.typography.captionSmall,
        fontFamily: theme.fonts.mono,
        color: theme.colors.txt.tertiary,
        marginTop: '2px',
      }}>
        {hint}
      </span>
    </span>

    <span style={{ flexShrink: 0, display: 'flex', color: theme.colors.txt.tertiary }}>
      <ChevronIcon />
    </span>
  </button>
);

// ------------------------------------------------------------------- sheet

const SubscribeSheet: React.FC<Props> = ({ isOpen, onClose, slug, programName }) => {
  const toast = useToast();

  const configured = !!feedUrl(slug);

  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  const copy = async () => {
    const ok = await copyCalendarLink(feedUrl(slug));
    if (ok) toast.success('Calendar link copied.');
    else toast.error('Could not copy the link.');
  };

  // "Calendar subscription", not "Subscribe to this calendar": the longer one
  // wrapped to two lines of Kanit ExtraBold in the sheet header at 375px, and
  // PortalSheet builds its close button's label from this too — "Close calendar
  // subscription" reads properly where "Close subscribe" would not.
  return (
    <PortalSheet isOpen={isOpen} onClose={onClose} title="Calendar subscription">
      <p style={{
        ...theme.typography.bodySmall,
        fontFamily: theme.fonts.primary,
        color: theme.colors.txt.secondary,
        margin: 0,
      }}>
        Every studio date appears in your own calendar app, and stays up to date
        on its own — new events, changes and cancellations included. You only
        have to do this once.
      </p>

      {!configured ? (
        <p style={{
          ...theme.typography.bodySmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.secondary,
          margin: 0,
        }}>
          Subscribing is not available right now. You can still press{' '}
          <strong>Add</strong> on any event below.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Row
            icon={<AppleMark />}
            label="iPhone, iPad or Mac"
            hint="Opens Calendar — press Subscribe"
            onClick={run(() => {
              // Not openCalendarUrl: window.open on a custom scheme is blocked
              // by some in-app browsers and leaves a blank tab behind on iOS.
              // Navigating the page hands webcal:// straight to the OS.
              window.location.href = webcalUrl(slug);
            })}
          />
          <Row
            icon={<GoogleMark />}
            label="Google Calendar"
            hint="Adds it to your Google account"
            onClick={run(() => openCalendarUrl(googleSubscribeUrl(slug)))}
          />
          <Row
            icon={<OutlookMark />}
            label="Outlook"
            hint="Adds it to your Outlook account"
            onClick={run(() => openCalendarUrl(outlookSubscribeUrl(slug, `DIDC — ${programName}`)))}
          />
          <Row
            icon={<CopyIcon />}
            label="Copy the link"
            hint="For any other calendar app"
            onClick={run(copy)}
          />
          <Row
            icon={<DownloadIcon />}
            label="Download this season"
            hint="A snapshot — it won't update later"
            onClick={run(() => downloadFeed(slug))}
          />
        </div>
      )}
    </PortalSheet>
  );
};

export default SubscribeSheet;
