import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildElf, SHELF_EDGE } from './elfModel';

/**
 * The WebGL half of the elf scout. Loaded only when he is actually out and on
 * the page you are looking at (React.lazy from ElfScout), so three.js never
 * touches the main bundle or anyone's first paint.
 *
 * Draws him on a small transparent canvas, with two invisible "shadow
 * catchers": the shelf's top surface and the card's front face, so his
 * dangling legs cast a soft shadow onto the card behind them. That shadow is
 * most of what makes him look like he is really sitting there.
 *
 * Runs at 30 fps while on screen and stops when scrolled away or when the tab
 * is hidden. Under prefers-reduced-motion he holds still and draws once.
 */

export interface ElfStageProps {
  width: number;
  height: number;
  /** Turn him a little toward the middle of the page: -1 left, 1 right. */
  facing?: number;
  /** Set true to play the pop; onGone fires when he has vanished. */
  popping?: boolean;
  onGone?: () => void;
  /** Called once with where the shelf edge falls, as a fraction of the height from the top. */
  onLayout?: (edgeFromTop: number) => void;
  /** WebGL unavailable: the host hides him rather than show a blank box. */
  onFail?: () => void;
}

const CENTER_Y = 0.42;
const VIEW_H = 1.56;
const DIST = 5;

export const edgeFractionFor = (camera: THREE.PerspectiveCamera): number => {
  const p = new THREE.Vector3(0, 0, SHELF_EDGE).project(camera);
  return (1 - p.y) / 2;
};

const ElfStage: React.FC<ElfStageProps> = ({ width, height, facing = 0, popping = false, onGone, onLayout, onFail }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const popRef = useRef<{ start: number } | null>(null);
  const cbRef = useRef({ onGone, onLayout, onFail });
  cbRef.current = { onGone, onLayout, onFail };
  const kickRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      cbRef.current.onFail?.();
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(width, height, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const fov = (2 * Math.atan(VIEW_H / 2 / DIST) * 180) / Math.PI;
    const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 20);
    camera.position.set(0, CENTER_Y + 1.1, DIST);
    camera.lookAt(0, CENTER_Y, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    cbRef.current.onLayout?.(edgeFractionFor(camera));

    // A soft studio room for reflections: the vinyl face, the gold bell.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const envMap = pmrem.fromScene(room, 0.04).texture;
    scene.environment = envMap;
    scene.environmentIntensity = 0.22;
    room.dispose();
    pmrem.dispose();

    // Lights: soft room fill, a warm key from the upper left, a cool rim.
    scene.add(new THREE.HemisphereLight(0xfff4e6, 0x3a2a30, 0.95));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
    key.position.set(-1.6, 3.2, 3.4);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    key.shadow.camera.left = -1;
    key.shadow.camera.right = 1;
    key.shadow.camera.top = 1.4;
    key.shadow.camera.bottom = -0.8;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 10;
    key.shadow.radius = 6;
    key.shadow.bias = -0.002;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfd6ff, 1.1);
    rim.position.set(2, 1.5, -2.5);
    scene.add(rim);

    // Shadow catchers: the shelf top and the card's front face.
    const catcher = new THREE.ShadowMaterial({ opacity: 0.32 });
    // Only a thin strip of the shelf top: the card has no visible top surface
    // on the page, so a shadow cast further back would float on the wall.
    const top = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.2), catcher);
    top.rotation.x = -Math.PI / 2;
    top.position.set(0, 0, SHELF_EDGE - 0.1);
    top.receiveShadow = true;
    scene.add(top);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.2), catcher);
    front.position.set(0, -0.6, SHELF_EDGE - 0.005);
    front.receiveShadow = true;
    scene.add(front);

    const elf = buildElf();
    const turn = Math.max(-1, Math.min(1, facing)) * 0.32;
    elf.root.rotation.y = turn;
    scene.add(elf.root);
    const b = elf.bones;
    const rest = {
      kneeL: b.kneeL.rotation.x, kneeR: b.kneeR.rotation.x,
      headY: b.head.rotation.y, headX: b.head.rotation.x, headZ: b.head.rotation.z,
      hood: b.hood.map(h => h.rotation.x),
      hoodZ: b.hood.map(h => h.rotation.z),
      chest: b.chest.rotation.x,
    };

    // Where the pointer is, relative to him, for the head to follow.
    const look = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / Math.max(200, window.innerWidth / 2);
      const dy = (e.clientY - (r.top + r.height * 0.3)) / Math.max(200, window.innerHeight / 2);
      look.tx = Math.max(-1, Math.min(1, dx));
      look.ty = Math.max(-1, Math.min(1, dy));
    };
    if (!reduced) window.addEventListener('pointermove', onMove, { passive: true });

    let raf = 0;
    let running = false;
    let visible = true;
    let last = 0;
    const t0 = performance.now();
    let goneFired = false;

    const pose = (now: number) => {
      const t = (now - t0) / 1000;
      if (!reduced) {
        // Feet swing in spells, the way a bored kid's do.
        const spell = 0.5 + 0.5 * Math.sin(t * 0.45);
        const swing = 0.2 * spell;
        b.kneeL.rotation.x = rest.kneeL + Math.sin(t * 3.1) * swing;
        b.kneeR.rotation.x = rest.kneeR + Math.sin(t * 3.1 + Math.PI) * swing;
        // Breathing.
        b.chest.rotation.x = rest.chest + Math.sin(t * 1.6) * 0.015;
        // Look at the pointer (eased), with an idle glance when it's still.
        look.x += (look.tx - look.x) * 0.06;
        look.y += (look.ty - look.y) * 0.06;
        const glance = Math.sin(t * 0.37) * 0.12;
        b.head.rotation.y = rest.headY + look.x * 0.55 - turn * 0.5 + glance;
        b.head.rotation.x = rest.headX + look.y * 0.25;
        b.head.rotation.z = rest.headZ + Math.sin(t * 0.8) * 0.04;
        // The hood's point lags behind the head, a little floppy.
        b.hood.forEach((h, i) => {
          h.rotation.x = rest.hood[i] + Math.sin(t * 1.3 - i * 0.6) * 0.05 * (i + 1);
          h.rotation.z = rest.hoodZ[i] - look.x * 0.12 * (i + 1) + Math.sin(t * 0.9 - i * 0.5) * 0.04;
        });
      }
      // The pop: a quick hop up and a spin down to nothing.
      if (popRef.current) {
        const p = Math.min(1, (now - popRef.current.start) / 460);
        const s = p < 0.25 ? 1 + 0.18 * (p / 0.25) : 1.18 * (1 - (p - 0.25) / 0.75) ** 2;
        elf.root.scale.setScalar(Math.max(0.0001, s));
        elf.root.rotation.y = turn + p * Math.PI * 2.5;
        elf.root.position.y = 0.12 * Math.sin(Math.min(1, p * 1.6) * Math.PI);
        if (p >= 1 && !goneFired) {
          goneFired = true;
          elf.root.visible = false;
          cbRef.current.onGone?.();
        }
      }
    };

    const frame = (now: number) => {
      raf = 0;
      if (!running) return;
      raf = requestAnimationFrame(frame);
      // 30 fps is plenty for a doll on a shelf, and half the battery.
      if (now - last < 1000 / 31 && !popRef.current) return;
      last = now;
      pose(now);
      renderer.render(scene, camera);
    };
    const start = () => {
      if (running || !visible || document.hidden) return;
      if (reduced && !popRef.current) { pose(performance.now()); renderer.render(scene, camera); return; }
      running = true;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    kickRef.current = () => { stop(); start(); };

    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVis);
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(entries => {
        visible = entries.some(e => e.isIntersecting);
        if (visible) start(); else stop();
      });
      io.observe(canvas);
    }
    start();

    const lost = (e: Event) => { e.preventDefault(); stop(); };
    canvas.addEventListener('webglcontextlost', lost);

    return () => {
      stop();
      kickRef.current = () => {};
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('webglcontextlost', lost);
      io?.disconnect();
      elf.dispose();
      top.geometry.dispose();
      front.geometry.dispose();
      catcher.dispose();
      envMap.dispose();
      renderer.dispose();
    };
    // Size and facing are fixed for a stage's life; the host remounts to change them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!popping || popRef.current) return;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      cbRef.current.onGone?.();
      return;
    }
    popRef.current = { start: performance.now() };
    kickRef.current();
  }, [popping]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      aria-hidden="true"
      style={{ width, height, display: 'block' }}
    />
  );
};

export default ElfStage;
