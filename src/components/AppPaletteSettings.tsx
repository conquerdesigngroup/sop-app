import React, { useEffect, useRef, useState } from 'react';
import { theme } from '../theme';
import { useToast } from '../contexts/ToastContext';
import { useAppPalette } from '../hooks/useAppPalette';
import { localDayKey } from '../lib/homeScenes';
import {
  APP_PALETTES,
  AppPalette,
  DEFAULT_PALETTE_ID,
  applyPalette,
  effectivePaletteId,
} from '../lib/appPalettes';
import { Badge, Button, Input } from './ui';

/**
 * Settings → App colors. Super admin only (the caller decides; v78 refuses the
 * save for anyone else anyway).
 *
 * Switches the accent colour of the whole app (staff, parent portal, front
 * door) to a holiday palette, optionally until a date. Tapping a palette
 * previews it on this device straight away; nobody else sees it until Save,
 * and leaving the page without saving puts the saved one back.
 */

const AppPaletteSettings: React.FC = () => {
  const { setting, activePaletteId, save } = useAppPalette();
  const { showToast } = useToast();
  const [palette, setPalette] = useState<string>(setting?.palette || DEFAULT_PALETTE_ID);
  const [endsOn, setEndsOn] = useState<string>(setting?.endsOn || '');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    setPalette(setting?.palette || DEFAULT_PALETTE_ID);
    setEndsOn(setting?.endsOn || '');
  }, [setting?.palette, setting?.endsOn]);

  const savedPalette = setting?.palette || DEFAULT_PALETTE_ID;
  const dirty =
    palette !== savedPalette ||
    (palette !== DEFAULT_PALETTE_ID && endsOn !== (setting?.endsOn || ''));

  // Preview an unsaved choice on this device; otherwise show what everyone
  // sees. Put the saved one back on the way out.
  const savedRef = useRef(setting);
  savedRef.current = setting;
  const showing = palette !== savedPalette ? palette : activePaletteId;
  useEffect(() => { applyPalette(showing); }, [showing]);
  useEffect(() => () => { applyPalette(effectivePaletteId(savedRef.current)); }, []);
  const endInPast = !!endsOn && endsOn < localDayKey();

  const onSave = async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      await save({ palette, endsOn: palette === DEFAULT_PALETTE_ID ? null : endsOn || null });
      const p = APP_PALETTES.find(x => x.id === palette);
      showToast(
        palette === DEFAULT_PALETTE_ID
          ? 'The app is back to the everyday DIDC colors.'
          : `${p?.name} is now on for everyone.`,
        'success',
      );
    } catch (e) {
      const message = (e as { message?: string })?.message || '';
      showToast(
        /palette|home_scene_setting/.test(message) && /does not exist|schema cache|not find/i.test(message)
          ? 'App colors are not set up on the server yet (migration v81).'
          : /super admin/.test(message)
            ? message
            : "Couldn't save the app colors. Check your connection and try again.",
        'error',
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const live = APP_PALETTES.find(p => p.id === activePaletteId);

  return (
    <div>
      <p style={styles.lede}>
        Change the accent color of the whole app for a holiday: buttons, tabs, links and highlights, for staff,
        parents and the front door. Backgrounds and text stay the same, in light and dark mode.
      </p>
      <p style={styles.now} role="status" aria-live="polite">
        On now for everyone: <strong style={{ color: theme.colors.txt.primary }}>{live?.name}</strong>
        {activePaletteId !== DEFAULT_PALETTE_ID && setting?.endsOn && <> until {formatDay(setting.endsOn)}</>}
        {palette !== savedPalette && <> · previewing {APP_PALETTES.find(p => p.id === palette)?.name} on this screen until you save</>}
      </p>

      <div style={styles.grid} role="radiogroup" aria-label="App colors">
        {APP_PALETTES.map(p => (
          <PaletteOption
            key={p.id}
            palette={p}
            selected={palette === p.id}
            live={activePaletteId === p.id}
            onChoose={setPalette}
          />
        ))}
      </div>

      {palette !== DEFAULT_PALETTE_ID && (
        <div style={styles.until}>
          <Input
            id="app-palette-until"
            type="date"
            label="Show until (last day)"
            value={endsOn}
            min={localDayKey()}
            onChange={e => setEndsOn(e.target.value)}
            helperText={endsOn ? 'The app switches back to the everyday colors the morning after.' : 'Leave empty to keep it on until you switch it back.'}
            error={endInPast ? 'That day has passed, so the app would go straight back to the everyday colors.' : undefined}
          />
        </div>
      )}

      <div style={styles.footer}>
        <Button variant="primary" onClick={onSave} loading={saving} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save for everyone'}
        </Button>
      </div>
    </div>
  );
};

const formatDay = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

/**
 * Each option draws its own colours as literal hex, not the --c-accent
 * variable, so every swatch shows its palette whatever is being previewed.
 */
const PaletteOption: React.FC<{
  palette: AppPalette;
  selected: boolean;
  live: boolean;
  onChoose: (id: string) => void;
}> = ({ palette: p, selected, live, onChoose }) => (
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    onClick={() => onChoose(p.id)}
    style={{
      ...styles.option,
      borderColor: selected ? p.accent : theme.colors.bdr.primary,
    }}
  >
    <span style={styles.swatchRow} aria-hidden="true">
      <span style={{ ...styles.pill, backgroundColor: p.accent }}>Save</span>
      <span style={{ ...styles.dot, backgroundColor: p.hover }} />
      <span style={{ ...styles.dot, backgroundColor: p.dark }} />
    </span>
    <span style={styles.optionName}>
      {p.name}
      {live && <Badge variant="success">On now</Badge>}
    </span>
    <span style={styles.optionBlurb}>{p.blurb}</span>
  </button>
);

const styles: Record<string, React.CSSProperties> = {
  lede: { margin: `0 0 ${theme.spacing.sm}`, color: theme.colors.txt.secondary, fontSize: '14px', lineHeight: 1.5 },
  now: { margin: `0 0 ${theme.spacing.md}`, color: theme.colors.txt.tertiary, fontSize: '13px', overflowWrap: 'anywhere' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: theme.spacing.sm,
  },
  option: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '6px',
    textAlign: 'left',
    padding: theme.spacing.sm,
    minWidth: 0,
    cursor: 'pointer',
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderStyle: 'solid',
    backgroundColor: theme.colors.bg.tertiary,
    color: theme.colors.txt.primary,
    font: 'inherit',
  },
  swatchRow: { display: 'flex', alignItems: 'center', gap: '6px' },
  pill: {
    padding: '4px 12px',
    borderRadius: theme.borderRadius.full,
    color: '#FFFFFF',
    fontSize: '12px',
    fontWeight: 700,
  },
  dot: { width: '16px', height: '16px', borderRadius: theme.borderRadius.full },
  optionName: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', fontWeight: 600, fontSize: '14px' },
  optionBlurb: { fontSize: '12px', lineHeight: 1.4, color: theme.colors.txt.tertiary, overflowWrap: 'anywhere' },
  until: { marginTop: theme.spacing.md, maxWidth: '260px' },
  footer: { marginTop: theme.spacing.lg, display: 'flex', justifyContent: 'flex-end' },
};

export default AppPaletteSettings;
