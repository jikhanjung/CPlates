#!/usr/bin/env python3
"""Fetch or verify a pinned dataset that is not a plate model (sources/datasets/).

Same manifest shape and checks as scripts/fetch_plate_model.py; only the directories differ.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_plate_model as pinned  # noqa: E402

pinned.MANIFESTS = pinned.ROOT / "sources/datasets"
pinned.HOME = pinned.ROOT / "data/sources/datasets"

if __name__ == "__main__":
    pinned.main()
