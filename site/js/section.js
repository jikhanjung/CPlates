// Section A–A′: a block fixed to East Antarctica, 540–460 Ma.
//
// What is drawn, and where it comes from (scripts/build_section.py):
// - the top surface: PaleoDEM heights (Scotese & Wright 2018) carried into the Merdith
//   2021 reconstruction, every Myr, interpolated between 5 Myr grids (reconstruction);
// - the crust on the section face: thickness from those heights by Airy isostasy, a
//   model value (reference 35 km at sea level, densities 2.8 / 3.3 / 1.03);
// - the lithosphere base: a fixed schematic depth (160 km under continental crust,
//   90 km under oceanic);
// - the slab and mantle flow: a straight 45° slab under Merdith's trench, and the
//   analytic corner flow (cornerflow.js) scaled by Merdith's convergence rate (sketch);
// - the stratigraphic column: published Byrd Group units (observed), with the PaleoDEM
//   environment at the same place beside it (reconstruction) for comparison.

import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { subductionFlow } from './cornerflow.js';
import { continentalShare, crustKm, OCEANIC_CRUST_KM } from './isostasy.js';
import { format, initialLanguage, keepLanguage } from './i18n.js';

const BASE = '../data/section/';
const VES = [1, 2, 5, 10, 25, 50, 100];
const SLAB_DIP = 45 * Math.PI / 180;
const SLAB_KM = 90;
const COLOURS = {
  water: '#3f8fb8', continental: '#c9a27c', oceanic: '#4e6e5d', lithosphere: '#7d6b62',
  mantleTop: '#b8643e', mantleBottom: '#5a2316', slabCrust: '#2f4f3f', slabMantle: '#4b6d86',
  side: '#3a3029', flow: '#ffe8b0',
};
const KINDS = { ridge: 0xff5a4e, subduction: 0xffd23f, transform: 0x3ddc97, other: 0xb8c0cc };
// ICS chart v2023/09.
const EPOCHS = [
  ['ediacaran', 635.0, 538.8, '#fed96a'], ['terreneuvian', 538.8, 521.0, '#8cb06c'],
  ['series2', 521.0, 506.5, '#99c078'], ['miaolingian', 506.5, 497.0, '#a6cf86'],
  ['furongian', 497.0, 486.85, '#b3e095'], ['earlyOrdovician', 486.85, 470.0, '#1a9d6f'],
  ['middleOrdovician', 470.0, 458.4, '#4db47e'],
];
const ENV = [['land', 0, '#b0c484'], ['shallow', -250, '#8fe3ef'], ['slope', -2000, '#3f7fb0'], ['deep', -1e9, '#1b3a6a']];

const STRINGS = {
  ko: {
    title: 'CPlates — 단면 A–A′',
    heading: '단면 A–A′: 동남극과 남극종단산맥',
    subtitle: '540–460 Ma. 동남극에 고정한 블록으로, 같은 암석의 단면이 시간에 따라 어떻게 바뀌는지 봅니다.',
    toCambrian: '← 캄브리아기 지구본에서 A–A′ 보기',
    age: '{age} Ma', play: '재생', pause: '일시정지', speed: '속도',
    veHeading: '수직 과장',
    veNote: '수직 {ve}배 · 보이는 깊이 {depth} km. 과장을 낮추면 맨틀, 높이면 지각과 지형이 잘 보입니다.',
    showFlow: '맨틀 흐름 (모식)', showBoundaries: '판 경계',
    observedBadge: '관측', modelBadge: '재구성', sketchBadge: '모식',
    columnHeading: '섀클턴 석회암 산지의 기록',
    columnObserved: '관측 (암석)', columnModel: 'PaleoDEM 환경',
    legend: '범례',
    lgWater: '바다', lgContinental: '대륙 지각 (에어리 평형으로 계산)', lgOceanic: '해양 지각 (7 km)',
    lgLithosphere: '맨틀 암석권 (모식 두께)', lgMantle: '맨틀', lgSlab: '섭입하는 판 (모식, 45°)',
    lgFlow: '맨틀 흐름 (코너 흐름 해석해, 모식)', lgCob: 'Merdith 2021의 대륙 지각 경계',
    nowUnit: '지금 쌓이는 것 (관측)', nowNone: '이 시기의 기록은 이 목록에 없습니다.',
    nowHeight: 'PaleoDEM 높이', nowCrust: '지각 두께 (모형)', nowTrench: '해구까지', nowRate: '수렴 속도',
    nowNoTrench: '블록 안에 섭입대가 없습니다.',
    km: '{v} km', m: '{v} m', rate: '{v} cm/년 (Merdith 2021)',
    trench: '해구', locality: '섀클턴 석회암 산지', interior: '동남극 강괴', ocean: '고태평양',
    cob: 'Merdith 대륙 경계',
    layerContinental: '대륙 지각', layerOceanic: '해양 지각', layerLithosphere: '맨틀 암석권 (판의 아랫부분)',
    layerMantle: '맨틀 (연약권 이하)', moho: '모호면',
    sourceHeading: '자료와 방법',
    methods: [
      '블록은 동남극(Merdith 2021 판 802)에 고정한 격자입니다. 각 나이에 격자의 각 점에 어느 판의 암석이 있는지를 Merdith 2021 프레임에서 찾습니다.',
      '지표 높이: PaleoDEM(Scotese & Wright 2018)을 Merdith 좌표로 옮긴 것. 대륙 지각은 그 암석을 따라 PALEOMAP 판 모델로, 바다는 동남극에 상대적인 위치로 읽고, 5백만 년 격자 사이는 시간으로 보간합니다(재구성).',
      '지각 두께: 지표 높이에서 에어리 지각평형으로 계산한 모형값입니다(해수면에서 35 km, 밀도 2.8/3.3/1.03). PaleoDEM이 −1000 m보다 얕으면 대륙 지각, −2000 m보다 깊으면 7 km 해양 지각으로 보고 그 사이는 섞습니다. 대륙 가장자리의 얇아진 지각과 퇴적층은 표현하지 못합니다.',
      'Merdith 2021의 "Ross Orogen" 대륙 다각형은 410 Ma부터만 있어, 캄브리아기에는 모델이 남극종단산맥 가장자리를 동남극 대륙 지각 밖에 둡니다. 흰 점선이 그 경계입니다. PaleoDEM은 같은 곳에 얕은 대륙붕을 둡니다.',
      '섭입대와 맨틀 흐름: Merdith 2021의 섭입대가 단면을 지나는 곳에 45° 직선 슬랩을 그리고, 그 주위 맨틀 흐름을 코너 흐름 해석해(Batchelor 1967, McKenzie 1969)로 그립니다. 속도는 모델의 수렴 속도에 비례합니다. 실제 맨틀 모형이 아닙니다.',
      '암석권 두께(대륙 160 km, 해양 90 km)는 모식값입니다.',
    ],
    period: '{epoch}',
    epochs: {
      ediacaran: '에디아카라기', terreneuvian: '캄브리아기 · 테레뉴브세', series2: '캄브리아기 · 제2세',
      miaolingian: '캄브리아기 · 먀오링세', furongian: '캄브리아기 · 푸룽세',
      earlyOrdovician: '오르도비스기 · 전기', middleOrdovician: '오르도비스기 · 중기',
    },
    loading: '불러오는 중…', error: '자료를 불러오지 못했습니다. scripts/build_section.py 를 먼저 실행하세요.',
  },
  en: {
    title: 'CPlates — Section A–A′',
    heading: 'Section A–A′: East Antarctica and the Transantarctic Mountains',
    subtitle: '540–460 Ma. A block fixed to East Antarctica, so the section through the same rocks can be followed through time.',
    toCambrian: '← A–A′ on the Cambrian globe',
    age: '{age} Ma', play: 'Play', pause: 'Pause', speed: 'Speed',
    veHeading: 'Vertical exaggeration',
    veNote: '{ve}× vertical · {depth} km deep shown. Low exaggeration shows the mantle, high shows crust and relief.',
    showFlow: 'Mantle flow (sketch)', showBoundaries: 'Plate boundaries',
    observedBadge: 'Observed', modelBadge: 'Reconstructed', sketchBadge: 'Sketch',
    columnHeading: 'Record at the Shackleton Limestone area',
    columnObserved: 'Observed (rocks)', columnModel: 'PaleoDEM setting',
    legend: 'Legend',
    lgWater: 'Sea', lgContinental: 'Continental crust (Airy isostasy)', lgOceanic: 'Oceanic crust (7 km)',
    lgLithosphere: 'Mantle lithosphere (schematic thickness)', lgMantle: 'Mantle', lgSlab: 'Subducting plate (sketch, 45°)',
    lgFlow: 'Mantle flow (analytic corner flow, sketch)', lgCob: 'Merdith 2021 continental-crust edge',
    nowUnit: 'Being laid down now (observed)', nowNone: 'No unit in this list for this interval.',
    nowHeight: 'PaleoDEM height', nowCrust: 'Crustal thickness (model)', nowTrench: 'To the trench', nowRate: 'Convergence',
    nowNoTrench: 'No subduction zone inside the block.',
    km: '{v} km', m: '{v} m', rate: '{v} cm/yr (Merdith 2021)',
    trench: 'Trench', locality: 'Shackleton Limestone area', interior: 'East Antarctic craton', ocean: 'Palaeo-Pacific',
    cob: 'Merdith crust edge',
    layerContinental: 'Continental crust', layerOceanic: 'Oceanic crust', layerLithosphere: 'Mantle lithosphere (lower part of the plate)',
    layerMantle: 'Mantle (asthenosphere and below)', moho: 'Moho',
    sourceHeading: 'Data and methods',
    methods: [
      'The block is a grid fixed to East Antarctica (plate 802 of Merdith 2021). At each age, the Merdith 2021 frame tells whose rock is at each grid point.',
      'Surface height: PaleoDEM (Scotese & Wright 2018) carried into Merdith coordinates. Continental crust is followed as rock through the PALEOMAP plate model; ocean is read relative to East Antarctica; between the 5 Myr grids the heights are interpolated in time (reconstruction).',
      'Crustal thickness: a model value from the surface height by Airy isostasy (35 km at sea level; densities 2.8/3.3/1.03). Shallower than −1000 m counts as continental crust, deeper than −2000 m as 7 km oceanic crust, blended between. Thinned margins and sediment are not represented.',
      'Merdith 2021’s “Ross Orogen” continental polygon only exists from 410 Ma, so in the Cambrian the model leaves the Transantarctic margin outside East Antarctica’s crust; the dashed white line marks that edge. PaleoDEM puts a shallow shelf there.',
      'Slab and mantle flow: a straight 45° slab where Merdith 2021’s subduction zone crosses the section, and the mantle flow around it from the analytic corner-flow solution (Batchelor 1967; McKenzie 1969), scaled by the model’s convergence rate. Not a mantle model.',
      'Lithosphere thickness (160 km continental, 90 km oceanic) is schematic.',
    ],
    period: '{epoch}',
    epochs: {
      ediacaran: 'Ediacaran', terreneuvian: 'Cambrian · Terreneuvian', series2: 'Cambrian · Series 2',
      miaolingian: 'Cambrian · Miaolingian', furongian: 'Cambrian · Furongian',
      earlyOrdovician: 'Ordovician · Early', middleOrdovician: 'Ordovician · Middle',
    },
    loading: 'Loading…', error: 'Could not load the data. Run scripts/build_section.py first.',
  },
};

const $ = (id) => document.getElementById(id);
const ASKED = new URLSearchParams(location.search);
const state = {
  lang: initialLanguage(),
  // 25×: relief and crust both readable. PaleoDEM gives most Cambrian land a flat 240 m, so
  // less than this hides what relief there is.
  ve: VES.includes(Number(ASKED.get('ve'))) ? Number(ASKED.get('ve')) : 25,
  age: 540, oldest: 540, youngest: 460,
  playing: false, flow: true, boundaries: true, data: null,
};
const t = () => STRINGS[state.lang];

function depthShownKm(ve) { return Math.min(700, 1400 / ve); }

// ---------- scene ----------

const canvas = $('globe');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1220);
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
scene.add(camera);
// A low sun from the A end, fixed in the scene, so relief casts shading; a softer light
// from the camera keeps the section face readable.
const sun = new THREE.DirectionalLight(0xffffff, 2.6);
sun.position.set(-3, 1.2, -1.5);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xffffff, 0.6);
fill.position.set(0, 0.5, 1);
camera.add(fill);
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 0.8;
controls.maxDistance = 14;

const colour = (hex) => new THREE.Color(hex);
const top = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
const water = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
  color: colour(COLOURS.water), transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
const face = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
const slab = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
const sides = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ color: colour(COLOURS.side), side: THREE.DoubleSide }));
const boundaryLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }));
const cobLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.012, gapSize: 0.01 }));
const pin = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 12), new THREE.MeshBasicMaterial({ color: 0xff9f43 }));
pin.rotation.x = Math.PI;
const flowPoints = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({
  color: colour(COLOURS.flow), size: 3, sizeAttenuation: false, transparent: true, opacity: 0.85, depthTest: false }));
face.renderOrder = 1;
slab.renderOrder = 0;
flowPoints.renderOrder = 5;
scene.add(top, water, face, slab, sides, boundaryLines, cobLines, pin, flowPoints);

// ---------- data ----------

async function load() {
  const get = (name) => fetch(`${BASE}${name}`).then((r) => { if (!r.ok) throw new Error(name); return r; });
  const [meta, surface, crust, boundaries] = await Promise.all([
    get('meta.json').then((r) => r.json()), get('surface.bin').then((r) => r.arrayBuffer()),
    get('crust.bin').then((r) => r.arrayBuffer()), get('boundaries.json').then((r) => r.json())]);
  const cells = meta.nx * meta.ny;
  return { meta, surface: new Int16Array(surface), crust: new Uint8Array(crust), boundaries, cells };
}

function heightsAt(age) {
  const { meta, surface, cells } = state.data;
  const position = meta.ages[0] - age;
  const k0 = Math.max(0, Math.min(meta.ages.length - 1, Math.floor(position)));
  const k1 = Math.min(meta.ages.length - 1, k0 + 1);
  const f = position - k0;
  const out = new Float32Array(cells);
  for (let n = 0; n < cells; n++) out[n] = surface[k0 * cells + n] * (1 - f) + surface[k1 * cells + n] * f;
  return out;
}

const xAt = (i) => (state.data.meta.along_km[0] + i * state.data.meta.step_km) / 1000;
// Across runs to −z: the camera looks from +z at the section face (z = 0), so A (−x) is on the left.
const zAt = (j) => -(state.data.meta.across_km[0] + j * state.data.meta.step_km) / 1000;
const yOf = (km) => (km * state.ve) / 1000;

function hypsometric(h) {
  // More steps on land below 1 km, where nearly all Cambrian land in PaleoDEM sits.
  const stops = [[-6000, '#0c1a36'], [-2000, '#183a68'], [-250, '#286296'], [-249, '#5cbace'], [-1, '#96dce2'],
                 [0, '#8fb06a'], [150, '#a9bd7c'], [300, '#c8c48a'], [600, '#d2b276'], [1000, '#bf8f5c'],
                 [1800, '#9c6e4c'], [2600, '#8a7466'], [4000, '#ece6de']];
  for (let i = 0; i < stops.length - 1; i++) {
    const [h0, c0] = stops[i];
    const [h1, c1] = stops[i + 1];
    if (h <= h1) return colour(c0).lerp(colour(c1), h1 === h0 ? 0 : Math.max(0, Math.min(1, (h - h0) / (h1 - h0))));
  }
  return colour(stops[stops.length - 1][1]);
}

// ---------- geometry for an age ----------

function setGeometry(mesh, positions, colours, index) {
  mesh.geometry.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colours) g.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  if (index) g.setIndex(index);
  if (mesh.isMesh && !colours) g.computeVertexNormals();
  else if (mesh.isMesh && index) g.computeVertexNormals();
  mesh.geometry = g;
  return g;
}

// A band between two curves along the section face (z = 0), coloured per column.
function band(out, xs, upper, lower, colourAt, z = 0.0005) {
  for (let i = 0; i < xs.length - 1; i++) {
    const c0 = colourAt(i);
    const c1 = colourAt(i + 1);
    const quad = [[xs[i], upper[i], c0], [xs[i + 1], upper[i + 1], c1], [xs[i + 1], lower[i + 1], c1], [xs[i], lower[i], c0]];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      out.p.push(quad[k][0], quad[k][1], z);
      out.c.push(quad[k][2].r, quad[k][2].g, quad[k][2].b);
    }
  }
}

function trenchInBlock(age) {
  const frame = state.data.boundaries[String(Math.round(age))];
  if (!frame) return null;
  const [x0, x1] = state.data.meta.along_km;
  const inside = frame.trenches.filter((c) => c.s_km > x0 && c.s_km < x1 && c.over_side);
  if (!inside.length) return null;
  // The one nearest the Transantarctic margin, the one this section is about.
  return inside.reduce((a, b) => (Math.abs(a.s_km) < Math.abs(b.s_km) ? a : b));
}

let flow = null;
function update() {
  const data = state.data;
  if (!data) return;
  const { meta } = data;
  const { nx, ny } = meta;
  const h = heightsAt(state.age);
  const depth = depthShownKm(state.ve);
  const bottom = yOf(-depth);

  // Top surface.
  const pos = [];
  const col = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const height = h[j * nx + i];
      pos.push(xAt(i), yOf(height / 1000), zAt(j));
      const c = hypsometric(height);
      col.push(c.r, c.g, c.b);
    }
  }
  const index = [];
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      index.push(a, a + 1, a + nx, a + 1, a + nx + 1, a + nx);
    }
  }
  setGeometry(top, pos, col, index);
  const x0 = xAt(0);
  const x1 = xAt(nx - 1);
  const z1 = zAt(ny - 1);
  setGeometry(water, [x0, 0, 0, x1, 0, 0, x1, 0, z1, x0, 0, 0, x1, 0, z1, x0, 0, z1]);

  // Section face, along the first row (the line A–A′ itself).
  const xs = [];
  const surfaceY = [];
  const seaY = [];
  const crustBottomY = [];
  const lithY = [];
  const mantleTopY = [];
  const bottomY = [];
  const share = [];
  for (let i = 0; i < nx; i++) {
    const height = h[i];
    xs.push(xAt(i));
    surfaceY.push(yOf(height / 1000));
    seaY.push(Math.max(0, yOf(height / 1000)));
    const f = continentalShare(height);
    share.push(f);
    crustBottomY.push(Math.max(bottom, yOf(height / 1000 - crustKm(height))));
  }
  // Lithosphere base, smoothed along the section so it does not step with the grid.
  for (let i = 0; i < nx; i++) {
    let s = 0;
    let n = 0;
    for (let k = Math.max(0, i - 6); k <= Math.min(nx - 1, i + 6); k++) { s += share[k]; n++; }
    const f = s / n;
    lithY.push(Math.max(bottom, Math.min(crustBottomY[i], yOf(-(f * 160 + (1 - f) * 90)))));
    mantleTopY.push(lithY[i]);
    bottomY.push(bottom);
  }
  const out = { p: [], c: [] };
  // Mantle at the back of the face, the slab in front of it, crust and lithosphere in front
  // of both (the overriding plate covers the top of the slab near the trench).
  band(out, xs, mantleTopY, bottomY, () => colour(COLOURS.mantleTop).lerp(colour(COLOURS.mantleBottom), Math.min(1, depth / 700)), 0.0001);
  band(out, xs, crustBottomY, lithY, () => colour(COLOURS.lithosphere));
  band(out, xs, surfaceY, crustBottomY, (i) => colour(COLOURS.oceanic).lerp(colour(COLOURS.continental), share[i]));
  band(out, xs, seaY, surfaceY.map((y) => Math.min(0, y)), () => colour(COLOURS.water).multiplyScalar(0.8));
  setGeometry(face, out.p, out.c);
  state.profile = { xs, surfaceY, crustBottomY, lithY, bottom, share };

  // Sides of the block: the two ends and the back, plain.
  const s = [];
  const quad = (a, b, c, d) => s.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (const [i, zEnd] of [[0, null], [nx - 1, null]]) {
    for (let j = 0; j < ny - 1; j++) {
      quad([xAt(i), yOf(h[j * nx + i] / 1000), zAt(j)], [xAt(i), yOf(h[(j + 1) * nx + i] / 1000), zAt(j + 1)],
           [xAt(i), bottom, zAt(j + 1)], [xAt(i), bottom, zAt(j)]);
    }
    void zEnd;
  }
  for (let i = 0; i < nx - 1; i++) {
    const j = ny - 1;
    quad([xAt(i), yOf(h[j * nx + i] / 1000), zAt(j)], [xAt(i + 1), yOf(h[j * nx + i + 1] / 1000), zAt(j)],
         [xAt(i + 1), bottom, zAt(j)], [xAt(i), bottom, zAt(j)]);
  }
  quad([x0, bottom, 0], [x1, bottom, 0], [x1, bottom, z1], [x0, bottom, z1]);
  setGeometry(sides, s);

  // Merdith's continental-crust edge along the line, as dashed ticks from the surface down.
  const k = Math.round(meta.ages[0] - state.age);
  const cob = [];
  for (let i = 0; i < nx - 1; i++) {
    const a = data.crust[k * data.cells + i] >= 128;
    const b = data.crust[k * data.cells + i + 1] >= 128;
    if (a !== b) {
      const x = (xAt(i) + xAt(i + 1)) / 2;
      cob.push(x, Math.max(surfaceY[i], 0) + 0.06, 0.002, x, Math.max(bottom, yOf(-60)), 0.002);
    }
  }
  setGeometry(cobLines, cob).computeBoundingSphere();
  cobLines.computeLineDistances();
  state.cob = cob.length ? cob[0] : null;

  // Plate boundaries on the top surface.
  const lines = [];
  const lineColours = [];
  const frame = data.boundaries[String(Math.round(state.age))];
  const heightOn = (xkm, zkm) => {
    const i = Math.round((xkm - meta.along_km[0]) / meta.step_km);
    const j = Math.round((zkm - meta.across_km[0]) / meta.step_km);
    if (i < 0 || j < 0 || i >= nx || j >= ny) return null;
    return h[j * nx + i];
  };
  if (state.boundaries && frame) {
    for (const piece of frame.pieces) {
      const c = colour('#' + KINDS[piece.k].toString(16).padStart(6, '0'));
      for (let n = 0; n + 3 < piece.xy.length; n += 2) {
        const ha = heightOn(piece.xy[n], piece.xy[n + 1]);
        const hb = heightOn(piece.xy[n + 2], piece.xy[n + 3]);
        if (ha === null || hb === null) continue;
        lines.push(piece.xy[n] / 1000, Math.max(0, yOf(ha / 1000)) + 0.004, -piece.xy[n + 1] / 1000,
                   piece.xy[n + 2] / 1000, Math.max(0, yOf(hb / 1000)) + 0.004, -piece.xy[n + 3] / 1000);
        lineColours.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
  }
  setGeometry(boundaryLines, lines, lineColours);

  // Slab and flow, where Merdith has a subduction zone on the line.
  const trench = trenchInBlock(state.age);
  state.trench = trench;
  const sp = [];
  const sc = [];
  if (trench) {
    const xT = trench.s_km;
    const side = trench.over_side;
    const reach = depth / Math.sin(SLAB_DIP) + SLAB_KM;
    const along = [side * Math.cos(SLAB_DIP), -Math.sin(SLAB_DIP)];
    const normal = [-side * Math.sin(SLAB_DIP), -Math.cos(SLAB_DIP)]; // into the slab, downward
    const strip = (from, to, c) => {
      const p = (u, d) => [(xT + along[0] * u + normal[0] * d) / 1000, Math.max(bottom, yOf(along[1] * u + normal[1] * d))];
      const corners = [p(0, from), p(reach, from), p(reach, to), p(0, to)];
      for (const k2 of [0, 1, 2, 0, 2, 3]) { sp.push(corners[k2][0], corners[k2][1], 0.0003); sc.push(c.r, c.g, c.b); }
    };
    strip(0, OCEANIC_CRUST_KM, colour(COLOURS.slabCrust));
    strip(OCEANIC_CRUST_KM, SLAB_KM, colour(COLOURS.slabMantle));
    const field = subductionFlow(side, SLAB_DIP);
    const convergence = (trench.rate_cm_yr ?? 0) * side;
    flow = { field, xT, side, speed: Math.max(0.5, Math.abs(convergence)), depth, lithY, xs };
  } else {
    flow = null;
  }
  setGeometry(slab, sp, sc);
  flowPoints.visible = state.flow && Boolean(flow);

  // The locality pin.
  const i0 = Math.round((0 - meta.along_km[0]) / meta.step_km);
  pin.position.set(0, Math.max(0, surfaceY[i0]) + 0.05, 0.001);

  renderAge();
  renderNow(h[i0]);
  drawColumn();
}

// ---------- mantle flow particles ----------

const PARTICLES = 700;
const particles = { pos: new Float32Array(PARTICLES * 3), life: new Float32Array(PARTICLES) };
flowPoints.geometry.setAttribute('position', new THREE.BufferAttribute(particles.pos, 3));

// Slab coordinates of a point (x along, d depth, km): u down-dip from the trench along the
// slab top, n below the slab top (positive into the slab).
function slabCoords(xkm, dkm) {
  const w = [xkm - flow.xT, -dkm];
  const along = [flow.side * Math.cos(SLAB_DIP), -Math.sin(SLAB_DIP)];
  const normal = [-flow.side * Math.sin(SLAB_DIP), -Math.cos(SLAB_DIP)];
  return [w[0] * along[0] + w[1] * along[1], w[0] * normal[0] + w[1] * normal[1]];
}

function inMantle(xkm, dkm) {
  if (!flow) return false;
  if (dkm > flow.depth || dkm < 0) return false;
  const i = Math.round((xkm / 1000 - flow.xs[0]) / (flow.xs[1] - flow.xs[0]));
  if (i < 0 || i >= flow.xs.length) return false;
  const lith = (-flow.lithY[i] * 1000) / state.ve;
  if (dkm < lith) return false;
  const [u, n] = slabCoords(xkm, dkm);
  return !(u > 0 && n > 0 && n < SLAB_KM);
}

function respawn(n) {
  for (let tries = 0; tries < 30; tries++) {
    const x = flow.xT + (Math.random() * 2 - 1) * 1600;
    const d = Math.random() * flow.depth;
    if (inMantle(x, d)) {
      particles.pos[n * 3] = x;
      particles.pos[n * 3 + 1] = d;
      particles.life[n] = 2 + Math.random() * 4;
      return;
    }
  }
  particles.life[n] = 0;
}

let flowKey = '';
function stepFlow(dt) {
  if (!flow || !state.flow) return;
  const key = `${flow.xT}:${flow.side}:${state.ve}`;
  if (key !== flowKey) { flowKey = key; for (let n = 0; n < PARTICLES; n++) respawn(n); }
  // Shown speed: 18 km per second of animation for each cm/yr of convergence.
  const scale = 18 * flow.speed;
  const shown = flowPoints.geometry.attributes.position;
  for (let n = 0; n < PARTICLES; n++) {
    let x = particles.pos[n * 3];
    let d = particles.pos[n * 3 + 1];
    particles.life[n] -= dt;
    const v = flow.field(x - flow.xT, -d);
    if (!v || particles.life[n] <= 0 || !inMantle(x, d)) { respawn(n); x = particles.pos[n * 3]; d = particles.pos[n * 3 + 1]; }
    else {
      x += v[0] * scale * dt;
      d -= v[1] * scale * dt;
      particles.pos[n * 3] = x;
      particles.pos[n * 3 + 1] = d;
    }
    shown.setXYZ(n, x / 1000, yOf(-d), 0.003);
  }
  shown.needsUpdate = true;
}

// ---------- labels ----------

const labelNodes = new Map();
function placeLabels() {
  if (!state.data) return;
  const { meta } = state.data;
  const anchors = [];
  const x0 = meta.along_km[0] / 1000;
  const x1 = meta.along_km[1] / 1000;
  const depth = depthShownKm(state.ve);
  anchors.push({ id: 'A', at: [x0, 0.08, 0], text: 'A', cls: 'end' });
  anchors.push({ id: 'A2', at: [x1, 0.08, 0], text: 'A′', cls: 'end' });
  anchors.push({ id: 'loc', at: [0, 0.16, 0], text: t().locality, cls: 'obs' });
  anchors.push({ id: 'interior', at: [-1.8, 0.1, 0], text: t().interior, cls: '' });
  if (state.trench) anchors.push({ id: 'trench', at: [state.trench.s_km / 1000, 0.08, 0], text: t().trench, cls: '' });
  if (state.cob) anchors.push({ id: 'cob', at: [state.cob, Math.max(yOf(-depth), yOf(-60)) - 0.02, 0.002], text: t().cob, cls: 'depth' });
  // Names of the layers on the face, a little in from A, where each is thick enough to hold one.
  const pr = state.profile;
  if (pr) {
    const i = 14;
    const x = pr.xs[i];
    const cont = pr.share[i] > 0.5;
    const layers = [
      [Math.min(pr.surfaceY[i], 0), pr.crustBottomY[i], cont ? t().layerContinental : t().layerOceanic],
      [pr.crustBottomY[i], pr.lithY[i], t().layerLithosphere],
      [pr.lithY[i], pr.bottom, t().layerMantle],
    ];
    layers.forEach(([upper, lower, text], k) => {
      if (upper - lower > 0.035) anchors.push({ id: `layer${k}`, at: [x, (upper + lower) / 2, 0.004], text, cls: 'layer' });
    });
    if (pr.crustBottomY[i] > pr.bottom + 0.01) {
      anchors.push({ id: 'moho', at: [x + 0.55, pr.crustBottomY[i], 0.004], text: t().moho, cls: 'boundary' });
    }
  }
  for (const d of [0, 35, 100, 200, 410, 660]) {
    if (d <= depth) anchors.push({ id: `d${d}`, at: [x0 - 0.02, yOf(-d), 0], text: `${d} km`, cls: 'depth' });
  }
  const box = $('labels');
  const seen = new Set();
  for (const a of anchors) {
    seen.add(a.id);
    let node = labelNodes.get(a.id);
    if (!node) { node = document.createElement('span'); box.append(node); labelNodes.set(a.id, node); }
    node.textContent = a.text;
    node.className = a.cls;
    const v = new THREE.Vector3(...a.at).project(camera);
    node.style.display = v.z < 1 ? '' : 'none';
    node.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
    node.style.top = `${((1 - v.y) / 2) * window.innerHeight}px`;
  }
  for (const [id, node] of labelNodes) if (!seen.has(id)) { node.remove(); labelNodes.delete(id); }
}

// ---------- panel ----------

function epochAt(age) {
  return EPOCHS.find(([, base, top_]) => age <= base && age > top_) ?? EPOCHS[EPOCHS.length - 1];
}

function renderAge() {
  $('age').textContent = format(t().age, { age: state.age.toFixed(1) });
  const [key, , , c] = epochAt(state.age);
  const period = $('period');
  period.replaceChildren();
  const sw = document.createElement('i');
  sw.style.background = c;
  period.append(sw, document.createTextNode(t().epochs[key]));
  $('slider').value = String(state.oldest - state.age);
  $('slider').setAttribute('aria-valuetext', format(t().age, { age: state.age.toFixed(1) }));
  $('ve-note').textContent = format(t().veNote, { ve: state.ve, depth: Math.round(depthShownKm(state.ve)) });
  $('to-cambrian').href = `../cambrian/?age=${Math.min(540, Math.max(485, Math.round(state.age)))}`;
}

function activeUnits() {
  return state.data.meta.section.stratigraphy.units.filter((u) => state.age <= u.age[0] + 0.5 && state.age >= u.age[1] - 0.5);
}

function renderNow(height) {
  const box = $('now');
  box.replaceChildren();
  const p = (text, cls) => { const e = document.createElement('p'); e.textContent = text; if (cls) e.className = cls; box.append(e); return e; };
  const head = p('', '');
  const badge = document.createElement('span');
  badge.className = 'badge observed';
  badge.textContent = t().observedBadge;
  head.append(badge, document.createTextNode(` ${t().nowUnit}`));
  const units = activeUnits();
  if (units.length) {
    for (const u of units) {
      const e = p('', 'unit');
      const sw = document.createElement('i');
      sw.style.background = u.colour;
      e.append(sw, document.createTextNode(`${u.name[state.lang]}${u.kind === 'interpretation' ? ` (${state.lang === 'ko' ? '해석' : 'interpretation'})` : ''}`));
    }
  } else {
    p(t().nowNone);
  }
  const dl = document.createElement('dl');
  const row = (label, value, kind) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    if (kind) {
      const b = document.createElement('span');
      b.className = `badge ${kind === 'sketch' ? 'model' : 'model'}`;
      b.textContent = kind === 'sketch' ? t().sketchBadge : t().modelBadge;
      dd.append(' ', b);
    }
    dl.append(dt, dd);
  };
  row(t().nowHeight, format(t().m, { v: Math.round(height) }), 'model');
  row(t().nowCrust, format(t().km, { v: crustKm(height).toFixed(0) }), 'model');
  if (state.trench) {
    row(t().nowTrench, format(t().km, { v: Math.round(Math.abs(state.trench.s_km)) }), 'model');
    if (state.trench.rate_cm_yr !== null) {
      row(t().nowRate, format(t().rate, { v: (state.trench.rate_cm_yr * state.trench.over_side).toFixed(1) }), 'model');
    }
  } else {
    row(t().nowTrench, t().nowNoTrench);
  }
  box.append(dl);
}

function drawColumn() {
  const svg = $('column');
  const W = 300;
  const H = 230;
  const top_ = 14;
  const bottom_ = H - 8;
  const y = (age) => top_ + ((state.oldest - age) / (state.oldest - state.youngest)) * (bottom_ - top_);
  // Old at the bottom, as in a column: flip.
  const Y = (age) => top_ + bottom_ - y(age);
  const ns = 'http://www.w3.org/2000/svg';
  svg.replaceChildren();
  const add = (tag, attrs, text) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text) e.textContent = text;
    svg.append(e);
    return e;
  };
  add('text', { x: 4, y: 10 }, t().columnModel);
  add('text', { x: 92, y: 10 }, t().columnObserved);
  // PaleoDEM setting at the locality, per Myr.
  const { meta, surface, cells } = state.data;
  const i0 = Math.round((0 - meta.along_km[0]) / meta.step_km);
  meta.ages.forEach((age, k) => {
    const z = surface[k * cells + i0];
    const env = ENV.find(([, low]) => z >= low);
    add('rect', { x: 4, y: Y(age - 0.5), width: 70, height: Math.max(1, Y(age + 0.5) - Y(age - 0.5)) + 0.8, fill: env[2] });
  });
  // Observed units: a bar over each unit's age range, labels pushed apart so they do not overlap.
  let lastLabel = -Infinity;
  const units = [...meta.section.stratigraphy.units].sort((a, b) => a.age[0] - b.age[0]);
  for (const u of units) {
    const yTop = Y(u.age[1]);
    const yBottom = Y(u.age[0]);
    const height = Math.max(3, yBottom - yTop);
    add('rect', { x: 92, y: yTop, width: 60, height, fill: u.colour, opacity: u.kind === 'interpretation' ? 0.55 : 1,
                  stroke: u.kind === 'interpretation' ? '#9cc7ff' : '#0b1220', 'stroke-width': 1,
                  'stroke-dasharray': u.kind === 'interpretation' ? '3 2' : 'none' });
    const wanted = yTop + height / 2 + 3.5;
    const at = Math.max(wanted, lastLabel + 11);
    lastLabel = at;
    if (at - wanted > 1) add('line', { x1: 152, x2: 157, y1: yTop + height / 2, y2: at - 3.5, stroke: '#9aa8bd', 'stroke-width': 0.6 });
    add('text', { x: 158, y: at, class: 'label' }, `${u.name[state.lang].split(' (')[0]} ${u.age[0]}${u.age[0] !== u.age[1] ? `–${u.age[1]}` : ''}`);
  }
  for (const age of [540, 520, 500, 480, 460]) add('text', { x: 76, y: Y(age) + 3 }, String(age));
  add('line', { x1: 0, x2: W, y1: Y(state.age), y2: Y(state.age), stroke: '#fff', 'stroke-width': 1.5 });
}

function renderUnits() {
  const list = $('units');
  list.replaceChildren();
  for (const u of state.data.meta.section.stratigraphy.units) {
    const li = document.createElement('li');
    li.className = u.kind === 'interpretation' ? 'interpretation' : '';
    const b = document.createElement('span');
    b.className = `badge ${u.kind === 'interpretation' ? 'model' : 'observed'}`;
    b.textContent = u.kind === 'interpretation' ? (state.lang === 'ko' ? '해석' : 'Interpretation') : t().observedBadge;
    const name = document.createElement('strong');
    name.textContent = ` ${u.name[state.lang]} · ${u.age[0]}${u.age[0] !== u.age[1] ? `–${u.age[1]}` : ''} Ma`;
    const what = document.createElement('div');
    what.textContent = u.what[state.lang];
    li.append(b, name, what);
    if (u.refs.length) {
      const refs = document.createElement('div');
      refs.className = 'refs';
      refs.textContent = u.refs.join('; ');
      li.append(refs);
    }
    list.append(li);
  }
}

function renderLegend() {
  const items = [['fill', COLOURS.water, t().lgWater], ['fill', COLOURS.continental, t().lgContinental],
                 ['fill', COLOURS.oceanic, t().lgOceanic], ['fill', COLOURS.lithosphere, t().lgLithosphere],
                 ['fill', COLOURS.mantleTop, t().lgMantle], ['fill', COLOURS.slabMantle, t().lgSlab],
                 ['dots', '', t().lgFlow], ['dash', '', t().lgCob]];
  const list = $('legend');
  list.replaceChildren();
  for (const [shape, c, text] of items) {
    const li = document.createElement('li');
    const sw = document.createElement('span');
    sw.className = `sw ${shape}`;
    if (c) sw.style.background = c;
    const label = document.createElement('span');
    label.textContent = text;
    li.append(sw, label);
    list.append(li);
  }
}

function renderSources() {
  const box = $('sources');
  box.replaceChildren();
  for (const text of t().methods) { const p = document.createElement('p'); p.textContent = text; box.append(p); }
  const cites = [
    'Merdith, A. S., et al., 2021. Extending full-plate tectonic models into deep time. Earth-Science Reviews, 214, 103477. CC BY 3.0.',
    'Scotese, C. R., and Wright, N. M., 2018. PALEOMAP Paleodigital Elevation Models (PaleoDEMS) for the Phanerozoic. doi:10.5281/zenodo.5460860. CC BY 4.0.',
    'Scotese, C. R., 2016. PALEOMAP PaleoAtlas for GPlates. doi:10.5281/zenodo.10251792. CC BY 4.0.',
    'Batchelor, G. K., 1967. An Introduction to Fluid Dynamics. McKenzie, D. P., 1969. Speculations on the consequences and causes of plate motions. Geophys. J. R. Astr. Soc., 18, 1–32.',
    'Myrow, P. M., et al., 2002. GSA Bulletin, 114, 1070–1088. Gootee, B. F., and Stump, E., 2006. Claybourn, T. M., et al., 2019. Journal of Paleontology.',
    'Ages: ICS International Chronostratigraphic Chart v2023/09. Derived data: CPlates (PaleoBytes), CC BY 4.0.',
  ];
  for (const text of cites) { const p = document.createElement('p'); p.textContent = text; box.append(p); }
}

function renderPeriods() {
  const bar = $('periods');
  bar.replaceChildren();
  for (const [key, base, top_, c] of EPOCHS) {
    const from = Math.min(base, state.oldest);
    const to = Math.max(top_, state.youngest);
    if (from <= to) continue;
    const span = document.createElement('span');
    span.style.flex = String(from - to);
    span.style.background = c;
    if (from - to > 9) { const b = document.createElement('b'); b.textContent = t().epochs[key].split(' · ').pop(); span.append(b); }
    bar.append(span);
  }
  $('oldest').textContent = `${state.oldest} Ma`;
  $('youngest').textContent = `${state.youngest} Ma`;
}

function renderVe() {
  const box = $('ve');
  box.replaceChildren();
  for (const v of VES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.ve = String(v);
    b.textContent = `${v}×`;
    b.setAttribute('aria-checked', String(v === state.ve));
    b.addEventListener('click', () => setVe(v));
    box.append(b);
  }
}

function setVe(v) {
  state.ve = v;
  renderVe();
  const params = new URLSearchParams(location.search);
  params.set('ve', String(v));
  history.replaceState(null, '', `?${params}`);
  update();
  aim(false);
}

function applyLanguage() {
  document.documentElement.lang = state.lang;
  document.title = t().title;
  for (const node of document.querySelectorAll('[data-t]')) node.textContent = t()[node.dataset.t];
  for (const b of document.querySelectorAll('[data-lang]')) b.setAttribute('aria-current', String(b.dataset.lang === state.lang));
  setPlaying(state.playing);
  renderVe();
  renderLegend();
  renderPeriods();
  if (state.data) { renderUnits(); renderSources(); update(); }
}

// ---------- controls ----------

function setPlaying(on) {
  state.playing = on;
  const b = $('play');
  b.setAttribute('aria-pressed', String(on));
  b.querySelector('.icon').textContent = on ? '❚❚' : '▶';
  b.querySelector('.label').textContent = on ? t().pause : t().play;
}
function goTo(age) {
  state.age = Math.min(state.oldest, Math.max(state.youngest, Math.round(age * 10) / 10));
  update();
}
$('play').addEventListener('click', () => {
  if (!state.playing && state.age <= state.youngest) goTo(state.oldest);
  setPlaying(!state.playing);
});
$('slider').addEventListener('input', (e) => { setPlaying(false); goTo(state.oldest - Number(e.target.value)); });
$('show-flow').addEventListener('change', (e) => { state.flow = e.target.checked; update(); });
$('show-boundaries').addEventListener('change', (e) => { state.boundaries = e.target.checked; update(); });
for (const b of document.querySelectorAll('[data-lang]')) {
  b.addEventListener('click', () => { state.lang = b.dataset.lang; keepLanguage(state.lang); applyLanguage(); });
}

// The free part of the window, as on the other pages.
function visibleRect() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const panel = $('panel').getBoundingClientRect();
  const timeline = document.querySelector('.timeline').getBoundingClientRect();
  const r = { left: 0, top: 0, right: W, bottom: Math.min(H, timeline.top) };
  if (panel.width < W * 0.6) r.left = panel.right; else r.top = panel.bottom;
  return r;
}
let lastFrame = '';
function frameView() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const r = visibleRect();
  const key = [W, H, r.left, r.top, r.right, r.bottom].map(Math.round).join();
  if (key === lastFrame) return;
  lastFrame = key;
  camera.aspect = W / H;
  const freeH = Math.max(120, r.bottom - r.top);
  camera.fov = (2 * Math.atan(Math.tan((35 / 2) * Math.PI / 180) * H / freeH) * 180) / Math.PI;
  camera.setViewOffset(W, H, -((r.left + r.right) / 2 - W / 2), -((r.top + r.bottom) / 2 - H / 2), W, H);
  camera.updateProjectionMatrix();
}

// Look at the block from in front of the section, a little above and to the A side.
function aim(move = true) {
  if (!state.data) return;
  const { along_km: along, across_km: across } = state.data.meta;
  const depth = depthShownKm(state.ve);
  const target = new THREE.Vector3((along[0] + along[1]) / 2000, yOf(-depth) / 2.4, -(across[0] + across[1]) / 4000);
  const shift = target.clone().sub(controls.target);
  controls.target.copy(target);
  // Far enough back that the whole length A–A′ fits the free part of the screen.
  const length = (along[1] - along[0]) / 1000;
  frameView();
  const r = visibleRect();
  const freeWidth = Math.max(0.3, (r.right - r.left) / window.innerWidth);
  const fit = (length / (2 * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect * freeWidth)) * 1.3;
  const view = new THREE.Vector3(-0.22, 0.68, 1).normalize();
  if (move) camera.position.copy(target).addScaledVector(view, Math.max(2.5, fit));
  else camera.position.add(shift);
  controls.update();
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  lastFrame = '';
  frameView();
}
window.addEventListener('resize', resize);

let last = null;
renderer.setAnimationLoop((now) => {
  const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.playing && state.data) {
    const next = state.age - Number($('speed').value) * dt;
    if (next <= state.youngest) { goTo(state.youngest); setPlaying(false); } else { state.age = next; update(); }
  }
  stepFlow(dt);
  frameView();
  controls.update();
  renderer.render(scene, camera);
  placeLabels();
});

async function start() {
  resize();
  applyLanguage();
  $('status').textContent = t().loading;
  try {
    state.data = await load();
  } catch {
    $('status').textContent = t().error;
    return;
  }
  $('status').textContent = '';
  state.oldest = state.data.meta.ages[0];
  state.youngest = state.data.meta.ages[state.data.meta.ages.length - 1];
  $('slider').max = String(state.oldest - state.youngest);
  const asked = Number(ASKED.get('age'));
  state.age = Number.isFinite(asked) && asked >= state.youngest && asked <= state.oldest && ASKED.has('age') ? asked : 525;
  applyLanguage();
  aim(true);
}

start();
window.cplates = { state, goTo, setVe, camera, controls, visibleRect, flowCount: () => particles.life.filter((v) => v > 0).length };
