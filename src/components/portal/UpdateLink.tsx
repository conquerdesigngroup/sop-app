import React from 'react';
import { theme } from '../../theme';
import { isSafeLinkUrl, linkButtonLabel, linkHost } from '../../lib/portalLink';

/**
 * The one link an info post can carry (v54), as something a parent can tap.
 *
 * An anchor, not a button: the destination is already known, so there is
 * nothing to await and nothing for a phone to treat as an unsolicited popup —
 * the same reasoning as a link attachment on a calendar event.
 *
 * WHY IT CAN RENDER NOTHING
 *
 * isSafeLinkUrl runs again here, on the way out. The editor checks, saveUpdate
 * checks and a CHECK constraint checks, so a row that fails this one should not
 * exist — but "should not exist" is not a guarantee worth putting in an href.
 * A row from before v54, from a restore, or from anything that is not this app
 * renders as no link at all rather than as a live `javascript:` anchor.
 *
 * The host is shown under a custom label on purpose. "Buy recital tickets" is
 * clearer than a URL, and a parent still deserves to see where a tap is about
 * to send them before it sends them there.
 */
const UpdateLink: React.FC<{
  url: string | null;
  label: string | null;
  /** Smaller, for the profile card's list rows. */
  compact?: boolean;
}> = ({ url, label, compact = false }) => {
  if (!isSafeLinkUrl(url)) return null;

  const href = url as string;
  const text = linkButtonLabel(href, label);
  const host = linkHost(href);

  return (
    <a
      href={href}
      target="_blank"
      // Required alongside target="_blank": without it the opened page gets a
      // handle on this one through window.opener.
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: theme.spacing.sm,
        // 44px is the tap target this has to clear on a phone.
        minHeight: compact ? '40px' : '44px',
        maxWidth: '100%',
        padding: compact ? '8px 12px' : '10px 16px',
        marginTop: theme.spacing.xs,
        border: `1px solid ${theme.colors.primary}`,
        borderRadius: theme.borderRadius.md,
        color: theme.colors.primary,
        background: 'transparent',
        fontFamily: theme.fonts.primary,
        fontSize: compact ? '14px' : '15px',
        fontWeight: 600,
        textDecoration: 'none',
      }}
    >
      {/* minWidth 0 with overflowWrap: a label is arbitrary text and a URL has
          nothing to break at, so without both a long one runs off the card. */}
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
        {text}
        {host && host !== text && (
          <span style={{
            display: 'block',
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.mono,
            fontWeight: 400,
            color: theme.colors.txt.tertiary,
          }}>
            {host}
          </span>
        )}
      </span>
      {/* Decoration only — the anchor already says it is a link, and screen
          readers do not need to hear "north east arrow". */}
      <span aria-hidden="true" style={{ flexShrink: 0 }}>↗</span>
    </a>
  );
};

export default UpdateLink;
