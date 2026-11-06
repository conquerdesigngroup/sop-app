import React, { useRef, useState } from 'react';
import { theme } from '../theme';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../hooks/useConfirm';
import { useHomeScene } from '../hooks/useHomeScene';
import { useAppPalette } from '../hooks/useAppPalette';
import { findPalette } from '../lib/appPalettes';
import { findScene } from '../lib/homeScenes';
import { HOLIDAY_PACKS, HolidayPack, activePackId, packEndsOn } from '../lib/holidayPacks';
import { Badge } from './ui';
import { SceneCanvas } from './HomeScene';
import { Ornament } from './HolidayGarland';
import { EverydayPreview } from './HomeSceneSettings';

/**
 * Settings → Holiday packs. Super admin only (the caller decides; v78 refuses
 * the save for anyone else anyway).
 *
 * One tap sets the Home background and the app colors together, each until
 * the day after the holiday, so nobody has to pick a scene, a palette and two
 * dates that agree. The two cards below stay for fine-tuning either half.
 */

const formatDay = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const HolidayPackSettings: React.FC = () => {
  const scene = useHomeScene();
  const colors = useAppPalette();
  const { showToast } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [applying, setApplying] = useState<string | null>(null);
  const busy = useRef(false);
  const live = activePackId(scene.activeSceneId, colors.activePaletteId);

  const apply = async (pack: HolidayPack) => {
    if (busy.current) return;
    busy.current = true;
    const endsOn = packEndsOn(pack);
    try {
      const ok = await confirm({
        title: pack.season ? `Switch everyone to ${pack.name}?` : 'Back to everyday?',
        message: pack.season
          ? `Home, the parent portal and the front door get the ${findScene(pack.scene)?.name} background and ${findPalette(pack.palette)?.name} colors${endsOn ? `, until ${formatDay(endsOn)}` : ''}. Your portal and front door switches below stay as they are.`
          : 'Home goes back to the contour lines and the app to DIDC Electric.',
        confirmLabel: pack.season ? 'Switch' : 'Go back',
      });
      if (!ok) return;
      setApplying(pack.id);
      await scene.save({ scene: pack.scene, endsOn });
      await colors.save({ palette: pack.palette, endsOn });
      showToast(pack.season ? `${pack.name} is on for everyone.` : 'Back to the everyday look.', 'success');
    } catch {
      showToast("Couldn't switch the holiday pack. Check your connection and try again.", 'error');
    } finally {
      busy.current = false;
      setApplying(null);
    }
  };

  return (
    <div>
      <p style={styles.lede}>
        One tap sets the Home background and the app colors together, until the day after the holiday.
      </p>
      <p style={styles.status} role="status" aria-live="polite">
        {applying
          ? `Switching to ${HOLIDAY_PACKS.find(p => p.id === applying)?.name}…`
          : live
            ? <>On now: <strong style={{ color: theme.colors.txt.primary }}>{HOLIDAY_PACKS.find(p => p.id === live)?.name}</strong></>
            : 'On now: a custom mix (set below).'}
      </p>
      <div style={styles.grid}>
        {HOLIDAY_PACKS.map(p => {
          const s = findScene(p.scene);
          const pal = findPalette(p.palette)!;
          const end = packEndsOn(p);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => apply(p)}
              disabled={!!applying}
              aria-pressed={live === p.id}
              style={{
                ...styles.option,
                borderColor: live === p.id ? pal.accent : theme.colors.bdr.primary,
                cursor: applying ? 'wait' : 'pointer',
                opacity: applying && applying !== p.id ? 0.6 : 1,
              }}
            >
              <span style={styles.preview}>
                {s ? <SceneCanvas scene={s} contained still /> : <EverydayPreview />}
                {pal.garland && (
                  <svg width="132" height="24" viewBox="0 0 132 24" aria-hidden="true" style={styles.garland}>
                    {Array.from({ length: 6 }, (_, i) => (
                      <g key={i} className="holiday-still">
                        <Ornament item={pal.garland![i % pal.garland!.length]} x={11 + i * 22} />
                      </g>
                    ))}
                  </svg>
                )}
              </span>
              <span style={styles.text}>
                <span style={styles.name}>
                  <span style={{ ...styles.swatch, backgroundColor: pal.accent }} />
                  {p.name}
                  {live === p.id && <Badge variant="success">On now</Badge>}
                </span>
                <span style={styles.blurb}>
                  {applying === p.id ? 'Switching…' : p.season ? (end ? `Until ${formatDay(end)}` : 'Until you switch it off') : 'Contour lines, DIDC Electric'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {confirmDialog}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  lede: { margin: `0 0 ${theme.spacing.sm}`, color: theme.colors.txt.secondary, fontSize: '14px', lineHeight: 1.5 },
  status: { margin: `0 0 ${theme.spacing.md}`, color: theme.colors.txt.tertiary, fontSize: '13px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: theme.spacing.sm },
  option: {
    display: 'flex', flexDirection: 'column', textAlign: 'left', padding: 0, minWidth: 0, overflow: 'hidden',
    borderRadius: theme.borderRadius.lg, borderWidth: 2, borderStyle: 'solid',
    backgroundColor: theme.colors.bg.tertiary, color: theme.colors.txt.primary, font: 'inherit',
  },
  preview: { position: 'relative', display: 'block', height: '96px', backgroundColor: theme.colors.bg.primary, overflow: 'hidden' },
  garland: { position: 'absolute', top: 0, left: 0, width: '100%', zIndex: 1 },
  text: { display: 'flex', flexDirection: 'column', gap: '4px', padding: theme.spacing.sm, minWidth: 0 },
  name: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', fontWeight: 600, fontSize: '14px' },
  swatch: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 },
  blurb: { fontSize: '12px', lineHeight: 1.4, color: theme.colors.txt.tertiary, overflowWrap: 'anywhere' },
};

export default HolidayPackSettings;
