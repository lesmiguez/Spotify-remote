(function () {
  "use strict";

  var API = "https://api.spotify.com/v1";
  var ACCOUNTS = "https://accounts.spotify.com";
  var SCOPES = "user-read-playback-state user-modify-playback-state user-read-currently-playing user-read-private";
  var LS = { id: "sr.clientId", tok: "sr.tokens", ver: "sr.verifier", state: "sr.state" };

  var $ = function (id) { return document.getElementById(id); };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function redirectUri() { return location.origin + location.pathname; }

  /* ---------- UI helpers ---------- */
  var toastTimer;
  function toast(msg, bad) {
    var t = $("toast");
    t.textContent = msg;
    t.className = "toast" + (bad ? " bad" : "");
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3800);
  }
  function show(id) {
    $("setup").hidden = id !== "setup";
    $("player").hidden = id !== "player";
  }
  function setMsg(msg, kind) {
    var n = $("setupMsg");
    n.textContent = msg || "";
    n.className = "note" + (kind ? " " + kind : "");
    n.hidden = !msg;
  }
  function fmt(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function hue(s) { var x = 0; for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0; return x % 360; }
  function paintRange(el) {
    var min = +el.min, max = +el.max, v = +el.value;
    el.style.setProperty("--p", (max > min ? ((v - min) / (max - min)) * 100 : 0) + "%");
  }

  /* ---------- PKCE ---------- */
  function rand(n) {
    var a = new Uint8Array(n); crypto.getRandomValues(a);
    var cs = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~", o = "";
    for (var i = 0; i < n; i++) o += cs[a[i] % cs.length];
    return o;
  }
  function b64url(buf) {
    var s = "", b = new Uint8Array(buf);
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  async function challenge(v) {
    return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));
  }
  async function beginLogin() {
    var id = $("clientId").value.trim();
    if (!/^[a-f0-9]{32}$/i.test(id)) { setMsg("That doesn’t look like a Client ID. It’s 32 letters and numbers.", "warn"); return; }
    if (!window.crypto || !crypto.subtle) { setMsg("This page must be opened over HTTPS to sign in.", "bad"); return; }
    lsSet(LS.id, id);
    var verifier = rand(96), state = rand(24);
    lsSet(LS.ver, verifier); lsSet(LS.state, state);
    var q = new URLSearchParams({
      client_id: id, response_type: "code", redirect_uri: redirectUri(),
      code_challenge_method: "S256", code_challenge: await challenge(verifier),
      scope: SCOPES, state: state
    });
    location.assign(ACCOUNTS + "/authorize?" + q.toString());
  }
  async function tokenRequest(params) {
    var r = await fetch(ACCOUNTS + "/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString()
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) { var e = new Error(j.error_description || j.error || "token_error"); e.code = j.error; throw e; }
    return j;
  }
  function storeTokens(j, prevRefresh) {
    var t = { access: j.access_token, refresh: j.refresh_token || prevRefresh, exp: Date.now() + (j.expires_in || 3600) * 1000 };
    lsSet(LS.tok, JSON.stringify(t));
    return t;
  }
  function tokens() { try { return JSON.parse(lsGet(LS.tok)); } catch (e) { return null; } }
  var refreshing = null;
  async function freshToken(force) {
    var t = tokens();
    if (!t) throw authError();
    if (!force && t.exp - Date.now() > 60000) return t.access;
    if (!refreshing) {
      refreshing = tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh, client_id: lsGet(LS.id) })
        .then(function (j) { return storeTokens(j, t.refresh).access; })
        .catch(function (e) { if (e.code === "invalid_grant") { lsDel(LS.tok); } throw authError(); })
        .finally(function () { refreshing = null; });
    }
    return refreshing;
  }
  function authError() { var e = new Error("auth"); e.auth = true; return e; }

  async function finishLogin(code, state) {
    var okState = state && state === lsGet(LS.state), verifier = lsGet(LS.ver);
    lsDel(LS.state); lsDel(LS.ver);
    history.replaceState(null, "", redirectUri());
    if (!okState || !verifier) throw new Error("Sign-in could not be verified. Please try again.");
    var j = await tokenRequest({
      grant_type: "authorization_code", code: code, redirect_uri: redirectUri(),
      client_id: lsGet(LS.id), code_verifier: verifier
    });
    storeTokens(j);
  }

  /* ---------- API ---------- */
  async function api(method, path, opts) {
    opts = opts || {};
    for (var attempt = 0; attempt < 2; attempt++) {
      var token = await freshToken(attempt > 0);
      var init = { method: method, headers: { Authorization: "Bearer " + token } };
      if (opts.body) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body); }
      var r = await fetch(API + path, init);
      if (r.status === 401 && attempt === 0) continue;
      if (r.status === 401) throw authError();
      if (r.status === 204 || (r.status === 202)) return null;
      if (r.status === 429) { var e429 = new Error("rate"); e429.status = 429; throw e429; }
      var text = await r.text(), j = null;
      try { j = text ? JSON.parse(text) : null; } catch (e) {}
      if (!r.ok) {
        var e = new Error((j && j.error && j.error.message) || "Request failed");
        e.status = r.status; e.reason = j && j.error && j.error.reason;
        throw e;
      }
      return j;
    }
  }

  /* ---------- state ---------- */
  var st = { item: null, playing: false, progress: 0, at: 0, device: null, shuffle: false, repeat: "off" };
  var lastItemId = null, dragging = false, busyUntil = 0;

  function applyPlayer(p) {
    if (!p || !p.device) {
      st.item = null; st.playing = false; st.device = null;
    } else {
      st.item = p.item || null; st.playing = !!p.is_playing; st.progress = p.progress_ms || 0; st.at = Date.now();
      st.device = p.device; st.shuffle = !!p.shuffle_state; st.repeat = p.repeat_state || "off";
    }
    render();
    var id = st.item && st.item.id;
    if (id !== lastItemId) { lastItemId = id; loadQueue(); }
  }
  function artUrl(item) {
    var im = item && item.album && item.album.images;
    if (!im || !im.length) return null;
    var pick = im.filter(function (i) { return i.width >= 400; }).pop() || im[0];
    return pick.url;
  }
  function render() {
    var it = st.item;
    $("title").textContent = it ? it.name : "Nothing playing";
    $("artist").textContent = it ? (it.artists || []).map(function (a) { return a.name; }).join(", ") : (st.device ? "Press play to start" : "Choose a device to begin");
    document.title = it ? it.name + " · Remote" : "Spotify Remote";
    $("deviceName").textContent = st.device ? st.device.name : "No device";
    $("icoPlay").hidden = st.playing; $("icoPause").hidden = !st.playing;
    $("play").setAttribute("aria-label", st.playing ? "Pause" : "Play");
    $("artWrap").classList.toggle("paused", !st.playing);
    $("shuffle").setAttribute("aria-pressed", String(st.shuffle));
    $("repeat").setAttribute("aria-pressed", String(st.repeat !== "off"));
    $("repeat").setAttribute("aria-label", "Repeat: " + (st.repeat === "context" ? "all" : st.repeat === "track" ? "one" : "off"));
    $("repeatOne").hidden = st.repeat !== "track";
    var url = artUrl(it), img = $("art"), fb = $("artFallback");
    if (url) {
      if (img.getAttribute("data-src") !== url) {
        img.classList.remove("on"); img.setAttribute("data-src", url); img.alt = it.album && it.album.name ? "Album art: " + it.album.name : "Album art";
        img.onload = function () { img.classList.add("on"); }; img.src = url;
      }
      fb.hidden = true;
    } else {
      img.classList.remove("on"); img.removeAttribute("data-src"); img.removeAttribute("src");
      var n = it ? it.name : "♪", h = hue(n);
      fb.hidden = false; fb.textContent = n.charAt(0).toUpperCase();
      fb.style.setProperty("background", "linear-gradient(135deg,hsl(" + h + " 38% 50%),hsl(" + ((h + 40) % 360) + " 42% 38%))");
    }
    var vol = $("volume");
    var canVol = st.device && st.device.supports_volume !== false && st.device.type !== "Smartphone";
    vol.disabled = !canVol; $("volNote").hidden = !!canVol || !st.device;
    if (st.device && st.device.volume_percent != null && Date.now() > busyUntil) { vol.value = st.device.volume_percent; paintRange(vol); }
    $("seek").disabled = !it; tick();
  }
  function tick() {
    var it = st.item, seek = $("seek");
    if (!it) { seek.value = 0; paintRange(seek); $("tNow").textContent = "0:00"; $("tLen").textContent = "0:00"; return; }
    var pos = Math.min(it.duration_ms, st.progress + (st.playing ? Date.now() - st.at : 0));
    $("tLen").textContent = fmt(it.duration_ms);
    if (!dragging) { seek.value = Math.round((pos / it.duration_ms) * 1000); paintRange(seek); $("tNow").textContent = fmt(pos); }
  }
  setInterval(function () { if (!document.hidden) tick(); }, 500);

  async function loadQueue() {
    var box = $("queueList");
    try {
      var q = await api("GET", "/me/player/queue");
      var list = (q && q.queue || []).slice(0, 8);
      box.textContent = "";
      if (!list.length) { var e = document.createElement("div"); e.className = "empty"; e.textContent = "The queue is empty."; box.appendChild(e); return; }
      list.forEach(function (t) {
        var row = document.createElement("div"); row.className = "qi";
        var u = artUrl(t), im;
        if (u) { im = document.createElement("img"); im.src = u; im.alt = ""; im.loading = "lazy"; }
        else { im = document.createElement("div"); im.className = "qt"; }
        var m = document.createElement("div"); m.className = "qm";
        var n = document.createElement("div"); n.className = "qn"; n.textContent = t.name || "";
        var a = document.createElement("div"); a.className = "qa"; a.textContent = (t.artists || []).map(function (x) { return x.name; }).join(", ");
        m.appendChild(n); m.appendChild(a); row.appendChild(im); row.appendChild(m); box.appendChild(row);
      });
    } catch (e) { if (e.auth) return handleAuth(); }
  }

  /* ---------- polling ---------- */
  var pollTimer = null, failures = 0;
  async function poll() {
    if (document.hidden) return;
    try {
      var p = await api("GET", "/me/player");
      failures = 0; applyPlayer(p);
    } catch (e) {
      if (e.auth) return handleAuth();
      if (++failures === 3) toast("Having trouble reaching Spotify.", true);
    }
  }
  function startPolling() { stopPolling(); poll(); pollTimer = setInterval(poll, 4000); }
  function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && !$("player").hidden) poll(); });

  /* ---------- commands ---------- */
  function explain(e) {
    if (e.status === 404 || e.reason === "NO_ACTIVE_DEVICE") { openDevices(); return "No active device. Pick one to play on."; }
    if (e.reason === "PREMIUM_REQUIRED" || e.status === 403) return "Spotify Premium is required to control playback.";
    if (e.status === 429) return "Spotify is rate limiting. Wait a few seconds.";
    return e.message || "That didn’t work.";
  }
  async function cmd(method, path, optimistic, opts) {
    var snapshot = Object.assign({}, st);
    if (optimistic) { optimistic(); render(); }
    try { await api(method, path, opts); setTimeout(poll, 450); }
    catch (e) {
      if (e.auth) return handleAuth();
      st = snapshot; render(); toast(explain(e), true);
    }
  }
  $("play").addEventListener("click", function () {
    if (!st.device) { openDevices(); return; }
    if (st.playing) cmd("PUT", "/me/player/pause", function () { st.progress += Date.now() - st.at; st.at = Date.now(); st.playing = false; });
    else cmd("PUT", "/me/player/play", function () { st.at = Date.now(); st.playing = true; }, { body: {} });
  });
  $("next").addEventListener("click", function () { if (!st.device) return openDevices(); cmd("POST", "/me/player/next"); });
  $("prev").addEventListener("click", function () { if (!st.device) return openDevices(); cmd("POST", "/me/player/previous"); });
  $("shuffle").addEventListener("click", function () { var n = !st.shuffle; cmd("PUT", "/me/player/shuffle?state=" + n, function () { st.shuffle = n; }); });
  $("repeat").addEventListener("click", function () {
    var n = st.repeat === "off" ? "context" : st.repeat === "context" ? "track" : "off";
    cmd("PUT", "/me/player/repeat?state=" + n, function () { st.repeat = n; });
  });
  var seek = $("seek");
  seek.addEventListener("input", function () { dragging = true; paintRange(seek); if (st.item) $("tNow").textContent = fmt(seek.value / 1000 * st.item.duration_ms); });
  seek.addEventListener("change", function () {
    if (!st.item) { dragging = false; return; }
    var ms = Math.round(seek.value / 1000 * st.item.duration_ms);
    cmd("PUT", "/me/player/seek?position_ms=" + ms, function () { st.progress = ms; st.at = Date.now(); });
    dragging = false;
  });
  var volTimer;
  $("volume").addEventListener("input", function () {
    var v = this; paintRange(v); busyUntil = Date.now() + 2500;
    clearTimeout(volTimer);
    volTimer = setTimeout(function () { cmd("PUT", "/me/player/volume?volume_percent=" + v.value); }, 250);
  });

  /* ---------- devices ---------- */
  function openDevices() { $("sheet").hidden = false; loadDevices(); }
  function closeDevices() { $("sheet").hidden = true; }
  async function loadDevices() {
    var box = $("devList"); box.textContent = "";
    try {
      var d = await api("GET", "/me/player/devices");
      var list = (d && d.devices) || [];
      if (!list.length) { var e = document.createElement("div"); e.className = "empty"; e.textContent = "No devices are available right now."; box.appendChild(e); return; }
      list.forEach(function (dev) {
        var b = document.createElement("button"); b.type = "button"; b.className = "dev" + (dev.is_active ? " on" : "");
        var dot = document.createElement("span"); dot.className = "dot";
        var w = document.createElement("div");
        var n = document.createElement("div"); n.className = "dn"; n.textContent = dev.name;
        var t = document.createElement("div"); t.className = "dt"; t.textContent = dev.type + (dev.is_active ? " · active" : "");
        w.appendChild(n); w.appendChild(t); b.appendChild(dot); b.appendChild(w);
        b.addEventListener("click", async function () {
          try { await api("PUT", "/me/player", { body: { device_ids: [dev.id], play: true } }); closeDevices(); setTimeout(poll, 700); }
          catch (e) { if (e.auth) return handleAuth(); toast(explain(e), true); }
        });
        box.appendChild(b);
      });
    } catch (e) { if (e.auth) return handleAuth(); var m = document.createElement("div"); m.className = "empty"; m.textContent = "Couldn’t load devices."; box.appendChild(m); }
  }
  $("deviceBtn").addEventListener("click", openDevices);
  $("scrim").addEventListener("click", closeDevices);
  $("devRefresh").addEventListener("click", loadDevices);

  /* ---------- account ---------- */
  $("menuBtn").addEventListener("click", async function () {
    $("menu").hidden = false; $("who").textContent = "Signed in";
    try { var me = await api("GET", "/me"); $("who").textContent = "Signed in as " + (me.display_name || me.id) + (me.product ? " · " + me.product : ""); } catch (e) {}
  });
  $("menuScrim").addEventListener("click", function () { $("menu").hidden = true; });
  $("signout").addEventListener("click", function () { lsDel(LS.tok); $("menu").hidden = true; stopPolling(); boot(); });
  $("changeId").addEventListener("click", function () { lsDel(LS.tok); lsDel(LS.id); $("menu").hidden = true; stopPolling(); boot(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeDevices(); $("menu").hidden = true; } });
  function handleAuth() { stopPolling(); lsDel(LS.tok); show("setup"); $("clientId").value = lsGet(LS.id) || ""; setMsg("Your session expired. Connect again.", "warn"); }

  /* ---------- setup ---------- */
  $("redirect").value = redirectUri();
  $("copyRedirect").addEventListener("click", async function () {
    try { await navigator.clipboard.writeText(redirectUri()); this.textContent = "Copied"; } catch (e) { $("redirect").select(); }
  });
  $("connect").addEventListener("click", beginLogin);
  $("clientId").addEventListener("keydown", function (e) { if (e.key === "Enter") beginLogin(); });

  /* ---------- boot ---------- */
  async function boot() {
    var params = new URLSearchParams(location.search);
    if (params.get("error")) {
      history.replaceState(null, "", redirectUri());
      show("setup"); $("clientId").value = lsGet(LS.id) || "";
      setMsg(params.get("error") === "access_denied" ? "Spotify access was declined." : "Spotify returned an error: " + params.get("error"), "bad");
      return;
    }
    if (params.get("code")) {
      try { await finishLogin(params.get("code"), params.get("state")); }
      catch (e) { show("setup"); $("clientId").value = lsGet(LS.id) || ""; setMsg(e.message || "Sign-in failed.", "bad"); return; }
    }
    if (tokens() && lsGet(LS.id)) { show("player"); startPolling(); }
    else { show("setup"); $("clientId").value = lsGet(LS.id) || ""; }
  }
  $("seek").addEventListener("pointerup", function () {});
  if ("serviceWorker" in navigator) { navigator.serviceWorker.register("sw.js").catch(function () {}); }
  boot();
})();
