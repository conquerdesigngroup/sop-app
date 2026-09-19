import React, { useEffect, useRef, useState } from 'react';
import { getThemeColors, theme } from '../theme';
import { useTheme } from '../contexts/ThemeContext';

/**
 * The ambient background on the staff dashboard: a faint contour map of a
 * landscape that slowly reshapes itself, every fifth line an index contour,
 * and one electric contour drifting across it like a tide.
 *
 * The owner picked it from a set of concepts for being the one that stays out
 * of the way of a screen somebody works in all day. That is the whole brief,
 * and every number below serves it: the regular lines sit about 20 levels off
 * the ground in dark mode, the index lines about 40, and the whole field fades
 * toward the foot of the screen where the working content is.
 *
 * What this must not cost anybody — the same three rules as the chooser's
 * RefractedGlassField:
 *
 * 1. `prefers-reduced-motion` paints ONE composed frame and stops. The listener
 *    is live, so toggling the setting takes effect without a reload.
 * 2. A hidden tab runs no frames at all — the loop is cancelled, not skipped.
 * 3. The backing store is capped: 0.6 of the device pixel ratio, itself capped
 *    at 2, and never under 0.75. The field is soft by nature; nobody can see
 *    the difference, and the GPU does a third of the work.
 *
 * And one of its own: it draws at 20fps, not 60. The fastest thing in it, the
 * tide line, moves about 4px a second, so a frame every 50ms is under a
 * third of a pixel of travel — indistinguishable from 60fps, at a third of the
 * cost, on a page that can be left open all day.
 *
 * WHY WEBGL AND NOT CANVAS 2D
 *   Contours are the level sets of a smooth field, and drawing them is a
 *   per-pixel question: how far is this pixel from the nearest level? That is
 *   the level spacing over the slope, |fract(v*N) - round| / N / |grad v|,
 *   which gives every line the same width in pixels however steep the ground
 *   is. On the CPU that is a marching-squares pass over the whole screen every
 *   frame; on the GPU it is a few lines of shader.
 *
 * If WebGL is unavailable the component draws nothing and the page keeps its
 * plain background.
 */

type Rgb = [number, number, number];

/** '#RRGGBB' -> [r, g, b] in 0..1. */
const toRgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

/** Milliseconds between frames. See "20fps, not 60" above. */
const FRAME_MS = 50;

/** The frame drawn when motion is off, and the one the field opens on. */
const STILL_AT = 30;

const VERTEX = 'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }';

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_bg;
uniform vec3 u_line;
uniform vec3 u_accent;
uniform float u_strength;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i); float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)); float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}
// The landscape: fbm, domain-warped by two more fbm lookups that drift, so the
// ground reshapes itself instead of sliding past.
float field(vec2 p, float t) {
  vec2 w = vec2(fbm(p * 0.7 + vec2(t * 0.02, 0.0)), fbm(p * 0.7 + vec2(3.1, -t * 0.017)));
  return fbm(p * 1.1 + w * 1.3 + vec2(0.0, t * 0.012));
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = fc / u_res;
  float zoom = 1.8;
  vec2 p = vec2((uv.x - 0.5) * u_res.x / u_res.y, uv.y - 0.5) * zoom;
  float t = u_time * 0.6;

  float e = 0.004;
  float v = field(p, t);
  vec2 g = vec2(field(p + vec2(e, 0.0), t) - v, field(p + vec2(0.0, e), t) - v) / e;
  float slope = max(length(g), 0.0005);

  // Distance to the nearest contour, in the same units as p: the gap between
  // levels over the slope. Compared against one pixel's worth of p, it gives
  // every line the same width in pixels on steep ground and flat alike.
  float levels = 18.0;
  float k = v * levels;
  float fk = fract(k);
  float dist = min(fk, 1.0 - fk) / levels / slope;
  float px = zoom / u_res.y;
  bool isIndex = mod(floor(k + 0.5), 5.0) < 0.5;
  float width = isIndex ? 1.1 : 0.6;
  float line = smoothstep(px * (width + 0.9), px * width * 0.4, dist);

  // The tide: one contour at a level that rises and falls over about two minutes.
  float tide = 0.42 + 0.16 * sin(t * 0.09);
  float hot = smoothstep(px * 1.7, px * 0.5, abs(v - tide) / slope);

  // A hint of hill-shading, lit from the upper left.
  vec3 n = normalize(vec3(-g * 0.18, 1.0));
  float shade = max(dot(n, normalize(vec3(-0.5, 0.6, 0.62))) * 1.4 - 0.2, 0.0);

  // Everything fades toward the foot of the screen, where the work is.
  float fade = mix(0.45, 1.0, uv.y) * u_strength;
  vec3 col = u_bg;
  col = mix(col, u_line, shade * 0.02 * fade);
  col = mix(col, u_line, line * (isIndex ? 0.18 : 0.08) * fade);
  col = mix(col, u_accent, hot * 0.245 * fade);
  // Dither: a gradient this dark bands visibly in eight bits without it.
  col += (hash(fc + fract(u_time * 7.13) * 91.0) - 0.5) * (1.5 / 255.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

const compile = (gl: WebGLRenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('TopoField: shader did not compile', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

const TopoField: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { isDark } = useTheme();
  // Bumped when the browser hands back a lost GPU context, which re-runs the
  // effect and rebuilds everything on the new one.
  const [contextEpoch, setContextEpoch] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window.matchMedia !== 'function' || typeof ResizeObserver === 'undefined') return;
    // `alpha` stays on (the default) even though every pixel is drawn opaque:
    // a WebGL canvas without it is solid black until its first frame, and
    // would stay black over a light page if a shader ever failed to compile.
    const gl = canvas.getContext('webgl', {
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
    });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('TopoField: program did not link', gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    // One triangle that covers the screen.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const attr = gl.getAttribLocation(program, 'a');
    gl.enableVertexAttribArray(attr);
    gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);

    // WebGL cannot resolve var(), so this reads the literal palette for the
    // current mode. The effect re-runs on a mode change, so the field re-themes
    // with everything else. Light mode draws ink on chalk, which reads stronger
    // than chalk on the void at the same alpha, so it is turned down a quarter.
    const palette = getThemeColors(isDark ? 'dark' : 'light');
    gl.uniform3fv(gl.getUniformLocation(program, 'u_bg'), toRgb(palette.bg.primary));
    gl.uniform3fv(gl.getUniformLocation(program, 'u_line'), toRgb(palette.txt.primary));
    gl.uniform3fv(gl.getUniformLocation(program, 'u_accent'), toRgb(theme.colors.primary));
    gl.uniform1f(gl.getUniformLocation(program, 'u_strength'), isDark ? 1 : 0.75);
    const uRes = gl.getUniformLocation(program, 'u_res');
    const uTime = gl.getUniformLocation(program, 'u_time');

    const draw = (t: number) => {
      gl.uniform1f(uTime, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const resize = () => {
      const box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const scale = Math.max(0.75, Math.min(window.devicePixelRatio || 1, 2) * 0.6);
      const w = Math.max(1, Math.round(box.width * scale));
      const h = Math.max(1, Math.round(box.height * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let lastDraw = 0;
    let clock = STILL_AT;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (lastDraw && now - lastDraw < FRAME_MS) return;
      // Clamped so a tab that was away a while resumes where it was rather
      // than jumping the landscape forward.
      clock += lastDraw ? Math.min(0.25, (now - lastDraw) / 1000) : 0;
      lastDraw = now;
      draw(clock);
    };

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const sync = () => {
      if (motionQuery.matches || document.hidden) {
        stop();
        if (motionQuery.matches) draw(STILL_AT);
        return;
      }
      if (!raf) {
        lastDraw = 0;
        raf = requestAnimationFrame(frame);
      }
    };

    // Resizing a canvas clears it, so every resize repaints straight away
    // rather than leaving a blank frame until the next tick.
    const onResize = () => {
      resize();
      draw(motionQuery.matches ? STILL_AT : clock);
    };

    const onLost = (e: Event) => {
      e.preventDefault();
      stop();
    };
    const onRestored = () => setContextEpoch(n => n + 1);

    resize();
    draw(clock);
    sync();

    const observer = new ResizeObserver(onResize);
    observer.observe(canvas);
    document.addEventListener('visibilitychange', sync);
    motionQuery.addEventListener('change', sync);
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
      motionQuery.removeEventListener('change', sync);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [isDark, contextEpoch]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        // Behind the page's content but above the App background. The page
        // root sets `isolation: isolate`, which is what makes that reliable —
        // the same arrangement as RefractedGlassField on the chooser.
        zIndex: -1,
        pointerEvents: 'none',
      }}
    />
  );
};

export default TopoField;
