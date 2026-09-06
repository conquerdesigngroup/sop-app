import React from 'react';
import { theme } from '../../theme';
import PortalSheet from './PortalSheet';
import { useAddToCalendar } from './useAddToCalendar';
import { CalendarTarget } from '../../lib/calendarTarget';

/**
 * "Add to my calendar", asked properly.
 *
 * The staff side has had a menu here for a long time — Google, a file, a link
 * — while the portal had one button that produced an .ics and hoped. This is
 * that menu, rebuilt for the person using it: a bottom sheet rather than a
 * dropdown, because the portal is a phone-first surface and a 140px menu of
 * 28px rows is not a thumb target.
 *
 * WHY A SHEET AND NOT THE DROPDOWN
 *
 * A dropdown has to be anchored, and this opens from several very different
 * places — the small Add button on a calendar row, the primary button in the
 * event card (itself inside a Modal), and the button on a class. A sheet is
 * anchored to the screen instead of to the thing that opened it, so every
 * caller gets the same panel and none has to reason about whether the menu
 * will fit above or below the button that spawned it.
 *
 * ORDER IS DELIBERATE
 *
 * Google first because it is the one most of these parents actually use and
 * the only one that ends in a filled-in event rather than a file. The file
 * routes sit below the direct handoffs, and the plain download sits below the
 * share sheet, because it is the fallback for the parent none of the others
 * fit — not the default any more.
 *
 * WHAT IT TAKES
 *
 * A CalendarTarget, not an event. A one-off studio date and a class that
 * repeats every week to the end of the season are different shapes with the
 * same five ways out of the app; the target is what they have in common. A
 * target with no Outlook link — a recurring class, whose recurrence that
 * deeplink cannot express — simply does not draw that row.
 */

interface Props {
  target: CalendarTarget | null;
  onClose: () => void;
}

// ------------------------------------------------------------------- marks

/**
 * Brand marks carry their own colours by design, so they use `fill`
 * attributes and not theme tokens. The two generic icons stroke with
 * currentColor and re-theme with the row.
 */

const GoogleMark: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

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

const DownloadIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const CopyIcon: React.FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const ChevronIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// -------------------------------------------------------------------- rows

interface RowProps {
  icon: React.ReactNode;
  label: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}

const Row: React.FC<RowProps> = ({ icon, label, hint, disabled, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      width: '100%',
      // 56, not 44: this is the whole point of the sheet, and these rows are
      // read as much as they are pressed.
      minHeight: '56px',
      padding: '12px 14px',
      textAlign: 'left',
      background: theme.colors.bg.tertiary,
      border: `1px solid ${theme.colors.bdr.primary}`,
      borderRadius: theme.borderRadius.lg,
      color: theme.colors.txt.primary,
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.5 : 1,
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
        content's min-content width, and a long event title has nothing to
        break at. One without the other still overflows at 320px. */}
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

const AddToCalendarSheet: React.FC<Props> = ({ target, onClose }) => {
  const { openGoogle, openOutlook, saveToDevice, downloadFile, copyLink, busy } =
    useAddToCalendar();

  // Every route is a one-shot handoff, so the sheet closes behind each of
  // them. Leaving it open would put a panel over the tab Google just opened.
  const run = (action: (t: CalendarTarget) => void) => () => {
    if (!target) return;
    action(target);
    onClose();
  };

  return (
    <PortalSheet
      isOpen={!!target}
      onClose={onClose}
      title="Add to my calendar"
      // Above Modal's 1100 overlay: this opens from inside the event card.
      zIndex={1200}
    >
      {target && (
        <>
          {/* What is being saved. The sheet covers the row that was tapped, so
              without this there is nothing on screen naming it. */}
          <div style={{
            padding: '12px 14px',
            background: theme.colors.bg.tertiary,
            border: `1px solid ${theme.colors.bdr.primary}`,
            borderRadius: theme.borderRadius.lg,
            minWidth: 0,
            overflowWrap: 'anywhere',
          }}>
            <div style={{
              ...theme.typography.body,
              fontFamily: theme.fonts.primary,
              fontWeight: 600,
              color: theme.colors.txt.primary,
            }}>
              {target.title}
            </div>
            <div style={{
              ...theme.typography.caption,
              fontFamily: theme.fonts.mono,
              color: theme.colors.txt.secondary,
              marginTop: '3px',
            }}>
              {target.when}
            </div>

            {/* A repeating class says so here. "Add to calendar" on a class
                that meets thirty times is a very different promise from the
                same words on a single date, and the parent is entitled to know
                which one they are about to press. */}
            {target.note && (
              <div style={{
                ...theme.typography.captionSmall,
                fontFamily: theme.fonts.primary,
                color: theme.colors.txt.tertiary,
                marginTop: '6px',
              }}>
                {target.note}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Row
              icon={<GoogleMark />}
              label="Google Calendar"
              hint="Opens filled in — just press Save"
              onClick={run(openGoogle)}
            />
            <Row
              icon={<AppleMark />}
              label="Apple Calendar"
              hint="iPhone, iPad or Mac"
              disabled={busy}
              onClick={run(saveToDevice)}
            />
            {/* Dropped for a recurring class: the Outlook deeplink carries no
                recurrence, so this row would quietly hand over one lesson out
                of thirty. Those parents take the .ics row below, which
                Outlook imports with the repeat intact. */}
            {target.outlook && (
              <Row
                icon={<OutlookMark />}
                label="Outlook"
                hint="Opens filled in — just press Save"
                onClick={run(openOutlook)}
              />
            )}
            <Row
              icon={<DownloadIcon />}
              label="Any other calendar"
              hint={target.outlook
                ? 'Downloads an .ics file'
                : 'Outlook and the rest — downloads an .ics file'}
              onClick={run(downloadFile)}
            />
            <Row
              icon={<CopyIcon />}
              label="Copy link"
              // "the date" would be wrong for a class that meets thirty times.
              hint="Send it to someone else"
              onClick={run(copyLink)}
            />
          </div>
        </>
      )}
    </PortalSheet>
  );
};

export default AddToCalendarSheet;
