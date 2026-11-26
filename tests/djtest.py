"""Claude DJ handoff: a set arrives as #dj=<base64url JSON> (or via paste) and Studio plays it
through the same verified playback engine. The DJ itself runs in a Claude-hosted artifact and
is tested there; this suite covers Studio's side only."""
import os, asyncio, sys, json, base64
from sim import *
R = []
def check(n, ok, info=""): R.append(bool(ok)); print(("PASS " if ok else "FAIL ") + n + ("" if ok else "   -> " + str(info)[:300])); sys.stdout.flush()
IDS = ["0G7pjeHX2TDqw6mx14puWg", "3s5NrHgyTkuinl0TgHCHeK", "5JT14Or1FWUDQq4danqHs5"]
NAMES = [("Hippies and Cowboys", "Cody Jinks"), ("Hurricane", "The Band Of Heathens"), ("Long White Line", "Sturgill Simpson")]
def payload(mode="play", ids=IDS, title="Back Roads at Dusk"):
    o = {"v": 1, "t": title, "n": "Gritty storytelling, rowdy middle, easy landing.", "m": mode, "k": [[i, n, a, 240000] for i, (n, a) in zip(ids, NAMES)]}
    return base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
def seed(sim):
    for i, (n, a) in zip(IDS, NAMES):
        sim.tracks["spotify:track:" + i] = {"id": i, "uri": "spotify:track:" + i, "name": n, "type": "track", "duration_ms": 240000, "artists": [{"name": a, "id": "x"}], "album": {"name": "A", "images": []}, "external_urls": {"spotify": "https://open.spotify.com/track/" + i}}
def calls(sim, m, p): return [x for x in sim.log if x[1] == m and x[2] == p and x[5] not in ("aborted", 401, 429)]
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox"])
    # 1 link from the DJ plays the set on the active device
    sim = Sim(); seed(sim)
    ctx, pg, errs = await open_app(b, sim)
    await pg.goto(BASE + "#dj=" + payload()); await pg.wait_for_timeout(2500)
    play = calls(sim, "PUT", "/me/player/play")
    body = play[-1][4] if play else {}
    check("DJ link plays the set as a track list", body.get("uris") == ["spotify:track:" + i for i in IDS], body)
    check("Spotify confirms the first DJ song", sim.cur() == "spotify:track:" + IDS[0], sim.cur())
    check("set shown in Modes → Claude DJ", await pg.is_visible("#djSetBox") and "Back Roads at Dusk" in await pg.inner_text("#djSetTitle"))
    check("DJ rows render", await pg.locator("#djList .it").count() == 3)
    check("link removed from the address bar (reload won't replay)", "#dj=" not in pg.url, pg.url)
    await pg.click("#miniOpen"); await pg.wait_for_timeout(700)
    check("player says Playing from Claude DJ", "Claude DJ" in (await pg.text_content("#npFrom") or ""))
    await pg.click("#npClose"); await pg.wait_for_timeout(500)
    check("Open Claude DJ links to the Claude-hosted DJ", (await pg.get_attribute("#djOpen", "href")).startswith("https://claude.ai/artifact/"))
    # 2 queue mode adds instead of replacing
    n0 = len(calls(sim, "PUT", "/me/player/play"))
    await pg.goto(BASE + "#dj=" + payload("queue")); await pg.wait_for_timeout(3000)
    q = [x for x in sim.log if x[1] == "POST" and x[2] == "/me/player/queue"]
    check("Keep-the-vibe sets are queued, not restarted", len(q) == 3 and len(calls(sim, "PUT", "/me/player/play")) == n0, (len(q),))
    # 3 tap a row plays from that song
    await pg.click("#djList .it >> nth=1 >> .itmain"); await pg.wait_for_timeout(1500)
    check("tapping a DJ row plays from there", sim.cur() == "spotify:track:" + IDS[1], sim.cur())
    # 4 malformed / hostile payloads are ignored
    n1 = len(calls(sim, "PUT", "/me/player/play"))
    bad = base64.urlsafe_b64encode(json.dumps({"v": 1, "t": "<img src=x onerror=alert(1)>", "k": [["../../me", "x", "y", 1]]}).encode()).decode()
    await pg.goto(BASE + "#dj=" + bad); await pg.wait_for_timeout(1500)
    check("invalid track IDs rejected, nothing played", len(calls(sim, "PUT", "/me/player/play")) == n1)
    await pg.goto(BASE + "#dj=" + payload(title="<b>x</b>")); await pg.wait_for_timeout(1500)
    check("titles render as text, never markup", await pg.locator("#djSetTitle b").count() == 0 and "<b>x</b>" in await pg.inner_text("#djSetTitle"))
    # 5 paste from the DJ (home-screen app path)
    await pg.evaluate("t => navigator.clipboard.writeText(t)", BASE + "#dj=" + payload())
    n2 = len(calls(sim, "PUT", "/me/player/play"))
    await pg.click("#djPaste"); await pg.wait_for_timeout(1800)
    check("Paste set plays the copied DJ set", len(calls(sim, "PUT", "/me/player/play")) == n2 + 1)
    await pg.evaluate("t => navigator.clipboard.writeText(t)", "hello")
    await pg.click("#djPaste"); await pg.wait_for_timeout(500)
    check("paste without a set explains what to do", "Copy for app" in (await pg.inner_text("#toast")))
    check("no tokens in the DJ set storage", "tok_SECRET" not in (await pg.evaluate("localStorage.getItem('sr.djset')")))
    check("no page errors", not errs, errs)
    await ctx.close()
    # 6 cold start from the DJ link (Studio not open yet)
    sim = Sim(); seed(sim)
    ctx, pg, errs = await open_app(b, sim)
    await pg.goto(BASE + "?cold=1#dj=" + payload()); await pg.wait_for_timeout(3000)
    play = calls(sim, "PUT", "/me/player/play")
    check("cold start: DJ link plays after Studio boots", play and play[-1][4].get("uris", [None])[0] == "spotify:track:" + IDS[0] and sim.cur() == "spotify:track:" + IDS[0], sim.cur())
    await ctx.close()
    # 7 signed out: the set waits for sign-in, then plays
    sim = Sim(); seed(sim)
    ctx = await b.new_context(viewport={"width": 390, "height": 844}); pg = await ctx.new_page()
    await pg.goto(BASE + "#dj=" + payload()); await pg.wait_for_timeout(800)
    check("signed out: setup shown, set kept for after sign-in", await pg.is_visible("#setup") and await pg.evaluate("!!localStorage.getItem('sr.djpending')"))
    await ctx.close()
    await b.close()
  print(f"{sum(R)}/{len(R)} DJ checks passed")
if __name__ == "__main__": asyncio.run(main())
