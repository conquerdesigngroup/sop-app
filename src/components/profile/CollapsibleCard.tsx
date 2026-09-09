import React, { useCallback, useEffect, useId, useState } from 'react';
import { theme } from '../../theme';
import { Card } from '../ui';

/**
 * A card whose heading is the control that opens and closes it.
 *
 * WHY THE CARDS DO NOT WRAP THEMSELVES IN A SEPARATE DISCLOSURE
 *
 * Every card here already renders a `<Card>` with an `<h3>` inside it. Putting
 * a generic disclosure around one would show the reader two headings and two
 * borders for one section. So this replaces that pair rather than nesting round
 * it: same Card, same h3 typography, with the h3 living inside a real button.
 *
 * IT IS A BUTTON, NOT A DIV WITH AN onClick
 *
 * Same reasoning as NavTile's. `aria-expanded` is what tells a screen reader
 * this is a disclosure and which way it is currently pointing, `aria-controls`
 * names the region it owns, and a real button gets Enter, Space and focus for
 * free. A div would be announced as nothing and reachable by nothing.
 *
 * THE CHOICE IS REMEMBERED, PER PHONE
 *
 * A parent who opens Attendance and comes back tomorrow to find it shut again
 * has not been given a collapsible card, they have been given a card that
 * forgets. localStorage is the right store for it: it is a per-viewer display
 * preference, it never needs to reach another device, and it is nobody else's
 * business. Every access is wrapped because a browser set to block site data
 * throws on the property itself, not merely on the read.
 */

const STORE_PREFIX = 'didc_portal_open_';

const readStored = (id: string): boolean | null => {
  try {
    const raw = window.localStorage.getItem(STORE_PREFIX + id);
    return raw === null ? null : raw === '1';
  } catch {
    return null;
  }
};

const writeStored = (id: string, open: boolean): void => {
  try {
    window.localStorage.setItem(STORE_PREFIX + id, open ? '1' : '0');
  } catch {
    /* Private window, or site data blocked. The card still opens and closes. */
  }
};

interface CollapsibleCardProps {
  /** Stable key for the remembered state. Use the registry's card id. */
  id: string;
  title: string;
  /**
   * Shut on first visit, unless this viewer has said otherwise before.
   *
   * Both cards using this default to shut, and for the reason the registry
   * already records: "At a glance" sits directly above Attendance as its
   * headline, so the glance stays on screen and the detail is one tap away;
   * and adding a class to your own calendar is something you do once a season.
   */
  defaultOpen?: boolean;
  /**
   * Controls that belong to the section rather than to the page — Attendance's
   * period picker. Rendered beside the heading and only while open, because a
   * period picker over a closed section controls nothing visible.
   */
  headerRight?: React.ReactNode;
  /**
   * A status marker for the SECTION, rendered whether the card is open or shut.
   *
   * That is the whole reason it is not just more `headerRight`. `headerRight`
   * holds controls for the body, so it is right that it leaves with the body.
   * A badge saying the section is not yet in service is the one thing a reader
   * needs to see WITHOUT opening it — these cards default to shut, so a notice
   * that only appears once you expand is a notice most people never get.
   *
   * A direct child of the wrapping header row, not nested beside the control,
   * so on a 320px phone it drops to its own line instead of squeezing the
   * heading into "Attendanc / e".
   */
  badge?: React.ReactNode;
  children: React.ReactNode;
}

const CollapsibleCard: React.FC<CollapsibleCardProps> = ({
  id,
  title,
  defaultOpen = false,
  headerRight,
  badge,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = `${useId()}-region`;

  // After mount, not during render: localStorage is not available while the
  // first paint is being produced on a server or in a test renderer, and a
  // component that reads it inline cannot be rendered twice with the same
  // result. The card opens on the default and corrects itself immediately.
  useEffect(() => {
    const stored = readStored(id);
    if (stored !== null) setOpen(stored);
  }, [id]);

  const toggle = useCallback(() => {
    setOpen(prev => {
      writeStored(id, !prev);
      return !prev;
    });
  }, [id]);

  return (
    <Card>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        // No bottom margin when shut, or a closed card carries the empty space
        // of the body it is not showing.
        marginBottom: open ? theme.spacing.md : 0,
      }}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          /* Only while the region exists. The body is unmounted when shut, and
             aria-controls pointing at an id that is not in the document is
             worse than no aria-controls at all — a screen reader is told to
             look for a region and finds nothing. aria-expanded carries the
             state on its own, which is what UpdatesCard's own disclosures
             already rely on. */
          aria-controls={open ? regionId : undefined}
          style={{
            // Longhand, and every property present in both states — a shorthand
            // paired with its own longhand is the trap documented on Card.
            background: 'none',
            border: 'none',
            padding: 0,
            margin: 0,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
            minWidth: 0,
            color: theme.colors.txt.primary,
            textAlign: 'left',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            style={{
              flexShrink: 0,
              transform: open ? 'rotate(90deg)' : 'none',
              // index.css freezes animations under prefers-reduced-motion, and
              // this is a transition rather than an animation — but the state is
              // carried by aria-expanded and the body's presence either way, so
              // nothing depends on the rotation being seen.
              transition: 'transform 0.15s ease',
            }}
          >
            <path
              d="M9 18l6-6-6-6"
              style={{ stroke: theme.colors.txt.tertiary }}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h3 style={{
            ...theme.typography.h3,
            fontFamily: theme.fonts.display,
            color: theme.colors.txt.primary,
            margin: 0,
            minWidth: 0,
            overflowWrap: 'anywhere',
          }}>
            {title}
          </h3>
        </button>

        {badge}

        {open && headerRight}
      </div>

      {/* Unmounted rather than hidden. These bodies are the heaviest things on
          the dashboard — Attendance renders a switcher, a list and a detail
          sheet — and a closed card should cost nothing to have on the page. */}
      {open && <div id={regionId}>{children}</div>}
    </Card>
  );
};

export default CollapsibleCard;
