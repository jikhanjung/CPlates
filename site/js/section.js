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
import { vfetch } from './version.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { subductionFlow } from './cornerflow.js';
import { RotationModel, turn } from './rotation.js';
import { toVector } from './geo.js';
import { continentalShare, crustKm, OCEANIC_CRUST_KM } from './isostasy.js';
import { slabUV, slabSD, outsidePieces, insidePieces, carve } from './slabcut.js';
import { MISMATCH_M, SLOPE_FOOT_M, heightAt, slopeFoot, smoothRows } from './trenchfit.js';
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
    columnObserved: '관측 · Myrow et al. 2002 개정 층서', columnModel: 'PaleoDEM 환경',
    colInboard: '← 안쪽 (대륙 쪽)', colOutboard: '바깥쪽 →', colTop: 'C–O?', interpSuffix: ' (해석)', belowView: '{age} Ma 이전',
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
    trenchEased: '모델에서는 {from}→{to} Ma 사이에 해구가 (선을 따라) 약 {km} km 한 번에 옮겨집니다. 화면은 해구선의 각 점을 앞뒤 5백만 년에 걸쳐 이어 그린 보간입니다.',
    showLimestone: '섀클턴 석회암 분포', limestoneThickness: '두께', closeUp: '섀클턴 지역 확대', whole: '블록 전체',
    resetBox: '상자 원래대로', boxHint: '상자 옆면의 노란 점을 끌면 그 면이 옮겨 갑니다. 안으로 끌면 좁아지고, 밖으로 끌면 처음 상자보다 사방으로 약 670 km까지 넓어집니다. 앞면이 단면입니다.',
    faceAt: '앞면 단면', faceAtValue: 'A–A′에서 {km} km 안쪽', faceAtOut: 'A–A′에서 {km} km 바깥쪽',
    showOutcrops: '버드층군 하부·상부 (GeoMAP)',
    byrdLowerKm: '하부', byrdUpperKm: '상부',
    outcropNote: 'SCAR GeoMAP v2022-08(Cox et al. 2023, 1:25만)의 버드층군 노두를 단면 격자 칸(약 28 km)으로 모았습니다. 노두가 조금이라도 든 칸은 칸 전체를 칠합니다. 하부 버드층군(하늘색)은 섀클턴 석회암, 상부(주황)는 스타샷층과 더글러스 역암이며, 층을 나누지 않은 버드층군 칸은 둘 다 있다고 봅니다. 상부가 드러난 칸에는 그 아래에 하부도 있다고 둡니다. 하부는 525–512 Ma, 상부는 511–485 Ma 동안 고르게 쌓이고, 앞면 단면에서는 먼저 쌓인 하부 위에 상부가 더해집니다(지표는 PaleoDEM 그대로 두고 아래로 쌓아 내림). 이미 쌓인 층은 진하게, 아직 쌓이기 전은 흐리게 칠합니다. 지금의 노두는 그 뒤의 침식과 충상(겹쳐 올라탐)으로 줄어든 범위라, 쌓일 때는 더 넓게 분포했을 것입니다. 그래서 노두를 동남극(판 802)과 함께 그 시대로 옮겼을 때 노두가 든 칸에는 칸 전체에 그 층이 있다고 봅니다(근사). 두께는 모식입니다: 하부는 섀클턴 석회암 두께와 같고, 상부 두께는 문헌에서 잰 값을 찾지 못해 고른 값입니다.',
    lgByrdLower: '하부 버드층군 (섀클턴 석회암) · 525–512 Ma', lgByrdUpper: '상부 버드층군 (스타샷층·더글러스 역암) · 511–485 Ma',
    lgByrdNotYet: '흐린 칸: 아직 쌓이기 전',
    byrdLabel: '버드층군 · 하부 {lower} km{upper} (모식)', byrdUpperPart: ' + 상부 {km} km', byrdNotYet: '버드층군 분포 (아직 쌓이기 전)',
    outcropSections: '측정 단면 S1·S2·HR (Myrow 2002)',
    showGeology: '시대별 암석 분포 (GeoMAP)',
    geologyNote: '지금 드러난 암석을 SCAR GeoMAP v2022-08(Cox et al. 2023)의 간추린 분류(SIMPCODE)로 나눠 생긴 때 순으로 칠했습니다. 단면 격자 칸(약 28 km)마다 그 칸에서 가장 넓게 드러난 암석의 색으로 칸 전체를 칠합니다(암석이 조금이라도 있으면 칠함). 빙퇴석·얼음·분류 안 된 것은 뺐습니다. 흐린 회색빛은 화면의 나이에 아직 생기지 않은 암석입니다(비컨 누층군, 페라 등). 동남극(판 802)과 함께 옮긴 지금의 자리이며, 그 시대에 그 암석이 있던 범위가 아닙니다. 대륙 대부분이 얼음 밑이라 드러난 곳은 산맥에 몰려 있습니다.',
    lgGeologyLater: '흐린 색: 이 나이에는 아직 생기지 않은 암석',
    fitTrench: '해구를 PaleoDEM 지형에 맞추기 (해석)',
    fitNote: '해구를 줄마다 가장 가까운 PaleoDEM −2,000 m 선(대륙 사면 발치)으로 옮겨 그립니다. 옮긴 위치는 해석이고, 섭입 방향·시기·수렴 속도는 Merdith 2021 그대로입니다. 회색 점선이 Merdith의 원래 해구입니다.',
    mismatchNote: '해구는 Merdith 2021, 지형은 PaleoDEM(PALEOMAP)에서 옵니다. 두 복원이 대륙 가장자리를 다른 곳에 두어, 빨간 해구 구간은 PaleoDEM의 대륙붕이나 육지 위에 놓입니다.',
    lgMismatch: '해구가 PaleoDEM 대륙붕·육지 위 (두 모델 어긋남)', lgMerdithTrench: 'Merdith 2021의 원래 해구',
    nowSite: '해구 자리', nowSiteMerdith: 'Merdith 해구 자리', siteValue: 'PaleoDEM {m} m', siteShelf: 'PaleoDEM {m} m · 대륙붕 (두 모델 어긋남)', siteLand: 'PaleoDEM {m} m · 육지 (두 모델 어긋남)',
    nowFoot: '사면 발치', footValue: 'PaleoDEM −2,000 m 선까지 {km} km',
    nowShare: '어긋남', shareValue: '상자 안 Merdith 해구의 {p}%가 PaleoDEM 대륙붕·육지 위',
    nowFitted: '해구 위치', fittedValue: 'PaleoDEM −2,000 m 선에 맞춤 · Merdith 해구에서 {km} km',
    fittedNone: '이 줄에는 맞출 −2,000 m 선이 없어 Merdith 자리 그대로',
    interpBadge: '해석',
    limestoneLabel: '섀클턴 석회암 · 지금 두께 {km} km (모식)', limestoneNotYet: '섀클턴 석회암 분포 (아직 쌓이기 전)',
    slabLabel: '섭입하는 판 (슬랩, 모식)', wedgeLabel: '맨틀 쐐기 흐름 (모식)', underLabel: '슬랩 아래 흐름 (모식)',
    globeCaption: '지구본 · Merdith 2021 · {age} Ma', boxNote: '빨간 상자가 이 블록. 끌어서 돌리기, 휠로 확대, 더블클릭으로 처음 시점, 왼쪽 위 모서리로 크기.',
    sourceHeading: '자료와 방법',
    methods: [
      '블록은 동남극(Merdith 2021 판 802)에 고정한 격자입니다. 각 나이에 격자의 각 점에 어느 판의 암석이 있는지를 Merdith 2021 프레임에서 찾습니다.',
      '지표 높이: PaleoDEM(Scotese & Wright 2018)을 Merdith 좌표로 옮긴 것. 대륙 지각은 그 암석을 따라 PALEOMAP 판 모델로, 바다는 동남극에 상대적인 위치로 읽고, 5백만 년 격자 사이는 시간으로 보간합니다(재구성).',
      '지각 두께: 지표 높이에서 에어리 지각평형으로 계산한 모형값입니다(해수면에서 35 km, 밀도 2.8/3.3/1.03). PaleoDEM이 −1000 m보다 얕으면 대륙 지각, −2000 m보다 깊으면 7 km 해양 지각으로 보고 그 사이는 섞습니다. 대륙 가장자리의 얇아진 지각과 퇴적층은 표현하지 못합니다.',
      'Merdith 2021의 "Ross Orogen" 대륙 다각형은 410 Ma부터만 있어, 캄브리아기에는 모델이 남극종단산맥 가장자리를 동남극 대륙 지각 밖에 둡니다. 흰 점선이 그 경계입니다. PaleoDEM은 같은 곳에 얕은 대륙붕을 둡니다.',
      '섭입대와 맨틀 흐름: Merdith 2021의 섭입대가 단면을 지나는 곳에 45° 직선 슬랩을 그리고, 그 주위 맨틀 흐름을 코너 흐름 해석해(Batchelor 1967, McKenzie 1969)로 그립니다. 속도는 모델의 수렴 속도에 비례합니다. 실제 맨틀 모형이 아닙니다.',
      '해구와 지형의 어긋남: 해구는 Merdith 2021, 지형은 PALEOMAP 위의 PaleoDEM이라 두 복원의 대륙 가장자리가 다릅니다. 해구 자리의 PaleoDEM이 −500 m보다 얕으면(대륙붕·육지) 그 구간을 빨갛게 그립니다. "해구를 PaleoDEM 지형에 맞추기"를 켜면 줄마다 가장 가까운 −2,000 m 선(사면 발치, 육지 쪽이 얕은 곳, 1,000 km 안)으로 옮기고 앞뒤 3줄로 고르게 합니다. 이 위치는 해석입니다.',
      '암석권 두께(대륙 160 km, 해양 90 km)는 모식값입니다.',
    ],
    period: '{epoch}',
    epochs: {
      ediacaran: '에디아카라기', terreneuvian: '캄브리아기 · 테레뉴브세', series2: '캄브리아기 · 제2세',
      miaolingian: '캄브리아기 · 먀오링세', furongian: '캄브리아기 · 푸룽세',
      earlyOrdovician: '오르도비스기 · 전기', middleOrdovician: '오르도비스기 · 중기',
    },
    loading: '불러오는 중…', error: '자료를 불러오지 못했거나 서로 맞지 않습니다. 새로고침(Ctrl+F5)해 보세요.',
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
    columnObserved: 'Observed · Myrow et al. 2002, revised', columnModel: 'PaleoDEM setting',
    colInboard: '← inboard (continent)', colOutboard: 'outboard →', colTop: 'C–O?', interpSuffix: ' (interpretation)', belowView: 'before {age} Ma',
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
    trenchEased: 'In the model the trench moves about {km} km (along its length) at once between {from} and {to} Ma; the screen eases each point of the line over 5 Myr either side (interpolation).',
    showLimestone: 'Shackleton Limestone', limestoneThickness: 'Thickness', closeUp: 'Zoom to Shackleton', whole: 'Whole block',
    resetBox: 'Reset box', boxHint: 'Drag the yellow dots on the box sides to move those faces: in to narrow the box, out to widen it up to about 670 km beyond the first box on every side. The front face is the section.',
    faceAt: 'Front section', faceAtValue: '{km} km in from A–A′', faceAtOut: '{km} km out from A–A′',
    showOutcrops: 'Lower and upper Byrd Group (GeoMAP)',
    byrdLowerKm: 'Lower', byrdUpperKm: 'Upper',
    outcropNote: 'The Byrd Group outcrops of SCAR GeoMAP v2022-08 (Cox et al. 2023, 1:250 000), gathered into the section grid’s cells (about 28 km): a cell with any outcrop at all is filled whole. The lower Byrd Group (light blue) is the Shackleton Limestone; the upper (orange) the Starshot Formation and Douglas Conglomerate; cells of Byrd Group not divided are taken to hold both, and where the upper crops out the lower is taken to lie beneath it. The lower is laid down evenly over 525–512 Ma and the upper over 511–485 Ma; on the front section the upper is added on top of the lower already there (the surface stays at PaleoDEM’s height and the pile builds downward). Units already laid down are strong, those still to come faint. Today’s outcrop is what later erosion and thrusting (sheets stacked over each other) left, so the units were laid down over a wider area: carried back with East Antarctica (plate 802), every cell the outcrop reaches is taken to hold the unit throughout (an approximation). The thicknesses are a sketch: the lower is the Shackleton Limestone’s thickness, and no measured thickness was found for the upper, so it is a chosen value.',
    lgByrdLower: 'Lower Byrd Group (Shackleton Limestone) · 525–512 Ma', lgByrdUpper: 'Upper Byrd Group (Starshot Formation, Douglas Conglomerate) · 511–485 Ma',
    lgByrdNotYet: 'Faint cells: not yet laid down',
    byrdLabel: 'Byrd Group · lower {lower} km{upper} (sketch)', byrdUpperPart: ' + upper {km} km', byrdNotYet: 'Byrd Group area (not yet laid down)',
    outcropSections: 'Measured sections S1, S2, HR (Myrow 2002)',
    showGeology: 'Rock by age (GeoMAP)',
    geologyNote: 'Rock exposed today, in the simplified classes (SIMPCODE) of SCAR GeoMAP v2022-08 (Cox et al. 2023), coloured in order of when it formed. Each cell of the section grid (about 28 km) is filled whole with the colour of the rock exposed over most of it (any rock at all is shown); moraine, ice and unclassified rock are left out. Greyed colours are rock that did not yet exist at the age on screen (the Beacon Supergroup, the Ferrar, …). The places are today’s, carried with East Antarctica (plate 802), not where the rock was at the time. Most of the continent is under ice, so what is exposed lies mostly in the mountains.',
    lgGeologyLater: 'Greyed: rock not yet formed at this age',
    fitTrench: 'Fit the trench to PaleoDEM relief (interpretation)',
    fitNote: 'Moves the trench, row by row, to the nearest PaleoDEM −2,000 m contour (the foot of the slope). The moved position is an interpretation; subduction polarity, timing and convergence stay Merdith 2021’s. The grey dashed line is Merdith’s own trench.',
    mismatchNote: 'The trench comes from Merdith 2021, the relief from PaleoDEM (PALEOMAP). The two reconstructions put the margin in different places, so the red stretches of trench lie on PaleoDEM shelf or land.',
    lgMismatch: 'Trench on PaleoDEM shelf or land (the two models disagree)', lgMerdithTrench: 'Merdith 2021’s own trench',
    nowSite: 'At the trench', nowSiteMerdith: 'At Merdith’s trench', siteValue: 'PaleoDEM {m} m', siteShelf: 'PaleoDEM {m} m · shelf (models disagree)', siteLand: 'PaleoDEM {m} m · land (models disagree)',
    nowFoot: 'Slope foot', footValue: '{km} km to the PaleoDEM −2,000 m contour',
    nowShare: 'Disagreement', shareValue: '{p}% of Merdith’s trench in the box lies on PaleoDEM shelf or land',
    nowFitted: 'Trench position', fittedValue: 'fitted to PaleoDEM −2,000 m · {km} km from Merdith’s trench',
    fittedNone: 'no −2,000 m contour to fit in this row: Merdith’s position',
    interpBadge: 'Interpretation',
    limestoneLabel: 'Shackleton Limestone · {km} km so far (sketch)', limestoneNotYet: 'Shackleton Limestone area (not yet laid down)',
    slabLabel: 'Subducting plate (slab, sketch)', wedgeLabel: 'Mantle-wedge flow (sketch)', underLabel: 'Flow under the slab (sketch)',
    globeCaption: 'Globe · Merdith 2021 · {age} Ma', boxNote: 'Red box: this block. Drag to turn, wheel to zoom, double-click to reset, top-left corner to resize.',
    sourceHeading: 'Data and methods',
    methods: [
      'The block is a grid fixed to East Antarctica (plate 802 of Merdith 2021). At each age, the Merdith 2021 frame tells whose rock is at each grid point.',
      'Surface height: PaleoDEM (Scotese & Wright 2018) carried into Merdith coordinates. Continental crust is followed as rock through the PALEOMAP plate model; ocean is read relative to East Antarctica; between the 5 Myr grids the heights are interpolated in time (reconstruction).',
      'Crustal thickness: a model value from the surface height by Airy isostasy (35 km at sea level; densities 2.8/3.3/1.03). Shallower than −1000 m counts as continental crust, deeper than −2000 m as 7 km oceanic crust, blended between. Thinned margins and sediment are not represented.',
      'Merdith 2021’s “Ross Orogen” continental polygon only exists from 410 Ma, so in the Cambrian the model leaves the Transantarctic margin outside East Antarctica’s crust; the dashed white line marks that edge. PaleoDEM puts a shallow shelf there.',
      'Slab and mantle flow: a straight 45° slab where Merdith 2021’s subduction zone crosses the section, and the mantle flow around it from the analytic corner-flow solution (Batchelor 1967; McKenzie 1969), scaled by the model’s convergence rate. Not a mantle model.',
      'Trench and relief disagree: the trench is Merdith 2021’s, the relief PaleoDEM’s on PALEOMAP, and the two put the margin in different places. Where PaleoDEM at the trench is shallower than −500 m (shelf or land) that stretch is drawn red. “Fit the trench to PaleoDEM relief” moves it, row by row, to the nearest −2,000 m contour (the slope foot, shallow side towards the overriding plate, within 1,000 km), smoothed over 3 rows either side. That position is an interpretation.',
      'Lithosphere thickness (160 km continental, 90 km oceanic) is schematic.',
    ],
    period: '{epoch}',
    epochs: {
      ediacaran: 'Ediacaran', terreneuvian: 'Cambrian · Terreneuvian', series2: 'Cambrian · Series 2',
      miaolingian: 'Cambrian · Miaolingian', furongian: 'Cambrian · Furongian',
      earlyOrdovician: 'Ordovician · Early', middleOrdovician: 'Ordovician · Middle',
    },
    loading: 'Loading…', error: 'The data could not be loaded or does not match. Try reloading (Ctrl+F5).',
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
  shackleton: ASKED.get('shackleton') === '1', limestoneKm: Number(ASKED.get('limestone')) || 2,
  // Trench from Merdith 2021 as it is, or moved onto PaleoDEM's slope foot (?trench=paleodem).
  fit: ASKED.get('trench') === 'paleodem',
  outcrops: ASKED.get('outcrops') === '1',
  // Upper Byrd Group thickness (km, sketch); the lower one is the Shackleton Limestone's (limestoneKm).
  byrdUpperKm: Number(ASKED.get('upper')) || 2,
  geology: ASKED.get('geology') === '1',
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

// Parsed once per hex string; each call hands out a fresh copy.
const parsedColours = new Map();
const colour = (hex) => {
  if (!parsedColours.has(hex)) parsedColours.set(hex, new THREE.Color(hex));
  return parsedColours.get(hex).clone();
};
const top = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
// The top surface is coloured by height per pixel, not per vertex: coloured per vertex, the
// sharp steps of the scale (the coast, the shelf edge) followed the 27.8 km grid's triangles in
// zigzags. The fragment shader reads the heights (a float texture, one texel per grid point),
// interpolates them with Catmull–Rom splines (through every grid point, smooth between; held
// within the four nearest points so they do not overshoot) and looks the colour up in the
// hypsometric scale (a 1D texture). Tints (other continents, the limestone) stay per vertex:
// the vertex colour is the tint and aTint how much of it.
const HYPSO_RANGE = [-6000, 4000];
const hypsoTexture = (() => {
  const n = 4096;
  const data = new Uint8Array(n * 4);
  for (let k = 0; k < n; k++) {
    const height = HYPSO_RANGE[0] + ((k + 0.5) / n) * (HYPSO_RANGE[1] - HYPSO_RANGE[0]);
    data.set([...hypsometric(height).getStyle(THREE.SRGBColorSpace).match(/\d+/g).map(Number), 255], k * 4);
  }
  const texture = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
})();
const heightTexture = new THREE.DataTexture(new Float32Array(1), 1, 1, THREE.RedFormat, THREE.FloatType);
top.material.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, { uHeights: { value: heightTexture }, uHypso: { value: hypsoTexture },
                                   uRange: { value: new THREE.Vector2(...HYPSO_RANGE) } });
  shader.vertexShader = `attribute vec2 aGrid;\nattribute float aTint;\nvarying vec2 vGrid;\nvarying float vTint;\n${
    shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vGrid = aGrid;\n  vTint = aTint;')}`;
  shader.fragmentShader = `uniform sampler2D uHeights;
uniform sampler2D uHypso;
uniform vec2 uRange;
varying vec2 vGrid;
varying float vTint;
float gridHeight(ivec2 p) {
  return texelFetch(uHeights, clamp(p, ivec2(0), textureSize(uHeights, 0) - 1), 0).r;
}
// Catmull–Rom weights for the points at -1, 0, 1, 2 around t in [0, 1).
vec4 catmullRom(float t) {
  float t2 = t * t;
  float t3 = t2 * t;
  return 0.5 * vec4(-t3 + 2.0 * t2 - t, 3.0 * t3 - 5.0 * t2 + 2.0, -3.0 * t3 + 4.0 * t2 + t, t3 - t2);
}
float smoothHeight(vec2 g) {
  vec2 cell = floor(g);
  ivec2 b = ivec2(cell);
  vec4 wx = catmullRom(g.x - cell.x);
  vec4 wy = catmullRom(g.y - cell.y);
  float sum = 0.0;
  for (int j = 0; j < 4; j++) {
    float row = 0.0;
    for (int i = 0; i < 4; i++) row += wx[i] * gridHeight(b + ivec2(i - 1, j - 1));
    sum += wy[j] * row;
  }
  float h00 = gridHeight(b), h10 = gridHeight(b + ivec2(1, 0)), h01 = gridHeight(b + ivec2(0, 1)), h11 = gridHeight(b + ivec2(1, 1));
  return clamp(sum, min(min(h00, h10), min(h01, h11)), max(max(h00, h10), max(h01, h11)));
}
${shader.fragmentShader.replace('#include <color_fragment>', `
  float surfaceHeight = smoothHeight(vGrid);
  vec3 scaleColour = texture2D(uHypso, vec2((surfaceHeight - uRange.x) / (uRange.y - uRange.x), 0.5)).rgb;
  diffuseColor.rgb *= mix(scaleColour, vColor.rgb, vTint);`)}`;
};
// GeoMAP layers as pictures with one texel per grid cell, laid on the top surface: each cell
// (centred on its grid point, like the Shackleton Limestone's area) is filled whole.
function cellOverlay(order, offsetUnits) {
  const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
    map: texture, transparent: true, premultipliedAlpha: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: offsetUnits }));
  mesh.renderOrder = order;
  mesh.visible = false;
  return { mesh, texture, key: '' };
}
// Rock by age, and over it the lower and upper Byrd Group.
const geologyLayer = cellOverlay(1, -4);
const byrdLayer = cellOverlay(2, -8);
const water = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
  color: colour(COLOURS.water), transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
const face = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
const slab = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
// Antarctica as a solid: relief on top, the base of the crust underneath, walls between.
const base = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ color: colour('#8f6f52'), side: THREE.DoubleSide }));
const walls = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
// Below the crust, as translucent solids across the whole box: the mantle lithosphere and
// the mantle under it, each its own colour; and the slab as a 3D sheet under every
// subduction zone in the box.
const translucent = (hex, opacity) => new THREE.MeshLambertMaterial({
  color: colour(hex), transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
const lithosphereSolid = new THREE.Mesh(new THREE.BufferGeometry(), translucent('#9a8c80', 0.55));
const mantleSolid = new THREE.Mesh(new THREE.BufferGeometry(), translucent('#c0582f', 0.35));
// Coloured per vertex: red-tinted where the trench lies on PaleoDEM shelf or land.
const slabSheet = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({
  vertexColors: true, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
const SHEET_COLOUR = '#5b86a8';
const SHEET_MISMATCH = '#b56a6a';
const MISMATCH_COLOUR = '#ff6b6b';
lithosphereSolid.renderOrder = 1;
mantleSolid.renderOrder = 0;
slabSheet.renderOrder = 2;
const box = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
const streamlines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
  color: colour(COLOURS.flow), transparent: true, opacity: 0.22 }));
streamlines.renderOrder = 4;
const boundaryLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }));
const cobLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.012, gapSize: 0.01 }));
// Merdith's own trench, dashed grey, while the trench is fitted to PaleoDEM.
// A vertical scale bar standing beside the box's A′ front corner, in true km (so its
// length on screen grows with the vertical exaggeration).
const scaleBar = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff }));
const SCALE_STEPS = [1, 2, 5, 10, 20, 50, 100, 200];
// The step nearest a quarter of a scene unit tall: 10 km at the default 25×.
const scaleKm = (ve) => SCALE_STEPS.reduce((a, b) => (Math.abs(Math.log((b * ve) / 250)) < Math.abs(Math.log((a * ve) / 250)) ? b : a));
// The Byrd Group's footprint (cells with outcrop), outlined on the surface.
const byrdEdge = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffd59a }));
const BYRD = { lower: { bit: 1, colour: '#5fc8ee' }, upper: { bit: 2, colour: '#f0a04b' }, undivided: { bit: 4 } };
const merdithLine = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xb8b8b8, dashSize: 0.02, gapSize: 0.014 }));
// The Shackleton Limestone's area outlined on the surface.
const limestoneEdge = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff }));
const pin = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 12), new THREE.MeshBasicMaterial({ color: 0xff9f43 }));
pin.rotation.x = Math.PI;
// Tracers fade in and out (alpha in the colour attribute) instead of popping.
const flowPoints = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({
  vertexColors: true, size: 3.2, sizeAttenuation: false, transparent: true }));
face.renderOrder = 1;
slab.renderOrder = 0;
flowPoints.renderOrder = 5;
scene.add(lithosphereSolid, mantleSolid, slabSheet, top, geologyLayer.mesh, byrdLayer.mesh, base, walls, box, water, face, slab, boundaryLines, cobLines, merdithLine, scaleBar, byrdEdge, limestoneEdge, pin, streamlines, flowPoints);

// ---------- data ----------

async function load() {
  const get = (name) => vfetch(`${BASE}${name}`).then((r) => { if (!r.ok) throw new Error(name); return r; });
  const [meta, surface, crust, region, boundaries, lens, rotations] = await Promise.all([
    get('meta.json').then((r) => r.json()), get('surface.bin').then((r) => r.arrayBuffer()),
    get('crust.bin').then((r) => r.arrayBuffer()), get('region.bin').then((r) => r.arrayBuffer()),
    get('boundaries.json').then((r) => r.json()), get('shackleton.bin').then((r) => r.arrayBuffer()),
    vfetch('../data/merdith2021/rotations.json').then((r) => r.json())]);
  const cells = meta.nx * meta.ny;
  // Files from two releases must not be mixed: check the grid sizes agree.
  const expected = meta.ages.length * cells;
  if (surface.byteLength !== expected * 2 || crust.byteLength !== expected || region.byteLength !== expected
      || lens.byteLength !== cells || !meta.outline) {
    throw new Error('mismatch');
  }
  return { meta, surface: new Int16Array(surface), crust: new Uint8Array(crust), region: new Uint8Array(region),
           boundaries, cells, lens: new Uint8Array(lens), merdith: new RotationModel(rotations) };
}

// A cell picture: colour (sRGB bytes, premultiplied by alpha) per grid cell, row j = across.
function paintCell(out, n, c, alpha) {
  const rgb = c.getStyle(THREE.SRGBColorSpace).match(/\d+/g).map(Number);
  out[n * 4] = rgb[0] * alpha;
  out[n * 4 + 1] = rgb[1] * alpha;
  out[n * 4 + 2] = rgb[2] * alpha;
  out[n * 4 + 3] = alpha * 255;
}
function setCells(layer, out, key) {
  const { nx, ny } = state.data.meta;
  layer.texture.image = { data: out, width: nx, height: ny };
  layer.texture.colorSpace = THREE.SRGBColorSpace;
  layer.texture.generateMipmaps = false;
  // Nearest: each cell is one flat colour with a sharp edge halfway between grid points.
  layer.texture.minFilter = THREE.NearestFilter;
  layer.texture.magFilter = THREE.NearestFilter;
  layer.texture.needsUpdate = true;
  layer.key = key;
}
// The layer on the top surface: same triangles, each grid point at the middle of its texel.
function layOnTop(layer, pos, index) {
  const { nx, ny } = state.data.meta;
  if (!layer.uv) {
    layer.uv = new Float32Array(nx * ny * 2);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        layer.uv[(j * nx + i) * 2] = (i + 0.5) / nx;
        layer.uv[(j * nx + i) * 2 + 1] = (j + 0.5) / ny;
      }
    }
  }
  setGeometry(layer.mesh, pos, null, index);
  layer.mesh.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(layer.uv, 2));
}

// When each class's rock formed, against the age on screen: 'later' (not yet), else shown.
function geologyStates(age) {
  return state.data.meta.geology.classes.map((c) => (age > c.age[0] ? 'later' : age >= c.age[1] ? 'forming' : 'formed'));
}

// Rock by age: each cell (meta.geology.cells: i, j, class, rock km²) in its class's colour,
// greyed while that rock is still to come.
function colourGeology(states) {
  const key = states.join();
  if (key === geologyLayer.key) return;
  const { nx, ny, geology } = state.data.meta;
  const grey = colour('#9a9a9a');
  const palette = new Map(geology.classes.map((c, k) => {
    const later = states[k] === 'later';
    const c3 = colour(c.colour);
    if (later) c3.lerp(grey, 0.7);
    return [c.index, { c: c3, alpha: later ? 0.45 : 0.9 }];
  }));
  const out = new Uint8Array(nx * ny * 4);
  for (const [i, j, k] of geology.cells) {
    const entry = palette.get(k);
    if (entry) paintCell(out, j * nx + i, entry.c, entry.alpha);
  }
  setCells(geologyLayer, out, key);
}

// The Byrd Group per cell (meta.outcrops.cells: i, j, bits). Where the upper crops out the
// lower lies beneath it; a cell of Byrd Group not divided holds both.
let byrdBits = null;
function byrdAt(n) {
  if (!byrdBits) {
    const { nx, ny, outcrops } = state.data.meta;
    byrdBits = new Uint8Array(nx * ny);
    for (const [i, j, bits] of outcrops.cells) byrdBits[j * nx + i] = bits;
  }
  const bits = byrdBits[n];
  return { lower: bits !== 0, upper: (bits & (BYRD.upper.bit | BYRD.undivided.bit)) !== 0 };
}
// How much of each is laid down at the age on screen (0–1), evenly over its span.
function byrdGrowth() {
  const u = state.data.meta.outcrops.units;
  const lower = u.shackleton.age;
  const upper = [Math.max(u.starshot.age[0], u.douglas.age[0]), Math.min(u.starshot.age[1], u.douglas.age[1])];
  const grown = ([a, b]) => Math.min(1, Math.max(0, (a - state.age) / (a - b)));
  return { lower, upper, gl: grown(lower), gu: grown(upper) };
}
// Each cell in the colour of the youngest unit already laid down there; faint before any.
function colourByrd() {
  const { gl, gu } = byrdGrowth();
  const key = gu > 0 ? 'upper' : gl > 0 ? 'lower' : 'none';
  if (key === byrdLayer.key) return;
  const { nx, ny, outcrops } = state.data.meta;
  const [lowerColour, upperColour] = [colour(BYRD.lower.colour), colour(BYRD.upper.colour)];
  const faint = lowerColour.clone().lerp(colour('#9a9a9a'), 0.5);
  const out = new Uint8Array(nx * ny * 4);
  for (const [i, j] of outcrops.cells) {
    const n = j * nx + i;
    const units = byrdAt(n);
    if (units.upper && gu > 0) paintCell(out, n, upperColour, 0.9);
    else if (gl > 0) paintCell(out, n, lowerColour, 0.9);
    else paintCell(out, n, faint, 0.35);
  }
  setCells(byrdLayer, out, key);
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
  if (mesh.isMesh) g.computeVertexNormals();
  mesh.geometry = g;
  return g;
}

// Cell by cell along a row: each grid point's value held flat over its cell (halfway to the
// next point), so a band drawn on these steps has straight sides at the cell edges. The surface
// is kept as it is, with points at the cell edges between.
function cellSteps(xs, surface, values) {
  const out = { xs: [], surface: [], values: values.map(() => []) };
  const last = xs.length - 1;
  for (let n = 0; n <= last; n++) {
    const left = n > 0 ? [(xs[n - 1] + xs[n]) / 2, (surface[n - 1] + surface[n]) / 2] : null;
    const right = n < last ? [(xs[n] + xs[n + 1]) / 2, (surface[n] + surface[n + 1]) / 2] : null;
    for (const point of [left, [xs[n], surface[n]], right]) {
      if (!point) continue;
      out.xs.push(point[0]);
      out.surface.push(point[1]);
      values.forEach((v, k) => out.values[k].push(v[n]));
    }
  }
  return out;
}

// A band between two curves along the section face (z = 0), coloured per column.
// With `cut`, each quad goes through it instead (to leave out the slab).
function band(out, xs, upper, lower, colourAt, z = 0.0005, cut = null) {
  for (let i = 0; i < xs.length - 1; i++) {
    const c0 = colourAt(i);
    const c1 = colourAt(i + 1);
    const quad = [[xs[i], upper[i], c0], [xs[i + 1], upper[i + 1], c1], [xs[i + 1], lower[i + 1], c1], [xs[i], lower[i], c0]];
    if (cut) { cut(quad.map(([x, y, c]) => ({ p: [x, y, z], c: [c.r, c.g, c.b] })), out); continue; }
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

// The trench on the line, eased in time. Between Myr frames it is interpolated; where the
// model moves it by more than 100 km from one Myr to the next (491→490 Ma here, about
// 440 km), the move is spread over 10 Myr centred on the step. That migration is the
// screen's interpolation, not the model's, and the page says so while it runs.
const JUMP_KM = 100;
const JUMP_WINDOW = 5;

// A value per Myr frame (or null), read at a fractional age: linear between frames, and
// across a step larger than JUMP_KM eased over JUMP_WINDOW Myr either side of it.
function eased(series, age) {
  const { ages } = state.data.meta;
  const at = (a) => {
    const position = ages[0] - a;
    const k0 = Math.max(0, Math.min(ages.length - 1, Math.floor(position)));
    const k1 = Math.min(ages.length - 1, k0 + 1);
    const v0 = series[k0];
    const v1 = series[k1];
    if (v0 === null || v1 === null) return v0 ?? v1;
    return v0 + (v1 - v0) * (position - k0);
  };
  for (let k = 0; k + 1 < ages.length; k++) {
    const v0 = series[k];
    const v1 = series[k + 1];
    if (v0 === null || v1 === null || Math.abs(v1 - v0) < JUMP_KM) continue;
    const middle = (ages[k] + ages[k + 1]) / 2;
    if (Math.abs(age - middle) > JUMP_WINDOW) continue;
    const before = at(middle + JUMP_WINDOW);
    const after = at(middle - JUMP_WINDOW);
    if (before === null || after === null) break;
    const f = (middle + JUMP_WINDOW - age) / (2 * JUMP_WINDOW);
    return { value: before + (after - before) * f * f * (3 - 2 * f), jump: { from: ages[k], to: ages[k + 1], km: Math.round(Math.abs(v1 - v0)) } };
  }
  return { value: at(age), jump: null };
}

// Per block row: the main trench's along-position and the direction to its overriding side,
// each eased in time, so the whole trench line moves smoothly.
let rowSeries = null;
function trenchRows(age) {
  const { meta, boundaries } = state.data;
  if (!rowSeries) {
    rowSeries = [];
    for (let j = 0; j < meta.ny; j++) {
      const pick = (c) => meta.ages.map((a) => boundaries[String(a)]?.rows?.[j]?.[c] ?? null);
      rowSeries.push({ a: pick(0), na: pick(1), nb: pick(2) });
    }
  }
  let jump = null;
  const [a0, a1] = meta.along_km;
  const rows = rowSeries.map((r) => {
    const a = eased(r.a, age);
    if (a.value === null) return null;
    if (a.value < a0 || a.value > a1) return null; // outside the box
    if (a.jump) {
      // How far the model moves the trench in that one step varies along it: keep the range.
      jump = jump ? { ...jump, min: Math.min(jump.min, a.jump.km), max: Math.max(jump.max, a.jump.km) }
                  : { ...a.jump, min: a.jump.km, max: a.jump.km };
    }
    const na = eased(r.na, age).value;
    const nb = eased(r.nb, age).value;
    const len = Math.hypot(na, nb) || 1;
    return { a: a.value, na: na / len, nb: nb / len };
  });
  return { rows, jump };
}

function displayTrench(age) {
  const frame = trenchInBlock(age);
  if (!frame) return null;
  const { rows, jump } = trenchRows(age);
  const line = rows[lineRow()];
  const s = line ? line.a : frame.s_km;
  return { ...frame, s_km: s, transition: jump, rows };
}

// Where Merdith's trench sits on PaleoDEM, row by row (trenchfit.js): the height there,
// whether that is shelf or land, and the distance to PaleoDEM's slope foot.
const columnOf = (a) => (a - state.data.meta.along_km[0]) / state.data.meta.step_km;
function trenchSites(trench, h, j0, j1) {
  const { nx, step_km: step } = state.data.meta;
  const rows = [];
  let on = 0;
  let shallow = 0;
  for (let j = 0; j < (trench?.rows.length ?? 0); j++) {
    const r = trench.rows[j];
    if (!r || j < j0 || j > j1) { rows.push(null); continue; }
    const heights = h.subarray(j * nx, (j + 1) * nx);
    const col = columnOf(r.a);
    const height = heightAt(heights, col);
    const foot = r.na ? slopeFoot(heights, col, Math.sign(r.na), { window: 1000 / step }) : null;
    const mismatch = height > MISMATCH_M;
    rows.push({ height, mismatch, footKm: foot === null ? null : (foot - col) * step });
    on++;
    if (mismatch) shallow++;
  }
  return { rows, share: on ? shallow / on : 0 };
}

// The trench moved onto PaleoDEM's slope foot (an interpretation), smoothed across rows.
function fitTrench(trench, sites) {
  const shift = smoothRows(sites.rows.map((s) => (s ? s.footKm : null)), 3);
  const rows = trench.rows.map((r, j) => (r && sites.rows[j] && shift[j] !== null
    ? { ...r, a: r.a + shift[j], shift: shift[j] } : r));
  const line = rows[lineRow()];
  return { ...trench, rows, s_km: line ? line.a : trench.s_km, fitted: true };
}

// The box the viewer has cut: columns i0..i1 along A–A′, rows j0..j1 across. The front
// row j0 is the section face. The data grid reaches some way beyond the A–A′ box
// (meta.box, what the page opens with), so the box can be widened as well as narrowed.
// Kept in the address as ?box=i0,i1,j0,j1, counted from A (column) and the line (row), so
// negative numbers reach outside the A–A′ box.
const MIN_COLUMNS = 8;
const MIN_ROWS = 4;
const defaultBox = () => {
  const { meta } = state.data;
  return meta.box ?? { i0: 0, i1: meta.nx - 1, j0: 0, j1: meta.ny - 1 };
};
// The row on the line A–A′, and the locality's column.
const lineRow = () => defaultBox().j0;
const localityColumn = () => Math.round((0 - state.data.meta.along_km[0]) / state.data.meta.step_km);
function cropOf() {
  const { nx, ny } = state.data.meta;
  if (!state.crop) {
    const home = defaultBox();
    const asked = (ASKED.get('box') || '').split(',').map(Number);
    state.crop = asked.length === 4 && asked.every(Number.isFinite)
      ? { i0: asked[0] + home.i0, i1: asked[1] + home.i0, j0: asked[2] + home.j0, j1: asked[3] + home.j0 } : { ...home };
  }
  const c = state.crop;
  c.i0 = Math.max(0, Math.min(nx - 1 - MIN_COLUMNS, Math.round(c.i0)));
  c.i1 = Math.max(c.i0 + MIN_COLUMNS, Math.min(nx - 1, Math.round(c.i1)));
  c.j0 = Math.max(0, Math.min(ny - 1 - MIN_ROWS, Math.round(c.j0)));
  c.j1 = Math.max(c.j0 + MIN_ROWS, Math.min(ny - 1, Math.round(c.j1)));
  return c;
}
function keepBox() {
  const home = defaultBox();
  const c = state.crop;
  const params = new URLSearchParams(location.search);
  if (c.i0 === home.i0 && c.i1 === home.i1 && c.j0 === home.j0 && c.j1 === home.j1) params.delete('box');
  else params.set('box', [c.i0 - home.i0, c.i1 - home.i0, c.j0 - home.j0, c.j1 - home.j0].join(','));
  history.replaceState(null, '', `?${params}`);
}

// Handles in the middle of the four side faces: drag one to move that face. Lit balls, set
// partly into the face and depth-tested like the rest: the part inside the box is hidden by
// opaque rock, and seen through translucent layers (mantle, sea) it is shaded by them.
const handleGroup = new THREE.Group();
const handleShape = new THREE.SphereGeometry(0.035, 32, 20);
const handleMaterial = new THREE.MeshPhongMaterial({ color: 0xffd23f, specular: 0x777766, shininess: 60, emissive: 0x6a4f00 });
const handles = {};
for (const side of ['front', 'back', 'left', 'right']) {
  const mesh = new THREE.Mesh(handleShape, handleMaterial);
  mesh.userData.side = side;
  handles[side] = mesh;
  handleGroup.add(mesh);
}
scene.add(handleGroup);
const handleBox = new THREE.Box3();
function placeHandles(x0, x1, zf, zb, bottom) {
  handleBox.min.set(x0, bottom, zb);
  handleBox.max.set(x1, 0, zf);
  const y = bottom / 2;
  handles.front.position.set((x0 + x1) / 2, y, zf + 0.02);
  handles.back.position.set((x0 + x1) / 2, y, zb - 0.02);
  handles.left.position.set(x0 - 0.02, y, (zf + zb) / 2);
  handles.right.position.set(x1 + 0.02, y, (zf + zb) / 2);
}
// A handle the box stands in front of is hidden: the line from the camera to it passes
// through the box first. Hidden handles are neither drawn nor picked.
const sightRay = new THREE.Ray();
const sightHit = new THREE.Vector3();
function showHandles() {
  for (const m of Object.values(handles)) {
    const distance = camera.position.distanceTo(m.position);
    sightRay.origin.copy(camera.position);
    sightRay.direction.subVectors(m.position, camera.position).normalize();
    const hit = sightRay.intersectBox(handleBox, sightHit);
    m.visible = !hit || camera.position.distanceTo(hit) > distance - 1e-6;
  }
}
const shownHandles = () => Object.values(handles).filter((m) => m.visible);

{
  const ray = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  let dragging = null;
  let pending = false;
  const ndc = (event) => {
    const r = canvas.getBoundingClientRect();
    pointerNdc.set(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(pointerNdc, camera);
  };
  // Capture on the document so OrbitControls on the canvas never sees a handle drag.
  document.addEventListener('pointerdown', (event) => {
    if (event.target !== canvas || !state.data) return;
    ndc(event);
    const hit = ray.intersectObjects(shownHandles())[0];
    if (!hit) return;
    event.stopPropagation();
    event.preventDefault();
    controls.enabled = false;
    canvas.setPointerCapture(event.pointerId);
    const side = hit.object.userData.side;
    dragging = { side, plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.object.position.y) };
    document.body.style.cursor = side === 'left' || side === 'right' ? 'ew-resize' : 'ns-resize';
  }, { capture: true });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) {
      if (!state.data) return;
      ndc(event);
      const over = ray.intersectObjects(shownHandles())[0];
      canvas.style.cursor = over ? 'grab' : '';
      for (const m of Object.values(handles)) m.scale.setScalar(m === over?.object ? 1.4 : 1);
      return;
    }
    ndc(event);
    const point = new THREE.Vector3();
    if (!ray.ray.intersectPlane(dragging.plane, point)) return;
    const { meta } = state.data;
    const i = (point.x * 1000 - meta.along_km[0]) / meta.step_km;
    const j = (-point.z * 1000 - meta.across_km[0]) / meta.step_km;
    const c = state.crop;
    if (dragging.side === 'front') c.j0 = Math.min(j, c.j1 - MIN_ROWS);
    if (dragging.side === 'back') c.j1 = Math.max(j, c.j0 + MIN_ROWS);
    if (dragging.side === 'left') c.i0 = Math.min(i, c.i1 - MIN_COLUMNS);
    if (dragging.side === 'right') c.i1 = Math.max(i, c.i0 + MIN_COLUMNS);
    if (!pending) {
      pending = true;
      requestAnimationFrame(() => { pending = false; update(); });
    }
  });
  const end = () => {
    if (!dragging) return;
    dragging = null;
    controls.enabled = true;
    document.body.style.cursor = '';
    keepBox();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

let flow = null;
function update() {
  const data = state.data;
  if (!data) return;
  const { meta } = data;
  const { nx, ny } = meta;
  const crop = cropOf();
  const { i0: ci0, i1: ci1, j0: cj0, j1: cj1 } = crop;
  const h = heightsAt(state.age);
  const depth = depthShownKm(state.ve);
  const bottom = yOf(-depth);
  const merdithTrench = displayTrench(state.age);
  const sites = trenchSites(merdithTrench, h, cj0, cj1);
  const trench = state.fit && merdithTrench ? fitTrench(merdithTrench, sites) : merdithTrench;
  state.trench = trench;
  state.sites = sites;
  const k = Math.max(0, Math.min(meta.ages.length - 1, Math.round(meta.ages[0] - state.age)));

  // The main slab, row by row: where the eased trench crosses the row, the way to its
  // overriding side, and the sea floor's depth there (the slab starts on the sea floor).
  // Every layer is cut away where the slab passes, and the slab drawn in the gap.
  const slabRows = new Array(ny).fill(null);
  if (trench) {
    const [ka, kb] = [xAt(ci0) * 1000, xAt(ci1) * 1000];
    for (let j = cj0; j <= cj1; j++) {
      const r = trench.rows[j];
      if (!r || r.a < ka || r.a > kb) continue;
      const iT = Math.max(0, Math.min(nx - 1, Math.round((r.a - meta.along_km[0]) / meta.step_km)));
      slabRows[j] = { ...r, b: meta.across_km[0] + j * meta.step_km, top: Math.max(0, -h[j * nx + iT] / 1000) };
    }
  }
  // A point in the scene → its slab coordinates, or null where its row has no slab.
  const slabF = (x, y, z, row) => {
    const r = slabRows[row ?? Math.round((-z * 1000 - meta.across_km[0]) / meta.step_km)];
    if (!r) return null;
    const s = (x * 1000 - r.a) * r.na + (-z * 1000 - r.b) * r.nb;
    return slabUV(s, (-y * 1000) / state.ve - r.top, SLAB_DIP);
  };
  const OUTSIDE = outsidePieces(SLAB_KM);
  const vtx = (p, c = null, row = undefined) => ({ p, c, f: slabF(p[0], p[1], p[2], row) });
  const cutInto = (poly, positions, colours, pieces = OUTSIDE) => carve(poly, pieces, (a, b, c) => {
    for (const v of [a, b, c]) {
      positions.push(v.p[0], v.p[1], v.p[2]);
      if (colours) colours.push(v.c[0], v.c[1], v.c[2]);
    }
  });
  const other = (n) => data.region[k * data.cells + n] === 2;
  const inCrop = (i, j) => i >= ci0 && i <= ci1 && j >= cj0 && j <= cj1;

  // Shackleton Limestone: laid down evenly over 525–512 Ma (sketch), lens weight from the build.
  const [lsStart, lsEnd] = [525, 512];
  const grown = Math.min(1, Math.max(0, (lsStart - state.age) / (lsStart - lsEnd)));
  const limestone = colour('#bdeef7');
  state.limestone = { grown };

  // One crust solid for the box: relief on top, the Airy/oceanic base beneath, walls where
  // the box cuts it. Other continents are tinted grey so Antarctica stands out.
  // Per grid point, filled only inside the box (the grid reaches beyond it).
  const pos = new Float32Array(nx * ny * 3);
  const col = new Float32Array(nx * ny * 3);
  const tint = new Float32Array(nx * ny);
  const low = new Float32Array(nx * ny * 3);
  const crustColour = new Float32Array(nx * ny * 3);
  const [oceanicColour, continentalColour, otherColour] = [colour(COLOURS.oceanic), colour(COLOURS.continental), colour('#8b8a86')];
  const set3 = (array, n, a, b, c) => { array[n * 3] = a; array[n * 3 + 1] = b; array[n * 3 + 2] = c; };
  for (let j = cj0; j <= cj1; j++) {
    for (let i = ci0; i <= ci1; i++) {
      const n = j * nx + i;
      const height = h[n];
      set3(pos, n, xAt(i), yOf(height / 1000), zAt(j));
      set3(low, n, xAt(i), Math.max(bottom, yOf(height / 1000 - crustKm(height))), zAt(j));
      const cc = oceanicColour.clone().lerp(continentalColour, continentalShare(height));
      set3(crustColour, n, cc.r, cc.g, cc.b);
      // The tints over the height colour (drawn in the shader): grey for other continents,
      // then the limestone; as one colour and how much of it.
      const w = data.lens[n] / 255;
      const a1 = other(n) && height > -1000 ? 0.6 : 0;
      const a2 = state.shackleton && w > 0 ? (grown > 0 ? 0.85 : 0.45) : 0;
      const amount = 1 - (1 - a1) * (1 - a2);
      tint[n] = amount;
      if (amount > 0) {
        const c = otherColour.clone().multiplyScalar(a1 * (1 - a2)).add(limestone.clone().multiplyScalar(a2)).multiplyScalar(1 / amount);
        set3(col, n, c.r, c.g, c.b);
      }
    }
  }
  const index = [];
  const lowIndex = [];
  for (let j = cj0; j < cj1; j++) {
    for (let i = ci0; i < ci1; i++) {
      const a = j * nx + i;
      index.push(a, a + 1, a + nx, a + 1, a + nx + 1, a + nx);
      lowIndex.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
    }
  }
  const gridIndex = index;
  // The box's walls: its back row and its two ends (the front row is the section face,
  // drawn with its own layers).
  const rim = [];
  for (let i = ci0; i < ci1; i++) rim.push([cj1 * nx + i, cj1 * nx + i + 1]);
  for (let j = cj0; j < cj1; j++) rim.push([j * nx + ci0, (j + 1) * nx + ci0], [j * nx + ci1, (j + 1) * nx + ci1]);
  setGeometry(top, pos, col, index);
  if (!state.gridCoords) {
    state.gridCoords = new Float32Array(nx * ny * 2);
    for (let n = 0; n < nx * ny; n++) { state.gridCoords[n * 2] = n % nx; state.gridCoords[n * 2 + 1] = Math.floor(n / nx); }
  }
  top.geometry.setAttribute('aGrid', new THREE.Float32BufferAttribute(state.gridCoords, 2));
  top.geometry.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 1));
  heightTexture.image = { data: h, width: nx, height: ny };
  heightTexture.needsUpdate = true;
  // Rock by age and the Byrd Group, cell by cell on the same surface.
  geologyLayer.mesh.visible = Boolean(state.geology && meta.geology?.cells);
  if (geologyLayer.mesh.visible) {
    colourGeology(geologyStates(state.age));
    layOnTop(geologyLayer, pos, index);
  }
  byrdLayer.mesh.visible = Boolean(state.outcrops && meta.outcrops?.cells);
  if (byrdLayer.mesh.visible) {
    colourByrd();
    layOnTop(byrdLayer, pos, index);
  }
  setGeometry(base, low, null, lowIndex);
  const wall = [];
  const wallColours = [];
  for (const [a, b] of rim) {
    const ca = crustColour.slice(a * 3, a * 3 + 3);
    const cb = crustColour.slice(b * 3, b * 3 + 3);
    cutInto([vtx(pos.slice(a * 3, a * 3 + 3), ca), vtx(pos.slice(b * 3, b * 3 + 3), cb),
             vtx(low.slice(b * 3, b * 3 + 3), cb), vtx(low.slice(a * 3, a * 3 + 3), ca)], wall, wallColours);
  }
  setGeometry(walls, wall, wallColours);

  // Mantle lithosphere and mantle as translucent solids inside the box.
  const shareGrid = new Float32Array(nx * ny);
  for (let n = 0; n < nx * ny; n++) shareGrid[n] = continentalShare(h[n]);
  const lithBase = new Float32Array(nx * ny * 3);
  for (let j = cj0; j <= cj1; j++) {
    for (let i = ci0; i <= ci1; i++) {
      let sum = 0;
      let count = 0;
      for (let jj = Math.max(0, j - 3); jj <= Math.min(ny - 1, j + 3); jj++) {
        for (let ii = Math.max(0, i - 3); ii <= Math.min(nx - 1, i + 3); ii++) { sum += shareGrid[jj * nx + ii]; count++; }
      }
      const f = sum / count;
      const crustBase = low[(j * nx + i) * 3 + 1];
      set3(lithBase, j * nx + i, xAt(i), Math.max(bottom, Math.min(crustBase, yOf(-(f * 160 + (1 - f) * 90)))), zAt(j));
    }
  }
  const floor = new Float32Array(nx * ny * 3);
  for (let j = cj0; j <= cj1; j++) for (let i = ci0; i <= ci1; i++) set3(floor, j * nx + i, xAt(i), bottom, zAt(j));
  const solid = (upper, lower) => {
    const p = [];
    for (let t = 0; t < gridIndex.length; t += 3) {
      const tri = [gridIndex[t], gridIndex[t + 1], gridIndex[t + 2]];
      // Most rows have no slab: no need to cut.
      if (tri.every((v) => !slabRows[Math.floor(v / nx)])) {
        for (const v of tri) p.push(lower[v * 3], lower[v * 3 + 1], lower[v * 3 + 2]);
        continue;
      }
      cutInto(tri.map((v) => vtx(lower.slice(v * 3, v * 3 + 3))), p, null);
    }
    const side = (a, b) => {
      const ua = upper.slice(a * 3, a * 3 + 3); const ub = upper.slice(b * 3, b * 3 + 3);
      const la = lower.slice(a * 3, a * 3 + 3); const lb = lower.slice(b * 3, b * 3 + 3);
      cutInto([vtx(ua), vtx(ub), vtx(lb), vtx(la)], p, null);
    };
    for (let i = ci0; i < ci1; i++) side(cj1 * nx + i, cj1 * nx + i + 1);
    for (let j = cj0; j < cj1; j++) { side(j * nx + ci0, (j + 1) * nx + ci0); side(j * nx + ci1, (j + 1) * nx + ci1); }
    return p;
  };
  setGeometry(lithosphereSolid, solid(low, lithBase));
  setGeometry(mantleSolid, solid(lithBase, floor));

  // The Shackleton Limestone's area, outlined, inside the box.
  const outline = [];
  if (state.shackleton) {
    const cellIn = (j, i) => j >= 0 && i >= 0 && j < ny && i < nx && data.lens[j * nx + i] > 0 && inCrop(i, j);
    const half = (xAt(1) - xAt(0)) / 2;
    const halfZ = (zAt(1) - zAt(0)) / 2;
    for (let j = cj0; j <= cj1; j++) {
      for (let i = ci0; i <= ci1; i++) {
        if (!cellIn(j, i)) continue;
        const cx = xAt(i);
        const cz = zAt(j);
        const y = yOf(h[j * nx + i] / 1000) + 0.004;
        const [xl, xr] = [Math.max(xAt(ci0), cx - half), Math.min(xAt(ci1), cx + half)];
        const [zl, zr] = [Math.min(zAt(cj0), cz - halfZ), Math.max(zAt(cj1), cz + halfZ)];
        if (!cellIn(j, i - 1)) outline.push(xl, y, zl, xl, y, zr);
        if (!cellIn(j, i + 1)) outline.push(xr, y, zl, xr, y, zr);
        if (!cellIn(j - 1, i)) outline.push(xl, y, zl, xr, y, zl);
        if (!cellIn(j + 1, i)) outline.push(xl, y, zr, xr, y, zr);
      }
    }
  }
  setGeometry(limestoneEdge, outline);
  // Where to name it: the middle of the part of its area inside the box, on the surface.
  state.limestoneAt = null;
  if (state.shackleton) {
    let [sx, sy, sz, sw] = [0, 0, 0, 0];
    for (let j = cj0; j <= cj1; j++) {
      for (let i = ci0; i <= ci1; i++) {
        const w = data.lens[j * nx + i];
        if (!w) continue;
        sx += xAt(i) * w; sz += zAt(j) * w; sy = Math.max(sy, yOf(h[j * nx + i] / 1000)); sw += w;
      }
    }
    if (sw) state.limestoneAt = [sx / sw, Math.max(0, sy) + 0.07, sz / sw];
  }

  // The Byrd Group's cells inside the box: outlined, and named over their middle with the
  // thickness laid down so far.
  const byrdOutline = [];
  state.outcropLabels = [];
  if (state.outcrops && meta.outcrops?.cells) {
    const [ka, kb] = [xAt(ci0) * 1000, xAt(ci1) * 1000];
    const [kc, kd] = [meta.across_km[0] + cj0 * meta.step_km, meta.across_km[0] + cj1 * meta.step_km];
    const inBox = (a, b) => a >= ka && a <= kb && b >= kc && b <= kd;
    const surfaceAt = (a, b) => {
      const col = Math.max(0, Math.min(nx - 1.001, (a - meta.along_km[0]) / meta.step_km));
      const row = Math.max(0, Math.min(ny - 1.001, (b - meta.across_km[0]) / meta.step_km));
      const [i, j] = [Math.floor(col), Math.floor(row)];
      const [fi, fj] = [col - i, row - j];
      const v = (jj, ii) => h[jj * nx + ii];
      const z = (v(j, i) * (1 - fi) + v(j, i + 1) * fi) * (1 - fj) + (v(j + 1, i) * (1 - fi) + v(j + 1, i + 1) * fi) * fj;
      return Math.max(0, yOf(z / 1000)) + 0.006;
    };
    const cellIn = (j, i) => j >= 0 && i >= 0 && j < ny && i < nx && inCrop(i, j) && byrdAt(j * nx + i).lower;
    const half = (xAt(1) - xAt(0)) / 2;
    const halfZ = (zAt(1) - zAt(0)) / 2;
    let [sumX, sumZ, topY, count, upperHere] = [0, 0, 0, 0, false];
    for (let j = cj0; j <= cj1; j++) {
      for (let i = ci0; i <= ci1; i++) {
        if (!cellIn(j, i)) continue;
        const [cx, cz] = [xAt(i), zAt(j)];
        const y = yOf(h[j * nx + i] / 1000) + 0.005;
        // The cell's edges, cut at the box (its outer cells are half inside).
        const [xl, xr] = [Math.max(xAt(ci0), cx - half), Math.min(xAt(ci1), cx + half)];
        const [zl, zr] = [Math.min(zAt(cj0), cz - halfZ), Math.max(zAt(cj1), cz + halfZ)];
        if (!cellIn(j, i - 1)) byrdOutline.push(xl, y, zl, xl, y, zr);
        if (!cellIn(j, i + 1)) byrdOutline.push(xr, y, zl, xr, y, zr);
        if (!cellIn(j - 1, i)) byrdOutline.push(xl, y, zl, xr, y, zl);
        if (!cellIn(j + 1, i)) byrdOutline.push(xl, y, zr, xr, y, zr);
        sumX += cx; sumZ += cz; topY = Math.max(topY, y); count++;
        upperHere ||= byrdAt(j * nx + i).upper;
      }
    }
    if (count) {
      const { gl, gu } = byrdGrowth();
      const upper = upperHere && gu > 0 ? format(t().byrdUpperPart, { km: (state.byrdUpperKm * gu).toFixed(1) }) : '';
      state.outcropLabels.push({ id: 'outcrop', at: [sumX / count, topY + 0.07, sumZ / count], cls: 'outcrop',
                                 text: gl > 0 ? format(t().byrdLabel, { lower: (state.limestoneKm * gl).toFixed(1), upper }) : t().byrdNotYet });
    }
    const secs = meta.outcrops.sections.filter((x) => inBox(...x.ab));
    if (secs.length) {
      const a = secs.reduce((m, x) => m + x.ab[0], 0) / secs.length;
      const b = secs.reduce((m, x) => m + x.ab[1], 0) / secs.length;
      state.outcropLabels.push({ id: 'outcrop-sections', at: [a / 1000, surfaceAt(a, b) + 0.02, -b / 1000], text: t().outcropSections, cls: 'outcrop sec' });
    }
  }
  setGeometry(byrdEdge, byrdOutline);

  // Sea level and the box, at the box's extent.
  const x0 = xAt(ci0);
  const x1 = xAt(ci1);
  const zf = zAt(cj0);
  const zb = zAt(cj1);
  // The sea as one translucent body: its surface, and on every side of the box (the section
  // face too) the water between sea level and the sea floor. Nothing where the surface is above
  // sea level; a wall piece is cut where the surface crosses it.
  const sea = [x0, 0, zf, x1, 0, zf, x1, 0, zb, x0, 0, zf, x1, 0, zb, x0, 0, zb];
  const front = [];
  for (let i = ci0; i < ci1; i++) front.push([cj0 * nx + i, cj0 * nx + i + 1]);
  for (const [a, b] of [...front, ...rim]) {
    const [xa, ya, za] = pos.slice(a * 3, a * 3 + 3);
    const [xb, yb, zb2] = pos.slice(b * 3, b * 3 + 3);
    if (ya >= 0 && yb >= 0) continue;
    if (ya < 0 && yb < 0) {
      sea.push(xa, 0, za, xb, 0, zb2, xb, yb, zb2, xa, 0, za, xb, yb, zb2, xa, ya, za);
      continue;
    }
    // The surface crosses sea level between a and b: water only on the low side.
    const f = ya / (ya - yb);
    const [xc, zc] = [xa + f * (xb - xa), za + f * (zb2 - za)];
    if (ya < 0) sea.push(xa, 0, za, xc, 0, zc, xa, ya, za);
    else sea.push(xc, 0, zc, xb, 0, zb2, xb, yb, zb2);
  }
  setGeometry(water, sea);
  const corners = [[x0, zf], [x1, zf], [x1, zb], [x0, zb]];
  const frame = [];
  for (let c = 0; c < 4; c++) {
    const [ax, az] = corners[c];
    const [bx, bz] = corners[(c + 1) % 4];
    frame.push(ax, 0, az, bx, 0, bz, ax, bottom, az, bx, bottom, bz, ax, 0, az, ax, bottom, az);
  }
  setGeometry(box, frame);
  placeHandles(x0, x1, zf, zb, bottom);
  {
    const km = scaleKm(state.ve);
    const [x, y0, y1, tick] = [x1 + 0.07, 0, yOf(-km), 0.018];
    setGeometry(scaleBar, [x, y0, zf, x, y1, zf, x - tick, y0, zf, x + tick, y0, zf, x - tick, y1, zf, x + tick, y1, zf]);
    state.scale = { km, at: [x + 0.012, (y0 + y1) / 2, zf] };
  }

  // The section face: the front row of the box (row cj0), from column ci0 to ci1.
  const faceZ = zf;
  const xs = [];
  const surfaceY = [];
  const crustBottomY = [];
  const lithY = [];
  const mantleTopY = [];
  const bottomY = [];
  const share = [];
  const lensRow = [];
  for (let i = ci0; i <= ci1; i++) {
    const height = h[cj0 * nx + i];
    xs.push(xAt(i));
    surfaceY.push(yOf(height / 1000));
    share.push(continentalShare(height));
    crustBottomY.push(Math.max(bottom, yOf(height / 1000 - crustKm(height))));
    lensRow.push(data.lens[cj0 * nx + i] / 255);
  }
  for (let n = 0; n < xs.length; n++) {
    let sum = 0;
    let count = 0;
    for (let m = Math.max(0, n - 6); m <= Math.min(xs.length - 1, n + 6); m++) { sum += share[m]; count++; }
    const f = sum / count;
    lithY.push(Math.max(bottom, Math.min(crustBottomY[n], yOf(-(f * 160 + (1 - f) * 90)))));
    mantleTopY.push(lithY[n]);
    bottomY.push(bottom);
  }
  const out = { p: [], c: [] };
  const faceCut = (poly, o) => cutInto(poly.map((v) => vtx(v.p, v.c, cj0)), o.p, o.c);
  band(out, xs, mantleTopY, bottomY, () => colour(COLOURS.mantleTop).lerp(colour(COLOURS.mantleBottom), Math.min(1, depth / 700)), faceZ + 0.0005, faceCut);
  band(out, xs, crustBottomY, lithY, () => colour(COLOURS.lithosphere), faceZ + 0.0005, faceCut);
  band(out, xs, surfaceY, crustBottomY, (n) => colour(COLOURS.oceanic).lerp(colour(COLOURS.continental), share[n]), faceZ + 0.0005, faceCut);
  if (state.outcrops && meta.outcrops?.cells) {
    // The Byrd Group on the face, cell by cell: the upper on top of the lower laid down
    // before it. The surface stays at PaleoDEM's height; the pile builds downward.
    const { gl, gu } = byrdGrowth();
    const units = xs.map((_, n) => byrdAt(cj0 * nx + ci0 + n));
    const steps = cellSteps(xs, surfaceY, [units.map((u) => (u.upper ? yOf(state.byrdUpperKm * gu) : 0)),
                                           units.map((u) => (u.lower ? yOf(state.limestoneKm * gl) : 0))]);
    const [upperThick, lowerThick] = steps.values;
    const upperBase = steps.surface.map((y, n) => y - upperThick[n]);
    const lowerBase = upperBase.map((y, n) => y - lowerThick[n]);
    if (gl > 0) band(out, steps.xs, upperBase, lowerBase, () => colour(BYRD.lower.colour), faceZ + 0.0007, faceCut);
    if (gu > 0) band(out, steps.xs, steps.surface, upperBase, () => colour(BYRD.upper.colour), faceZ + 0.0007, faceCut);
  } else if (state.shackleton && grown > 0) {
    // The Shackleton Limestone's area alone (the Byrd Group layer, when on, draws it instead).
    const lower = surfaceY.map((y, n) => y - yOf(state.limestoneKm * lensRow[n] * grown));
    band(out, xs, surfaceY, lower, () => limestone, faceZ + 0.0007, faceCut);
  }
  setGeometry(face, out.p, out.c);
  state.profile = { xs, surfaceY, crustBottomY, lithY, bottom, share, z: faceZ };

  // Merdith's continental-crust edge along the face row.
  const cob = [];
  for (let i = ci0; i < ci1; i++) {
    const a = data.crust[k * data.cells + cj0 * nx + i] >= 128;
    const b = data.crust[k * data.cells + cj0 * nx + i + 1] >= 128;
    if (a !== b) {
      const x = (xAt(i) + xAt(i + 1)) / 2;
      cob.push(x, Math.max(surfaceY[i - ci0], 0) + 0.06, faceZ + 0.002, x, Math.max(bottom, yOf(-60)), faceZ + 0.002);
    }
  }
  setGeometry(cobLines, cob).computeBoundingSphere();
  cobLines.computeLineDistances();
  state.cob = cob.length ? cob[0] : null;

  // Plate boundaries on the top surface, inside the box.
  const rowB = (j) => meta.across_km[0] + j * meta.step_km;
  const [ka0, ka1] = [x0 * 1000, x1 * 1000];
  const [kb0, kb1] = [rowB(cj0), rowB(cj1)];
  const inside = (a, b) => a >= ka0 && a <= ka1 && b >= kb0 && b <= kb1;
  const lines = [];
  const lineColours = [];
  const boundaryFrame_ = data.boundaries[String(Math.round(state.age))];
  if (state.boundaries && boundaryFrame_) {
    for (const piece of boundaryFrame_.pieces) {
      if (piece.main) continue; // drawn from the eased rows below
      const c = colour('#' + KINDS[piece.k].toString(16).padStart(6, '0'));
      for (let n = 0; n + 3 < piece.xy.length; n += 2) {
        if (!inside(piece.xy[n], piece.xy[n + 1]) || !inside(piece.xy[n + 2], piece.xy[n + 3])) continue;
        lines.push(piece.xy[n] / 1000, 0.004, -piece.xy[n + 1] / 1000, piece.xy[n + 2] / 1000, 0.004, -piece.xy[n + 3] / 1000);
        lineColours.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
  }
  const rowsIn = (j) => trench && j >= cj0 && j <= cj1 && trench.rows[j] && inside(trench.rows[j].a, rowB(j));
  // Where Merdith's trench lies on PaleoDEM shelf or land, the two models disagree: drawn
  // red (unless the trench has been fitted to PaleoDEM).
  const mismatchRow = (j) => !trench?.fitted && Boolean(sites.rows[j]?.mismatch);
  if (state.boundaries && trench) {
    const c = colour('#' + KINDS.subduction.toString(16).padStart(6, '0'));
    const red = colour(MISMATCH_COLOUR);
    for (let j = cj0; j < cj1; j++) {
      if (!rowsIn(j) || !rowsIn(j + 1)) continue;
      const p = trench.rows[j];
      const q = trench.rows[j + 1];
      const lc = mismatchRow(j) || mismatchRow(j + 1) ? red : c;
      lines.push(p.a / 1000, 0.004, -rowB(j) / 1000, q.a / 1000, 0.004, -rowB(j + 1) / 1000);
      lineColours.push(lc.r, lc.g, lc.b, lc.r, lc.g, lc.b);
    }
  }
  setGeometry(boundaryLines, lines, lineColours);
  const own = [];
  if (state.boundaries && trench?.fitted) {
    const inBox = (j) => j >= cj0 && j <= cj1 && merdithTrench.rows[j] && inside(merdithTrench.rows[j].a, rowB(j));
    for (let j = cj0; j < cj1; j++) {
      if (!inBox(j) || !inBox(j + 1)) continue;
      own.push(merdithTrench.rows[j].a / 1000, 0.006, -rowB(j) / 1000, merdithTrench.rows[j + 1].a / 1000, 0.006, -rowB(j + 1) / 1000);
    }
  }
  setGeometry(merdithLine, own).computeBoundingSphere();
  merdithLine.computeLineDistances();

  // The slab in 3D inside the box: from the eased trench rows, and under other subduction
  // pieces, 45° towards the overriding side, 90 km thick, down to the depth shown.
  const sheet = [];
  const run = depth / Math.tan(SLAB_DIP);
  const thick = SLAB_KM / Math.sin(SLAB_DIP);
  const at = (a, b, d) => [a / 1000, yOf(-d), -b / 1000];
  const panel = (pa, pb, qa, qb, pna, pnb, qna, qnb) => {
    for (const offset of [0, thick]) {
      const p0 = at(pa - pna * offset, pb - pnb * offset, 0);
      const q0 = at(qa - qna * offset, qb - qnb * offset, 0);
      const p1 = at(pa + pna * (run - offset), pb + pnb * (run - offset), depth);
      const q1 = at(qa + qna * (run - offset), qb + qnb * (run - offset), depth);
      sheet.push(...p0, ...q0, ...q1, ...p0, ...q1, ...p1);
    }
  };
  // The main slab: its top and base surfaces and the end where it starts, in the same
  // slab coordinates the layers were cut with, so the sheets line the gap exactly.
  const slabAt = (r, u, v) => { const [s, d] = slabSD(u, v, SLAB_DIP); return at(r.a + r.na * s, r.b + r.nb * s, r.top + d); };
  const sheetColours = [];
  const sheetColour = colour(SHEET_COLOUR);
  const sheetMismatch = colour(SHEET_MISMATCH);
  let quadColour = sheetColour;
  const quad = (a, b, c, d) => {
    sheet.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let n = 0; n < 6; n++) sheetColours.push(quadColour.r, quadColour.g, quadColour.b);
  };
  const sin = Math.sin(SLAB_DIP);
  const cos = Math.cos(SLAB_DIP);
  for (let j = cj0; j < cj1; j++) {
    const p = slabRows[j];
    const q = slabRows[j + 1];
    if (!p || !q) continue;
    const uTop = (r) => Math.max(0, (depth - r.top) / sin);
    const uBase = (r) => Math.max(0, (depth - r.top - SLAB_KM * cos) / sin);
    const vEnd = (r) => Math.max(0, Math.min(SLAB_KM, (depth - r.top) / cos));
    quadColour = mismatchRow(j) || mismatchRow(j + 1) ? sheetMismatch : sheetColour;
    quad(slabAt(p, 0, 0), slabAt(q, 0, 0), slabAt(q, uTop(q), 0), slabAt(p, uTop(p), 0));
    quad(slabAt(p, 0, vEnd(p)), slabAt(q, 0, vEnd(q)), slabAt(q, uBase(q), vEnd(q)), slabAt(p, uBase(p), vEnd(p)));
    quad(slabAt(p, 0, 0), slabAt(q, 0, 0), slabAt(q, 0, vEnd(q)), slabAt(p, 0, vEnd(p)));
  }
  if (boundaryFrame_) {
    for (const piece of boundaryFrame_.pieces) {
      if (piece.k !== 'subduction' || !piece.p || piece.main) continue;
      const sign = piece.p === 'L' ? 1 : -1;
      for (let n = 0; n + 3 < piece.xy.length; n += 2) {
        const [pa, pb, qa, qb] = piece.xy.slice(n, n + 4);
        if (!inside(pa, pb) || !inside(qa, qb)) continue;
        const len = Math.hypot(qa - pa, qb - pb) || 1;
        const na = (-(qb - pb) / len) * sign;
        const nb = ((qa - pa) / len) * sign;
        panel(pa, pb, qa, qb, na, nb, na, nb);
      }
    }
  }
  // The other subduction pieces' sheets, after the main slab's, take the plain colour.
  while (sheetColours.length < sheet.length) sheetColours.push(sheetColour.r, sheetColour.g, sheetColour.b);
  setGeometry(slabSheet, sheet, sheetColours);

  // Slab and flow on the face, where the eased trench crosses the face row.
  const sp = [];
  const sc = [];
  const crossing = slabRows[cj0];
  state.faceTrench = crossing ? { s_km: crossing.a } : null;
  if (crossing) {
    const xT = crossing.a;
    const side = Math.sign(crossing.na) || (trench.over_side ?? -1);
    // The slab on the face: each column from the surface down, kept inside the slab — the
    // gap the layers left. Seen on the face it dips at its apparent angle.
    const fill = [colour(COLOURS.slabCrust), colour(COLOURS.slabMantle)];
    insidePieces(OCEANIC_CRUST_KM, SLAB_KM).forEach((planes, part) => {
      const c = [fill[part].r, fill[part].g, fill[part].b];
      for (let n = 0; n + 1 < xs.length; n++) {
        const column = [[xs[n], surfaceY[n]], [xs[n + 1], surfaceY[n + 1]], [xs[n + 1], bottom], [xs[n], bottom]];
        cutInto(column.map(([x, y]) => vtx([x, y, faceZ + 0.0005], c, cj0)), sp, sc, [planes]);
      }
    });
    // The corner flow on the face uses the same apparent dip, from the sea floor at the trench.
    const na = Math.max(0.05, Math.abs(crossing.na));
    const dip = Math.atan(Math.tan(SLAB_DIP) * na);
    const field = subductionFlow(side, dip);
    const convergence = (trench.rate_cm_yr ?? 0) * (trench.over_side ?? side);
    flow = { field, xT, side, dip, na: crossing.na, top: crossing.top, speed: Math.max(0.5, Math.abs(convergence)), depth, lithY, xs, z: faceZ };
  } else {
    flow = null;
  }
  setGeometry(slab, sp, sc);
  flowPoints.visible = state.flow && Boolean(flow);

  // The locality pin, when the face is the line A–A′ and the locality is inside the box.
  const iLoc = localityColumn();
  const nLoc = lineRow() * nx + iLoc;
  pin.visible = cj0 === lineRow() && iLoc >= ci0 && iLoc <= ci1;
  pin.position.set(0, Math.max(0, yOf(h[nLoc] / 1000)) + 0.05, 0.001);

  updateGlobe();
  $('inset-caption').textContent = `${format(t().globeCaption, { age: Math.round(state.age) })} · ${t().boxNote}`;
  renderAge();
  renderNow(h[nLoc]);
  drawColumn();
}

// ---------- mantle flow particles ----------

const PARTICLES = 700;
const particles = { pos: new Float32Array(PARTICLES * 3), life: new Float32Array(PARTICLES), born: new Float32Array(PARTICLES) };
flowPoints.geometry.setAttribute('position', new THREE.BufferAttribute(particles.pos, 3));
const tint = colour(COLOURS.flow);
const particleColours = new Float32Array(PARTICLES * 4);
for (let n = 0; n < PARTICLES; n++) particleColours.set([tint.r, tint.g, tint.b, 0], n * 4);
flowPoints.geometry.setAttribute('color', new THREE.BufferAttribute(particleColours, 4));

// Slab coordinates of a point on the face (x along, d depth, km), as the layers were cut:
// u down-dip from the trench's sea floor, n below the slab top (positive into the slab).
function slabCoords(xkm, dkm) {
  return slabUV((xkm - flow.xT) * flow.na, dkm - flow.top, SLAB_DIP);
}
// The corner flow at a point on the face, its corner on the sea floor at the trench.
const flowAt = (xkm, dkm) => flow.field(xkm - flow.xT, -(dkm - flow.top));

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
      particles.life[n] = 3 + Math.random() * 5;
      particles.born[n] = 0;
      return;
    }
  }
  particles.life[n] = 0;
}

// Streamlines: the paths the tracers follow, traced once for each slab position.
function traceStreamlines() {
  const lines = [];
  if (!flow) return lines;
  const seeds = [];
  for (const r of [120, 220, 330, 450]) {
    seeds.push([flow.dip / 2, r], [(flow.dip + Math.PI) / 2, r]);
  }
  for (const [phi, r] of seeds) {
    for (const direction of [1, -1]) {
      let x = flow.xT + flow.side * r * Math.cos(phi);
      let d = flow.top + r * Math.sin(phi);
      for (let step = 0; step < 400; step++) {
        const v = flowAt(x, d);
        if (!v) break;
        const speed = Math.hypot(v[0], v[1]) || 1;
        const nx_ = x + direction * (v[0] / speed) * 8;
        const nd = d - direction * (v[1] / speed) * 8;
        if (!inMantle(x, d) || !inMantle(nx_, nd)) break;
        lines.push(x / 1000, yOf(-d), flow.z + 0.0025, nx_ / 1000, yOf(-nd), flow.z + 0.0025);
        x = nx_;
        d = nd;
      }
    }
  }
  return lines;
}

let flowKey = '';
function stepFlow(dt) {
  streamlines.visible = Boolean(flow) && state.flow;
  if (!flow || !state.flow) return;
  const key = `${flow.xT}:${flow.side}:${flow.dip}:${flow.top}:${state.ve}:${flow.z}:${flow.xs[0]}:${flow.xs.length}`;
  if (key !== flowKey) {
    flowKey = key;
    for (let n = 0; n < PARTICLES; n++) respawn(n);
    setGeometry(streamlines, traceStreamlines());
  }
  // Shown speed: 18 km per second of animation for each cm/yr of convergence.
  const scale = 18 * flow.speed;
  const shown = flowPoints.geometry.attributes.position;
  const colours = flowPoints.geometry.attributes.color;
  for (let n = 0; n < PARTICLES; n++) {
    let x = particles.pos[n * 3];
    let d = particles.pos[n * 3 + 1];
    particles.life[n] -= dt;
    particles.born[n] += dt;
    const v = flowAt(x, d);
    if (!v || particles.life[n] <= 0 || !inMantle(x, d)) { respawn(n); x = particles.pos[n * 3]; d = particles.pos[n * 3 + 1]; }
    else {
      x += v[0] * scale * dt;
      d -= v[1] * scale * dt;
      particles.pos[n * 3] = x;
      particles.pos[n * 3 + 1] = d;
    }
    shown.setXYZ(n, x / 1000, yOf(-d), flow.z + 0.003);
    // Fade in after birth and out before the end, so nothing blinks.
    colours.setW(n, 0.9 * Math.min(1, particles.born[n] / 0.8, Math.max(0, particles.life[n]) / 0.8));
  }
  shown.needsUpdate = true;
  colours.needsUpdate = true;
}

// ---------- the small globe ----------
// The Merdith 2021 reconstruction at the age on screen (the main page's frame: land in
// green, plate index in red), with this block drawn on it as a red box: its top outline on
// the surface, its edges and bottom at true depth. It turns with East Antarctica.

const globeScene = new THREE.Scene();
globeScene.background = new THREE.Color(0x0f1a2c);
const globeCamera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
const landTexture = new THREE.Texture(document.createElement('canvas'));
const plateTexture = new THREE.Texture(document.createElement('canvas'));
for (const [texture, filter] of [[landTexture, THREE.LinearFilter], [plateTexture, THREE.NearestFilter]]) {
  texture.flipY = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.magFilter = texture.minFilter = filter;
  texture.wrapS = THREE.RepeatWrapping;
}
const antarcticIndex = new Uint8Array(256 * 4);
const antarcticTexture = new THREE.DataTexture(antarcticIndex, 256, 1, THREE.RGBAFormat);
antarcticTexture.magFilter = antarcticTexture.minFilter = THREE.NearestFilter;
const globeMaterial = new THREE.ShaderMaterial({
  uniforms: { land: { value: landTexture }, plates: { value: plateTexture }, antarctic: { value: antarcticTexture }, ready: { value: 0 } },
  vertexShader: `varying vec3 vPos; varying vec3 vN;
    void main(){ vPos = position; vN = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D land; uniform sampler2D plates; uniform sampler2D antarctic; uniform float ready;
    varying vec3 vPos; varying vec3 vN; const float PI = 3.141592653589793;
    void main(){
      vec3 p = normalize(vPos);
      vec2 uv = vec2((atan(-p.z, p.x) + PI) / (2.0 * PI), (0.5 * PI - asin(clamp(p.y, -1.0, 1.0))) / PI);
      float crust = texture2D(land, uv).g * ready;
      float index = floor(texture2D(plates, uv).r * 255.0 + 0.5);
      float isAnt = texture2D(antarctic, vec2((index + 0.5) / 256.0, 0.5)).a;
      vec3 ocean = vec3(0.09, 0.18, 0.31);
      vec3 landColour = mix(vec3(0.62, 0.56, 0.45), vec3(0.96, 0.90, 0.77), isAnt);
      vec3 c = mix(ocean, landColour, smoothstep(0.3, 0.7, crust));
      float light = max(dot(normalize(vN), normalize(vec3(0.3, 0.4, 1.0))), 0.0);
      gl_FragColor = vec4(c * (0.55 + 0.5 * light), 1.0);
    }`,
});
globeScene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), globeMaterial));
const globeBoundaries = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }));
const boxOnGlobe = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff3b3b }));
const boxInside = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
  color: 0xff6b6b, transparent: true, opacity: 0.7, depthTest: false }));
globeScene.add(globeBoundaries, boxOnGlobe, boxInside);

// The small globe's size and view: dragged in the box to turn it, wheel to zoom, the
// top-left corner to resize, double-click to go back to following the block.
const globeView = { manual: false, distance: 4.4, size: null };
try { globeView.size = Number(localStorage.getItem('cplates-globe-size')) || null; } catch { /* optional */ }

// Present-day lon/lat of grid point (i, j), built as scripts/build_section.py builds it:
// along the great circle by rotating about its pole, across by rotating about the line's
// direction of travel.
function geoUnit(lon, lat) {
  const lo = lon * Math.PI / 180;
  const la = lat * Math.PI / 180;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function rotate3(v, k, angle) {
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  const kv = cross3(k, v);
  const d = dot3(k, v) * (1 - c);
  return [v[0] * c + kv[0] * sn + k[0] * d, v[1] * c + kv[1] * sn + k[1] * d, v[2] * c + kv[2] * sn + k[2] * d];
}
function gridLonLat(i, j) {
  const sec = state.data.meta.section;
  const [[lon1, lat1], [lon2, lat2]] = sec.great_circle_through;
  let pole = cross3(geoUnit(lon1, lat1), geoUnit(lon2, lat2));
  const len = Math.hypot(...pole);
  pole = pole.map((v) => v / len);
  const r = Math.PI / 180;
  const g = state.data.meta.grid_deg ?? { along: sec.along_deg, across: sec.across_deg, step: sec.step_deg };
  const onLine = rotate3(geoUnit(...sec.anchor), pole, (g.along[0] + i * g.step) * r);
  let tangent = cross3(pole, onLine);
  const tl = Math.hypot(...tangent);
  tangent = tangent.map((v) => v / tl);
  const p = rotate3(onLine, tangent, -(g.across[0] + j * g.step) * r);
  return [Math.atan2(p[1], p[0]) / r, Math.asin(Math.max(-1, Math.min(1, p[2]))) / r];
}
function boxOutline() {
  const { meta } = state.data;
  const c = state.crop ?? defaultBox();
  const out = [];
  for (let i = c.i0; i <= c.i1; i++) out.push(gridLonLat(i, c.j0));
  for (let j = c.j0; j <= c.j1; j++) out.push(gridLonLat(c.i1, j));
  for (let i = c.i1; i >= c.i0; i--) out.push(gridLonLat(i, c.j1));
  for (let j = c.j1; j >= c.j0; j--) out.push(gridLonLat(c.i0, j));
  return out;
}

const globeFrames = new Map();
let globeShown = null;
async function globeFrame(age) {
  if (globeFrames.has(age)) return globeFrames.get(age);
  const promise = Promise.all([
    vfetch(`../data/merdith2021/frames/${age}.json`).then((r) => r.json()),
    vfetch(`../data/merdith2021/frames/${age}.png`).then((r) => r.blob())
      .then((b) => createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })),
  ]).then(([json, bitmap]) => ({ json, bitmap }));
  globeFrames.set(age, promise);
  if (globeFrames.size > 12) {
    const oldest = globeFrames.keys().next().value;
    if (oldest !== age) { globeFrames.get(oldest).then((f) => f.bitmap.close?.()); globeFrames.delete(oldest); }
  }
  return promise;
}

async function updateGlobe() {
  if (!state.data) return;
  const age = Math.round(state.age);
  const { meta, merdith } = state.data;
  const q = merdith.rotation(meta.section.frame_plate, state.age);
  if (q) {
    const depth = depthShownKm(state.ve);
    const deep = 1 - depth / 6371;
    const outline = boxOutline().map(([lon, lat]) => turn(q, lon, lat));
    const top_ = [];
    const inner = [];
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      top_.push(...toVector(a[0], a[1], 1.004), ...toVector(b[0], b[1], 1.004));
      inner.push(...toVector(a[0], a[1], deep), ...toVector(b[0], b[1], deep));
    }
    const c0 = state.crop ?? defaultBox();
    const w = c0.i1 - c0.i0 + 1;
    const hgt = c0.j1 - c0.j0 + 1;
    for (const c of [0, w - 1, w + hgt - 1, 2 * w + hgt - 1]) {
      inner.push(...toVector(outline[c][0], outline[c][1], 1.004), ...toVector(outline[c][0], outline[c][1], deep));
    }
    setGeometry(boxOnGlobe, top_);
    setGeometry(boxInside, inner);
    // Look at the middle of the box, unless the viewer has turned the globe by hand.
    if (!globeView.manual) {
      const centre = new THREE.Vector3();
      for (const [lon, lat] of outline) centre.add(new THREE.Vector3(...toVector(lon, lat)));
      globeCamera.position.copy(centre.normalize().multiplyScalar(globeView.distance));
      globeCamera.up.set(0, 1, 0);
      globeCamera.lookAt(0, 0, 0);
    }
  }
  if (globeShown === age) return;
  const frame = await globeFrame(age).catch(() => null);
  if (!frame || Math.round(state.age) !== age) return;
  globeShown = age;
  for (const texture of [landTexture, plateTexture]) { texture.image = frame.bitmap; texture.needsUpdate = true; }
  antarcticIndex.fill(0);
  const antarctic = new Set(meta.section.antarctic_plates);
  for (const [index, plate] of frame.json.plates) if (antarctic.has(plate)) antarcticIndex[index * 4 + 3] = 255;
  antarcticTexture.needsUpdate = true;
  globeMaterial.uniforms.ready.value = 1;
  const lines = [];
  const colours = [];
  for (const piece of frame.json.boundaries) {
    const c = colour('#' + KINDS[piece.k].toString(16).padStart(6, '0'));
    for (let n = 0; n + 3 < piece.c.length; n += 2) {
      lines.push(...toVector(piece.c[n], piece.c[n + 1], 1.002), ...toVector(piece.c[n + 2], piece.c[n + 3], 1.002));
      colours.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
  }
  setGeometry(globeBoundaries, lines, colours);
}

// Bottom right, above the timeline.
function insetRect() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const timeline = document.querySelector('.timeline').getBoundingClientRect();
  const fallback = W < 640 ? 130 : Math.min(230, Math.round(W * 0.2));
  const limit = Math.max(120, Math.min(W - 32, timeline.top - 40));
  const size = Math.round(Math.min(limit, Math.max(100, globeView.size ?? fallback)));
  return { left: W - size - 16, top: timeline.top - size - 12, size };
}

function renderInset() {
  const r = insetRect();
  const node = $('inset');
  const style = `${r.left}px,${r.top}px,${r.size}px`;
  if (node.dataset.at !== style) {
    node.dataset.at = style;
    Object.assign(node.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.size}px`, height: `${r.size}px` });
  }
  const bottomUp = window.innerHeight - r.top - r.size;
  renderer.setScissorTest(true);
  renderer.setScissor(r.left, bottomUp, r.size, r.size);
  renderer.setViewport(r.left, bottomUp, r.size, r.size);
  renderer.render(globeScene, globeCamera);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
}

{
  const node = $('inset');
  const grip = $('inset-grip');
  let drag = null;
  node.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    node.setPointerCapture(event.pointerId);
    const r = insetRect();
    drag = { mode: event.target === grip ? 'resize' : 'turn', x: event.clientX, y: event.clientY, size: r.size };
  });
  node.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (drag.mode === 'resize') {
      // The globe sits bottom-right, so dragging its top-left corner up or left grows it.
      globeView.size = drag.size - Math.max(dx, dy);
      try { localStorage.setItem('cplates-globe-size', String(Math.round(insetRect().size))); } catch { /* optional */ }
      return;
    }
    globeView.manual = true;
    const position = globeCamera.position;
    position.applyAxisAngle(new THREE.Vector3(0, 1, 0), -dx * 0.008);
    // Grab-and-drag: the surface under the pointer follows it. Dragging right turns the
    // camera left about the vertical; dragging down raises the camera.
    const right = new THREE.Vector3().crossVectors(globeCamera.up, position).normalize();
    const tilted = position.clone().applyAxisAngle(right, -dy * 0.008);
    if (Math.abs(tilted.y) < 0.97 * tilted.length()) position.copy(tilted);
    globeCamera.lookAt(0, 0, 0);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  const end = () => { drag = null; };
  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', end);
  node.addEventListener('wheel', (event) => {
    event.preventDefault();
    globeView.distance = Math.min(9, Math.max(1.6, globeView.distance * (event.deltaY > 0 ? 1.1 : 0.9)));
    globeCamera.position.setLength(globeView.distance);
  }, { passive: false });
  node.addEventListener('dblclick', () => { globeView.manual = false; globeView.distance = 4.4; updateGlobe(); });
}

// ---------- labels ----------

const labelNodes = new Map();
function placeLabels() {
  if (!state.data) return;
  const { meta } = state.data;
  const anchors = [];
  const crop = state.crop ?? defaultBox();
  const faceZ = zAt(crop.j0);
  const x0 = xAt(crop.i0);
  const x1 = xAt(crop.i1);
  const depth = depthShownKm(state.ve);
  // A and A′ name the ends of the line itself, so only while the face is on it.
  const home = defaultBox();
  if (crop.j0 === home.j0) {
    for (const [id, i, text] of [['A', home.i0, 'A'], ['A2', home.i1, 'A′']]) {
      if (i >= crop.i0 && i <= crop.i1) anchors.push({ id, at: [xAt(i), 0.08, faceZ], text, cls: 'end' });
    }
  }
  if (!state.shackleton && pin.visible) anchors.push({ id: 'loc', at: [0, 0.16, 0], text: t().locality, cls: 'obs' });
  if (x0 < -1.8 && x1 > -1.8) anchors.push({ id: 'interior', at: [-1.8, 0.1, faceZ], text: t().interior, cls: '' });
  if (state.faceTrench) anchors.push({ id: 'trench', at: [state.faceTrench.s_km / 1000, 0.08, faceZ], text: t().trench, cls: '' });
  if (flow && depth >= 200) {
    const along = Math.min(depth * 0.55, 300) / Math.sin(flow.dip);
    anchors.push({ id: 'slab', at: [(flow.xT + flow.side * Math.cos(flow.dip) * along) / 1000, yOf(-(flow.top + Math.sin(flow.dip) * along)), faceZ + 0.004],
                   text: t().slabLabel, cls: 'boundary' });
    if (state.flow) {
      const r = Math.min(depth * 0.6, 320);
      for (const [id, phi, scale, text] of [['wedge', flow.dip / 2 + 0.25, 1, t().wedgeLabel],
                                            ['under', (flow.dip + Math.PI) / 2 + 0.35, 1.35, t().underLabel]]) {
        const x = flow.xT + flow.side * r * scale * Math.cos(phi);
        const d = flow.top + r * scale * Math.sin(phi);
        if (d < depth && x / 1000 > x0 && x / 1000 < x1) anchors.push({ id, at: [x / 1000, yOf(-d), faceZ + 0.004], text, cls: 'boundary' });
      }
    }
  }
  // Named over its area whenever part of it is in the box, wherever the face is.
  if (state.shackleton && state.limestoneAt) {
    const g = state.limestone?.grown ?? 0;
    anchors.push({ id: 'limestone', at: state.limestoneAt, cls: 'obs',
                   text: g > 0 ? format(t().limestoneLabel, { km: (state.limestoneKm * g).toFixed(1) }) : t().limestoneNotYet });
  }
  if (state.cob) anchors.push({ id: 'cob', at: [state.cob, Math.max(yOf(-depth), yOf(-60)) - 0.02, faceZ + 0.002], text: t().cob, cls: 'depth' });
  const pr = state.profile;
  if (pr) {
    const n = Math.min(14, pr.xs.length - 1);
    const x = pr.xs[n];
    const cont = pr.share[n] > 0.5;
    const layers = [
      [Math.min(pr.surfaceY[n], 0), pr.crustBottomY[n], cont ? t().layerContinental : t().layerOceanic],
      [pr.crustBottomY[n], pr.lithY[n], t().layerLithosphere],
      [pr.lithY[n], pr.bottom, t().layerMantle],
    ];
    layers.forEach(([upper, lower, text], k) => {
      if (upper - lower > 0.035) anchors.push({ id: `layer${k}`, at: [x, (upper + lower) / 2, faceZ + 0.004], text, cls: 'layer' });
    });
    if (pr.crustBottomY[n] > pr.bottom + 0.01 && pr.xs.length > n + 20) {
      anchors.push({ id: 'moho', at: [x + 0.55, pr.crustBottomY[n], faceZ + 0.004], text: t().moho, cls: 'boundary' });
    }
  }
  for (const label of state.outcropLabels ?? []) anchors.push(label);
  if (state.scale) anchors.push({ id: 'scale', at: state.scale.at, text: `${state.scale.km} km`, cls: 'scale' });
  for (const d of [0, 35, 100, 200, 410, 660]) {
    if (d <= depth) anchors.push({ id: `d${d}`, at: [x0 - 0.02, yOf(-d), faceZ], text: `${d} km`, cls: 'depth' });
  }
  const box = $('labels');
  const seen = new Set();
  // Labels on the section face only make sense from in front of it (z > 0).
  const behind = camera.position.z < faceZ;
  for (const a of anchors) {
    if (behind && ['layer', 'boundary', 'depth'].includes(a.cls)) continue;
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
  // Units below the view (older than its start, age unknown) are not "being laid down now".
  return state.data.meta.section.stratigraphy.units.filter((u) => !u.below && state.age <= u.age[0] + 0.5 && state.age >= u.age[1] - 0.5);
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
      b.textContent = { sketch: t().sketchBadge, interp: t().interpBadge }[kind] ?? t().modelBadge;
      dd.append(' ', b);
    }
    dl.append(dt, dd);
  };
  row(t().nowHeight, format(t().m, { v: Math.round(height) }), 'model');
  row(t().nowCrust, format(t().km, { v: crustKm(height).toFixed(0) }), 'model');
  const c = state.crop;
  const off = c ? c.j0 - lineRow() : 0;
  if (off) row(t().faceAt, format(off > 0 ? t().faceAtValue : t().faceAtOut, { km: Math.round(Math.abs(off) * state.data.meta.step_km) }));
  if (state.trench) {
    const fitted = Boolean(state.trench.fitted);
    row(t().nowTrench, format(t().km, { v: Math.round(Math.abs(state.trench.s_km)) }), fitted ? 'interp' : 'model');
    // Where the trench meets the face, and how it sits on PaleoDEM.
    const j0 = c ? c.j0 : lineRow();
    const site = state.sites?.rows[j0];
    if (fitted) {
      const shift = state.trench.rows[j0]?.shift;
      row(t().nowFitted, shift === undefined ? t().fittedNone : format(t().fittedValue, { km: Math.round(Math.abs(shift)) }), 'interp');
    }
    if (site) {
      const key = !site.mismatch ? 'siteValue' : site.height > 0 ? 'siteLand' : 'siteShelf';
      row(fitted ? t().nowSiteMerdith : t().nowSite, format(t()[key], { m: Math.round(site.height) }), 'model');
      if (!fitted && site.mismatch && site.footKm !== null) row(t().nowFoot, format(t().footValue, { km: Math.round(Math.abs(site.footKm)) }));
    }
    if (state.sites?.share > 0) row(t().nowShare, format(t().shareValue, { p: Math.round(state.sites.share * 100) }));
    if (state.trench.transition) {
      const tr = state.trench.transition;
      row('', format(t().trenchEased, { from: tr.from, to: tr.to, km: tr.min === tr.max ? tr.min : `${tr.min}–${tr.max}` }));
    }
    if (state.trench.rate_cm_yr !== null) {
      row(t().nowRate, format(t().rate, { v: (state.trench.rate_cm_yr * state.trench.over_side).toFixed(1) }), 'model');
    }
  } else {
    row(t().nowTrench, t().nowNoTrench);
  }
  box.append(dl);
  const note = $('fit-note');
  note.textContent = state.fit ? t().fitNote : t().mismatchNote;
  note.hidden = !state.fit && !(state.trench && state.sites?.share > 0);
}

// The record at the Shackleton Limestone area, drawn after the revised stratigraphy of
// Myrow et al. 2002 (fig. 16): across is inboard (continent side) to outboard, down is age.
// The Douglas Formation is an inboard wedge interfingering with the Starshot, and the thin
// Holyoake Formation (with the bioherms and phosphatic crust under it) is absent inboard.
// Left: the PaleoDEM setting at the locality, Myr by Myr (model).
function drawColumn() {
  const svg = $('column');
  const W = 300;
  const top_ = 18;
  const bottom_ = 222;
  const Y = (age) => top_ + ((state.oldest - Math.min(state.oldest, Math.max(state.youngest, age))) / (state.oldest - state.youngest)) * (bottom_ - top_);
  // Oldest at the bottom.
  const A = (age) => top_ + bottom_ - Y(age);
  const ns = 'http://www.w3.org/2000/svg';
  svg.replaceChildren();
  const add = (tag, attrs, text, parent = svg) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text) e.textContent = text;
    parent.append(e);
    return e;
  };
  const units = Object.fromEntries(state.data.meta.section.stratigraphy.units.map((u) => [u.id, u]));
  const short = (u) => u.name[state.lang].split(' (')[0];
  // Fill patterns: limestone bricks, coarse dots (conglomerate), fine dots (siltstone).
  const defs = add('defs', {});
  const pattern = (id, w, h, bg, draw) => {
    const pt = add('pattern', { id, width: w, height: h, patternUnits: 'userSpaceOnUse' }, null, defs);
    add('rect', { width: w, height: h, fill: bg }, null, pt);
    draw(pt);
  };
  pattern('col-brick', 12, 6, units.shackleton?.colour ?? '#9fd3e0', (pt) => {
    add('path', { d: 'M0 0.5H12M0 3.5H12M3 0.5V3.5M9 3.5V6.5', stroke: '#5e8c97', 'stroke-width': 0.6, fill: 'none' }, null, pt);
  });
  pattern('col-cong', 7, 7, units.douglas?.colour ?? '#b0855a', (pt) => {
    add('circle', { cx: 2, cy: 2, r: 1.3, fill: '#5d3f22' }, null, pt);
    add('circle', { cx: 5.5, cy: 5, r: 0.9, fill: '#5d3f22' }, null, pt);
  });
  pattern('col-silt', 5, 5, units.starshot?.colour ?? '#8a8f6a', (pt) => {
    add('circle', { cx: 1.5, cy: 1.5, r: 0.5, fill: '#3e4230' }, null, pt);
  });
  pattern('col-goldie', 6, 6, units.goldie?.colour ?? '#8c8c8c', (pt) => {
    add('path', { d: 'M0 3Q1.5 1 3 3T6 3', stroke: '#5c5c5c', 'stroke-width': 0.6, fill: 'none' }, null, pt);
  });

  add('text', { x: 4, y: 10 }, t().columnModel);
  add('text', { x: 296, y: 10, 'text-anchor': 'end' }, t().columnObserved);
  // PaleoDEM setting at the locality, per Myr.
  const { meta, surface, cells } = state.data;
  const nLoc = lineRow() * meta.nx + localityColumn();
  meta.ages.forEach((age, k) => {
    const z = surface[k * cells + nLoc];
    const env = ENV.find(([, low]) => z >= low);
    add('rect', { x: 4, y: A(age + 0.5), width: 28, height: Math.max(1, A(age - 0.5) - A(age + 0.5)) + 0.8, fill: env[2] });
  });
  for (const age of [540, 525, 512, 500, 485, 460]) add('text', { x: 35, y: A(age) + 3 }, String(age));

  // The revised stratigraphy, across the panel from inboard (left) to outboard (right).
  const X0 = 62;
  const X1 = 296;
  const X = (f) => X0 + f * (X1 - X0);
  const poly = (pts, attrs) => add('polygon', { points: pts.map(([f, age]) => `${X(f)},${A(age)}`).join(' '), ...attrs });
  const label = (text, f, age, anchor = 'middle') => add('text', { x: X(f), y: A(age) + 3, 'text-anchor': anchor, class: 'label' }, text);
  const line = { stroke: '#0b1220', 'stroke-width': 0.8 };
  const g = units.goldie;
  const sh = units.shackleton;
  const ho = units.holyoake;
  const st = units.starshot;
  const dg = units.douglas;
  const up = units.uplift;
  if (g) {
    poly([[0, g.age[0]], [1, g.age[0]], [1, g.age[1]], [0, g.age[1]]], { fill: 'url(#col-goldie)', ...line });
    label(short(g), 0.5, (g.age[0] + g.age[1]) / 2);
  }
  if (sh) {
    poly([[0, sh.age[0]], [1, sh.age[0]], [1, sh.age[1]], [0, sh.age[1]]], { fill: 'url(#col-brick)', ...line });
    // The unconformity at its base.
    add('path', { d: Array.from({ length: 24 }, (_, k) => `${k ? 'L' : 'M'}${X(k / 23)},${A(sh.age[0]) + (k % 2 ? 1.5 : -1.5)}`).join(''),
                  stroke: '#0b1220', 'stroke-width': 0.9, fill: 'none' });
    label(short(sh), 0.5, (sh.age[0] + sh.age[1]) / 2);
  }
  if (st) {
    poly([[0, st.age[0]], [1, st.age[0]], [1, st.age[1]], [0, st.age[1]]], { fill: 'url(#col-silt)', ...line });
    // Its top is not well bounded: dashed, with the boundary the figure queries.
    add('line', { x1: X0, x2: X1, y1: A(st.age[1]), y2: A(st.age[1]), stroke: '#e8edf5', 'stroke-width': 1, 'stroke-dasharray': '3 2' });
    add('text', { x: X1, y: A(st.age[1]) - 2, 'text-anchor': 'end' }, t().colTop);
    label(short(st), 0.68, (st.age[0] + st.age[1]) / 2 + 2);
  }
  if (ho) {
    // Thin, outboard of the Douglas wedge, with bioherms under it and the phosphatic crust.
    const f0 = 0.4;
    poly([[f0, ho.age[0]], [1, ho.age[0]], [1, ho.age[0] - 1.3], [f0, ho.age[0] - 1.3]], { fill: '#2b2f36', stroke: 'none' });
    for (let f = f0 + 0.02; f < 0.92; f += 0.045) {
      add('path', { d: `M${X(f) - 3},${A(ho.age[0])} a3,3 0 0 1 6,0 z`, fill: sh?.colour ?? '#9fd3e0', stroke: '#0b1220', 'stroke-width': 0.5 });
    }
    add('text', { x: X(1) - 2, y: A(ho.age[0] - 1.3) - 2, 'text-anchor': 'end', class: 'label' }, short(ho));
  }
  if (dg) {
    // The inboard wedge, interfingering outboard with the Starshot.
    const [base, topAge] = dg.age;
    const span = base - topAge;
    const at = (k) => base - span * k;
    poly([[0, base], [0.48, base], [0.4, at(0.12)], [0.44, at(0.2)], [0.33, at(0.35)], [0.37, at(0.43)],
          [0.25, at(0.58)], [0.29, at(0.66)], [0.15, at(0.8)], [0.18, at(0.87)], [0, topAge]],
         { fill: 'url(#col-cong)', ...line });
    label(short(dg), 0.14, base - span * 0.32);
  }
  if (up) {
    poly([[0, up.age[0]], [1, up.age[0]], [1, up.age[1]], [0, up.age[1]]],
         { fill: up.colour, 'fill-opacity': 0.4, stroke: '#9cc7ff', 'stroke-width': 0.8, 'stroke-dasharray': '3 2' });
    label(`${short(up)}${t().interpSuffix}`, 0.5, (up.age[0] + up.age[1]) / 2);
  }
  add('text', { x: X0, y: 236 }, t().colInboard);
  add('text', { x: X1, y: 236, 'text-anchor': 'end' }, t().colOutboard);
  add('line', { x1: 0, x2: W, y1: A(state.age), y2: A(state.age), stroke: '#fff', 'stroke-width': 1.5 });
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
    const when = u.below ? format(t().belowView, { age: u.age[1] }) : `${u.age[0]}${u.age[0] !== u.age[1] ? `–${u.age[1]}` : ''} Ma`;
    name.textContent = ` ${u.name[state.lang]} · ${when}`;
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
                 ['dots', '', t().lgFlow], ['dash', '', t().lgCob],
                 state.fit ? ['dash', '#b8b8b8', t().lgMerdithTrench] : ['line', MISMATCH_COLOUR, t().lgMismatch],
                 ...(state.outcrops && state.data?.meta.outcrops
                   ? [['fill', BYRD.lower.colour, t().lgByrdLower], ['fill', BYRD.upper.colour, t().lgByrdUpper],
                      ['fill', '#7d8a90', t().lgByrdNotYet]]
                   : []),
                 ...(state.geology && state.data?.meta.geology
                   ? [...state.data.meta.geology.classes.filter((c) => c.area_km2 > 0).map((c) =>
                       ['fill', c.colour, `${c.name[state.lang]} · ${c.age[1] >= 1000 ? `${c.age[0] / 1000}–${c.age[1] / 1000} Ga` : `${c.age[0]}–${c.age[1]} Ma`}`]),
                     ['fill', '#5e6470', t().lgGeologyLater]]
                   : [])];
  const list = $('legend');
  list.replaceChildren();
  for (const [shape, c, text] of items) {
    const li = document.createElement('li');
    const sw = document.createElement('span');
    sw.className = `sw ${shape}`;
    if (c && shape === 'fill') sw.style.background = c;
    else if (c) sw.style.borderTopColor = c;
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
    'Myrow, P. M., Pope, M. C., Goodge, J. W., Fischer, W., and Palmer, A. R., 2002. Depositional history of pre-Devonian strata and timing of Ross orogenic tectonism in the central Transantarctic Mountains, Antarctica. GSA Bulletin, 114, 1070–1088 (fig. 1: measured sections; fig. 16: revised stratigraphy).',
    'Cox, S. C., et al., 2023. The GeoMAP (v.2022-08) continent-wide detailed geological dataset of Antarctica. PANGAEA, doi:10.1594/PANGAEA.951482; Scientific Data, 10, 250. CC BY 4.0.',
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
  if (state.data) { renderUnits(); renderSources(); renderLimestoneNote(); renderOutcropNote(); renderGeologyNote(); renderLegend(); update(); }
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
$('show-outcrops').checked = state.outcrops;
$('show-outcrops').addEventListener('change', (e) => { state.outcrops = e.target.checked; keepParams(); renderLegend(); renderOutcropNote(); update(); });
$('show-geology').checked = state.geology;
$('show-geology').addEventListener('change', (e) => { state.geology = e.target.checked; keepParams(); renderLegend(); renderGeologyNote(); update(); });
function renderGeologyNote() {
  const note = $('geology-note');
  note.hidden = !state.geology || !state.data?.meta.geology;
  note.textContent = t().geologyNote;
}
function renderOutcropNote() {
  const note = $('outcrop-note');
  const o = state.data?.meta.outcrops;
  note.hidden = !state.outcrops || !o;
  if (o) note.textContent = `${t().outcropNote} ${o.stratigraphy_note[state.lang]}`;
}
$('fit-trench').checked = state.fit;
$('fit-trench').addEventListener('change', (e) => { state.fit = e.target.checked; keepParams(); renderLegend(); update(); });
function keepParams() {
  const params = new URLSearchParams(location.search);
  if (state.fit) params.set('trench', 'paleodem'); else params.delete('trench');
  if (state.outcrops) params.set('outcrops', '1'); else params.delete('outcrops');
  if (state.geology) params.set('geology', '1'); else params.delete('geology');
  if (state.shackleton) params.set('shackleton', '1'); else params.delete('shackleton');
  params.set('limestone', String(state.limestoneKm));
  if (state.outcrops) params.set('upper', String(state.byrdUpperKm)); else params.delete('upper');
  history.replaceState(null, '', `?${params}`);
}
$('show-limestone').checked = state.shackleton;
$('show-limestone').addEventListener('change', (e) => { state.shackleton = e.target.checked; keepParams(); renderLimestoneNote(); update(); });
// The lower Byrd Group is the Shackleton Limestone: its two thickness menus are one setting.
for (const id of ['limestone-km', 'byrd-lower-km']) {
  $(id).value = String(state.limestoneKm);
  $(id).addEventListener('change', (e) => {
    state.limestoneKm = Number(e.target.value);
    for (const other of ['limestone-km', 'byrd-lower-km']) $(other).value = String(state.limestoneKm);
    keepParams(); update();
  });
}
$('byrd-upper-km').value = String(state.byrdUpperKm);
$('byrd-upper-km').addEventListener('change', (e) => { state.byrdUpperKm = Number(e.target.value); keepParams(); update(); });
function renderLimestoneNote() {
  const note = $('limestone-note');
  const area = state.data?.meta.section.shackleton_area;
  note.hidden = !state.shackleton || !area;
  if (area) note.textContent = `${area.note[state.lang]} ${area.thickness_note[state.lang]}`;
}
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
  const c = cropOf();
  const along = [xAt(c.i0) * 1000, xAt(c.i1) * 1000];
  const across = [-zAt(c.j0) * 1000, -zAt(c.j1) * 1000];
  const depth = depthShownKm(state.ve);
  const target = new THREE.Vector3((along[0] + along[1]) / 2000, yOf(-depth) / 2.4, -(across[0] + across[1]) / 2000);
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

// Close up on the Shackleton Limestone area, or back to the whole block.
let flight = null;
function flyTo(target, position) {
  flight = { from: [controls.target.clone(), camera.position.clone()], to: [target, position], t: 0 };
}
function closeUp() {
  const target = new THREE.Vector3(0.02, yOf(-6), -0.1);
  flyTo(target, target.clone().add(new THREE.Vector3(-0.25, 0.28, 0.62)));
}
function wholeBlock() {
  const saved = [controls.target.clone(), camera.position.clone()];
  aim(true);
  const to = [controls.target.clone(), camera.position.clone()];
  controls.target.copy(saved[0]);
  camera.position.copy(saved[1]);
  flyTo(...to);
}
$('close-up').addEventListener('click', closeUp);
$('reset-box').addEventListener('click', () => { state.crop = null; cropOf(); keepBox(); update(); });
$('whole').addEventListener('click', wholeBlock);
function stepFlight(dt) {
  if (!flight) return;
  flight.t = Math.min(1, flight.t + dt / 1.2);
  const e = flight.t < 0.5 ? 2 * flight.t * flight.t : 1 - (-2 * flight.t + 2) ** 2 / 2;
  controls.target.lerpVectors(flight.from[0], flight.to[0], e);
  camera.position.lerpVectors(flight.from[1], flight.to[1], e);
  if (flight.t >= 1) flight = null;
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
  stepFlight(dt);
  // Keep the locality pin about the same size on screen at any distance.
  pin.scale.setScalar(Math.min(1, camera.position.distanceTo(pin.position) / 4));
  frameView();
  controls.update();
  showHandles();
  renderer.render(scene, camera);
  renderInset();
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
window.cplates = { state, goTo, setVe, camera, controls, visibleRect, insetRect, closeUp, globeView, globeCamera, handles, update, globeShown: () => globeShown,
  flowCount: () => particles.life.filter((v) => v > 0).length,
  geology: () => ({ visible: geologyLayer.mesh.visible, states: geologyLayer.key }),
  byrd: () => ({ visible: byrdLayer.mesh.visible, state: byrdLayer.key, cells: state.data.meta.outcrops.cells.length }) };
