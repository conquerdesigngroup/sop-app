import React, { useEffect, useRef, useState } from 'react';
import { theme } from '../theme';
import { useToast } from '../contexts/ToastContext';
import { useHomeScene } from '../hooks/useHomeScene';
import { DEFAULT_SCENE_ID, HOLIDAY_SEASONS, HOME_SCENES, HolidaySeason, effectiveSceneId, localDayKey } from '../lib/homeScenes';
import { Badge, Button, Input, Toggle } from './ui';
import { SceneCanvas } from './HomeScene';

/**
 * Settings → Home background. Super admin only (the caller decides; v78 refuses
 * the save for anyone else anyway).
 *
 * Picks one background for every staff member's Home: the everyday contour
 * lines, or one of the seasonal scenes in src/lib/homeScenes.ts, optionally
 * until a date, after which Home goes back to the contour lines by itself.
 *
 * Every preview is a still frame except the one that is selected, which
 * animates: eight live canvases on a phone would cost more than the page.
 */

/**
 * A sensible "until" for each holiday. Christmas: Twelfth Night of the coming
 * season. Thanksgiving: the Sunday after it (the fourth Thursday of November),
 * this year's, or next year's once this year's has gone.
 */
export const suggestedEnd = (season: HolidaySeason, today = new Date()): string => {
  if (season === 'thanksgiving') {
    const sundayAfter = (y: number) => {
      const first = new Date(y, 10, 1).getDay();
      const thursday = 1 + ((4 - first + 7) % 7) + 21;
      return new Date(y, 10, thursday + 3);
    };
    let end = sundayAfter(today.getFullYear());
    if (localDayKey(end) < localDayKey(today)) end = sundayAfter(today.getFullYear() + 1);
    return localDayKey(end);
  }
  const year = today.getMonth() === 0 ? today.getFullYear() : today.getFullYear() + 1;
  return `${year}-01-06`;
};

const HomeSceneSettings: React.FC = () => {
  const { setting, save } = useHomeScene();
  const { showToast } = useToast();
  const [scene, setScene] = useState<string>(setting?.scene || DEFAULT_SCENE_ID);
  const [endsOn, setEndsOn] = useState<string>(setting?.endsOn || '');
  const [onPortal, setOnPortal] = useState<boolean>(!!setting?.showOnPortal);
  const [onChooser, setOnChooser] = useState<boolean>(!!setting?.showOnChooser);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  // True while the date is one we filled in, so picking another holiday's
  // scene moves it to that holiday's date; false once someone types a date.
  const autoEnd = useRef(false);

  // When the saved value arrives (or changes from a refresh), show it.
  useEffect(() => {
    setScene(setting?.scene || DEFAULT_SCENE_ID);
    setEndsOn(setting?.endsOn || '');
    setOnPortal(!!setting?.showOnPortal);
    setOnChooser(!!setting?.showOnChooser);
  }, [setting?.scene, setting?.endsOn, setting?.showOnPortal, setting?.showOnChooser]);

  const live = effectiveSceneId(setting);
  const savedScene = setting?.scene || DEFAULT_SCENE_ID;
  const dirty =
    scene !== savedScene ||
    (scene !== DEFAULT_SCENE_ID && (endsOn !== (setting?.endsOn || '') ||
      onPortal !== !!setting?.showOnPortal ||
      onChooser !== !!setting?.showOnChooser));
  const endInPast = !!endsOn && endsOn < localDayKey();

  const choose = (id: string) => {
    setScene(id);
    const season = HOME_SCENES.find(s => s.id === id)?.season;
    if (season && (!endsOn || autoEnd.current)) {
      setEndsOn(suggestedEnd(season));
      autoEnd.current = true;
    }
  };

  const onSave = async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const next = {
        scene,
        endsOn: scene === DEFAULT_SCENE_ID ? null : endsOn || null,
        // Only sent when they change, so a database without v79/v80 can still save.
        ...(onPortal !== !!setting?.showOnPortal ? { showOnPortal: onPortal } : {}),
        ...(onChooser !== !!setting?.showOnChooser ? { showOnChooser: onChooser } : {}),
      };
      await save(next);
      const name = HOME_SCENES.find(s => s.id === scene)?.name;
      const extra = [onChooser && 'the front door', onPortal && 'the parent portal'].filter(Boolean).join(' and ');
      showToast(
        name
          ? `${name} is now on everyone's Home${extra ? ` and ${extra}` : ''}.`
          : 'Home is back to the everyday background.',
        'success',
      );
    } catch (e) {
      const message = (e as { message?: string })?.message || '';
      showToast(
        /home_scene_setting/.test(message)
          ? 'Holiday backgrounds are not fully set up on the server yet (migrations v78 to v80).'
          : "Couldn't save the Home background. Check your connection and try again.",
        'error',
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const liveName = live === DEFAULT_SCENE_ID ? 'Everyday contour lines' : HOME_SCENES.find(s => s.id === live)?.name;

  return (
    <div>
      <p style={styles.lede}>
        Choose the background behind everyone&apos;s Home screen. Seasonal scenes switch back to the everyday
        contour lines by themselves after the date you set.
      </p>
      <p style={styles.now} role="status" aria-live="polite">
        Showing now: <strong style={{ color: theme.colors.txt.primary }}>{liveName}</strong>
        {live !== DEFAULT_SCENE_ID && setting?.endsOn && <> until {formatDay(setting.endsOn)}</>}
        {live !== DEFAULT_SCENE_ID && (setting?.showOnPortal || setting?.showOnChooser) && (
          <>, also on {[setting?.showOnChooser && 'the front door', setting?.showOnPortal && 'the parent portal'].filter(Boolean).join(' and ')}</>
        )}
      </p>

      <div role="radiogroup" aria-label="Home background">
      <div style={styles.grid}>
        <SceneOption
          id={DEFAULT_SCENE_ID}
          name="Everyday"
          blurb="The contour lines Home always has."
          selected={scene === DEFAULT_SCENE_ID}
          live={live === DEFAULT_SCENE_ID}
          onChoose={choose}
        />
      </div>
      {HOLIDAY_SEASONS.map(season => (
        <React.Fragment key={season.id}>
          <h4 id={`home-scene-${season.id}`} style={styles.seasonHeading}>{season.name}</h4>
          <div style={styles.grid} role="group" aria-labelledby={`home-scene-${season.id}`}>
            {HOME_SCENES.filter(s => s.season === season.id).map(s => (
              <SceneOption
                key={s.id}
                id={s.id}
                name={s.name}
                blurb={s.blurb}
                selected={scene === s.id}
                live={live === s.id}
                onChoose={choose}
              />
            ))}
          </div>
        </React.Fragment>
      ))}
      </div>

      {scene !== DEFAULT_SCENE_ID && (
        <div style={styles.until}>
          <Input
            id="home-scene-until"
            type="date"
            label="Show until (last day)"
            value={endsOn}
            min={localDayKey()}
            onChange={e => { autoEnd.current = false; setEndsOn(e.target.value); }}
            helperText={endsOn ? undefined : 'Leave empty to keep it on until you switch it off.'}
            error={endInPast ? 'That day has passed, so Home would go straight back to everyday.' : undefined}
          />
        </div>
      )}

      {scene !== DEFAULT_SCENE_ID && (
        <div style={styles.portalRow}>
          <div style={{ minWidth: 0 }}>
            <div id="home-scene-portal-label" style={styles.portalLabel}>Also show on the parent portal</div>
            <div style={styles.portalHint}>Families see the same scene behind their portal pages.</div>
          </div>
          <Toggle checked={onPortal} onChange={setOnPortal} labelledBy="home-scene-portal-label" />
        </div>
      )}

      {scene !== DEFAULT_SCENE_ID && (
        <div style={styles.portalRow}>
          <div style={{ minWidth: 0 }}>
            <div id="home-scene-chooser-label" style={styles.portalLabel}>Also show on the front door</div>
            <div style={styles.portalHint}>The first screen of the app, where people choose Staff or Parent.</div>
          </div>
          <Toggle checked={onChooser} onChange={setOnChooser} labelledBy="home-scene-chooser-label" />
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

const SceneOption: React.FC<{
  id: string;
  name: string;
  blurb: string;
  selected: boolean;
  live: boolean;
  onChoose: (id: string) => void;
}> = ({ id, name, blurb, selected, live, onChoose }) => {
  const scene = HOME_SCENES.find(s => s.id === id);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onChoose(id)}
      style={{
        ...styles.option,
        borderColor: selected ? theme.colors.primary : theme.colors.bdr.primary,
      }}
    >
      <span style={styles.preview}>
        {scene ? <SceneCanvas scene={scene} contained still={!selected} /> : <EverydayPreview />}
      </span>
      <span style={styles.optionText}>
        <span style={styles.optionName}>
          {name}
          {live && <Badge variant="success">On now</Badge>}
        </span>
        <span style={styles.optionBlurb}>{blurb}</span>
      </span>
    </button>
  );
};

/** A drawn hint of the contour field; TopoField itself is page-sized and fixed. */
const EverydayPreview: React.FC = () => (
  <svg viewBox="0 0 120 90" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
    {Array.from({ length: 9 }, (_, i) => (
      <path
        key={i}
        d={`M0 ${8 + i * 10} C30 ${2 + i * 10}, 60 ${16 + i * 10}, 120 ${6 + i * 10}`}
        style={{ fill: 'none', stroke: i === 3 ? theme.colors.primary : theme.colors.txt.tertiary, strokeOpacity: i === 3 ? 0.8 : 0.35, strokeWidth: 0.8 }}
      />
    ))}
  </svg>
);

const styles: Record<string, React.CSSProperties> = {
  lede: { margin: `0 0 ${theme.spacing.sm}`, color: theme.colors.txt.secondary, fontSize: '14px', lineHeight: 1.5 },
  now: { margin: `0 0 ${theme.spacing.md}`, color: theme.colors.txt.tertiary, fontSize: '13px' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: theme.spacing.sm,
  },
  option: {
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'left',
    padding: 0,
    minWidth: 0,
    overflow: 'hidden',
    cursor: 'pointer',
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderStyle: 'solid',
    backgroundColor: theme.colors.bg.tertiary,
    color: theme.colors.txt.primary,
    font: 'inherit',
  },
  preview: {
    position: 'relative',
    display: 'block',
    height: '110px',
    backgroundColor: theme.colors.bg.primary,
    overflow: 'hidden',
  },
  optionText: { display: 'flex', flexDirection: 'column', gap: '4px', padding: theme.spacing.sm, minWidth: 0 },
  optionName: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', fontWeight: 600, fontSize: '14px' },
  optionBlurb: { fontSize: '12px', lineHeight: 1.4, color: theme.colors.txt.tertiary, overflowWrap: 'anywhere' },
  seasonHeading: {
    margin: `${theme.spacing.lg} 0 ${theme.spacing.sm}`,
    fontFamily: theme.fonts.primary,
    fontStyle: 'normal',
    textTransform: 'none',
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    color: theme.colors.txt.tertiary,
  },
  until: { marginTop: theme.spacing.md, maxWidth: '260px' },
  portalRow: {
    marginTop: theme.spacing.md,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  portalLabel: { fontWeight: 600, fontSize: '14px', color: theme.colors.txt.primary },
  portalHint: { fontSize: '12px', color: theme.colors.txt.tertiary, overflowWrap: 'anywhere' },
  footer: { marginTop: theme.spacing.lg, display: 'flex', justifyContent: 'flex-end' },
};

export default HomeSceneSettings;
