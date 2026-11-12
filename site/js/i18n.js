// Korean is the source language, as in EarthThruTime3D; English sits beside it.
// The choice is kept per viewer in localStorage when the browser allows it, and `?lang=`
// overrides it for a link.

export const STRINGS = {
  ko: {
    title: 'CPlates — 판의 움직임',
    heading: '판의 움직임',
    subtitle: '판 경계와 판의 이동을 3D 지구본에서',
    toCambrian: '캄브리아기의 남극대륙 자세히 (540–485 Ma) →',
    frameLabel: '기준틀',
    frameShort: { merdith2021: '고지자기 기준틀 (Merdith 2021)', muller2022: '맨틀 기준틀 (Müller 2022)' },
    frameNote: {
      merdith2021: '고지자기 기준틀. Müller 2022와 판의 상대 운동과 경계는 거의 같고, 대륙과 판이 놓인 절대 위치가 다릅니다.',
      muller2022: '맨틀 기준틀. Merdith 2021과 판의 상대 운동과 경계는 거의 같고, 대륙과 판이 놓인 절대 위치가 다릅니다.',
    },
    age: '{age} Ma',
    ageLong: '{age}백만 년 전',
    present: '현재',
    play: '재생',
    pause: '일시정지',
    speed: '속도',
    legend: '범례',
    ridge: '확장 경계 (해령·열곡)',
    subduction: '섭입대 (톱니는 위에 올라탄 판 쪽)',
    transform: '변환 단층',
    other: '그 밖의 경계',
    land: '대륙 지각',
    plateFill: '판마다 다른 색',
    clickHint: '지구본을 누르면 그 자리의 판과 속도가 나옵니다.',
    plate: '판',
    plateId: '판 ID',
    speedValue: '{speed} cm/년',
    towards: '{bearing}° 방향 ({compass})',
    velocityNote: '{frame}, 그 앞 1백만 년의 단계 회전으로 잰 속도',
    noPlate: '이 자리에는 이 나이에 풀린 판이 없습니다.',
    pinGone: '고른 지점의 판이 이 나이에는 모델에 없습니다.',
    loading: '불러오는 중…',
    loaded: '{done}/{total} 프레임',
    sourceHeading: '자료',
    sourceBody: '판 경계와 회전: {citation}',
    sourceFrame: {
      merdith2021: '기준틀: 고지자기 기준틀. 저자들은 태평양 열점 운동학과 5백만 년보다 짧은 분석에는 이 모델이 맞지 않으며, 선캄브리아기 경도는 약하게 묶여 있다고 밝힙니다.',
      muller2022: '기준틀: 최적화된 맨틀 기준틀. 저자들은 기후에 민감한 분석에는 고지자기 기준틀을 쓰고, 태평양 열점 운동학과 5백만 년보다 짧은 분석에는 쓰지 말라고 밝힙니다.',
    },
    sourceMethod: '위상 경계는 pygplates({version})로 1백만 년마다 미리 풀었습니다. 프레임 사이를 보간하지 않습니다.',
    licence: '파생 자료: CPlates (PaleoBytes), derived from {title}, {licence}',
    reconstruction: '모두 판 모델의 재구성 결과이며 관측이 아닙니다.',
    collapse: '접기',
    expand: '펼치기',
    error: '프레임을 불러오지 못했습니다: {age} Ma',
    noData: '자료가 없습니다. scripts/build_frames.py 를 먼저 실행하세요.',
    periods: {
      Quaternary: '제4기', Neogene: '신진기', Paleogene: '고진기', Cretaceous: '백악기',
      Jurassic: '쥐라기', Triassic: '트라이아스기', Permian: '페름기', Carboniferous: '석탄기',
      Devonian: '데본기', Silurian: '실루리아기', Ordovician: '오르도비스기', Cambrian: '캄브리아기',
      Ediacaran: '에디아카라기',
    },
  },
  en: {
    title: 'CPlates — plate motion',
    heading: 'Plate motion',
    subtitle: 'Plate boundaries and plate motion on a 3D globe',
    toCambrian: 'Antarctica in the Cambrian, in detail (540–485 Ma) →',
    frameLabel: 'Reference frame',
    frameShort: { merdith2021: 'palaeomagnetic frame (Merdith 2021)', muller2022: 'mantle frame (Müller 2022)' },
    frameNote: {
      merdith2021: 'Palaeomagnetic frame. Relative motions and boundaries are nearly the same as in Müller 2022; where the continents and plates sit on the globe differs.',
      muller2022: 'Mantle frame. Relative motions and boundaries are nearly the same as in Merdith 2021; where the continents and plates sit on the globe differs.',
    },
    age: '{age} Ma',
    ageLong: '{age} million years ago',
    present: 'Present',
    play: 'Play',
    pause: 'Pause',
    speed: 'Speed',
    legend: 'Legend',
    ridge: 'Spreading boundary (ridge, rift)',
    subduction: 'Subduction zone (teeth on the overriding plate)',
    transform: 'Transform fault',
    other: 'Other boundary',
    land: 'Continental crust',
    plateFill: 'One colour per plate',
    clickHint: 'Click the globe to see the plate there and how fast it moves.',
    plate: 'Plate',
    plateId: 'Plate ID',
    speedValue: '{speed} cm/yr',
    towards: 'towards {bearing}° ({compass})',
    velocityNote: 'From the stage rotation over the preceding million years, in the {frame}',
    noPlate: 'No plate resolves here at this age.',
    pinGone: 'The picked plate is not in the model at this age.',
    loading: 'Loading…',
    loaded: '{done}/{total} frames',
    sourceHeading: 'Data',
    sourceBody: 'Plate boundaries and rotations: {citation}',
    sourceFrame: {
      merdith2021: 'Reference frame: palaeomagnetic. The authors state it is unsuitable for Pacific hotspot kinematics or analyses shorter than 5 Myr, and that Precambrian longitude is weakly constrained.',
      muller2022: 'Reference frame: optimised mantle frame. The authors advise the palaeomagnetic frame for climate-sensitive work, and against Pacific hotspot kinematics or analyses shorter than 5 Myr.',
    },
    sourceMethod: 'Topologies resolved in advance with pygplates {version}, one frame per million years. Frames are not interpolated.',
    licence: 'Derived data: CPlates (PaleoBytes), derived from {title}, {licence}',
    reconstruction: 'Everything shown is a plate-model reconstruction, not an observation.',
    collapse: 'Collapse',
    expand: 'Expand',
    error: 'Could not load the frame for {age} Ma',
    noData: 'No data. Run scripts/build_frames.py first.',
    periods: {
      Quaternary: 'Quaternary', Neogene: 'Neogene', Paleogene: 'Paleogene', Cretaceous: 'Cretaceous',
      Jurassic: 'Jurassic', Triassic: 'Triassic', Permian: 'Permian', Carboniferous: 'Carboniferous',
      Devonian: 'Devonian', Silurian: 'Silurian', Ordovician: 'Ordovician', Cambrian: 'Cambrian',
      Ediacaran: 'Ediacaran',
    },
  },
};

// Period boundaries in Ma from the ICS International Chronostratigraphic Chart v2023/09.
export const PERIODS = [
  ['Quaternary', 0, 2.58, '#f9f97f'],
  ['Neogene', 2.58, 23.03, '#ffe619'],
  ['Paleogene', 23.03, 66.0, '#fd9a52'],
  ['Cretaceous', 66.0, 143.1, '#7fc64e'],
  ['Jurassic', 143.1, 201.4, '#34b2c9'],
  ['Triassic', 201.4, 251.902, '#812b92'],
  ['Permian', 251.902, 298.9, '#f04028'],
  ['Carboniferous', 298.9, 358.9, '#67a599'],
  ['Devonian', 358.9, 419.2, '#cb8c37'],
  ['Silurian', 419.2, 443.8, '#b3e1b6'],
  ['Ordovician', 443.8, 486.85, '#009270'],
  ['Cambrian', 486.85, 538.8, '#7fa056'],
  ['Ediacaran', 538.8, 635.0, '#fed96a'],
];

export function periodAt(age) {
  return PERIODS.find(([, young, old]) => age >= young && age < old) ?? PERIODS[PERIODS.length - 1];
}

// Plate names in the model carry the authors' working codes ("Pacific PAC_000_000",
// "SAM_010_000"). Strip the codes and spell out the bare ones; translate the large plates.
const SPELLED = { NAM: 'North America', SAM: 'South America', NFB: 'North Fiji Basin' };
const KOREAN = {
  'Pacific': '태평양판', 'Eurasia': '유라시아판', 'Africa': '아프리카판', 'Antarctica': '남극판',
  'North America': '북아메리카판', 'South America': '남아메리카판', 'Australia': '오스트레일리아판',
  'Somalia Plate': '소말리아판', 'Nazca Plate': '나스카판', 'India': '인도판', 'Arabia': '아라비아판',
  'Philippine Sea Plate': '필리핀해판', 'Caribbean': '카리브판', 'Cocos': '코코스판',
  'Scotia plate': '스코샤판', 'Juan de Fuca': '후안데푸카판', 'Rivera plate': '리베라판',
  'Capricorn Plate': '카프리콘판', 'Caroline Plate': '캐롤라인판', 'Farallon': '패럴론판',
  'Kula': '쿨라판', 'Izanagi': '이자나기판', 'Phoenix': '피닉스판', 'Tethys': '테티스',
};

export function plateName(raw, lang) {
  let name = (raw || '').replace(/\s*\(.*?\)\s*/g, ' ');
  name = name.replace(/\b[A-Z]{2,5}_\d{3}_\d{3}\b/g, '').replace(/_\d+_\d+$/, '');
  name = name.replace(/\s+(from|NW15|GS)\b.*$/, '').trim();
  if (SPELLED[name]) name = SPELLED[name];
  if (/^JUAN_DE_FUCA/.test(raw)) name = 'Juan de Fuca';
  name = name.replace(/_/g, ' ').trim();
  if (lang === 'ko' && KOREAN[name]) return KOREAN[name];
  return name || raw || '—';
}

const COMPASS = {
  ko: ['북', '북동', '동', '남동', '남', '남서', '서', '북서'],
  en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
};

export function compass(bearing, lang) {
  return COMPASS[lang][Math.round(bearing / 45) % 8];
}

export function format(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in values ? values[key] : `{${key}}`));
}

export function initialLanguage() {
  const asked = new URLSearchParams(location.search).get('lang');
  if (asked === 'ko' || asked === 'en') return asked;
  try {
    const kept = localStorage.getItem('cplates-lang');
    if (kept === 'ko' || kept === 'en') return kept;
  } catch { /* storage may be blocked; fall back to Korean */ }
  return 'ko';
}

export function keepLanguage(lang) {
  try { localStorage.setItem('cplates-lang', lang); } catch { /* not essential */ }
}
