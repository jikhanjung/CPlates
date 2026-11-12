// Antarctica through the Cambrian.
//
// Two reconstructions, kept apart on purpose (scripts/build_cambrian.py):
// - "plates": Merdith et al. 2021, palaeomagnetic frame. Continents are present-day
//   meshes turned by their plate's rotation at any fractional age, so they move
//   continuously; plate boundaries are pygplates frames, one per Myr.
// - "paleodem": Scotese & Wright 2018 PaleoDEM grids, every 5 Myr, which sit in the
//   PALEOMAP reconstruction. In this view everything is placed with PALEOMAP rotations
//   at the grid's own age, so the Transantarctic Mountains land where the grid has them.
// The band colour in the plates view is read from PaleoDEM that way too, and the page
// says so; observations (rock units) are marked apart from either model.

import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { LineSegments2 } from '../vendor/three/lines/LineSegments2.js';
import { LineSegmentsGeometry } from '../vendor/three/lines/LineSegmentsGeometry.js';
import { LineMaterial } from '../vendor/three/lines/LineMaterial.js';
import { RotationModel, turn } from './rotation.js';
import { toLonLat, toVector, sceneQuaternion } from './geo.js';
import { format, initialLanguage, keepLanguage } from './i18n.js';

const BASE = '../data/cambrian/';
const ENV = {
  land: '#b0c484', shallow: '#8fe3ef', slope: '#3f7fb0', deep: '#1b3a6a',
};
const BOUNDARY = { ridge: 0xff5a4e, subduction: 0xffd23f, transform: 0x3ddc97, other: 0xb8c0cc };

// ICS International Chronostratigraphic Chart v2023/09.
const STAGES = [
  // [base, top, epoch key, stage key, colour]
  [635.0, 538.8, 'ediacaran', 'ediacaran', '#fed96a'],
  [538.8, 529.0, 'terreneuvian', 'fortunian', '#99b575'],
  [529.0, 521.0, 'terreneuvian', 'stage2', '#a6ba80'],
  [521.0, 514.5, 'series2', 'stage3', '#a6c583'],
  [514.5, 506.5, 'series2', 'stage4', '#b3ca8e'],
  [506.5, 504.5, 'miaolingian', 'wuliuan', '#b3d492'],
  [504.5, 500.5, 'miaolingian', 'drumian', '#bfd99d'],
  [500.5, 497.0, 'miaolingian', 'guzhangian', '#cce0a6'],
  [497.0, 494.2, 'furongian', 'paibian', '#cce6a7'],
  [494.2, 491.0, 'furongian', 'jiangshanian', '#d9ebb4'],
  [491.0, 486.85, 'furongian', 'stage10', '#e6f0c1'],
  [486.85, 470.0, 'ordovician', 'tremadocian', '#33a97e'],
];
const EPOCHS = [
  ['ediacaran', 635.0, 538.8, '#fed96a'], ['terreneuvian', 538.8, 521.0, '#8cb06c'],
  ['series2', 521.0, 506.5, '#99c078'], ['miaolingian', 506.5, 497.0, '#a6cf86'],
  ['furongian', 497.0, 486.85, '#b3e095'], ['ordovician', 486.85, 470.0, '#009270'],
];

const STRINGS = {
  ko: {
    title: 'CPlates — 캄브리아기의 남극대륙',
    heading: '캄브리아기의 남극대륙',
    subtitle: '540–485 Ma, 곤드와나 가장자리의 남극과 지금의 남극종단산맥',
    back: '← 판의 움직임 (0–250 Ma)',
    age: '{age} Ma',
    play: '재생', pause: '일시정지', speed: '속도',
    modePlates: '판 모델 (Merdith 2021)',
    modePaleodem: '고지리 (PaleoDEM)',
    notePlates: '대륙과 판 경계의 위치: Merdith et al. 2021, 고지자기 기준틀. 대륙은 나이에 따라 이어서 움직이고, 판 경계는 1백만 년마다 바뀝니다. 남극종단산맥 띠의 색은 PaleoDEM {grid} Ma 격자에서 읽은 것입니다 (PALEOMAP 판 모델로 옮겨서 읽음).',
    notePaleodem: 'PaleoDEM {grid} Ma 격자 (Scotese & Wright 2018). 이 화면의 위치는 PALEOMAP 판 모델(Scotese 2016) 기준이라 판 모델 화면과 다르고, 5백만 년마다 바뀝니다.',
    follow: '남극 따라가기',
    legend: '범례',
    antarctica: '남극대륙 (동·서남극 조각)',
    gondwana: '곤드와나의 다른 대륙',
    otherLand: '그 밖의 대륙',
    tamBand: '지금의 남극종단산맥 (판을 따라 옮김)',
    ridge: '확장 경계', subduction: '섭입대 (톱니는 위에 올라탄 판 쪽)', transform: '변환 단층',
    envLand: '육지 (해발 0 m 이상)', envShallow: '얕은 바다 (0 ~ −250 m)', envSlope: '깊은 대륙붕·사면 (−250 ~ −2000 m)', envDeep: '깊은 바다 (−2000 m 아래)',
    observedMarker: '관측: 지질 기록 (대략의 위치)',
    observedBadge: '관측', modelBadge: '재구성',
    stripHeading: '남극종단산맥 자리의 바다 깊이 (PaleoDEM)',
    stripNote: '가로는 시간, 세로는 산맥을 따라 북빅토리아 랜드에서 펜서콜라 산맥까지. 각 칸은 그 자리를 PALEOMAP 판 모델로 그때 위치로 옮겨 PaleoDEM 높이를 읽은 값입니다 (재구성). 주황 막대는 같은 자리의 관측 기록입니다.',
    stripNorth: '↑ 북빅토리아 랜드 (케이프 어데어)',
    stripSouth: '↓ 펜서콜라 산맥',
    obsHeading: '지질 기록',
    obsActive: '이 시기에 해당',
    sourceHeading: '자료와 출처',
    reconstruction: '판 위치, 판 경계, 바다 깊이는 모두 모델의 재구성 결과입니다. "관측"으로 표시한 것만 암석에서 나온 기록이며, 그 위치를 과거로 옮긴 것은 모델입니다.',
    whyMerdith: '왜 Merdith 2021인가: Müller 2022와 판의 상대 운동과 판 경계는 같고 절대 기준틀만 다릅니다. 얕은 바다처럼 위도와 기후에 민감한 질문에는 고지자기 기준틀을 쓰라고 Müller 2022 저자들이 밝히고 있어, 고지자기 기준틀인 Merdith 2021을 골랐습니다.',
    timeScale: '연대: ICS 국제 층서 차트 v2023/09. 캄브리아기 538.8 ± 0.6 – 486.85 ± 1.5 Ma.',
    classesNote: '바다 깊이 구분 (육지, 얕은 바다 0 ~ −250 m 등)은 이 프로젝트가 정한 기준입니다. PaleoDEM은 대륙붕 대부분을 −160 m로 둡니다.',
    licenceLine: '{title}: {licence}',
    method: '판 경계: pygplates({version})로 1백만 년마다 풀어 냄. 남극종단산맥 윤곽: Natural Earth (퍼블릭 도메인).',
    loading: '불러오는 중…', error: '자료를 불러오지 못했습니다. scripts/build_cambrian.py 를 먼저 실행하세요.',
    epochs: {
      ediacaran: '에디아카라기', terreneuvian: '테레뉴브세', series2: '제2세', miaolingian: '먀오링세',
      furongian: '푸룽세', ordovician: '오르도비스기',
    },
    stages: {
      ediacaran: '에디아카라기', fortunian: '포르투니아절', stage2: '제2절', stage3: '제3절', stage4: '제4절',
      wuliuan: '우류절', drumian: '드럼절', guzhangian: '구장절', paibian: '파이비절', jiangshanian: '장산절',
      stage10: '제10절', tremadocian: '트레마도크절',
    },
    cambrian: '캄브리아기',
    labels: {
      eastAntarctica: '동남극', westAntarctica: '서남극', australia: '오스트레일리아', india: '인도',
      africa: '아프리카', southAmerica: '남아메리카', arabia: '아라비아', madagascar: '마다가스카르',
      laurentia: '로렌시아', baltica: '발티카', siberia: '시베리아', southChina: '남중국',
    },
    tam: '남극종단산맥',
  },
  en: {
    title: 'CPlates — Antarctica in the Cambrian',
    heading: 'Antarctica in the Cambrian',
    subtitle: '540–485 Ma: Antarctica on the edge of Gondwana, and where today’s Transantarctic Mountains were',
    back: '← Plate motion (0–250 Ma)',
    age: '{age} Ma',
    play: 'Play', pause: 'Pause', speed: 'Speed',
    modePlates: 'Plate model (Merdith 2021)',
    modePaleodem: 'Palaeogeography (PaleoDEM)',
    notePlates: 'Continents and plate boundaries: Merdith et al. 2021, palaeomagnetic frame. Continents move continuously; boundaries change every million years. The colour of the Transantarctic Mountains band is read from the PaleoDEM {grid} Ma grid (located with the PALEOMAP plate model).',
    notePaleodem: 'PaleoDEM {grid} Ma grid (Scotese & Wright 2018). Positions here follow the PALEOMAP plate model (Scotese 2016), which differs from the plate-model view, and change every 5 Myr.',
    follow: 'Follow Antarctica',
    legend: 'Legend',
    antarctica: 'Antarctica (East and West Antarctic blocks)',
    gondwana: 'Other Gondwana continents',
    otherLand: 'Other continents',
    tamBand: 'Today’s Transantarctic Mountains (carried with their plate)',
    ridge: 'Spreading boundary', subduction: 'Subduction zone (teeth on the overriding plate)', transform: 'Transform fault',
    envLand: 'Land (0 m and above)', envShallow: 'Shallow sea (0 to −250 m)', envSlope: 'Deep shelf, slope (−250 to −2000 m)', envDeep: 'Deep sea (below −2000 m)',
    observedMarker: 'Observed: geological record (approximate place)',
    observedBadge: 'Observed', modelBadge: 'Reconstructed',
    stripHeading: 'Sea depth where the Transantarctic Mountains are now (PaleoDEM)',
    stripNote: 'Across: time. Down: along the range, from northern Victoria Land to the Pensacola Mountains. Each cell is the PaleoDEM height at that place, carried back with the PALEOMAP plate model (reconstruction). Orange bars are the observed record there.',
    stripNorth: '↑ northern Victoria Land (Cape Adare)',
    stripSouth: '↓ Pensacola Mountains',
    obsHeading: 'Geological record',
    obsActive: 'In this interval',
    sourceHeading: 'Data and sources',
    reconstruction: 'Plate positions, plate boundaries and sea depths are model reconstructions. Only what is marked “Observed” comes from rocks; carrying those places back in time is the model’s part.',
    whyMerdith: 'Why Merdith 2021: it shares relative plate motions and boundaries with Müller 2022 and differs only in the absolute frame. The Müller 2022 authors advise the palaeomagnetic frame for questions sensitive to latitude and climate, such as a shallow sea, so the palaeomagnetic Merdith 2021 is used.',
    timeScale: 'Ages: ICS International Chronostratigraphic Chart v2023/09. Cambrian 538.8 ± 0.6 to 486.85 ± 1.5 Ma.',
    classesNote: 'The depth classes (land, shallow sea 0 to −250 m, and so on) are this project’s choice. PaleoDEM puts most shelf cells at −160 m.',
    licenceLine: '{title}: {licence}',
    method: 'Plate boundaries resolved with pygplates ({version}) every million years. Transantarctic Mountains outline: Natural Earth (public domain).',
    loading: 'Loading…', error: 'Could not load the data. Run scripts/build_cambrian.py first.',
    epochs: {
      ediacaran: 'Ediacaran', terreneuvian: 'Terreneuvian', series2: 'Series 2', miaolingian: 'Miaolingian',
      furongian: 'Furongian', ordovician: 'Ordovician',
    },
    stages: {
      ediacaran: 'Ediacaran', fortunian: 'Fortunian', stage2: 'Stage 2', stage3: 'Stage 3', stage4: 'Stage 4',
      wuliuan: 'Wuliuan', drumian: 'Drumian', guzhangian: 'Guzhangian', paibian: 'Paibian',
      jiangshanian: 'Jiangshanian', stage10: 'Stage 10', tremadocian: 'Tremadocian',
    },
    cambrian: 'Cambrian',
    labels: {
      eastAntarctica: 'East Antarctica', westAntarctica: 'West Antarctica', australia: 'Australia', india: 'India',
      africa: 'Africa', southAmerica: 'South America', arabia: 'Arabia', madagascar: 'Madagascar',
      laurentia: 'Laurentia', baltica: 'Baltica', siberia: 'Siberia', southChina: 'South China',
    },
    tam: 'Transantarctic Mts',
  },
};

const $ = (id) => document.getElementById(id);
const state = {
  lang: initialLanguage(),
  mode: new URLSearchParams(location.search).get('mode') === 'paleodem' ? 'paleodem' : 'plates',
  age: 540,
  oldest: 540,
  youngest: 485,
  playing: false,
  follow: true,
  data: null,
};
const t = () => STRINGS[state.lang];

// ---------- scene ----------

const canvas = $('globe');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1220);
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
camera.position.set(0, -2, 3);
scene.add(camera);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(0.6, 0.8, 1);
camera.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 1.3;
controls.maxDistance = 8;
controls.rotateSpeed = 0.5;
controls.zoomSpeed = 0.8;
controls.addEventListener('start', () => setFollow(false));

const demTexture = new THREE.Texture();
demTexture.colorSpace = THREE.SRGBColorSpace;
demTexture.generateMipmaps = false;
demTexture.minFilter = THREE.LinearFilter;
demTexture.wrapS = THREE.RepeatWrapping;
const globeMaterial = new THREE.ShaderMaterial({
  uniforms: { dem: { value: demTexture }, useDem: { value: 0 } },
  vertexShader: `varying vec3 vPos; varying vec3 vN;
    void main(){ vPos = position; vN = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D dem; uniform float useDem; varying vec3 vPos; varying vec3 vN;
    const float PI = 3.141592653589793;
    void main(){
      vec3 p = normalize(vPos);
      vec2 uv = vec2((atan(-p.z, p.x) + PI) / (2.0 * PI), (0.5 * PI - asin(clamp(p.y, -1.0, 1.0))) / PI);
      vec3 ocean = vec3(0.012, 0.032, 0.075); // linear; shown through the sRGB output
      vec3 colour = useDem > 0.5 ? texture2D(dem, uv).rgb : ocean;
      float light = max(dot(normalize(vN), normalize(vec3(0.35, 0.45, 1.0))), 0.0);
      gl_FragColor = vec4(colour * (0.5 + 0.6 * light), 1.0);
      #include <colorspace_fragment>
    }`,
});
const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), globeMaterial);
scene.add(globe);
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.06, 64, 32), new THREE.ShaderMaterial({
  side: THREE.BackSide, transparent: true, depthWrite: false,
  vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `varying vec3 vN; void main(){ float f = pow(1.0 - abs(vN.z), 3.0);
    gl_FragColor = vec4(0.45, 0.65, 1.0, f * 0.35); }`,
})));

// Present-day graticule, faint, so the poles and the equator stay readable in any view.
{
  const points = [];
  const step = 2;
  for (let lat = -60; lat <= 60; lat += 30) {
    for (let lon = -180; lon < 180; lon += step) {
      points.push(...toVector(lon, lat, 1.0008), ...toVector(lon + step, lat, 1.0008));
    }
  }
  for (let lon = -180; lon < 180; lon += 30) {
    for (let lat = -90; lat < 90; lat += step) {
      points.push(...toVector(lon, lat, 1.0008), ...toVector(lon, lat + step, 1.0008));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  scene.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false,
  })));
}

const continentGroup = new THREE.Group();
scene.add(continentGroup);
const boundaryLayers = {};
for (const kind of Object.keys(BOUNDARY)) {
  const line = new LineSegments2(new LineSegmentsGeometry(), new LineMaterial({
    color: BOUNDARY[kind], linewidth: kind === 'other' ? 1.2 : 2.2, transparent: true, opacity: kind === 'other' ? 0.6 : 0.95,
  }));
  line.renderOrder = 3;
  scene.add(line);
  boundaryLayers[kind] = line;
}
const teeth = new THREE.Mesh(new THREE.BufferGeometry(),
  new THREE.MeshBasicMaterial({ color: BOUNDARY.subduction, side: THREE.DoubleSide }));
scene.add(teeth);

const tamOutline = new LineSegments2(new LineSegmentsGeometry(),
  new LineMaterial({ color: 0xfff6d8, linewidth: 1.6 }));
tamOutline.renderOrder = 4;
const tamCentre = new LineSegments2(new LineSegmentsGeometry(),
  new LineMaterial({ vertexColors: true, linewidth: 7 }));
tamCentre.renderOrder = 5;
scene.add(tamOutline, tamCentre);

const markerGroup = new THREE.Group();
scene.add(markerGroup);
const markers = new Map();
const markerShape = new THREE.OctahedronGeometry(0.014);

function threeQuaternion(q) {
  return new THREE.Quaternion(...sceneQuaternion(q));
}

// ---------- data ----------

async function load() {
  const names = ['meta', 'continents', 'boundaries', 'rotations-merdith', 'rotations-paleomap',
                 'tam', 'observations', 'labels'];
  const values = await Promise.all(names.map((name) => fetch(`${BASE}${name}.json`).then((r) => {
    if (!r.ok) throw new Error(name);
    return r.json();
  })));
  const data = Object.fromEntries(names.map((name, i) => [name, values[i]]));
  data.merdith = new RotationModel(data['rotations-merdith']);
  data.paleomap = new RotationModel(data['rotations-paleomap']);
  data.grids = new Map();
  await Promise.all(data.meta.grid_ages.map(async (age) => {
    const blob = await fetch(`${BASE}paleodem/${age}.png`).then((r) => r.blob());
    data.grids.set(age, await createImageBitmap(blob));
  }));
  return data;
}

function buildContinents(list) {
  const colours = { antarctic: new THREE.Color('#f3e7c6'), gondwana: new THREE.Color('#b9a77f'), other: new THREE.Color('#77736b') };
  for (const piece of list) {
    const kind = piece.antarctic ? 'antarctic' : piece.gondwana ? 'gondwana' : 'other';
    const radius = piece.antarctic ? 1.0025 : 1.0018;
    const positions = new Float32Array(piece.v.length / 2 * 3);
    for (let i = 0, j = 0; i < piece.v.length; i += 2, j += 3) {
      positions.set(toVector(piece.v[i], piece.v[i + 1], radius), j);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(piece.t);
    geometry.computeVertexNormals();
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: colours[kind], side: THREE.DoubleSide })));
    const outline = [];
    for (const ring of piece.r) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        outline.push(...positions.slice(a * 3, a * 3 + 3), ...positions.slice(b * 3, b * 3 + 3));
      }
    }
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position', new THREE.Float32BufferAttribute(outline, 3));
    group.add(new THREE.LineSegments(lines, new THREE.LineBasicMaterial({
      color: kind === 'antarctic' ? 0xc98a4b : 0x3a3328, transparent: true, opacity: kind === 'antarctic' ? 0.55 : 0.3,
    })));
    group.userData = { plate: piece.plate, from: piece.from, to: piece.to };
    continentGroup.add(group);
  }
}

// ---------- per age ----------

function rotated(model, plate, lon, lat, age, cache) {
  let q = cache.get(plate);
  if (q === undefined) {
    q = model.rotation(plate, age);
    cache.set(plate, q);
  }
  return q ? turn(q, lon, lat) : null;
}

function nearestGrid(age) {
  return state.data.meta.grid_ages.reduce((best, a) => (Math.abs(a - age) < Math.abs(best - age) ? a : best));
}

function placeTam(model, key, age) {
  const cache = new Map();
  const { outline, centre } = state.data.tam;
  const segments = [];
  for (const ring of outline) {
    let previous = null;
    for (const point of [...ring, ring[0]]) {
      const where = rotated(model, point[key], point.lon, point.lat, age, cache);
      const v = where ? toVector(where[0], where[1], 1.0035) : null;
      if (previous && v) segments.push(...previous, ...v);
      previous = v;
    }
  }
  tamOutline.geometry.dispose();
  tamOutline.geometry = new LineSegmentsGeometry();
  if (segments.length) tamOutline.geometry.setPositions(segments);

  const grid = String(nearestGrid(age));
  const positions = [];
  const colours = [];
  let previous = null;
  for (const point of centre) {
    const where = rotated(model, point[key], point.lon, point.lat, age, cache);
    const v = where ? toVector(where[0], where[1], 1.0042) : null;
    const colour = new THREE.Color(ENV[point.env[grid]]);
    if (previous && v) {
      positions.push(...previous.v, ...v);
      colours.push(...previous.c, colour.r, colour.g, colour.b);
    }
    previous = v ? { v, c: [colour.r, colour.g, colour.b] } : null;
  }
  tamCentre.geometry.dispose();
  tamCentre.geometry = new LineSegmentsGeometry();
  if (positions.length) {
    tamCentre.geometry.setPositions(positions);
    tamCentre.geometry.setColors(colours);
  }
  // Where the label goes: towards the Pensacola end, clear of the observation markers.
  const middle = centre[Math.floor(centre.length * 0.75)];
  return rotated(model, middle[key], middle.lon, middle.lat, age, cache);
}

let shownBoundaries = null;
function boundaryFrame(age) {
  const key = `${state.mode}:${Math.round(age)}`;
  if (shownBoundaries === key) return;
  shownBoundaries = key;
  const frame = state.data.boundaries[String(Math.round(age))] ?? [];
  const positions = { ridge: [], subduction: [], transform: [], other: [] };
  const triangles = [];
  for (const piece of frame) {
    const target = positions[piece.k] ?? positions.other;
    const c = piece.c;
    for (let i = 0; i + 3 < c.length; i += 2) {
      target.push(...toVector(c[i], c[i + 1], 1.003), ...toVector(c[i + 2], c[i + 3], 1.003));
    }
    if (piece.k === 'subduction' && piece.p) teethAlong(c, piece.p === 'L' ? 1 : -1, triangles);
  }
  for (const [kind, line] of Object.entries(boundaryLayers)) {
    line.geometry.dispose();
    line.geometry = new LineSegmentsGeometry();
    if (positions[kind].length) line.geometry.setPositions(positions[kind]);
    line.visible = state.mode === 'plates' && positions[kind].length > 0;
  }
  teeth.geometry.dispose();
  teeth.geometry = new THREE.BufferGeometry();
  teeth.geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles, 3));
  teeth.visible = state.mode === 'plates';
}

function teethAlong(c, sign, out) {
  const spacing = 1.8 * Math.PI / 180;
  const half = 0.45 * Math.PI / 180;
  const height = 0.9 * Math.PI / 180;
  let carried = spacing / 2;
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  for (let i = 0; i + 3 < c.length; i += 2) {
    p.set(...toVector(c[i], c[i + 1]));
    q.set(...toVector(c[i + 2], c[i + 3]));
    const arc = p.angleTo(q);
    if (arc < 1e-9) continue;
    while (carried <= arc) {
      const f = carried / arc;
      const here = p.clone().multiplyScalar(Math.sin((1 - f) * arc)).add(q.clone().multiplyScalar(Math.sin(f * arc))).divideScalar(Math.sin(arc));
      const tangent = q.clone().sub(p);
      tangent.addScaledVector(here, -here.dot(tangent)).normalize();
      const side = new THREE.Vector3().crossVectors(here, tangent).multiplyScalar(sign);
      for (const v of [here.clone().addScaledVector(tangent, -half), here.clone().addScaledVector(tangent, half), here.clone().addScaledVector(side, height)]) {
        v.normalize().multiplyScalar(1.0035);
        out.push(v.x, v.y, v.z);
      }
      carried += spacing;
    }
    carried -= arc;
  }
}

let shownGrid = null;
const labelNodes = new Map();
const anchors = [];

function update() {
  const age = state.age;
  const data = state.data;
  if (!data) return;
  const plates = state.mode === 'plates';
  const grid = nearestGrid(age);
  // In the PaleoDEM view everything is placed at the grid's own age, where the grid is.
  const placeAge = plates ? age : grid;
  const model = plates ? data.merdith : data.paleomap;
  const key = plates ? 'm' : 'p';

  globeMaterial.uniforms.useDem.value = plates ? 0 : 1;
  if (!plates && shownGrid !== grid) {
    demTexture.image = data.grids.get(grid);
    demTexture.needsUpdate = true;
    shownGrid = grid;
  }

  continentGroup.visible = plates;
  if (plates) {
    const cache = new Map();
    for (const group of continentGroup.children) {
      const { plate, from, to } = group.userData;
      let q = cache.get(plate);
      if (q === undefined) {
        q = data.merdith.rotation(plate, age);
        cache.set(plate, q);
      }
      group.visible = Boolean(q) && age <= from + 1e-6 && age >= to - 1e-6;
      if (q) group.quaternion.copy(threeQuaternion(q));
    }
  }
  boundaryFrame(age);
  const tamAt = placeTam(model, key, placeAge);

  // Observation markers: present only in their age window, moved with the view's model.
  anchors.length = 0;
  const cache = new Map();
  for (const item of data.observations.items) {
    const active = age <= item.age[0] && age >= item.age[1];
    const where = rotated(model, item[key], item.present[0], item.present[1], placeAge, cache);
    const marker = markers.get(item.id);
    marker.visible = Boolean(where);
    if (!where) continue;
    marker.material.opacity = active ? 1 : 0.25;
    marker.position.set(...toVector(where[0], where[1], 1.012));
    if (active) anchors.push({ id: `obs-${item.id}`, where, text: item.name[state.lang], className: 'obs' });
  }
  for (const label of data.labels) {
    if (!plates && !label.key.endsWith('Antarctica')) continue;
    const where = rotated(model, label[key], label.present[0], label.present[1], placeAge, cache);
    if (where) {
      anchors.push({ id: label.key, where, text: t().labels[label.key],
                     className: label.key.endsWith('Antarctica') ? 'antarctic' : '' });
    }
  }
  if (tamAt) anchors.push({ id: 'tam', where: tamAt, text: t().tam, className: 'antarctic' });

  if (state.follow) {
    const target = focusPoint();
    // A jump (another view, another model, a far slider move) is taken at once; small
    // steps, as in playback, are eased.
    if (target && state.target && angleBetween(target, state.target) > 0.5) state.snap = true;
    state.target = target;
  }
  renderAge();
  renderObservations();
  drawStrip();
}

// What "follow Antarctica" keeps in the middle: halfway between East Antarctica and the
// middle of the Transantarctic Mountains band, both placed with the model of the view on
// screen (Merdith in the plate view, PALEOMAP at the grid age in the PaleoDEM view),
// so the band and the continent behind it are both in sight.
function focusPoint(age = state.age, mode = state.mode) {
  const data = state.data;
  const plates = mode === 'plates';
  const model = plates ? data.merdith : data.paleomap;
  const key = plates ? 'm' : 'p';
  const placeAge = plates ? age : nearestGrid(age);
  const cache = new Map();
  const east = data.labels.find((l) => l.key === 'eastAntarctica');
  const middle = data.tam.centre[Math.floor(data.tam.centre.length / 2)];
  const a = rotated(model, east[key], east.present[0], east.present[1], placeAge, cache);
  const b = rotated(model, middle[key], middle.lon, middle.lat, placeAge, cache);
  if (!a || !b) return a || b;
  const va = toVector(...a);
  const vb = toVector(...b);
  return toLonLat(va.map((v, i) => v + vb[i]));
}

function angleBetween(a, b) {
  const va = toVector(...a);
  const vb = toVector(...b);
  return Math.acos(Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2])));
}

// The part of the window the panels leave free: right of the side panel on a wide
// screen, below it on a phone, and above the timeline.
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
// view so the globe fits in it.
let lastFrame = '';
function frameView() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const r = visibleRect();
  const key = [W, H, r.left, r.top, r.right, r.bottom].map(Math.round).join();
  if (key === lastFrame) return;
  lastFrame = key;
  // 0.92: a little margin so the rim is not cut by the panels.
  const free = 0.92 * Math.max(120, Math.min(r.right - r.left, r.bottom - r.top));
  const across = Math.tan((35 / 2) * Math.PI / 180);
  camera.fov = (2 * Math.atan((across * H) / free) * 180) / Math.PI;
  camera.aspect = W / H;
  const dx = (r.left + r.right) / 2 - W / 2;
  const dy = (r.top + r.bottom) / 2 - H / 2;
  camera.setViewOffset(W, H, -dx, -dy, W, H);
  camera.updateProjectionMatrix();
}

// Where a point on the globe is drawn, in CSS pixels (for tests and labels).
function screenOf(lonLat, radius = 1) {
  const v = new THREE.Vector3(...toVector(lonLat[0], lonLat[1], radius)).project(camera);
  return [((v.x + 1) / 2) * window.innerWidth, ((1 - v.y) / 2) * window.innerHeight];
}

// HTML labels, placed every frame and hidden on the far side.
function placeLabels() {
  const box = $('labels');
  const seen = new Set();
  const toCamera = camera.position.clone().normalize();
  for (const anchor of anchors) {
    seen.add(anchor.id);
    let node = labelNodes.get(anchor.id);
    if (!node) {
      node = document.createElement('span');
      box.append(node);
      labelNodes.set(anchor.id, node);
    }
    node.textContent = anchor.text;
    node.className = anchor.className;
    const v = new THREE.Vector3(...toVector(anchor.where[0], anchor.where[1], 1.02));
    const facing = v.clone().normalize().dot(toCamera);
    v.project(camera);
    node.style.display = facing > 0.15 ? '' : 'none';
    node.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
    node.style.top = `${((1 - v.y) / 2) * window.innerHeight}px`;
  }
  for (const [id, node] of labelNodes) {
    if (!seen.has(id)) { node.remove(); labelNodes.delete(id); }
  }
}

// ---------- panel ----------

function stageAt(age) {
  return STAGES.find(([base, top]) => age <= base && age > top) ?? STAGES[STAGES.length - 1];
}

function renderAge() {
  const age = state.age;
  $('age').textContent = format(t().age, { age: age.toFixed(1) });
  const [, , epoch, stage, colour] = stageAt(age);
  const inCambrian = age <= 538.8 && age > 486.85;
  const period = $('period');
  period.replaceChildren();
  const swatch = document.createElement('i');
  swatch.style.background = colour;
  const words = inCambrian ? `${t().cambrian} · ${t().epochs[epoch]} · ${t().stages[stage]}` : t().stages[stage];
  period.append(swatch, document.createTextNode(words));
  $('slider').value = String(state.oldest - age);
  $('slider').setAttribute('aria-valuetext', format(t().age, { age: age.toFixed(1) }));
  const grid = nearestGrid(age);
  $('mode-note').textContent = format(state.mode === 'plates' ? t().notePlates : t().notePaleodem, { grid });
}

function renderLegend() {
  const items = state.mode === 'plates'
    ? [['fill', '#f3e7c6', t().antarctica], ['fill', '#b9a77f', t().gondwana], ['fill', '#77736b', t().otherLand],
       ['ring', '', t().tamBand], ['line', '#ff5a4e', t().ridge], ['line', '#ffd23f', t().subduction],
       ['line', '#3ddc97', t().transform]]
    : [['ring', '', t().tamBand]];
  items.push(['line thick', ENV.land, t().envLand], ['line thick', ENV.shallow, t().envShallow],
             ['line thick', ENV.slope, t().envSlope], ['line thick', ENV.deep, t().envDeep],
             ['diamond', '', t().observedMarker]);
  const list = $('legend');
  list.replaceChildren();
  for (const [shape, colour, text] of items) {
    const li = document.createElement('li');
    const sw = document.createElement('span');
    sw.className = `sw ${shape}`;
    if (shape.startsWith('line')) sw.style.height = shape.includes('thick') ? '6px' : '3px';
    if (colour) sw.style.background = colour;
    const label = document.createElement('span');
    label.textContent = text;
    li.append(sw, label);
    list.append(li);
  }
}

function renderObservations() {
  const list = $('observations');
  const age = state.age;
  const key = `${state.lang}:${state.data.observations.items.map((i) => age <= i.age[0] && age >= i.age[1]).join()}`;
  if (list.dataset.key === key) return;
  list.dataset.key = key;
  list.replaceChildren();
  for (const item of state.data.observations.items) {
    const active = age <= item.age[0] && age >= item.age[1];
    const li = document.createElement('li');
    li.className = active ? 'active' : 'inactive';
    li.tabIndex = 0;
    const title = document.createElement('strong');
    title.textContent = item.name[state.lang];
    const when = document.createElement('div');
    when.className = 'when';
    when.textContent = `${item.where[state.lang]} · ${item.age[0]}–${item.age[1]} Ma${active ? ` · ${t().obsActive}` : ''}`;
    const says = document.createElement('div');
    says.className = 'says';
    says.textContent = item.says[state.lang];
    const what = document.createElement('div');
    what.textContent = item.what[state.lang];
    const refs = document.createElement('div');
    refs.className = 'refs';
    refs.textContent = item.refs.join(' ');
    li.append(title, when, says, what, refs);
    const focus = () => {
      setPlaying(false);
      goTo(Math.min(item.age[0], Math.max(item.age[1], (item.age[0] + item.age[1]) / 2)));
      const model = state.mode === 'plates' ? state.data.merdith : state.data.paleomap;
      const k = state.mode === 'plates' ? 'm' : 'p';
      const placeAge = state.mode === 'plates' ? state.age : nearestGrid(state.age);
      const q = model.rotation(item[k], placeAge);
      if (q) { state.target = turn(q, item.present[0], item.present[1]); state.flyOnce = true; }
    };
    li.addEventListener('click', focus);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') focus(); });
    list.append(li);
  }
}

function drawStrip() {
  const cv = $('strip');
  const g = cv.getContext('2d');
  const { centre } = state.data.tam;
  const ages = state.data.meta.grid_ages;
  const W = cv.width;
  const H = cv.height;
  const x = (age) => ((state.oldest - age) / (state.oldest - state.youngest)) * W;
  const total = centre[centre.length - 1].s_km;
  const y = (s) => (s / total) * (H - 4) + 2;
  g.clearRect(0, 0, W, H);
  for (const age of ages) {
    const left = Math.max(0, x(Math.min(state.oldest, age + 2.5)));
    const right = Math.min(W, x(Math.max(state.youngest, age - 2.5)));
    centre.forEach((point, i) => {
      const top = i === 0 ? 0 : (y(centre[i - 1].s_km) + y(point.s_km)) / 2;
      const bottom = i === centre.length - 1 ? H : (y(point.s_km) + y(centre[i + 1].s_km)) / 2;
      g.fillStyle = ENV[point.env[String(age)]];
      g.fillRect(left, top, right - left + 0.5, bottom - top + 0.5);
    });
  }
  // Observations: a bar over their age window at their place along the range.
  for (const item of state.data.observations.items) {
    let best = centre[0];
    let bestD = Infinity;
    for (const point of centre) {
      const d = (point.lon - item.present[0]) ** 2 * Math.cos(point.lat * Math.PI / 180) ** 2 + (point.lat - item.present[1]) ** 2;
      if (d < bestD) { bestD = d; best = point; }
    }
    const yy = y(best.s_km);
    g.fillStyle = '#ff9f43';
    g.fillRect(x(Math.min(state.oldest, item.age[0])), yy - 3, x(Math.max(state.youngest, item.age[1])) - x(Math.min(state.oldest, item.age[0])), 6);
    g.strokeStyle = '#1a1208';
    g.lineWidth = 1;
    g.strokeRect(x(Math.min(state.oldest, item.age[0])), yy - 3, x(Math.max(state.youngest, item.age[1])) - x(Math.min(state.oldest, item.age[0])), 6);
  }
  // Now.
  g.strokeStyle = '#ffffff';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x(state.age), 0);
  g.lineTo(x(state.age), H);
  g.stroke();
  cv.setAttribute('aria-label', t().stripHeading);
}

function renderPeriods() {
  const bar = $('periods');
  bar.replaceChildren();
  for (const [key, base, top, colour] of EPOCHS) {
    const from = Math.min(base, state.oldest);
    const to = Math.max(top, state.youngest);
    if (from <= to) continue;
    const span = document.createElement('span');
    span.style.flex = String(from - to);
    span.style.background = colour;
    span.title = t().epochs[key];
    if (from - to > 6) {
      const label = document.createElement('b');
      label.textContent = t().epochs[key];
      span.append(label);
    }
    bar.append(span);
  }
  const ticks = $('ticks');
  ticks.replaceChildren();
  for (const age of state.data?.meta.grid_ages ?? []) {
    const tick = document.createElement('i');
    tick.style.left = `${((state.oldest - age) / (state.oldest - state.youngest)) * 100}%`;
    tick.title = `PaleoDEM ${age} Ma`;
    ticks.append(tick);
  }
  $('oldest').textContent = `${state.oldest} Ma`;
  $('youngest').textContent = `${state.youngest} Ma`;
}

function renderSources() {
  const box = $('sources');
  box.replaceChildren();
  const para = (text, className) => {
    const p = document.createElement('p');
    p.textContent = text;
    if (className) p.className = className;
    box.append(p);
    return p;
  };
  para(t().reconstruction, 'caveat');
  para(t().whyMerdith);
  for (const key of ['merdith2021', 'paleodem', 'paleomap2016', 'naturalearth']) {
    const s = state.data.meta.sources[key];
    const h = document.createElement('h3');
    const badge = document.createElement('span');
    badge.className = 'badge model';
    badge.textContent = t().modelBadge;
    h.append(badge, document.createTextNode(` ${s.title}`));
    if (key === 'naturalearth') h.firstChild.remove();
    box.append(h);
    const p = para(`${s.citation} `);
    if (s.doi) {
      const a = document.createElement('a');
      a.href = `https://doi.org/${s.doi}`;
      a.textContent = `doi:${s.doi}`;
      a.rel = 'noopener';
      p.append(a);
    }
    const licence = document.createElement('a');
    licence.href = s.license_url;
    licence.textContent = s.license;
    licence.rel = 'noopener';
    p.append(document.createTextNode(' · '), licence);
  }
  para(format(t().method, { version: state.data.meta.built_with.replace('pygplates ', '') }));
  para(t().classesNote);
  para(t().timeScale);
  para('CPlates (PaleoBytes), derived data: CC BY 4.0.');
}

function applyLanguage() {
  document.documentElement.lang = state.lang;
  document.title = t().title;
  for (const node of document.querySelectorAll('[data-t]')) node.textContent = t()[node.dataset.t];
  for (const button of document.querySelectorAll('[data-lang]')) {
    button.setAttribute('aria-current', String(button.dataset.lang === state.lang));
  }
  for (const button of document.querySelectorAll('[data-mode]')) {
    button.setAttribute('aria-checked', String(button.dataset.mode === state.mode));
  }
  setPlaying(state.playing);
  renderLegend();
  renderPeriods();
  if (state.data) {
    renderSources();
    $('observations').dataset.key = '';
    update();
  }
}

// ---------- controls ----------

function goTo(age) {
  state.age = Math.min(state.oldest, Math.max(state.youngest, Math.round(age * 10) / 10));
  update();
}

function setPlaying(playing) {
  state.playing = playing;
  const button = $('play');
  button.setAttribute('aria-pressed', String(playing));
  button.querySelector('.icon').textContent = playing ? '❚❚' : '▶';
  button.querySelector('.label').textContent = playing ? t().pause : t().play;
}

function setFollow(on) {
  state.follow = on;
  $('follow').checked = on;
  if (on) { state.flyOnce = false; update(); }
}

$('play').addEventListener('click', () => {
  if (!state.playing && state.age <= state.youngest) goTo(state.oldest);
  setPlaying(!state.playing);
});
$('slider').addEventListener('input', (e) => { setPlaying(false); goTo(state.oldest - Number(e.target.value)); });
$('follow').addEventListener('change', (e) => setFollow(e.target.checked));
for (const button of document.querySelectorAll('[data-lang]')) {
  button.addEventListener('click', () => { state.lang = button.dataset.lang; keepLanguage(state.lang); applyLanguage(); });
}
for (const button of document.querySelectorAll('[data-mode]')) {
  button.addEventListener('click', () => { state.mode = button.dataset.mode; state.snap = true; applyLanguage(); });
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  lastFrame = '';
  frameView();
}
window.addEventListener('resize', resize);

let last = null;
renderer.setAnimationLoop((now) => {
  if (last === null) last = now;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.playing && state.data) {
    const next = state.age - Number($('speed').value) * dt;
    if (next <= state.youngest) { goTo(state.youngest); setPlaying(false); } else { state.age = next; update(); }
  }
  // Turn the camera towards the target (Antarctica, or a picked observation). The easing
  // is by elapsed time, not by frame, so a slow renderer catches up just as fast.
  frameView();
  if ((state.follow || state.flyOnce) && state.target) {
    const distance = camera.position.length();
    const want = new THREE.Vector3(...toVector(state.target[0], state.target[1], 1)).normalize();
    const have = camera.position.clone().normalize();
    const elapsed = Math.min(0.5, (now - (state.lastCameraTime ?? now)) / 1000);
    const share = state.snap ? 1 : 1 - Math.exp(-elapsed * (state.flyOnce ? 6 : 4));
    state.snap = false;
    const angle = have.angleTo(want);
    if (angle > 1e-6) {
      const axis = new THREE.Vector3().crossVectors(have, want).normalize();
      if (axis.lengthSq() > 0.5) have.applyAxisAngle(axis, angle * share);
      else have.copy(want);
    }
    camera.position.copy(have.multiplyScalar(distance));
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    if (state.flyOnce && angle < 0.01) state.flyOnce = false;
  }
  state.lastCameraTime = now;
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
  state.oldest = state.data.meta.oldest;
  state.youngest = state.data.meta.youngest;
  $('slider').max = String(state.oldest - state.youngest);
  buildContinents(state.data.continents);
  for (const item of state.data.observations.items) {
    const marker = new THREE.Mesh(markerShape, new THREE.MeshBasicMaterial({ color: 0xff9f43, transparent: true }));
    markers.set(item.id, marker);
    markerGroup.add(marker);
  }
  const asked = Number(new URLSearchParams(location.search).get('age'));
  state.age = Number.isFinite(asked) && asked >= state.youngest && asked <= state.oldest ? asked : state.oldest;
  applyLanguage();
  // Start looking straight at Antarctica.
  const start = focusPoint();
  if (start) camera.position.set(...toVector(start[0], start[1], 3.4));
  camera.lookAt(0, 0, 0);
  state.snap = true;
}

start();
window.cplates = { state, goTo, camera, controls, setFollow, focusPoint, screenOf, visibleRect };
