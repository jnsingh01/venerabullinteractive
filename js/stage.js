/* Venerabull Interactive: the stage.
   One field of light particles, fixed behind the page, that changes form as you scroll through it:
     two      two rings of light passing through each other (the opening)
     many     many lights, loosely joined (the two apps)
     touch    a surface that answers touch: a mouse or pen over it, or a finger on it (the craft)
     forever  scattered photographs gathering into one resting form (Forever)
     red      restless light gathered into one calm dome, then dimming (Red Button)
     quiet    no light while the index is read; the loop pauses
     mark     the Venerabull mark, drawn in light (what comes next)
   Native scrolling only: the page is never scroll-jacked. Plain WebGL points (no libraries), a 2D canvas fallback,
   a capped pixel ratio, an adaptive particle count, and a pause whenever the tab is hidden or the stage is dark.
   With motion off (the system setting or the visitor's choice), one composed still frame is drawn per world; a tap
   or click on the surface redraws its frame pressed where it landed, with nothing animated. */
(() => {
  'use strict';

  const canvas = document.getElementById('stage');
  if (!canvas) return;
  const root = document.documentElement;

  /* ---------- Deterministic randomness: the same composition on every visit. ---------- */

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hash = (n, k) => { const x = Math.sin(n * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

  const CAP = 6000;
  const rnd = mulberry32(0x5eed);
  const R0 = new Float32Array(CAP), R1 = new Float32Array(CAP), R2 = new Float32Array(CAP), R3 = new Float32Array(CAP);
  const R4 = new Float32Array(CAP), R5 = new Float32Array(CAP), R6 = new Float32Array(CAP), R7 = new Float32Array(CAP);
  const UX = new Float32Array(CAP), UY = new Float32Array(CAP), UZ = new Float32Array(CAP);
  for (let i = 0; i < CAP; i++) {
    R0[i] = rnd(); R1[i] = rnd(); R2[i] = rnd(); R3[i] = rnd();
    R4[i] = rnd(); R5[i] = rnd(); R6[i] = rnd(); R7[i] = rnd();
    const th = 2 * Math.PI * rnd();
    const ph = Math.acos(2 * rnd() - 1);
    UX[i] = Math.sin(ph) * Math.cos(th); UY[i] = Math.cos(ph); UZ[i] = Math.sin(ph) * Math.sin(th);
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const ease = (t) => t * t * (3 - 2 * t);

  /* ---------- Palette (linear 0..1). ---------- */

  const CREAM = [0.957, 0.941, 0.906];
  const GOLD = [0.97, 0.80, 0.56];
  const BRONZE = [0.80, 0.64, 0.45];
  const F_COOL = [0.90, 0.91, 0.93];      // Forever's white space
  const F_WARM = [0.965, 0.925, 0.90];    // Forever's name colour
  const RUBY = [0.93, 0.19, 0.29];        // Red Button's descent: ruby, deep red, burgundy
  const DEEP = [0.66, 0.06, 0.16];
  const BURG = [0.42, 0.04, 0.12];

  /* ---------- Output buffers for two stages being blended. ---------- */

  function makeBuf() {
    return { x: new Float32Array(CAP), y: new Float32Array(CAP), z: new Float32Array(CAP), b: new Float32Array(CAP),
      r: new Float32Array(CAP), g: new Float32Array(CAP), bl: new Float32Array(CAP) };
  }
  const BA = makeBuf();
  const BB = makeBuf();

  function put(o, i, x, y, z, b, c) { o.x[i] = x; o.y[i] = y; o.z[i] = z; o.b[i] = b; o.r[i] = c[0]; o.g[i] = c[1]; o.bl[i] = c[2]; }
  function putMix(o, i, x, y, z, b, c0, c1, m) {
    o.x[i] = x; o.y[i] = y; o.z[i] = z; o.b[i] = b;
    o.r[i] = c0[0] + (c1[0] - c0[0]) * m; o.g[i] = c0[1] + (c1[1] - c0[1]) * m; o.bl[i] = c0[2] + (c1[2] - c0[2]) * m;
  }
  // Rotate a buffer's points in place: yaw about the vertical, then pitch about the horizontal.
  function turn(o, n, yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    for (let i = 0; i < n; i++) {
      const x = o.x[i], y = o.y[i], z = o.z[i];
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      o.x[i] = x1; o.y[i] = y * cp - z1 * sp; o.z[i] = y * sp + z1 * cp;
    }
  }

  /* ---------- Layout and pointer. ---------- */

  let L = { w: 1, h: 1, dpr: 1, narrow: false };
  const ptr = { x: 0, y: 0, nx: 0, ny: 0, sx: 0, sy: 0, active: false, last: -1e9 };
  const touchPt = { x: 0, z: 0 };

  /* ---------- I. Two rings of light passing through each other. ---------- */

  function stTwo(n, t, p, o) {
    const gA = t * 0.33, gB = t * 0.27 + 2.1;
    const TAU = 6.2832;
    for (let i = 0; i < n; i++) {
      const r0 = R0[i];
      if (r0 < 0.92) {
        const ringA = r0 < 0.5;
        const R = ringA ? 0.6 : 0.47, rt = ringA ? 0.05 : 0.043;
        const u = R1[i] * TAU + t * (ringA ? 0.05 : -0.04) * (0.8 + 0.4 * R4[i]);
        const v = R2[i] * TAU;
        const tube = rt * (0.55 + 0.45 * R3[i]);
        const cu = Math.cos(u), su = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v);
        const rr = R + tube * cv;
        let x, y, z;
        if (ringA) { x = -0.24 + rr * cu; y = rr * su; z = tube * sv; }
        else { x = 0.24 + rr * cu; z = rr * su; y = tube * sv; }
        let dd = (u - (ringA ? gA : gB)) % TAU; if (dd < 0) dd += TAU;
        const dist = Math.min(dd, TAU - dd);
        const glint = Math.exp(-(dist * dist) / 0.09);
        const b = 0.5 + 0.22 * cv + 0.55 * glint;
        putMix(o, i, x, y, z, b, ringA ? CREAM : GOLD, ringA ? GOLD : CREAM, glint * 0.6);
      } else {
        const k = Math.cbrt(R4[i]) * 1.15;
        const x = UX[i] * k + 0.03 * Math.sin(t * 0.2 + R1[i] * 20);
        const y = UY[i] * k * 0.8 + 0.03 * Math.cos(t * 0.17 + R2[i] * 20);
        put(o, i, x, y, UZ[i] * k, 0.12, BRONZE);
      }
    }
    turn(o, n, t * 0.12 + ptr.sx * 0.25, 0.34 + 0.12 * Math.sin(t * 0.07) + ptr.sy * 0.1);
  }

  /* ---------- II. Many lights, loosely joined. ---------- */

  const K_MANY = 42;
  const CX = new Float32Array(K_MANY), CY = new Float32Array(K_MANY), CZ = new Float32Array(K_MANY), CS = new Float32Array(K_MANY);
  const NB1 = new Uint8Array(K_MANY), NB2 = new Uint8Array(K_MANY);
  const DX = new Float32Array(K_MANY), DY = new Float32Array(K_MANY);
  function layoutMany() {
    const cols = L.narrow ? 6 : 7, rows = L.narrow ? 7 : 6;
    const XR = L.narrow ? 0.95 : 1.22, YR = L.narrow ? 1.3 : 0.82;
    for (let c = 0; c < K_MANY; c++) {
      const gx = c % cols, gy = Math.floor(c / cols) % rows;
      CX[c] = ((gx + 0.5) / cols * 2 - 1) * XR + (hash(c, 1) - 0.5) * 0.3 * XR / cols * 2;
      CY[c] = ((gy + 0.5) / rows * 2 - 1) * YR + (hash(c, 2) - 0.5) * 0.3 * YR / rows * 2;
      CZ[c] = (hash(c, 3) - 0.5) * 0.9;
      CS[c] = 0.028 + 0.03 * hash(c, 4);
    }
    for (let c = 0; c < K_MANY; c++) {
      let b1 = -1, b2 = -1, d1 = 1e9, d2 = 1e9;
      for (let d = 0; d < K_MANY; d++) {
        if (d === c) continue;
        const dd = (CX[c] - CX[d]) ** 2 + (CY[c] - CY[d]) ** 2 + (CZ[c] - CZ[d]) ** 2 * 0.5;
        if (dd < d1) { d2 = d1; b2 = b1; d1 = dd; b1 = d; } else if (dd < d2) { d2 = dd; b2 = d; }
      }
      NB1[c] = b1; NB2[c] = b2;
    }
  }
  function stMany(n, t, p, o) {
    for (let c = 0; c < K_MANY; c++) {
      DX[c] = CX[c] + 0.035 * Math.sin(t * 0.13 + c * 2.1);
      DY[c] = CY[c] + 0.03 * Math.cos(t * 0.11 + c * 1.3);
    }
    for (let i = 0; i < n; i++) {
      if (R0[i] < 0.86) {
        const c = Math.floor(R0[i] / 0.86 * K_MANY) % K_MANY;
        const rr = CS[c] * (0.35 + 0.65 * R4[i]);
        const z = CZ[c] + UZ[i] * rr;
        put(o, i, DX[c] + UX[i] * rr, DY[c] + UY[i] * rr, z, 0.62 + 0.25 * hash(c, 5), CREAM);
      } else {
        const a = Math.floor(R1[i] * K_MANY) % K_MANY;
        const bq = R2[i] < 0.5 ? NB1[a] : NB2[a];
        let u = R3[i] + t * 0.02 * (R4[i] < 0.5 ? 1 : -1); u -= Math.floor(u);
        const j = (R5[i] - 0.5) * 0.006;
        put(o, i, DX[a] + (DX[bq] - DX[a]) * u + j, DY[a] + (DY[bq] - DY[a]) * u - j, CZ[a] + (CZ[bq] - CZ[a]) * u, 0.2, BRONZE);
      }
    }
    turn(o, n, 0.12 * Math.sin(t * 0.06) + ptr.sx * 0.1, ptr.sy * 0.05);
  }

  /* ---------- III. A surface that answers touch. ---------- */

  const TILT = 0.92, CT = Math.cos(TILT), ST = Math.sin(TILT);
  function stTouch(n, t, p, o) {
    const cols = Math.max(2, Math.round(Math.sqrt(n * 1.55)));
    const rows = Math.max(2, Math.ceil(n / cols));
    const tx = touchPt.x, tz = touchPt.z;
    for (let i = 0; i < n; i++) {
      const u = (i % cols) / (cols - 1) - 0.5;
      const v = Math.floor(i / cols) / (rows - 1) - 0.5;
      const X = u * 2.3, Z = v * 1.5;
      const dx = X - tx, dz = Z - tz;
      const d2 = dx * dx + dz * dz, d = Math.sqrt(d2);
      const dent = -0.26 * Math.exp(-d2 / 0.06);
      const ripple = 0.02 * Math.sin(d * 26 - t * 2.4) * Math.exp(-d * 2.8);
      const swell = 0.025 * Math.sin(X * 2.2 + t * 0.5) * Math.cos(Z * 2.6 - t * 0.35);
      const H = dent + ripple + swell;
      const edge = smooth(0.5, 0.34, Math.max(Math.abs(u), Math.abs(v)));
      const b = (0.62 + 2.6 * -dent + 8 * Math.abs(ripple)) * edge;
      putMix(o, i, X, Z * ST + H * CT - 0.04, -Z * CT + H * ST, b, GOLD, CREAM, clamp(-dent * 4, 0, 1));
    }
    turn(o, n, -0.22 + 0.06 * Math.sin(t * 0.07), 0);
  }

  /* ---------- IV. Scattered photographs gathering into one resting form. ---------- */

  const K_PHOTO = 12;
  const PX = new Float32Array(K_PHOTO), PY = new Float32Array(K_PHOTO), PZ = new Float32Array(K_PHOTO);
  const PRZ = new Float32Array(K_PHOTO), PRY = new Float32Array(K_PHOTO);
  function layoutForever() {
    const rx = L.narrow ? 0.8 : 1.02, ry = L.narrow ? 0.7 : 0.62;
    for (let k = 0; k < K_PHOTO; k++) {
      const a = k / K_PHOTO * Math.PI * 2 + (hash(k, 7) - 0.5) * 0.35 + 0.2;
      PX[k] = Math.cos(a) * rx; PY[k] = Math.sin(a) * ry; PZ[k] = (hash(k, 8) - 0.5) * 0.7;
      PRZ[k] = (hash(k, 9) - 0.5) * 0.6; PRY[k] = (hash(k, 10) - 0.5) * 0.9;
    }
  }
  function stForever(n, t, p, o) {
    const A = smooth(0.06, 0.36, p);
    const yaw = t * 0.1, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(0.62), sp = Math.sin(0.62);
    const breathe = 1 + 0.03 * Math.sin(t * 1.05);
    const W = 0.27, H = 0.33;
    for (let i = 0; i < n; i++) {
      // The photograph this light belongs to.
      const k = Math.floor(R6[i] * K_PHOTO) % K_PHOTO;
      let qx, qy, qb;
      if (R3[i] < 0.58) {
        const e = Math.floor(R4[i] * 4), s = R1[i] - 0.5;
        if (e === 0) { qx = s * W; qy = H / 2; } else if (e === 1) { qx = s * W; qy = -H / 2; }
        else if (e === 2) { qx = W / 2; qy = s * H; } else { qx = -W / 2; qy = s * H; }
        qb = 0.42;
      } else {
        qx = (R1[i] - 0.5) * W * 0.84; qy = (R2[i] - 0.5) * H * 0.84;
        qb = 0.1 + 0.1 * (0.5 + 0.5 * Math.sin(R1[i] * 6 + k) * Math.cos(R2[i] * 5 - k));
      }
      const cz = Math.cos(PRZ[k]), sz = Math.sin(PRZ[k]);
      let px = qx * cz - qy * sz, py = qx * sz + qy * cz, pz = 0;
      const cr = Math.cos(PRY[k]), sr = Math.sin(PRY[k]);
      const px2 = px * cr, pz2 = -px * sr;
      px = px2 + PX[k]; py += PY[k] + 0.02 * Math.sin(t * 0.4 + k); pz = pz2 + PZ[k];

      // The resting form: a body curled round on itself, its head resting near its tail, breathing slowly.
      let fx, fy, fz, nx, ny, nz, cvOut = 1;
      if (R0[i] < 0.8) {
        const ARC = 5.6, a0 = 0.5, Rm = 0.27;
        const s = R1[i], ang = a0 + s * ARC;
        const rt = 0.23 * (1 - 0.7 * Math.pow(s, 1.8)) * breathe;
        const v = R2[i] * 6.2832, cv = Math.cos(v), sv = Math.sin(v);
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const lift = 0.04 * Math.sin(s * 3.1);
        fx = ca * (Rm + rt * cv) * 1.3; fz = sa * (Rm + rt * cv) * 0.95; fy = rt * sv * 0.8 + lift;
        nx = ca * cv; nz = sa * cv; ny = sv; cvOut = cv;
        if (fy < -0.1) { fy = -0.1 + (fy + 0.1) * 0.25; }
      } else {
        const ha = 0.12, hr = 0.155;
        const hx = Math.cos(ha) * 0.36 * 1.3, hz = Math.sin(ha) * 0.36 * 0.95;
        const snout = R3[i] < 0.22;
        const k = snout ? 0.55 : 1;
        const ox = snout ? -Math.sin(ha) * 0.12 - 0.02 : 0, oz = snout ? Math.cos(ha) * 0.12 : 0;
        fx = hx + ox + UX[i] * hr * k; fy = 0.13 + UY[i] * hr * k * 0.92 - (snout ? 0.05 : 0); fz = hz + oz + UZ[i] * hr * k;
        nx = UX[i]; ny = UY[i]; nz = UZ[i];
      }
      const x1 = fx * cy + fz * sy, z1 = -fx * sy + fz * cy;
      const gx = x1, gy = fy * cp - z1 * sp, gz = fy * sp + z1 * cp;
      // Light gathers at the silhouette, so the form reads as one body from every side.
      const nz1 = -nx * sy + nz * cy;
      const rim = 1 - Math.abs(ny * sp + nz1 * cp);
      const outward = R0[i] < 0.8 ? 0.3 + 0.7 * Math.max(0, cvOut) : 1;
      const fb = 0.07 + 0.12 * Math.max(0, ny) + 1.05 * rim * rim * rim * outward;

      const a = ease(clamp(A * 1.25 - R5[i] * 0.25, 0, 1));
      putMix(o, i, px + (gx - px) * a, py + (gy - py) * a, pz + (gz - pz) * a, qb + (fb - qb) * a, F_COOL, F_WARM, a);
    }
  }

  /* ---------- V. Restless light, gathered into one calm dome. ---------- */

  const LX = -0.42, LY = 0.74, LZ = 0.52;
  function stRed(n, t, p, o) {
    const C = smooth(0.14, 0.5, p);
    const D = smooth(0.58, 0.96, p);
    const pq = (p - 0.5) / 0.06;
    const press = 1 - 0.1 * Math.exp(-pq * pq);
    const glow = 1 + 0.07 * Math.sin(t * 1.047);   // about a six-second standby cycle
    const col = D < 0.5
      ? [RUBY[0] + (DEEP[0] - RUBY[0]) * D * 2, RUBY[1] + (DEEP[1] - RUBY[1]) * D * 2, RUBY[2] + (DEEP[2] - RUBY[2]) * D * 2]
      : [DEEP[0] + (BURG[0] - DEEP[0]) * (D - 0.5) * 2, DEEP[1] + (BURG[1] - DEEP[1]) * (D - 0.5) * 2, DEEP[2] + (BURG[2] - DEEP[2]) * (D - 0.5) * 2];
    const dim = (1 - 0.45 * D) * 1.35;
    for (let i = 0; i < n; i++) {
      const c = ease(clamp(C * 1.3 - R5[i] * 0.3, 0, 1));
      const J = 1 - c;
      const rr = (0.35 + 0.6 * R4[i]) * 0.95;
      const ax = UX[i] * rr + J * (0.08 * Math.sin(t * 2.6 + R1[i] * 40) + 0.04 * Math.sin(t * 4.1 + R2[i] * 17));
      const ay = UY[i] * rr + J * (0.08 * Math.sin(t * 2.3 + R2[i] * 40) + 0.04 * Math.sin(t * 3.7 + R3[i] * 17));
      const az = UZ[i] * rr + J * 0.06 * Math.sin(t * 2.9 + R3[i] * 40);

      let dx, dy, dz, db;
      const r0 = R0[i];
      if (r0 < 0.68) {
        const ny = Math.abs(UY[i]);
        dx = UX[i] * 0.5; dy = ny * 0.4 * press - 0.12; dz = UZ[i] * 0.5;
        const spec = Math.max(0, UX[i] * LX + ny * LY + UZ[i] * LZ);
        db = 0.36 + 0.34 * (1 - ny) + 0.7 * Math.pow(spec, 14);
      } else if (r0 < 0.8) {
        const a = R1[i] * 6.2832;
        dx = Math.cos(a) * 0.5; dy = -0.12; dz = Math.sin(a) * 0.5; db = 0.95;   // the hairline ring of light
      } else if (r0 < 0.88) {
        const a = R1[i] * 6.2832;
        dx = Math.cos(a) * 0.6; dy = -0.13; dz = Math.sin(a) * 0.6; db = 0.2;    // the edge of the well
      } else {
        const a = R1[i] * 6.2832, r = Math.sqrt(R2[i]) * 0.48;
        dx = Math.cos(a) * r; dy = -0.12; dz = Math.sin(a) * r; db = 0.3;      // light from beneath
      }
      const b = (0.62 + (db * glow - 0.62) * c) * dim;
      put(o, i, ax + (dx - ax) * c, ay + (dy - ay) * c, az + (dz - az) * c, b, c > 0.5 ? col : RUBY);
    }
    turn(o, n, 0.2 * Math.sin(t * 0.08) * (1 - D), 0.42);
  }

  /* ---------- Quiet: the index is read on a still ground. ---------- */

  function stQuiet(n, t, p, o) {
    for (let i = 0; i < n; i++) put(o, i, (R1[i] - 0.5) * 3.6, -0.7, (R2[i] - 0.5) * 1.2, 0.3, BRONZE);
  }

  /* ---------- VI. The Venerabull mark, drawn in light. ---------- */

  let MX = null, MY = null, MN = 0, MPIX = 0, MBOT = 0;
  function sampleMark() {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const W = 260, H = Math.round(W * img.naturalHeight / img.naturalWidth);
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0, W, H);
        const d = x.getImageData(0, 0, W, H).data;
        const xs = [], ys = [];
        const span = 1.5;
        for (let yy = 0; yy < H; yy++) {
          for (let xx = 0; xx < W; xx++) {
            if (d[(yy * W + xx) * 4 + 3] > 140) {
              xs.push((xx / (W - 1) - 0.5) * span);
              ys.push(-(yy / (H - 1) - 0.5) * span * (H / W));
            }
          }
        }
        if (xs.length > 200) { MX = Float32Array.from(xs); MY = Float32Array.from(ys); MN = xs.length; MPIX = span / W; MBOT = 0; for (let q = 0; q < ys.length; q++) if (-ys[q] > MBOT) MBOT = -ys[q]; }
        requestRender();
      } catch (e) { /* a page opened from disk cannot read pixels; the opening's two forms stand in */ }
    };
    img.src = 'assets/venerabull-mark-cream.png';
  }
  function stMark(n, t, p, o) {
    if (!MN) { stTwo(n, t, p, o); return; }
    const sweep = ((t * 0.11) % 2.2) - 1.1;
    for (let i = 0; i < n; i++) {
      const j = Math.floor(R2[i] * MN) % MN;
      const x = MX[j] + (R3[i] - 0.5) * MPIX, y = MY[j] + (R4[i] - 0.5) * MPIX;
      const z = (R5[i] - 0.5) * 0.05 + 0.03 * Math.sin(t * 0.6 + x * 3);
      const sw = x + y * 0.4 - sweep;
      const g = Math.exp(-(sw * sw) / 0.03);
      putMix(o, i, x, y, z, 0.58 + 0.42 * g, BRONZE, CREAM, g * 0.8);
    }
    turn(o, n, 0.22 * Math.sin(t * 0.09) + ptr.sx * 0.08, ptr.sy * 0.04);
  }

  /* ---------- Where each world sits on screen, and its ground. [wide, narrow] ---------- */

  const STAGES = {
    two:     { fn: stTwo,     ax: [0.68, 0.5], ay: [0.46, 0.29], s: [1.05, 0.95], op: [1, 1],     g: [11, 10, 9], scrim: 0.6,  still: 0.5, stillT: 4.2 },
    many:    { fn: stMany,    ax: [0.67, 0.5], ay: [0.5, 0.27],  s: [0.95, 0.9], op: [0.9, 0.9], g: [11, 10, 9], scrim: 0.95, still: 0.5 },
    touch:   { fn: stTouch,   ax: [0.69, 0.5], ay: [0.55, 0.26], s: [1.0, 0.82], op: [1, 1],     g: [12, 10, 8], scrim: 0.95, still: 0.5 },
    forever: { fn: stForever, ax: [0.7, 0.5],  ay: [0.5, 0.26],  s: [0.95, 0.8], op: [1, 1],     g: [20, 15, 22], scrim: 0.95, still: 0.85 },
    red:     { fn: stRed,     ax: [0.7, 0.5],  ay: [0.53, 0.25], s: [1.05, 0.85], op: [1, 1],    g: [0, 0, 0],   scrim: 0.95, still: 0.56 },
    quiet:   { fn: stQuiet,   ax: [0.5, 0.5],  ay: [0.5, 0.5],   s: [1, 1],       op: [0, 0],    g: [11, 10, 9], scrim: 0,    still: 0.5 },
    mark:    { fn: stMark,    ax: [0.7, 0.5],  ay: [0.5, 0.26],  s: [0.8, 0.7],   op: [0.95, 0.9], g: [11, 10, 9], scrim: 0.95, still: 0.5 },
  };
  const SIDE = { many: 1, touch: 1, forever: 1, red: 1, mark: 1 };

  function scaleOf(name) {
    const m = STAGES[name], k = L.narrow ? 1 : 0;
    const base = L.narrow ? Math.min(L.w * 0.5, L.h * 0.42) : SIDE[name] ? Math.min(L.w * 0.27, L.h * 0.42) : Math.min(L.w * 0.5, L.h * 0.42);
    return base * m.s[k];
  }
  // Where a world sits on screen: its scale, its centre's height and its opacity. The mark never crosses the
  // hairline at the top of the footer. Beside the text (wide screens), once the footer comes up, the mark rests
  // 24 px above that line; on a phone, where the last sheet has already slid over it, its light fades out instead
  // over the last 48 px before its lowest point would come within 24 px of the line.
  function place(name) {
    const k = L.narrow ? 1 : 0, m = STAGES[name], s = scaleOf(name);
    let y = m.ay[k] * L.h, o = m.op[k];
    if (name === 'mark' && MN && footY < Infinity) {
      const limit = footY - window.scrollY - 24 - (MBOT * s * 1.03 + 8);
      if (!L.narrow) y = Math.min(y, limit);
      else o *= clamp((limit - y) / 48, 0, 1);
    }
    return { s, x: m.ax[k] * L.w, y, o };
  }
  // Where a pointer meets the Interactive surface, in the surface's own units (null where it misses the surface).
  function surfacePoint(x, y) {
    const k = L.narrow ? 1 : 0, sc = scaleOf('touch');
    const wx = (x - STAGES.touch.ax[k] * L.w) / sc, wy = -(y - STAGES.touch.ay[k] * L.h) / sc;
    if (Math.abs(wx) < 1.4 && Math.abs(wy) < 1.0) return { x: clamp(wx, -1.1, 1.1), z: clamp(wy / ST, -0.72, 0.72) };
    return null;
  }

  /* ---------- Scroll position, measured from the page's own sections. ---------- */

  let spans = [];
  let footY = Infinity;   // the footer's top hairline, in page coordinates
  function measureSpans() {
    const els = Array.from(document.querySelectorAll('[data-stage]'));
    const sy = window.scrollY;
    const footLine = document.querySelector('.foot__inner');
    footY = footLine ? footLine.getBoundingClientRect().top + sy : Infinity;
    spans = [];
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.height === 0) return;
      const st = el.dataset.stage;
      const last = spans[spans.length - 1];
      if (last && last.stage === st) last.bottom = Math.max(last.bottom, r.bottom + sy);
      else spans.push({ stage: st, top: r.top + sy, bottom: r.bottom + sy });
    });
    const foot = document.querySelector('[data-stage-extend]');
    if (foot && spans.length) spans[spans.length - 1].bottom = Math.max(spans[spans.length - 1].bottom, foot.getBoundingClientRect().bottom + sy);
    for (let i = 1; i < spans.length; i++) spans[i].top = spans[i - 1].bottom;
    spans.forEach((s) => { s.h = Math.max(1, s.bottom - s.top); });
  }
  function scrollCoord() {
    if (!spans.length) return 0;
    const c = window.scrollY + L.h * 0.5;
    if (c <= spans[0].top) return 0;
    for (let k = 0; k < spans.length; k++) {
      if (c < spans[k].bottom) return k + (c - spans[k].top) / spans[k].h;
    }
    return spans.length - 0.001;
  }
  function resolve(g) {
    const k = clamp(Math.floor(g), 0, spans.length - 1);
    const p = clamp(g - k, 0, 1);
    const s = spans[k];
    let w = 0;
    if (k < spans.length - 1) {
      const T = Math.min(0.45 * L.h, 0.45 * s.h) / s.h;
      w = smooth(1 - T, 1, p);
    }
    return { a: s.stage, b: k < spans.length - 1 ? spans[k + 1].stage : s.stage, pa: p, w, k };
  }

  /* ---------- Renderers: WebGL points, or a 2D canvas when WebGL is unavailable. ---------- */

  let gl = null, prog = null, vbo = null, uRes = null, uDpr = null, uScale = null, uGain = null, ctx2d = null;
  const VERT = new Float32Array(CAP * 7);

  function initGL() {
    let g = null;
    try {
      g = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false,
        premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
    } catch (e) { g = null; }
    if (!g) return false;
    const vs = 'attribute vec2 aPos;attribute float aSize;attribute vec4 aCol;uniform vec2 uRes;uniform float uDpr;uniform float uScale;uniform float uGain;varying vec4 vCol;' +
      'void main(){vec2 c=aPos/uRes*2.0-1.0;gl_Position=vec4(c.x,-c.y,0.0,1.0);gl_PointSize=aSize*uDpr*uScale;vCol=vec4(aCol.rgb,aCol.a*uGain);}';
    const fs = 'precision mediump float;varying vec4 vCol;' +
      'void main(){vec2 d=gl_PointCoord-0.5;float r=length(d)*2.0;float a=1.0-smoothstep(0.0,1.0,r);a*=a;gl_FragColor=vec4(vCol.rgb*vCol.a*a,1.0);}';
    const sh = (type, src) => { const s = g.createShader(type); g.shaderSource(s, src); g.compileShader(s); return g.getShaderParameter(s, g.COMPILE_STATUS) ? s : null; };
    const v = sh(g.VERTEX_SHADER, vs), f = sh(g.FRAGMENT_SHADER, fs);
    if (!v || !f) return false;
    const pr = g.createProgram();
    g.attachShader(pr, v); g.attachShader(pr, f); g.linkProgram(pr);
    if (!g.getProgramParameter(pr, g.LINK_STATUS)) return false;
    g.useProgram(pr);
    const b = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, b);
    g.bufferData(g.ARRAY_BUFFER, VERT.byteLength, g.DYNAMIC_DRAW);
    const stride = 7 * 4;
    const aPos = g.getAttribLocation(pr, 'aPos'), aSize = g.getAttribLocation(pr, 'aSize'), aCol = g.getAttribLocation(pr, 'aCol');
    g.enableVertexAttribArray(aPos); g.vertexAttribPointer(aPos, 2, g.FLOAT, false, stride, 0);
    g.enableVertexAttribArray(aSize); g.vertexAttribPointer(aSize, 1, g.FLOAT, false, stride, 8);
    g.enableVertexAttribArray(aCol); g.vertexAttribPointer(aCol, 4, g.FLOAT, false, stride, 12);
    g.enable(g.BLEND); g.blendFunc(g.ONE, g.ONE);
    g.disable(g.DEPTH_TEST);
    uRes = g.getUniformLocation(pr, 'uRes'); uDpr = g.getUniformLocation(pr, 'uDpr');
    uScale = g.getUniformLocation(pr, 'uScale'); uGain = g.getUniformLocation(pr, 'uGain');
    gl = g; prog = pr; vbo = b;
    return true;
  }

  let renderer = 'none';
  if (initGL()) renderer = 'webgl';
  else {
    try { ctx2d = canvas.getContext('2d', { alpha: false }); } catch (e) { ctx2d = null; }
    renderer = ctx2d ? '2d' : 'none';
  }
  if (renderer === 'none') { root.classList.add('no-stage'); return; }
  root.classList.add('has-stage');

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); gl = null; stop(); root.classList.add('no-stage'); }, false);
  canvas.addEventListener('webglcontextrestored', () => { if (initGL()) { root.classList.remove('no-stage'); resize(); requestRender(); } }, false);

  /* ---------- Budget: a modest, adaptive particle count. ---------- */

  let nMax = 2000, n = 2000, reductions = 0;
  const SZ = new Float32Array(CAP);
  function budget() {
    let b = Math.round(L.w * L.h / 250);
    b = clamp(b, 1600, CAP);
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) b = Math.round(b * 0.75);
    if (renderer === '2d') b = Math.min(b, 1600);
    nMax = b;
    n = Math.max(1200, Math.round(nMax * Math.pow(0.7, reductions)));
    const base = L.narrow ? 2.3 : 2.5, spread = L.narrow ? 2.0 : 2.3;
    for (let i = 0; i < CAP; i++) SZ[i] = (base + R7[i] * spread) * (R6[i] > 0.97 ? 1.9 : 1);
  }

  function resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w * h * dpr * dpr > 4.6e6) dpr = Math.max(1, Math.sqrt(4.6e6 / (w * h)));
    L = { w, h, dpr, narrow: w < 761 };
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
    budget();
    layoutMany();
    layoutForever();
    measureSpans();
  }

  /* ---------- Compose one frame. ---------- */

  let lastVars = { g: '', scrim: '' };
  function setVars(gr, scrim) {
    const gs = Math.round(gr[0]) + ', ' + Math.round(gr[1]) + ', ' + Math.round(gr[2]);
    const ss = scrim.toFixed(2);
    if (gs !== lastVars.g) { root.style.setProperty('--g', gs); lastVars.g = gs; }
    if (ss !== lastVars.scrim) { root.style.setProperty('--scrim', ss); lastVars.scrim = ss; }
  }

  function compose(st, t, fadeK = 1) {
    const A = STAGES[st.a], B = STAGES[st.b], k = L.narrow ? 1 : 0;
    const w = st.a === st.b ? 0 : st.w;
    A.fn(n, t, st.pa, BA);
    if (w > 0.001) B.fn(n, t, 0, BB);

    const PA = place(st.a), PB = place(st.b);
    const sA = PA.s, axA = PA.x, ayA = PA.y, oA = PA.o;
    const sB = PB.s, axB = PB.x, ayB = PB.y, oB = PB.o;
    const D = 3.4;
    let j = 0;
    for (let i = 0; i < n; i++) {
      const zA = BA.z[i], pA = D / (D - zA);
      let x = axA + BA.x[i] * pA * sA, y = ayA - BA.y[i] * pA * sA;
      let size = SZ[i] * pA;
      let a = BA.b[i] * oA * (0.55 + 0.45 * clamp((zA + 0.8) / 1.6, 0, 1));
      let r = BA.r[i], g = BA.g[i], bl = BA.bl[i];
      if (w > 0.001) {
        const wi = ease(clamp((w - R6[i] * 0.35) / 0.65, 0, 1));
        const zB = BB.z[i], pB = D / (D - zB);
        const xb = axB + BB.x[i] * pB * sB, yb = ayB - BB.y[i] * pB * sB;
        const ab = BB.b[i] * oB * (0.55 + 0.45 * clamp((zB + 0.8) / 1.6, 0, 1));
        x += (xb - x) * wi; y += (yb - y) * wi; size += (SZ[i] * pB - size) * wi; a += (ab - a) * wi;
        r += (BB.r[i] - r) * wi; g += (BB.g[i] - g) * wi; bl += (BB.bl[i] - bl) * wi;
      }
      a *= (0.84 + 0.16 * Math.sin(t * 0.7 + R5[i] * 40)) * fadeK;
      VERT[j] = x; VERT[j + 1] = y; VERT[j + 2] = size;
      VERT[j + 3] = r; VERT[j + 4] = g; VERT[j + 5] = bl; VERT[j + 6] = clamp(a, 0, 1);
      j += 7;
    }

    const gA = A.g, gB = B.g;
    const ground = [gA[0] + (gB[0] - gA[0]) * w, gA[1] + (gB[1] - gA[1]) * w, gA[2] + (gB[2] - gA[2]) * w];
    setVars(ground, A.scrim + (B.scrim - A.scrim) * w);
    const op = Math.max(oA * (1 - w), oB * w);
    return { ground, op };
  }

  const styleCache = new Map();
  function draw(ground) {
    if (gl) {
      gl.clearColor(ground[0] / 255, ground[1] / 255, ground[2] / 255, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uRes, L.w, L.h);
      gl.uniform1f(uDpr, L.dpr);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, VERT.subarray(0, n * 7));
      // A soft halo first, then the points themselves.
      gl.uniform1f(uScale, 3.4); gl.uniform1f(uGain, 0.05);
      gl.drawArrays(gl.POINTS, 0, n);
      gl.uniform1f(uScale, 1.0); gl.uniform1f(uGain, 1.0);
      gl.drawArrays(gl.POINTS, 0, n);
    } else if (ctx2d) {
      const c = ctx2d;
      c.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = 'rgb(' + Math.round(ground[0]) + ',' + Math.round(ground[1]) + ',' + Math.round(ground[2]) + ')';
      c.fillRect(0, 0, L.w, L.h);
      c.globalCompositeOperation = 'lighter';
      for (let i = 0, j = 0; i < n; i++, j += 7) {
        const a = VERT[j + 6];
        if (a < 0.02) continue;
        const key = ((VERT[j + 3] * 15) | 0) * 4096 + ((VERT[j + 4] * 15) | 0) * 256 + ((VERT[j + 5] * 15) | 0) * 16 + ((a * 15) | 0);
        let s = styleCache.get(key);
        if (!s) {
          s = 'rgba(' + Math.round(VERT[j + 3] * 255) + ',' + Math.round(VERT[j + 4] * 255) + ',' + Math.round(VERT[j + 5] * 255) + ',' + (((a * 15) | 0) / 15 * 0.7).toFixed(3) + ')';
          styleCache.set(key, s);
        }
        c.fillStyle = s;
        const z = VERT[j + 2] * 0.55;
        c.fillRect(VERT[j] - z / 2, VERT[j + 1] - z / 2, z, z);
      }
    }
  }

  /* ---------- The loop. ---------- */

  let motion = !root.classList.contains('still');
  let raf = 0, running = false, idle = false, lastNow = 0, t = 0, g = 0, fade = 1, cutting = false;
  const frameMs = new Float32Array(300); let fi = 0, fcount = 0;
  const workMs = new Float32Array(300);
  let adaptFrames = 0, adaptSum = 0;

  function frame(now) {
    raf = 0;
    if (!running) return;
    const dtMs = lastNow ? now - lastNow : 16.7;
    lastNow = now;
    const dt = Math.min(0.05, dtMs / 1000);
    t += dt;
    const w0 = performance.now();

    // Follow the page. A jump across several worlds (a header link, a deep link) is a quiet cut instead of a
    // rush through every form in between: the light fades out, moves, and fades back in.
    const gT = scrollCoord();
    if (!cutting && Math.abs(gT - g) > 1.2) cutting = true;
    if (cutting) {
      fade = Math.max(0, fade - dt / 0.22);
      if (fade === 0) { g = gT; cutting = false; }
    } else {
      g += (gT - g) * (1 - Math.exp(-dt * 5.5));
      if (Math.abs(gT - g) < 1e-4) g = gT;
      if (fade < 1) fade = Math.min(1, fade + dt / 0.35);
    }

    // Pointer: smoothed parallax, and the touch point for the Interactive surface (a mouse, pen or finger presses
    // into it for six seconds; otherwise it drifts slowly on its own).
    const pk = 1 - Math.exp(-dt * 3);
    ptr.sx += (ptr.nx - ptr.sx) * pk; ptr.sy += (ptr.ny - ptr.sy) * pk;
    let tx = 0.75 * Math.sin(t * 0.21), tz = 0.45 * Math.sin(t * 0.29 + 1.2);
    if (ptr.active && now - ptr.last < 6000) {
      const sp = surfacePoint(ptr.x, ptr.y);
      if (sp) { tx = sp.x; tz = sp.z; }
    }
    const tk = 1 - Math.exp(-dt * 4);
    touchPt.x += (tx - touchPt.x) * tk; touchPt.z += (tz - touchPt.z) * tk;

    const st = resolve(g);
    const res = compose(st, t, fade);
    if (res.op < 0.01 && Math.abs(gT - g) < 0.002 && !cutting) {
      draw(res.ground);   // a dark, still ground: stop until the page moves again
      idle = true; running = false;
      return;
    }
    draw(res.ground);

    const work = performance.now() - w0;
    frameMs[fi] = dtMs; workMs[fi] = work; fi = (fi + 1) % 300; fcount++;

    // Adapt: if frames run long for two seconds, draw fewer particles (at most twice).
    if (fcount > 20 && reductions < 2) {
      adaptFrames++; adaptSum += dtMs;
      if (adaptFrames >= 120) {
        if (adaptSum / adaptFrames > 26 && n > 1200) { reductions++; n = Math.max(1200, Math.round(nMax * Math.pow(0.7, reductions))); }
        adaptFrames = 0; adaptSum = 0;
      }
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (!motion || document.hidden || running) return;
    running = true; idle = false; lastNow = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  /* ---------- Still frames: one composed image per world, no transitions. ---------- */

  let stillKey = '';
  let stillTouch = null;   // where a tap or click last pressed the still surface
  const stillIndex = () => clamp(Math.floor(scrollCoord()), 0, spans.length - 1);
  function drawStill(force) {
    if (!spans.length) return;
    const k = stillIndex();
    const name = spans[k].stage;
    const key = name + '|' + L.w + 'x' + L.h + '|' + MN +
      (name === 'mark' ? '|' + (() => { const q = place('mark'); return Math.round(q.y) + ',' + q.o.toFixed(2); })() : '') +
      (name === 'touch' && stillTouch ? '|' + stillTouch.x.toFixed(3) + ',' + stillTouch.z.toFixed(3) : '');
    if (!force && key === stillKey) return;
    stillKey = key;
    const saveSx = ptr.sx, saveSy = ptr.sy;
    ptr.sx = 0; ptr.sy = 0;
    touchPt.x = stillTouch ? stillTouch.x : 0.35; touchPt.z = stillTouch ? stillTouch.z : 0.1;
    const res = compose({ a: name, b: name, pa: STAGES[name].still, w: 0, k }, STAGES[name].stillT || 14);
    draw(res.ground);
    ptr.sx = saveSx; ptr.sy = saveSy;
    g = k + STAGES[name].still;
  }

  let pending = false;
  function requestRender() {
    if (motion) { if (idle || !running) start(); }
    else if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; drawStill(true); }); }
  }

  /* ---------- Events. ---------- */

  window.addEventListener('scroll', () => {
    if (motion) { if (idle || !running) start(); }
    else drawStill(false);
  }, { passive: true });

  let resizeQueued = false;
  window.addEventListener('resize', () => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => { resizeQueued = false; resize(); stillKey = ''; requestRender(); });
  });
  if ('ResizeObserver' in window) {
    let roQueued = false;
    new ResizeObserver(() => {
      if (roQueued) return;
      roQueued = true;
      requestAnimationFrame(() => { roQueued = false; measureSpans(); if (!motion) drawStill(true); });
    }).observe(document.body);
  }

  // A mouse or pen tilts the light a little and presses into the surface wherever it is; a finger presses into the
  // surface where it lands or moves, without tilting anything. Both listeners are passive: scrolling is never held.
  function pointAt(e) { ptr.x = e.clientX; ptr.y = e.clientY; ptr.active = true; ptr.last = performance.now(); }
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') { pointAt(e); return; }
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    pointAt(e);
    ptr.nx = clamp(e.clientX / L.w * 2 - 1, -1, 1);
    ptr.ny = clamp(-(e.clientY / L.h * 2 - 1), -1, 1);
  }, { passive: true });
  window.addEventListener('pointerdown', (e) => {
    pointAt(e);
    if (motion || !spans.length || spans[stillIndex()].stage !== 'touch') return;
    const sp = surfacePoint(e.clientX, e.clientY);
    if (sp) { stillTouch = sp; drawStill(true); }
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (motion) start();
  });

  document.addEventListener('vi:motion', (e) => {
    motion = !!(e.detail && e.detail.on);
    if (motion) { start(); }
    else { stop(); drawStill(true); }
  });

  /* ---------- Begin. ---------- */

  resize();
  g = scrollCoord();
  sampleMark();
  if (motion) start(); else drawStill(true);

  window.VIStage = {
    renderer: () => renderer,
    // Where the Interactive surface is pressed, in its own units.
    touch: () => ({ x: +touchPt.x.toFixed(3), z: +touchPt.z.toFixed(3) }),
    particles: () => n,
    motion: () => motion,
    running: () => running,
    // Measured frame intervals and script work per frame.
    stats: () => {
      const m = Math.min(fcount, 300);
      const f = Array.from(frameMs.slice(0, m)).sort((a, b) => a - b);
      const wk = Array.from(workMs.slice(0, m)).sort((a, b) => a - b);
      const q = (arr, x) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * x))] : null);
      return { renderer, particles: n, maxParticles: nMax, reductions, dpr: L.dpr, samples: m,
        frameMsP50: q(f, 0.5), frameMsP95: q(f, 0.95), workMsP50: q(wk, 0.5), workMsP95: q(wk, 0.95) };
    },
    resetStats: () => { fi = 0; fcount = 0; },
  };
})();
