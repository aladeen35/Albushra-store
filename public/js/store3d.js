// 3D showroom for the home page: a white room with one fixture per section (hanging rails for
// clothes, a low rail for kids, shelves for shoes, a pegboard for caps) and a hanging sign over
// each. Drag to look around, tap a fixture to walk up to it, tap a piece to pick it; the page
// shows the buy card. Pieces are flat cut-outs of the product photos (fast enough for a whole
// room on a phone); the product page keeps the full 3D cloth.
import * as THREE from '/vendor/three.min.js';
import { colorGroups } from './api.js';
import { cutout } from './garment-image.js';
import { motion, reduceMotion } from './motion.js';

const HALF = 6.2; // the room is 12.4 × 12.4 m
const WALL_H = 4.2;
const EYE = 1.65;
const FIX_W = 3.2;
const SIDE = 4; // fixtures either side of a wall's middle
const OV_FORWARD = 1.3; // in the overview the camera stands this far out from the centre, facing the wall
const SMALL = window.innerWidth < 700;
const LONG = new Set(['abayas', 'jalabiyas']);
const LIMIT = { rack: 6, kids: 6, shelf: 9, pegboard: 8 };

// Fixture slots around the walls, in the order met when turning right from the back wall.
const SLOTS = [
  [0, -HALF, 0, 1],
  [SIDE, -HALF, 0, 1],
  [HALF, -SIDE, -1, 0],
  [HALF, 0, -1, 0],
  [HALF, SIDE, -1, 0],
  [SIDE, HALF, 0, -1],
  [0, HALF, 0, -1],
  [-SIDE, HALF, 0, -1],
  [-HALF, SIDE, 1, 0],
  [-HALF, 0, 1, 0],
  [-HALF, -SIDE, 1, 0],
  [-SIDE, -HALF, 0, 1],
].map(([x, z, nx, nz]) => ({ pos: new THREE.Vector3(x, 0, z), normal: new THREE.Vector3(nx, 0, nz) }));

const SHELF_Y = [2.12, 1.48, 0.84];

/** Shoe shelves: fill the middle row first, then the top, then the bottom; pieces centred in each row. */
function shelfSpot(index, count) {
  const rows = Math.ceil(count / 3);
  const rowOrder = rows === 1 ? [1] : rows === 2 ? [0, 1] : [0, 1, 2];
  const row = Math.floor(index / 3);
  const inRow = Math.min(3, count - row * 3);
  const xs = inRow === 1 ? [0] : inRow === 2 ? [1, -1] : [1, 0, -1];
  return { x: xs[index % 3], y: SHELF_Y[rowOrder[row]] };
}

/** Pegboard: one row up to four pieces, two rows beyond; centred. */
function pegSpot(index, count) {
  const twoRows = count > 4;
  const perRow = twoRows ? Math.ceil(count / 2) : count;
  const row = Math.floor(index / perRow);
  const inRow = row === 0 ? Math.min(perRow, count) : count - perRow;
  const k = index - row * perRow;
  return { x: ((inRow - 1) / 2 - k) * 0.72, y: twoRows ? [2.12, 1.32][row] : 1.72 };
}

const yawFacing = (normal) => Math.atan2(normal.x, normal.z);
const dirOf = (yaw, pitch) => new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function texture(c, { repeat, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  return t;
}

function noiseCanvas(size, base, spread, grains = 9000) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < grains; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * spread})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  return c;
}

function woodCanvas(w, h, base = '#d4ab78', holes = false) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * w;
    ctx.strokeStyle = `rgba(${Math.random() < 0.5 ? '120,80,40' : '255,235,200'},${0.05 + Math.random() * 0.08})`;
    ctx.lineWidth = 1 + Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + 8, h * 0.3, x - 8, h * 0.6, x + 4, h);
    ctx.stroke();
  }
  if (holes) {
    ctx.fillStyle = 'rgba(70,45,20,.55)';
    for (let y = 16; y < h; y += 26) for (let x = 16; x < w; x += 26) ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
  }
  return c;
}

function glowCanvas() {
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 90, 10, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,.9)');
  g.addColorStop(0.55, 'rgba(255,255,255,.3)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return c;
}

/** Black hanging sign with the section name (both faces). */
function signMesh(text) {
  const font = '800 112px Cairo, system-ui, sans-serif';
  const probe = canvas(8, 8).getContext('2d');
  probe.font = font;
  const textW = probe.measureText(text).width;
  const w = Math.max(560, Math.ceil(textW + 200));
  const c = canvas(w, 220);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#151515';
  ctx.fillRect(0, 0, w, 220);
  ctx.fillStyle = '#3cc420';
  ctx.beginPath();
  ctx.ellipse(w - 70, 110, 16, 9, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.fillText(text, w / 2 - 10, 118);
  const tex = texture(c);
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  const side = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 });
  const width = 0.3 * (w / 220);
  const box = new THREE.Mesh(new THREE.BoxGeometry(width, 0.3, 0.05), [side, side, side, side, face, face]);
  const group = new THREE.Group();
  group.add(box);
  const cable = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.3 });
  for (const s of [-1, 1]) {
    const len = WALL_H - 3.05 - 0.18;
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, len, 6), cable);
    wire.position.set((s * width) / 2.6, 0.15 + len / 2, 0);
    group.add(wire);
  }
  return group;
}

/** Brand panel (hanger mark + name) for walls without a section. */
function brandCanvas() {
  const c = canvas(1024, 400);
  const ctx = c.getContext('2d');
  ctx.strokeStyle = '#151515';
  ctx.lineWidth = 26;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.translate(512, 70);
  ctx.beginPath();
  ctx.moveTo(0, 60);
  ctx.bezierCurveTo(0, 20, -44, 20, -44, -6);
  ctx.bezierCurveTo(-44, -40, 12, -40, 10, -8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 60);
  ctx.lineTo(-170, 165);
  ctx.lineTo(170, 165);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = '#3cc420';
  ctx.beginPath();
  ctx.moveTo(30, -10);
  ctx.quadraticCurveTo(70, -70, 130, -50);
  ctx.quadraticCurveTo(100, 10, 30, -10);
  ctx.fill();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = '140px Lalezar, Cairo, sans-serif';
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  ctx.fillStyle = '#151515';
  ctx.fillText('متجر البشرى', 512, 380);
  return c;
}

function rugCanvas() {
  const c = canvas(512, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e9e5dc';
  ctx.beginPath();
  ctx.arc(256, 256, 250, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1d7d1a';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(256, 256, 228, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(29,125,26,.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(256, 256, 210, 0, Math.PI * 2);
  ctx.stroke();
  ctx.drawImage(brandCanvas(), 96, 176, 320, 125);
  return c;
}

function kidsCanvas() {
  const c = canvas(1024, 700);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 700);
  g.addColorStop(0, '#cfe8fb');
  g.addColorStop(1, '#fdf1d2');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(0, 0, 1024, 700, 90);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  for (const [x, y, s] of [
    [170, 120, 1],
    [820, 90, 0.8],
    [560, 170, 0.6],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 40 * s, 0, Math.PI * 2);
    ctx.arc(x + 45 * s, y - 18 * s, 50 * s, 0, Math.PI * 2);
    ctx.arc(x + 95 * s, y, 38 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  const star = (x, y, r, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.fill();
  };
  star(90, 560, 30, '#f6c516');
  star(940, 520, 24, '#f39a3b');
  star(700, 620, 18, '#3cc420');
  star(380, 600, 14, '#f3a6bf');
  return c;
}

/** Shared hanger: chrome hook and a wooden bar, 0.42 m wide; origin at the top of the hook. */
function hangerParts() {
  const wood = new THREE.MeshStandardMaterial({ color: 0xb98a5a, roughness: 0.55 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.25 });
  const bar = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.21, -0.11, 0),
      new THREE.Vector3(-0.08, -0.07, 0),
      new THREE.Vector3(0, -0.055, 0),
      new THREE.Vector3(0.08, -0.07, 0),
      new THREE.Vector3(0.21, -0.11, 0),
    ]),
    24,
    0.011,
    6,
  );
  const hook = new THREE.TorusGeometry(0.026, 0.004, 6, 16, Math.PI * 1.35);
  hook.rotateZ(-0.2);
  hook.translate(0, -0.012, 0);
  const stem = new THREE.CylinderGeometry(0.004, 0.004, 0.04, 6);
  stem.translate(0, -0.04, 0);
  return { wood, chrome, bar, hook, stem };
}

/** Plane with its top edge at the origin, bent like fabric hanging from shoulders. */
function clothGeometry(w, h, bend) {
  const g = new THREE.PlaneGeometry(w, h, bend ? 8 : 1, 1);
  g.translate(0, -h / 2, 0);
  if (bend) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = (2 * p.getX(i)) / w;
      p.setZ(i, bend * (1 - u * u));
    }
    g.computeVertexNormals();
  }
  return g;
}

/** Cut-out photo → texture, blurred drop-shadow and a coarse alpha mask for picking. */
async function loadPiece(url) {
  const cut = await cutout(url, undefined, { maxSize: SMALL ? 360 : 512 });
  const aspect = cut.height / cut.width;
  const sw = 96;
  const sh = Math.max(8, Math.round(sw * aspect));
  const pad = 10;
  const sc = canvas(sw + pad * 2, sh + pad * 2);
  const sctx = sc.getContext('2d');
  sctx.filter = 'blur(5px)';
  sctx.drawImage(cut, pad, pad, sw, sh);
  sctx.filter = 'none';
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = '#000';
  sctx.fillRect(0, 0, sc.width, sc.height);
  const mw = 32;
  const mh = Math.max(4, Math.round(mw * aspect));
  const mc = canvas(mw, mh);
  const mctx = mc.getContext('2d', { willReadFrequently: true });
  mctx.drawImage(cut, 0, 0, mw, mh);
  const alpha = mctx.getImageData(0, 0, mw, mh).data;
  const mask = new Uint8Array(mw * mh);
  for (let i = 0; i < mask.length; i++) mask[i] = alpha[i * 4 + 3] > 90 ? 1 : 0;
  return { tex: texture(cut), shadow: texture(sc, { srgb: false }), aspect, mask, mw, mh, shadowPad: pad / sw };
}

const productImage = (p) => {
  const g = colorGroups(p)[0];
  return (g?.images?.length ? g.images : p.images)?.[0];
};

export class Store3D {
  /**
   * sections: [{ slug, name, display, products }]
   * onFocus(slug|null), onSelect(product, section), onDeselect(), onProgress(0..1)
   */
  constructor(root, { sections, onFocus, onSelect, onDeselect, onProgress } = {}) {
    this.root = root;
    this.onFocus = onFocus;
    this.onSelect = onSelect;
    this.onDeselect = onDeselect;
    this.onProgress = onProgress;
    this.reduce = reduceMotion();
    this.mode = 'overview';
    this.yaw = 0;
    this.pitch = 0;
    this.yawVel = 0;
    this.pan = 0;
    this.panTarget = 0;
    this.panRange = 0;
    this.panAxis = new THREE.Vector3(1, 0, 0);
    this.idle = 0;
    this.items = [];
    this.fixtures = [];

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, SMALL ? 1.5 : 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.05;
    r.domElement.className = 'store-canvas';
    r.domElement.setAttribute('aria-hidden', 'true');
    root.prepend(r.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0xf3f2ee);
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.35;
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d2c4, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 0.7);
    sun.position.set(2, 6, 3);
    scene.add(sun);
    const centre = new THREE.PointLight(0xfff6ea, 26, 0, 1.6);
    centre.position.set(0, 3.9, 0);
    scene.add(centre);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.05, 60);
    this.base = { pos: this.overviewPos(), tgt: new THREE.Vector3() };
    this.base.tgt.copy(dirOf(this.yaw, this.pitch).multiplyScalar(6)).add(this.base.pos);
    this.raycaster = new THREE.Raycaster();
    this.hanger = hangerParts();
    this.glowTex = texture(glowCanvas());

    this.buildRoom();
    this.buildFixtures(sections);
    this.bindInput();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(root);
    this.clock = new THREE.Timer();
    this.visible = true;
    this.io = new IntersectionObserver(([e]) => (this.visible = e.isIntersecting));
    this.io.observe(root);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    this.ready = this.loadPieces();
  }

  // ---------- Room ----------

  buildRoom() {
    const s = this.scene;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf6f5f1, roughness: 0.95, map: texture(noiseCanvas(256, '#f6f5f1', 0.05, 3000), { repeat: 6 }) });
    for (const slot of [SLOTS[0], SLOTS[3], SLOTS[6], SLOTS[9]]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, WALL_H), wallMat);
      wall.position.copy(slot.pos).setY(WALL_H / 2);
      if (Math.abs(slot.pos.x) === HALF) wall.position.z = 0;
      else wall.position.x = 0;
      wall.rotation.y = yawFacing(slot.normal);
      s.add(wall);
      const base = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.1, 0.02), new THREE.MeshStandardMaterial({ color: 0xe4e1da, roughness: 0.8 }));
      base.position.copy(wall.position).setY(0.05).addScaledVector(slot.normal, 0.01);
      base.rotation.y = wall.rotation.y;
      s.add(base);
    }
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2, HALF * 2),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0, map: texture(noiseCanvas(512, '#e2e0da', 0.035, 9000), { repeat: 3 }) }),
    );
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(2.3, 64), new THREE.MeshStandardMaterial({ map: texture(rugCanvas()), roughness: 1, transparent: true }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = 0.004;
    s.add(rug);
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshBasicMaterial({ color: 0xe9e8e3 }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = WALL_H;
    s.add(ceiling);
    const panel = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const x of [-3.4, 0, 3.4]) {
      for (const z of [-3.4, 0, 3.4]) {
        const light = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.24), panel);
        light.rotation.x = Math.PI / 2;
        light.position.set(x, WALL_H - 0.01, z);
        s.add(light);
      }
    }
  }

  // ---------- Fixtures ----------

  buildFixtures(sections) {
    const list = sections.slice(0, SLOTS.length);
    const n = list.length;
    const used = new Set();
    list.forEach((sec, i) => {
      const slotIndex = Math.round((i * SLOTS.length) / Math.max(n, 1)) % SLOTS.length;
      used.add(slotIndex);
      this.fixtures.push(this.buildFixture(sec, SLOTS[slotIndex]));
    });
    SLOTS.forEach((slot, i) => {
      if (!used.has(i)) this.buildDecor(slot);
    });
  }

  placeOnWall(group, slot) {
    group.position.copy(slot.pos);
    group.rotation.y = yawFacing(slot.normal);
    this.scene.add(group);
  }

  buildDecor(slot) {
    const g = new THREE.Group();
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.02), new THREE.MeshBasicMaterial({ map: texture(brandCanvas()), transparent: true, toneMapped: false }));
    logo.position.set(0, 2.35, 0.01);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.5), new THREE.MeshStandardMaterial({ map: texture(woodCanvas(512, 128, '#c99a64')), roughness: 0.6 }));
    bench.position.set(0, 0.45, 0.6);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });
    for (const x of [-0.95, 0.95]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.42), legMat);
      leg.position.set(x, 0.21, 0.6);
      g.add(leg);
    }
    g.add(logo, bench, this.wallGlow(2.2));
    this.placeOnWall(g, slot);
  }

  wallGlow(y, w = 4.6, h = 3.4) {
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: this.glowTex, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    glow.position.set(0, y, 0.004);
    return glow;
  }

  buildFixture(sec, slot) {
    const display = LIMIT[sec.display] ? sec.display : 'rack';
    const g = new THREE.Group();
    const fx = { sec, slot, group: g, display, items: [] };
    const metal = new THREE.MeshStandardMaterial({ color: 0xd9d9d9, metalness: 1, roughness: 0.22 });
    let frame = [1.9, 2.9]; // focus centre height and framed height

    if (display === 'rack' || display === 'kids') {
      const kids = display === 'kids';
      const railY = kids ? 1.6 : LONG.has(sec.slug) ? 2.4 : 2.15;
      fx.railY = railY;
      if (kids) {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.46), new THREE.MeshStandardMaterial({ map: texture(kidsCanvas()), transparent: true, roughness: 0.9 }));
        panel.position.set(0, 1.25, 0.006);
        g.add(panel);
      }
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, FIX_W - 0.2, 20), metal);
      rail.rotation.z = Math.PI / 2;
      rail.position.set(0, railY, 0.34);
      g.add(rail);
      for (const s of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.34, 10), metal);
        arm.rotation.x = Math.PI / 2;
        arm.position.set((s * (FIX_W - 0.2)) / 2, railY, 0.17);
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 20), metal);
        plate.rotation.x = Math.PI / 2;
        plate.position.set((s * (FIX_W - 0.2)) / 2, railY, 0.006);
        g.add(arm, plate);
      }
      frame = kids ? [1.55, 2.9] : [railY - 0.2, 3.0];
    } else if (display === 'shelf') {
      const board = new THREE.Mesh(new THREE.BoxGeometry(3.1, 2.15, 0.04), new THREE.MeshStandardMaterial({ map: texture(woodCanvas(1024, 680)), roughness: 0.7 }));
      board.position.set(0, 1.5, 0.02);
      g.add(board);
      const shelfMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
      for (const y of SHELF_Y) {
        for (const x of [1.0, 0, -1.0]) {
          const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.03, 0.32), shelfMat);
          shelf.position.set(x, y, 0.2);
          g.add(shelf);
        }
      }
      frame = [1.75, 3.0];
    } else {
      const board = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.72, 0.03), new THREE.MeshStandardMaterial({ map: texture(woodCanvas(1024, 568, '#d8b27f', true)), roughness: 0.75 }));
      board.position.set(0, 1.72, 0.015);
      g.add(board);
      fx.pegMat = new THREE.MeshStandardMaterial({ color: 0xcfcfcf, metalness: 0.9, roughness: 0.3 });
      frame = [1.95, 2.8];
    }

    const sign = signMesh(sec.name);
    sign.position.set(0, 3.05, 0.7);
    g.add(sign);
    fx.sign = sign;
    g.add(this.wallGlow(display === 'kids' ? 1.6 : 2.0));

    const hit = new THREE.Mesh(new THREE.PlaneGeometry(FIX_W + 0.4, 3.3), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, 1.85, 0.5);
    hit.userData.fixture = fx;
    g.add(hit);
    fx.hit = hit;
    fx.frame = frame;
    this.placeOnWall(g, slot);
    g.updateMatrixWorld(true);
    fx.center = g.localToWorld(new THREE.Vector3(0, frame[0], 0));
    fx.right = new THREE.Vector3(1, 0, 0).applyQuaternion(g.quaternion);
    return fx;
  }

  /** Hangs, shelves or pegs one product (once its photo is ready). */
  addItem(fx, product, piece, index, count) {
    const { display } = fx;
    const holder = new THREE.Group();
    const item = { fx, product, holder, piece, lift: 0, liftT: 0, swing: 0, phase: Math.random() * 6, appear: this.reduce ? 1 : 0 };
    let w;
    let h;
    let bend = 0;
    if (display === 'rack' || display === 'kids') {
      const kids = display === 'kids';
      const maxH = kids ? 0.85 : LONG.has(fx.sec.slug) ? 1.52 : 1.08;
      w = kids ? 0.4 : 0.56;
      h = w * piece.aspect;
      if (h > maxH) {
        w *= maxH / h;
        h = maxH;
      }
      w = Math.max(w, kids ? 0.26 : 0.34);
      h = w * piece.aspect;
      bend = 0.05;
      const spacing = Math.min(kids ? 0.56 : 0.6, (FIX_W - 0.6) / Math.max(1, count - 1));
      holder.position.set(((count - 1) / 2 - index) * spacing, fx.railY + 0.03, 0.34 + (index % 2) * 0.03);
      const scale = kids ? 0.8 : 1;
      const parts = this.hanger;
      for (const [geo, mat] of [
        [parts.bar, parts.wood],
        [parts.hook, parts.chrome],
        [parts.stem, parts.chrome],
      ]) {
        const m = new THREE.Mesh(geo, mat);
        m.scale.setScalar(scale);
        m.position.z = -0.015;
        holder.add(m);
      }
      item.top = -0.075 * scale;
      item.hang = true;
    } else if (display === 'shelf') {
      w = 0.44;
      h = w * piece.aspect;
      const spot = shelfSpot(index, count);
      holder.position.set(spot.x, spot.y + 0.015 + h, 0.18);
      item.top = 0;
    } else {
      w = 0.42;
      h = w * piece.aspect;
      if (h > 0.5) {
        w *= 0.5 / h;
        h = 0.5;
      }
      const spot = pegSpot(index, count);
      const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 8), fx.pegMat);
      peg.rotation.x = Math.PI / 2;
      peg.position.set(spot.x, spot.y + 0.04, 0.08);
      fx.group.add(peg);
      holder.position.set(spot.x, spot.y + h * 0.35, 0.1);
      item.top = 0;
    }
    const mat = new THREE.MeshStandardMaterial({ map: piece.tex, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.92 });
    const geo = clothGeometry(w, h, bend);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = item.top;
    mesh.userData.item = item;
    holder.add(mesh);
    if (display === 'shelf') {
      // A pair: the second shoe sits a little behind and to the side.
      const twin = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: piece.tex, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.92, color: 0xd8d8d8 }));
      twin.position.set(-0.13, 0.006, -0.08);
      holder.add(twin);
      item.twin = twin;
    }
    // Soft shadow on the wall/board behind.
    const pad = w * piece.shadowPad;
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(w + pad * 2, h + pad * 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: piece.shadow, transparent: true, opacity: display === 'shelf' ? 0.2 : 0.24, depthWrite: false }),
    );
    const behind = display === 'pegboard' ? 0.04 : display === 'shelf' ? 0.08 : 0.3;
    shadow.position.set(0.02, item.top - h / 2 - (item.hang ? 0.09 : 0.02), -behind + 0.004);
    holder.add(shadow);
    item.mesh = mesh;
    item.shadow = shadow;
    item.w = w;
    item.h = h;
    item.base = holder.position.clone();
    holder.scale.setScalar(item.appear || 0.001);
    fx.group.add(holder);
    fx.items.push(item);
    this.items.push(item);
    return item;
  }

  async loadPieces() {
    // Nearest fixtures first: the one in view, then its neighbours either side.
    const order = this.fixtures
      .map((fx) => ({ fx, d: Math.abs(Math.atan2(Math.sin(yawFacing(fx.slot.normal) - this.yaw), Math.cos(yawFacing(fx.slot.normal) - this.yaw))) }))
      .sort((a, b) => a.d - b.d)
      .map((o) => o.fx);
    const jobs = [];
    for (const fx of order) {
      const list = fx.sec.products.slice(0, LIMIT[fx.display]);
      list.forEach((p, i) => jobs.push({ fx, p, i, n: list.length }));
    }
    let done = 0;
    let next = 0;
    const firstFx = order[0];
    let resolveFirst;
    const first = new Promise((r) => (resolveFirst = r));
    const firstJobs = jobs.filter((j) => j.fx === firstFx).length;
    let firstDone = 0;
    if (!firstJobs) resolveFirst();
    const worker = async () => {
      while (next < jobs.length && !this.disposed) {
        const job = jobs[next++];
        const url = productImage(job.p);
        try {
          if (url) {
            const piece = await loadPiece(url);
            if (this.disposed) return;
            this.addItem(job.fx, job.p, piece, job.i, job.n);
          }
        } catch (err) {
          console.warn('store piece skipped', job.p.slug, err);
        }
        done++;
        this.onProgress?.(done / jobs.length);
        if (job.fx === firstFx && ++firstDone === firstJobs) resolveFirst();
      }
    };
    const all = Promise.all(Array.from({ length: 4 }, worker));
    if (!jobs.length) this.onProgress?.(1);
    await Promise.race([first, all]);
    return all;
  }

  /** Swaps a product's picture (e.g. after choosing another colour in the buy card). */
  async setItemImage(slug, url) {
    const item = this.items.find((i) => i.product.slug === slug);
    if (!item || !url) return;
    const piece = await loadPiece(url).catch(() => null);
    if (!piece || this.disposed) return;
    for (const m of [item.mesh, item.twin]) {
      if (!m) continue;
      m.material.map = piece.tex;
      m.material.needsUpdate = true;
    }
    item.shadow.material.alphaMap = piece.shadow;
    item.shadow.material.needsUpdate = true;
    item.piece.tex.dispose();
    item.piece.shadow.dispose();
    item.piece = piece;
    item.swing = 0.12;
  }

  // ---------- Camera ----------

  /** Overview: a little out from the centre towards the wall in view, so the turn feels like looking around. */
  overviewPos(yaw = this.yaw) {
    return dirOf(yaw, 0).multiplyScalar(OV_FORWARD).setY(EYE);
  }

  get hfovTan() {
    return Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect;
  }

  get vfovTan() {
    return Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
  }

  async tweenTo(pos, tgt, duration = 1.15) {
    const { gsap } = await motion();
    this.tweening = (this.tweening || 0) + 1;
    gsap.killTweensOf([this.base.pos, this.base.tgt]);
    const d = this.reduce ? 0 : duration;
    const ease = 'power3.inOut';
    await Promise.all([gsap.to(this.base.pos, { x: pos.x, y: pos.y, z: pos.z, duration: d, ease }), gsap.to(this.base.tgt, { x: tgt.x, y: tgt.y, z: tgt.z, duration: d, ease })]);
    this.tweening--;
  }

  fixtureView(fx) {
    const [cy, fh] = fx.frame;
    const portrait = this.camera.aspect < 0.85;
    const fitW = (FIX_W * (portrait ? 0.82 : 1.12)) / 2 / this.hfovTan;
    const fitH = (fh * 1.05) / 2 / this.vfovTan;
    const d = Math.min(Math.max(fitW, fitH), HALF * 2 - 1.5);
    const tgt = fx.center.clone();
    const pos = tgt.clone().addScaledVector(fx.slot.normal, d);
    pos.y = cy;
    const visibleW = 2 * d * this.hfovTan;
    return { pos, tgt, panRange: Math.max(0, (FIX_W - visibleW * 0.9) / 2) };
  }

  /** Walks up to a section's fixture; null returns to the middle of the room. */
  focus(slug) {
    const fx = slug ? this.fixtures.find((f) => f.sec.slug === slug) : null;
    this.clearSelection(false);
    this.panTarget = 0;
    this.idle = 0;
    if (!fx) {
      if (this.mode === 'overview') return;
      const last = this.current;
      this.mode = 'overview';
      this.current = null;
      if (last) {
        this.yaw = yawFacing(last.slot.normal);
        this.pitch = 0;
      }
      const pos = this.overviewPos();
      this.tweenTo(pos, dirOf(this.yaw, this.pitch).multiplyScalar(6).add(pos));
      this.onFocus?.(null);
      return;
    }
    this.mode = 'focus';
    this.current = fx;
    const view = this.fixtureView(fx);
    this.panRange = view.panRange;
    this.panAxis.copy(fx.right);
    this.tweenTo(view.pos, view.tgt);
    fx.sign.userData.swing = 0.05;
    this.onFocus?.(fx.sec.slug);
  }

  /** Brings one piece close and leaves room for the buy card (insets in CSS px). */
  select(item, insets = {}) {
    if (!item) return;
    const fx = item.fx;
    if (this.current !== fx) {
      this.current = fx;
      this.panAxis.copy(fx.right);
      this.onFocus?.(fx.sec.slug);
    }
    if (this.selected && this.selected !== item) this.selected.liftT = 0;
    this.selected = item;
    this.mode = 'item';
    this.panTarget = 0;
    item.liftT = 1;
    item.swing = 0.1;
    const W = this.width;
    const H = this.height;
    const left = insets.left ?? 0;
    const bottom = insets.bottom ?? 0;
    const fracW = (W - left) / W;
    const fracH = (H - bottom) / H;
    const centre = item.mesh.localToWorld(new THREE.Vector3(0, -item.h / 2, 0.12));
    const fitH = (item.h * 1.5) / (2 * this.vfovTan * fracH);
    const fitW = (item.w * 1.7) / (2 * this.hfovTan * fracW);
    const d = Math.max(0.75, fitH, fitW);
    const pos = centre.clone().addScaledVector(fx.slot.normal, d);
    pos.y = centre.y + 0.05;
    const mpp = (2 * d * this.hfovTan) / W; // metres per CSS pixel at that distance
    const tgt = centre.clone().addScaledVector(fx.right, -(left / 2) * mpp);
    tgt.y -= (bottom / 2) * mpp;
    pos.y -= (bottom / 2) * mpp * 0.6;
    this.tweenTo(pos, tgt, 0.95);
    this.onSelect?.(item.product, fx.sec);
  }

  clearSelection(back = true) {
    if (!this.selected) return;
    this.selected.liftT = 0;
    this.selected = null;
    if (back && this.current) {
      this.mode = 'focus';
      const view = this.fixtureView(this.current);
      this.tweenTo(view.pos, view.tgt, 0.9);
    }
    this.onDeselect?.();
  }

  deselect() {
    this.clearSelection(true);
  }

  resize() {
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    if (!w || !h || (w === this.width && h === this.height)) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.85 ? 60 : 50;
    this.camera.updateProjectionMatrix();
    if (this.mode === 'focus' && this.current) {
      const view = this.fixtureView(this.current);
      this.panRange = view.panRange;
      this.base.pos.copy(view.pos);
      this.base.tgt.copy(view.tgt);
    }
  }

  // ---------- Input ----------

  pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const items = this.raycaster.intersectObjects(
      this.items.map((i) => i.mesh),
      false,
    );
    for (const hit of items) {
      const item = hit.object.userData.item;
      const { mask, mw, mh } = item.piece;
      const x = Math.min(mw - 1, Math.max(0, Math.floor(hit.uv.x * mw)));
      const y = Math.min(mh - 1, Math.max(0, Math.floor((1 - hit.uv.y) * mh)));
      if (mask[y * mw + x]) return { item };
    }
    const fixture = this.raycaster.intersectObjects(
      this.fixtures.map((f) => f.hit),
      false,
    )[0];
    return fixture ? { fixture: fixture.object.userData.fixture } : {};
  }

  bindInput() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'pan-y';
    let down = null;
    let lastX = 0;
    let moved = 0;
    let lastHover = 0;
    el.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
      lastX = e.clientX;
      moved = 0;
      this.yawVel = 0;
      this.idle = 0;
      this.onInteract?.();
    });
    el.addEventListener('pointermove', (e) => {
      if (down) {
        const dx = e.clientX - lastX;
        lastX = e.clientX;
        moved += Math.abs(dx);
        if (moved > 6 && Math.abs(e.clientX - down.x) > Math.abs(e.clientY - down.y)) {
          if (e.pointerType !== 'mouse' && !el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId);
          if (this.mode === 'overview') {
            this.yaw += dx * 0.0042;
            this.yawVel = dx * 0.0042;
          } else if (this.mode === 'focus') {
            this.panTarget = THREE.MathUtils.clamp(this.panTarget - dx * 0.006, -this.panRange, this.panRange);
          }
        }
        return;
      }
      if (e.pointerType !== 'mouse') return;
      const now = performance.now();
      if (now - lastHover < 90) return;
      lastHover = now;
      const { item, fixture } = this.pick(e);
      for (const i of this.items) i.hover = i === item;
      el.style.cursor = item || (fixture && this.mode === 'overview') || (fixture && fixture !== this.current) ? 'pointer' : this.mode === 'overview' ? 'grab' : '';
    });
    const end = (e) => {
      if (!down) return;
      const tap = moved < 8 && performance.now() - down.t < 600;
      down = null;
      if (!tap) return;
      const { item, fixture } = this.pick(e);
      if (item && this.mode !== 'overview' && item.fx === this.current) {
        if (item === this.selected) return;
        this.select(item, this.insets?.());
      } else if (item && this.mode === 'overview') {
        this.focus(item.fx.sec.slug);
      } else if (fixture && fixture !== this.current) {
        this.focus(fixture.sec.slug);
      } else if (fixture && this.mode === 'overview') {
        this.focus(fixture.sec.slug);
      } else if (this.mode === 'item') {
        this.deselect();
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => (down = null));
    el.addEventListener('pointerleave', () => {
      for (const i of this.items) i.hover = false;
    });
    this.onWheel = (e) => {
      if (this.mode !== 'overview' || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
      e.preventDefault();
      this.yaw -= e.deltaX * 0.002;
      this.idle = 0;
    };
    el.addEventListener('wheel', this.onWheel, { passive: false });
  }

  // ---------- Frame loop ----------

  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    this.clock.update(now);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.visible || document.hidden) return;
    const t = now / 1000;
    this.idle += dt;
    if (this.mode === 'overview' && !this.tweening) {
      if (Math.abs(this.yawVel) > 0.0001) {
        this.yaw += this.yawVel;
        this.yawVel *= 0.92;
      } else if (this.idle > 6 && !this.reduce) {
        this.yaw -= dt * 0.045;
      }
      this.base.pos.copy(this.overviewPos());
      this.base.tgt.copy(dirOf(this.yaw, this.pitch).multiplyScalar(6)).add(this.base.pos);
    }
    this.pan += (this.panTarget - this.pan) * Math.min(1, dt * 8);
    this.camera.position.copy(this.base.pos).addScaledVector(this.panAxis, this.pan);
    const look = this.base.tgt.clone().addScaledVector(this.panAxis, this.pan);
    this.camera.lookAt(look);

    const k = 1 - Math.exp(-dt * 7);
    for (const it of this.items) {
      if (it.appear < 1) {
        it.appear = Math.min(1, it.appear + dt * 2.2);
        const a = it.appear;
        const s = a === 1 ? 1 : 1 - Math.pow(1 - a, 3) * Math.cos(a * 6);
        it.holder.scale.setScalar(Math.max(0.001, s));
      }
      const lt = Math.max(it.liftT, it.hover ? 0.25 : 0);
      it.lift += (lt - it.lift) * k;
      it.holder.position.z = it.base.z + it.lift * (it.hang ? 0.2 : 0.1);
      it.swing *= Math.exp(-dt * 1.6);
      const sway = this.reduce ? 0 : it.hang ? Math.sin(t * 0.9 + it.phase) * 0.012 : 0;
      it.holder.rotation.z = sway + it.swing * Math.sin(t * 5.5);
      it.holder.rotation.y = it.hang && !this.reduce ? Math.sin(t * 0.6 + it.phase) * 0.05 : 0;
    }
    for (const fx of this.fixtures) {
      const s = fx.sign;
      s.userData.swing = (s.userData.swing || 0) * Math.exp(-dt * 1.2);
      s.rotation.z = this.reduce ? 0 : Math.sin(t * 0.7 + fx.slot.pos.x) * 0.008 + s.userData.swing * Math.sin(t * 4);
    }
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io.disconnect();
    motion().then(({ gsap }) => gsap.killTweensOf([this.base.pos, this.base.tgt]));
    this.scene.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material ?? [])) {
        for (const key of ['map', 'alphaMap']) m[key]?.dispose();
        m.dispose();
      }
    });
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
