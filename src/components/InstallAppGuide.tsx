import React, { useState } from 'react';
import { theme } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { Button, Modal } from './ui';

/**
 * "Put this app on my phone", explained to a parent who has never done it.
 *
 * The audience is the whole design constraint. These are dance families, mostly
 * on a phone, mostly once. So:
 *
 * - One set of steps, never a menu of platforms. useInstallPrompt works out
 *   which phone is asking; showing iPhone and Android steps side by side and
 *   asking a parent to self-select is how this fails.
 * - The glyph is drawn next to the step that needs it. "Tap the Share button" is
 *   useless if you do not know which of the icons along the bottom that is, and
 *   a picture of it removes the guesswork that text cannot.
 * - Android gets a real button. Chrome hands us an install event, so there is no
 *   reason to make someone hunt a menu when one tap does it.
 * - Nothing is shown at all once the app is installed. The guide checks
 *   display-mode, so a parent who already did this is not invited to do it again
 *   from inside the very thing they installed.
 */

const StepList: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ol
    style={{
      listStyle: 'none',
      margin: 0,
      padding: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing.md,
      counterReset: 'install-step',
    }}
  >
    {children}
  </ol>
);

/**
 * A numbered step.
 *
 * The sentence is deliberately NOT a flex container. Flex makes every child its
 * own item, so the text nodes, the <strong>s and the glyph each became a block
 * and the copy broke into a stack of fragments instead of reading as a line.
 * Normal inline flow, with the glyph inline-flex inside it, is what lets the
 * picture of the button sit in the middle of the words that name it.
 */
const Step: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <li style={{ display: 'flex', alignItems: 'flex-start', gap: theme.spacing.md }}>
    <span
      aria-hidden="true"
      style={{
        flexShrink: 0,
        width: '26px',
        height: '26px',
        borderRadius: theme.borderRadius.full,
        backgroundColor: theme.colors.primary,
        // Crimson surface: the mode-aware text tokens flip dark in light mode
        // and disappear into the pink, so this one is hardcoded.
        color: '#FFFFFF',
        fontFamily: theme.fonts.mono,
        fontSize: '13px',
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
      }}
    >
      {n}
    </span>

    <span
      style={{
        ...theme.typography.body,
        fontFamily: theme.fonts.primary,
        color: theme.colors.txt.secondary,
        display: 'block',
        // Roomier than the body default so an inline glyph does not collide
        // with the line above it.
        lineHeight: 1.9,
        paddingTop: '1px',
      }}
    >
      {children}
    </span>
  </li>
);

/** Wraps a glyph in a bordered well so it reads as a picture of a button. */
const Glyph: React.FC<{ children: React.ReactNode; label: string }> = ({ children, label }) => (
  <span
    role="img"
    aria-label={label}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '32px',
      height: '26px',
      margin: '0 4px',
      verticalAlign: 'middle',
      borderRadius: theme.borderRadius.sm,
      backgroundColor: theme.colors.bg.tertiary,
      border: `1px solid ${theme.colors.bdr.primary}`,
      color: theme.colors.txt.primary,
    }}
  >
    {children}
  </span>
);

/** iOS Share: a tray with an arrow leaving the top. */
const ShareGlyph = (
  <Glyph label="the iPhone Share button">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8.5 11H6.5A1.5 1.5 0 005 12.5v7A1.5 1.5 0 006.5 21h11a1.5 1.5 0 001.5-1.5v-7A1.5 1.5 0 0017.5 11h-2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M12 15V3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M8.4 7.1L12 3.5l3.6 3.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </Glyph>
);

/** Android Chrome overflow menu: three stacked dots. */
const MenuGlyph = (
  <Glyph label="the Chrome menu button">
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="5" r="1.9" fill="currentColor" />
      <circle cx="12" cy="12" r="1.9" fill="currentColor" />
      <circle cx="12" cy="19" r="1.9" fill="currentColor" />
    </svg>
  </Glyph>
);

const PhoneIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M10.5 18.5h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/** A short aside — used for "you are not in Safari" and similar. */
const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p
    style={{
      ...theme.typography.bodySmall,
      fontFamily: theme.fonts.primary,
      color: theme.colors.txt.tertiary,
      backgroundColor: theme.colors.bg.tertiary,
      border: `1px solid ${theme.colors.bdr.primary}`,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      margin: `0 0 ${theme.spacing.lg} 0`,
    }}
  >
    {children}
  </p>
);

const Outro: React.FC = () => (
  <p
    style={{
      ...theme.typography.bodySmall,
      fontFamily: theme.fonts.primary,
      color: theme.colors.txt.tertiary,
      margin: `${theme.spacing.lg} 0 0 0`,
    }}
  >
    That is it. The DIDC icon appears on your home screen and opens like any other app —
    no address to type, and it still works when the signal is poor.
  </p>
);

const InstallAppGuide: React.FC = () => {
  const [open, setOpen] = useState(false);
  const { isMobileOrTablet } = useResponsive();
  const { platform, isIosSafari, isStandalone, canPromptDirectly, promptInstall } = useInstallPrompt();

  // Already installed: there is nothing to explain, and offering it from inside
  // the installed app is just confusing.
  if (isStandalone) return null;

  const body = () => {
    if (platform === 'ios') {
      return (
        <>
          {!isIosSafari && (
            <Note>
              It looks like you are not using Safari. Adding to the home screen is most
              reliable there — open <strong>didc.app</strong> in Safari first, then follow
              these steps.
            </Note>
          )}
          <StepList>
            <Step n={1}>
              Tap the <strong>Share</strong> button {ShareGlyph} — at the bottom of the screen
              on an iPhone, or the top on an iPad.
            </Step>
            <Step n={2}>
              Scroll down the list and tap <strong>Add to Home Screen</strong>.
            </Step>
            <Step n={3}>
              Tap <strong>Add</strong> in the top right corner.
            </Step>
          </StepList>
          <Outro />
        </>
      );
    }

    if (platform === 'android') {
      return (
        <>
          {canPromptDirectly ? (
            <>
              <p
                style={{
                  ...theme.typography.body,
                  fontFamily: theme.fonts.primary,
                  color: theme.colors.txt.secondary,
                  margin: `0 0 ${theme.spacing.lg} 0`,
                }}
              >
                Your phone can do this in one tap.
              </p>
              <Button variant="primary" fullWidth leftIcon={PhoneIcon} onClick={promptInstall}>
                Add DIDC to my home screen
              </Button>
              <p
                style={{
                  ...theme.typography.bodySmall,
                  fontFamily: theme.fonts.primary,
                  color: theme.colors.txt.tertiary,
                  margin: `${theme.spacing.md} 0 0 0`,
                }}
              >
                Tap the button above, then tap <strong>Install</strong> when your phone asks.
              </p>
            </>
          ) : (
            <>
              <StepList>
                <Step n={1}>
                  Tap the <strong>menu</strong> button {MenuGlyph} at the top right of your
                  browser.
                </Step>
                <Step n={2}>
                  Tap <strong>Install app</strong>, or <strong>Add to Home screen</strong> if you
                  do not see it.
                </Step>
                <Step n={3}>
                  Tap <strong>Install</strong> to confirm.
                </Step>
              </StepList>
              <Outro />
            </>
          )}
        </>
      );
    }

    return (
      <>
        <Note>
          This is really meant for a phone or tablet — that is where having it on the home
          screen helps. On a computer you can still install it, or simply bookmark this page.
        </Note>
        <StepList>
          <Step n={1}>
            Look for the <strong>install icon</strong> at the right-hand end of the address
            bar, and click it.
          </Step>
          <Step n={2}>
            Click <strong>Install</strong>.
          </Step>
        </StepList>
      </>
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '10px',
          background: 'none',
          border: 'none',
          padding: theme.spacing.sm,
          margin: 0,
          cursor: 'pointer',
          color: theme.colors.txt.tertiary,
          ...theme.typography.bodySmall,
          fontFamily: theme.fonts.primary,
          textDecoration: 'underline',
          textUnderlineOffset: '3px',
          // A phone-sized tap target without making it look like a third tile.
          minHeight: '44px',
        }}
      >
        {PhoneIcon}
        {isMobileOrTablet ? 'Add this app to my phone' : 'How to add this app to your phone'}
      </button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Add DIDC to your home screen"
        size="sm"
        footer={
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Close
          </Button>
        }
      >
        {body()}
      </Modal>
    </>
  );
};

export default InstallAppGuide;
