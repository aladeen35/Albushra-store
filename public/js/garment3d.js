// A garment on a hanger as a real 3D object:
//  - front and back surfaces built from the photo's height field (it has volume, not a flat card)
//  - a cloth simulation (damped spring grid, pinned on the hanger) that ripples, sways and flares
//  - a wooden hanger with a chrome hook that loops over the rail
// The group's origin is the point where the hook rests on the rail.
import * as THREE from '/vendor/three.min.js';

const HANG_DROP = 0.13; // hook pivot → top of the garment
const SIM_COLS = 14;
const BODY_WIDTH = 0.5; // every garment's body is drawn this wide (hanger ≈ shoulders)
const MAX_OFFSET = 0.09; // the cloth never moves further than this from its rest shape

export function garmentScale(shape) {
  return Math.min(1.8, Math.max(0.45, BODY_WIDTH / Math.max(0.15, shape.body)));
}

const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.45, metalness: 0.05 });
const hookMat = new THREE.MeshStandardMaterial({ color: 0xe6e6e6, roughness: 0.18, metalness: 1 });

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function texture(canvas, color = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Grid geometry over the garment rectangle; `side` = 1 front (faces +z), -1 back (faces -z). */
function surface(shape, side) {
  const { cols, rows, aspect, top } = shape;
  const s = garmentScale(shape);
  const count = cols * rows;
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const u = c / (cols - 1);
      const v = r / (rows - 1);
      pos[i * 3] = (u - 0.5) * s;
      pos[i * 3 + 1] = -HANG_DROP - (v - top) * aspect * s;
      pos[i * 3 + 2] = side * shape.heights[i] * s;
      uv[i * 2] = u;
      uv[i * 2 + 1] = 1 - v;
    }
  }
  const index = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      // Skip quads that are fully outside the garment.
      const m = shape.mask;
      const a = r * cols + c;
      if (m[a] + m[a + 1] + m[a + cols] + m[a + cols + 1] < 0.02) continue;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      if (side > 0) index.push(a, d, b, b, d, e);
      else index.push(a, b, d, b, e, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/**
 * Side wall along the garment's outline, joining the front and back surfaces so no slit shows
 * when the garment turns sideways. The outline comes from marching squares on the coverage grid;
 * each wall quad takes its colour from the fabric just inside the edge.
 * Returns the geometry plus each vertex's grid position (for binding to the cloth simulation).
 */
function rim(shape) {
  const { cols, rows, aspect, top, mask } = shape;
  const s = garmentScale(shape);
  const half = 0.03 * s; // half the wall height (front-to-back)
  const at = (c, r) => mask[Math.min(rows - 1, Math.max(0, r)) * cols + Math.min(cols - 1, Math.max(0, c))];
  const segs = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const v = [at(c, r), at(c + 1, r), at(c + 1, r + 1), at(c, r + 1)];
      const corner = [[c, r], [c + 1, r], [c + 1, r + 1], [c, r + 1]];
      const pts = [];
      for (let e = 0; e < 4; e++) {
        const a = v[e];
        const b = v[(e + 1) % 4];
        if ((a > 0.5) === (b > 0.5)) continue;
        const t = (0.5 - a) / (b - a);
        const [x0, y0] = corner[e];
        const [x1, y1] = corner[(e + 1) % 4];
        pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
      }
      if (pts.length === 2) segs.push(pts);
      else if (pts.length === 4) segs.push([pts[0], pts[1]], [pts[2], pts[3]]);
    }
  }
  const pos = [];
  const uv = [];
  const grid = [];
  const inward = (gx, gy) => {
    // Mask gradient points into the garment.
    const c = Math.round(gx);
    const r = Math.round(gy);
    let dx = at(c + 1, r) - at(c - 1, r);
    let dy = at(c, r + 1) - at(c, r - 1);
    const len = Math.hypot(dx, dy) || 1;
    return [(dx / len) * 1.6, (dy / len) * 1.6];
  };
  const toWorld = (gx, gy) => [(gx / (cols - 1) - 0.5) * s, -HANG_DROP - (gy / (rows - 1) - top) * aspect * s];
  for (const [[ax, ay], [bx, by]] of segs) {
    const [nx, ny] = inward((ax + bx) / 2, (ay + by) / 2);
    const [wax, way] = toWorld(ax, ay);
    const [wbx, wby] = toWorld(bx, by);
    const ua = [(ax + nx) / (cols - 1), 1 - (ay + ny) / (rows - 1)];
    const ub = [(bx + nx) / (cols - 1), 1 - (by + ny) / (rows - 1)];
    const quad = [
      [wax, way, half, ua, ax, ay], [wbx, wby, half, ub, bx, by], [wbx, wby, -half, ub, bx, by],
      [wax, way, half, ua, ax, ay], [wbx, wby, -half, ub, bx, by], [wax, way, -half, ua, ax, ay],
    ];
    for (const [x, y, z, [u, w], gx, gy] of quad) {
      pos.push(x, y, z);
      uv.push(Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, w)));
      grid.push(gx, gy);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return { geometry: g, grid };
}

function hanger(shape) {
  const group = new THREE.Group();
  const half = Math.min(BODY_WIDTH * 0.47, (shape.shoulder * garmentScale(shape)) / 2 - 0.02);
  const yBar = -HANG_DROP - 0.015;
  const bar = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-half, yBar - 0.075, 0),
    new THREE.Vector3(-half * 0.5, yBar - 0.03, 0),
    new THREE.Vector3(0, yBar, 0),
    new THREE.Vector3(half * 0.5, yBar - 0.03, 0),
    new THREE.Vector3(half, yBar - 0.075, 0),
  ]);
  const wood = new THREE.Mesh(new THREE.TubeGeometry(bar, 40, 0.017, 10), woodMat);
  wood.scale.z = 0.55; // wooden hangers are flatter front-to-back
  group.add(wood);
  // Stem rises in front of the rail, loops over it and ends behind.
  const r = 0.034;
  const hook = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, yBar, 0),
    new THREE.Vector3(0, -0.07, 0.012),
    new THREE.Vector3(0, -0.03, r * 0.9),
    new THREE.Vector3(0, 0.012, r),
    new THREE.Vector3(0, r + 0.004, 0.004),
    new THREE.Vector3(0, 0.012, -r),
    new THREE.Vector3(0, -0.022, -r * 0.8),
  ]);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(hook, 48, 0.0055, 8), hookMat));
  group.traverse((o) => {
    o.castShadow = true;
  });
  return group;
}

/** Damped spring grid driving the cloth's displacement from its rest shape. */
class ClothSim {
  constructor(shape) {
    this.cols = SIM_COLS;
    this.rows = Math.max(6, Math.round(SIM_COLS * shape.aspect));
    const n = this.cols * this.rows;
    this.o = new Float32Array(n * 3); // displacement
    this.v = new Float32Array(n * 3); // velocity
    this.k = new Float32Array(n); // stiffness toward the rest shape
    this.pinned = new Uint8Array(n);
    this.w = new Float32Array(n); // how free (0 at the hanger, 1 at the hem)
    this.x = new Float32Array(n);
    this.depth = new Float32Array(n);
    const span = shape.bottom - shape.top || 1;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        const v = r / (this.rows - 1);
        const free = Math.min(1, Math.max(0, (v - shape.top) / span));
        this.w[i] = free;
        this.x[i] = c / (this.cols - 1) - 0.5;
        this.depth[i] = (v - shape.top) * shape.aspect + HANG_DROP;
        // Pinned along the shoulders where the hanger holds the fabric.
        if (free < 0.06 && Math.abs(this.x[i]) * garmentScale(shape) < BODY_WIDTH * 0.5) this.pinned[i] = 1;
        this.k[i] = 70 * Math.pow(1 - free, 2) + 9;
      }
    }
    this.energy = 1;
  }

  step(dt, force) {
    const { cols, rows, o, v, k, pinned } = this;
    const lap = 85; // neighbour coupling: makes motion travel through the fabric as waves
    const damp = 2.6;
    let energy = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (pinned[i]) continue;
        const f = force(i);
        for (let a = 0; a < 3; a++) {
          const j = i * 3 + a;
          let sum = 0;
          let cnt = 0;
          if (c > 0) (sum += o[j - 3]), cnt++;
          if (c < cols - 1) (sum += o[j + 3]), cnt++;
          if (r > 0) (sum += o[j - cols * 3]), cnt++;
          if (r < rows - 1) (sum += o[j + cols * 3]), cnt++;
          const acc = -k[i] * o[j] + lap * (sum / cnt - o[j]) - damp * v[j] + f[a];
          v[j] += acc * dt;
          energy += v[j] * v[j];
        }
      }
    }
    for (let j = 0; j < o.length; j++) {
      o[j] += v[j] * dt;
      if (o[j] > MAX_OFFSET || o[j] < -MAX_OFFSET) {
        o[j] = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, o[j]));
        v[j] *= 0.5;
      }
    }
    this.energy = energy;
  }

  kick(fn) {
    for (let i = 0; i < this.pinned.length; i++) {
      if (this.pinned[i]) continue;
      const [x, y, z] = fn(this.x[i], this.w[i]);
      this.v[i * 3] += x;
      this.v[i * 3 + 1] += y;
      this.v[i * 3 + 2] += z;
    }
    this.energy = 1;
  }
}

export class Garment3D {
  constructor(data) {
    const { shape } = data;
    this.shape = shape;
    this.group = new THREE.Group(); // position + swing (rotation.z)
    this.turn = new THREE.Group(); // spin / front-back (rotation.y)
    this.group.add(this.turn);
    this.length = HANG_DROP + (shape.bottom - shape.top) * shape.aspect * garmentScale(shape);

    this.frontTex = texture(data.front);
    this.backTex = texture(data.back);
    this.normalTex = texture(data.normal, false);
    const mat = (map) =>
      new THREE.MeshStandardMaterial({
        map,
        normalMap: this.normalTex,
        normalScale: new THREE.Vector2(0.55, 0.55),
        roughness: 0.95,
        metalness: 0,
        alphaTest: 0.5,
        envMapIntensity: 0.42,
      });
    this.front = new THREE.Mesh(surface(shape, 1), mat(this.frontTex));
    this.back = new THREE.Mesh(surface(shape, -1), mat(this.backTex));
    for (const m of [this.front, this.back]) {
      m.castShadow = true;
      this.turn.add(m);
    }
    const side = rim(shape);
    this.rim = new THREE.Mesh(
      side.geometry,
      new THREE.MeshStandardMaterial({ map: this.frontTex, side: THREE.DoubleSide, roughness: 0.97, metalness: 0, envMapIntensity: 0.3 }),
    );
    this.rim.castShadow = true;
    this.turn.add(this.rim);
    this.turn.add(hanger(shape));

    this.sim = new ClothSim(shape);
    // Every deforming mesh with its rest positions and its binding to the cloth simulation.
    const grid = [];
    for (let r = 0; r < shape.rows; r++) for (let c = 0; c < shape.cols; c++) grid.push(c, r);
    const surfaceBinding = this.bindPoints(grid);
    this.deformables = [
      { mesh: this.front, binding: surfaceBinding },
      { mesh: this.back, binding: surfaceBinding },
      { mesh: this.rim, binding: this.bindPoints(side.grid) },
    ].map((d) => ({ ...d, rest: Float32Array.from(d.mesh.geometry.attributes.position.array) }));

    this.swing = { angle: 0, vel: 0 };
    this.spin = null;
    this.rotY = 0;
    this.targetY = 0;
    this.prevRotY = 0;
    this.time = Math.random() * 100;
    this.breeze = 0.35;
  }

  /** For points given in shape-grid coordinates [c0, r0, c1, r1, …]: their 4 neighbouring sim particles and weights. */
  bindPoints(grid) {
    const { cols, rows } = this.shape;
    const sc = this.sim.cols;
    const sr = this.sim.rows;
    const n = grid.length / 2;
    const binding = new Float32Array(n * 8);
    for (let k = 0; k < n; k++) {
      const fx = Math.min(sc - 1, Math.max(0, (grid[k * 2] / (cols - 1)) * (sc - 1)));
      const fy = Math.min(sr - 1, Math.max(0, (grid[k * 2 + 1] / (rows - 1)) * (sr - 1)));
      const x0 = Math.min(sc - 2, Math.floor(fx));
      const y0 = Math.min(sr - 2, Math.floor(fy));
      const tx = fx - x0;
      const ty = fy - y0;
      const i00 = y0 * sc + x0;
      binding.set([i00, i00 + 1, i00 + sc, i00 + sc + 1, (1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty], k * 8);
    }
    return binding;
  }

  /** Full 360° turn (with the cloth flaring out and trailing), ending on the current side. */
  spinOnce(direction = 1) {
    this.spin = { from: this.targetY - direction * Math.PI * 2, to: this.targetY, t: 0, dur: 1.25 };
    this.swing.vel += 0.9 * direction;
    this.sim.kick((x, w) => [0, 0, -0.12 * w * direction * Math.sign(x || 1)]);
  }

  showBack(back) {
    this.targetY = back ? Math.PI : 0;
    this.spin = { from: this.rotY, to: this.targetY, t: 0, dur: 0.9 };
  }

  /** A gentle push, e.g. when the shopper taps the garment. */
  nudge(strength = 1) {
    this.swing.vel += 0.6 * strength;
    this.sim.kick((x, w) => [0.03 * w * strength, 0, 0.16 * w * strength * (0.6 + Math.random() * 0.4)]);
  }

  /** Drag-to-rotate (product page). */
  rotateBy(delta) {
    this.spin = null;
    this.targetY += delta;
    this.rotY += delta;
  }

  update(frameDt) {
    // Animations follow real time (so a slow device still finishes a spin on time);
    // the physics takes small fixed steps so it stays stable whatever the frame rate.
    const real = Math.min(frameDt, 0.25);
    const dt = Math.min(frameDt, 1 / 30);
    this.time += real;

    // Turning (spin / front-back).
    if (this.spin) {
      this.spin.t += real;
      const p = Math.min(1, this.spin.t / this.spin.dur);
      this.rotY = this.spin.from + (this.spin.to - this.spin.from) * easeOutCubic(p);
      if (p >= 1) this.spin = null;
    }
    const omega = (this.rotY - this.prevRotY) / Math.max(real, 1e-3);
    this.prevRotY = this.rotY;
    this.turn.rotation.y = this.rotY;

    // Pendulum swing about the hook.
    const s = this.swing;
    const acc = -14 * Math.sin(s.angle) - 2.2 * s.vel;
    s.vel += acc * real;
    s.angle += s.vel * real;
    this.group.rotation.z = s.angle * 0.12;

    // Cloth forces: breeze, drag while turning (trailing edges), centrifugal flare, swing inertia.
    const t = this.time;
    const sim = this.sim;
    const breeze = this.breeze;
    const f = [0, 0, 0];
    const force = (i) => {
      const w = sim.w[i];
      const x = sim.x[i];
      // Accelerations in world units/s²; with stiffness ~10–80 they move the hem a few centimetres.
      const gust = breeze * (Math.sin(t * 1.3 + x * 3) * 0.6 + Math.sin(t * 2.7 + w * 5) * 0.4);
      f[0] = Math.min(omega * omega, 60) * x * 0.012 * w - acc * 0.004 * w;
      f[1] = 0;
      f[2] = gust * w * 0.12 + Math.max(-12, Math.min(12, omega)) * x * 0.09 * w;
      return f;
    };
    const active = sim.energy > 1e-5 || Math.abs(omega) > 0.01 || breeze > 0 || Math.abs(s.vel) > 1e-3;
    if (!active) return;
    sim.step(dt / 2, force);
    sim.step(dt / 2, force);
    this.applySim();
  }

  applySim() {
    const o = this.sim.o;
    for (const { mesh, rest, binding: bind } of this.deformables) {
      const attr = mesh.geometry.attributes.position;
      const pos = attr.array;
      for (let v = 0, b = 0; v < pos.length; v += 3, b += 8) {
        let dx = 0;
        let dy = 0;
        let dz = 0;
        for (let k = 0; k < 4; k++) {
          const p = bind[b + k] * 3;
          const wgt = bind[b + 4 + k];
          dx += o[p] * wgt;
          dy += o[p + 1] * wgt;
          dz += o[p + 2] * wgt;
        }
        pos[v] = rest[v] + dx;
        pos[v + 1] = rest[v + 1] + dy;
        pos[v + 2] = rest[v + 2] + dz;
      }
      attr.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
  }

  setImages(data) {
    // Colour change: swap textures in place (same geometry is close enough for colour variants).
    this.frontTex.dispose();
    this.backTex.dispose();
    this.front.material.map = this.rim.material.map = this.frontTex = texture(data.front);
    this.back.material.map = this.backTex = texture(data.back);
    this.front.material.needsUpdate = true;
    this.back.material.needsUpdate = true;
    this.rim.material.needsUpdate = true;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const t of [this.frontTex, this.backTex, this.normalTex]) t.dispose();
    this.front.material.dispose();
    this.back.material.dispose();
    this.rim.material.dispose();
  }
}

export { HANG_DROP };
