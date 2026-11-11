# CPlates: build the plate frames offline, then serve a static site.
PY ?= .venv/bin/python
PORT ?= 8350

.PHONY: setup fetch frames fixture test browser serve

setup:            ## Python 3.12 venv for the offline tools (pygplates has no 3.14 wheel)
	uv venv .venv --python 3.12
	uv pip install --python $(PY) -r requirements-processing.txt
	npm install --no-audit --no-fund

fetch:            ## download and verify the pinned plate model archive
	$(PY) scripts/fetch_plate_model.py muller2022

frames:           ## resolve topologies 0-250 Ma, 1 Myr apart, into site/data/
	$(PY) scripts/build_frames.py muller2022 --from 0 --to 250 --step 1

fixture:          ## pygplates reference values for tests/pygplates.test.mjs
	$(PY) scripts/make_test_fixture.py muller2022

test:
	node --test tests/*.test.mjs

browser:          ## headless checks and screenshots (needs `make serve` running)
	node tests/browser.mjs http://127.0.0.1:$(PORT)/

serve:
	python3 -m http.server $(PORT) --bind 127.0.0.1 -d site
