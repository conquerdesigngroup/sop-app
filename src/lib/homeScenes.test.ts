import { DEFAULT_SCENE_ID, HOME_SCENES, effectiveSceneId } from './homeScenes';

describe('effectiveSceneId', () => {
  const today = '2026-12-10';

  it('shows the everyday field when nothing is saved', () => {
    expect(effectiveSceneId(null, today)).toBe(DEFAULT_SCENE_ID);
    expect(effectiveSceneId({ scene: 'contours', endsOn: null }, today)).toBe(DEFAULT_SCENE_ID);
  });

  it('shows a saved scene with no end date', () => {
    expect(effectiveSceneId({ scene: 'village', endsOn: null }, today)).toBe('village');
  });

  it('shows the scene through its last day and stops the day after', () => {
    expect(effectiveSceneId({ scene: 'snow', endsOn: '2026-12-10' }, today)).toBe('snow');
    expect(effectiveSceneId({ scene: 'snow', endsOn: '2026-12-09' }, today)).toBe(DEFAULT_SCENE_ID);
  });

  it('falls back to everyday for an id this build does not know', () => {
    expect(effectiveSceneId({ scene: 'fireworks-2030', endsOn: null }, today)).toBe(DEFAULT_SCENE_ID);
  });
});

describe('HOME_SCENES', () => {
  it('has unique ids, none of them the everyday id', () => {
    const ids = HOME_SCENES.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(DEFAULT_SCENE_ID);
  });

  it('keeps the shipped ids stable (they are stored in the database)', () => {
    expect(HOME_SCENES.map(s => s.id)).toEqual(['snow', 'village', 'lights', 'ornaments', 'aurora', 'frost', 'star', 'leaves', 'harvest', 'boughs', 'moon', 'champagne', 'hearts', 'stage']);
  });
});
