#!/usr/bin/env bash
# Runs all Studio regression suites against a local copy of the site with a mocked Spotify API.
# Requirements: Python 3.10+, `pip install playwright`, and Chrome/Chromium (set CHROME=/path/to/chrome if needed).
set -e
cd "$(dirname "$0")/.."
python3 -m http.server 8765 >/dev/null 2>&1 &
SERVER=$!
trap "kill $SERVER" EXIT
sleep 1
cd tests
python3 playback_tests.py
python3 controls.py
python3 libtest.py
python3 devtest.py
python3 djtest.py
