# CPlates: build the plate frames offline, then serve a static site.
PY ?= .venv/bin/python
PORT ?= 8350

.PHONY: setup fetch frames cambrian section outcrops fixture test browser serve

setup:            ## Python 3.12 venv for the offline tools (pygplates has no 3.14 wheel)
	uv venv .venv --python 3.12
	uv pip install --python $(PY) -r requirements-processing.txt
	npm install --no-audit --no-fund

fetch:            ## download and verify the pinned archives (plate models, PaleoDEM, Natural Earth)
	$(PY) scripts/fetch_plate_model.py muller2022 merdith2021 paleomap2016
	$(PY) scripts/fetch_dataset.py paleodem naturalearth

frames:           ## resolve topologies 0-540 Ma, 1 Myr apart, for both plate models, into site/data/
	$(PY) scripts/build_frames.py merdith2021 --from 0 --to 540 --step 1
	$(PY) scripts/build_frames.py muller2022 --from 0 --to 540 --step 1

cambrian:         ## the Cambrian Antarctica page's data into site/data/cambrian/ (after `make frames`)
	$(PY) scripts/build_cambrian.py

section:          ## the A–A′ section block into site/data/section/ (after `make frames`)
	$(PY) scripts/build_section.py

outcrops:         ## Byrd Group outcrops from SCAR GeoMAP (fetches 187 MB) into sources/sections/; then `make section`
	$(PY) scripts/fetch_dataset.py geomap
	$(PY) scripts/outcrops_geomap.py

fixture:          ## pygplates reference values for tests/pygplates.test.mjs
	$(PY) scripts/make_test_fixture.py merdith2021 muller2022

test:
	node --test tests/*.test.mjs

browser:          ## headless checks and screenshots (needs `make serve` running)
	node tests/browser.mjs http://127.0.0.1:$(PORT)/

serve:
	python3 -m http.server $(PORT) --bind 127.0.0.1 -d site
