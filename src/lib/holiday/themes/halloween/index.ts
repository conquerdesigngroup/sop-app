import type { HolidayTheme } from '../../types';
import { bat, drawBatStill } from './bat';
import { ghost } from './ghost';
import { drawPumpkinsStill, pumpkins } from './pumpkins';
import { skeleton } from './skeleton';
import { witch } from './witch';
import { zombie } from './zombie';

import ghostUrl from '../../../../assets/holiday/halloween/ghost.webp';
import pumpkinUrl from '../../../../assets/holiday/halloween/pumpkin.webp';

import baBody from '../../../../assets/holiday/halloween/ba_body.webp';
import baFoot from '../../../../assets/holiday/halloween/ba_foot.webp';
import baHead from '../../../../assets/holiday/halloween/ba_head.webp';
import baWingIn from '../../../../assets/holiday/halloween/ba_wingIn.webp';
import baWingOut from '../../../../assets/holiday/halloween/ba_wingOut.webp';

import skForeArm from '../../../../assets/holiday/halloween/sk_foreArm.webp';
import skPelvis from '../../../../assets/holiday/halloween/sk_pelvis.webp';
import skRibs from '../../../../assets/holiday/halloween/sk_ribs.webp';
import skShin from '../../../../assets/holiday/halloween/sk_shin.webp';
import skSkull from '../../../../assets/holiday/halloween/sk_skull.webp';
import skThigh from '../../../../assets/holiday/halloween/sk_thigh.webp';
import skUpperArm from '../../../../assets/holiday/halloween/sk_upperArm.webp';

import zoForeArm from '../../../../assets/holiday/halloween/zo_foreArm.webp';
import zoHead from '../../../../assets/holiday/halloween/zo_head.webp';
import zoLeg from '../../../../assets/holiday/halloween/zo_leg.webp';
import zoTorso from '../../../../assets/holiday/halloween/zo_torso.webp';
import zoUpperArm from '../../../../assets/holiday/halloween/zo_upperArm.webp';

import wiBankL from '../../../../assets/holiday/halloween/wi_bankL.webp';
import wiBankR from '../../../../assets/holiday/halloween/wi_bankR.webp';
import wiLevel from '../../../../assets/holiday/halloween/wi_level.webp';

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

    // Rig parts. Sizes are per PIECE, so the assembled character's height is
    // the sum of its chain minus the joint overlaps — see rigs.ts. Every piece
    // is drawn from art at least 2.5x its display size.
    ba_body: { url: baBody, w: 32, h: 34 },
    ba_head: { url: baHead, w: 34, h: 26 },
    ba_wingIn: { url: baWingIn, w: 30, h: 18 },
    ba_wingOut: { url: baWingOut, w: 30, h: 19 },
    ba_foot: { url: baFoot, w: 7, h: 8 },

    sk_skull: { url: skSkull, w: 22, h: 26 },
    // Narrowed on purpose. The ribcage was rendered front-on while the skull
    // is a profile, so at full width the skeleton reads as facing two ways at
    // once — which is exactly what it looked like. Squashed to a profile's
    // width it reads as a ribcage seen from the side, which at 30px is all it
    // has to do.
    sk_ribs: { url: skRibs, w: 13, h: 30 },
    sk_pelvis: { url: skPelvis, w: 11, h: 12 },
    sk_upperArm: { url: skUpperArm, w: 8, h: 24 },
    sk_foreArm: { url: skForeArm, w: 11, h: 17 },
    sk_thigh: { url: skThigh, w: 9, h: 26 },
    sk_shin: { url: skShin, w: 14, h: 20 },

    zo_head: { url: zoHead, w: 26, h: 30 },
    zo_torso: { url: zoTorso, w: 27, h: 30 },
    zo_upperArm: { url: zoUpperArm, w: 10, h: 22 },
    zo_foreArm: { url: zoForeArm, w: 9, h: 22 },
    zo_leg: { url: zoLeg, w: 19, h: 32 },

    // Baked from a 3D model at three bank angles — see witch.ts for why this
    // one is frames rather than a rig. All three share one registered canvas,
    // so swapping bank never shifts her position.
    wi_bankL: { url: wiBankL, w: 68, h: 101 },
    wi_level: { url: wiLevel, w: 68, h: 101 },
    wi_bankR: { url: wiBankR, w: 68, h: 101 },
  },

  acts: [ghost, bat, witch, zombie, skeleton],
  ambient: [pumpkins],

  /**
   * The ghost, the bat and the witch. Most visits contain exactly one
   * performance, so the first pick is drawn from here rather than uniformly —
   * meeting the skeleton plodding along the bottom edge is a much weaker first
   * impression than any of these, and for most people it would be the only
   * impression they ever get.
   */
  openers: ['ghost', 'bat', 'witch'],

  palette: {
    // Literal hex only. Canvas cannot resolve the var() tokens in theme.ts.
    dark: { glow: '#F5901E', ember: '#FFD27A', shadow: '#000000', rim: '#F5901E' },
    light: { glow: '#E8720A', ember: '#FFB03A', shadow: '#111111', rim: '#E8720A' },
  },

  // Reduced motion fetches only these — about 24KB instead of 111KB. The right
  // courtesy to somebody who has asked for less, and two lines to honour.
  stillNeeds: ['pumpkin', 'ba_body', 'ba_head', 'ba_wingIn', 'ba_wingOut', 'ba_foot'],

  drawStill(c) {
    drawPumpkinsStill(c);
    drawBatStill(c);
  },
};

export default halloween;
