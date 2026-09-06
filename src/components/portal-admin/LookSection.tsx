import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { theme } from '../../theme';
import { Badge, Button, Card, Input, Modal, Spinner } from '../ui';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../hooks/useConfirm';
import { useRefreshable } from '../../contexts/RefreshContext';
import { usePortalAdmin, describeWriteError } from '../../contexts/PortalAdminContext';
import SegmentedControl from '../profile/SegmentedControl';
import ProfileAvatar from '../profile/ProfileAvatar';
import {
  AVATAR_PALETTE, AVATAR_ICONS, AvatarIconKey, AvatarMode, paletteEntry,
} from '../../lib/avatarPalette';
import {
  InstructorLook, instructorInitials, instructorKey, lookFor,
} from '../../lib/instructorLook';
import { HERO_MIME, MAX_HERO_MB, MAX_HERO_BYTES } from '../../lib/portalAdmin';
import { PortalClass, PortalProgram } from '../../types';

/**
 * How the portal looks: the picture on this program, and the mark on each
 * teacher.
 *
 * SUPER ADMIN ONLY, AND ONE HALF OF THAT IS UI-ONLY
 *
 * portal_instructor_looks has an is_super_admin() write policy, so the teacher
 * half is enforced where it matters. The program hero writes to
 * portal_programs, whose policy is is_admin() and cannot be split by column —
 * the reasoning is in the v46 header. The route hides this whole section from
 * anyone below super admin, which is the UI being stricter than the policy.
 * That is the safe direction: nobody is offered a save the database refuses.
 *
 * WHY THE TEACHER LIST IS STUDIO-WIDE UNDER A PROGRAM TAB
 *
 * Exactly as TeachersSection is, and for the same reason: a teacher holds
 * Academy and All-Star classes alike, and splitting the job in two is how half
 * of it gets forgotten. The names come from the schedule itself — every
 * distinct instructor_name across every class — because that free-text column
 * is what a parent sees and therefore what needs styling. Nine of these people
 * have accounts and at least one does not; keying on the name rather than on a
 * profile is what lets her have a colour too.
 *
 * NOBODY HAS TO DO ANY OF THIS
 *
 * Every teacher already has a mark before this screen is opened, computed from
 * their name. The list below shows "Default" against them and it is not a
 * to-do. v44 is the lesson: a feature that needs a hundred small decisions
 * before it looks like anything gets none of them.
 */

// ------------------------------------------------------------------- hero

const HeroPanel: React.FC<{ program: PortalProgram }> = ({ program }) => {
  const { uploadProgramHero, saveProgramHeroAlt, removeProgramHero, getDocumentUrl } = usePortalAdmin();
  const { success, error: toastError } = useToast();
  const { confirm, confirmDialog } = useConfirm();

  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [alt, setAlt] = useState(program.heroAlt);
  const [busy, setBusy] = useState(false);

  // Re-signed whenever the row changes, because replacing the picture writes a
  // new object key and the old signed URL points at a file that is gone.
  useEffect(() => {
    let cancelled = false;
    setAlt(program.heroAlt);
    if (!program.heroPath) { setPreview(null); return; }

    getDocumentUrl(program.heroPath).then(url => {
      if (!cancelled) setPreview(url);
    });
    return () => { cancelled = true; };
  }, [program.heroPath, program.heroAlt, getDocumentUrl]);

  const choose = async (file: File | undefined) => {
    if (!file) return;

    // Both checks before the upload, not after. The bucket refuses a bad type
    // and an oversized file too, but its error arrives as an opaque failure
    // once the whole thing has gone up — which for 40 MB on a studio phone is
    // a minute of waiting to be told no.
    if (!HERO_MIME.includes(file.type)) {
      toastError('Pictures need to be a JPEG, PNG or WebP. A photo straight off an iPhone is usually HEIC — export it as JPEG first.');
      return;
    }
    if (file.size > MAX_HERO_BYTES) {
      toastError(`That picture is ${(file.size / 1024 / 1024).toFixed(1)} MB. Keep it under ${MAX_HERO_MB} MB — every parent downloads it on their phone.`);
      return;
    }

    setBusy(true);
    try {
      await uploadProgramHero(program, file, alt);
      success(`${program.name} has a new picture.`);
    } catch (e) {
      toastError(describeWriteError(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Remove the picture from ${program.name}?`,
      message: 'The program page goes back to its heading and cards, which is how every program looked before pictures existed. The file is deleted.',
      confirmLabel: 'Remove it',
      variant: 'warning',
    });
    if (!ok) return;

    setBusy(true);
    try {
      await removeProgramHero(program);
      success('Picture removed.');
    } catch (e) {
      toastError(describeWriteError(e));
    } finally {
      setBusy(false);
    }
  };

  const saveAlt = async () => {
    setBusy(true);
    try {
      await saveProgramHeroAlt(program.id, alt);
      success('Description saved.');
    } catch (e) {
      toastError(describeWriteError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      {confirmDialog}

      <h3 style={{ ...theme.typography.h3, color: theme.colors.txt.primary, margin: '0 0 6px' }}>
        {program.name} picture
      </h3>
      <p style={{
        ...theme.typography.bodySmall,
        fontFamily: theme.fonts.primary,
        color: theme.colors.txt.tertiary,
        margin: `0 0 ${theme.spacing.md}`,
      }}>
        Sits across the top of this program's page. It is cropped to a wide band, so
        a picture with its subject near the middle works best. JPEG, PNG or WebP, under {MAX_HERO_MB} MB.
      </p>

      {preview ? (
        <div style={{
          width: '100%',
          aspectRatio: '16 / 6',
          borderRadius: theme.borderRadius.md,
          overflow: 'hidden',
          border: `1px solid ${theme.colors.bdr.primary}`,
          marginBottom: theme.spacing.md,
          backgroundColor: theme.colors.bg.tertiary,
        }}>
          {/* The same crop the parent's page uses, so what is approved here is
              what ships. A preview that fits the whole photo in would hide
              exactly the problem this screen exists to catch. */}
          <img
            src={preview}
            alt={alt || 'Program picture'}
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 35%' }}
          />
        </div>
      ) : (
        <div style={{
          padding: theme.spacing.lg,
          borderRadius: theme.borderRadius.md,
          border: `1px dashed ${theme.colors.bdr.secondary}`,
          marginBottom: theme.spacing.md,
          ...theme.typography.bodySmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.tertiary,
          textAlign: 'center',
        }}>
          No picture. The program page shows its heading and cards, which is fine —
          this is optional.
        </div>
      )}

      <Input
        label="What the picture shows"
        placeholder="Dancers on stage at the winter showcase"
        value={alt}
        onChange={e => setAlt(e.target.value)}
        helperText="Read aloud to anyone using a screen reader, and shown if the picture cannot load. Leave it empty if the picture is purely decorative."
      />

      <input
        ref={fileRef}
        type="file"
        accept={HERO_MIME.join(',')}
        onChange={e => choose(e.target.files?.[0])}
        style={{ display: 'none' }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
        <Button
          variant="primary"
          disabled={busy}
          loading={busy}
          onClick={() => fileRef.current?.click()}
        >
          {program.heroPath ? 'Replace picture' : 'Choose a picture'}
        </Button>

        {program.heroPath && (
          <>
            <Button variant="secondary" disabled={busy || alt === program.heroAlt} onClick={saveAlt}>
              Save description
            </Button>
            <Button variant="danger" disabled={busy} onClick={remove}>
              Remove
            </Button>
          </>
        )}
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------- teachers

interface Draft {
  nameKey: string;
  displayName: string;
  mode: AvatarMode;
  initials: string;
  iconKey: AvatarIconKey;
  paletteKey: string;
}

const Swatches: React.FC<{
  value: string;
  onChange: (key: string) => void;
}> = ({ value, onChange }) => (
  <div
    role="group"
    aria-label="Colour"
    style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs }}
  >
    {AVATAR_PALETTE.map(entry => (
      <button
        key={entry.key}
        type="button"
        onClick={() => onChange(entry.key)}
        aria-pressed={entry.key === value}
        aria-label={entry.label}
        title={entry.label}
        style={{
          width: '34px',
          height: '34px',
          borderRadius: theme.borderRadius.md,
          background: entry.bg,
          // The selected swatch is marked by a ring in the page's own border
          // colour, not by a tick in the swatch's foreground: several of these
          // are pale and a tick on them is invisible at 34px.
          border: entry.key === value
            ? `3px solid ${theme.colors.txt.primary}`
            : `1px solid ${theme.colors.bdr.primary}`,
          cursor: 'pointer',
          padding: 0,
        }}
      />
    ))}
  </div>
);

const IconChoices: React.FC<{
  value: AvatarIconKey;
  paletteKey: string;
  onChange: (key: AvatarIconKey) => void;
}> = ({ value, paletteKey, onChange }) => (
  <div
    role="group"
    aria-label="Symbol"
    style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs }}
  >
    {AVATAR_ICONS.map(key => (
      <button
        key={key}
        type="button"
        onClick={() => onChange(key)}
        aria-pressed={key === value}
        aria-label={key}
        title={key}
        style={{
          padding: '3px',
          borderRadius: theme.borderRadius.md,
          background: 'transparent',
          border: key === value
            ? `3px solid ${theme.colors.txt.primary}`
            : `1px solid ${theme.colors.bdr.primary}`,
          cursor: 'pointer',
          display: 'flex',
        }}
      >
        <ProfileAvatar
          config={{ mode: 'icon', initials: '', iconKey: key, paletteKey }}
          fallbackInitials=""
          size={30}
        />
      </button>
    ))}
  </div>
);

const TeacherEditor: React.FC<{
  draft: Draft;
  stored: boolean;
  onClose: () => void;
  onSaved: () => void;
}> = ({ draft: initial, stored, onClose, onSaved }) => {
  const { saveInstructorLook, resetInstructorLook } = usePortalAdmin();
  const { success, error: toastError } = useToast();
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft(d => ({ ...d, [key]: value }));

  const save = async () => {
    setBusy(true);
    try {
      await saveInstructorLook(draft as InstructorLook);
      success(`${draft.displayName} updated.`);
      onSaved();
    } catch (e) {
      toastError(describeWriteError(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await resetInstructorLook(draft.nameKey);
      success(`${draft.displayName} is back to the automatic mark.`);
      onSaved();
    } catch (e) {
      toastError(describeWriteError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={draft.displayName}
      size="sm"
      footer={
        <>
          {stored && (
            <Button variant="ghost" disabled={busy} onClick={reset}>
              Back to automatic
            </Button>
          )}
          <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy} loading={busy} onClick={save}>Save</Button>
        </>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.lg }}>
        <ProfileAvatar
          config={{
            mode: draft.mode,
            initials: draft.initials || instructorInitials(draft.displayName),
            iconKey: draft.iconKey,
            paletteKey: draft.paletteKey,
          }}
          fallbackInitials="·"
          size={56}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{
            ...theme.typography.bodySmall,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.secondary,
            overflowWrap: 'anywhere',
          }}>
            This is what parents see next to {draft.displayName} on every class.
          </div>
          <div style={{
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.mono,
            color: theme.colors.txt.tertiary,
            marginTop: '4px',
          }}>
            {paletteEntry(draft.paletteKey).label}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: theme.spacing.md }}>
        <SegmentedControl<AvatarMode>
          options={[{ value: 'initials', label: 'Initials' }, { value: 'icon', label: 'Symbol' }]}
          value={draft.mode}
          onChange={mode => set('mode', mode)}
          ariaLabel="Initials or symbol"
        />
      </div>

      {draft.mode === 'initials' ? (
        <div style={{ marginBottom: theme.spacing.md }}>
          <Input
            label="Letters"
            value={draft.initials}
            maxLength={2}
            placeholder={instructorInitials(draft.displayName)}
            /* Upper-cased and stripped as typed rather than validated on save:
               the field can only ever hold something the palette validator and
               the v46 CHECK both accept, so there is no state in which Save is
               refused for a reason the person has to guess at. */
            onChange={e => set('initials', e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2))}
            helperText="Leave it empty to use the initials of the name on the schedule."
          />
        </div>
      ) : (
        <div style={{ marginBottom: theme.spacing.md }}>
          <div style={{
            ...theme.typography.captionSmall,
            fontFamily: theme.fonts.mono,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: theme.colors.txt.tertiary,
            marginBottom: theme.spacing.xs,
          }}>
            Symbol
          </div>
          <IconChoices
            value={draft.iconKey}
            paletteKey={draft.paletteKey}
            onChange={key => set('iconKey', key)}
          />
        </div>
      )}

      <div style={{
        ...theme.typography.captionSmall,
        fontFamily: theme.fonts.mono,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: theme.colors.txt.tertiary,
        marginBottom: theme.spacing.xs,
      }}>
        Colour
      </div>
      <Swatches value={draft.paletteKey} onChange={key => set('paletteKey', key)} />
      <p style={{
        ...theme.typography.captionSmall,
        fontFamily: theme.fonts.primary,
        color: theme.colors.txt.tertiary,
        margin: `${theme.spacing.sm} 0 0`,
      }}>
        Electric is the studio's own pink and is deliberately never handed out
        automatically — it reads as "important" everywhere else in the app, so it
        is worth keeping for at most one person.
      </p>
    </Modal>
  );
};

// ------------------------------------------------------------------ section

const LookSection: React.FC<{ program: PortalProgram }> = ({ program }) => {
  const { fetchAllClasses, fetchInstructorLooks } = usePortalAdmin();

  const [classes, setClasses] = useState<PortalClass[]>([]);
  const [looks, setLooks] = useState<Record<string, InstructorLook>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [nextClasses, nextLooks] = await Promise.all([
        fetchAllClasses(),
        fetchInstructorLooks(),
      ]);
      setClasses(nextClasses);
      const byKey: Record<string, InstructorLook> = {};
      nextLooks.forEach(l => { byKey[l.nameKey] = l; });
      setLooks(byKey);
      setLoadError(null);
    } catch (e) {
      if (silent) throw e;
      setLoadError(describeWriteError(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fetchAllClasses, fetchInstructorLooks]);

  useEffect(() => { void load(); }, [load]);
  useRefreshable(useCallback(() => load(true), [load]), true);

  /**
   * One row per distinct teacher, with the class count beside them.
   *
   * Folded by nameKey, which is what makes "Ky'Ree" and "Kyree" one person
   * here as well as one look. The name shown is the first spelling the
   * schedule uses; the count is every class under any of its spellings, which
   * is the honest number and also a quiet way to notice a typo.
   */
  const teachers = useMemo(() => {
    const byKey = new Map<string, { displayName: string; count: number }>();

    classes.forEach(c => {
      const name = c.instructorName?.trim();
      if (!name) return;
      const key = instructorKey(name);
      if (!key) return;

      const found = byKey.get(key);
      if (found) found.count += 1;
      else byKey.set(key, { displayName: name, count: 1 });
    });

    return Array.from(byKey.entries())
      .map(([nameKey, v]) => ({ nameKey, ...v }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [classes]);

  const draftFor = (nameKey: string, displayName: string): Draft => {
    const config = lookFor(displayName, looks);
    return {
      nameKey,
      displayName,
      mode: config.mode,
      // The stored value, not the resolved one: an empty field means "use the
      // name", and pre-filling it with the computed letters would silently turn
      // that into a stored copy the next time somebody pressed Save.
      initials: looks[nameKey]?.initials ?? '',
      iconKey: config.iconKey,
      paletteKey: config.paletteKey,
    };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.lg }}>
      <HeroPanel program={program} />

      <Card>
        <h3 style={{ ...theme.typography.h3, color: theme.colors.txt.primary, margin: '0 0 6px' }}>
          Teachers
        </h3>
        <p style={{
          ...theme.typography.bodySmall,
          fontFamily: theme.fonts.primary,
          color: theme.colors.txt.tertiary,
          margin: `0 0 ${theme.spacing.md}`,
        }}>
          Every teacher on the schedule already has a mark, worked out from their name.
          Change one only when you want to — "Default" below is not a job to do.
        </p>

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: theme.spacing.xl }}>
            <Spinner size={24} color={theme.colors.primary} />
          </div>
        )}

        {!loading && loadError && (
          <p style={{
            ...theme.typography.bodySmall,
            fontFamily: theme.fonts.primary,
            color: theme.colors.status.error,
            margin: 0,
          }}>
            {loadError}
          </p>
        )}

        {!loading && !loadError && teachers.length === 0 && (
          <p style={{
            ...theme.typography.bodySmall,
            fontFamily: theme.fonts.primary,
            color: theme.colors.txt.tertiary,
            margin: 0,
          }}>
            No class on the schedule names a teacher yet. Add one to a class and they appear here.
          </p>
        )}

        {!loading && !loadError && teachers.map(t => (
          <div
            key={t.nameKey}
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: theme.spacing.sm,
              padding: `${theme.spacing.sm} 0`,
              borderBottom: `1px solid ${theme.colors.bdr.primary}`,
            }}
          >
            <ProfileAvatar
              config={lookFor(t.displayName, looks)}
              fallbackInitials="·"
              size={34}
            />

            <div style={{ flex: 1, minWidth: '120px' }}>
              <div style={{
                ...theme.typography.body,
                fontFamily: theme.fonts.primary,
                fontWeight: 600,
                color: theme.colors.txt.primary,
                overflowWrap: 'anywhere',
              }}>
                {t.displayName}
              </div>
              <div style={{
                ...theme.typography.captionSmall,
                fontFamily: theme.fonts.mono,
                color: theme.colors.txt.tertiary,
              }}>
                {t.count} {t.count === 1 ? 'class' : 'classes'}
              </div>
            </div>

            <Badge variant={looks[t.nameKey] ? 'primary' : 'default'} size="sm">
              {looks[t.nameKey] ? 'Chosen' : 'Default'}
            </Badge>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(draftFor(t.nameKey, t.displayName))}
            >
              Change
            </Button>
          </div>
        ))}
      </Card>

      {editing && (
        <TeacherEditor
          draft={editing}
          stored={!!looks[editing.nameKey]}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(true).catch(() => { /* the list stays as it was */ }); }}
        />
      )}
    </div>
  );
};

export default LookSection;
