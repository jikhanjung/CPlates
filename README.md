# CPlates

A PaleoBytes project that reconstructs the motion of Earth's tectonic plates and shows it
in 3D.

It builds on [EarthThruTime3D](https://github.com/jikhanjung/EarthThruTime3D), which covers
the palaeogeographic surface through time. CPlates focuses on the plates themselves: their
boundaries, rotations and motion through time, shown on a 3D globe.

Status: the globe shows the plates through the Phanerozoic, 540 Ma to the present, one
frame per million years: ridges, subduction zones (with teeth on the overriding plate) and
transforms, a colour per plate, continental crust riding on the plates, and the speed and
heading of the plate under any point you click. Two plate models can be switched without
losing the age or the view: Merdith et al. (2021), palaeomagnetic frame (default), and
Müller et al. (2022), mantle frame (`?frame=muller2022`). They share relative plate motions
and differ in where the plates sit on the globe.

A second page, `/cambrian/`, follows Antarctica through the Cambrian (540–485 Ma): Gondwana
moving with Merdith et al. (2021), today's Transantarctic Mountains carried back with their
plate, the PaleoDEM sea depth there, and the geological record (Shackleton Limestone, Nelson
Limestone, Ross orogen) marked apart from the models.

A third page, `/section/`, cuts a 3D block along A–A′, from inner East Antarctica through the
Shackleton Limestone to the palaeo-Pacific trench, 540–460 Ma: PaleoDEM relief carried into
Merdith 2021, crust from that relief by Airy isostasy, a schematic slab with analytic corner
flow at Merdith's trench, the Byrd Group record beside the reconstructed setting, and a
choice of vertical exaggeration (1–50×).

## Running it locally

```sh
make setup      # Python 3.12 venv with pygplates, numpy, pillow; npm for Three.js and Playwright
make fetch      # download and verify the pinned sources (about 90 MB, not in git)
make frames     # resolve the topologies, both models, 0–540 Ma (about 25 minutes, ~110 MB)
make cambrian   # the Cambrian Antarctica page's data (about 30 seconds, ~5 MB)
make section    # the A–A′ section block (about a minute, 1.7 MB)
make serve      # http://127.0.0.1:8350/
make test       # rotation tests, and the browser maths checked against pygplates
```

The site is static: `site/` with Three.js vendored under `site/vendor/three/`. Nothing is
loaded from a CDN. See `devlog/` for the plan (jikhanjung P01) and work records.

## 한국어

지각 판의 움직임을 재구성해 3D 로 보여 주는 PaleoBytes 공개 프로젝트입니다.
시간에 따른 고지리 지표면을 다루는 EarthThruTime3D 를 참고하되, 판 자체(경계, 회전,
이동)를 3D 지구본에서 보여 주는 데 집중합니다.

현생누대(540 Ma 부터 현재까지)를 1백만 년마다 보여 줍니다. 기준틀은 Merdith et al. (2021, 고지자기)이
기본이고 Müller et al. (2022, 맨틀)로 바꿔 볼 수 있습니다(`?frame=muller2022`). 두 모델은 판의 상대
운동이 같고 판이 놓인 절대 위치만 다릅니다. 판 경계(해령, 섭입대, 변환 단층), 판마다 다른 색, 판을 따라 움직이는 대륙 지각을 보여 주고,
지구본을 누르면 그 자리 판의 속도와 방향이 나옵니다. 화면은 한국어가 기본이고 KO | EN 으로
바꿀 수 있습니다.

`/cambrian/` 쪽에서는 캄브리아기(540–485 Ma) 동안 남극대륙이 곤드와나와 함께 움직이는 모습,
지금의 남극종단산맥 자리가 당시 어디에 있었고 PaleoDEM 으로 얼마나 깊은 바다였는지, 그리고
섀클턴 석회암 같은 관측 기록을 모델 결과와 구분해 보여 줍니다.

`/section/` 쪽은 그 위에 그은 단면 A–A′(동남극 내륙 – 섀클턴 석회암 – 고태평양 해구)을 3D 블록으로
잘라 540–460 Ma 동안 보여 줍니다. PaleoDEM 지형, 에어리 평형으로 계산한 지각 두께, 해구의 모식 슬랩과
코너 흐름, 버드층군의 기록, 수직 과장(1–50배) 선택이 있습니다.

## Licence

Code: MIT ([LICENSE](LICENSE)). Derived plate data: CC BY 4.0 with attribution to the
source model; see [LICENSE-DATA.md](LICENSE-DATA.md).
