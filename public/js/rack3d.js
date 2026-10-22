// WebGL clothes rail: real 3D garments (see garment3d.js) hanging from a chrome rail in a lit room,
// casting soft shadows on the wall behind. Same interface as the CSS Rack in rack.js, which stays
// as the fallback when WebGL or image processing is unavailable.
import * as THREE from '/vendor/three.min.js';
import { colorGroups, esc, formatPrice } from './api.js';
import { prepareGarment } from './garment-image.js';
import { Garment3D } from './garment3d.js';
import { icons } from './icons.js';

const CAMERA_Z = 6;
const RAIL_PX = 46;
const BG = 0xf1f1ee;
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Renderer, lights, wall shadow catcher and camera mapping shared by the rack and the product viewer. */
class Stage {
  constructor(container, { railLength = 7, rail = true } = {}) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    const small = window.innerWidth < 700;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'stage-canvas';
    container.prepend(this.renderer.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.fog = new THREE.Fog(BG, CAMERA_Z + 0.4, CAMERA_Z + 5.5);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    scene.add(new THREE.HemisphereLight(0xffffff, 0xe9e3d8, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.55);
    key.position.set(-3.2, 2.4, 4.4);
    key.castShadow = true;
    key.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left: -5, right: 5, top: 1, bottom: -4, near: 0.5, far: 14 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.015;
    key.shadow.radius = 6;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xfff4e6, 0.5);
    rim.position.set(3, 1.5, -3);
    scene.add(rim);

    const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.ShadowMaterial({ opacity: 0.13 }));
    wall.position.set(0, -6, -0.95);
    wall.receiveShadow = true;
    scene.add(wall);

    if (rail) {
      const metal = new THREE.MeshStandardMaterial({ color: 0xdedede, metalness: 1, roughness: 0.22 });
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, railLength, 24), metal);
      bar.rotation.z = Math.PI / 2;
      bar.castShadow = true;
      scene.add(bar);
      for (const side of [-1, 1]) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 24), metal);
        cap.rotation.z = Math.PI / 2;
        cap.position.x = (side * railLength) / 2;
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.95, 16), metal);
        arm.rotation.x = Math.PI / 2;
        arm.position.set((side * railLength) / 2, 0, -0.47);
        cap.castShadow = arm.castShadow = true;
        scene.add(cap, arm);
      }
    }

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.camera.position.set(0, 0, CAMERA_Z);
    this.camera.lookAt(0, 0, 0);
    this.height = 0;
  }

  /** Maps 1 world unit (a garment's width) to `ppu` pixels, with the rail `RAIL_PX` from the top. */
  resize(width, height, ppu) {
    this.width = width;
    this.height = height;
    this.ppu = ppu;
    this.renderer.setSize(width, height);
    const fullH = 2 * (height - RAIL_PX);
    this.camera.aspect = width / fullH;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(fullH / ppu / 2 / CAMERA_Z));
    this.camera.setViewOffset(width, fullH, 0, height - 2 * RAIL_PX, width, height);
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.scene.environment?.dispose();
  }
}

function garmentWidthPx() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw <= 600) return vw * 0.56;
  return Math.max(170, Math.min(vw * 0.24, (vh - 360) / 1.7, 340));
}

function firstImages(p) {
  const g = colorGroups(p)[0];
  return g?.images?.length ? g.images : p.images;
}

export class Rack3D {
  constructor(root, { onOpen, autoplay = true, onFail } = {}) {
    this.root = root;
    this.onOpen = onOpen;
    this.onFail = onFail;
    this.autoplay = autoplay && !reduceMotion();
    this.products = [];
    this.slots = [];
    this.active = 0;
    root.innerHTML = `
      <div class="rack rack-3d" tabindex="0" role="listbox" aria-label="الملابس المعروضة على الرف" aria-roledescription="رف ملابس">
        <div class="rack-loading"><div class="spinner"></div></div>
        <button class="rack-arrow prev" type="button" aria-label="القطعة السابقة">${icons.prev}</button>
        <button class="rack-arrow next" type="button" aria-label="القطعة التالية">${icons.next}</button>
      </div>
      <div class="rack-caption" aria-live="polite"></div>`;
    this.rack = root.querySelector('.rack');
    this.caption = root.querySelector('.rack-caption');
    this.stage = new Stage(this.rack);
    this.raycaster = new THREE.Raycaster();
    root.querySelector('.prev').addEventListener('click', () => this.go(this.active - 1, true, -1));
    root.querySelector('.next').addEventListener('click', () => this.go(this.active + 1, true, 1));
    this.bindGestures();
    this.onResize = () => this.fit(true);
    window.addEventListener('resize', this.onResize);
    this.clock = new THREE.Timer();
    this.visible = true;
    this.io = new IntersectionObserver(([e]) => (this.visible = e.isIntersecting));
    this.io.observe(this.rack);
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  async setProducts(products) {
    const token = (this.token = {});
    this.clearSlots();
    this.products = products;
    this.active = Math.min(Math.floor(products.length / 2), 2);
    this.renderCaption();
    this.rack.classList.add('is-loading');
    if (!products.length) {
      this.rack.classList.remove('is-loading');
      this.caption.innerHTML = '<p class="rack-empty">لا توجد منتجات في هذا القسم بعد</p>';
      return;
    }
    let data;
    try {
      data = await Promise.all(products.map((p) => prepareGarment(...firstImages(p))));
    } catch (err) {
      console.warn('3D rack unavailable, falling back', err);
      this.onFail?.(products);
      return;
    }
    if (this.token !== token) return;
    this.slots = data.map((d, i) => {
      const garment = new Garment3D(d);
      const slot = new THREE.Group();
      slot.add(garment.group);
      this.stage.scene.add(slot);
      return { slot, garment, product: products[i], x: 0, z: -3, yaw: 0 };
    });
    this.rack.classList.remove('is-loading');
    this.layout(true);
    this.fit(true);
    this.slots[this.active]?.garment.spinOnce(1);
    this.startAutoplay();
  }

  clearSlots() {
    for (const s of this.slots) {
      this.stage.scene.remove(s.slot);
      s.garment.dispose();
    }
    this.slots = [];
  }

  go(index, user = false, direction = 1) {
    const n = this.products.length;
    if (!n) return;
    const next = ((index % n) + n) % n;
    if (user) this.stopAutoplay();
    if (next === this.active) return;
    this.active = next;
    this.layout();
    this.renderCaption();
    this.fit();
    this.slots[next]?.garment.spinOnce(direction);
  }

  /** Target placement for each garment along the rail (RTL: later items to the left). */
  layout(snap = false) {
    const n = this.slots.length;
    this.slots.forEach((s, i) => {
      let d = i - this.active;
      if (d > n / 2) d -= n;
      if (d < -n / 2) d += n;
      const ad = Math.abs(d);
      const sign = Math.sign(d);
      s.tx = ad === 0 ? 0 : -sign * (0.95 + (ad - 1) * 0.55);
      s.tz = ad === 0 ? 0.75 : -(0.3 + (ad - 1) * 0.28);
      s.tyaw = ad === 0 ? 0 : -sign * 0.62;
      s.slot.visible = ad <= 4;
      s.garment.breeze = ad === 0 ? 0.35 : ad === 1 ? 0.15 : 0;
      if (snap) {
        s.x = s.tx;
        s.z = s.tz;
        s.yaw = s.tyaw;
      }
    });
  }

  /** Canvas height follows the longest garment near the front. */
  fit(immediate = false) {
    const ppu = garmentWidthPx();
    let need = 1.1;
    const n = this.slots.length;
    this.slots.forEach((s, i) => {
      let d = Math.abs(i - this.active);
      d = Math.min(d, n - d);
      const scale = CAMERA_Z / (CAMERA_Z - s.tz);
      if (d <= 1) need = Math.max(need, s.garment.length * scale);
    });
    this.targetH = Math.round(RAIL_PX + need * ppu + 30);
    this.ppu = ppu;
    if (immediate || !this.stage.height) this.stage.resize(this.rack.clientWidth, this.targetH, ppu);
    this.rack.style.height = `${this.targetH}px`;
  }

  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    this.clock.update(now);
    const dt = this.clock.getDelta();
    if (!this.visible || document.hidden) return;
    const st = this.stage;
    if (Math.abs(st.height - this.targetH) > 0.5 || st.width !== this.rack.clientWidth) {
      const h = st.height + (this.targetH - st.height) * Math.min(1, dt * 8);
      st.resize(this.rack.clientWidth, Math.abs(h - this.targetH) < 1 ? this.targetH : h, this.ppu);
    }
    const ease = 1 - Math.exp(-dt * 5.5);
    for (const s of this.slots) {
      s.x += (s.tx - s.x) * ease;
      s.z += (s.tz - s.z) * ease;
      s.yaw += (s.tyaw - s.yaw) * ease;
      s.slot.position.set(s.x, 0, s.z);
      s.slot.rotation.y = s.yaw;
      if (s.slot.visible) s.garment.update(dt);
    }
    st.render();
  }

  renderCaption() {
    const p = this.products[this.active];
    if (!p) return;
    const colors = colorGroups(p).length;
    this.caption.innerHTML = `
      <h2>${esc(p.name)}</h2>
      <p class="meta"><b>${esc(formatPrice(p.minPrice, p.currency))}</b>${colors > 1 ? ` · ${colors} ألوان` : ''}</p>
      <a class="btn" href="/p/${encodeURIComponent(p.slug)}" data-link>${icons.bag} تسوق الآن</a>`;
  }

  pick(e) {
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.stage.camera);
    const meshes = this.slots.filter((s) => s.slot.visible).flatMap((s) => [s.garment.front, s.garment.back]);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (!hit) return -1;
    return this.slots.findIndex((s) => s.garment.front === hit.object || s.garment.back === hit.object);
  }

  bindGestures() {
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let lastMove = 0;
    const el = this.rack;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.rack-arrow')) return;
      tracking = true;
      startX = e.clientX;
      startY = e.clientY;
    });
    el.addEventListener('pointerup', (e) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - startY)) {
        this.go(this.active + (dx > 0 ? 1 : -1), true, dx > 0 ? 1 : -1);
        return;
      }
      if (Math.abs(dx) > 8) return;
      const i = this.pick(e);
      if (i < 0) return;
      if (i === this.active) this.onOpen?.(this.products[i]);
      else this.go(i, true, i > this.active ? 1 : -1);
    });
    el.addEventListener('pointercancel', () => (tracking = false));
    // Brushing over the front garment moves the fabric.
    el.addEventListener('pointermove', (e) => {
      const now = performance.now();
      if (e.pointerType !== 'mouse' || now - lastMove < 120) return;
      lastMove = now;
      const i = this.pick(e);
      el.style.cursor = i >= 0 ? 'pointer' : '';
      if (i === this.active) this.slots[i].garment.nudge(Math.min(1, Math.abs(e.movementX) / 25 + 0.15) * Math.sign(e.movementX || 1));
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') this.go(this.active + 1, true, 1);
      else if (e.key === 'ArrowRight') this.go(this.active - 1, true, -1);
      else if (e.key === 'Enter') this.onOpen?.(this.products[this.active]);
      else return;
      e.preventDefault();
    });
    el.addEventListener('mouseenter', () => (this.hover = true));
    el.addEventListener('mouseleave', () => (this.hover = false));
  }

  startAutoplay() {
    this.stopAutoplay();
    if (!this.autoplay || this.products.length < 2) return;
    this.timer = setInterval(() => {
      if (!this.hover && !document.hidden && this.visible) this.go(this.active + 1, false, 1);
    }, 7000);
  }

  stopAutoplay() {
    clearInterval(this.timer);
  }

  destroy() {
    this.token = null;
    this.stopAutoplay();
    cancelAnimationFrame(this.raf);
    this.io.disconnect();
    window.removeEventListener('resize', this.onResize);
    this.clearSlots();
    this.stage.dispose();
  }
}

/** Single garment for the product page: drag to turn it, front/back, colour changes spin it. */
export class GarmentViewer {
  constructor(container) {
    this.container = container;
    this.stage = new Stage(container, { railLength: 3.2 });
    this.clock = new THREE.Timer();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    this.onResize = () => this.fit();
    window.addEventListener('resize', this.onResize);
    this.bindDrag();
  }

  async show(front, back, spin = false) {
    const token = (this.token = {});
    const data = await prepareGarment(front, back);
    if (this.token !== token) return;
    if (this.garment && spin) {
      this.garment.setImages(data);
      this.garment.spinOnce(1);
      return;
    }
    if (this.garment) {
      this.stage.scene.remove(this.garment.group);
      this.garment.dispose();
    }
    this.garment = new Garment3D(data);
    this.garment.breeze = 0.3;
    this.garment.group.position.z = 0.3;
    this.stage.scene.add(this.garment.group);
    this.fit();
    this.garment.spinOnce(1);
  }

  showBack(back) {
    this.garment?.showBack(back);
  }

  fit() {
    const vw = window.innerWidth;
    const ppu = vw <= 600 ? vw * 0.62 : Math.max(230, Math.min(vw * 0.3, (window.innerHeight - 300) / 1.3, 400));
    const len = this.garment ? this.garment.length * (CAMERA_Z / (CAMERA_Z - 0.3)) : 1.2;
    const h = Math.round(RAIL_PX + len * ppu + 30);
    this.container.style.height = `${h}px`;
    this.stage.resize(this.container.clientWidth, h, ppu);
  }

  bindDrag() {
    let dragging = false;
    let lastX = 0;
    let moved = 0;
    const el = this.stage.renderer.domElement;
    el.style.touchAction = 'pan-y';
    el.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      moved = 0;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging || !this.garment) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      moved += Math.abs(dx);
      this.garment.rotateBy(dx * 0.012);
    });
    el.addEventListener('pointerup', () => {
      dragging = false;
      if (moved < 6) this.garment?.nudge(1);
      else this.onRotate?.(this.garment.rotY);
    });
  }

  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    this.clock.update(now);
    const dt = this.clock.getDelta();
    if (document.hidden) return;
    this.garment?.update(dt);
    this.stage.render();
  }

  destroy() {
    this.token = null;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.garment?.dispose();
    this.stage.dispose();
  }
}
