# CPlates

A PaleoBytes project that reconstructs the motion of Earth's tectonic plates and shows it
in 3D.

It builds on [EarthThruTime3D](https://github.com/jikhanjung/EarthThruTime3D), which covers
the palaeogeographic surface through time. CPlates focuses on the plates themselves: their
boundaries, rotations and motion through time, shown on a 3D globe.

Status: first screen. The globe shows the plates of Müller et al. (2022) from 250 Ma to
the present, one frame per million years: ridges, subduction zones (with teeth on the
overriding plate) and transforms, a colour per plate, continental crust riding on the
plates, and the speed and heading of the plate under any point you click.

## Running it locally

```sh
make setup      # Python 3.12 venv with pygplates, numpy, pillow; npm for Three.js and Playwright
make fetch      # download and verify the pinned plate model (12 MB, not in git)
make frames     # resolve the topologies into site/data/ (about 3 minutes, 26 MB)
make serve      # http://127.0.0.1:8350/
make test       # rotation tests, and the browser maths checked against pygplates
```

The site is static: `site/` with Three.js vendored under `site/vendor/three/`. Nothing is
loaded from a CDN. See `devlog/` for the plan (jikhanjung P01) and work records.

## 한국어

지각 판의 움직임을 재구성해 3D 로 보여 주는 PaleoBytes 공개 프로젝트입니다.
시간에 따른 고지리 지표면을 다루는 EarthThruTime3D 를 참고하되, 판 자체(경계, 회전,
이동)를 3D 지구본에서 보여 주는 데 집중합니다.

지금은 첫 화면이 있습니다. Müller et al. (2022) 판 모델로 250 Ma 부터 현재까지 1백만 년마다
판 경계(해령, 섭입대, 변환 단층), 판마다 다른 색, 판을 따라 움직이는 대륙 지각을 보여 주고,
지구본을 누르면 그 자리 판의 속도와 방향이 나옵니다. 화면은 한국어가 기본이고 KO | EN 으로
바꿀 수 있습니다.

## Licence

Code: MIT ([LICENSE](LICENSE)). Derived plate data: CC BY 4.0 with attribution to the
source model; see [LICENSE-DATA.md](LICENSE-DATA.md).
