# jikhanjung P01 — 판 움직임 3D 지구본: EarthThruTime3D 조사와 첫 계획

작성 2026-11-12. 반장 세션을 거쳐 사용자가 맡긴 첫 작업이다. 구현은 아직 시작하지 않았다.
EarthThruTime3D(아래 ETT)는 `~/projects/EarthThruTime3D`, `be59c3a` 기준으로 읽기만 했다.

이 문서에서 **관측**은 ETT 저장소와 자료 파일을 직접 확인한 것, **판단**은 그것을 바탕으로 한
작성자의 추천, **미확인**은 확인하지 않고 적어 둔 것이다.

## 1. ETT 조사 결과

### 1.1 판 모델과 회전 자료 (관측)

ETT는 판 모델마다 `sources/plate-models/<id>.json` 매니페스트(schema v2)를 두고 원본 압축 파일의
URL, 크기, sha256, 쓰는 파일(member)과 역할, 인용, 라이선스, 저자가 밝힌 한계를 기록한다.
원본 압축 파일은 `data/sources/plates/<id>/archive.zip` 에 받아 두고 저장소에는 넣지 않는다.

| id | 모델 | 시간 범위 | 기준틀 | 라이선스 | 원본 |
|---|---|---|---|---|---|
| `merdith2021` | Merdith et al. 2021, ESR 214, 103477 | 0–1000 Ma | 고지자기 | CC BY 3.0 | EarthByte FTP, `SM2-…_v1.2.4.zip` (8.6 MB) |
| `muller2022` | Müller et al. 2022, Solid Earth 13 | 0–1000 Ma | 최적화된 맨틀 기준틀 | CC BY 4.0 | Zenodo 13636799 (11.6 MB) |
| `cao2024` | Cao et al. 2024, Geosci. Frontiers 15(2) | 0–1800 Ma | 고지자기, 1.8 Ga까지 확장 | CC BY 4.0 | Zenodo 13340841 (20.7 MB) |
| `matthews2016` | Matthews et al. 2016, GPC 146 | 0–410 Ma | 혼합 맨틀(GK07) | CC BY 4.0 | Zenodo 10526157 (10.7 MB) |
| `paleomap2016` | Scotese 2016 PALEOMAP PaleoAtlas for GPlates | 0–1100 Ma | PALEOMAP (판 001 이 항등) | CC BY 4.0 (Zenodo 기재) | Zenodo 10251792 (58 MB) |
| `torsvikcocks2017` | Torsvik & Cocks 2017, CEED6 | 0–540 Ma | 혼합 고지자기 | **라이선스 없음, 비공개** | earthdynamics.org |

형식: 회전은 GPlates `.rot`(텍스트, 전체 재구성 극), 도형은 GPML(XML) 또는 `.gpmlz`(gzip),
Matthews 2016과 Torsvik & Cocks는 shapefile.

매니페스트에 적힌 저자들의 한계 (요약):

- Merdith 2021: 순수 고지자기 기준틀. 태평양 열점 운동학이나 5 Ma보다 짧은 분석에는 맞지 않는다.
  선캄브리아 경도는 약하게 묶여 있다.
- Müller 2022: 기후 관련 분석은 고지자기 기준틀을 쓰라고 하고, Merdith의 경고를 되풀이한다.
- Cao 2024: 1 Ga 이전 절반은 다른 원 모델에서 와서 앞뒤가 한 개의 연속 재구성이 아니다.
- Matthews 2016: 후기 고생대 이후만. 대륙 다각형만 있어 윤곽이 거칠다.
- PALEOMAP 2016: 고생대 경도 규칙을 밝히지 않는다. 다각형은 대륙붕을 포함한 덩어리다.

### 1.2 ETT가 판 자료로 하는 일 (관측)

- `scripts/fetch_plate_model.py`: 매니페스트대로 받아 sha256을 확인한다.
- `scripts/pack_plates.py` (277줄): GPML·shapefile을 읽어 **continents / coastlines** 도형만
  Douglas–Peucker 0.12°로 줄이고(Merdith 75,000점 → 15,000점), 회전 파일을
  `"moving:fixed"` 키의 평평한 배열 `[time, lat, lon, angle, …]` 로 묶어 JSON으로 쓴다.
  결과 크기: `rotations.json` 137–205 KB, `continents.json` 167–301 KB, `coastlines.json` 약 530 KB.
- `scripts/rotation_model.py` (146줄)와 `static/core/rotation.js` (133줄): 같은 알고리즘의
  Python판과 JS판. 사원수로 회전을 만들고, 고정판 사슬을 따라 앵커(0)까지 합성하며, 두 표본
  사이에서는 극이 아니라 **표본 사이의 상대 회전을 slerp로 나눈다**. 한 판이 시기에 따라 기준
  판을 바꾸는 경우를 처리하고, 나이별 캐시를 둔다. 의존성이 없다.
- `scripts/check_rotation_against_gws.py`: Python판을 GPlates Web Service
  (`gws.gplates.org/reconstruct/reconstruct_points`)와 비교한다. `tests/rotation.test.mjs` 가
  JS판과 Python판을 맞춘다.
- 화면: 지구본의 "판 재구성" 토글이 Merdith 2021 대륙 윤곽을 나이마다 다시 회전해 덧그린다
  (`docs/globe-viewer.md` "The plate model overlay"). 서버는 `/plates/<name>.json` 을 세 이름
  허용 목록으로만 내준다.
- Three.js 0.186.0을 `npm run vendor` 로 `static/vendor/three/` 에 복사해 쓴다. CDN 요청 없음.
  번들러 없이 ES 모듈. 시험은 `node --test` 와 Playwright.
- 스택: Django 5.2 + whitenoise, Docker 이미지, dolfinid 호스트의 Nginx 뒤 8014 포트.
  SQLite 백업 경로와 공용 배포 규약(`devdocs/guides/web/`)을 따른다.

### 1.3 ETT가 하지 않는 일 — CPlates가 채울 자리 (관측)

**ETT는 판 경계를 풀지 않는다.** 대륙 윤곽을 판 ID대로 돌릴 뿐, 위상 판 다각형(topological
plate polygons)이나 경계 종류(확장·수렴·변환)를 계산하지 않는다. 예외는 인도–아시아 단면으로,
Müller 2022 OPT1 보충 자료에 **미리 계산되어 들어 있는** 판 경계(`.vtu`)를 읽어 쓴다.
`requirements-processing.txt` 에 pygplates는 없다.

그런데 받아 둔 원본 압축 파일에는 경계 자료가 이미 들어 있다:

- Merdith 2021: `250-0_plate_boundaries`, `410-250_plate_boundaries`, `1000-410-Topologies`,
  `-Convergence`, `-Divergence`, `-Transforms`, `TopologyBuildingBlocks`, `shapes_static_polygons`
- Müller 2022: `Topologies/` 아래 같은 구성, `StaticPolygons/`, `no_net_rotation_model.rot`
- Cao 2024: 1800–0 Ma 구간별 `plate_boundaries`, `static_polygons.gpmlz`
- Matthews 2016: `Topologies/` 의 Mesozoic–Cenozoic, Paleozoic 경계, 정적 판 다각형
- PALEOMAP 2016: 경계 자료 없음 (대륙 다각형과 회전뿐)

위상 경계는 "여러 선분 조각의 교차로 닫힌 다각형을 시점마다 만든다"는 규칙으로 정의돼 있어,
회전만으로는 그릴 수 없다. GPlates의 위상 풀이(topology resolution)가 필요하다.

### 1.4 데이터 라이선스 조건 (LICENSE-DATA.md, 관측)

- 코드는 MIT. 데이터는 출처의 조건을 따른다.
- CC BY 출처에서 계산한 파생 자료(판 다각형·회전 묶음 포함)는 **CC BY 4.0**으로 공개하고,
  표기는 "EarthThruTime3D (PaleoBytes), derived from …" + 원 자료 인용. 원 자료의 CC BY 조건은
  파생물에 그대로 남고, 인용을 화면(About 쪽)에 둔다.
- 조건이 정리되지 않은 것: PALEOMAP PaleoAtlas 2016 래스터에서 뽑은 마스크(Zenodo 기재 CC BY 4.0을
  누가 붙였는지 확인 못 함), 2002 PALEOMAP 웹 지도(인터넷 게시에 저자 동의 필요).
  **Torsvik & Cocks 2017은 라이선스가 없어 공개하지 않는다.**
- 원본 압축 파일은 저장소에 넣지 않고 매니페스트로 고정한다.

CPlates에 그대로 옮길 수 있는 규칙이다. PALEOMAP 2016은 ETT도 회전·다각형만 쓰고 래스터는
풀지 않는다.

### 1.5 재사용할 수 있는 것 (판단)

| ETT 쪽 | CPlates에서 | 비고 |
|---|---|---|
| `static/core/rotation.js`, `tests/rotation.test.mjs` | 그대로 가져와 회전·속도 계산의 핵심으로 | 의존성 없음, 검증됨 |
| `scripts/rotation_model.py`, `check_rotation_against_gws.py` | 그대로 | 회귀 검사 |
| `sources/plate-models/*.json` 형식과 `fetch_plate_model.py` | 형식을 따르고 경계 파일 member를 더함 | |
| `pack_plates.py` 의 회전 묶음 형식 | 그대로 | 대륙 윤곽 묶기도 재사용 |
| Three.js 판, 벤더 방식, Playwright 시험 | 따름 | |
| `LICENSE-DATA.md`, `sources/README.md` 체계 | 본떠서 작성 | |

두 저장소 모두 MIT이고 소유자가 같아 복사에 라이선스 문제는 없다. 지구본 본체
`static/core/globe.js` 는 3,296줄로 고지리 표면·기후 레이어와 엉켜 있어 통째로 가져오기보다
필요한 조각(투영, 카메라, 경계 넘김 처리)만 참고하는 편이 낫다.

## 2. 첫 목표 (MVP)

처음 보여 줄 화면 한 장:

> 회전하는 3D 지구본 위에, 고른 나이의 **판 경계**가 종류별 색으로 그려지고(확장 경계,
> 섭입대는 섭입 방향 톱니, 변환 단층), 판마다 다른 옅은 색으로 칠해지며, 회색 대륙이 판을
> 따라 움직인다. 아래 시간 막대로 0–250 Ma를 끌거나 재생한다. 판을 누르면 판 이름·ID와 그
> 자리의 속도(cm/yr, 방향)가 나온다. 화면 구석에 모델 이름과 인용이 늘 보인다.

포함: 한 모델(아래 3절), 1 Myr 간격, 경계·판 칠·대륙·시간 막대·판 정보·출처 표기.
제외: 속도 화살표 격자, 여러 모델 비교, 섭입판 나이, 맨틀, 평면 투영, 다국어.
이것들은 MVP 다음 단계 후보로 둔다.

0–250 Ma로 시작하는 까닭: 해양 지각 기록이 남은 구간이라 경계가 가장 잘 묶여 있고, 처리할
프레임 수가 작아 자료 크기와 처리 시간을 먼저 재 볼 수 있다. 같은 파이프라인으로 1000 Ma까지
늘리는 것은 다음 단계다.

## 3. 판 모델 선택 (판단)

- **기본: Müller et al. 2022** (CC BY 4.0, 0–1000 Ma, 최적화된 맨틀 기준틀).
  "판이 어떻게 움직였나"를 보여 주는 화면이므로 절대 속도가 맨틀에 대해 의미 있는 기준틀이
  맞다. 위상 경계·정적 다각형·회전이 한 Zenodo 기록에 다 있다.
- **두 번째: Merdith et al. 2021** (CC BY 3.0). 위상 경계는 Müller 2022와 같은 계열이고 기준틀만
  고지자기다. 같은 경계를 두 기준틀로 바꿔 보여 주면 "기준틀에 따라 절대 운동이 달라진다"를
  설명할 수 있다. ETT 오버레이의 기본 모델이라 두 사이트가 맞물리기도 쉽다.
- 다음 단계: **Cao et al. 2024** (1.8 Ga). 1 Ga 앞뒤가 다른 원 모델이라는 한계를 화면에 밝힌다.
- 쓰지 않음: Matthews 2016 (범위가 좁고 위 모델들에 대체됨), PALEOMAP 2016 (경계 자료 없음,
  대륙 비교용으로만 나중에 고려), Torsvik & Cocks 2017 (라이선스 없음).
- 미확인 후보: Müller et al. 2019 (Tectonics, 0–250 Ma, 변형 네트워크 포함) 등 EarthByte의
  다른 모델. ETT가 다루지 않아 이번에 조사하지 않았다.

파생 자료(풀어 둔 경계·다각형, 묶은 회전)는 ETT처럼 CC BY 4.0으로 내고
"CPlates (PaleoBytes), derived from …" + 원 인용을 붙인다. `LICENSE-DATA.md` 를 새로 만든다.

## 4. 기술 스택

### 핵심 결정: 위상 경계를 어디서 푸나

| 방법 | 장점 | 단점 |
|---|---|---|
| A. 오프라인에서 pygplates로 미리 풀어 나이별 JSON으로 | GPlates와 같은 결과. 브라우저는 그리기만 | 나이 간격이 고정, 자료 크기 |
| B. 브라우저에서 직접 풀기 | 임의의 나이 | GPlates 위상 풀이를 JS로 다시 짜야 함. 크고 틀리기 쉬움 |
| C. 요청마다 서버에서 pygplates로 | 임의의 나이 | 계산 서버 필요, 느림, 운영 부담 |
| D. GPlates Web Service 호출 | 구현 적음 | 외부 서비스 의존, 가용성·속도·모델 선택 제약 |

**추천: A.** pygplates 1.0.0이 PyPI에 있다(관측: `pip index versions`). 이 컴퓨터에는 아직
설치돼 있지 않다. 경계는 원래 시점마다 불연속으로 바뀌므로 1 Myr 프레임을 그대로 보여 주는 것이
정직하다. 대륙과 판 칠은 `rotation.js` 로 임의의 나이에 정확히 돌릴 수 있고, 속도도 브라우저에서
두 나이의 회전 차이(단계 극)로 바로 계산된다. 즉 "경계는 프레임, 움직임은 연속"으로 나눈다.

pygplates 라이선스는 **미확인**(GPlates 계열이라 GPL로 알고 있으나 확인 필요). 오프라인 처리
도구로만 쓰고 배포물에 넣지 않으면 CPlates 코드(MIT)와 출력 자료의 라이선스에는 영향이 없을
것으로 보지만, 처리 스크립트 의존성으로 명시하기 전에 확인한다.

### 웹 쪽: 정적 사이트 추천

**추천: 정적 사이트** — 번들러 없는 ES 모듈 + ETT와 같은 판의 Three.js 벤더 복사 +
`node --test` / Playwright. 서버 코드 없음.

근거:

- MVP에는 서버가 할 일이 없다. 사용자 자료도, 로그인도, 데이터베이스도 없다. 모든 자료는
  처리 단계에서 미리 만든 정적 파일이다.
- Django로 가면 ETT처럼 Docker 이미지, SQLite 백업 경로, 공용 배포 규약의 데이터 안전 절차를
  모두 지게 된다. 데이터베이스가 없는 사이트에 그 비용을 낼 까닭이 없다.
- 공개 저장소라 GitHub Pages에 바로 올릴 수 있고, dolfinid Nginx의 정적 디렉터리로도 같은 결과물을
  그대로 낼 수 있다. 나중에 서버 기능(임의 나이 계산, 사용자 주석)이 필요해지면 그때 API를 붙인다.
- ETT와 같은 프런트엔드 방식이라 `rotation.js` 등을 손대지 않고 옮길 수 있다.

Django가 나은 경우: ETT처럼 관리자 화면에서 출처를 등록·편집하거나, 요청마다 pygplates를
돌려야 할 때. 지금 계획에는 해당하지 않는다.

### 디렉터리 초안

```
sources/plate-models/   매니페스트 (ETT 형식 + 경계 파일 member)
scripts/                fetch, resolve_topologies.py (pygplates), pack, rotation 검사
data/sources/           원본 압축 파일 (git 밖)
site/                   정적 사이트: index.html, js/, vendor/three/, data/<model>/
tests/                  node --test, Playwright
devlog/
```

### 자료 크기 (미확인 — 처리 시작 전 첫 측정 항목)

ETT의 대륙 묶음이 모델당 약 300 KB이다. 나이별 경계+판 다각형을 줄여 프레임당 50–200 KB로
잡으면 0–250 Ma(251 프레임)는 13–50 MB, 0–1000 Ma는 50–200 MB가 된다. 프레임을 나이 구간별
묶음으로 나눠 필요할 때 받고, 판 다각형은 경계 조각의 ID 목록으로 표현해 중복을 줄이는 방안을
검토한다. 실제 크기는 첫 처리 결과로 확인한다.

## 5. ETT와의 관계

| | ETT | CPlates |
|---|---|---|
| 질문 | 그때 지표가 어떻게 생겼나 (해안, 고도, 기후, 얼음) | 판이 어떻게 나뉘고 움직였나 |
| 중심 자료 | PALEOMAP 지도·PaleoDEM 래스터 | 판 모델의 회전과 위상 경계 |
| 판 자료 | 대륙 윤곽 회전 오버레이 | 경계 풀이, 판 다각형, 속도 |
| 스택 | Django + Docker + SQLite | 정적 사이트 (추천) |

- 겹치는 부분: 회전 합성 코드, 판 모델 매니페스트와 받기 스크립트, 데이터 라이선스 체계,
  Three.js 지구본 방식.
- 나눌 부분: 고지리 표면·기후·얼음·해류·맨틀은 ETT에 남긴다. 판 경계와 판 운동은 CPlates가 맡는다.
- 공유 방식 추천: **처음에는 ETT의 특정 커밋에서 복사**하고, 파일 머리에 출처 커밋을 적는다.
  두 쪽이 함께 바뀌기 시작하면 그때 작은 공용 패키지로 뺀다. 처음부터 공용 패키지나 하위
  모듈로 묶으면 두 저장소의 배포가 서로 묶인다.
- 나중 연결: CPlates가 만든 나이별 경계 묶음을 ETT가 오버레이로 읽을 수 있다(CC BY 4.0 자료라
  표기만 하면 된다). ETT 쪽 변경은 ETT에서 따로 정한다.

## 6. 진행 순서 (제안)

1. 저장소 뼈대, `LICENSE-DATA.md`, `sources/` 매니페스트 (Müller 2022, Merdith 2021).
2. pygplates로 0–250 Ma, 1 Myr 위상 풀이 → 프레임 크기·처리 시간 측정, 결과를 GPlates와 몇
   나이에서 눈으로 비교.
3. 지구본에 한 나이의 경계·판 칠·대륙 그리기.
4. 시간 막대, 재생, 판 클릭 정보와 속도.
5. 출처 표기, 시험, 첫 공개.

## 7. 사용자가 판단할 질문

1. **스택**: 정적 사이트(추천)로 갈지, ETT와 같은 Django로 갈지.
2. **배포 위치**: GitHub Pages(공개 저장소라 간단)인지, dolfinid의 새 하위 도메인인지.
3. **기본 모델**: Müller 2022(맨틀 기준틀, 추천)인지, ETT와 같은 Merdith 2021(고지자기)인지.
4. **MVP 시간 범위**: 0–250 Ma로 먼저(추천)인지, 처음부터 0–1000 Ma인지.
5. **pygplates 사용**: 오프라인 처리에 pygplates(라이선스 확인 예정)를 쓰는 것에 동의하는지.
6. **ETT 코드 공유**: 복사로 시작(추천)인지, 처음부터 공용 패키지인지.
7. **화면 언어**: ETT처럼 한국어 기본에 영어를 둘지, 처음부터 영어 기본인지.
