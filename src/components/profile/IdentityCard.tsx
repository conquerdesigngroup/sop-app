import React, { useCallback, useEffect, useState } from 'react';
import { theme } from '../../theme';
import { Button, Card, Input } from '../ui';
import {
  AVATAR_ICON_GROUPS,
  AVATAR_ICON_META,
  AVATAR_PALETTE,
  AVATAR_PATTERNS,
  AVATAR_PATTERN_LABELS,
  AVATAR_SHAPES,
  AVATAR_SHAPE_LABELS,
  AvatarConfig,
  AvatarIconKey,
  DEFAULT_AVATAR,
  initialsFrom,
  iconsInGroup,
  validateAvatar,
} from '../../lib/avatarPalette';
import { ProfileCardProps } from '../../lib/profileCards';
import ProfileAvatar from './ProfileAvatar';
import { AvatarPrefs, loadAvatarPrefs, saveAvatarPrefs } from '../../lib/avatarPrefs';

/**
 * Who this profile belongs to, and the avatar builder (§5.2, §5.3).
 *
 * THE NICKNAME IS A HOUSEHOLD-ONLY NAME
 *
 * `displayName` shows up here and on the attendance switcher, and nowhere else.
 * Rosters, admin screens and attendance records always carry the enrollment
 * name from Enrolio, because the studio needs to match a child to a paid
 * registration and "Bug" is not on the invoice. It is also why this is the only
 * free-text field in the workstream and why it is validated to boring: these
 * are minors' accounts and there is no cross-household surface anywhere in this
 * feature for a name to leak into.
 */

/**
 * Takes the registry's card props directly rather than a hand-picked subset, so
 * the registry needs no cast and adding a field to ProfileContext later does
 * not mean rewriting this signature.
 */

/**
 * Control characters, stripped on input. The server re-checks (§5.3).
 * The lint rule warns about control characters in a regex on the assumption
 * they are a typo; here they are the entire subject of the expression.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p style={{
    ...theme.typography.captionSmall,
    fontFamily: theme.fonts.mono,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: theme.colors.txt.tertiary,
    margin: `${theme.spacing.md} 0 ${theme.spacing.xs}`,
  }}>
    {children}
  </p>
);

/**
 * EVERYONE GETS THE BUILDER, STAFF INCLUDED.
 *
 * This used to be `editable = !ctx.isStaff`, on the reasoning that staff keep
 * their own /profile for identity and have nothing to change here. Two things
 * outgrew that. The avatar had nowhere to save to when the rule was written, so
 * "nothing to change" was literally true; and since PR #83 staff who are also
 * parents see the family cards, which left the studio's owner looking at his
 * own children's dashboard as an anonymous violet tile with no way to fix it.
 *
 * The own-row rule works identically for both, because profiles.id IS the auth
 * user id (FK to auth.users), so `profile_id = auth.uid()` needs no special
 * case for a member of staff.
 *
 * The one difference that remains is the photograph: staff upload one on the
 * staff profile (lib/staffPhoto.ts, a bucket readable only by is_active_staff)
 * and clients never can. That asymmetry is deliberate and is the whole of it —
 * everything else on this card is the same for everybody.
 */
const IdentityCard: React.FC<ProfileCardProps> = ({ firstName, lastName, email }) => {
  // Staff previewing the portal keep their own /profile for identity; this card
  // shows them who they are signed in as and nothing they can change here.
  const [avatar, setAvatar] = useState<AvatarConfig>(DEFAULT_AVATAR);
  const [nickname, setNickname] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  /**
   * Whether the stored row has been read yet.
   *
   * Save is refused until it has, and that is the whole reason this exists. A
   * read that fails leaves the builder showing a DEFAULT avatar — which looks
   * identical to a family who has not chosen one — so pressing Done before the
   * read lands would quietly overwrite a real choice with violet initials.
   */
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadAvatarPrefs().then(({ prefs, error: loadError }) => {
      if (cancelled) return;
      if (prefs) {
        setAvatar(prefs.avatar);
        setNickname(prefs.displayName);
      }
      if (loadError) setError(loadError);
      // Not in the error branch: a failed read must leave `loaded` false, so
      // the editor cannot save over what it could not see.
      else setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const done = useCallback(async () => {
    setSaving(true);
    try {
      const prefs: AvatarPrefs = { avatar, displayName: nickname };
      await saveAvatarPrefs(prefs);
      setError('');
      setEditing(false);
    } catch (e: any) {
      setError(e?.message ?? 'That did not save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }, [avatar, nickname]);

  const fallback = initialsFrom(firstName, lastName);
  const shown = nickname.trim() || `${firstName} ${lastName}`.trim() || email;

  const update = (patch: Partial<AvatarConfig>) => {
    const result = validateAvatar({ ...avatar, ...patch });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError('');
    setAvatar(result.value);
  };

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, flexWrap: 'wrap' }}>
        <ProfileAvatar config={avatar} fallbackInitials={fallback} size={64} />

        {/* flex-basis, not flex:1. At 320px an avatar + name + button do not
            fit on one line, and `flex: 1` resolves that by squeezing the name
            column to ~150px rather than wrapping — which is how a display name
            ends up broken across lines. A basis wide enough for a name pushes
            the button onto its own row instead. */}
        <div style={{ minWidth: 0, flex: '1 1 180px' }}>
          <p style={{
            ...theme.typography.h3,
            fontFamily: theme.fonts.display,
            color: theme.colors.txt.primary,
            margin: '0 0 2px',
            // break-word, not anywhere: try the space first, and only split a
            // word that genuinely cannot fit on a line of its own.
            overflowWrap: 'break-word',
          }}>
            {shown}
          </p>
          <p style={{
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.mono,
            color: theme.colors.txt.tertiary,
            margin: 0,
            overflowWrap: 'anywhere',
          }}>
            {email}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          /* Disabled until the stored row has been read, so Done cannot write a
             default over a choice this card has not seen yet. */
          disabled={editing && (saving || !loaded)}
          loading={editing && saving}
          onClick={() => (editing ? done() : setEditing(true))}
        >
          {editing ? (saving ? 'Saving…' : 'Done') : 'Edit'}
        </Button>
      </div>

      {editing && (
        <div style={{
          marginTop: theme.spacing.md,
          borderTop: `1px solid ${theme.colors.bdr.primary}`,
          paddingTop: theme.spacing.sm,
        }}>
          <SectionLabel>Colour</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {AVATAR_PALETTE.map(entry => (
              <button
                key={entry.key}
                type="button"
                aria-label={entry.label}
                aria-pressed={avatar.paletteKey === entry.key}
                onClick={() => update({ paletteKey: entry.key })}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: theme.borderRadius.md,
                  background: entry.bg,
                  cursor: 'pointer',
                  border: avatar.paletteKey === entry.key
                    ? `2px solid ${theme.colors.txt.primary}`
                    : '2px solid transparent',
                }}
              />
            ))}
          </div>

          <SectionLabel>Show</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
            <Button
              variant={avatar.mode === 'initials' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => update({ mode: 'initials' })}
            >
              Initials
            </Button>
            <Button
              variant={avatar.mode === 'icon' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => update({ mode: 'icon' })}
            >
              Icon
            </Button>
          </div>

          {avatar.mode === 'icon' ? (
            <>
              {/* Grouped, not one grid of thirty.

                  Six icons were a row you took in at a glance. Thirty is a wall,
                  and the thing a dancer is actually looking for — "the ballet
                  one" — is findable in it only by reading every tile. The
                  headings ARE the search. */}
              {AVATAR_ICON_GROUPS.map(group => (
                <div key={group}>
                  <SectionLabel>{group}</SectionLabel>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                    {iconsInGroup(group).map(key => (
                      <button
                        key={key}
                        type="button"
                        aria-label={AVATAR_ICON_META[key].label}
                        aria-pressed={avatar.iconKey === key}
                        onClick={() => update({ iconKey: key as AvatarIconKey })}
                        style={{
                          padding: '2px',
                          borderRadius: theme.borderRadius.md,
                          background: 'transparent',
                          cursor: 'pointer',
                          lineHeight: 0,
                          border: avatar.iconKey === key
                            ? `2px solid ${theme.colors.primary}`
                            : `2px solid ${theme.colors.bdr.primary}`,
                        }}
                      >
                        <ProfileAvatar
                          config={{ ...avatar, mode: 'icon', iconKey: key as AvatarIconKey }}
                          fallbackInitials={fallback}
                          size={36}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div style={{ maxWidth: '160px', marginTop: theme.spacing.sm }}>
              <Input
                label="Initials"
                value={avatar.initials}
                maxLength={2}
                placeholder={fallback}
                onChange={e => update({ initials: e.target.value })}
              />
            </div>
          )}

          <SectionLabel>Shape</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {AVATAR_SHAPES.map(shape => (
              <button
                key={shape}
                type="button"
                aria-label={AVATAR_SHAPE_LABELS[shape]}
                aria-pressed={avatar.shape === shape}
                onClick={() => update({ shape })}
                style={{
                  padding: '2px',
                  borderRadius: theme.borderRadius.md,
                  background: 'transparent',
                  cursor: 'pointer',
                  lineHeight: 0,
                  border: avatar.shape === shape
                    ? `2px solid ${theme.colors.primary}`
                    : `2px solid ${theme.colors.bdr.primary}`,
                }}
              >
                <ProfileAvatar config={{ ...avatar, shape }} fallbackInitials={fallback} size={36} />
              </button>
            ))}
          </div>

          {/* Every swatch below is the avatar you are actually building, not a
              generic sample — same colour, same glyph, same shape, one texture
              changed. A picker that previews the option out of context makes
              you choose twice. */}
          <SectionLabel>Texture</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {AVATAR_PATTERNS.map(pattern => (
              <button
                key={pattern}
                type="button"
                aria-label={AVATAR_PATTERN_LABELS[pattern]}
                aria-pressed={avatar.pattern === pattern}
                onClick={() => update({ pattern })}
                style={{
                  padding: '2px',
                  borderRadius: theme.borderRadius.md,
                  background: 'transparent',
                  cursor: 'pointer',
                  lineHeight: 0,
                  border: avatar.pattern === pattern
                    ? `2px solid ${theme.colors.primary}`
                    : `2px solid ${theme.colors.bdr.primary}`,
                }}
              >
                <ProfileAvatar config={{ ...avatar, pattern }} fallbackInitials={fallback} size={36} />
              </button>
            ))}
          </div>

          <SectionLabel>Outline</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, alignItems: 'center' }}>
            <Button
              variant={avatar.ring ? 'primary' : 'outline'}
              size="sm"
              onClick={() => update({ ring: !avatar.ring })}
            >
              {avatar.ring ? 'Outline on' : 'Outline off'}
            </Button>
            <ProfileAvatar config={{ ...avatar, ring: !avatar.ring }} fallbackInitials={fallback} size={32} />
          </div>

          <div style={{ maxWidth: '260px', marginTop: theme.spacing.sm }}>
            <Input
              label="Nickname"
              value={nickname}
              maxLength={24}
              placeholder={firstName}
              onChange={e => setNickname(e.target.value.replace(CONTROL_CHARS, ''))}
            />
            <p style={{
              ...theme.typography.captionSmall,
              fontFamily: theme.fonts.primary,
              color: theme.colors.txt.tertiary,
              margin: '4px 0 0',
            }}>
              Only your family sees this. Class lists always use the enrollment name.
            </p>
          </div>

          {error && (
            <p style={{
              ...theme.typography.captionSmall,
              fontFamily: theme.fonts.primary,
              color: theme.colors.status.error,
              margin: `${theme.spacing.sm} 0 0`,
            }}>
              {error}
            </p>
          )}
        </div>
      )}
    </Card>
  );
};

export default IdentityCard;
