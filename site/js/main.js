// The globe: resolved plate boundaries and plates, age by age, with the motion of a
// picked point measured from the same rotation model.
//
// Frames come from scripts/build_frames.py. Each age has a JSON file (plates and boundary
// pieces) and a PNG (red: plate index per pixel; green: continental crust). The globe
// shader looks both up from the fragment's own longitude and latitude, so there is no UV
// seam to manage and the same arithmetic serves clicks on the CPU.

import * as THREE from 'three';
import { vfetch } from './version.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { LineSegments2 } from '../vendor/three/lines/LineSegments2.js';
import { LineSegmentsGeometry } from '../vendor/three/lines/LineSegmentsGeometry.js';
import { LineMaterial } from '../vendor/three/lines/LineMaterial.js';
import { RotationModel } from './rotation.js';
import { toLonLat, toVector, velocity, reconstruct, toPresent } from './geo.js';
import {
  PROJECTIONS, EXTENT, MAP_GLSL, mapUniforms, setMapView, projectionFrom, mapSegments, mapPatch, unproject,
  outlineSegments, toMap,
} from './projection.js';
import {
  STRINGS, PERIODS, periodAt, plateName, compass, format, initialLanguage, keepLanguage,
} from './i18n.js';

// Two plate models with the same plates and boundaries (byte-identical for 0–250 Ma) but
// different absolute frames. Merdith 2021 (palaeomagnetic) is the default.
const MODELS = ['merdith2021', 'muller2022'];
const DEFAULT_MODEL = 'merdith2021';
const base = (model) => `data/${model}/`;
// Frames are 2048×1024 bitmaps (8 MB each once decoded), so only those near the age on
// screen are kept, and only those just ahead of it are fetched.
const KEEP_FRAMES = 40;
const AHEAD = 12;
const BEHIND = 3;

// Read once, before renderAge() starts rewriting the address bar.
const ASKED = new URLSearchParams(location.search);

function initialModel() {
  const asked = ASKED.get('frame');
  return MODELS.includes(asked) ? asked : DEFAULT_MODEL;
}
const LINE_RADIUS = 1.003;
const TOOTH_RADIUS = 1.0035;
const COLORS = { ridge: 0xff5a4e, subduction: 0xffd23f, transform: 0x3ddc97, other: 0xb8c0cc };
const WIDTHS = { ridge: 2.6, subduction: 2.6, transform: 2.0, other: 1.2 };

const $ = (id) => document.getElementById(id);
const state = {
  lang: initialLanguage(),
  model: initialModel(),
  models: {},
  maxAge: 540,
  age: 0,
  shown: null,
  shownModel: null,
  playing: false,
  pin: null,
  pixels: null,
  proj: projectionFrom(ASKED),
};

const current = () => state.models[state.model];

// ---------- scene ----------

const canvas = $('globe');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1220);
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
camera.position.copy(new THREE.Vector3(...toVector(20, 15, 3.9)));
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 1.35;
controls.maxDistance = 8;
controls.rotateSpeed = 0.5;
controls.zoomSpeed = 0.8;

// The flat maps (Mollweide, equirectangular) are seen square on, without perspective, and
// moved by dragging rather than turned.
const mapCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
mapCamera.position.set(0, 0, 10);
const mapControls = new OrbitControls(mapCamera, canvas);
mapControls.enableRotate = false;
mapControls.screenSpacePanning = true;
mapControls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
mapControls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
mapControls.minZoom = 1;
mapControls.maxZoom = 12;
mapControls.zoomSpeed = 0.8;
mapControls.enabled = false;
const view = () => (state.proj === 'globe' ? camera : mapCamera);

// A plain Texture, not a DataTexture: the image is swapped for each frame's ImageBitmap,
// and a DataTexture would keep uploading it as raw data.
function frameTexture(filter) {
  const blank = document.createElement('canvas');
  blank.width = 2;
  blank.height = 1;
  const texture = new THREE.Texture(blank);
  texture.userData.filter = filter;
  texture.magFilter = texture.minFilter = filter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const plateTexture = frameTexture(THREE.NearestFilter);
const landTexture = frameTexture(THREE.LinearFilter);
const paletteData = new Uint8Array(256 * 4);
const palette = new THREE.DataTexture(paletteData, 256, 1, THREE.RGBAFormat);
palette.magFilter = palette.minFilter = THREE.NearestFilter;
palette.needsUpdate = true;

const globeMaterial = new THREE.ShaderMaterial({
  uniforms: {
    plates: { value: plateTexture },
    land: { value: landTexture },
    palette: { value: palette },
    selected: { value: -1 },
  },
  vertexShader: /* glsl */`
    varying vec3 vPos;
    varying vec3 vNormalView;
    void main() {
      vPos = position;
      vNormalView = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: surfaceShader(false),
});
const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), globeMaterial);
scene.add(globe);

// The same surface on a flat map: each pixel's longitude and latitude come from the inverse
// projection, so the map is as sharp as the frame.
const mapMaterial = new THREE.ShaderMaterial({
  uniforms: { ...globeMaterial.uniforms, ...mapUniforms },
  vertexShader: /* glsl */`
    varying vec2 vXY;
    void main() {
      vXY = position.xy;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: surfaceShader(true),
});
const mapPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mapMaterial);
mapPlane.visible = false;
scene.add(mapPlane);
const mapOutline = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
  color: 0x9cc7ff, transparent: true, opacity: 0.35, depthWrite: false,
}));
mapOutline.visible = false;
scene.add(mapOutline);

function surfaceShader(map) {
  return /* glsl */`
    ${map ? MAP_GLSL : ''}
    uniform sampler2D plates;
    uniform sampler2D land;
    uniform sampler2D palette;
    uniform float selected;
    ${map ? 'varying vec2 vXY;' : 'varying vec3 vPos;\n    varying vec3 vNormalView;'}
    const float PI = 3.141592653589793;
    void main() {
      ${map ? `
      vec3 ll = mapInverse(vXY);
      if (ll.z < 0.0) discard;
      float lat = ll.y;
      float lon = ll.x + uLon0;
      // Lit as the globe is on average, evenly.
      float light = 0.8;` : `
      vec3 p = normalize(vPos);
      float lat = asin(clamp(p.y, -1.0, 1.0));
      float lon = atan(-p.z, p.x);
      float light = max(dot(normalize(vNormalView), normalize(vec3(0.35, 0.45, 1.0))), 0.0);`}
      vec2 uv = vec2((lon + PI) / (2.0 * PI), (0.5 * PI - lat) / PI);
      float index = floor(texture2D(plates, uv).r * 255.0 + 0.5);
      vec3 plate = texture2D(palette, vec2((index + 0.5) / 256.0, 0.5)).rgb;
      float crust = texture2D(land, uv).g;
      vec3 ocean = vec3(0.09, 0.18, 0.31);
      vec3 colour = index > 0.5 ? mix(ocean, plate, 0.30) : ocean;
      vec3 continent = mix(vec3(0.84, 0.79, 0.66), plate, 0.14);
      colour = mix(colour, continent, smoothstep(0.25, 0.75, crust));
      // A thin dark rim where the crust changes, so the continents' edges read on any plate.
      float rim = clamp(fwidth(crust) * 1.6, 0.0, 1.0);
      colour = mix(colour, vec3(0.16, 0.13, 0.10), rim * 0.65);
      if (abs(index - selected) < 0.5) colour = mix(colour, vec3(1.0), 0.22);
      gl_FragColor = vec4(colour * (0.5 + 0.55 * light), 1.0);
    }`;
}

// A faint rim so the globe's edge reads against the background.
const rim = new THREE.Mesh(new THREE.SphereGeometry(1.06, 64, 32), new THREE.ShaderMaterial({
  side: THREE.BackSide, transparent: true, depthWrite: false,
  vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `varying vec3 vN; void main(){ float f = pow(1.0 - abs(vN.z), 3.0);
    gl_FragColor = vec4(0.45, 0.65, 1.0, f * 0.35); }`,
}));
scene.add(rim);

// Graticule every 30 degrees, fixed to the present-day grid: it is a reference, not data.
{
  const points = [];
  for (let lat = -60; lat <= 60; lat += 30) {
    for (let lon = -180; lon < 180; lon += 2) {
      points.push(...toVector(lon, lat, 1.001), ...toVector(lon + 2, lat, 1.001));
    }
  }
  for (let lon = -180; lon < 180; lon += 30) {
    for (let lat = -90; lat < 90; lat += 2) {
      points.push(...toVector(lon, lat, 1.001), ...toVector(lon, lat + 2, 1.001));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  scene.add(new THREE.LineSegments(geometry, mapPatch(new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false,
  }))));
}

const boundaryLayers = {};
for (const kind of Object.keys(COLORS)) {
  const material = new LineMaterial({ color: COLORS[kind], linewidth: WIDTHS[kind],
                                      transparent: kind === 'other', opacity: kind === 'other' ? 0.7 : 1 });
  const line = new LineSegments2(new LineSegmentsGeometry(), material);
  line.renderOrder = 2;
  scene.add(line);
  boundaryLayers[kind] = line;
}
const teeth = new THREE.Mesh(new THREE.BufferGeometry(),
  mapPatch(new THREE.MeshBasicMaterial({ color: COLORS.subduction, side: THREE.DoubleSide })));
teeth.renderOrder = 2;
scene.add(teeth);

const pinGroup = new THREE.Group();
const pinDot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 8),
  mapPatch(new THREE.MeshBasicMaterial({ color: 0xffffff })));
const arrow = new LineSegments2(new LineSegmentsGeometry(),
  new LineMaterial({ color: 0xffffff, linewidth: 3 }));
const arrowHead = new THREE.Mesh(new THREE.BufferGeometry(),
  mapPatch(new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })));
pinGroup.add(pinDot, arrow, arrowHead);
pinGroup.visible = false;
scene.add(pinGroup);

// ---------- geometry from a frame ----------

function vec(lon, lat, radius) {
  return new THREE.Vector3(...toVector(lon, lat, radius));
}

function boundaryGeometry(frame) {
  const positions = { ridge: [], subduction: [], transform: [], other: [] };
  for (const piece of frame.boundaries) {
    const target = positions[piece.k] ?? positions.other;
    const c = piece.c;
    for (let i = 0; i + 3 < c.length; i += 2) {
      target.push(...toVector(c[i], c[i + 1], LINE_RADIUS), ...toVector(c[i + 2], c[i + 3], LINE_RADIUS));
    }
  }
  return positions;
}

// Small triangles along each subduction zone, on the overriding plate's side, every
// 1.6 degrees of arc. Left and right are as seen walking along the piece's own geometry.
function teethGeometry(frame) {
  const spacing = 1.6 * Math.PI / 180;
  const half = 0.42 * Math.PI / 180;
  const height = 0.85 * Math.PI / 180;
  const out = [];
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const t = new THREE.Vector3();
  const side = new THREE.Vector3();
  for (const piece of frame.boundaries) {
    if (piece.k !== 'subduction' || !piece.p) continue;
    const sign = piece.p === 'L' ? 1 : -1;
    const c = piece.c;
    let carried = spacing / 2;
    for (let i = 0; i + 3 < c.length; i += 2) {
      p.set(...toVector(c[i], c[i + 1]));
      q.set(...toVector(c[i + 2], c[i + 3]));
      const arc = p.angleTo(q);
      if (arc < 1e-9) continue;
      while (carried <= arc) {
        const f = carried / arc;
        const here = p.clone().multiplyScalar(Math.sin((1 - f) * arc))
          .add(q.clone().multiplyScalar(Math.sin(f * arc))).divideScalar(Math.sin(arc));
        t.copy(q).sub(p).addScaledVector(here, -here.dot(q.clone().sub(p))).normalize();
        side.crossVectors(here, t).multiplyScalar(sign);
        const a = here.clone().addScaledVector(t, -half).normalize().multiplyScalar(TOOTH_RADIUS);
        const b = here.clone().addScaledVector(t, half).normalize().multiplyScalar(TOOTH_RADIUS);
        const apex = here.clone().addScaledVector(side, height).normalize().multiplyScalar(TOOTH_RADIUS);
        out.push(a.x, a.y, a.z, b.x, b.y, b.z, apex.x, apex.y, apex.z);
        carried += spacing;
      }
      carried -= arc;
    }
  }
  return out;
}

// Ten muted hues (Tableau 10); a plate keeps its hue from frame to frame because it is
// picked from the plate ID. Neighbours can share a hue; the boundary lines separate them.
const HUES = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
              '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#8cd17d'];

function plateColour(id) {
  const hash = Math.imul(id ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  const colour = new THREE.Color(HUES[(hash >>> 7) % HUES.length]);
  return [colour.r, colour.g, colour.b].map((value) => Math.round(value * 255));
}

function showFrame(age) {
  const frame = current()?.frames.get(age);
  if (!frame) return false;
  state.shown = age;
  state.shownModel = state.model;
  for (const texture of [plateTexture, landTexture]) {
    texture.image = frame.bitmap;
    texture.flipY = false;
    texture.colorSpace = THREE.NoColorSpace;
    texture.magFilter = texture.userData.filter;
    texture.minFilter = texture.userData.filter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
  }
  paletteData.fill(0);
  for (const [index, id] of frame.json.plates) {
    paletteData.set([...plateColour(id), 255], index * 4);
  }
  palette.needsUpdate = true;

  const positions = boundaryGeometry(frame.json);
  for (const [kind, line] of Object.entries(boundaryLayers)) {
    line.geometry.dispose();
    const geometry = new LineSegmentsGeometry();
    if (positions[kind].length) geometry.setPositions(mapSegments(positions[kind]).positions);
    line.geometry = geometry;
    line.visible = positions[kind].length > 0;
  }
  teeth.geometry.dispose();
  const triangles = new THREE.BufferGeometry();
  triangles.setAttribute('position', new THREE.Float32BufferAttribute(teethGeometry(frame.json), 3));
  teeth.geometry = triangles;
  state.pixels = null;
  updatePin();
  renderAge();
  return true;
}

// ---------- loading ----------

async function ensureModel(model) {
  if (state.models[model]) return state.models[model];
  const [meta, rotations] = await Promise.all([
    vfetch(`${base(model)}model.json`).then((r) => { if (!r.ok) throw new Error(); return r.json(); }),
    vfetch(`${base(model)}rotations.json`).then((r) => { if (!r.ok) throw new Error(); return r.json(); }),
  ]);
  state.models[model] = { meta, rotations: new RotationModel(rotations), frames: new Map(), pending: new Map() };
  return state.models[model];
}

function forget(entry) {
  // Drop the frames farthest from the age on screen, never the one shown.
  if (entry.frames.size <= KEEP_FRAMES) return;
  const ages = [...entry.frames.keys()].sort((a, b) => Math.abs(b - state.age) - Math.abs(a - state.age));
  for (const age of ages) {
    if (entry.frames.size <= KEEP_FRAMES) break;
    if (age === state.shown && entry === current()) continue;
    entry.frames.get(age).bitmap.close?.();
    entry.frames.delete(age);
  }
}

async function loadFrame(age, model = state.model) {
  const entry = state.models[model];
  if (entry.frames.has(age)) return entry.frames.get(age);
  if (entry.pending.has(age)) return entry.pending.get(age);
  const name = `${age}`;
  const promise = (async () => {
    const [json, blob] = await Promise.all([
      vfetch(`${base(model)}frames/${name}.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      vfetch(`${base(model)}frames/${name}.png`).then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); }),
    ]);
    // No colour conversion: the red channel is an index, not a colour.
    const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const frame = { json, bitmap, plateById: new Map(json.plates.map(([index, id, raw]) => [id, { index, id, raw }])) };
    entry.frames.set(age, frame);
    entry.pending.delete(age);
    forget(entry);
    return frame;
  })();
  promise.catch(() => entry.pending.delete(age));
  entry.pending.set(age, promise);
  return promise;
}

// A small queue: the frames just ahead in playback (towards the present) and a few behind.
const queue = [];
let active = 0;
function prefetchAround(age) {
  queue.length = 0;
  const entry = current();
  if (!entry) return;
  const wanted = [];
  for (let d = 1; d <= AHEAD; d++) wanted.push(age - d);
  for (let d = 1; d <= BEHIND; d++) wanted.push(age + d);
  for (const a of wanted) {
    if (a >= 0 && a <= state.maxAge && !entry.frames.has(a) && !entry.pending.has(a)) queue.push([state.model, a]);
  }
  pump();
}
function pump() {
  while (active < 4 && queue.length) {
    const [model, age] = queue.shift();
    active += 1;
    loadFrame(age, model).catch(() => {}).finally(() => { active -= 1; pump(); });
  }
}

async function goTo(age) {
  state.age = age;
  renderAge();
  const model = state.model;
  if (current().frames.has(age)) {
    showFrame(age);
  } else {
    updateStatus();
    try {
      await loadFrame(age, model);
      if (state.age === age && state.model === model) showFrame(age);
    } catch {
      setStatus(format(t().error, { age }));
    }
  }
  updateStatus();
  prefetchAround(age);
}

async function setModel(model) {
  if (!MODELS.includes(model) || model === state.model) return;
  try {
    await ensureModel(model);
  } catch {
    setStatus(t().noData);
    return;
  }
  // Same age, same camera: only the reconstruction under them changes.
  state.model = model;
  state.pixels = null;
  renderFrame();
  renderSource();
  await goTo(state.age);
}

// ---------- picking and the pin ----------

function pixelsOf(frame) {
  if (state.pixels && state.pixels.frame === frame) return state.pixels;
  const { width, height } = frame.bitmap;
  const scratch = new OffscreenCanvas(width, height);
  const context = scratch.getContext('2d', { willReadFrequently: true });
  context.drawImage(frame.bitmap, 0, 0);
  state.pixels = { frame, width, height, data: context.getImageData(0, 0, width, height).data };
  return state.pixels;
}

function plateAt(lon, lat) {
  const frame = current()?.frames.get(state.shown);
  if (!frame) return null;
  const { width, height, data } = pixelsOf(frame);
  const x = Math.min(width - 1, Math.floor(((lon + 180) / 360) * width));
  const y = Math.min(height - 1, Math.floor(((90 - lat) / 180) * height));
  const index = data[(y * width + x) * 4];
  const entry = frame.json.plates.find(([i]) => i === index);
  return entry ? { index, id: entry[1], raw: entry[2] } : null;
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
canvas.addEventListener('pointerdown', (event) => { downAt = [event.clientX, event.clientY]; });
canvas.addEventListener('pointerup', (event) => {
  if (!downAt || Math.hypot(event.clientX - downAt[0], event.clientY - downAt[1]) > 5) return;
  const rect = canvas.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, view());
  if (state.proj === 'globe') {
    const hit = raycaster.intersectObject(globe)[0];
    if (hit) pick(toLonLat(hit.point.toArray()));
    return;
  }
  const hit = raycaster.intersectObject(mapPlane)[0];
  const lonLat = hit && unproject(state.proj, hit.point.x, hit.point.y, 0);
  if (lonLat) pick(lonLat);
});

function pick(lonLat) {
  const plate = plateAt(...lonLat);
  if (!plate) {
    state.pin = { missing: true };
    pinGroup.visible = false;
    globeMaterial.uniforms.selected.value = -1;
    renderInfo();
    return;
  }
  const present = toPresent(current().rotations, plate.id, lonLat, state.shown);
  state.pin = present ? { plate: plate.id, raw: plate.raw, present } : { missing: true };
  updatePin();
}

function destination([lon, lat], bearingDegrees, angle) {
  const r = Math.PI / 180;
  const p1 = lat * r;
  const l1 = lon * r;
  const b = bearingDegrees * r;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(angle) + Math.cos(p1) * Math.sin(angle) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(angle) * Math.cos(p1), Math.cos(angle) - Math.sin(p1) * Math.sin(p2));
  return [l2 / r, p2 / r];
}

function updatePin() {
  const pin = state.pin;
  if (!pin || pin.missing || state.shown === null) {
    pinGroup.visible = false;
    renderInfo();
    return;
  }
  const where = reconstruct(current().rotations, pin.plate, pin.present, state.shown);
  const frame = current()?.frames.get(state.shown);
  const entry = frame?.plateById.get(pin.plate);
  globeMaterial.uniforms.selected.value = entry ? entry.index : -1;
  if (!where) {
    pin.where = null;
    pin.velocity = null;
    pinGroup.visible = false;
    renderInfo();
    return;
  }
  pin.where = where;
  pin.velocity = velocity(current().rotations, pin.plate, where, state.shown);
  if (entry) pin.raw = entry.raw;
  pinDot.position.copy(vec(where[0], where[1], 1.004));
  const v = pin.velocity;
  if (v && v.speed > 0.05) {
    // One degree of arrow per cm/yr, so the arrows of two plates compare by length.
    const length = Math.min(v.speed, 25) * Math.PI / 180;
    const points = [];
    const steps = 12;
    let previous = vec(where[0], where[1], 1.004);
    for (let i = 1; i <= steps; i++) {
      const next = vec(...destination(where, v.bearing, (length * i) / steps), 1.004);
      points.push(previous.x, previous.y, previous.z, next.x, next.y, next.z);
      previous = next;
    }
    arrow.geometry.dispose();
    arrow.geometry = new LineSegmentsGeometry().setPositions(mapSegments(points).positions);
    const tip = destination(where, v.bearing, length + 0.9 * Math.PI / 180);
    const left = destination(destination(where, v.bearing, length), v.bearing - 90, 0.5 * Math.PI / 180);
    const right = destination(destination(where, v.bearing, length), v.bearing + 90, 0.5 * Math.PI / 180);
    const head = new THREE.BufferGeometry();
    head.setAttribute('position', new THREE.Float32BufferAttribute(
      [...toVector(...left, 1.004), ...toVector(...right, 1.004), ...toVector(...tip, 1.004)], 3));
    arrowHead.geometry.dispose();
    arrowHead.geometry = head;
    arrow.visible = arrowHead.visible = true;
  } else {
    arrow.visible = arrowHead.visible = false;
  }
  pinGroup.visible = true;
  renderInfo();
}

// ---------- text ----------

const t = () => STRINGS[state.lang];

function renderInfo() {
  const box = $('info');
  box.replaceChildren();
  const pin = state.pin;
  const add = (tag, text, className) => {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    box.append(node);
    return node;
  };
  if (!pin) { add('p', t().clickHint, 'hint'); return; }
  if (pin.missing) { add('p', t().noPlate, 'hint'); return; }
  add('p', plateName(pin.raw, state.lang), 'name');
  const list = document.createElement('dl');
  const row = (label, value) => {
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value;
    list.append(dt, dd);
  };
  row(t().plateId, String(pin.plate));
  if (pin.where) {
    row(state.lang === 'ko' ? '위치' : 'Position',
        `${Math.abs(pin.where[1]).toFixed(1)}°${pin.where[1] >= 0 ? 'N' : 'S'}, ${Math.abs(pin.where[0]).toFixed(1)}°${pin.where[0] >= 0 ? 'E' : 'W'}`);
  }
  if (pin.velocity) {
    row(state.lang === 'ko' ? '속도' : 'Speed', format(t().speedValue, { speed: pin.velocity.speed.toFixed(1) }));
    row(state.lang === 'ko' ? '방향' : 'Heading',
        format(t().towards, { bearing: Math.round(pin.velocity.bearing), compass: compass(pin.velocity.bearing, state.lang) }));
  }
  box.append(list);
  if (pin.velocity) add('p', format(t().velocityNote, { frame: t().frameShort[state.model] }), 'note');
  if (!pin.where) add('p', t().pinGone, 'note');
}

function renderAge() {
  const age = state.age;
  $('age').textContent = age === 0 ? `0 Ma · ${t().present}` : format(t().age, { age });
  const [name, , , colour] = periodAt(age);
  const period = $('period');
  period.replaceChildren();
  const swatch = document.createElement('i');
  swatch.style.background = colour;
  period.append(swatch, document.createTextNode(`${t().periods[name]} · ${format(t().ageLong, { age })}`));
  $('slider').value = String(state.maxAge - age);
  $('slider').setAttribute('aria-valuetext', format(t().age, { age }));
  // The Cambrian page covers 540–485 Ma in more detail, on Merdith 2021.
  const link = $('to-cambrian');
  // The other pages are asked for the same projection.
  const proj = state.proj === 'globe' ? '' : `proj=${state.proj}`;
  const query = (...parts) => (parts.filter(Boolean).length ? `?${parts.filter(Boolean).join('&')}` : '');
  link.href = `cambrian/${query(age >= 485 && age <= 540 ? `age=${age}` : '', proj)}`;
  link.classList.toggle('here', age >= 485 && age <= 540);
  $('to-phanerozoic').href = `phanerozoic/${query(age <= 540 ? `age=${age}` : '', proj)}`;
  const params = new URLSearchParams(location.search);
  params.set('age', String(age));
  params.set('frame', state.model);
  if (state.proj === 'globe') params.delete('proj');
  else params.set('proj', state.proj);
  history.replaceState(null, '', `?${params}`);
}

function renderFrame() {
  for (const button of document.querySelectorAll('[data-frame]')) {
    button.setAttribute('aria-checked', String(button.dataset.frame === state.model));
  }
  $('frame-note').textContent = t().frameNote[state.model];
  for (const button of document.querySelectorAll('[data-proj]')) {
    button.setAttribute('aria-checked', String(button.dataset.proj === state.proj));
  }
  $('projection').setAttribute('aria-label', t().projection);
}

// Globe or one of the flat maps. The map is centred on the Greenwich meridian; everything
// drawn from a frame is drawn again for it.
function setProjection(proj) {
  if (!PROJECTIONS.includes(proj)) return;
  state.proj = proj;
  setMapView(proj, 0);
  const globeView = proj === 'globe';
  globe.visible = rim.visible = globeView;
  mapPlane.visible = mapOutline.visible = !globeView;
  controls.enabled = globeView;
  mapControls.enabled = !globeView;
  if (!globeView) {
    const [ex, ey] = EXTENT[proj];
    mapPlane.geometry.dispose();
    mapPlane.geometry = new THREE.PlaneGeometry(2 * ex, 2 * ey);
    mapOutline.geometry.dispose();
    mapOutline.geometry = new THREE.BufferGeometry();
    mapOutline.geometry.setAttribute('position', new THREE.Float32BufferAttribute(outlineSegments(proj, 0.0005), 3));
    mapCamera.position.set(0, 0, 10);
    mapCamera.zoom = 1;
    mapControls.target.set(0, 0, 0);
    mapControls.update();
  }
  lastFrame = '';
  if (state.shown !== null && current()?.frames.has(state.shown)) showFrame(state.shown);
  renderFrame();
  renderAge();
}

function renderPeriods() {
  const bar = $('periods');
  bar.replaceChildren();
  for (const [name, young, old, colour] of [...PERIODS].reverse()) {
    const from = Math.min(old, state.maxAge);
    const to = Math.max(young, 0);
    if (from <= to) continue;
    const span = document.createElement('span');
    span.style.flex = String(from - to);
    span.style.background = colour;
    span.title = t().periods[name];
    const label = document.createElement('b');
    label.textContent = t().periods[name];
    if (from - to > 25) span.append(label);
    bar.append(span);
  }
  $('oldest').textContent = format(t().age, { age: state.maxAge });
  $('youngest').textContent = t().present;
}

function renderSource() {
  const meta = current()?.meta;
  if (!meta) return;
  const body = $('source-body');
  body.replaceChildren(document.createTextNode(format(t().sourceBody, { citation: meta.citation }) + ' '));
  if (meta.doi) {
    const link = document.createElement('a');
    link.href = `https://doi.org/${meta.doi}`;
    link.textContent = `doi:${meta.doi}`;
    link.rel = 'noopener';
    body.append(link);
  }
  $('source-frame').textContent = t().sourceFrame[state.model];
  $('source-method').textContent = format(t().sourceMethod, { version: meta.built_with.replace('pygplates ', '') });
  const licence = $('source-licence');
  licence.replaceChildren();
  const link = document.createElement('a');
  link.href = meta.license_url;
  link.textContent = meta.license;
  link.rel = 'noopener';
  const [before, after] = format(t().licence, { title: meta.title }).split('{licence}');
  licence.append(document.createTextNode(before), link, document.createTextNode(after ?? ''));
}

function applyLanguage() {
  document.documentElement.lang = state.lang;
  document.title = t().title;
  for (const node of document.querySelectorAll('[data-t]')) node.textContent = t()[node.dataset.t];
  for (const button of document.querySelectorAll('[data-lang]')) {
    button.setAttribute('aria-current', String(button.dataset.lang === state.lang));
  }
  setPlaying(state.playing);
  renderFrame();
  renderAge();
  renderPeriods();
  renderSource();
  renderInfo();
  updateStatus();
}

let statusOverride = null;
function setStatus(text) { statusOverride = text; $('status').textContent = text; }
function updateStatus() {
  if (statusOverride) return;
  $('status').textContent = state.shown !== state.age || state.shownModel !== state.model ? t().loading : '';
}

// ---------- playback ----------

function setPlaying(playing) {
  state.playing = playing;
  const button = $('play');
  button.setAttribute('aria-pressed', String(playing));
  button.querySelector('.icon').textContent = playing ? '❚❚' : '▶';
  button.querySelector('.label').textContent = playing ? t().pause : t().play;
}

$('play').addEventListener('click', () => {
  if (!state.playing && state.age === 0) goTo(state.maxAge);
  setPlaying(!state.playing);
});
$('slider').addEventListener('input', (event) => {
  setPlaying(false);
  goTo(state.maxAge - Number(event.target.value));
});
for (const button of document.querySelectorAll('[data-frame]')) {
  button.addEventListener('click', () => setModel(button.dataset.frame));
}
for (const button of document.querySelectorAll('[data-proj]')) {
  button.addEventListener('click', () => setProjection(button.dataset.proj));
}
for (const button of document.querySelectorAll('[data-lang]')) {
  button.addEventListener('click', () => {
    state.lang = button.dataset.lang;
    keepLanguage(state.lang);
    applyLanguage();
  });
}

let lastStep = 0;
function tick(now) {
  if (state.playing && state.shown === state.age) {
    const perSecond = Number($('speed').value);
    if (now - lastStep >= 1000 / perSecond) {
      if (state.age <= 0) {
        setPlaying(false);
      } else if (current().frames.has(state.age - 1)) {
        lastStep = now;
        goTo(state.age - 1);
      } else if (!current().pending.has(state.age - 1)) {
        loadFrame(state.age - 1).catch(() => setPlaying(false));
      }
    }
  }
}

// The part of the window the panels leave free: right of the side panel on a wide
// screen, below it on a phone, and above the timeline. (Same rule as the Cambrian page.)
function visibleRect() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const panel = $('panel').getBoundingClientRect();
  const timeline = document.querySelector('.timeline').getBoundingClientRect();
  const rect = { left: 0, top: 0, right: W, bottom: Math.min(H, timeline.top) };
  if (panel.width < W * 0.6) rect.left = panel.right;
  else rect.top = panel.bottom;
  return rect;
}

// Shift the picture so the globe's centre is the centre of the free part, and size the
// view so the globe fits in it. Checked every frame, since the panel's height changes
// with its text; the work is done only when the free part changes.
let lastFrame = '';
function frameView() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const r = visibleRect();
  const key = [W, H, r.left, r.top, r.right, r.bottom].map(Math.round).join() + state.proj;
  if (key === lastFrame) return;
  lastFrame = key;
  if (state.proj !== 'globe') {
    frameMap(mapCamera, state.proj, r, W, H);
    return;
  }
  // 0.92: a little margin so the rim is not cut by the panels.
  const free = 0.92 * Math.max(120, Math.min(r.right - r.left, r.bottom - r.top));
  const across = Math.tan((35 / 2) * Math.PI / 180);
  camera.fov = (2 * Math.atan((across * H) / free) * 180) / Math.PI;
  camera.aspect = W / H;
  camera.setViewOffset(W, H, -((r.left + r.right) / 2 - W / 2), -((r.top + r.bottom) / 2 - H / 2), W, H);
  camera.updateProjectionMatrix();
}

// The flat map fills the free part with a small margin, centred in it: the camera's view
// is set in world units per CSS pixel, so the map's middle falls on the free part's middle.
function frameMap(ortho, proj, r, W, H) {
  const [ex, ey] = EXTENT[proj];
  const w = Math.max(120, r.right - r.left);
  const h = Math.max(120, r.bottom - r.top);
  const scale = Math.max((2.06 * ex) / w, (2.06 * ey) / h);
  const cx = (r.left + r.right) / 2;
  const cy = (r.top + r.bottom) / 2;
  ortho.left = -cx * scale;
  ortho.right = (W - cx) * scale;
  ortho.top = cy * scale;
  ortho.bottom = -(H - cy) * scale;
  ortho.updateProjectionMatrix();
}

// Where a scene point is drawn, in CSS pixels (for tests).
function screenOf(point) {
  const v = new THREE.Vector3(...point).project(view());
  return [((v.x + 1) / 2) * window.innerWidth, ((1 - v.y) / 2) * window.innerHeight];
}

// The globe's drawn centre and radius in CSS pixels (for tests).
function globeOnScreen() {
  const toEye = camera.position.clone().normalize();
  const d = camera.position.length();
  const side = new THREE.Vector3().crossVectors(toEye, camera.up).normalize();
  const rim = toEye.clone().multiplyScalar(1 / d).addScaledVector(side, Math.sqrt(1 - 1 / (d * d)));
  const centre = screenOf([0, 0, 0]);
  const edge = screenOf(rim.toArray());
  return { centre, radius: Math.hypot(edge[0] - centre[0], edge[1] - centre[1]) };
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  lastFrame = '';
  frameView();
}
window.addEventListener('resize', resize);

renderer.setAnimationLoop((now) => {
  tick(now);
  frameView();
  if (state.proj === 'globe') controls.update();
  else mapControls.update();
  renderer.render(scene, view());
});

// ---------- start ----------

async function start() {
  resize();
  setProjection(state.proj);
  applyLanguage();
  try {
    await ensureModel(state.model);
  } catch {
    setStatus(t().noData);
    return;
  }
  const meta = current().meta;
  state.maxAge = Math.max(...meta.ages);
  $('slider').max = String(state.maxAge);
  const asked = ASKED.has('age') ? Number(ASKED.get('age')) : NaN;
  const first = Number.isFinite(asked) && meta.ages.includes(asked) ? asked : 0;
  applyLanguage();
  await goTo(first);
}

start();

// For tests and for looking around from the console.
// The map's drawn corners in CSS pixels (for tests): [left, top, right, bottom].
function mapOnScreen() {
  const [ex, ey] = EXTENT[state.proj];
  const [left, top] = screenOf([-ex, ey, 0]);
  const [right, bottom] = screenOf([ex, -ey, 0]);
  return [left, top, right, bottom];
}

// Where a place is drawn, in CSS pixels, on the globe or the map (for tests).
function screenOfLonLat(lon, lat) {
  return screenOf(state.proj === 'globe' ? toVector(lon, lat) : [...toMap(lon, lat), 0]);
}

window.cplates = {
  state, goTo, pick, setModel, setProjection, camera, controls, mapCamera, visibleRect, globeOnScreen, mapOnScreen,
  screenOfLonLat,
};
