"""Stateful mock of the Spotify Web API player, for regression tests."""
import json, time, random, asyncio
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright

def ms(): return int(time.time()*1000)
def mk(i, name, artist, ctx_img):
    return {"id": f"t{i}", "uri": f"spotify:track:t{i}", "name": name, "type": "track", "duration_ms": 180000 + i*1000,
            "artists": [{"name": artist, "id": "ar"+artist[:3]}], "album": {"name": "Album", "images": [{"url": f"https://i.scdn.co/image/a{ctx_img}", "width": 640}]},
            "external_urls": {"spotify": "https://open.spotify.com/track/x"}}

class Sim:
    def __init__(self, seed=7):
        self.rng = random.Random(seed)
        self.tracks = {}
        def add(i, n, a, img):
            t = mk(i, n, a, img); self.tracks[t["uri"]] = t; return t["uri"]
        self.contexts = {
            "spotify:playlist:P1": [add(i, f"Playlist Song {i}", "Chris Stapleton", i % 6) for i in range(1, 13)],
            "spotify:album:A1": [add(100+i, f"Album Track {i}", "Tyler Childers", 2) for i in range(1, 9)],
            "spotify:user:les:collection": [add(200+i, f"Liked Song {i}", "Zach Bryan", 3) for i in range(1, 11)],
        }
        self.devices = [
            {"id": "phone1", "name": "Les’s iPhone", "type": "Smartphone", "is_active": True, "is_restricted": False, "supports_volume": False, "volume_percent": 100},
            {"id": "spk1", "name": "Kitchen speaker", "type": "Speaker", "is_active": False, "is_restricted": False, "supports_volume": True, "volume_percent": 40},
        ]
        self.active = "phone1"; self.ctx = "spotify:playlist:P1"; self.base = list(self.contexts[self.ctx]); self.order = list(self.base)
        self.idx = 0; self.uq = []; self.playing_uq = None
        self.playing = True; self.prog = 30000; self.since = ms(); self.shuffle = False; self.repeat = "off"; self.ts = ms()
        self.log = []; self.apply_delay = 0; self.later = []
        self.valid_token = "tok_SECRET_A"; self.refreshed = 0
        self.rate_next_cmd = 0; self.offline_until = 0; self.delay_next_get = 0
        self.disallows = {}; self.restricted = False; self.no_device = False

    # ---------- model ----------
    def cur(self): return self.playing_uq or (self.order[self.idx] if self.order else None)
    def dur(self): u = self.cur(); return self.tracks[u]["duration_ms"] if u else 0
    def progress(self): return self.prog + (ms() - self.since if self.playing else 0)
    def touch(self): self.ts = ms()
    def settle(self):
        t = ms()
        due = [x for x in self.later if x[0] <= t]; self.later = [x for x in self.later if x[0] > t]
        for _, fn in sorted(due, key=lambda x: x[0]): fn()
        while self.playing and self.cur() and self.progress() >= self.dur():
            over = self.progress() - self.dur(); self.advance(False); self.prog = min(over, 1000); self.since = ms()
    def advance(self, manual=True):
        if self.uq: self.playing_uq = self.uq.pop(0)
        else:
            if self.playing_uq: self.playing_uq = None
            if not manual and self.repeat == "track": pass
            elif self.idx + 1 < len(self.order): self.idx += 1
            elif self.repeat == "context": self.idx = 0
            else: self.playing = False
        self.prog = 0; self.since = ms(); self.touch()
    def back(self):
        if self.playing_uq: self.playing_uq = None
        else: self.idx = max(0, self.idx - 1)
        self.prog = 0; self.since = ms(); self.touch()
    def set_shuffle(self, on):
        if on == self.shuffle: return
        self.shuffle = on; c = self.order[self.idx]
        if on:
            rest = self.order[self.idx+1:] + self.order[:self.idx]
            self.rng.shuffle(rest); self.order = [c] + rest; self.idx = 0
        else:
            self.order = list(self.base); self.idx = self.base.index(c)
        self.touch()
    def start(self, uris_or_ctx, is_ctx, offset):
        self.base = list(self.contexts[uris_or_ctx]) if is_ctx else list(uris_or_ctx)
        self.ctx = uris_or_ctx if is_ctx else None
        i = 0
        if offset:
            if "uri" in offset: i = self.base.index(offset["uri"])
            elif "position" in offset: i = int(offset["position"])
        self.order = list(self.base); self.idx = i; self.playing_uq = None
        if self.shuffle:
            c = self.order[i]; rest = [u for u in self.order if u != c]; self.rng.shuffle(rest); self.order = [c] + rest; self.idx = 0
        self.playing = True; self.prog = 0; self.since = ms(); self.touch()
    def device(self, did=None):
        d = [x for x in self.devices if x["id"] == (did or self.active)][0]
        d = dict(d); d["is_active"] = d["id"] == self.active; d["is_restricted"] = self.restricted; return d
    def state(self):
        if self.no_device: return None
        u = self.cur()
        return {"device": self.device(), "is_playing": self.playing, "progress_ms": int(min(self.progress(), self.dur())), "item": self.tracks.get(u),
                "context": ({"type": self.ctx.split(":")[1], "uri": self.ctx} if self.ctx else None),
                "shuffle_state": self.shuffle, "repeat_state": self.repeat, "timestamp": self.ts, "currently_playing_type": "track",
                "actions": {"disallows": dict(self.disallows)}}
    def queue(self):
        nxt = list(self.uq) + self.order[self.idx+1:]
        if self.repeat == "context": nxt += self.order[:self.idx+1]
        return {"currently_playing": self.tracks.get(self.cur()), "queue": [self.tracks[u] for u in nxt[:20]]}

    # ---------- HTTP ----------
    def mutate(self, fn):
        if self.apply_delay: self.later.append((ms() + self.apply_delay, fn))
        else: fn()
    def handle(self, method, path, q, body):
        self.settle()
        dev = (q.get("device_id") or [None])[0]
        def target_ok():
            if dev and dev not in [d["id"] for d in self.devices]: return False
            return True
        if path == "/me/player" and method == "GET":
            st = self.state(); return (200, st) if st else (204, None)
        if path == "/me/player/queue" and method == "GET": return (200, self.queue()) if not self.no_device else (204, None)
        if path == "/me/player/devices" and method == "GET": return 200, {"devices": [self.device(d["id"]) for d in self.devices]}
        if path.startswith("/me/player") and method in ("PUT", "POST"):
            if self.restricted: return 403, {"error": {"status": 403, "message": "Restricted device", "reason": "UNKNOWN"}}
            if self.no_device and not dev and path != "/me/player": return 404, {"error": {"status": 404, "message": "No active device", "reason": "NO_ACTIVE_DEVICE"}}
            if not target_ok(): return 404, {"error": {"status": 404, "message": "Device not found"}}
            if dev: self.no_device = False
            if path == "/me/player/play":
                if dev: self.active = dev
                if body and body.get("context_uri"): self.mutate(lambda: self.start(body["context_uri"], True, body.get("offset")))
                elif body and body.get("uris"): self.mutate(lambda: self.start(body["uris"], False, body.get("offset")))
                else:
                    def resume(): self.prog = self.progress(); self.playing = True; self.since = ms(); self.touch()
                    self.mutate(resume)
            elif path == "/me/player/pause":
                def pause(): self.prog = self.progress(); self.playing = False; self.since = ms(); self.touch()
                self.mutate(pause)
            elif path == "/me/player/next": self.mutate(lambda: self.advance(True))
            elif path == "/me/player/previous": self.mutate(self.back)
            elif path == "/me/player/seek":
                p = int(q["position_ms"][0])
                def sk(): self.prog = p; self.since = ms(); self.touch()
                self.mutate(sk)
            elif path == "/me/player/shuffle": v = q["state"][0] == "true"; self.mutate(lambda: self.set_shuffle(v))
            elif path == "/me/player/repeat":
                v = q["state"][0]
                def rp(): self.repeat = v; self.touch()
                self.mutate(rp)
            elif path == "/me/player/volume":
                v = int(q["volume_percent"][0])
                def vol():
                    for d in self.devices:
                        if d["id"] == (dev or self.active): d["volume_percent"] = v
                self.mutate(vol)
            elif path == "/me/player/queue": u = q["uri"][0]; self.mutate(lambda: self.uq.append(u))
            elif path == "/me/player":
                ids = body["device_ids"]
                def tr(): self.active = ids[0]; self.no_device = False; self.playing = bool(body.get("play")) or self.playing; self.touch()
                self.mutate(tr)
            return 204, None
        if path == "/me/library/contains": return 200, [False]
        if path.startswith("/me/library"): return 204, None
        if path == "/me": return 200, {"id": "les", "display_name": "Les Miguez", "country": "US", "product": "premium"}
        if path == "/me/albums":
            al = {"id": "A1", "uri": "spotify:album:A1", "name": "Purgatory", "release_date": "2017-08-04", "total_tracks": 8, "artists": [{"name": "Tyler Childers"}],
                  "images": [{"url": "https://i.scdn.co/image/a2", "width": 640}], "tracks": {"total": 8, "items": [dict(self.tracks[u], album=None) for u in self.contexts["spotify:album:A1"]]}}
            for t in al["tracks"]["items"]: t.pop("album", None)
            return 200, {"items": [{"added_at": "2024-01-01T00:00:00Z", "album": al}], "total": 1, "next": None}
        if path == "/me/playlists":
            return 200, {"items": [{"id": "P1", "uri": "spotify:playlist:P1", "name": "Deer Stand Mornings", "owner": {"id": "les", "display_name": "Les Miguez"}, "items": {"total": 12}, "images": []}], "total": 1, "next": None}
        if path == "/playlists/P1/items":
            return 200, {"items": [{"item": self.tracks[u]} for u in self.contexts["spotify:playlist:P1"]], "total": 12}
        if path == "/me/tracks":
            liked = self.contexts["spotify:user:les:collection"]
            return 200, {"items": [{"added_at": "2020-01-01T00:00:00Z", "track": self.tracks[u]} for u in liked], "total": len(liked)}
        if path == "/me/player/recently-played": return 200, {"items": []}
        if path.startswith("/me/top"): return 200, {"items": []}
        if path == "/me/following": return 200, {"artists": {"items": [], "next": None, "cursors": {}}}
        return 200, {}

SCOPES = "user-read-playback-state user-modify-playback-state user-read-currently-playing user-read-private user-top-read user-read-recently-played user-library-read user-library-modify playlist-modify-private playlist-read-private playlist-read-collaborative user-follow-read"
import os
BASE = os.environ.get("STUDIO_URL", "http://127.0.0.1:8765/")

async def open_app(b, sim, w=390, hh=844, settings=None):
    ctx = await b.new_context(viewport={"width": w, "height": hh}, device_scale_factor=2)
    await ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
    pg = await ctx.new_page(); errs = []
    st = json.dumps(settings or {"limit": 10, "theme": "light"})
    await pg.add_init_script(f"""if(!sessionStorage.getItem('seeded')){{sessionStorage.setItem('seeded','1');
      localStorage.setItem('sr.clientId','0123456789abcdef0123456789abcdef');
      localStorage.setItem('sr.tokens',JSON.stringify({{access:'tok_SECRET_A',refresh:'rf_SECRET',exp:Date.now()+3e6}}));
      localStorage.setItem('sr.scopes',"{SCOPES}");localStorage.setItem('sr.settings',{json.dumps(st)});}}""")
    async def api(route):
        r = route.request; u = urlparse(r.url); path = u.path.replace("/v1", "", 1); q = parse_qs(u.query)
        body = None
        try: body = json.loads(r.post_data) if r.post_data else None
        except Exception: pass
        if ms() < sim.offline_until: sim.log.append((ms(), r.method, path, q, body, "aborted")); await route.abort(); return
        auth = r.headers.get("authorization", "")
        if auth != "Bearer " + sim.valid_token:
            sim.log.append((ms(), r.method, path, q, body, 401))
            await route.fulfill(status=401, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps({"error": {"status": 401, "message": "The access token expired"}})); return
        if sim.rate_next_cmd and r.method != "GET":
            sec = sim.rate_next_cmd; sim.rate_next_cmd = 0; sim.log.append((ms(), r.method, path, q, body, 429))
            await route.fulfill(status=429, content_type="application/json", headers={"access-control-allow-origin": "*", "access-control-expose-headers": "Retry-After", "Retry-After": str(sec)}, body=json.dumps({"error": {"status": 429, "message": "API rate limit exceeded"}})); return
        snapshot = None
        if r.method == "GET" and path == "/me/player" and sim.delay_next_get:
            d = sim.delay_next_get; sim.delay_next_get = 0
            code, data = sim.handle(r.method, path, q, body); snapshot = (code, json.loads(json.dumps(data)))
            sim.log.append((ms(), r.method, path, q, body, "delayed"))
            await asyncio.sleep(d / 1000)
            code, data = snapshot
        else:
            code, data = sim.handle(r.method, path, q, body)
            sim.log.append((ms(), r.method, path, q, body, code))
        await route.fulfill(status=code, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps(data) if data is not None else "")
    async def token(route):
        sim.valid_token = "tok_SECRET_B"; sim.refreshed += 1
        await route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps({"access_token": "tok_SECRET_B", "expires_in": 3600}))
    async def img(route):
        n = route.request.url[-1]; await route.fulfill(status=200, content_type="image/png", headers={"access-control-allow-origin": "*"}, body=open(os.path.join(os.path.dirname(__file__), "fixtures", f"a{n}.png"), "rb").read())
    await pg.route("https://api.spotify.com/**", api)
    await pg.route("https://accounts.spotify.com/api/token", token)
    await pg.route("https://i.scdn.co/**", img)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(BASE); await pg.wait_for_timeout(1200)
    return ctx, pg, errs
