import os
import asyncio, time, re, json, sys
from sim import *
R = []
def check(name, ok, info=""):
    R.append((name, bool(ok))); print(("PASS " if ok else "FAIL ") + name + ("" if ok else "   -> " + str(info)[:400])); sys.stdout.flush()
def calls(sim, method, path): return [x for x in sim.log if x[1] == method and x[2] == path and x[5] not in ("aborted", 401, 429)]
def nm(sim): u = sim.cur(); return sim.tracks[u]["name"] if u else None
async def ui(pg):
    return await pg.evaluate("""()=>({np:document.getElementById('npTitle').textContent, mini:document.getElementById('miniTitle').textContent,
      hero:document.getElementById('heroTitle').textContent, amb:document.getElementById('ambTitle').textContent,
      playing:document.documentElement.getAttribute('data-playing'), shuffle:document.getElementById('shuffle').getAttribute('aria-pressed'),
      repeat:document.getElementById('repeat').getAttribute('aria-label'), dev:document.querySelector('#deviceBtn .devname').textContent,
      queue:[...document.querySelectorAll('#queueList .it .n')].map(e=>e.textContent),
      pending:[...document.querySelectorAll('.pending')].length})""")
REP = {"off": "Repeat: off", "context": "Repeat: all", "track": "Repeat: one"}
async def settled(pg, sim, timeout=7000, queue=False):
    t0 = time.time(); u = None
    while (time.time() - t0) * 1000 < timeout:
        sim.settle(); u = await ui(pg)
        ok = (u["np"] == u["mini"] == u["hero"] == u["amb"] == nm(sim)) and u["playing"] == str(sim.playing).lower() \
             and u["shuffle"] == str(sim.shuffle).lower() and u["repeat"] == REP[sim.repeat] and u["pending"] == 0
        if ok and queue:
            q = [sim.tracks[x]["name"] for x in (sim.uq + sim.order[sim.idx+1:])][:len(u["queue"]) or 1]
            ok = u["queue"][:len(q)] == q and len(u["queue"]) > 0
        if ok: return True, u
        await pg.wait_for_timeout(150)
    return False, {"ui": u, "sim": {"cur": nm(sim), "playing": sim.playing, "shuffle": sim.shuffle, "repeat": sim.repeat}}
async def open_np(pg):
    if await pg.evaluate("matchMedia('(min-width:1100px)').matches"): return
    if await pg.evaluate("document.body.classList.contains('hero-in')"): await pg.click(".hero .hero-art")
    else: await pg.click("#miniOpen")
    await pg.wait_for_timeout(600)
def idx_of(name):
    m = re.search(r"(\d+)$", name or ""); return int(m.group(1)) if m else -1

async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox"])

    # 1 startup + single store
    sim = Sim(); ctx, pg, errs = await open_app(b, sim)
    ok, info = await settled(pg, sim); check("startup: every surface shows Spotify's current track/state", ok, info)
    ok, info = await settled(pg, sim, queue=True); check("startup: queue matches Spotify's queue", ok, info)
    await ctx.close()

    # 2 play playlist, skip forward 5 times
    sim = Sim(); ctx, pg, errs = await open_app(b, sim); await open_np(pg)
    for i in range(5):
        await pg.click("#np .js-next"); ok, info = await settled(pg, sim)
        if not ok: break
    check("skip forward 5x: Spotify on song 6 and UI agrees after each skip", ok and nm(sim) == "Playlist Song 6", info)
    nx = calls(sim, "POST", "/me/player/next")
    check("skip: exactly 5 next commands, each targeting the active device", len(nx) == 5 and all(x[3].get("device_id") == ["phone1"] for x in nx), [x[3] for x in nx])
    ok, info = await settled(pg, sim, queue=True); check("skip: queue resynced to Spotify's queue", ok, info)
    await ctx.close()

    # 3 rapid next
    sim = Sim(); ctx, pg, errs = await open_app(b, sim); await open_np(pg)
    samples = []
    async def sampler():
        for _ in range(60):
            samples.append(idx_of((await ui(pg))["np"])); await asyncio.sleep(0.08)
    st = asyncio.create_task(sampler())
    for i in range(8): await pg.click("#np .js-next", delay=0); await pg.wait_for_timeout(40)
    await st
    ok, info = await settled(pg, sim)
    check("rapid next x8: Spotify advanced exactly 8 tracks", nm(sim) == "Playlist Song 9" and len(calls(sim, "POST", "/me/player/next")) == 8, (nm(sim), len(calls(sim, "POST", "/me/player/next"))))
    check("rapid next x8: UI ends on Spotify's track", ok, info)
    back = [i for i in range(1, len(samples)) if samples[i] < samples[i-1]]
    check("rapid next x8: UI never jumped backwards while settling", not back, samples)
    await ctx.close()

    # 4 select middle of an album
    sim = Sim(); ctx, pg, errs = await open_app(b, sim)
    await pg.click('#navItems [data-v="library"]'); await pg.wait_for_timeout(700)
    await pg.click("#libSeg button >> text=Albums"); await pg.wait_for_timeout(600)
    await pg.click("#libOut .tile >> nth=0 >> .tmain"); await pg.wait_for_timeout(600)
    await pg.click("#dList .it >> nth=3 >> .itmain")
    ok, info = await settled(pg, sim, queue=True)
    play = calls(sim, "PUT", "/me/player/play")
    body = play[-1][4] if play else None
    check("album middle: play sent with album context + offset + device", body and body.get("context_uri") == "spotify:album:A1" and body.get("offset", {}).get("uri") == "spotify:track:t104" and play[-1][3].get("device_id") == ["phone1"], body)
    check("album middle: Spotify plays track 4 in album context", nm(sim) == "Album Track 4" and sim.ctx == "spotify:album:A1")
    check("album middle: following tracks are 5,6,7,8 in UI queue", ok and (await ui(pg))["queue"][:4] == ["Album Track 5", "Album Track 6", "Album Track 7", "Album Track 8"], info)
    await ctx.close()

    # 5 previous behaviour
    sim = Sim(); sim.idx = 4; ctx, pg, errs = await open_app(b, sim); await open_np(pg)
    await settled(pg, sim)
    sim.prog = 40000; sim.since = ms(); await pg.evaluate("window.dispatchEvent(new Event('focus'))"); await pg.wait_for_timeout(500)
    await pg.click("#np .js-prev"); ok, info = await settled(pg, sim)
    seeks = calls(sim, "PUT", "/me/player/seek")
    check("previous after 3s restarts the track (seek 0, no skip)", ok and nm(sim) == "Playlist Song 5" and seeks and seeks[-1][3]["position_ms"] == ["0"] and not calls(sim, "POST", "/me/player/previous"), info)
    await pg.click("#np .js-prev"); ok, info = await settled(pg, sim)
    check("previous within 3s goes to the previous track", ok and nm(sim) == "Playlist Song 4" and len(calls(sim, "POST", "/me/player/previous")) == 1, info)
    await ctx.close()

    # 6 shuffle toggling + queue
    sim = Sim(); ctx, pg, errs = await open_app(b, sim); await open_np(pg)
    for i in range(5): await pg.click("#shuffle"); await pg.wait_for_timeout(60)
    ok, info = await settled(pg, sim, queue=True)
    n = len(calls(sim, "PUT", "/me/player/shuffle"))
    check("shuffle x5 rapid: ends ON in Spotify and UI (odd presses)", ok and sim.shuffle is True, info)
    check("shuffle x5 rapid: presses sent in order, never more than pressed (%d sent)" % n, 1 <= n <= 5)
    check("shuffle on: UI queue now shows Spotify's shuffled order", ok, info)
    shuffled_q = (await ui(pg))["queue"][:5]
    await pg.click("#shuffle"); ok, info = await settled(pg, sim, queue=True)
    check("shuffle off: Spotify and UI off; queue back in playlist order", ok and sim.shuffle is False and (await ui(pg))["queue"][:3] == ["Playlist Song 2", "Playlist Song 3", "Playlist Song 4"], info)
    check("shuffle changed the queue order", shuffled_q != ["Playlist Song 2", "Playlist Song 3", "Playlist Song 4", "Playlist Song 5", "Playlist Song 6"])
    for i in range(4):
        await pg.click("#shuffle"); ok, info = await settled(pg, sim)
        if not ok: break
    check("shuffle on/off 4 more times, each confirmed", ok and sim.shuffle is False, info)
    await ctx.close()

    # 7 repeat modes
    sim = Sim(); ctx, pg, errs = await open_app(b, sim); await open_np(pg)
    seq = []
    for i in range(3):
        await pg.click("#repeat"); ok, info = await settled(pg, sim); seq.append((sim.repeat, (await ui(pg))["repeat"], ok))
    check("repeat cycles context -> track -> off in Spotify and UI", [s[0] for s in seq] == ["context", "track", "off"] and all(s[2] for s in seq), seq)
    sim.repeat = "context"; sim.idx = len(sim.order) - 1; sim.touch(); await pg.evaluate("window.dispatchEvent(new Event('focus'))")
    await settled(pg, sim); await pg.click("#np .js-next"); ok, info = await settled(pg, sim)
    check("repeat all: next on the last track wraps to the first", ok and nm(sim) == "Playlist Song 1", info)
    await ctx.close()

    # 8 pause/resume
    sim = Sim(); ctx, pg, errs = await open_app(b, sim); await open_np(pg)
    await pg.click("#np .js-play"); u = await ui(pg)
    check("pause: UI responds immediately and marks the action pending", u["playing"] == "false" and u["pending"] > 0, u)
    ok, info = await settled(pg, sim); check("pause: confirmed by Spotify, pending cleared", ok and sim.playing is False, info)
    for i in range(6): await pg.click("#np .js-play"); await pg.wait_for_timeout(50)
    ok, info = await settled(pg, sim)
    check("pause/resume x6 rapid: Spotify and UI agree on final state (paused)", ok and sim.playing is False, info)
    await pg.click("#np .js-play"); ok, info = await settled(pg, sim); check("resume: confirmed playing", ok and sim.playing is True, info)
    await ctx.close()

    # 9 seek
    sim = Sim(); ctx, pg, errs = await open_app(b, sim); await open_np(pg)
    async def seek_to(frac):
        await pg.evaluate(f"const s=document.getElementById('seek');s.value={int(frac*1000)};s.dispatchEvent(new Event('input'));s.dispatchEvent(new Event('change'))")
        await pg.wait_for_timeout(1500); sim.settle()
        ui_pos = await pg.evaluate("document.getElementById('tNow').textContent")
        return sim.progress() / sim.dur(), ui_pos
    f1, p1 = await seek_to(0.75); f2, p2 = await seek_to(0.10)
    check("seek forward to 75%: Spotify position matches", abs(f1 - 0.75) < 0.03, f1)
    check("seek back to 10%: Spotify position matches", abs(f2 - 0.10) < 0.03, f2)
    def secs(t): m_, s_ = t.split(":"); return int(m_) * 60 + int(s_)
    check("seek: UI time matches Spotify within 2s", abs(secs(p2) - sim.progress() / 1000) < 2.5, (p2, sim.progress()))
    await ctx.close()

    # 10 change songs directly in Spotify
    sim = Sim(); ctx, pg, errs = await open_app(b, sim)
    await settled(pg, sim)
    sim.advance(); sim.advance(); sim.set_shuffle(True)
    await pg.evaluate("Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new Event('visibilitychange'))")
    ok, info = await settled(pg, sim, timeout=1500); check("external change + return to foreground: synced within 1.5s", ok, info)
    sim.advance(); ok, info = await settled(pg, sim, timeout=7000); check("external skip while open: synced by adaptive polling (<7s)", ok, info)
    await ctx.close()

    # 11 Connect device switching
    sim = Sim(); ctx, pg, errs = await open_app(b, sim)
    await pg.click("#deviceBtn"); await pg.wait_for_timeout(500); await pg.click("#devList .dev >> text=Kitchen speaker")
    ok, info = await settled(pg, sim)
    check("transfer: Spotify now on Kitchen speaker and UI shows it", ok and sim.active == "spk1" and (await ui(pg))["dev"] == "Kitchen speaker", info)
    await open_np(pg); await pg.click("#np .js-next"); await settled(pg, sim)
    nx = calls(sim, "POST", "/me/player/next")
    check("after transfer: commands target the new device", nx and nx[-1][3].get("device_id") == ["spk1"], nx[-1][3] if nx else None)
    vis = await pg.is_visible("#volume")
    await pg.evaluate("const v=document.getElementById('volume');v.value=70;v.dispatchEvent(new Event('input'))"); await pg.wait_for_timeout(1500)
    check("speaker volume control available and applied", vis and [d for d in sim.devices if d["id"] == "spk1"][0]["volume_percent"] == 70)
    await pg.click("#np .npctx"); await pg.wait_for_timeout(500); await pg.click("#devList .dev >> text=Les’s iPhone")
    ok, info = await settled(pg, sim); check("transfer back to phone", ok and sim.active == "phone1", info)
    await ctx.close()

    # 12 close and reopen while playing
    sim = Sim(); sim.idx = 6; ctx, pg, errs = await open_app(b, sim); await ctx.close()
    sim.advance(); ctx, pg, errs = await open_app(b, sim)
    ok, info = await settled(pg, sim, timeout=1500); check("reopen while music plays: current track shown immediately", ok, info)
    await ctx.close()

    # 13 unfolded layout
    sim = Sim(); ctx, pg, errs = await open_app(b, sim, 820, 1000); await open_np(pg)
    for i in range(3): await pg.click("#np .js-next"); await pg.wait_for_timeout(80)
    await pg.click("#shuffle"); await pg.click("#repeat")
    ok, info = await settled(pg, sim, queue=True)
    check("unfolded: next x3, shuffle, repeat all confirmed and queue synced", ok and nm(sim) == "Playlist Song 4" and sim.shuffle and sim.repeat == "context", info)
    await ctx.close()
    sim = Sim(); ctx, pg, errs = await open_app(b, sim, 1280, 800)
    await pg.click("#np .js-next"); await pg.click("#np .js-play"); ok, info = await settled(pg, sim)
    check("wide: docked player next + pause confirmed", ok and nm(sim) == "Playlist Song 2" and not sim.playing, info)
    await ctx.close()

    # 14 expired token
    sim = Sim(); ctx, pg, errs = await open_app(b, sim); await settled(pg, sim)
    sim.valid_token = "tok_SECRET_B"
    await open_np(pg); await pg.click("#np .js-next"); ok, info = await settled(pg, sim)
    check("expired token: refreshed once, command completed, no sign-in screen", ok and sim.refreshed == 1 and nm(sim) == "Playlist Song 2" and not await pg.is_visible("#setup"), info)
    await ctx.close()

    # 15 delayed application by Spotify
    sim = Sim(); ctx, pg, errs = await open_app(b, sim); await open_np(pg); await settled(pg, sim, queue=True)
    sim.apply_delay = 1800
    await pg.click("#np .js-next"); await pg.wait_for_timeout(150); u = await ui(pg)
    check("delayed Spotify: next shows predicted track instantly, marked pending", u["np"] == "Playlist Song 2" and u["pending"] > 0 and nm(sim) == "Playlist Song 1", u)
    ok, info = await settled(pg, sim, timeout=6000)
    check("delayed Spotify: confirmed once Spotify applies it", ok and nm(sim) == "Playlist Song 2", info)
    await pg.click("#shuffle"); await pg.wait_for_timeout(900); u = await ui(pg)
    check("delayed Spotify: shuffle stays on (pending) while Spotify still reports off", u["shuffle"] == "true" and sim.shuffle is False, (u, sim.shuffle))
    ok, info = await settled(pg, sim, timeout=6000); check("delayed Spotify: shuffle confirmed", ok and sim.shuffle, info)
    await ctx.close()

    # 16 stale / out-of-order response
    sim = Sim(); ctx, pg, errs = await open_app(b, sim, settings={"limit": 10, "theme": "light", "diag": True}); await open_np(pg); await settled(pg, sim)
    sim.delay_next_get = 1600
    await pg.evaluate("window.dispatchEvent(new Event('focus'))"); await pg.wait_for_timeout(100)
    await pg.click("#shuffle")
    flips = []
    for i in range(25): flips.append((await ui(pg))["shuffle"]); await pg.wait_for_timeout(100)
    ok, info = await settled(pg, sim)
    disc = await pg.evaluate("[...document.querySelectorAll('#diagList dt')].find(d=>d.textContent==='Stale discarded').nextSibling.textContent")
    check("stale response that started before a command is discarded (no revert)", ok and sim.shuffle and "false" not in flips and int(disc) >= 1, (flips, disc, info))
    await ctx.close()

    # 17 network failure
    sim = Sim(); ctx, pg, errs = await open_app(b, sim); await open_np(pg); await settled(pg, sim)
    sim.offline_until = ms() + 5000
    await pg.click("#np .js-next"); await pg.wait_for_timeout(1500); u = await ui(pg)
    check("offline: failed skip rolls back to Spotify's confirmed track", u["np"] == "Playlist Song 1" and nm(sim) == "Playlist Song 1", u)
    toast = await pg.evaluate("document.getElementById('toast').textContent")
    check("offline: clear error message shown", "reach Spotify" in toast or "connection" in toast.lower(), toast)
    await pg.wait_for_timeout(4200); sim.advance()
    await pg.evaluate("window.dispatchEvent(new Event('online'))")
    ok, info = await settled(pg, sim, timeout=4000); check("back online: resynced automatically", ok, info)
    await ctx.close()

    # 18 rate limiting
    sim = Sim(); ctx, pg, errs = await open_app(b, sim); await open_np(pg); await settled(pg, sim)
    sim.rate_next_cmd = 2
    t_click = ms(); await pg.click("#np .js-next"); ok, info = await settled(pg, sim, timeout=8000)
    r429 = [x for x in sim.log if x[5] == 429]; t429 = r429[0][0]
    after = [x for x in sim.log if x[0] > t429 and x[5] != "aborted"]
    first_after = after[0][0] if after else None
    check("429: no requests sent during Retry-After window", first_after and first_after - t429 >= 1900, (first_after - t429) if first_after else None)
    check("429: command retried after the wait and confirmed", ok and nm(sim) == "Playlist Song 2", info)
    await ctx.close()

    # 19 restrictions
    sim = Sim(); sim.disallows = {"skipping_next": True, "toggling_shuffle": True}; ctx, pg, errs = await open_app(b, sim); await open_np(pg)
    check("restrictions: next and shuffle disabled when Spotify disallows them", await pg.is_disabled("#np .js-next") and await pg.is_disabled("#shuffle"))
    sim.disallows = {}; sim.restricted = True; sim.touch()
    await pg.evaluate("window.dispatchEvent(new Event('focus'))"); await pg.wait_for_timeout(900)
    check("restricted device: playback controls disabled", await pg.is_disabled("#np .js-play") and await pg.is_disabled("#np .js-next"))
    await ctx.close()

    # 20 inactive device -> play from Library uses last device
    sim = Sim(); ctx, pg, errs = await open_app(b, sim); await settled(pg, sim)
    sim.no_device = True; sim.playing = False; await pg.evaluate("window.dispatchEvent(new Event('focus'))"); await pg.wait_for_timeout(800)
    check("no active device: UI shows not connected", await pg.get_attribute("html", "data-dev") == "off")
    await pg.click('#navItems [data-v="library"]'); await pg.wait_for_timeout(600)
    await pg.click("#libOut .tile >> nth=0 >> .tmain"); await pg.wait_for_timeout(700)
    await pg.click("#dList .it >> nth=2 >> .itmain"); ok, info = await settled(pg, sim)
    pl = calls(sim, "PUT", "/me/player/play")[-1]
    check("inactive device: playback starts on last-used device", ok and pl[3].get("device_id") == ["phone1"] and nm(sim) == "Liked Song 3", (pl[3], info))
    check("liked songs row: following tracks preserved", (await ui(pg))["queue"][:2] == ["Liked Song 4", "Liked Song 5"] or (await settled(pg, sim, queue=True))[0])
    await ctx.close()

    # 21 shuffle-play sequencing
    sim = Sim(); ctx, pg, errs = await open_app(b, sim); await settled(pg, sim)
    await pg.click('#navItems [data-v="library"]'); await pg.wait_for_timeout(600)
    await pg.click("#libOut .tile >> nth=1 >> .tmain"); await pg.wait_for_timeout(700)
    await pg.click("#dShuffle"); ok, info = await settled(pg, sim)
    seqlog = [(x[1], x[2]) for x in sim.log if x[1] == "PUT" and x[2] in ("/me/player/shuffle", "/me/player/play")]
    gets_between = [x for x in sim.log if x[0] > [y for y in sim.log if y[2] == "/me/player/shuffle"][0][0] and x[0] < calls(sim, "PUT", "/me/player/play")[-1][0] and x[1] == "GET" and x[2] == "/me/player"]
    check("shuffle play: shuffle confirmed before play is sent", seqlog[:2] == [("PUT", "/me/player/shuffle"), ("PUT", "/me/player/play")] and len(gets_between) >= 1, (seqlog, len(gets_between)))
    check("shuffle play: playlist context, shuffle on, UI agrees", ok and sim.shuffle and sim.ctx == "spotify:playlist:P1", info)
    await ctx.close()

    # 22 add to queue
    sim = Sim(); ctx, pg, errs = await open_app(b, sim); await settled(pg, sim)
    await pg.click('#navItems [data-v="library"]'); await pg.wait_for_timeout(600)
    await pg.click("#libOut .tile >> nth=0 >> .tmain"); await pg.wait_for_timeout(700)
    await pg.click("#dList .it >> nth=5 >> .more"); await pg.click("#actList .actbtn >> text=Add to queue")
    ok, info = await settled(pg, sim, queue=True)
    check("add to queue: Spotify queue and UI queue both start with the added song", ok and (await ui(pg))["queue"][0] == "Liked Song 6", info)
    await ctx.close()

    # 23 diagnostics never expose tokens
    sim = Sim(); ctx, pg, errs = await open_app(b, sim, settings={"limit": 10, "theme": "light", "diag": True}); await settled(pg, sim)
    await pg.click("#avatarBtn"); await pg.wait_for_timeout(500)
    txt = await pg.inner_text("#diagPanel")
    await pg.click("#diagCopy"); await pg.wait_for_timeout(300); clip = await pg.evaluate("navigator.clipboard.readText()")
    html = await pg.content()
    check("diagnostics: shows device, context, shuffle, repeat, last command, sync latency", all(k in txt for k in ["Les’s iPhone", "spotify:playlist:P1", "Shuffle", "Repeat", "Last command", "Last sync"]), txt[:300])
    check("diagnostics: no access/refresh token in panel, report or DOM", "SECRET" not in txt and "SECRET" not in clip and "SECRET" not in html and "Bearer" not in clip)
    await ctx.close()

    await b.close()
  passed = sum(1 for _, o in R if o); print(f"\n{passed}/{len(R)} playback checks passed")
asyncio.run(main())
