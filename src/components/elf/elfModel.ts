import * as THREE from 'three';

/**
 * The elf scout, built in code: no model file to download, nothing to
 * license, and about 20 KB of source instead of a megabyte of GLB.
 *
 * He is a proper rig: a skeleton of THREE.Bone joints (hips, spine, chest,
 * neck, head, a three-joint floppy hood, shoulders, elbows, wrists, hips,
 * knees and ankles), and every body part hangs off its bone. Posing him is
 * rotating bones, which is how he sits on a card's top edge like a shelf with
 * his legs over the front, swings his feet, looks around and pops when found.
 *
 * Look: a classic Christmas scout elf, but his own character: red felt suit,
 * white felt petal collar, a pointed felt hood with a white trim and a little
 * gold jingle bell, glossy vinyl face with painted eyes glancing to the side
 * and rosy cheeks. Felt is a physical material with sheen and a fibre bump
 * map drawn on a canvas, so it catches light like the real thing.
 *
 * Coordinates: y up, z toward the viewer. The shelf's top surface is y = 0
 * and its front edge is z = SHELF_EDGE; he sits behind the edge with his
 * shins hanging in front of it.
 */

export const SHELF_EDGE = 0.27;

export interface ElfRig {
  root: THREE.Group;
  bones: {
    hips: THREE.Bone;
    spine: THREE.Bone;
    chest: THREE.Bone;
    neck: THREE.Bone;
    head: THREE.Bone;
    hood: THREE.Bone[];
    shoulderL: THREE.Bone;
    shoulderR: THREE.Bone;
    elbowL: THREE.Bone;
    elbowR: THREE.Bone;
    wristL: THREE.Bone;
    wristR: THREE.Bone;
    hipL: THREE.Bone;
    hipR: THREE.Bone;
    kneeL: THREE.Bone;
    kneeR: THREE.Bone;
    ankleL: THREE.Bone;
    ankleR: THREE.Bone;
  };
  skeleton: THREE.Skeleton;
  /** Frees every geometry, material and texture he owns. */
  dispose: () => void;
}

// ----------------------------------------------------------------- textures

const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

/** Felt: a grey field of short crossing fibres, used as bump and roughness. */
const feltTexture = (): THREE.CanvasTexture => {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const rnd = seeded(7);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * size, y = rnd() * size;
    const a = rnd() * Math.PI * 2;
    const l = 3 + rnd() * 9;
    const v = Math.round(90 + rnd() * 90);
    g.strokeStyle = `rgba(${v},${v},${v},0.55)`;
    g.lineWidth = 0.6 + rnd() * 0.9;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  // Pilling: soft little bobbles.
  for (let i = 0; i < 160; i++) {
    const x = rnd() * size, y = rnd() * size, r = 1 + rnd() * 2.2;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(200,200,200,0.7)');
    grd.addColorStop(1, 'rgba(128,128,128,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
};

/**
 * The painted face, laid out for SphereGeometry's UVs: the front of the head
 * (+z) is u = 0.25, the equator is the canvas's middle row, the top of the
 * canvas is the crown.
 */
const faceTexture = (): THREE.CanvasTexture => {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  // Vinyl skin, a touch warmer toward the cheeks.
  g.fillStyle = '#F3C9A6';
  g.fillRect(0, 0, W, H);

  const cx = W * 0.25;
  const eq = H * 0.5;
  // Horizontal pixels per radian of longitude, and vertical per radian of latitude.
  const px = W / (Math.PI * 2);
  const py = H / Math.PI;

  // Painted hair: a glossy chestnut cap with a side-swept fringe. Most of it
  // sits under the hood; the fringe and sideburns show.
  g.fillStyle = '#5A3420';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(W, 0);
  g.lineTo(W, eq - py * 0.22);
  g.lineTo(cx + px * 1.25, eq - py * 0.22);
  g.quadraticCurveTo(cx + px * 1.0, eq + py * 0.05, cx + px * 0.86, eq + py * 0.02); // right sideburn
  g.quadraticCurveTo(cx + px * 0.7, eq - py * 0.28, cx + px * 0.25, eq - py * 0.36);
  g.quadraticCurveTo(cx - px * 0.15, eq - py * 0.25, cx - px * 0.5, eq - py * 0.42); // fringe swoop
  g.quadraticCurveTo(cx - px * 0.75, eq - py * 0.3, cx - px * 0.86, eq + py * 0.02); // left sideburn
  g.quadraticCurveTo(cx - px * 1.0, eq + py * 0.05, cx - px * 1.25, eq - py * 0.22);
  g.lineTo(0, eq - py * 0.22);
  g.closePath();
  g.fill();
  // A few lighter strands for gloss.
  g.strokeStyle = 'rgba(140,90,55,0.6)';
  g.lineWidth = 3;
  for (let i = -3; i <= 3; i++) {
    g.beginPath();
    g.moveTo(cx + px * i * 0.18, eq - py * 0.75);
    g.quadraticCurveTo(cx + px * (i * 0.18 - 0.12), eq - py * 0.5, cx + px * (i * 0.2 - 0.2), eq - py * 0.36);
    g.stroke();
  }

  // Rosy cheeks.
  for (const s of [-1, 1]) {
    const x = cx + s * px * 0.42, y = eq + py * 0.17;
    const grd = g.createRadialGradient(x, y, 0, x, y, px * 0.2);
    grd.addColorStop(0, 'rgba(232,110,110,0.75)');
    grd.addColorStop(1, 'rgba(232,110,110,0)');
    g.fillStyle = grd;
    g.fillRect(x - px * 0.3, y - px * 0.3, px * 0.6, px * 0.6);
  }

  // Eyes: big, oval, glancing to his left (our right) as if checking who's coming.
  for (const s of [-1, 1]) {
    const x = cx + s * px * 0.25, y = eq - py * 0.02;
    const ew = px * 0.13, eh = py * 0.15;
    g.fillStyle = '#FFFFFF';
    g.beginPath();
    g.ellipse(x, y, ew, eh, 0, 0, Math.PI * 2);
    g.fill();
    // Iris and pupil, shifted sideways.
    const ix = x + ew * 0.38, iy = y + eh * 0.12;
    g.fillStyle = '#3B6FB6';
    g.beginPath();
    g.ellipse(ix, iy, ew * 0.62, eh * 0.66, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#10131A';
    g.beginPath();
    g.ellipse(ix, iy, ew * 0.34, eh * 0.38, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#FFFFFF';
    g.beginPath();
    g.ellipse(ix - ew * 0.2, iy - eh * 0.28, ew * 0.16, eh * 0.14, 0, 0, Math.PI * 2);
    g.fill();
    // Upper lid line and three painted lashes.
    g.strokeStyle = '#2B1A12';
    g.lineWidth = 4;
    g.beginPath();
    g.ellipse(x, y, ew * 1.02, eh * 1.02, 0, Math.PI * 1.08, Math.PI * 1.92);
    g.stroke();
    g.lineWidth = 2.5;
    for (let k = 0; k < 3; k++) {
      const a = Math.PI * (1.2 + k * 0.14) + (s > 0 ? 0.25 : -0.05);
      const lx = x + Math.cos(a) * ew, ly = y + Math.sin(a) * eh;
      g.beginPath();
      g.moveTo(lx, ly);
      g.lineTo(lx + Math.cos(a) * ew * 0.35, ly + Math.sin(a) * eh * 0.35);
      g.stroke();
    }
    // Brows: thin, raised, mischievous.
    g.strokeStyle = '#5A3420';
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x - ew * 0.9, y - eh * 1.55 + s * 2);
    g.quadraticCurveTo(x, y - eh * 2.05, x + ew * 0.9, y - eh * 1.6 - s * 2);
    g.stroke();
  }

  // A small closed smile, curling up on one side.
  g.strokeStyle = '#B5413C';
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx - px * 0.12, eq + py * 0.28);
  g.quadraticCurveTo(cx + px * 0.02, eq + py * 0.36, cx + px * 0.15, eq + py * 0.25);
  g.stroke();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

// ------------------------------------------------------------------ builder

export const buildElf = (): ElfRig => {
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T): T => { disposables.push(x); return x; };

  const fibre = keep(feltTexture());
  const felt = (color: string, sheen: string) => keep(new THREE.MeshPhysicalMaterial({
    color,
    roughness: 1,
    roughnessMap: fibre,
    bumpMap: fibre,
    bumpScale: 1.2,
    sheen: 1,
    sheenColor: new THREE.Color(sheen),
    sheenRoughness: 0.85,
  }));
  const red = felt('#9E0C1E', '#E05A5A');
  const white = felt('#F4EFE6', '#FFFFFF');
  const skin = keep(new THREE.MeshPhysicalMaterial({ color: '#F3C9A6', roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.4 }));
  const faceMap = keep(faceTexture());
  const face = keep(new THREE.MeshPhysicalMaterial({ map: faceMap, roughness: 0.38, clearcoat: 0.45, clearcoatRoughness: 0.35 }));
  const gold = keep(new THREE.MeshStandardMaterial({ color: '#F0C24B', metalness: 0.9, roughness: 0.28, emissive: '#3A2400' }));
  const dark = keep(new THREE.MeshStandardMaterial({ color: '#2A1A10', roughness: 0.6 }));

  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const m = new THREE.Mesh(keep(geo), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const bone = (parent: THREE.Object3D, x: number, y: number, z: number, name: string) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  };
  /** A limb segment hanging down -y from its bone, length l. */
  const limb = (b: THREE.Bone, r: number, l: number, mat: THREE.Material, taper = 0.9) => {
    const geo = new THREE.CapsuleGeometry(r, Math.max(0.001, l - r * 2), 6, 12);
    geo.translate(0, -l / 2, 0);
    // Slight taper toward the far end, like a stuffed sleeve.
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = 1 - (1 - taper) * Math.min(1, Math.max(0, -pos.getY(i) / l));
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
    geo.computeVertexNormals();
    b.add(mesh(geo, mat));
  };

  const root = new THREE.Group();
  root.name = 'ElfScout';

  // ---- torso
  const hips = bone(root, 0, 0.075, 0, 'hips');
  const pelvis = mesh(new THREE.SphereGeometry(0.11, 20, 14), red);
  pelvis.scale.set(1.05, 0.62, 0.95);
  hips.add(pelvis);
  const spine = bone(hips, 0, 0.04, 0, 'spine');
  const chest = bone(spine, 0, 0.13, 0, 'chest');
  const bodyGeo = new THREE.CylinderGeometry(0.085, 0.108, 0.24, 20, 4);
  bodyGeo.translate(0, -0.04, 0);
  const body = mesh(bodyGeo, red);
  chest.add(body);
  // A pair of white felt buttons down the front.
  for (const y of [-0.02, -0.1]) {
    const b = mesh(new THREE.SphereGeometry(0.014, 10, 8), white);
    b.position.set(0, y, 0.098 + y * -0.12);
    b.scale.set(1, 1, 0.5);
    chest.add(b);
  }
  // Petal collar: eight felt points splayed over the shoulders.
  const collar = new THREE.Group();
  collar.position.set(0, 0.085, 0);
  chest.add(collar);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const petalGeo = new THREE.ConeGeometry(0.085, 0.18, 4, 1);
    petalGeo.scale(1, 1, 0.22);
    petalGeo.translate(0, 0.075, 0);
    const petal = mesh(petalGeo, white);
    petal.rotation.order = 'YXZ';
    petal.rotation.y = a;
    petal.rotation.x = 2.0;
    collar.add(petal);
  }
  const collarRing = mesh(new THREE.TorusGeometry(0.06, 0.022, 8, 20), white);
  collarRing.rotation.x = Math.PI / 2;
  collar.add(collarRing);

  // ---- head
  const neck = bone(chest, 0, 0.1, 0, 'neck');
  const neckMesh = mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.06, 12), skin);
  neckMesh.position.y = 0.02;
  neck.add(neckMesh);
  const head = bone(neck, 0, 0.05, 0, 'head');
  const R = 0.2;
  const skull = mesh(new THREE.SphereGeometry(R, 48, 32), face);
  skull.position.y = R * 0.92;
  skull.scale.set(1, 1.04, 0.97);
  head.add(skull);
  const nose = mesh(new THREE.SphereGeometry(0.022, 12, 10), skin);
  nose.position.set(0, R * 0.8, R * 0.97);
  head.add(nose);

  // Hood: a felt shell over the crown, sides and back of the head with an
  // oval opening for the face, its rim piped in white felt, ending in a
  // floppy point on three bones.
  const HR = R * 1.07;
  const OPEN = 1.12; // half-width of the face opening, radians of longitude
  const BROW = Math.PI * 0.3; // where the opening starts below the crown
  const CHIN = Math.PI * 0.7;
  const crown = mesh(new THREE.SphereGeometry(HR, 40, 12, 0, Math.PI * 2, 0, BROW), red);
  const shell = mesh(new THREE.SphereGeometry(HR, 40, 20, Math.PI / 2 + OPEN, Math.PI * 2 - OPEN * 2, 0, CHIN), red);
  for (const part of [crown, shell]) {
    (part.material as THREE.Material).side = THREE.DoubleSide;
    part.position.y = R * 0.95;
    head.add(part);
  }
  const onHood = (phi: number, theta: number, r = HR) =>
    new THREE.Vector3(-Math.cos(phi) * Math.sin(theta) * r, Math.cos(theta) * r + R * 0.95, Math.sin(phi) * Math.sin(theta) * r);
  const rim: THREE.Vector3[] = [];
  for (let i = 0; i <= 6; i++) rim.push(onHood(Math.PI / 2 - OPEN, CHIN - (CHIN - BROW) * (i / 6)));
  for (let i = 1; i < 10; i++) rim.push(onHood(Math.PI / 2 - OPEN + (OPEN * 2) * (i / 10), BROW));
  for (let i = 0; i <= 6; i++) rim.push(onHood(Math.PI / 2 + OPEN, BROW + (CHIN - BROW) * (i / 6)));
  const trim = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim), 64, 0.019, 10, false), white);
  head.add(trim);
  const hood0 = bone(head, 0, R * 1.85, -R * 0.4, 'hoodBase');
  hood0.rotation.x = -0.6;
  const seg = (b: THREE.Bone, r0: number, r1: number, l: number) => {
    const g = new THREE.CylinderGeometry(r1, r0, l, 18, 1);
    g.translate(0, l / 2, 0);
    b.add(mesh(g, red));
  };
  const capBase = mesh(new THREE.SphereGeometry(0.12, 20, 12), red);
  capBase.scale.set(1, 0.7, 1);
  hood0.add(capBase);
  seg(hood0, 0.12, 0.08, 0.16);
  const hood1 = bone(hood0, 0, 0.16, 0, 'hoodMid');
  hood1.rotation.set(-0.75, 0, 0.35);
  hood1.add(mesh(new THREE.SphereGeometry(0.08, 16, 10), red));
  seg(hood1, 0.08, 0.045, 0.15);
  const hood2 = bone(hood1, 0, 0.15, 0, 'hoodTip');
  hood2.rotation.set(-0.85, 0, 0.3);
  hood2.add(mesh(new THREE.SphereGeometry(0.045, 12, 8), red));
  seg(hood2, 0.045, 0.012, 0.12);
  const bell = mesh(new THREE.SphereGeometry(0.038, 18, 14), gold);
  bell.position.y = 0.15;
  hood2.add(bell);
  const slot = mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 16), dark);
  slot.position.set(0, 0.14, 0.033);
  hood2.add(slot);

  // ---- arms: long and thin, hands resting on his knees
  const arm = (s: number) => {
    const sh = bone(chest, s * 0.1, 0.06, 0, s < 0 ? 'shoulderL' : 'shoulderR');
    const shoulderBall = mesh(new THREE.SphereGeometry(0.045, 14, 10), red);
    sh.add(shoulderBall);
    limb(sh, 0.036, 0.22, red);
    const el = bone(sh, 0, -0.22, 0, s < 0 ? 'elbowL' : 'elbowR');
    limb(el, 0.032, 0.2, red);
    const wr = bone(el, 0, -0.2, 0, s < 0 ? 'wristL' : 'wristR');
    // Mitten hand: a soft flattened oval with a thumb.
    const palm = mesh(new THREE.SphereGeometry(0.042, 14, 10), skin);
    palm.scale.set(0.85, 1.2, 0.6);
    palm.position.y = -0.04;
    wr.add(palm);
    const thumb = mesh(new THREE.SphereGeometry(0.018, 10, 8), skin);
    thumb.position.set(-s * 0.03, -0.03, 0.012);
    wr.add(thumb);
    // White felt cuff.
    const cuff = mesh(new THREE.TorusGeometry(0.03, 0.012, 8, 16), white);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.005;
    wr.add(cuff);
    return { sh, el, wr };
  };
  const L = arm(-1), Rt = arm(1);

  // ---- legs: thighs along the shelf, shins over the edge
  const leg = (s: number) => {
    const hp = bone(hips, s * 0.06, -0.02, 0.01, s < 0 ? 'hipL' : 'hipR');
    limb(hp, 0.048, 0.3, red, 0.85);
    const kn = bone(hp, 0, -0.29, 0, s < 0 ? 'kneeL' : 'kneeR');
    kn.add(mesh(new THREE.SphereGeometry(0.04, 12, 10), red));
    limb(kn, 0.038, 0.27, red, 0.85);
    const an = bone(kn, 0, -0.27, 0, s < 0 ? 'ankleL' : 'ankleR');
    // Felt bootie with a turned-up toe.
    const bootGeo = new THREE.SphereGeometry(0.045, 16, 12);
    bootGeo.scale(0.85, 0.75, 1.7);
    const boot = mesh(bootGeo, red);
    boot.position.set(0, -0.02, 0.035);
    an.add(boot);
    const toe = mesh(new THREE.ConeGeometry(0.022, 0.06, 10), red);
    toe.position.set(0, 0.0, 0.11);
    toe.rotation.x = 0.9;
    an.add(toe);
    return { hp, kn, an };
  };
  const LL = leg(-1), RL = leg(1);

  const bones = {
    hips, spine, chest, neck, head,
    hood: [hood0, hood1, hood2],
    shoulderL: L.sh, shoulderR: Rt.sh, elbowL: L.el, elbowR: Rt.el, wristL: L.wr, wristR: Rt.wr,
    hipL: LL.hp, hipR: RL.hp, kneeL: LL.kn, kneeR: RL.kn, ankleL: LL.an, ankleR: RL.an,
  };
  const skeleton = new THREE.Skeleton([
    hips, spine, chest, neck, head, hood0, hood1, hood2,
    L.sh, L.el, L.wr, Rt.sh, Rt.el, Rt.wr, LL.hp, LL.kn, LL.an, RL.hp, RL.kn, RL.an,
  ]);

  sitOnShelf({ root, bones } as ElfRig);

  return {
    root,
    bones,
    skeleton,
    dispose: () => disposables.forEach(d => d.dispose()),
  };
};

/** The rest pose: sitting on a shelf edge, hands on knees, head a little tilted. */
export const sitOnShelf = (rig: Pick<ElfRig, 'bones'>) => {
  const b = rig.bones;
  b.spine.rotation.set(-0.06, 0, 0);
  b.chest.rotation.set(0.04, 0, 0);
  b.neck.rotation.set(0.05, 0, 0);
  b.head.rotation.set(0.08, 0.18, 0.1);
  // Thighs point forward along the shelf, knees bend so shins hang over.
  b.hipL.rotation.set(-Math.PI / 2 + 0.05, 0, 0.06);
  b.hipR.rotation.set(-Math.PI / 2 + 0.05, 0, -0.06);
  b.kneeL.rotation.set(Math.PI / 2 - 0.05, 0, 0);
  b.kneeR.rotation.set(Math.PI / 2 - 0.05, 0, 0);
  b.ankleL.rotation.set(-0.15, 0, 0);
  b.ankleR.rotation.set(-0.15, 0, 0);
  // Arms reach forward so the mittens rest on the knees.
  b.shoulderL.rotation.set(-0.75, 0, -0.18);
  b.shoulderR.rotation.set(-0.75, 0, 0.18);
  b.elbowL.rotation.set(-0.55, 0, 0.1);
  b.elbowR.rotation.set(-0.55, 0, -0.1);
  b.wristL.rotation.set(-0.2, 0, 0);
  b.wristR.rotation.set(-0.2, 0, 0);
};
