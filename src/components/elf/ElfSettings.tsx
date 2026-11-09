import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../../theme';
import { useToast } from '../../contexts/ToastContext';
import { useElfScout, isMissingElfColumn } from '../../hooks/useElfScout';
import { localDayKey, suggestedEnd } from '../../lib/homeScenes';
import { ELF_RESET_EVENT, elfFoundToday, elfIsOut, elfPageFor, forgetElfFound } from '../../lib/elfScout';
import { burstSparkles } from '../../lib/sparkles';
import { Button, Input, Toggle } from '../ui';

const ElfStage = lazy(() => import('./ElfStage'));

/**
 * Settings → Christmas elf. Super admin only (the caller decides; v78 refuses
 * the save for anyone else anyway).
 *
 * Switches the hide-and-seek elf on for staff (and optionally parents) until
 * a date, shows where he is hiding today, and has a live preview of him on a
 * little shelf: tap him there to see the pop without using up today's find.
 */

const PREVIEW_H = 170;
const PREVIEW_W = Math.round(PREVIEW_H * 0.62);

const ElfSettings: React.FC = () => {
  const { setting, save } = useElfScout(true);
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(!!setting?.enabled);
  const [endsOn, setEndsOn] = useState(setting?.endsOn || '');
  const [onPortal, setOnPortal] = useState(!!setting?.onPortal);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [foundHere, setFoundHere] = useState(() => elfFoundToday());

  useEffect(() => {
    setEnabled(!!setting?.enabled);
    setEndsOn(setting?.endsOn || '');
    setOnPortal(!!setting?.onPortal);
  }, [setting?.enabled, setting?.endsOn, setting?.onPortal]);

  const dirty =
    enabled !== !!setting?.enabled ||
    (enabled && (endsOn !== (setting?.endsOn || '') || onPortal !== !!setting?.onPortal));
  const today = localDayKey();
  const endInPast = !!endsOn && endsOn < today;
  const out = elfIsOut(setting, today);
  const staffPage = elfPageFor(today, 'staff');
  const portalPage = elfPageFor(today, 'portal');

  const toggle = (next: boolean) => {
    setEnabled(next);
    if (next && !endsOn) setEndsOn(suggestedEnd('christmas') || '');
  };

  const onSave = async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      await save({ enabled, endsOn: enabled ? endsOn || null : null, onPortal: enabled && onPortal });
      showToast(
        enabled
          ? `The elf is out. Today he is hiding on ${staffPage.label}${onPortal ? `, and on ${portalPage.label} for parents` : ''}.`
          : 'The elf has gone back to the North Pole.',
        'success',
      );
    } catch (e) {
      const message = (e as { message?: string })?.message || '';
      showToast(
        isMissingElfColumn(message)
          ? 'The Christmas elf is not set up on the server yet (migration v82).'
          : /super admin/.test(message)
            ? message
            : "Couldn't save. Check your connection and try again.",
        'error',
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const bringBack = () => {
    forgetElfFound();
    setFoundHere(false);
    window.dispatchEvent(new Event(ELF_RESET_EVENT));
  };

  return (
    <div>
      <div style={styles.top}>
        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
          <p style={styles.lede}>
            A little felt elf hides somewhere in the app every day. Whoever spots him taps him: he bursts into
            sparkles, says <em>&ldquo;You found me, fa la la la la!&rdquo;</em> and is gone until tomorrow, when he
            has moved somewhere new. He sits on the edge of a card like it&apos;s a shelf.
          </p>
          <p style={styles.now} role="status" aria-live="polite">
            {out ? (
              <>
                Out now{setting?.endsOn && <> until {formatDay(setting.endsOn)}</>}. Today he is hiding on{' '}
                <strong style={{ color: theme.colors.txt.primary }}>{staffPage.label}</strong>
                {setting?.onPortal && <>, and on <strong style={{ color: theme.colors.txt.primary }}>{portalPage.label}</strong> for parents</>}.
              </>
            ) : (
              <>He is not out. Switch him on and save to start the hide and seek.</>
            )}
          </p>
          {out && (
            <div style={styles.actions}>
              <Button variant="outline" size="sm" onClick={() => navigate(staffPage.path)}>
                Go find him
              </Button>
              {foundHere && (
                <Button variant="ghost" size="sm" onClick={bringBack}>
                  Hide him again on this device
                </Button>
              )}
            </div>
          )}
        </div>
        <ElfPreview />
      </div>

      <div style={styles.row}>
        <div style={{ minWidth: 0 }}>
          <div id="elf-on-label" style={styles.label}>Hide the elf in the app</div>
          <div style={styles.hint}>Staff find him on pages everyone can open: Home, My Tasks, Calendar, SOPs, Shift reports and My account.</div>
        </div>
        <Toggle checked={enabled} onChange={toggle} labelledBy="elf-on-label" />
      </div>

      {enabled && (
        <>
          <div style={styles.row}>
            <div style={{ minWidth: 0 }}>
              <div id="elf-portal-label" style={styles.label}>Parents can find him too</div>
              <div style={styles.hint}>He also hides on the parent portal: the portal home, a section overview, Classes, Updates or the calendar.</div>
            </div>
            <Toggle checked={onPortal} onChange={setOnPortal} labelledBy="elf-portal-label" />
          </div>
          <div style={styles.until}>
            <Input
              id="elf-until"
              type="date"
              label="Hide until (last day)"
              value={endsOn}
              min={today}
              onChange={e => setEndsOn(e.target.value)}
              helperText={endsOn ? 'He goes home to the North Pole the morning after.' : 'Leave empty to keep him out until you switch him off.'}
              error={endInPast ? 'That day has passed, so he would not come out at all.' : undefined}
            />
          </div>
        </>
      )}

      <div style={styles.footer}>
        <Button variant="primary" onClick={onSave} loading={saving} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save for everyone'}
        </Button>
      </div>
    </div>
  );
};

/** The elf on a little shelf. Tap him to see the pop; he comes back. */
const ElfPreview: React.FC = () => {
  const [edge, setEdge] = useState<number | null>(null);
  const [popping, setPopping] = useState(false);
  const [round, setRound] = useState(0);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);

  const pop = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (busy.current) return;
    busy.current = true;
    const r = e.currentTarget.getBoundingClientRect();
    burstSparkles(r.left + r.width / 2, r.top + r.height * 0.4);
    setPopping(true);
  };
  const back = () => {
    window.setTimeout(() => {
      setPopping(false);
      setRound(n => n + 1);
      busy.current = false;
    }, 1400);
  };

  const shelfTop = Math.round(PREVIEW_H * (edge ?? 0.7));
  return (
    <div style={styles.previewWrap} aria-label="Preview of the elf on a shelf">
      <div style={{ ...styles.shelf, top: shelfTop }} />
      {failed ? (
        <div style={styles.noGl}>This device can&apos;t draw 3D, so he stays hidden on it.</div>
      ) : (
        <div style={{ position: 'absolute', left: '50%', marginLeft: -PREVIEW_W / 2, top: 0, width: PREVIEW_W, height: PREVIEW_H }}>
          <Suspense fallback={null}>
            <ElfStage
              key={round}
              width={PREVIEW_W}
              height={PREVIEW_H}
              facing={1}
              popping={popping}
              onLayout={setEdge}
              onGone={back}
              onFail={() => setFailed(true)}
            />
          </Suspense>
          <button
            type="button"
            onClick={pop}
            disabled={popping}
            aria-label="Tap the preview elf to see him pop"
            style={styles.previewHit}
          />
        </div>
      )}
      <div style={styles.previewCaption}>{popping ? 'Fa la la la la!' : 'Tap him to try it'}</div>
    </div>
  );
};

const formatDay = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const styles: { [key: string]: React.CSSProperties } = {
  top: { display: 'flex', flexWrap: 'wrap', gap: theme.spacing.md, alignItems: 'flex-start' },
  lede: { margin: `0 0 ${theme.spacing.sm}`, fontSize: '14px', lineHeight: 1.5, color: theme.colors.txt.secondary },
  now: { margin: 0, fontSize: '13px', lineHeight: 1.5, color: theme.colors.txt.tertiary, overflowWrap: 'anywhere' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  previewWrap: {
    position: 'relative',
    flex: '0 0 auto',
    width: '160px',
    height: `${PREVIEW_H + 46}px`,
    margin: '0 auto',
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.bg.primary,
    border: `1px solid ${theme.colors.bdr.primary}`,
    overflow: 'hidden',
  },
  shelf: {
    position: 'absolute',
    left: '12px',
    right: '12px',
    height: '56px',
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.bg.secondary,
    border: `2px solid ${theme.colors.bdr.secondary}`,
  },
  previewHit: {
    position: 'absolute', left: '15%', width: '70%', top: '4%', height: '94%',
    padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
  },
  previewCaption: {
    position: 'absolute', left: 0, right: 0, bottom: '8px', textAlign: 'center',
    fontSize: '12px', fontWeight: 600, color: theme.colors.txt.tertiary,
  },
  noGl: { position: 'absolute', inset: '12px', display: 'flex', alignItems: 'center', textAlign: 'center', fontSize: '12px', color: theme.colors.txt.tertiary },
  row: {
    marginTop: theme.spacing.md,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  label: { fontWeight: 600, fontSize: '14px', color: theme.colors.txt.primary },
  hint: { fontSize: '12px', color: theme.colors.txt.tertiary, overflowWrap: 'anywhere' },
  until: { marginTop: theme.spacing.md, maxWidth: '260px' },
  footer: { marginTop: theme.spacing.lg, display: 'flex', justifyContent: 'flex-end' },
};

export default ElfSettings;
