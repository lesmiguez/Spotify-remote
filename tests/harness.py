import json, datetime, re
from playwright.async_api import async_playwright
import os
BASE=os.environ.get("STUDIO_URL","http://127.0.0.1:8765/")
SCOPES="user-read-playback-state user-modify-playback-state user-read-currently-playing user-read-private user-top-read user-read-recently-played user-library-read user-library-modify playlist-modify-private playlist-read-private playlist-read-collaborative user-follow-read"
def trk(i,name,artist,aid=None):
    return {"id":f"t{i}","uri":f"spotify:track:t{i}","name":name,"duration_ms":200000+i*7000,"type":"track",
      "artists":[{"name":artist,"id":aid or "x"+artist[:3]}],"album":{"name":"Album "+str(i),"images":[{"url":f"https://i.scdn.co/image/a{i%6}","width":640}]},
      "external_urls":{"spotify":"https://open.spotify.com/track/x"}}
names=[("If The World Had a Front Porch","Tracy Lawrence"),("Whitehouse Road","Tyler Childers"),("Fast Car","Luke Combs"),("Something in the Orange","Zach Bryan"),("Feathered Indians","Tyler Childers"),("Starting Over","Chris Stapleton"),("Heavy Eyes","Zach Bryan"),("Dirt Road Anthem","Jason Aldean"),("Tennessee Whiskey","Chris Stapleton"),("Goodbye Time","Conway Twitty")]
T=[trk(i,*n) for i,n in enumerate(names)]
arts=[{"id":f"a{i}","name":n,"genres":[],"images":[{"url":f"https://i.scdn.co/image/a{(i+2)%6}","width":640}]} for i,n in enumerate(["Chris Stapleton","Tyler Childers","Zach Bryan","Luke Combs","Kevin Gates","Tim McGraw","CeCe Winans"])]
now=datetime.datetime(2026,11,25,20,0)
recent=[{"track":T[i%10],"played_at":(now-datetime.timedelta(hours=i*3.3)).strftime("%Y-%m-%dT%H:%M:%SZ")} for i in range(40)]
def player(devtype="Smartphone"):
    return {"device":{"id":"d1","name":"Les’s iPhone","type":devtype,"volume_percent":60,"is_active":True},"is_playing":True,"progress_ms":74000,"item":T[0],"shuffle_state":True,"repeat_state":"off"}
def make_fx(opts):
    def fx(method,url):
        p=url.split("api.spotify.com/v1")[1]; path=p.split("?")[0]
        if opts.get("fail") and re.search(opts["fail"],path): return 500,{"error":{"status":500,"message":"Server error"}}
        if method!="GET":
            if path=="/me/playlists": return 201,{"id":"pl1","external_urls":{"spotify":"https://open.spotify.com/playlist/pl1"}}
            return 204,None
        if path=="/me/player":
            return (204,None) if opts.get("nodevice") else (200,player(opts.get("devtype","Smartphone")))
        if path=="/me/player/queue": return (204,None) if opts.get("nodevice") else (200,{"queue":T[1:9]})
        if path=="/me/player/devices": return 200,{"devices":[{"id":"d1","name":"Les’s iPhone","type":"Smartphone","is_active":True},{"id":"d2","name":"Kitchen speaker","type":"Speaker","is_active":False}]}
        if path=="/me/player/recently-played": return 200,{"items":recent}
        if path=="/me/top/artists": return 200,{"items":arts}
        if path=="/me/top/tracks": return 200,{"items":T}
        if path=="/me/library/contains": return 200,[True]
        if path=="/me/tracks": return 200,{"total":812,"items":[{"added_at":"2019-05-02T00:00:00Z","track":T[3]},{"added_at":"2019-06-02T00:00:00Z","track":T[5]}]}
        if path=="/search":
            q=re.search(r"q=([^&]*)",p).group(1)
            return 200,{"tracks":{"items":[trk(20+i,f"Song {i}","Chris Stapleton","a0") for i in range(10)]},"artists":{"items":arts[:3]}}
        if path=="/me/playlists": return 200,{"items":[
            {"id":"p1","uri":"spotify:playlist:p1","name":"Deer Stand Mornings","owner":{"id":"les","display_name":"Les Miguez"},"collaborative":False,"items":{"total":42},"images":[{"url":"https://i.scdn.co/image/a1","width":640}]},
            {"id":"p2","uri":"spotify:playlist:p2","name":"Today's Top Country","owner":{"id":"spotify","display_name":"Spotify"},"collaborative":False,"items":{"total":50},"images":[{"url":"https://i.scdn.co/image/a2","width":640}]},
            {"id":"p3","uri":"spotify:playlist:p3","name":"Toledo Bend Drive","owner":{"id":"les","display_name":"Les Miguez"},"collaborative":False,"items":{"total":18},"images":[]}],"total":3,"next":None}
        if path=="/me/albums": return 200,{"items":[{"added_at":"2024-01-01T00:00:00Z","album":{"id":"al1","uri":"spotify:album:al1","name":"Traveller","release_date":"2015-05-04","total_tracks":3,"artists":[{"name":"Chris Stapleton"}],"images":[{"url":"https://i.scdn.co/image/a3","width":640}],"tracks":{"total":3,"items":[{"id":"x1","uri":"spotify:track:x1","name":"Traveller","type":"track","duration_ms":220000,"artists":[{"name":"Chris Stapleton"}]},{"id":"x2","uri":"spotify:track:x2","name":"Fire Away","type":"track","duration_ms":230000,"artists":[{"name":"Chris Stapleton"}]},{"id":"x3","uri":"spotify:track:x3","name":"Tennessee Whiskey","type":"track","duration_ms":290000,"artists":[{"name":"Chris Stapleton"}]}]}}}],"total":1,"next":None}
        if path=="/me/following": return 200,{"artists":{"items":arts[:5],"next":None,"cursors":{"after":None}}}
        if path.startswith("/playlists/") and path.endswith("/items"): return 200,{"items":[{"item":T[i]} for i in range(6)],"total":6}
        if path=="/me": return 200,{"id":"les","display_name":"Les Miguez","country":"US","product":"premium"}
        return 200,{}
    return fx
async def page(b,w,hh,opts=None,settings=None,auth=True):
    opts=opts or {}
    ctx=await b.new_context(viewport={"width":w,"height":hh},device_scale_factor=2,has_touch=opts.get("touch",False))
    pg=await ctx.new_page(); log=[]; errs=[]
    st=json.dumps(settings or {"limit":10,"theme":"light"})
    if auth:
        await pg.add_init_script(f"""if(!sessionStorage.getItem('seeded')){{sessionStorage.setItem('seeded','1');localStorage.setItem('sr.clientId','0123456789abcdef0123456789abcdef');
          localStorage.setItem('sr.tokens',JSON.stringify({{access:'x',refresh:'y',exp:Date.now()+3e6}}));
          localStorage.setItem('sr.scopes',"{SCOPES}");localStorage.setItem('sr.settings',{json.dumps(st)});}}""")
    fx=make_fx(opts)
    async def api(route):
        r=route.request; code,body=fx(r.method,r.url); log.append((r.method,r.url.split("/v1")[1]))
        await route.fulfill(status=code,content_type="application/json",headers={"access-control-allow-origin":"*"},body=json.dumps(body) if body is not None else "")
    async def img(route):
        n=route.request.url[-1]; await route.fulfill(status=200,content_type="image/png",headers={"access-control-allow-origin":"*"},body=open(os.path.join(os.path.dirname(__file__),"fixtures",f"a{n}.png"),"rb").read())
    await pg.route("https://api.spotify.com/**",api); await pg.route("https://i.scdn.co/**",img)
    pg.on("pageerror",lambda e: errs.append(str(e)))
    pg.on("console",lambda m: errs.append("console: "+m.text) if m.type=="error" else None)
    await pg.goto(BASE); await pg.wait_for_timeout(1400)
    return ctx,pg,log,errs
