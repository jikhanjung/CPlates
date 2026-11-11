# jikhanjung 001 — 첫 화면: Müller 2022 판 경계 지구본, 0–250 Ma

2026-11-12. [jikhanjung P01](20261112_jikhanjung_P01_plate_motion_globe_plan.md)의 추천대로
진행하라는 사용자 지시(반장 세션 전달)를 받아 MVP를 만들었다. 정해진 것: 정적 사이트,
Müller 2022, 0–250 Ma 1 Myr, 경계는 pygplates로 오프라인에서 풀기, ETT 코드는 커밋 지정
복사, KO | EN 전환(기본 한국어), 배포 위치는 미정이라 로컬에서만 본다.

## pygplates 라이선스 (관측)

`pygplates` 1.0.0 wheel의 `COPYING`과 패키지 메타데이터: **GPL-2.0-only** ("only valid and
applicable version … version 2"). 처리 단계에서만 돌리고 사이트에 넣지 않는다. GPLv2 0조는
프로그램의 출력이 그 프로그램에 기반한 저작물일 때만 GPL이 미친다고 하므로, CC BY 판 모델에서
계산한 기하 자료의 CC BY 4.0 공개에는 걸리는 조건이 없다고 판단했다. `LICENSE-DATA.md`에 적었다.

이 컴퓨터의 Python 3.14에는 pygplates wheel이 없어 `uv`로 Python 3.12 가상환경(`.venv`)을 만든다
(`make setup`).

## 만든 것

- `sources/plate-models/muller2022.json`: ETT 매니페스트(be59c3a)에 위상 파일 7개(member 역할
  `topologies`)를 더했다. 회전은 `optimisation/1000_0_rotfile_MantleOpt.rot` 하나. 원본의 GPlates
  프로젝트가 기본으로 싣는 맨틀 기준틀이고, 판 계층 전체를 담은 독립 파일임을 확인했다
  (701 → 000 직접, 고지자기 파일은 701 → 070).
- `scripts/fetch_plate_model.py`: ETT be59c3a에서 그대로 복사.
- `scripts/build_frames.py`: 나이마다 `pygplates.resolve_topologies`로 판 경계를 풀어
  - `frames/<age>.json`: 판 목록(인덱스, 판 ID, 이름)과 경계 조각(종류, 섭입 방향, 양쪽 판,
    1° 간격으로 나눈 좌표, 소수 둘째 자리),
  - `frames/<age>.png`(2048×1024 정거원통): R = 판 인덱스, G = 그 나이로 돌린 대륙 지각,
  - `rotations.json`(ETT `pack_plates.py`의 `rotations()` 복사)과 `model.json`(인용·라이선스·한계).
  날짜변경선과 극을 넘는 다각형은 `pygplates.DateLineWrapper`로 나눠 PIL로 칠한다.
- `site/`: 번들러 없는 ES 모듈. Three.js 0.186.0을 `npm run vendor`로 복사(ETT와 같은 판, 굵은 선
  모듈 추가). `site/js/rotation.js`는 ETT be59c3a 복사.
  - 지구본 셰이더가 조각 자신의 경위도로 PNG를 읽는다. UV 이음매가 없고 클릭도 같은 계산으로 CPU에서
    판 인덱스를 찾는다.
  - 경계: 확장(MidOceanRidge, ContinentalRift) 빨강, 섭입 노랑 + 위에 올라탄 판 쪽 톱니, 변환
    (Transform, FractureZone) 초록, 나머지 회색.
  - 클릭: 그 자리 판의 이름·ID·위치, 앞 1 Myr 평균 속도(cm/년)와 방향, 속도에 비례한 화살표.
    고른 점은 판을 따라 다른 나이로 옮겨 간다.
  - 시간 막대(왼쪽이 250 Ma), 기(period) 색띠(ICS 2023/09), 재생·일시정지, 속도 ×1/×2/×4. 현재에서
    재생을 누르면 250 Ma부터 현재로 간다. 재생 중에도 끌어서 돌리고 확대할 수 있다.
  - 출처 칸: 인용과 DOI, 기준틀과 저자의 경고, 처리 방법, 파생 자료 라이선스, "모두 재구성 결과".

## 확인 (관측)

- 처리: 251 프레임, 26.4 MB, 174초. 프레임당 판 11–46개, 경계 조각 68–247개.
- `make test` 11개 통과. ETT에서 옮긴 회전 시험 8개와, pygplates가 만든 기준값
  (`tests/fixtures/muller2022.json`, 판 8개 × 나이 7개 중 판이 있는 55건)에 대해
  `rotation.js`의 위치가 0.001° 안, 속도가 1% 안, 방향이 2° 안에서 맞는다.
  pygplates는 판이 없는 나이에서 항등 회전을 돌려주므로 그런 경우는 기준값에서 뺐다.
- 섭입 방향: 현재 남아메리카 해구 조각은 남→북 방향에 극성 R, 톱니가 남아메리카 쪽에 그려짐을
  화면에서 확인했다.
- 하와이 근처 태평양판(901): 7.0 cm/년, 302°(북서). 맨틀 기준틀에서 예상되는 범위다.
- `tests/browser.mjs`(Playwright, 소프트웨어 WebGL): 오류 없이 그려짐, 클릭 정보, 200 Ma 영어 화면,
  재생 중 시점 돌리기, 390 px 폭에서 가로 스크롤 없음. 스크린샷은 `test-results/`.

## 한계와 남은 일

- 프레임 사이는 보간하지 않는다. 경계는 원래 나이마다 불연속으로 바뀌므로 1 Myr 단위로만 보여 준다.
- 판 칠과 대륙은 0.18°/픽셀 그림이라 확대하면 계단이 보인다. 경계선은 벡터라 매끈하다.
- 판 색은 판 ID로 열 가지 중에서 고르므로 이웃한 판이 같은 색일 수 있다(경계선으로 구분됨).
- `site/data/`는 git에 넣지 않는다. 처음 받은 사람은 `make fetch frames`를 돌려야 화면이 나온다.
  배포 방식이 정해지면 자료를 어떻게 실을지 함께 정한다.
- 다음 후보: Merdith 2021(고지자기 기준틀) 전환, 1000 Ma까지, 속도 화살표 격자, Cao 2024.
