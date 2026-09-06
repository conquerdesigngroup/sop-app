import type { HolidayTheme } from '../../types';
import { bat, drawBatStill } from './bat';
import { ghost } from './ghost';
import { drawPumpkinsStill, pumpkins } from './pumpkins';
import { skeleton } from './skeleton';
import { zombie } from './zombie';

import batDownUrl from '../../../../assets/holiday/halloween/batDown.webp';
import batHangUrl from '../../../../assets/holiday/halloween/batHang.webp';
import batLevelUrl from '../../../../assets/holiday/halloween/batLevel.webp';
import batUpUrl from '../../../../assets/holiday/halloween/batUp.webp';
import ghostUrl from '../../../../assets/holiday/halloween/ghost.webp';
import pumpkinUrl from '../../../../assets/holiday/halloween/pumpkin.webp';
import walk0Url from '../../../../assets/holiday/halloween/walk0.webp';
import walk1Url from '../../../../assets/holiday/halloween/walk1.webp';
import walk2Url from '../../../../assets/holiday/halloween/walk2.webp';
import walk3Url from '../../../../assets/holiday/halloween/walk3.webp';
import zombieUrl from '../../../../assets/holiday/halloween/zombie.webp';

/**
 * Halloween: the cast, the palette and the running order.
 *
 * This file is DATA. The engine schedules, loads, measures and paints; it knows
 * nothing about ghosts. Adding Thanksgiving means a sibling folder shaped like
 * this one, not a change to anything under src/lib/holiday/.
 *
 * WHY THE ART IS IMPORTED, NOT REFERENCED FROM public/
 *
 * scripts/stamp-service-worker.js derives CACHE_VERSION from a hash of
 * build/asset-manifest.json, and CRA copies public/ verbatim OUTSIDE webpack —
 * so files dropped there never enter the manifest. Art in public/ would ship
 * with an unchanged worker version, no browser would reinstall the worker, and
 * because the worker is cache-first for static assets every returning visitor
 * would keep the old art with no way to invalidate it. Imported from src/,
 * webpack emits each file content-hashed INTO the manifest: the digest moves,
 * the worker updates, and the hashed filenames make staleness impossible.
 *
 * And .webp rather than .png because CRA's inline rule tests
 * [bmp|gif|jpe?g|png] against a 10KB limit — PNG sprites under 10KB would be
 * base64'd into the chooser's JS chunk instead of emitted as files. .webp falls
 * through to asset/resource and is always a separate, deferrable request.
 *
 * Sizes below are DISPLAY pixels at scale 1. Every file is between 2.4x and 3x
 * that, so the sprites are drawn under their native size on a 2x screen. The
 * four walk frames share one canvas, as do the three flight frames, because
 * they were registered on the body — see scripts note in the art pipeline.
 */

export const halloween: HolidayTheme = {
  id: 'halloween',

  // Little characters, emphasis on little. Sized against a 236px-tall tile and
  // the roughly 60px of clear space between the theme toggle and the tiles: a
  // taller cast reads as mascots placed on the page rather than as something
  // small living behind it, and it spends much more of each act overlapping a
  // control.
  sprites: {
    ghost: { url: ghostUrl, w: 69, h: 76 },
    pumpkin: { url: pumpkinUrl, w: 72, h: 70 },
    zombie: { url: zombieUrl, w: 58, h: 84 },
    // One canvas for the cycle, so a frame swap never changes size or position.
    walk0: { url: walk0Url, w: 39, h: 78 },
    walk1: { url: walk1Url, w: 39, h: 78 },
    walk2: { url: walk2Url, w: 39, h: 78 },
    walk3: { url: walk3Url, w: 39, h: 78 },
    batHang: { url: batHangUrl, w: 62, h: 72 },
    // Wingspan, not body: the flight canvas is sized to the widest wing pose.
    batUp: { url: batUpUrl, w: 80, h: 70 },
    batLevel: { url: batLevelUrl, w: 80, h: 70 },
    batDown: { url: batDownUrl, w: 80, h: 70 },
  },

  acts: [ghost, bat, zombie, skeleton],
  ambient: [pumpkins],

  /**
   * The ghost and the bat. Most visits contain exactly one performance, so the
   * first pick is drawn from here rather than uniformly — meeting the skeleton
   * plodding along the bottom edge is a much weaker first impression than
   * either of these, and for most people it would be the only impression.
   */
  openers: ['ghost', 'bat'],

  palette: {
    // Literal hex only. Canvas cannot resolve the var() tokens in theme.ts.
    dark: { glow: '#F5901E', ember: '#FFD27A', shadow: '#000000', rim: '#F5901E' },
    light: { glow: '#E8720A', ember: '#FFB03A', shadow: '#111111', rim: '#E8720A' },
  },

  // Reduced motion fetches only these — about 24KB instead of 111KB. The right
  // courtesy to somebody who has asked for less, and two lines to honour.
  stillNeeds: ['pumpkin', 'batHang'],

  drawStill(c) {
    drawPumpkinsStill(c);
    drawBatStill(c);
  },
};

export default halloween;
