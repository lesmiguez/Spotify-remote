import os, asyncio, sys
from sim import *
R = []
def check(n, ok, info=""): R.append(bool(ok)); print(("PASS " if ok else "FAIL ") + n + ("" if ok else "   -> " + str(info)[:300])); sys.stdout.flush()
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox"])
    sim = Sim()
    phone = sim.devices[0]
    sim.devices = [dict(sim.devices[1], name="8c525f549ce0a08cb023bbc6a5cf9770f3a2b1c4")]   # speaker reported by ID, phone asleep
    sim.no_device = True; sim.playing = False
    ctx, pg, errs = await open_app(b, sim)
    await pg.click("#deviceBtn"); await pg.wait_for_timeout(700)
    names = await pg.locator("#devList .dev .n").all_inner_texts()
    check("speaker reported by ID is shown as 'Unnamed speaker', not the raw ID", names == ["Unnamed speaker"], names)
    sub = await pg.locator("#devList .dev .b").first.inner_text()
    check("row explains Spotify didn't share the name", "didn’t share its name" in sub, sub)
    check("'Open Spotify' prompt shown when no phone is listed", await pg.is_visible("#openSpotify") and (await pg.get_attribute("#openSpotify", "href")) == "spotify:")
    await pg.click("#devList .devedit"); await pg.fill(".devname-input", "Kitchen Echo"); await pg.click(".devform .btn")
    names = await pg.locator("#devList .dev .n").all_inner_texts()
    check("rename: nickname shown in the picker", names == ["Kitchen Echo"], names)
    sim.devices.insert(0, dict(phone, is_active=False))            # user opens Spotify on the phone
    await pg.wait_for_timeout(4600)
    names = await pg.locator("#devList .dev .n").all_inner_texts()
    check("picker refreshes on its own: phone appears without tapping refresh", "Les’s iPhone" in names, names)
    check("'Open Spotify' prompt hides once the phone is listed", not await pg.is_visible("#openSpotify"))
    await pg.click("#devList .dev >> text=Kitchen Echo"); await pg.wait_for_timeout(2500)
    chip = await pg.inner_text("#deviceBtn .devname")
    check("transfer to the renamed speaker; header shows the nickname", sim.active == "spk1" and chip == "Kitchen Echo", (sim.active, chip))
    check("nickname persists for this device", "Kitchen Echo" in await pg.evaluate("localStorage.getItem('sr.deviceNames')"))
    await ctx.close(); await b.close()
  print(f"{sum(R)}/{len(R)} device checks passed")
asyncio.run(main())
