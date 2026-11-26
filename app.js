(function () {
  "use strict";

  var API = "https://api.spotify.com/v1";
  var ACCOUNTS = "https://accounts.spotify.com";
  var SCOPES = [
    "user-read-playback-state", "user-modify-playback-state", "user-read-currently-playing", "user-read-private",
    "user-top-read", "user-read-recently-played", "user-library-read", "user-library-modify",
    "playlist-modify-private"
  ].join(" ");
  var LS = { id: "sr.clientId", tok: "sr.tokens", ver: "sr.verifier", state: "sr.state", scopes: "sr.scopes", set: "sr.settings" };

  var $ = function (id) { return document.getElementById(id); };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function redirectUri() { return location.origin + location.pathname; }
  function h(tag, attrs) {
    var e = document.createElement(tag); attrs = attrs || {};
    for (var k in attrs) { if (k === "class") e.className = attrs[k]; else if (k === "text") e.textContent = attrs[k]; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); }
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null) continue; e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }
    return e;
  }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  var S = { limit: 10 };
  try { var rawS = JSON.parse(lsGet(LS.set) || "{}"); if (rawS.limit) S.limit = +rawS.limit; } catch (e) {}
  function saveSettings() { lsSet(LS.set, JSON.stringify(S)); }

  /* ---------- UI helpers ---------- */
  var toastTimer;
  function toast(msg, bad) {
    var t = $("toast"); t.textContent = msg; t.className = "toast" + (bad ? " bad" : ""); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3800);
  }
  function show(id) { $("setup").hidden = id !== "setup"; $("player").hidden = id !== "player"; }
  function setMsg(msg, kind) { var n = $("setupMsg"); n.textContent = msg || ""; n.className = "note" + (kind ? " " + kind : ""); n.hidden = !msg; }
  function banner(kind, text) { var b = $("banner"); clear(b); if (text) b.appendChild(h("div", { class: "note " + kind, role: "status", text: text })); }
  function note(target, kind, text) { clear(target); if (text) target.appendChild(h("div", { class: "note " + kind, role: "status", text: text })); }
  function fmt(ms) { var s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function hue(s) { var x = 0; for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0; return x % 360; }
  function paintRange(el) { var min = +el.min, max = +el.max, v = +el.value; el.style.setProperty("--p", (max > min ? ((v - min) / (max - min)) * 100 : 0) + "%"); }
  function skel(t, n) { clear(t); for (var i = 0; i < (n || 4); i++) t.appendChild(h("div", { class: "skel" })); }

  /* ---------- PKCE auth ---------- */
  function rand(n) {
    var a = new Uint8Array(n); crypto.getRandomValues(a);
    var cs = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~", o = "";
    for (var i = 0; i < n; i++) o += cs[a[i] % cs.length];
    return o;
  }
  function b64url(buf) { var s = "", b = new Uint8Array(buf); for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  async function challenge(v) { return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v))); }
  async function beginLogin() {
    var id = $("clientId").value.trim();
    if (!/^[a-f0-9]{32}$/i.test(id)) { setMsg("That doesn’t look like a Client ID. It’s 32 letters and numbers.", "warn"); return; }
    if (!window.crypto || !crypto.subtle) { setMsg("This page must be opened over HTTPS to sign in.", "bad"); return; }
    lsSet(LS.id, id);
    var verifier = rand(96), state = rand(24);
    lsSet(LS.ver, verifier); lsSet(LS.state, state); lsSet(LS.scopes, SCOPES);
    var q = new URLSearchParams({ client_id: id, response_type: "code", redirect_uri: redirectUri(), code_challenge_method: "S256", code_challenge: await challenge(verifier), scope: SCOPES, state: state });
    location.assign(ACCOUNTS + "/authorize?" + q.toString());
  }
  async function tokenRequest(params) {
    var r = await fetch(ACCOUNTS + "/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString() });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) { var e = new Error(j.error_description || j.error || "token_error"); e.code = j.error; throw e; }
    return j;
  }
  function storeTokens(j, prev) { var t = { access: j.access_token, refresh: j.refresh_token || prev, exp: Date.now() + (j.expires_in || 3600) * 1000 }; lsSet(LS.tok, JSON.stringify(t)); return t; }
  function tokens() { try { return JSON.parse(lsGet(LS.tok)); } catch (e) { return null; } }
  function authError() { var e = new Error("auth"); e.auth = true; return e; }
  var refreshing = null;
  async function freshToken(force) {
    var t = tokens(); if (!t) throw authError();
    if (!force && t.exp - Date.now() > 60000) return t.access;
    if (!refreshing) {
      refreshing = tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh, client_id: lsGet(LS.id) })
        .then(function (j) { return storeTokens(j, t.refresh).access; })
        .catch(function (e) { if (e.code === "invalid_grant") lsDel(LS.tok); throw authError(); })
        .finally(function () { refreshing = null; });
    }
    return refreshing;
  }
  async function finishLogin(code, state) {
    var okState = state && state === lsGet(LS.state), verifier = lsGet(LS.ver);
    lsDel(LS.state); lsDel(LS.ver);
    history.replaceState(null, "", redirectUri());
    if (!okState || !verifier) throw new Error("Sign-in could not be verified. Please try again.");
    storeTokens(await tokenRequest({ grant_type: "authorization_code", code: code, redirect_uri: redirectUri(), client_id: lsGet(LS.id), code_verifier: verifier }));
  }

  /* ---------- API ---------- */
  async function api(method, path, body) {
    for (var attempt = 0; attempt < 2; attempt++) {
      var token = await freshToken(attempt > 0);
      var init = { method: method, headers: { Authorization: "Bearer " + token } };
      if (body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
      var r = await fetch(API + path, init);
      if (r.status === 401 && attempt === 0) continue;
      if (r.status === 401) throw authError();
      if (r.status === 204 || r.status === 202) return null;
      var text = await r.text(), j = null;
      try { j = text ? JSON.parse(text) : null; } catch (e) {}
      if (!r.ok) {
        var e = new Error((j && j.error && j.error.message) || "Request failed (" + r.status + ")");
        e.status = r.status; e.reason = j && j.error && j.error.reason; throw e;
      }
      return j;
    }
  }
  function explain(e) {
    if (e.status === 404 || e.reason === "NO_ACTIVE_DEVICE") { openDevices(); return "No active device. Pick one to play on."; }
    if (e.reason === "PREMIUM_REQUIRED") return "Spotify Premium is required to control playback.";
    if (e.status === 403) return "Spotify refused this request. " + (e.message || "");
    if (e.status === 429) return "Spotify is rate limiting. Wait a few seconds.";
    return e.message || "That didn’t work.";
  }
  function fail(target, e) { if (e.auth) return handleAuth(); if (target) { clear(target); note(target, "warn", explain(e)); } else toast(explain(e), true); }

  /* ---------- items ---------- */
  function imgOf(o) {
    var im = (o && o.images) || (o && o.album && o.album.images) || [];
    if (!im.length) return null;
    var pick = im.filter(function (i) { return i.width && i.width >= 200; }).pop() || im[0];
    return pick.url;
  }
  function byline(t) { return (t.artists || []).map(function (a) { return a.name; }).join(", "); }
  function thumb(o, round) {
    var u = imgOf(o);
    if (u) { var im = h("img", { src: u, alt: "", loading: "lazy" }); if (round) im.style.setProperty("border-radius", "50%"); return im; }
    var n = (o && o.name) || "?", hh = hue(n), d = h("div", { class: "tl" + (round ? " rd" : ""), "aria-hidden": "true", text: n.charAt(0).toUpperCase() });
    d.style.setProperty("background", "linear-gradient(135deg,hsl(" + hh + " 38% 46%),hsl(" + ((hh + 40) % 360) + " 42% 36%))");
    return d;
  }
  function ab(label, fn, pri) {
    var b = h("button", { class: "ab" + (pri ? " pri" : ""), type: "button", text: label });
    b.addEventListener("click", async function () { b.disabled = true; try { var r = await fn(b); if (r !== false) { /* keep label as set by fn */ } else b.disabled = false; } catch (e) { b.disabled = false; if (e.auth) return handleAuth(); toast(explain(e), true); } });
    return b;
  }
  function playUri(uri) { return api("PUT", "/me/player/play", { uris: [uri] }).then(function () { setTimeout(poll, 600); toast("Playing"); }); }
  function trackActions(t, extra) {
    var a = h("div", { class: "acts" });
    a.appendChild(ab("Play", async function (b) { await playUri(t.uri); b.disabled = false; }, true));
    a.appendChild(ab("Queue", async function (b) { await api("POST", "/me/player/queue?uri=" + encodeURIComponent(t.uri)); b.textContent = "Added"; }));
    a.appendChild(ab("Save", async function (b) { await api("PUT", "/me/tracks?ids=" + encodeURIComponent(t.id)); b.textContent = "Saved"; }));
    if (extra) a.appendChild(extra);
    return a;
  }
  function trackRow(t, i, sub, extra, rank) {
    var row = h("div", { class: "it", style: "animation-delay:" + Math.min((i || 0) * 30, 300) + "ms" });
    if (rank) row.appendChild(h("div", { class: "rk", text: String(i + 1) }));
    row.appendChild(thumb(t));
    row.appendChild(h("div", { class: "m" }, h("div", { class: "n", text: t.name }), h("div", { class: "b", text: sub || byline(t) })));
    row.appendChild(trackActions(t, extra));
    return row;
  }
  function artistRow(a, i, rank) {
    var row = h("div", { class: "it", style: "animation-delay:" + Math.min((i || 0) * 30, 300) + "ms" });
    if (rank) row.appendChild(h("div", { class: "rk", text: String(i + 1) }));
    row.appendChild(thumb(a, true));
    row.appendChild(h("div", { class: "m" }, h("div", { class: "n", text: a.name }), h("div", { class: "b", text: (a.genres || []).slice(0, 2).join(", ") })));
    var acts = h("div", { class: "acts" });
    acts.appendChild(ab("Top songs", async function (b) { var me = await getMe(); var r = await api("GET", "/artists/" + a.id + "/top-tracks?market=" + (me.country || "US")); showTracks("Top songs by " + a.name, r.tracks || []); b.disabled = false; goTo("discover"); }));
    row.appendChild(acts);
    return row;
  }
  function list(target, rows, emptyText) { clear(target); if (!rows.length) { target.appendChild(h("div", { class: "empty", text: emptyText || "Nothing to show." })); return; } rows.forEach(function (r) { target.appendChild(r); }); }

  var meCache = null;
  async function getMe() { if (!meCache) meCache = await api("GET", "/me"); return meCache; }

  /* ---------- navigation ---------- */
  var ICON = {
    home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
    listening: '<path d="M5 20V11M12 20V5M19 20v-6"/>',
    discover: '<circle cx="12" cy="12" r="8"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    vault: '<rect x="4" y="9" width="16" height="11" rx="2"/><path d="M8 9V7a4 4 0 0 1 8 0v2"/>',
    dj: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.2"/><path d="M12 4v3"/>'
  };
  var VIEWS = [["home", "Home", "Now playing"], ["listening", "Listening", "Your listening"], ["discover", "Discover", "Discover"], ["vault", "Vault", "The vault"], ["dj", "DJ", "The DJ"]];
  var cur = "home", loaded = {}, init = {};
  VIEWS.forEach(function (v) {
    var b = h("button", { "data-v": v[0], "aria-label": v[1], type: "button" });
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[v[0]] + "</svg>";
    b.appendChild(h("span", { text: v[1] })); b.addEventListener("click", function () { goTo(v[0]); }); $("nav").appendChild(b);
  });
  function goTo(id) {
    cur = id;
    document.querySelectorAll(".view").forEach(function (s) { s.classList.toggle("on", s.id === "v-" + id); });
    $("nav").querySelectorAll("button").forEach(function (b) { if (b.getAttribute("data-v") === id) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    var v = VIEWS.filter(function (x) { return x[0] === id; })[0];
    $("vtitle").textContent = v[2]; banner("", "");
    if (!loaded[id]) { loaded[id] = 1; init[id] && init[id](); }
    renderMini(); window.scrollTo(0, 0);
  }

  /* ---------- player state ---------- */
  var st = { item: null, playing: false, progress: 0, at: 0, device: null, shuffle: false, repeat: "off" };
  var lastItemId = null, dragging = false, busyUntil = 0;
  function applyPlayer(p) {
    if (!p || !p.device) { st.item = null; st.playing = false; st.device = null; }
    else { st.item = p.item || null; st.playing = !!p.is_playing; st.progress = p.progress_ms || 0; st.at = Date.now(); st.device = p.device; st.shuffle = !!p.shuffle_state; st.repeat = p.repeat_state || "off"; }
    render();
    var id = st.item && st.item.id; if (id !== lastItemId) { lastItemId = id; loadQueue(); }
  }
  function render() {
    var it = st.item;
    $("title").textContent = it ? it.name : "Nothing playing";
    $("artist").textContent = it ? byline(it) : (st.device ? "Press play to start" : "Choose a device to begin");
    $("deviceName").textContent = st.device ? st.device.name : "No device";
    $("icoPlay").hidden = st.playing; $("icoPause").hidden = !st.playing;
    $("play").setAttribute("aria-label", st.playing ? "Pause" : "Play");
    $("artWrap").classList.toggle("paused", !st.playing);
    $("shuffle").setAttribute("aria-pressed", String(st.shuffle));
    $("repeat").setAttribute("aria-pressed", String(st.repeat !== "off"));
    $("repeat").setAttribute("aria-label", "Repeat: " + (st.repeat === "context" ? "all" : st.repeat === "track" ? "one" : "off"));
    $("repeatOne").hidden = st.repeat !== "track";
    var url = it && imgOf(it.album), img = $("art"), fb = $("artFallback");
    if (url) {
      if (img.getAttribute("data-src") !== url) { img.classList.remove("on"); img.setAttribute("data-src", url); img.alt = it.album && it.album.name ? "Album art: " + it.album.name : "Album art"; img.onload = function () { img.classList.add("on"); }; img.src = url; }
      fb.hidden = true;
    } else {
      img.classList.remove("on"); img.removeAttribute("data-src"); img.removeAttribute("src");
      var n = it ? it.name : "♪", hh = hue(n); fb.hidden = false; fb.textContent = n.charAt(0).toUpperCase();
      fb.style.setProperty("background", "linear-gradient(135deg,hsl(" + hh + " 38% 50%),hsl(" + ((hh + 40) % 360) + " 42% 38%))");
    }
    var vol = $("volume"), canVol = st.device && st.device.supports_volume !== false && st.device.type !== "Smartphone";
    vol.disabled = !canVol; $("volNote").hidden = !!canVol || !st.device;
    if (st.device && st.device.volume_percent != null && Date.now() > busyUntil) { vol.value = st.device.volume_percent; paintRange(vol); }
    $("seek").disabled = !it; tick(); renderMini();
  }
  function renderMini() {
    var m = $("mini"); if (!st.item || cur === "home") { m.hidden = true; return; }
    m.hidden = false; $("miniT").textContent = st.item.name + " · " + byline(st.item); $("miniP").textContent = st.playing ? "II" : "▶";
  }
  $("mini").addEventListener("click", function (e) { if (e.target === $("miniP")) { $("play").click(); } else goTo("home"); });
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
      var q = await api("GET", "/me/player/queue"), l = (q && q.queue || []).slice(0, 8);
      list(box, l.map(function (t, i) { var row = h("div", { class: "it" }); row.appendChild(thumb(t)); row.appendChild(h("div", { class: "m" }, h("div", { class: "n", text: t.name || "" }), h("div", { class: "b", text: byline(t) }))); return row; }), "The queue is empty.");
    } catch (e) { if (e.auth) return handleAuth(); }
  }
  var pollTimer = null, failures = 0;
  async function poll() {
    if (document.hidden) return;
    try { applyPlayer(await api("GET", "/me/player")); failures = 0; }
    catch (e) { if (e.auth) return handleAuth(); if (++failures === 3) toast("Having trouble reaching Spotify.", true); }
  }
  function startPolling() { stopPolling(); poll(); pollTimer = setInterval(poll, 4000); }
  function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && !$("player").hidden) poll(); });

  async function cmd(method, path, optimistic, body) {
    var snap = Object.assign({}, st);
    if (optimistic) { optimistic(); render(); }
    try { await api(method, path, body); setTimeout(poll, 450); }
    catch (e) { if (e.auth) return handleAuth(); st = snap; render(); toast(explain(e), true); }
  }
  $("play").addEventListener("click", function () {
    if (!st.device) { openDevices(); return; }
    if (st.playing) cmd("PUT", "/me/player/pause", function () { st.progress += Date.now() - st.at; st.at = Date.now(); st.playing = false; });
    else cmd("PUT", "/me/player/play", function () { st.at = Date.now(); st.playing = true; }, {});
  });
  $("next").addEventListener("click", function () { if (!st.device) return openDevices(); cmd("POST", "/me/player/next"); });
  $("prev").addEventListener("click", function () { if (!st.device) return openDevices(); cmd("POST", "/me/player/previous"); });
  $("shuffle").addEventListener("click", function () { var n = !st.shuffle; cmd("PUT", "/me/player/shuffle?state=" + n, function () { st.shuffle = n; }); });
  $("repeat").addEventListener("click", function () { var n = st.repeat === "off" ? "context" : st.repeat === "context" ? "track" : "off"; cmd("PUT", "/me/player/repeat?state=" + n, function () { st.repeat = n; }); });
  var seek = $("seek");
  seek.addEventListener("input", function () { dragging = true; paintRange(seek); if (st.item) $("tNow").textContent = fmt(seek.value / 1000 * st.item.duration_ms); });
  seek.addEventListener("change", function () {
    if (!st.item) { dragging = false; return; }
    var ms = Math.round(seek.value / 1000 * st.item.duration_ms);
    cmd("PUT", "/me/player/seek?position_ms=" + ms, function () { st.progress = ms; st.at = Date.now(); }); dragging = false;
  });
  var volTimer;
  $("volume").addEventListener("input", function () { var v = this; paintRange(v); busyUntil = Date.now() + 2500; clearTimeout(volTimer); volTimer = setTimeout(function () { cmd("PUT", "/me/player/volume?volume_percent=" + v.value); }, 250); });

  /* ---------- devices ---------- */
  function openDevices() { $("sheet").hidden = false; loadDevices(); }
  function closeDevices() { $("sheet").hidden = true; }
  async function loadDevices() {
    var box = $("devList"); clear(box);
    try {
      var d = await api("GET", "/me/player/devices"), l = (d && d.devices) || [];
      if (!l.length) { box.appendChild(h("div", { class: "empty", text: "No devices are available right now." })); return; }
      l.forEach(function (dev) {
        var b = h("button", { type: "button", class: "dev" + (dev.is_active ? " on" : "") }, h("span", { class: "dot" }), h("div", null, h("div", { class: "dn", text: dev.name }), h("div", { class: "dt", text: dev.type + (dev.is_active ? " · active" : "") })));
        b.addEventListener("click", async function () { try { await api("PUT", "/me/player", { device_ids: [dev.id], play: true }); closeDevices(); setTimeout(poll, 700); } catch (e) { if (e.auth) return handleAuth(); toast(explain(e), true); } });
        box.appendChild(b);
      });
    } catch (e) { if (e.auth) return handleAuth(); box.appendChild(h("div", { class: "empty", text: "Couldn’t load devices." })); }
  }
  $("deviceBtn").addEventListener("click", openDevices);
  $("scrim").addEventListener("click", closeDevices);
  $("devRefresh").addEventListener("click", loadDevices);

  /* ---------- HOME ---------- */
  var recentCache = null;
  async function getRecent() {
    if (recentCache) return recentCache;
    var r = await api("GET", "/me/player/recently-played?limit=50");
    recentCache = (r && r.items || []).filter(function (x) { return x.track; }); return recentCache;
  }
  init.home = async function () {
    var box = $("homeRecent"); skel(box, 4);
    try { var r = await getRecent(), seen = {}, out = [];
      r.forEach(function (x) { if (!seen[x.track.id]) { seen[x.track.id] = 1; out.push(x.track); } });
      list(box, out.slice(0, 6).map(function (t, i) { return trackRow(t, i); }), "No recent plays yet.");
    } catch (e) { fail(box, e); }
  };

  /* ---------- LISTENING ---------- */
  var RANGES = [["Last 4 weeks", "short_term"], ["Last 6 months", "medium_term"], ["Last 12 months", "long_term"]], rng = 1, topArtistsCache = [];
  function bars(box, entries, onPick, pressed) {
    clear(box); if (!entries.length) { box.appendChild(h("div", { class: "empty", text: "Not enough data." })); return; }
    var max = entries[0][1];
    entries.forEach(function (en) {
      var b = h("button", { class: "bar", type: "button", "aria-pressed": String(pressed === en[0]), "aria-label": en[0] + ": " + en[1] }, h("span", { class: "l", text: en[0] }), h("span", { class: "tr" }, h("span", { class: "fl" })), h("span", { class: "c", text: String(en[1]) }));
      b.addEventListener("click", function () { onPick(en[0]); }); box.appendChild(b);
      requestAnimationFrame(function () { requestAnimationFrame(function () { b.querySelector(".fl").style.width = Math.max(6, en[1] / max * 100) + "%"; }); });
    });
  }
  function drawGenres(sel) {
    var counts = {}; topArtistsCache.forEach(function (a) { (a.genres || []).forEach(function (g) { counts[g] = (counts[g] || 0) + 1; }); });
    var e = Object.keys(counts).map(function (g) { return [g, counts[g]]; }).sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); }).slice(0, 8);
    bars($("genreBars"), e, function (g) { drawGenres(sel === g ? null : g); }, sel);
    var gl = $("genreList"); clear(gl);
    if (sel) { gl.appendChild(h("div", { class: "eyebrow", style: "margin:12px 0 4px", text: "Your artists in " + sel })); topArtistsCache.filter(function (a) { return (a.genres || []).indexOf(sel) > -1; }).forEach(function (a, i) { gl.appendChild(artistRow(a, i)); }); }
  }
  async function loadTop() {
    var rk = RANGES[rng][1]; skel($("topArtists")); skel($("topTracks")); clear($("genreBars"));
    try {
      var a = await api("GET", "/me/top/artists?time_range=" + rk + "&limit=50");
      topArtistsCache = a.items || []; drawGenres(null);
      list($("topArtists"), topArtistsCache.slice(0, S.limit).map(function (x, i) { return artistRow(x, i, true); }), "No top artists for this range yet.");
      var t = await api("GET", "/me/top/tracks?time_range=" + rk + "&limit=" + S.limit);
      list($("topTracks"), (t.items || []).map(function (x, i) { return trackRow(x, i, null, null, true); }), "No top tracks for this range yet.");
    } catch (e) { fail($("topArtists"), e); clear($("topTracks")); }
  }
  async function loadWhen() {
    try {
      var r = await getRecent(); if (!r.length) { $("whenNote").textContent = "No recent plays to chart."; return; }
      var first = new Date(r[r.length - 1].played_at), last = new Date(r[0].played_at);
      $("whenNote").textContent = "From your last " + r.length + " plays, " + first.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " to " + last.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ". Spotify only shares your 50 most recent plays, so this is a sample, not your full history.";
      var hrs = new Array(24).fill(0).map(function () { return []; });
      r.forEach(function (x) { hrs[new Date(x.played_at).getHours()].push(x); });
      var max = Math.max.apply(null, hrs.map(function (a) { return a.length; })) || 1, box = $("hourChart"); clear(box);
      hrs.forEach(function (arr, hr) {
        var b = h("button", { class: "hr", type: "button", "aria-pressed": "false", "aria-label": arr.length + " plays at " + hr + ":00" }, h("span", { class: "fl" }), h("span", { class: "lb", text: hr % 6 === 0 ? String(hr) : "" }));
        b.addEventListener("click", function () {
          var on = b.getAttribute("aria-pressed") === "true"; box.querySelectorAll(".hr").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
          var hl = $("hourList"); clear(hl); if (on) return; b.setAttribute("aria-pressed", "true");
          hl.appendChild(h("div", { class: "eyebrow", style: "margin:6px 0 4px", text: arr.length + " plays around " + hr + ":00" }));
          arr.forEach(function (x, i) { hl.appendChild(trackRow(x.track, i, new Date(x.played_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))); });
        });
        box.appendChild(b); requestAnimationFrame(function () { requestAnimationFrame(function () { b.querySelector(".fl").style.height = (arr.length / max * 100) + "%"; }); });
      });
      var days = {}; r.forEach(function (x) { var d = new Date(x.played_at), k = d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); days[k] = days[k] || { n: 0, d: d }; days[k].n++; });
      var keys = Object.keys(days).sort(function (a, b) { return days[a].d - days[b].d; }).slice(-14), dmax = Math.max.apply(null, keys.map(function (k) { return days[k].n; })) || 1, dbox = $("dayChart"); clear(dbox);
      keys.forEach(function (k) { var b = h("div", { class: "hr", "aria-label": days[k].n + " plays on " + days[k].d.toLocaleDateString() }, h("span", { class: "fl" }), h("span", { class: "lb", text: (days[k].d.getMonth() + 1) + "/" + days[k].d.getDate() })); dbox.appendChild(b); requestAnimationFrame(function () { requestAnimationFrame(function () { b.querySelector(".fl").style.height = (days[k].n / dmax * 100) + "%"; }); }); });
    } catch (e) { fail($("hourChart"), e); }
  }
  init.listening = function () {
    var seg = $("range");
    RANGES.forEach(function (r, i) { var b = h("button", { type: "button", "aria-pressed": String(i === rng), text: r[0] }); b.addEventListener("click", function () { rng = i; seg.querySelectorAll("button").forEach(function (x, j) { x.setAttribute("aria-pressed", String(j === i)); }); loadTop(); }); seg.appendChild(b); });
    loadTop(); loadWhen();
  };

  /* ---------- DISCOVER ---------- */
  function showTracks(title, tracks) { $("disTitle").textContent = title; list($("disOut"), tracks.map(function (t, i) { return trackRow(t, i); }), "No tracks found."); }
  async function marketOf() { try { return (await getMe()).country || "US"; } catch (e) { return "US"; } }
  async function searchApi(q, type, limit, offset) {
    var path = function (l) { return "/search?q=" + encodeURIComponent(q) + "&type=" + type + "&limit=" + l + "&market=" + "{M}" + (offset ? "&offset=" + offset : ""); };
    var m = await marketOf();
    try { return await api("GET", path(limit).replace("{M}", m)); }
    catch (e) { if (e.status === 400 && limit > 10) return api("GET", path(10).replace("{M}", m)); throw e; }
  }
  async function runSearch() {
    var q = $("q").value.trim(); if (!q) return;
    $("disTitle").textContent = "Results for “" + q + "”"; skel($("disOut"), 5);
    try {
      var r = await searchApi(q, "track,artist", S.limit), out = [];
      ((r.artists && r.artists.items) || []).slice(0, 3).forEach(function (a, i) { out.push(artistRow(a, i)); });
      ((r.tracks && r.tracks.items) || []).forEach(function (t, i) { out.push(trackRow(t, i)); });
      list($("disOut"), out, "No matches. Try different words.");
    } catch (e) { fail($("disOut"), e); }
  }
  async function runGenre(g) {
    $("disTitle").textContent = "New in " + g; skel($("disOut"), 5);
    try { var r = await searchApi('genre:"' + g + '"', "track", S.limit, Math.floor(Math.random() * 30)); showTracks("Explore: " + g, (r.tracks && r.tracks.items) || []); }
    catch (e) { fail($("disOut"), e); }
  }
  init.discover = async function () {
    $("qgo").addEventListener("click", runSearch); $("q").addEventListener("keydown", function (e) { if (e.key === "Enter") runSearch(); });
    try {
      var a = await api("GET", "/me/top/artists?time_range=medium_term&limit=30"), counts = {};
      (a.items || []).forEach(function (x) { (x.genres || []).forEach(function (g) { counts[g] = (counts[g] || 0) + 1; }); });
      var gs = Object.keys(counts).sort(function (x, y) { return counts[y] - counts[x]; }).slice(0, 12), box = $("genreChips");
      if (!gs.length) box.appendChild(h("div", { class: "empty", text: "Listen to more and your genres will appear here." }));
      gs.forEach(function (g) { var b = h("button", { class: "chip", type: "button", "aria-pressed": "false", text: g }); b.addEventListener("click", function () { box.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-pressed", String(c === b)); }); runGenre(g); }); box.appendChild(b); });
    } catch (e) { fail($("genreChips"), e); }
  };

  /* ---------- VAULT ---------- */
  var vault = { total: 0, memo: {} };
  async function savedAt(i) {
    if (vault.memo[i]) return vault.memo[i];
    var r = await api("GET", "/me/tracks?limit=1&offset=" + i); vault.total = r.total; var it = r.items && r.items[0]; vault.memo[i] = it; return it;
  }
  async function savedPage(offset, limit) { var r = await api("GET", "/me/tracks?limit=" + limit + "&offset=" + Math.max(0, offset)); vault.total = r.total; return r.items || []; }
  function vaultRows(items, label) {
    list($("vaultOut"), items.map(function (x, i) { return trackRow(x.track, i, "Saved " + new Date(x.added_at).toLocaleDateString(undefined, { month: "short", year: "numeric" }) + " · " + byline(x.track)); }), label || "Nothing here.");
  }
  async function vaultRun(kind, btn) {
    document.querySelectorAll("#vaultChips .chip").forEach(function (c) { c.setAttribute("aria-pressed", String(c === btn)); });
    skel($("vaultOut"), 5);
    try {
      var lim = Math.min(S.limit * 2, 50);
      if (kind === "oldest") { var it = await savedPage(vault.total - lim, lim); vaultRows(it.slice().reverse()); }
      else if (kind === "random") { var o = Math.floor(Math.random() * Math.max(1, vault.total - lim)); var it2 = await savedPage(o, lim); vaultRows(it2.sort(function () { return Math.random() - .5; }).slice(0, S.limit)); }
      else {
        var y = +kind, start = new Date(Date.UTC(y, 0, 1)).toISOString(), end = new Date(Date.UTC(y + 1, 0, 1)).toISOString(), lo = 0, hi = vault.total;
        while (lo < hi) { var mid = (lo + hi) >> 1, m = await savedAt(mid); if (m.added_at < end) hi = mid; else lo = mid + 1; }
        var page = await savedPage(lo, 50); vaultRows(page.filter(function (x) { return x.added_at >= start && x.added_at < end; }).slice(0, 50), "No saves in " + y + ".");
      }
    } catch (e) { fail($("vaultOut"), e); }
  }
  init.vault = async function () {
    var box = $("vaultChips");
    try {
      var first = await savedAt(0); if (!first) { $("vaultInfo").textContent = "Your library has no saved songs yet."; return; }
      var oldest = await savedAt(vault.total - 1), y0 = new Date(oldest.added_at).getFullYear(), y1 = new Date().getFullYear();
      $("vaultInfo").textContent = vault.total + " saved songs, going back to " + y0 + ".";
      function chip(label, kind) { var b = h("button", { class: "chip", type: "button", "aria-pressed": "false", text: label }); b.addEventListener("click", function () { vaultRun(kind, b); }); box.appendChild(b); }
      chip("Oldest saves", "oldest"); chip("Surprise me", "random");
      for (var y = y0; y <= y1; y++) chip("Saved in " + y, y);
    } catch (e) { fail($("vaultInfo"), e); }
  };

  /* ---------- DJ ---------- */
  var MOODS = { Calm: ["acoustic", "chill", "singer-songwriter"], Energized: ["rock", "dance pop", "pop rock"], Nostalgic: ["classic rock", "oldies", "country classics"], Focused: ["instrumental", "ambient", "lo-fi"], Happy: ["pop", "reggae", "feel-good"], Moody: ["indie", "alternative", "blues"], Romantic: ["r&b", "soul", "love songs"], Confident: ["hip hop", "rap", "trap"] };
  var ACTS = { Driving: ["country rock", "classic rock"], Working: ["lo-fi", "instrumental"], Workout: ["edm", "hard rock", "hip hop"], Cooking: ["soul", "jazz"], "Golf round": ["country", "soft rock"], "Hunting trip": ["outlaw country", "southern rock"], "Hosting friends": ["pop", "funk"], "Winding down": ["acoustic", "jazz"] };
  var pick = { mood: null, act: null }, mix = [];
  function chipset(box, names, key) { Object.keys(names).forEach(function (n) { var b = h("button", { class: "chip", type: "button", "aria-pressed": "false", text: n }); b.addEventListener("click", function () { pick[key] = pick[key] === n ? null : n; box.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-pressed", String(c.textContent === pick[key])); }); }); box.appendChild(b); }); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function drawMix() {
    var total = mix.reduce(function (s, t) { return s + t.duration_ms; }, 0);
    $("djSave").hidden = !mix.length;
    list($("djOut"), mix.map(function (t, i) { return trackRow(t, i, byline(t), ab("Remove", async function () { mix = mix.filter(function (x) { return x.uri !== t.uri; }); drawMix(); }), false); }), "Nothing found. Try another mood or add artists.");
    if (mix.length) $("djOut").insertBefore(h("div", { class: "fine", style: "margin:0 0 6px", text: mix.length + " songs · about " + Math.round(total / 60000) + " min" }), $("djOut").firstChild);
  }
  async function buildMix() {
    var likes = $("djLike").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 5);
    var genres = (pick.mood ? MOODS[pick.mood] : []).concat(pick.act ? ACTS[pick.act] : []);
    if (!genres.length && !likes.length) { note($("djMsg"), "warn", "Pick a mood, an activity or add an artist first."); return; }
    note($("djMsg"), "", ""); skel($("djOut"), 5); $("djSave").hidden = true; $("djBuild").disabled = true;
    var target = (+$("djLen").value) * 60000, market = await marketOf(), pools = [];
    try {
      for (var i = 0; i < likes.length; i++) {
        var r = await searchApi(likes[i], "artist", 1);
        var a = r.artists && r.artists.items && r.artists.items[0];
        if (a) { var tt = await api("GET", "/artists/" + a.id + "/top-tracks?market=" + market); pools.push(shuffle((tt.tracks || []).slice())); }
      }
      var gl = shuffle(genres.slice()).slice(0, 4);
      for (var j = 0; j < gl.length; j++) { var gr = await searchApi('genre:"' + gl[j] + '"', "track", 20, Math.floor(Math.random() * 25)); pools.push(shuffle(((gr.tracks && gr.tracks.items) || []).slice())); }
      var seen = {}, out = [], sum = 0, guard = 0;
      while (sum < target && guard++ < 400) {
        var any = false;
        for (var p = 0; p < pools.length && sum < target; p++) { var t = pools[p].shift(); if (!t) continue; any = true; if (seen[t.uri]) continue; seen[t.uri] = 1; out.push(t); sum += t.duration_ms; }
        if (!any) break;
      }
      mix = out; drawMix();
      if (out.length && sum < target * 0.8) note($("djMsg"), "warn", "Spotify returned fewer songs than a full " + $("djLen").value + " minutes. You can add artists to widen it.");
    } catch (e) { fail($("djOut"), e); }
    $("djBuild").disabled = false;
  }
  async function saveMix() {
    if (!mix.length) return; var b = $("djSave"); b.disabled = true;
    try {
      var me = await getMe(), nm = ((pick.mood || "") + " " + (pick.act || "")).trim() || "Studio mix";
      var d = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
      var pl = await api("POST", "/users/" + encodeURIComponent(me.id) + "/playlists", { name: nm + " · " + d, description: "Built with Spotify Studio", public: false });
      for (var i = 0; i < mix.length; i += 100) await api("POST", "/playlists/" + pl.id + "/tracks", { uris: mix.slice(i, i + 100).map(function (t) { return t.uri; }) });
      note($("djMsg"), "ok", "Saved to your Spotify library as a private playlist.");
      var u = pl.external_urls && pl.external_urls.spotify; if (u && u.indexOf("https://") === 0) $("djMsg").firstChild.appendChild(h("a", { href: u, target: "_blank", rel: "noopener", style: "margin-left:8px;font-weight:700", text: "Open" }));
    } catch (e) { b.disabled = false; if (e.auth) return handleAuth(); note($("djMsg"), "bad", "Couldn’t save the playlist. " + explain(e)); return; }
    b.disabled = false;
  }
  init.dj = function () { chipset($("djMood"), MOODS, "mood"); chipset($("djAct"), ACTS, "act"); $("djBuild").addEventListener("click", buildMix); $("djSave").addEventListener("click", saveMix); };

  /* ---------- account ---------- */
  $("menuBtn").addEventListener("click", async function () {
    $("menu").hidden = false; $("who").textContent = "Signed in"; $("sLimit").value = String(S.limit);
    try { var me = await getMe(); $("who").textContent = "Signed in as " + (me.display_name || me.id) + (me.product ? " · " + me.product : ""); } catch (e) {}
  });
  $("sLimit").addEventListener("change", function () { S.limit = +this.value; saveSettings(); toast("Saved. Applies to new lists."); });
  $("menuScrim").addEventListener("click", function () { $("menu").hidden = true; });
  $("signout").addEventListener("click", function () { lsDel(LS.tok); $("menu").hidden = true; stopPolling(); location.assign(redirectUri()); });
  $("changeId").addEventListener("click", function () { lsDel(LS.tok); lsDel(LS.id); $("menu").hidden = true; stopPolling(); location.assign(redirectUri()); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeDevices(); $("menu").hidden = true; } });
  function handleAuth(msg) { stopPolling(); lsDel(LS.tok); show("setup"); $("clientId").value = lsGet(LS.id) || ""; setMsg(msg || "Your session expired. Connect again.", "warn"); }

  /* ---------- setup + boot ---------- */
  $("redirect").value = redirectUri();
  $("copyRedirect").addEventListener("click", async function () { try { await navigator.clipboard.writeText(redirectUri()); this.textContent = "Copied"; } catch (e) { $("redirect").select(); } });
  $("connect").addEventListener("click", beginLogin);
  $("clientId").addEventListener("keydown", function (e) { if (e.key === "Enter") beginLogin(); });
  async function boot() {
    var params = new URLSearchParams(location.search);
    if (params.get("error")) { history.replaceState(null, "", redirectUri()); show("setup"); $("clientId").value = lsGet(LS.id) || ""; setMsg(params.get("error") === "access_denied" ? "Spotify access was declined." : "Spotify returned an error: " + params.get("error"), "bad"); return; }
    if (params.get("code")) { try { await finishLogin(params.get("code"), params.get("state")); } catch (e) { show("setup"); $("clientId").value = lsGet(LS.id) || ""; setMsg(e.message || "Sign-in failed.", "bad"); return; } }
    if (tokens() && lsGet(LS.id)) {
      if (lsGet(LS.scopes) !== SCOPES) { handleAuth("Studio needs a few new permissions (listening history, library and playlists). Tap Connect to approve them."); return; }
      show("player"); goTo("home"); startPolling();
    } else { show("setup"); $("clientId").value = lsGet(LS.id) || ""; }
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
  boot();
})();
