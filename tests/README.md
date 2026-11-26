# Studio regression tests

All suites run the real app in headless Chrome against a **mocked** Spotify Web API. No Spotify account or network access is needed, and no real tokens are used.

- `playback_tests.py` (58 checks): uses `sim.py`, a stateful Spotify player simulator (contexts, user queue, shuffle order, repeat, devices, progress and track transitions). Each check verifies that Spotify's simulated state *and* every Studio surface (home, mini-player, expanded player, ambient) agree after the action, not just that an HTTP call succeeded. It covers skips, rapid skips, album offsets, previous/restart, shuffle and queue, repeat modes, pause/resume, seek, external changes, device transfer, reopen, folded/unfolded/wide layouts, expired tokens, delayed application by Spotify, stale out-of-order responses, network loss, 429 Retry-After, restrictions, inactive devices and diagnostics token safety.
- `controls.py` (69 checks): every interface control on phone, desktop and error/empty states.
- `libtest.py` (27 checks): Library tab.

Run everything: `tests/run_tests.sh` (set `CHROME=/path/to/chrome` if Chrome is not at `/usr/bin/google-chrome`).

These tests cannot prove behaviour of real Spotify apps or devices. See the playback notes in the main README for what still needs checking on a phone.
