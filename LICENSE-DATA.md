# Data licence

The code of CPlates is under the MIT licence (`LICENSE`). The data is not code, and its
terms follow the sources it was made from.

## Derived data this project publishes: CC BY 4.0

The files `scripts/build_frames.py` writes under `site/data/` are computed from the
plate models below and released under
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/):

- the resolved plate boundaries and plate polygons for each age, the continental-crust
  mask reconstructed to each age, and the packed rotation file, for each of two models:
  **Merdith et al. (2021)** (`site/data/merdith2021/`, CC BY 3.0, EarthByte) and
  **Müller et al. (2022)** (`site/data/muller2022/`, Zenodo record 13636799, CC BY 4.0).

For the Cambrian Antarctica page (`scripts/build_cambrian.py`, `site/data/cambrian/`):

- the triangulated continents from **Merdith et al. (2021)** (its boundaries and rotations
  are the main page's `site/data/merdith2021/`), CC BY 3.0 (EarthByte). Its rotation file is byte-identical to
  the palaeomagnetic one in the Müller et al. 2022 Zenodo record, which states CC BY 4.0;
- the coloured PaleoDEM grids and the heights read along the Transantarctic Mountains,
  from **Scotese & Wright (2018)** PaleoDEMs, CC BY 4.0 (License.txt in the archive);
- the packed PALEOMAP rotations, used to place points on those grids, from **Scotese
  (2016)** PALEOMAP PaleoAtlas for GPlates, whose Zenodo record lists CC BY 4.0. Only the
  rotation file and plate polygons are used, as in EarthThruTime3D;
- the Transantarctic Mountains outline from **Natural Earth** (public domain);
- the observation list `sources/observations/cambrian_antarctica.json`, this project's
  compilation with its references, CC BY 4.0.

Attribution: "CPlates (PaleoBytes), derived from <source>" naming the model or dataset, with the citation
in `sources/plate-models/muller2022.json`. The page shows the citation, the licence and
the authors' stated limits whenever the globe is open. The source's own CC BY licence
still applies to what was derived from it.

## Tools

The topologies are resolved with **pygplates** 1.0.0, which is GPL-2.0-only (checked in
the wheel's `COPYING` and package metadata on 2026-11-12). It runs only in the offline
processing step and is not distributed with the site. Under GPLv2 section 0 the output of
a program is covered only if it is itself a work based on the program; the geometry it
returns is computed from the CC BY plate model, so the CC BY 4.0 terms above are not
changed by it.

## Source datasets

The archives under `data/sources/` are not part of this repository. Each is pinned by a
manifest under `sources/plate-models/` that records its URL, size, sha256, licence and
citation; the terms are the publishers'. The licence entries were carried over from
EarthThruTime3D (`sources/plate-models/`, `LICENSE-DATA.md` at be59c3a).
