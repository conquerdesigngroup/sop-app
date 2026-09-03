import React, { useEffect, useRef } from 'react';
import { getThemeColors, theme } from '../theme';
import { useTheme } from '../contexts/ThemeContext';

/**
 * The ambient background on the front door.
 *
 * Only the chooser gets this. Motion behind a screen somebody works in all day
 * is a different and much worse idea.
 *
 * Three things this must not cost anybody, in rough order of how likely they
 * are to be forgotten:
 *
 * 1. `prefers-reduced-motion` paints ONE composed frame and stops. The screen
 *    keeps its atmosphere; nothing moves. The listener is live, so toggling the
 *    setting takes effect without a reload.
 * 2. A hidden tab runs no frames at all — the loop is cancelled, not skipped.
 * 3. Canvas backing store is capped at 2x DPR. A 3x phone would otherwise paint
 *    2.25 times the pixels for a difference nobody can see in a 1px mark.
 *
 * This replaced a halftone dot matrix. That version is in the history of
 * src/components/HalftoneField.tsx if it is ever wanted back.
 */

type Rgb = [number, number, number];

/** '#RRGGBB' -> [r, g, b]. The palette in theme.ts is all six-digit hex. */
const toRgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const mixRgb = (a: Rgb, b: Rgb, k: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * k),
  Math.round(a[1] + (b[1] - a[1]) * k),
  Math.round(a[2] + (b[2] - a[2]) * k),
];

const rgbaStr = (c: Rgb, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

interface FieldPalette {
  bg: Rgb;
  panel: Rgb;
  panel2: Rgb;
  txt: Rgb;
  txt3: Rgb;
  bdr: Rgb;
  bdr2: Rgb;
  accent: Rgb;
  mode: 'dark' | 'light';
}

interface FieldEnv {
  ctx: CanvasRenderingContext2D;
  palette: FieldPalette;
  mix: (a: Rgb, b: Rgb, k: number) => Rgb;
  rgba: (c: Rgb, a: number) => string;
}

interface Field {
  resize(w: number, h: number): void;
  /** `pointer` is normalised 0..1, or null on any device without one. */
  frame(t: number, w: number, h: number, pointer: { x: number; y: number } | null): void;
}

/* =============================================================================
 * caustics — "Refracted Glass"
 * =============================================================================
 *
 * WHAT IT IS
 *   A perfectly rigid grid of short dashes, viewed through a slab of slowly
 *   moving thick glass. Every dash is displaced by the gradient of a smooth
 *   refractive height field. Where that displacement compresses neighbouring
 *   dashes together, they shorten and brighten — which is exactly what a real
 *   caustic is: light density piling up where the ray map folds. The grid
 *   itself never moves, never rotates and never fades. All of the life is in
 *   the distortion.
 *
 * THE MATHS, AND WHY IT IS THIS AND NOT NOISE
 *   The refractive surface is a scalar potential built from three plane waves:
 *
 *       phi(x,y,t) = SUM_k  A_k * sin(kx_k*x + ky_k*y + w_k*t + p_k)
 *
 *   The displacement is grad(phi) — a curl-free field, which is what an actual
 *   thin refracting surface produces (rays bend along the surface normal, they
 *   do not swirl). The screen-space map is therefore
 *
 *       P(x,y) = (x,y) + grad(phi)
 *
 *   whose Jacobian is  J = I + Hess(phi).  Caustic brightness is the inverse of
 *   |det J| — the local area compression of the map. Because phi is a sum of
 *   sines, the Hessian is analytic and costs nothing beyond the sin/cos we are
 *   already computing. Sampled value noise would need finite differences (three
 *   samples per axis per point) and would still be C1-lumpy; this is exact and
 *   perfectly smooth.
 *
 *   Each dash also carries the map's shear. Every dash starts at ONE fixed rest
 *   angle and is drawn as J*e — the image of that rest direction under the same
 *   Jacobian. So a dash lying across a compression seam genuinely shortens and
 *   swings, one in a stretched trough genuinely lengthens, and in a flat region
 *   J is the identity and the hatch is exactly as rigid as it started.
 *
 *   Orienting dashes along grad(phi) instead was tried and rejected: the
 *   gradient direction winds a full turn around every critical point of phi, so
 *   the field grew a scattering of radial starbursts. Handsome, but it reads as
 *   sun rays, and it puts the life in the marks rather than in the glass.
 *
 * WHY IT IS CHEAP
 *   sin(kx*x + ky*y + wt + p) is expanded with the angle-addition identity into
 *   a per-column term (fixed for the life of a resize) and a per-row term
 *   (a single rotation per frame). The result: SEVEN trig calls per frame in
 *   total — two per wave for the rotation, plus one for the global swell —
 *   regardless of how many marks are on screen. The inner loop is pure
 *   multiply-add over preallocated Float32Arrays plus three Math.sqrt per mark:
 *   no allocation, no Math.sin, no Math.pow. Marks are binned into six
 *   brightness buckets and each bucket is emitted as ONE path with ONE stroke,
 *   so the whole field costs about 14 canvas state changes per frame.
 *
 *   Budget at 390x780: 2006 grid points evaluated, ~1430 dashes actually
 *   stroked after the off-screen ring is culled. See CELLS_SHORT for why that
 *   is the density and not a finer one.
 *
 * WHY IT SURVIVES A SINGLE STILL FRAME
 *   Everything is closed-form in t. There is no particle state, no trail buffer
 *   and no warm-up: frame(6.2, ...) called exactly once draws the complete,
 *   fully composed picture. There is also no randomness anywhere — not even a
 *   hash — so every run is bit-identical.
 *
 * RESTRAINT
 *   Six brightness buckets, measured at 58 / 24 / 11 / 4 / 1.5 / 1.2 percent of
 *   marks at the swell peak, and 64 / 28 / 6 / 2 / 0 / 0 at its trough — the
 *   crests come and go over the 29s breath rather than sitting there. Because
 *   the whole field is defined in grid cells rather than in pixels, that same
 *   histogram holds at 320x568, 390x780 and 1440x900 (all three verified to
 *   within a percent).
 *
 *   The median mark sits in bucket 0 at 0.18 alpha of a border grey, about ten
 *   levels off the ground: present, but effectively unreadable until your eye
 *   rests. Only the top bucket, which needs |det J| < ~0.36, carries a whisper
 *   of the electric accent — it peaks at 1.2% of marks, is empty for much of
 *   the swell cycle, and is diluted 82/18 against near-white besides. Nothing
 *   here should be noticed before the brand mark and the caption have been read.
 * ========================================================================== */
const createField = (env: FieldEnv): Field => {
  var ctx = env.ctx;
  var P = env.palette;
  var mix = env.mix;
  var rgba = env.rgba;
  var LIGHT = P.mode === 'light';

  // ---------------------------------------------------------------------
  // Tunables. Every length here is a RATIO — resolved at build time against
  // the grid cell, which is itself sized off the SHORT edge, so a 390px phone
  // and a 1440px desktop get visually the same field rather than the same
  // pixel counts. MAX_SPACING below is the single exception and is documented
  // where it sits.
  // ---------------------------------------------------------------------
  var NW = 3;                 // plane waves in the refractive potential
  var NB = 6;                 // brightness buckets == draw calls per frame
  // Grid cells across the short edge. 25 puts a 15.6px pitch on a 390x780
  // phone: 2006 grid points evaluated, ~1430 dashes stroked after culling.
  // It was 30 (13px, 2479 evaluated / 1984 stroked), which sat on the wrong
  // side of the 4ms phone budget — the stroke of ~2000 round-capped segments
  // is the dominant cost here, not the arithmetic.
  //
  // Dropping the density is visually free because the wave amplitudes below
  // are expressed in CELLS and were scaled by the same 25/30. Pixel
  // displacement is d*spacing and the Hessian magnitude is
  // 2*PI*d*cos^2/(CELLS_SHORT*lambda_f) — both are algebraically invariant
  // under (d, CELLS_SHORT) -> (d*r, CELLS_SHORT*r). Verified: the bucket
  // histogram at 390x780 moves from 58.3/24.8/10.7/3.6/1.2/1.4 to
  // 58.3/24.1/10.6/4.1/1.5/1.2, i.e. sampling noise. Only the hatch pitch
  // is coarser.
  var CELLS_SHORT = 25;
  // The one absolute pixel constant in the file, and it can only ever make
  // marks SMALLER: a pure short-edge ratio gives 15.6px cells on a 390px
  // phone but 36px cells at 1440x900, where the dashes turn coarse and each
  // accent mark is big enough to read as frank pink rather than as a glint.
  // 21 holds the desktop cellSpan at 21*25 = 525, near the 570 the wave table
  // was tuned against. The cap binds on desktop only — a phone never reaches
  // it, so this cannot make the primary size coarse.
  var MAX_SPACING = 21;
  // Extra rings of grid outside the viewport, so displaced marks still cover
  // the bleed edges. This has to exceed the peak displacement in cells, or
  // the field can pull the outermost marks inward and leave a bare band along
  // an edge. The bound: worst-case signed vector sum of the three waves is
  // 2.03 cells (well under the 2.58 scalar sum — the headings are widely
  // separated, so they cannot all align), times the 1.2 swell, plus the
  // pointer lens at 0.9 = 3.34 cells.
  //
  // Raised from 3, which did not cover that bound. Being honest about what
  // this bought: sweeping a full swell cycle at 390x780 and 1440x900, the
  // largest gap ever measured between a viewport edge and the nearest mark
  // was ~1px at margin 3 — the worst case is reachable in principle but the
  // phases never lined up to produce it. So this is a guarantee, not a
  // repair, and it is cheap: the extra ring is evaluated and then culled, so
  // it costs arithmetic only and adds nothing to the stroke count.
  var MARGIN_CELLS = 4;
  var MARK_LEN_F = 0.46;      // dash length as a fraction of grid spacing
  var SWELL_PERIOD = 29;      // s — global amplitude breath
  var SWELL_DEPTH = 0.20;     // +/- 20% on the whole displacement field

  // Compression -> brightness window. COMP_LO is a touch under 1 so that
  // stretched (dimmer than neutral) regions still land at the floor rather
  // than clipping the entire lower half of the field into one value.
  // COMP_HI is set ABOVE the compression this field actually reaches (the
  // strongest seams peak near 1/0.30 = 3.3). Sizing the window to the peak
  // instead would clip, and a clipped top bucket ends up MORE populous than
  // the one below it — measured at 3.8% vs 2.6%, which is a plateau, not a
  // crest, and puts the accent over its coverage budget. With this window
  // the six buckets fall 58 / 24 / 11 / 4 / 1.5 / 1.2 % at the swell peak.
  var COMP_LO = 0.62;
  var COMP_HI = 2.80;
  // Clamp on |det J| — stops a fold caustic from dividing by ~0 and blowing
  // out to white. Against the wave field alone this is a pure guard that
  // never fires: the measured minimum across the swell cycle is 0.30 at
  // every viewport size. It exists for the pointer lens, whose Hessian
  // stacks on top of the waves and CAN push det under it directly beneath
  // the cursor — a desktop-only path, and the clamp is what keeps that from
  // becoming a white blot.
  var DET_FLOOR = 0.22;

  // Rest angle of every dash. Deliberately off-axis: at 0 or 90 degrees the
  // dashes line up with the grid rows in the flat regions and the field reads
  // as scanlines — which this page already has a layer of. 0.30 rad (~17deg)
  // is far enough off to read as a hatch instead.
  var REST_ANGLE = 0.30;

  // Dash length responds to the push-forward stretch, but only partly: a
  // fully collapsed dash would read as a dropout, not as a caustic.
  var STRETCH_MIN = 0.30;
  var STRETCH_MAX = 2.20;
  var LEN_BASE = 0.55;        // fraction of length that ignores stretch
  var LEN_GAIN = 0.45;

  // Light mode inverts the whole logic: marks must be DARKER than the chalk
  // ground, and need more alpha because the available contrast range on a
  // near-white field is narrower than on near-black.
  //
  // The alpha SPAN matters more than either endpoint. A wide span (0.10-0.58)
  // put 60% of marks so close to the ground that most of the screen read as
  // empty and the caustic looked like the only thing present — the opposite
  // of "a rigid field, distorted". Narrowing it keeps the base hatch quietly
  // legible everywhere and demotes the caustic to a modulation on top of it.
  //
  // Light mode was raised after the field turned out to be all but invisible
  // on chalk. The alphas are only half of that fix — see C_LO below for the
  // half that mattered.
  var A_MIN = LIGHT ? 0.27 : 0.15;
  var A_MAX = LIGHT ? 0.62 : 0.52;
  // Pink pulled into the top bucket only. Kept low deliberately: the crests
  // cluster along a seam rather than scattering, so at 0.24 they read as pink
  // patches on a wide screen instead of as glints. At 0.18 the crest is a
  // warm-white that is merely distinguishable from the neutral greys below it.
  var ACCENT_MIX = 0.18;

  var PTR_DISP = 0.9;         // pointer lens strength, in grid spacings
  // Lens radius as a fraction of cellSpan, NOT of the short edge — the two
  // are the same 390px on a phone, but once MAX_SPACING binds on desktop
  // cellSpan is the smaller of the pair. Keying it to cellSpan keeps the lens
  // the same number of GRID CELLS wide at every size, which is what makes it
  // read as the same lens rather than as a bigger one.
  var PTR_RADIUS_F = 0.55;
  var PTR_EASE = 0.07;        // position follow
  var PTR_FADE = 0.06;        // strength fade in/out

  // Wave table: [wavelength / cellSpan, direction (rad), seconds per cycle
  // (sign = travel direction), peak displacement / grid spacing].
  // cellSpan is CELLS_SHORT cells across — see build().
  // Three deliberately incommensurate periods (23 / 17.5 / 31 s) so the field
  // never visibly repeats, and three widely separated headings so the sum
  // drifts rather than scrolls. Phase speeds work out at 12-16 px/s on a
  // phone: a seam takes roughly half a minute to cross the screen.
  //
  // The longest wavelength is held at 1.25x cellSpan. At 1.75x it was longer
  // than a portrait phone is wide, so less than one period was ever on screen
  // and it acted as a screen-wide bias rather than as structure: the whole
  // field collapsed into a single bright lobe in one corner with the remaining
  // two thirds of the screen empty. 1.25x puts 1.6 periods down a 390x780
  // phone, which spreads the seams over the whole viewport.
  //
  // The amplitude column is in GRID SPACINGS, so it has to move with
  // CELLS_SHORT. These are the original 1.05 / 0.80 / 1.25, tuned at 30
  // cells, times 25/30 — which leaves peak displacement in PIXELS and the
  // Hessian magnitudes exactly where they were. Change CELLS_SHORT and this
  // column must be scaled with it or the caustics gain or lose contrast.
  var WAVE = [
    [0.90, 0.31,  23.0, 0.875],
    [0.55, 2.05, -17.5, 0.667],
    [1.25, 3.90,  31.0, 1.042]
  ];
  var PHASE = [0.0, 1.7, 3.4];  // fixed offsets — deterministic, no PRNG

  // ---------------------------------------------------------------------
  // Colour ramp and per-bucket stroke strings, built once per mode.
  // Quiet end is the border grey (invisible against the ground until your
  // eye adapts); bright end is the text colour. Both ends come from the
  // palette so the whole thing re-tunes itself when the mode flips.
  // ---------------------------------------------------------------------
  //
  // The light ramp is NOT the dark ramp with the ends swapped, and assuming
  // it was is what made the field disappear on chalk.
  //
  // Contrast near white is judged as a ratio, not as a difference. On the
  // void a bucket-0 mark lands 11 luma above an 11-luma ground — it doubles
  // the local luminance and is unmissable. The same 13-luma step down from a
  // 244-luma chalk ground is a 5% change, and 5% reads as nothing. Worse,
  // bdr2 in light mode is #CFCFD6, only 36 luma below the ground, so even at
  // alpha 1.0 the quiet end could never have been more than barely there —
  // no alpha value could have rescued it.
  //
  // So the light ramp is pulled bodily downward: its quiet end starts most of
  // the way to smoke rather than at the hairline grey, and its bright end
  // goes nearly to ink. Bucket 0 now sits ~36 luma under the ground instead
  // of ~13, and the crests reach ~120 under it, which is the dynamic range
  // the glass needs to read at all.
  var C_LO = LIGHT ? mix(P.bdr2, P.txt3, 0.80) : P.bdr2;
  var C_MID = LIGHT ? mix(P.txt3, P.txt, 0.40) : P.txt3;
  var C_HI = LIGHT ? mix(P.txt, P.txt3, 0.10) : P.txt;
  var RAMP_KNEE = 0.55;       // where the ramp hands over from LO->MID to MID->HI

  var BG = rgba(P.bg, 1);
  var strokeOf = new Array(NB);
  var widthF = new Array(NB);   // lineWidth multipliers; absolute px at build
  var lwOf = new Array(NB);
  var b: number, r: number, col: Rgb;
  for (b = 0; b < NB; b++) {
    r = (b + 0.5) / NB;
    col = r < RAMP_KNEE
      ? mix(C_LO, C_MID, r / RAMP_KNEE)
      : mix(C_MID, C_HI, (r - RAMP_KNEE) / (1 - RAMP_KNEE));
    // Accent lives in the top bucket alone. That bucket needs |det J| below
    // roughly 0.36, which measures at 1.2% of marks at the swell peak and 0% at
    // its trough — at most about seventeen pinpricks
    // on a phone, far under the 5% ceiling, and diluted 82/18 against
    // near-white besides. It reads as a warm cast on the crest, not as pink.
    if (b === NB - 1) col = mix(col, P.accent, ACCENT_MIX);
    strokeOf[b] = rgba(col, A_MIN + (A_MAX - A_MIN) * r);
    widthF[b] = 0.82 + 0.50 * r;   // crests are marginally fatter
  }

  // ---------------------------------------------------------------------
  // Build state. All of this is reallocated only on a genuine size change.
  // ---------------------------------------------------------------------
  var W = 0, H = 0;
  var cols = 0, rows = 0;
  var spacing = 1, L0 = 1, cullMargin = 1;
  var ex = Math.cos(REST_ANGLE), ey = Math.sin(REST_ANGLE);  // dash rest dir
  var ptrR = 1, ptrG = 0, ptrH4 = 0;

  // Seeded with zero-length arrays rather than null: build() replaces every
  // one of them before anything reads them, and nothing ever tests them for
  // null, so an empty typed array is the same thing at runtime and saves the
  // TypeScript port a row of non-null assertions.
  var EMPTY = new Float32Array(0);
  var gx = EMPTY, gy = EMPTY;   // undistorted grid positions
  var cS = EMPTY, cC = EMPTY;   // sin/cos of (kx * x)          — per column
  var r0S = EMPTY, r0C = EMPTY; // sin/cos of (ky * y + phase)   — per row
  var rS = EMPTY, rC = EMPTY;   // the above, rotated by w*t     — per frame
  var Akx = new Float64Array(NW), Aky = new Float64Array(NW);
  var Axx = new Float64Array(NW), Ayy = new Float64Array(NW), Axy = new Float64Array(NW);
  var OM = new Float64Array(NW);

  var bucket = new Array(NB);   // flat [x0,y0,x1,y1, ...] per bucket
  var count = new Int32Array(NB);

  // Pointer state. Starts fully off, so a reduced-motion still frame with
  // pointer === null skips the lens branch entirely and costs nothing.
  var ptrX = 0, ptrY = 0, ptrAmp = 0, hadPtr = false, firstFrame = true;

  function build(w: number, h: number) {
    W = w; H = h;
    var S = Math.min(w, h);      // SHORT edge — sizing off the long edge
                                 // would make everything enormous in portrait.
                                 // It is used for exactly one thing: setting
                                 // the cell size. Every other length derives
                                 // from the cell.
    spacing = Math.min(S / CELLS_SHORT, MAX_SPACING);
    L0 = spacing * MARK_LEN_F;
    cullMargin = spacing;

    // Everything below is measured in GRID CELLS, not in viewport pixels.
    // cellSpan is "what the short edge would be if it were exactly
    // CELLS_SHORT cells wide" — equal to S on a phone, smaller than S once
    // MAX_SPACING binds. Keying wavelengths off S while keying displacement
    // off spacing is the trap: capping one and not the other shrank every
    // d*k product by the cap ratio and visibly flattened the caustics on
    // desktop. Off cellSpan, d*k = 2*PI*amp/(lambda*CELLS_SHORT) — free of
    // both spacing and S, so the bucket histogram is identical at every
    // size and only the number of periods on screen changes with the
    // viewport, which is what should vary.
    var cellSpan = spacing * CELLS_SHORT;

    // Stroke weight is a ratio of the CELL, not of the viewport, so the
    // dash keeps the same slenderness at every size. Floored at 0.9 because
    // a thinner hairline just disappears, capped so it never becomes a bar.
    var lw = Math.min(1.4, Math.max(0.9, spacing * 0.075));
    for (var q = 0; q < NB; q++) lwOf[q] = lw * widthF[q];

    cols = Math.ceil(w / spacing) + 2 * MARGIN_CELLS + 1;
    rows = Math.ceil(h / spacing) + 2 * MARGIN_CELLS + 1;

    gx = new Float32Array(cols);
    gy = new Float32Array(rows);
    var i: number, j: number, k: number;
    for (i = 0; i < cols; i++) gx[i] = (i - MARGIN_CELLS + 0.5) * spacing;
    for (j = 0; j < rows; j++) gy[j] = (j - MARGIN_CELLS + 0.5) * spacing;

    cS = new Float32Array(cols * NW); cC = new Float32Array(cols * NW);
    r0S = new Float32Array(rows * NW); r0C = new Float32Array(rows * NW);
    rS = new Float32Array(rows * NW); rC = new Float32Array(rows * NW);

    for (k = 0; k < NW; k++) {
      var lam = WAVE[k][0] * cellSpan;
      var kk = 2 * Math.PI / lam;
      var ang = WAVE[k][1];
      var kx = kk * Math.cos(ang);
      var ky = kk * Math.sin(ang);
      // Amplitude is specified as a peak DISPLACEMENT in pixels; the
      // potential amplitude is that divided by |k|, since |grad| = A*|k|.
      var A = (WAVE[k][3] * spacing) / kk;
      Akx[k] = A * kx;  Aky[k] = A * ky;
      Axx[k] = A * kx * kx;  Ayy[k] = A * ky * ky;  Axy[k] = A * kx * ky;
      OM[k] = 2 * Math.PI / WAVE[k][2];   // sign of the period = travel sense

      for (i = 0; i < cols; i++) {
        var a = kx * gx[i];
        cS[i * NW + k] = Math.sin(a);
        cC[i * NW + k] = Math.cos(a);
      }
      for (j = 0; j < rows; j++) {
        var bAng = ky * gy[j] + PHASE[k];
        r0S[j * NW + k] = Math.sin(bAng);
        r0C[j * NW + k] = Math.cos(bAng);
      }
    }

    // Pointer lens: a compact polynomial bump psi = B*(1-q)^3, q = r^2/R^2.
    // Zero outside R (so most points early-out), and its gradient and
    // Hessian are closed form, matching the wave field exactly.
    ptrR = PTR_RADIUS_F * cellSpan;
    // (1-q)^2 * r peaks at q = 1/5 with value 0.286*R, hence the constant.
    ptrG = (PTR_DISP * spacing) / (0.286 * ptrR);
    ptrH4 = 4 * ptrG / (ptrR * ptrR);

    var cap = cols * rows * 4;
    for (var bi = 0; bi < NB; bi++) bucket[bi] = new Float32Array(cap);
  }

  return {
    resize: function (w, h) {
      if (w > 0 && h > 0) build(w, h);
    },

    frame: function (t, w, h, pointer) {
      if (w <= 0 || h <= 0) return;
      if (w !== W || h !== H) build(w, h);   // covers a missing resize() call

      // Rule 1: the harness never clears. Opaque bg fill — it IS the page
      // colour, and there are no trails to preserve.
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);

      // --- pointer easing -------------------------------------------------
      var pOn = pointer ? 1 : 0;
      if (pointer) {   // test `pointer`, not `pOn`, so it narrows
        var tx0 = pointer.x * w, ty0 = pointer.y * h;
        if (!hadPtr) { ptrX = tx0; ptrY = ty0; }   // arrive without a sweep
        ptrX += (tx0 - ptrX) * PTR_EASE;
        ptrY += (ty0 - ptrY) * PTR_EASE;
      }
      hadPtr = !!pOn;
      // On the very first frame the lens jumps straight to full strength.
      // There is nothing on screen yet to pop away from, and it means the
      // single frame a reduced-motion viewer gets is composed the same way
      // an animating one would be, rather than showing a 6%-faded lens.
      if (firstFrame) { ptrAmp = pOn; firstFrame = false; }
      else ptrAmp += (pOn - ptrAmp) * PTR_FADE;
      if (!pOn && ptrAmp < 0.004) ptrAmp = 0;
      var useP = ptrAmp > 0;
      var pG = ptrG * ptrAmp, pH4 = ptrH4 * ptrAmp, pR2 = ptrR * ptrR;

      // --- per-frame trig: six calls, then pure arithmetic ----------------
      var k: number, j: number, i: number;
      for (k = 0; k < NW; k++) {
        var th = OM[k] * t;
        var ct = Math.cos(th), st = Math.sin(th);
        for (j = 0; j < rows; j++) {
          var ix = j * NW + k;
          var s0 = r0S[ix], c0 = r0C[ix];
          rS[ix] = s0 * ct + c0 * st;   // sin(base + wt)
          rC[ix] = c0 * ct - s0 * st;   // cos(base + wt)
        }
      }

      // Slow global breath. Every term below is linear in the wave
      // amplitudes, so one multiply at the end scales displacement AND
      // curvature together — the caustics swell and relax with the field.
      var amp = 1 + SWELL_DEPTH * Math.sin(2 * Math.PI * t / SWELL_PERIOD);

      for (k = 0; k < NB; k++) count[k] = 0;

      var compSpan = 1 / (COMP_HI - COMP_LO);
      var xlo = -cullMargin, xhi = w + cullMargin;
      var ylo = -cullMargin, yhi = h + cullMargin;

      for (j = 0; j < rows; j++) {
        var y = gy[j];
        var ri = j * NW;

        for (i = 0; i < cols; i++) {
          var x = gx[i];
          var ci = i * NW;

          // grad(phi) and Hess(phi), accumulated over the three waves.
          var dX = 0, dY = 0, hxx = 0, hyy = 0, hxy = 0;
          for (k = 0; k < NW; k++) {
            var sa = cS[ci + k], ca = cC[ci + k];
            var sb = rS[ri + k], cb = rC[ri + k];
            var sn = sa * cb + ca * sb;   // sin(kx*x + ky*y + wt + p)
            var cs = ca * cb - sa * sb;   // cos(same)
            dX += Akx[k] * cs;  dY += Aky[k] * cs;
            hxx -= Axx[k] * sn; hyy -= Ayy[k] * sn; hxy -= Axy[k] * sn;
          }
          dX *= amp; dY *= amp; hxx *= amp; hyy *= amp; hxy *= amp;

          if (useP) {
            var ux = x - ptrX, uy = y - ptrY;
            var q = (ux * ux + uy * uy) / pR2;
            if (q < 1) {
              var iv = 1 - q, iv2 = iv * iv, gi = pG * iv2, hi = pH4 * iv;
              dX -= gi * ux;  dY -= gi * uy;
              hxx += hi * ux * ux - gi;
              hyy += hi * uy * uy - gi;
              hxy += hi * ux * uy;
            }
          }

          var px = x + dX;
          if (px < xlo || px > xhi) continue;
          var py = y + dY;
          if (py < ylo || py > yhi) continue;

          // Area compression of the map. det J = det(I + Hess).
          var det = (1 + hxx) * (1 + hyy) - hxy * hxy;
          var ad = det < 0 ? -det : det;      // a fold is still a caustic
          if (ad < DET_FLOOR) ad = DET_FLOOR;
          var u = (1 / ad - COMP_LO) * compSpan;
          if (u < 0) u = 0; else if (u > 1) u = 1;
          // u^1.25, as two sqrts rather than a pow: gentle enough that the
          // mid field keeps some modelling, steep enough that the crests
          // stay a small minority and the histogram decays monotonically.
          var sh = u * Math.sqrt(Math.sqrt(u));
          var bIdx = (sh * NB) | 0;
          if (bIdx > NB - 1) bIdx = NB - 1;

          // Dash heading: the fixed rest direction pushed through J = I + Hess.
          // Unlike the gradient this has no winding number anywhere, so the
          // hatch shears and swings smoothly instead of pinwheeling.
          var tX = ex + hxx * ex + hxy * ey;
          var tY = ey + hxy * ex + hyy * ey;
          var sl = Math.sqrt(tX * tX + tY * tY);
          // Only reachable if J annihilates e exactly; keep the rest angle.
          if (sl < 1e-4) { tX = ex; tY = ey; sl = 1; }
          var stq = sl;
          if (stq < STRETCH_MIN) stq = STRETCH_MIN;
          else if (stq > STRETCH_MAX) stq = STRETCH_MAX;
          // 1/sl folded in here doubles as the normalisation of (tX,tY).
          var hl = L0 * 0.5 * (LEN_BASE + LEN_GAIN * stq) / sl;

          var arr = bucket[bIdx];
          var n = count[bIdx];
          arr[n]     = px - hl * tX;
          arr[n + 1] = py - hl * tY;
          arr[n + 2] = px + hl * tX;
          arr[n + 3] = py + hl * tY;
          count[bIdx] = n + 4;
        }
      }

      // --- emit: one path, one stroke, one style change per bucket --------
      // Darkest first so crests composite on top of their own surroundings.
      // `bi` is local: the ramp-building loop up in create() uses `b` from the
      // enclosing scope, and borrowing it here would leave frame() writing to
      // a variable that outlives the call for no reason.
      ctx.lineCap = 'round';
      for (var bi = 0; bi < NB; bi++) {
        var m = count[bi];
        if (m === 0) continue;
        var a2 = bucket[bi];
        ctx.strokeStyle = strokeOf[bi];
        ctx.lineWidth = lwOf[bi];
        ctx.beginPath();
        for (var p = 0; p < m; p += 4) {
          ctx.moveTo(a2[p], a2[p + 1]);
          ctx.lineTo(a2[p + 2], a2[p + 3]);
        }
        ctx.stroke();
      }
    }
  };};

/**
 * How fast the glass moves, as a multiple of the rate the field was authored at.
 *
 * It multiplies the clock rather than any of the wave periods, so the three
 * deliberately incommensurate periods in WAVE keep their ratios and the field
 * still never visibly repeats. It also keeps STILL_AT naming the same composed
 * frame, which editing the periods would not.
 */
const SPEED = 2.4;

/** The frame drawn when motion is off. The field was composed against this
 *  value, so it is a deliberately chosen picture rather than t = 0. */
const STILL_AT = 6.2;

const RefractedGlassField: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { mode } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas cannot resolve var(), so the CSS-variable tokens are no use here —
    // this reads the literal palette for the current mode instead. The effect
    // re-runs on a mode change, so the field re-themes with everything else.
    const c = getThemeColors(mode);
    const palette: FieldPalette = {
      bg: toRgb(c.bg.primary),
      panel: toRgb(c.bg.secondary),
      panel2: toRgb(c.bg.tertiary),
      txt: toRgb(c.txt.primary),
      txt3: toRgb(c.txt.tertiary),
      bdr: toRgb(c.bdr.primary),
      bdr2: toRgb(c.bdr.secondary),
      accent: toRgb(theme.colors.primary),
      mode,
    };

    const field = createField({ ctx, palette, mix: mixRgb, rgba: rgbaStr });

    let w = 0;
    let h = 0;

    /**
     * Returns true when the backing store actually had to be reallocated.
     *
     * w/h are read every time regardless. They live in this effect's closure,
     * so a re-run — a theme toggle, or StrictMode's double mount in dev —
     * starts with them at zero even though the canvas element is already the
     * right size. Returning early before assigning them left every frame
     * drawing a 0x0 field, which is to say nothing at all.
     */
    const resize = () => {
      const box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.max(1, Math.round(box.width * dpr));
      const ch = Math.max(1, Math.round(box.height * dpr));
      w = Math.round(box.width);
      h = Math.round(box.height);
      const changed = canvas.width !== cw || canvas.height !== ch;
      if (changed) {
        canvas.width = cw;
        canvas.height = ch;
      }
      // Assigning width/height resets the transform, so it has to be re-applied
      // here; doing it unconditionally also covers the re-run case above.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      field.resize(w, h);
      return changed;
    };

    let pointer: { x: number; y: number } | null = null;

    const draw = (t: number) => {
      if (!w || !h) return;
      field.frame(t, w, h, pointer);
    };

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');

    let raf = 0;
    let last = 0;
    let clock = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!last) last = now;
      // Clamped so a backgrounded tab that missed a second of frames resumes
      // where it was rather than jumping the field across the screen.
      clock += Math.min(0.05, (now - last) / 1000) * SPEED;
      last = now;
      draw(clock);
    };

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const sync = () => {
      if (motionQuery.matches || document.hidden) {
        stop();
        // Reduced motion still gets a picture, just not a moving one.
        if (motionQuery.matches) {
          pointer = null;
          draw(STILL_AT);
        }
        return;
      }
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };

    const onResize = () => {
      if (resize() && (motionQuery.matches || document.hidden)) {
        draw(motionQuery.matches ? STILL_AT : clock);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!w || !h) return;
      const box = canvas.getBoundingClientRect();
      pointer = { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
    };
    // Leaving the window hands the field back to its own path.
    const onPointerOut = (e: PointerEvent) => {
      if (!e.relatedTarget) pointer = null;
    };

    resize();
    sync();

    const observer = new ResizeObserver(onResize);
    observer.observe(canvas);
    document.addEventListener('visibilitychange', sync);
    motionQuery.addEventListener('change', sync);
    if (pointerQuery.matches) {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      document.addEventListener('pointerout', onPointerOut);
    }

    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
      motionQuery.removeEventListener('change', sync);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerout', onPointerOut);
    };
  }, [mode]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        // Behind the page's content but above its background. The page root sets
        // `isolation: isolate`, which is what makes that reliable: it pins this
        // to the chooser's own stacking context instead of leaving it to
        // negotiate with whatever else is on the page.
        zIndex: -1,
        pointerEvents: 'none',
      }}
    />
  );
};

export default RefractedGlassField;
