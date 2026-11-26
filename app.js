(function () {
  "use strict";

  /* =====================================================================
     Config — keys and scopes are unchanged so existing sign-ins and
     preferences carry over.
     ===================================================================== */
  var APP_VERSION = "2.1 · Studio One";
  var API = "https://api.spotify.com/v1";
  var ACCOUNTS = "https://accounts.spotify.com";
  var SCOPES = [
    "user-read-playback-state", "user-modify-playback-state", "user-read-currently-playing", "user-read-private",
    "user-top-read", "user-read-recently-played", "user-library-read", "user-library-modify",
    "playlist-modify-private", "playlist-read-private", "playlist-read-collaborative", "user-follow-read"
  ].join(" ");
  var LS = { id: "sr.clientId", tok: "sr.tokens", ver: "sr.verifier", state: "sr.state", scopes: "sr.scopes", set: "sr.settings" };

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function redirectUri() { return location.origin + location.pathname; }

  var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  if (standalone) document.documentElement.classList.add("standalone");

  /* =====================================================================
     Icons (static, trusted)
     ===================================================================== */
  var PATHS = {
    logo: '<rect class="lg-bg" width="24" height="24" rx="6.5"/><circle class="lg-ring" cx="12" cy="12" r="6.3" fill="none" stroke-width="1.8"/><path class="lg-fg" d="M10.5 9.3v5.4l4.3-2.7z"/>',
    home: '<path d="M3.5 10.5 12 3.5l8.5 7V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-6v6H5A1.5 1.5 0 0 1 3.5 19z"/>',
    library: '<path d="M5 4v16M9.5 4v16M14 4.5l5 15"/>',
    chart: '<path d="M5 20v-7M10 20V5M15 20v-10M20 20v-4"/>',
    compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8z"/>',
    archive: '<rect x="3.5" y="4" width="17" height="4" rx="1"/><path d="M5 8v10.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V8M10 12h4"/>',
    wave: '<path d="M4 10v4M8 6v12M12 3.5v17M16 7v10M20 10v4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    more: '<circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/>',
    play: '<path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z"/>',
    pause: '<rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/>',
    next: '<path d="M5 6.2v11.6a.7.7 0 0 0 1.1.6l8.4-5.8a.7.7 0 0 0 0-1.2L6.1 5.6A.7.7 0 0 0 5 6.2z"/><rect x="16.5" y="5.5" width="2.5" height="13" rx="1"/>',
    prev: '<path d="M19 6.2v11.6a.7.7 0 0 1-1.1.6l-8.4-5.8a.7.7 0 0 1 0-1.2l8.4-5.8a.7.7 0 0 1 1.1.6z"/><rect x="5" y="5.5" width="2.5" height="13" rx="1"/>',
    shuffle: '<path d="M16 4h4v4M4 20 20 4M20 16v4h-4M15 15l5 5M4 4l5 5"/>',
    repeat: '<path d="M17 2l3 3-3 3M3 11V9a4 4 0 0 1 4-4h13M7 22l-3-3 3-3M21 13v2a4 4 0 0 1-4 4H4"/>',
    heart: '<path d="M12 20s-7.5-4.6-9.2-9.3C1.7 7.5 3.8 4.5 7 4.5c2 0 3.3 1.1 5 3 1.7-1.9 3-3 5-3 3.2 0 5.3 3 4.2 6.2C19.5 15.4 12 20 12 20z"/>',
    device: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    speaker: '<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><circle cx="12" cy="14" r="3.5"/><path d="M12 7h.01"/>',
    computer: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8.5 20h7M12 16.5V20"/>',
    chevD: '<path d="M6 9l6 6 6-6"/>',
    chevL: '<path d="M15 6l-6 6 6 6"/>',
    chevR: '<path d="M9 6l6 6-6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    queue: '<path d="M4 6h12M4 12h12M4 18h8M17 15v6M14 18h6"/>',
    minus: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12h7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    volume: '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    note: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    person: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.3v.2"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
    ambient: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M8 15l3-3.5 2.5 2.5 1.5-1.5L17 15"/>',
    expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    disc: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.5"/>'
  };
  var FILLED = { play: 1, pause: 1, next: 1, prev: 1, more: 1 };
  function svg(n) { return '<svg viewBox="0 0 24 24" class="ic' + (FILLED[n] ? " fi" : "") + '" aria-hidden="true" focusable="false">' + (PATHS[n] || "") + "</svg>"; }
  function icon(n) { var s = document.createElement("span"); s.className = "ico"; s.innerHTML = svg(n); return s; }
  function hydrateIcons(root) {
    $$("[data-icon]", root).forEach(function (el) { el.innerHTML = svg(el.getAttribute("data-icon")); el.classList.add("ico"); });
    $$(".js-artfb", root).forEach(function (el) { el.innerHTML = svg("note"); });
  }

  /* =====================================================================
     DOM helpers
     ===================================================================== */
  function h(tag, attrs) {
    var e = document.createElement(tag); attrs = attrs || {};
    for (var k in attrs) {
      var v = attrs[k]; if (v == null) continue;
      if (k === "class") e.className = v; else if (k === "text") e.textContent = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
    }
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null) continue; e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }
    return e;
  }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); }
  function stagger(el, i) { el.style.animationDelay = Math.min((i || 0) * 26, 280) + "ms"; return el; }
  function safeUrl(u) { return typeof u === "string" && u.indexOf("https://") === 0 ? u : null; }
  function setText(id, t) { var e = $(id); if (e && e.textContent !== t) e.textContent = t; }

  /* =====================================================================
     Settings + theme (same storage key and shape as before)
     ===================================================================== */
  var S = { limit: 10, theme: "light" };
  try { var rawS = JSON.parse(lsGet(LS.set) || "{}"); if (rawS.limit) S.limit = +rawS.limit; if (rawS.theme) S.theme = rawS.theme; } catch (e) {}
  function saveSettings() { lsSet(LS.set, JSON.stringify(S)); }
  var darkMq = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
  function applyTheme() {
    var t = S.theme === "system" ? (darkMq && darkMq.matches ? "dark" : "light") : S.theme;
    document.documentElement.setAttribute("data-theme", t);
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", t === "dark" ? "#0B0D0C" : "#F5F6F5");
  }
  if (darkMq && darkMq.addEventListener) darkMq.addEventListener("change", function () { if (S.theme === "system") applyTheme(); });
  applyTheme();

  /* =====================================================================
     Feedback: toast, banner, skeleton / empty / error states
     ===================================================================== */
  var toastTimer;
  function toast(msg, bad) {
    var t = $("toast"); t.hidden = true; t.textContent = msg; t.className = "toast" + (bad ? " bad" : "");
    void t.offsetWidth; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3000);
  }
  function show(id) { $("setup").hidden = id !== "setup"; $("app").hidden = id !== "app"; }
  function setMsg(msg, kind) { var n = $("setupMsg"); n.textContent = msg || ""; n.className = "note" + (kind ? " " + kind : ""); n.hidden = !msg; }
  function note(target, kind, text) { clear(target); if (text) target.appendChild(h("div", { class: "note " + kind, role: "status", text: text })); }
  function banner(kind, text) { note($("banner"), kind, text); }
  function fmt(ms) { var s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function paintRange(el) { var min = +el.min, max = +el.max, v = +el.value; el.style.setProperty("--p", (max > min ? ((v - min) / (max - min)) * 100 : 0) + "%"); }

  function skelList(t, n) {
    clear(t);
    for (var i = 0; i < (n || 4); i++) t.appendChild(h("div", { class: "skrow", "aria-hidden": "true" }, h("span", { class: "sk t" }), h("span", { class: "m" }, h("span", { class: "sk l" }), h("span", { class: "sk l2" }))));
    t.setAttribute("aria-busy", "true");
  }
  function skelRail(t, n) {
    clear(t);
    for (var i = 0; i < (n || 5); i++) t.appendChild(h("div", { class: "sktile", "aria-hidden": "true" }, h("span", { class: "sk a" }), h("span", { class: "sk l" }), h("span", { class: "sk l2" })));
    t.setAttribute("aria-busy", "true");
  }
  function stateBox(t, o) {
    clear(t); t.removeAttribute("aria-busy");
    var box = h("div", { class: "state" + (o.error ? " error" : ""), role: o.error ? "alert" : null }, icon(o.icon || "note"), h("div", { class: "st-t", text: o.title }), o.text ? h("div", { class: "st-x", text: o.text }) : null);
    if (o.action) { var b = h("button", { class: "btn secondary sm", type: "button", text: o.action.label }); b.addEventListener("click", o.action.fn); box.appendChild(b); }
    t.appendChild(box);
  }
  function errInfo(e) {
    if (e && e.network) return { title: "Can’t reach Spotify", text: "Check your connection and try again." };
    if (e && (e.status === 404 || e.reason === "NO_ACTIVE_DEVICE")) return { title: "No active device", text: "Open Spotify on a device, then connect to it here." };
    if (e && e.reason === "PREMIUM_REQUIRED") return { title: "Premium required", text: "Spotify only allows playback control with Premium." };
    if (e && e.status === 403) return { title: "Not available", text: "Spotify doesn’t allow this for personal developer apps." };
    if (e && e.status === 429) return { title: "Spotify is busy", text: "Too many requests. Wait a few seconds and try again." };
    if (e && e.status >= 500) return { title: "Spotify is having trouble", text: "This usually clears up in a minute." };
    return { title: "Something went wrong", text: (e && e.message) || "Please try again." };
  }
  function explain(e) { var i = errInfo(e); return i.title + ". " + i.text; }
  function errorState(t, e, retry) {
    if (e && e.auth) return handleAuth();
    var i = errInfo(e);
    stateBox(t, { error: true, icon: "alert", title: i.title, text: i.text, action: retry ? { label: "Try again", fn: retry } : null });
  }

  /* =====================================================================
     PKCE auth (unchanged flow)
     ===================================================================== */
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

  /* =====================================================================
     API
     ===================================================================== */
  async function api(method, path, body) {
    for (var attempt = 0; attempt < 2; attempt++) {
      var token = await freshToken(attempt > 0);
      var init = { method: method, headers: { Authorization: "Bearer " + token } };
      if (body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
      var r;
      try { r = await fetch(API + path, init); }
      catch (ne) { var en = new Error("network"); en.network = true; throw en; }
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
  var meCache = null;
  async function getMe() { if (!meCache) meCache = await api("GET", "/me"); return meCache; }
  async function marketOf() { try { return (await getMe()).country || "US"; } catch (e) { return "US"; } }

  /* Spotify caps search at 10 results per request for personal apps, so larger asks are paged. */
  async function searchApi(q, type, limit, offset) {
    var m = await marketOf(), want = Math.max(1, limit || 10), off = offset || 0, out = null;
    while (want > 0) {
      var l = Math.min(10, want);
      var r = await api("GET", "/search?q=" + encodeURIComponent(q) + "&type=" + type + "&limit=" + l + "&market=" + m + (off ? "&offset=" + off : ""));
      if (!out) out = r || {};
      else Object.keys(r || {}).forEach(function (k) { if (out[k] && r[k] && r[k].items) out[k].items = out[k].items.concat(r[k].items); });
      var got = Math.max.apply(null, Object.keys(r || {}).map(function (k) { return (r[k] && r[k].items) ? r[k].items.length : 0; }).concat([0]));
      if (got < l) break;
      want -= l; off += l;
    }
    return out || {};
  }
  /* Spotify removed artist top tracks for personal apps: search the catalog by artist instead. */
  async function artistTracks(a, n) {
    var r = await searchApi('artist:"' + a.name + '"', "track", n || 20), seen = {}, out = [];
    ((r.tracks && r.tracks.items) || []).forEach(function (t) {
      if (!t || seen[t.name.toLowerCase()]) return;
      if (!(t.artists || []).some(function (x) { return x.id === a.id || x.name === a.name; })) return;
      seen[t.name.toLowerCase()] = 1; out.push(t);
    });
    return out;
  }

  /* =====================================================================
     Items: thumbnails, rows, tiles, action sheet
     ===================================================================== */
  function imgOf(o, min) {
    var im = (o && o.images) || (o && o.album && o.album.images) || [];
    if (!im.length) return null;
    var pick = im.filter(function (i) { return i.width && i.width >= (min || 200); }).pop() || im[0];
    return safeUrl(pick.url);
  }
  function byline(t) { return ((t && t.artists) || []).map(function (a) { return a.name; }).join(", "); }
  function thumb(o, round, min) {
    var u = imgOf(o, min);
    if (u) return h("img", { class: "thumb" + (round ? " round" : ""), src: u, alt: "", loading: "lazy", decoding: "async" });
    var s = h("span", { class: "thumb" + (round ? " round" : ""), "aria-hidden": "true" }); s.innerHTML = svg(round ? "person" : "note"); return s;
  }
  function list(target, rows, empty) {
    clear(target); target.removeAttribute("aria-busy");
    if (!rows.length) { stateBox(target, typeof empty === "string" ? { title: empty } : (empty || { title: "Nothing here yet" })); return; }
    rows.forEach(function (r, i) { target.appendChild(stagger(r, i)); });
    updateRailNav(target);
  }
  function isNow(uri) { return !!(st.item && st.item.uri === uri); }

  async function playUri(uri) { await api("PUT", "/me/player/play", { uris: [uri] }); setTimeout(poll, 600); }
  function playTrack(t) {
    if (!st.device) { openDevices(); toast("Choose a device first"); return; }
    playUri(t.uri).then(function () { toast("Playing " + t.name); }).catch(function (e) { if (e.auth) return handleAuth(); if (e.status === 404) openDevices(); toast(explain(e), true); });
  }
  function trackItems(t, extra) {
    return [
      { label: "Play now", icon: "play", fn: function () { return playUri(t.uri).then(function () { return "Playing " + t.name; }); } },
      { label: "Add to queue", icon: "queue", fn: function () { return api("POST", "/me/player/queue?uri=" + encodeURIComponent(t.uri)).then(function () { setTimeout(loadQueue, 600); return "Added to queue"; }); } },
      { label: "Save to Liked Songs", icon: "heart", fn: function () { return api("PUT", "/me/library?uris=" + encodeURIComponent(t.uri)).then(function () { if (isNow(t.uri)) setHeart(true); return "Saved to Liked Songs"; }); } }
    ].concat(extra || []);
  }
  function trackSheet(t, extra) { openActions({ title: t.name, sub: byline(t), obj: t, url: t.external_urls && t.external_urls.spotify, items: trackItems(t, extra) }); }

  function trackRow(t, i, sub, o) {
    o = o || {};
    var row = h("div", { class: "it" + (isNow(t.uri) ? " now" : ""), "data-uri": t.uri });
    var main = h("button", { class: "itmain", type: "button", "aria-label": "Play " + t.name + (byline(t) ? " by " + byline(t) : "") });
    if (o.rank) main.appendChild(h("span", { class: "rk", text: String(i + 1) }));
    main.appendChild(thumb(t));
    main.appendChild(h("span", { class: "m" }, h("span", { class: "n", text: t.name || "" }), h("span", { class: "b", text: sub || byline(t) })));
    main.appendChild(h("span", { class: "eq", "aria-hidden": "true" }, h("i"), h("i"), h("i")));
    main.addEventListener("click", function () { if (o.play) o.play(t); else playTrack(t); });
    var more = h("button", { class: "more", type: "button", "aria-label": "More options for " + t.name }, icon("more"));
    more.addEventListener("click", function () { trackSheet(t, o.extra); });
    row.appendChild(main); row.appendChild(more);
    return row;
  }
  function artistRow(a, i, rank) {
    var row = h("div", { class: "it" });
    var main = h("button", { class: "itmain", type: "button", "aria-label": "Songs by " + a.name });
    if (rank) main.appendChild(h("span", { class: "rk", text: String(i + 1) }));
    main.appendChild(thumb(a, true));
    main.appendChild(h("span", { class: "m" }, h("span", { class: "n", text: a.name }), h("span", { class: "b", text: (a.genres || []).slice(0, 2).join(", ") || "Artist" })));
    main.addEventListener("click", function () { artistTop(a); });
    row.appendChild(main);
    return row;
  }
  function trackTile(t) {
    var w = h("div", { class: "tile" + (isNow(t.uri) ? " now" : ""), "data-uri": t.uri });
    var b = h("button", { class: "tmain", type: "button", "aria-label": "Play " + t.name + (byline(t) ? " by " + byline(t) : "") },
      h("span", { class: "tart" }, thumb(t, false, 300)), h("span", { class: "tn", text: t.name }), h("span", { class: "tb", text: byline(t) }));
    b.addEventListener("click", function () { playTrack(t); });
    var m = h("button", { class: "tmore", type: "button", "aria-label": "More options for " + t.name }, icon("more"));
    m.addEventListener("click", function () { trackSheet(t); });
    w.appendChild(b); w.appendChild(m);
    return w;
  }
  function artistTile(a) {
    var w = h("div", { class: "tile" });
    var b = h("button", { class: "tmain", type: "button", "aria-label": "Songs by " + a.name },
      h("span", { class: "tart" }, thumb(a, true, 300)), h("span", { class: "tn", text: a.name }), h("span", { class: "tb", text: (a.genres || [])[0] || "Artist" }));
    b.addEventListener("click", function () { artistTop(a); });
    w.appendChild(b);
    return w;
  }
  async function artistTop(a) {
    goTo("discover");
    $("disTitle").textContent = "Songs by " + a.name; skelList($("disOut"), 6);
    try { showTracks("Songs by " + a.name, await artistTracks(a, 20)); }
    catch (e) { errorState($("disOut"), e, function () { artistTop(a); }); }
  }
  function markNow() { $$("[data-uri]").forEach(function (el) { el.classList.toggle("now", isNow(el.getAttribute("data-uri"))); }); }

  /* rail arrow buttons (pointer devices) */
  function updateRailNav(rail) {
    if (!rail || !rail.classList.contains("rail")) return;
    var nav = document.querySelector('.railnav[data-rail="' + rail.id + '"]'); if (!nav) return;
    var bs = nav.querySelectorAll("button"); if (bs.length < 2) return;
    bs[0].disabled = rail.scrollLeft <= 4;
    bs[1].disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 4;
  }
  $$(".railnav").forEach(function (nav) {
    var rail = $(nav.getAttribute("data-rail"));
    ["chevL", "chevR"].forEach(function (ic, i) {
      var b = h("button", { class: "iconbtn", type: "button", "aria-label": i ? "Scroll right" : "Scroll left" }, icon(ic));
      b.addEventListener("click", function () { rail.scrollBy({ left: (i ? 1 : -1) * Math.max(200, rail.clientWidth * 0.8), behavior: "smooth" }); });
      nav.appendChild(b);
    });
    rail.addEventListener("scroll", function () { updateRailNav(rail); }, { passive: true });
  });

  /* action sheet */
  function openActions(o) {
    var art = $("actArt"); clear(art); art.appendChild(thumb(o.obj, o.round));
    $("actTitle").textContent = o.title || ""; $("actSub").textContent = o.sub || "";
    var box = $("actList"); clear(box);
    o.items.forEach(function (it) {
      var b = h("button", { class: "actbtn" + (it.danger ? " danger" : ""), type: "button" }, icon(it.icon), h("span", { text: it.label }));
      b.addEventListener("click", async function () {
        closeSheet("actions");
        try { var msg = await it.fn(); if (msg) toast(msg); }
        catch (e) { if (e.auth) return handleAuth(); if (e.status === 404) openDevices(); toast(explain(e), true); }
      });
      box.appendChild(b);
    });
    var u = safeUrl(o.url);
    if (u) box.appendChild(h("a", { class: "actbtn", href: u, target: "_blank", rel: "noopener" }, icon("open"), h("span", { text: "Open in Spotify" })));
    openSheet("actions");
  }

  /* sheets */
  var lastFocus = null;
  function openSheet(id) {
    lastFocus = document.activeElement; $(id).hidden = false;
    var f = $(id).querySelector(".panel button, .panel a"); if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) {} }, 40);
  }
  function closeSheet(id) { var s = $(id); if (s.hidden) return; s.hidden = true; if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} } }
  function openSheetId() { return ["actions", "devices"].filter(function (id) { return !$(id).hidden; })[0]; }
  $$("[data-close]").forEach(function (el) { el.addEventListener("click", function () { closeSheet(el.getAttribute("data-close")); }); });

  /* =====================================================================
     Navigation
     ===================================================================== */
  var VIEWS = [["home", "Home", "home"], ["library", "Library", "library"], ["insights", "Insights", "chart"], ["discover", "Discover", "compass"], ["vault", "Vault", "archive"], ["dj", "DJ", "wave"], ["settings", "Settings", "settings"]];
  var SUB = { library: "Playlists, albums and artists", insights: "From your Spotify history", discover: "Search and explore", vault: "Rediscover your saved songs", dj: "Build a mix for the moment", settings: "Account, playback and appearance" };
  var cur = "home", loaded = {}, init = {}, refresh = {};
  VIEWS.forEach(function (v) {
    var b = h("button", { type: "button", "data-v": v[0], class: v[0] === "settings" ? "nav-settings" : null }, icon(v[2]), h("span", { text: v[1] }));
    b.addEventListener("click", function () { goTo(v[0]); });
    $("navItems").appendChild(b);
  });
  function greeting() {
    var hr = new Date().getHours(), g = hr < 5 ? "Good evening" : hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
    var n = meCache && meCache.display_name ? meCache.display_name.split(" ")[0] : "";
    return n ? g + ", " + n : g;
  }
  function setHeader() {
    if (cur === "home") { setText("vtitle", greeting()); setText("vsub", new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })); }
    else { setText("vtitle", VIEWS.filter(function (x) { return x[0] === cur; })[0][1]); setText("vsub", SUB[cur] || ""); }
  }
  function goTo(id) {
    if (!VIEWS.some(function (v) { return v[0] === id; })) id = "home";
    var same = cur === id && loaded[id];
    cur = id;
    $$(".view").forEach(function (s) { s.classList.toggle("on", s.id === "v-" + id); });
    $$("#navItems button").forEach(function (b) { if (b.getAttribute("data-v") === id) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    setHeader(); banner("", "");
    document.title = id === "home" ? "Spotify Studio" : VIEWS.filter(function (x) { return x[0] === id; })[0][1] + " · Studio";
    if (!loaded[id]) { loaded[id] = 1; init[id] && init[id](); }
    else if (same && refresh[id]) refresh[id]();
    syncHeroVisibility();
    window.scrollTo(0, 0);
  }
  $("avatarBtn").addEventListener("click", function () { goTo("settings"); });

  /* =====================================================================
     Artwork colour (drives the hero wash, player tint and progress)
     ===================================================================== */
  function rgbToHs(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn, l = (mx + mn) / 2, s = dl === 0 ? 0 : dl / (1 - Math.abs(2 * l - 1)), hh = 0;
    if (dl) { if (mx === r) hh = ((g - b) / dl) % 6; else if (mx === g) hh = (b - r) / dl + 2; else hh = (r - g) / dl + 4; hh = (hh * 60 + 360) % 360; }
    return { h: Math.round(hh), s: s };
  }
  function extractColor(url) {
    return new Promise(function (res) {
      var im = new Image(); im.crossOrigin = "anonymous";
      im.onload = function () {
        try {
          var N = 28, c = document.createElement("canvas"); c.width = c.height = N;
          var x = c.getContext("2d"); x.drawImage(im, 0, 0, N, N);
          var d = x.getImageData(0, 0, N, N).data, B = [];
          for (var k = 0; k < 12; k++) B.push({ r: 0, g: 0, b: 0, w: 0 });
          for (var i = 0; i < d.length; i += 4) {
            var r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dl = mx - mn;
            if (dl < 0.08 || l < 0.12 || l > 0.9) continue;
            var hs = rgbToHs(r, g, b), w = hs.s * (1 - Math.abs(l - 0.5)), bk = B[Math.floor(hs.h / 30) % 12];
            bk.r += r * w; bk.g += g * w; bk.b += b * w; bk.w += w;
          }
          var best = B.reduce(function (a, z) { return z.w > a.w ? z : a; });
          if (best.w < 0.5) return res({ h: 150, s: 0.05 });
          res(rgbToHs(best.r / best.w, best.g / best.w, best.b / best.w));
        } catch (e) { res(null); }
      };
      im.onerror = function () { res(null); };
      im.src = url;
    });
  }
  function setArtColor(c) {
    var root = document.documentElement.style;
    if (!c) { root.setProperty("--art-h", "141"); root.setProperty("--art-s", "45"); return; }
    root.setProperty("--art-h", String(c.h)); root.setProperty("--art-s", String(Math.round(Math.min(c.s, 0.6) * 100)));
  }

  /* =====================================================================
     Player state + rendering
     ===================================================================== */
  var st = { item: null, playing: false, progress: 0, at: 0, device: null, shuffle: false, repeat: "off" };
  var lastItemId, dragging = false, busyUntil = 0, artKey = null;
  function applyPlayer(p) {
    if (!p || !p.device) { st.item = null; st.playing = false; st.device = null; }
    else { st.item = p.item || null; st.playing = !!p.is_playing; st.progress = p.progress_ms || 0; st.at = Date.now(); st.device = p.device; st.shuffle = !!p.shuffle_state; st.repeat = p.repeat_state || "off"; }
    render();
    var id = st.item && st.item.id;
    if (id !== lastItemId) { lastItemId = id; loadQueue(); checkSaved(); markNow(); }
  }
  function setArt(it) {
    var url = it ? imgOf(it.album || it, 400) : null, key = url || ("fb:" + (it ? it.id : ""));
    if (key === artKey) return; artKey = key;
    var alt = it && it.album && it.album.name ? "Album art: " + it.album.name : "";
    $$(".js-art").forEach(function (img) {
      img.classList.remove("on");
      if (url) { img.alt = alt; img.onload = function () { img.classList.add("on"); }; img.src = url; }
      else { img.removeAttribute("src"); img.alt = ""; }
    });
    var bg = $("ambBg");
    if (url) { bg.src = url; extractColor(url).then(function (c) { if (artKey === url) setArtColor(c); }); }
    else { bg.removeAttribute("src"); setArtColor(null); }
  }
  function devState() { return !st.device ? "off" : (st.playing && st.item ? "live" : "idle"); }
  function render() {
    var it = st.item, root = document.documentElement, dev = devState();
    root.setAttribute("data-playing", String(!!(st.playing && it)));
    root.setAttribute("data-dev", dev);
    var title = it ? it.name : "Nothing playing", artist = it ? byline(it) : "";
    setText("npTitle", title); setText("npArtist", artist || (st.device ? "Press play to start" : "Connect a device to start listening"));
    setText("heroTitle", title); setText("heroArtist", artist || (st.device ? "Ready on " + st.device.name : "Choose a device to start listening"));
    setText("miniTitle", title); setText("miniArtist", artist || (st.device ? "Ready on " + st.device.name : "Tap to connect a device"));
    setText("ambTitle", title); setText("ambArtist", artist);
    var dname = st.device ? st.device.name : "Connect";
    $$(".js-devname").forEach(function (e) { if (e.textContent !== dname) e.textContent = dname; });
    setText("npCtx", st.device ? (dev === "live" ? "Playing on " : "Connected to ") + st.device.name : "Connect a device");
    setText("heroKicker", st.device ? (dev === "live" ? "Now playing on " : "Paused on ") + st.device.name : "Not connected");
    $("deviceBtn").setAttribute("aria-label", st.device ? "Device: " + st.device.name + (dev === "live" ? ", playing" : ", paused") : "Connect a device");
    $$(".js-play").forEach(function (b) { b.setAttribute("aria-label", st.playing ? "Pause" : "Play"); });
    $("shuffle").setAttribute("aria-pressed", String(st.shuffle));
    $("repeat").setAttribute("aria-pressed", String(st.repeat !== "off"));
    $("repeat").setAttribute("aria-label", "Repeat: " + (st.repeat === "context" ? "all" : st.repeat === "track" ? "one" : "off"));
    $("repeatOne").hidden = st.repeat !== "track";
    setArt(it);
    var vol = $("volume"), canVol = st.device && st.device.supports_volume !== false && st.device.type !== "Smartphone";
    vol.hidden = !!st.device && !canVol; vol.disabled = !canVol; $("volNote").hidden = !st.device || !!canVol;
    if (st.device && st.device.volume_percent != null && Date.now() > busyUntil) { vol.value = st.device.volume_percent; paintRange(vol); }
    $("seek").disabled = !it;
    tick();
  }
  function tick() {
    var it = st.item, seek = $("seek"), frac = 0, pos = 0, len = 0;
    if (it && it.duration_ms) { len = it.duration_ms; pos = Math.min(len, st.progress + (st.playing ? Date.now() - st.at : 0)); frac = pos / len; }
    var tf = "scaleX(" + frac.toFixed(4) + ")";
    ["miniBar", "heroBar", "ambBar"].forEach(function (id) { $(id).style.transform = tf; });
    setText("tLen", fmt(len)); setText("heroLen", fmt(len)); setText("heroNow", fmt(pos));
    if (!dragging) { seek.value = Math.round(frac * 1000); paintRange(seek); setText("tNow", fmt(pos)); }
  }
  setInterval(function () { if (!document.hidden) tick(); }, 500);

  async function loadQueue() {
    try {
      var q = await api("GET", "/me/player/queue"), l = ((q && q.queue) || []).filter(function (t) { return t && t.uri; });
      var emptyQ = { icon: "queue", title: "Nothing queued", text: st.device ? "Songs you add to the queue show up here." : "Connect a device to see what’s coming up." };
      list($("queueList"), l.slice(0, 10).map(function (t, i) { return trackRow(t, i); }), emptyQ);
      list($("homeQueue"), l.slice(0, 12).map(trackTile), emptyQ);
    } catch (e) {
      if (e.auth) return handleAuth();
      if (e.status === 404 || e.status === 204) { stateBox($("homeQueue"), { icon: "queue", title: "Nothing queued", text: "Connect a device to see what’s coming up." }); return; }
      errorState($("homeQueue"), e, loadQueue);
    }
  }
  function setHeart(on) { var b = $("npSave"); b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-label", on ? "Remove from Liked Songs" : "Save to Liked Songs"); }
  async function checkSaved() {
    var it = st.item, b = $("npSave");
    if (!it || !it.uri || it.type === "episode") { b.hidden = true; return; }
    b.hidden = false; setHeart(false);
    try { var r = await api("GET", "/me/library/contains?uris=" + encodeURIComponent(it.uri)); if (st.item && st.item.uri === it.uri) setHeart(!!(r && r[0])); }
    catch (e) { if (e.auth) return handleAuth(); }
  }
  $("npSave").addEventListener("click", async function () {
    var it = st.item; if (!it) return;
    var on = this.getAttribute("aria-pressed") === "true"; setHeart(!on);
    try { await api(on ? "DELETE" : "PUT", "/me/library?uris=" + encodeURIComponent(it.uri)); toast(on ? "Removed from Liked Songs" : "Saved to Liked Songs"); }
    catch (e) { setHeart(on); if (e.auth) return handleAuth(); toast(explain(e), true); }
  });

  var pollTimer = null, failures = 0;
  async function poll() {
    if (document.hidden) return;
    try { applyPlayer(await api("GET", "/me/player")); if (failures >= 3) banner("", ""); failures = 0; }
    catch (e) {
      if (e.auth) return handleAuth();
      if (++failures === 3) banner("warn", e.network ? "You’re offline. Playback info will update when you reconnect." : "Having trouble reaching Spotify. Retrying…");
    }
  }
  function startPolling() { stopPolling(); poll(); pollTimer = setInterval(poll, 4000); }
  function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && !$("app").hidden) poll(); });
  window.addEventListener("online", function () { if (!$("app").hidden) poll(); });

  /* commands: optimistic UI + per-button pending state */
  async function cmd(method, path, optimistic, body, btn) {
    var snap = Object.assign({}, st);
    if (optimistic) { optimistic(); render(); }
    if (btn) btn.classList.add("busy");
    try { await api(method, path, body); setTimeout(poll, 450); }
    catch (e) {
      if (e.auth) return handleAuth();
      st = snap; render();
      if (e.status === 404 || e.reason === "NO_ACTIVE_DEVICE") openDevices();
      toast(explain(e), true);
    } finally { if (btn) setTimeout(function () { btn.classList.remove("busy"); }, 250); }
  }
  function togglePlay(e) {
    var btn = e && e.currentTarget;
    if (!st.device) { openDevices(); return; }
    if (st.playing) cmd("PUT", "/me/player/pause", function () { st.progress += Date.now() - st.at; st.at = Date.now(); st.playing = false; }, undefined, btn);
    else cmd("PUT", "/me/player/play", function () { st.at = Date.now(); st.playing = true; }, {}, btn);
  }
  function skip(dir, e) { if (!st.device) return openDevices(); cmd("POST", "/me/player/" + dir, null, undefined, e && e.currentTarget); }
  $$(".js-play").forEach(function (b) { b.addEventListener("click", togglePlay); });
  $$(".js-next").forEach(function (b) { b.addEventListener("click", function (e) { skip("next", e); }); });
  $$(".js-prev").forEach(function (b) { b.addEventListener("click", function (e) { skip("previous", e); }); });
  $("shuffle").addEventListener("click", function (e) { var n = !st.shuffle; cmd("PUT", "/me/player/shuffle?state=" + n, function () { st.shuffle = n; }, undefined, e.currentTarget); });
  $("repeat").addEventListener("click", function (e) { var n = st.repeat === "off" ? "context" : st.repeat === "context" ? "track" : "off"; cmd("PUT", "/me/player/repeat?state=" + n, function () { st.repeat = n; }, undefined, e.currentTarget); });
  var seek = $("seek");
  seek.addEventListener("input", function () { dragging = true; paintRange(seek); if (st.item) setText("tNow", fmt(seek.value / 1000 * st.item.duration_ms)); });
  seek.addEventListener("change", function () {
    if (!st.item) { dragging = false; return; }
    var ms = Math.round(seek.value / 1000 * st.item.duration_ms);
    cmd("PUT", "/me/player/seek?position_ms=" + ms, function () { st.progress = ms; st.at = Date.now(); }); dragging = false;
  });
  var volTimer;
  $("volume").addEventListener("input", function () { var v = this; paintRange(v); busyUntil = Date.now() + 2500; clearTimeout(volTimer); volTimer = setTimeout(function () { cmd("PUT", "/me/player/volume?volume_percent=" + v.value); }, 250); });

  /* =====================================================================
     Expanded player (sheet on phones, docked panel on wide screens)
     ===================================================================== */
  var dockMq = window.matchMedia("(min-width:1100px)");
  function docked() { return dockMq.matches; }
  function syncDock() {
    var np = $("np");
    if (docked()) { np.classList.remove("open"); np.style.transform = ""; np.removeAttribute("inert"); np.removeAttribute("role"); np.removeAttribute("aria-modal"); document.body.classList.remove("np-open"); }
    else if (!np.classList.contains("open")) np.setAttribute("inert", "");
    syncHeroVisibility();
  }
  function openNP() {
    if (docked()) return;
    var np = $("np"); np.removeAttribute("inert"); np.setAttribute("role", "dialog"); np.setAttribute("aria-modal", "true");
    np.scrollTop = 0; np.classList.add("open"); document.body.classList.add("np-open");
    setTimeout(function () { try { $("npClose").focus({ preventScroll: true }); } catch (e) {} }, 60);
  }
  function closeNP() {
    var np = $("np"); if (!np.classList.contains("open")) return;
    np.classList.remove("open"); np.style.transform = ""; document.body.classList.remove("np-open");
    np.removeAttribute("role"); np.removeAttribute("aria-modal");
    if (!docked()) np.setAttribute("inert", "");
  }
  if (dockMq.addEventListener) dockMq.addEventListener("change", syncDock); else if (dockMq.addListener) dockMq.addListener(syncDock);
  $$(".js-open").forEach(function (b) { b.addEventListener("click", function () { if (docked()) return; if (!st.device && !st.item) { openDevices(); return; } openNP(); }); });
  $("npClose").addEventListener("click", closeNP);
  (function swipeToClose() {
    var np = $("np"), y0 = null, dy = 0;
    np.addEventListener("touchstart", function (e) {
      if (docked() || !np.classList.contains("open") || np.scrollTop > 0 || e.target.closest("input,.npq")) { y0 = null; return; }
      y0 = e.touches[0].clientY; dy = 0;
    }, { passive: true });
    np.addEventListener("touchmove", function (e) {
      if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0);
      if (dy > 4) { np.style.transition = "none"; np.style.transform = "translateY(" + dy + "px)"; }
    }, { passive: true });
    np.addEventListener("touchend", function () { if (y0 == null) return; np.style.transition = ""; y0 = null; if (dy > 110) closeNP(); else np.style.transform = ""; });
  })();

  /* hide the mini-player while the Home hero is on screen */
  var heroVisible = false;
  function syncHeroVisibility() { document.body.classList.toggle("hero-in", heroVisible && cur === "home" && !docked()); }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) { heroVisible = en[0].isIntersecting; syncHeroVisibility(); }, { threshold: 0.35 }).observe($("hero"));
  }

  /* =====================================================================
     Ambient mode
     ===================================================================== */
  var wakeLock = null, calmTimer = null, clockTimer = null;
  async function lockScreen() { try { if ("wakeLock" in navigator) { wakeLock = await navigator.wakeLock.request("screen"); } } catch (e) { wakeLock = null; } }
  function wake() {
    var a = $("ambient"); a.classList.remove("calm");
    clearTimeout(calmTimer); calmTimer = setTimeout(function () { a.classList.add("calm"); }, 3500);
  }
  function clock() { setText("ambClock", new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })); }
  function openAmbient() {
    var a = $("ambient"); a.hidden = false; document.body.classList.add("np-open");
    clock(); clockTimer = setInterval(clock, 15000); wake(); lockScreen();
    setTimeout(function () { try { $("ambClose").focus({ preventScroll: true }); } catch (e) {} }, 60);
  }
  function closeAmbient() {
    var a = $("ambient"); if (a.hidden) return; a.hidden = true;
    if (!$("np").classList.contains("open")) document.body.classList.remove("np-open");
    clearTimeout(calmTimer); clearInterval(clockTimer);
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
  }
  $$(".js-ambient").forEach(function (b) { b.addEventListener("click", openAmbient); });
  $("ambClose").addEventListener("click", closeAmbient);
  ["pointermove", "pointerdown", "keydown"].forEach(function (ev) { $("ambient").addEventListener(ev, wake, { passive: true }); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden && !$("ambient").hidden) lockScreen(); });

  /* =====================================================================
     Devices
     ===================================================================== */
  function devIcon(type) { return type === "Computer" ? "computer" : type === "Smartphone" ? "device" : "speaker"; }
  function openDevices() { if ($("devices").hidden) openSheet("devices"); loadDevices(); }
  async function loadDevices() {
    var box = $("devList"); skelList(box, 2);
    try {
      var d = await api("GET", "/me/player/devices"), l = (d && d.devices) || [];
      clear(box); box.removeAttribute("aria-busy");
      if (!l.length) { stateBox(box, { icon: "device", title: "No devices found", text: "Open Spotify on your phone, speaker or computer, play something briefly, then refresh.", action: { label: "Refresh", fn: loadDevices } }); return; }
      l.forEach(function (dev) {
        var b = h("button", { type: "button", class: "dev" + (dev.is_active ? " on" : "") }, icon(devIcon(dev.type)), h("span", { class: "m" }, h("span", { class: "n", text: dev.name }), h("span", { class: "b", text: dev.is_active ? (st.playing ? "Playing" : "Connected") : dev.type })), dev.is_active ? icon("check") : null);
        if (dev.is_active) b.lastChild.classList.add("tick");
        b.addEventListener("click", async function () {
          if (dev.is_active) { closeSheet("devices"); return; }
          b.classList.add("pending"); b.querySelector(".b").textContent = "Connecting…";
          try { await api("PUT", "/me/player", { device_ids: [dev.id], play: true }); closeSheet("devices"); toast("Connected to " + dev.name); setTimeout(poll, 700); }
          catch (e) { b.classList.remove("pending"); b.querySelector(".b").textContent = dev.type; if (e.auth) return handleAuth(); toast(explain(e), true); }
        });
        box.appendChild(b);
      });
    } catch (e) { errorState(box, e, loadDevices); }
  }
  $$(".js-devopen").forEach(function (b) { b.addEventListener("click", openDevices); });
  $("devRefresh").addEventListener("click", loadDevices);

  /* =====================================================================
     Home
     ===================================================================== */
  var recentCache = null;
  async function getRecent(force) {
    if (recentCache && !force) return recentCache;
    var r = await api("GET", "/me/player/recently-played?limit=50");
    recentCache = ((r && r.items) || []).filter(function (x) { return x.track; });
    return recentCache;
  }
  async function loadRecent(force) {
    var rr = $("homeRecent"); skelRail(rr, 6);
    try {
      var rec = await getRecent(force), seen = {}, out = [];
      rec.forEach(function (x) { if (!seen[x.track.id]) { seen[x.track.id] = 1; out.push(x.track); } });
      list(rr, out.slice(0, 16).map(trackTile), { icon: "disc", title: "No recent plays yet", text: "Play something in Spotify and it will show up here." });
    } catch (e) { errorState(rr, e, function () { loadRecent(true); }); }
  }
  async function loadHomeArtists() {
    var ar = $("homeArtists"); skelRail(ar, 6);
    try { var ta = await api("GET", "/me/top/artists?time_range=short_term&limit=16"); list(ar, (ta.items || []).map(artistTile), { icon: "person", title: "Not enough listening yet", text: "Your most-played artists from the last month will appear here." }); }
    catch (e) { errorState(ar, e, loadHomeArtists); }
  }
  init.home = function () { skelRail($("homeQueue"), 5); loadRecent(); loadHomeArtists(); };
  refresh.home = function () { loadQueue(); loadRecent(true); loadHomeArtists(); };


  /* =====================================================================
     Library: playlists (with Liked Songs), saved albums, followed artists
     ===================================================================== */
  var LIBTABS = [["playlists", "Playlists"], ["albums", "Albums"], ["artists", "Artists"]];
  var LIBEMPTY = {
    playlists: { icon: "library", title: "No playlists yet", text: "Playlists you create or follow in Spotify appear here." },
    albums: { icon: "disc", title: "No saved albums", text: "Albums you save in Spotify appear here." },
    artists: { icon: "person", title: "No followed artists", text: "Artists you follow in Spotify appear here." }
  };
  var lib = { tab: "playlists", data: {}, more: null };
  function songs(n) { return n == null ? "" : n.toLocaleString() + (n === 1 ? " song" : " songs"); }
  function plTotal(pl) { var x = pl.items || pl.tracks; return x && typeof x.total === "number" ? x.total : null; }

  async function fetchLib(tab) {
    var out = [];
    if (tab === "artists") {
      var after = null;
      for (var i = 0; i < 4; i++) {
        var r = await api("GET", "/me/following?type=artist&limit=50" + (after ? "&after=" + encodeURIComponent(after) : ""));
        var a = (r && r.artists) || {}; out = out.concat((a.items || []).filter(Boolean));
        after = a.cursors && a.cursors.after; if (!a.next || !after) break;
      }
      return out;
    }
    var path = tab === "playlists" ? "/me/playlists" : "/me/albums";
    for (var off = 0; off < 200; off += 50) {
      var p = await api("GET", path + "?limit=50&offset=" + off), it = (p && p.items) || [];
      out = out.concat(tab === "albums" ? it.map(function (x) { return x && x.album; }).filter(Boolean) : it.filter(Boolean));
      if (it.length < 50 || !p.next) break;
    }
    return out;
  }
  function skelGrid(t, n) { clear(t); for (var i = 0; i < (n || 8); i++) t.appendChild(h("div", { class: "sktile", "aria-hidden": "true" }, h("span", { class: "sk a" }), h("span", { class: "sk l" }), h("span", { class: "sk l2" }))); t.setAttribute("aria-busy", "true"); }
  function libTile(o, title, sub, onClick, opts) {
    opts = opts || {};
    var w = h("div", { class: "tile" + (opts.round ? " round" : "") });
    var art = h("span", { class: "tart" + (opts.liked ? " liked" : "") });
    if (opts.liked) art.innerHTML = svg("heart"); else art.appendChild(thumb(o, opts.round, 300));
    var b = h("button", { class: "tmain", type: "button", "aria-label": "Open " + title }, art, h("span", { class: "tn", text: title }), h("span", { class: "tb", text: sub }));
    b.addEventListener("click", onClick);
    w.appendChild(b);
    return w;
  }
  async function loadLibTab(force) {
    var t = lib.tab, box = $("libOut");
    if (lib.data[t] && !force) { drawLib(); return; }
    box.className = "tiles" + (t === "artists" ? " round" : ""); skelGrid(box, 8);
    try { var d = await fetchLib(t); lib.data[t] = d; if (lib.tab === t) drawLib(); }
    catch (e) { if (lib.tab === t) errorState(box, e, function () { loadLibTab(true); }); }
  }
  function drawLib() {
    var t = lib.tab, box = $("libOut"), q = $("libFilter").value.trim().toLowerCase(), items = lib.data[t] || [];
    box.className = "tiles" + (t === "artists" ? " round" : "");
    var match = function (o) {
      if (!q) return true;
      var hay = [o.name, o.owner && o.owner.display_name, byline(o)].join(" ").toLowerCase();
      return hay.indexOf(q) > -1;
    };
    var tiles = [];
    if (t === "playlists" && (!q || "liked songs".indexOf(q) > -1)) tiles.push(libTile(null, "Liked Songs", "Your saved songs", openLiked, { liked: true }));
    items.filter(match).forEach(function (o) {
      if (t === "playlists") { var n = plTotal(o); tiles.push(libTile(o, o.name, [o.owner && o.owner.display_name, n != null ? songs(n) : ""].filter(Boolean).join(" · ") || "Playlist", function () { openPlaylist(o); })); }
      else if (t === "albums") tiles.push(libTile(o, o.name, byline(o) || "Album", function () { openAlbum(o); }));
      else tiles.push(libTile(o, o.name, "Artist", function () { artistTop(o); }, { round: true }));
    });
    var empty = q ? { icon: "search", title: "No matches", text: "Nothing in your " + t + " matches “" + q + "”." } : LIBEMPTY[t];
    if (t === "playlists" && !items.length && !q) { list(box, tiles, empty); box.appendChild(h("div", { class: "state" }, h("div", { class: "st-x", text: LIBEMPTY.playlists.text }))); return; }
    list(box, tiles, empty);
  }

  /* detail page */
  var detail = { ctx: null };
  function openDetail(kind, title, sub, artObj, opts) {
    opts = opts || {};
    $("libHome").hidden = true; $("libDetail").hidden = false;
    setText("dKind", kind); setText("dTitle", title); setText("dSub", sub || "");
    var art = $("dArt"); clear(art); art.className = "dart artbox" + (opts.liked ? " liked" : "");
    if (opts.liked) art.innerHTML = svg("heart");
    else {
      var u = imgOf(artObj, 300);
      if (u) { var im = h("img", { alt: "", decoding: "async" }); im.onload = function () { im.classList.add("on"); }; im.src = u; art.appendChild(im); }
      else { var fb = h("span", { class: "artfb" }); fb.innerHTML = svg(opts.round ? "person" : "note"); art.appendChild(fb); }
    }
    detail.ctx = opts.ctx || null;
    $("dPlay").disabled = $("dShuffle").disabled = !detail.ctx;
    $("dMore").hidden = true; lib.more = null;
    skelList($("dList"), 8);
    window.scrollTo(0, 0);
  }
  function closeDetail() { $("libDetail").hidden = true; $("libHome").hidden = false; detail.ctx = null; lib.more = null; }
  async function playContext(ctx, offsetUri, shuffle) {
    if (!st.device) { openDevices(); toast("Choose a device first"); return; }
    try {
      if (shuffle != null) await api("PUT", "/me/player/shuffle?state=" + (shuffle ? "true" : "false"));
      var body = { context_uri: ctx }; if (offsetUri) body.offset = { uri: offsetUri };
      await api("PUT", "/me/player/play", body); setTimeout(poll, 600);
      toast(shuffle ? "Shuffling" : "Playing");
    } catch (e) { if (e.auth) return handleAuth(); if (e.status === 404) openDevices(); toast(explain(e), true); }
  }
  $("dPlay").addEventListener("click", function () { if (detail.ctx) playContext(detail.ctx); });
  $("dShuffle").addEventListener("click", function () { if (detail.ctx) playContext(detail.ctx, null, true); });
  $("dMore").addEventListener("click", function () { if (lib.more) lib.more(); });
  $("libBack").addEventListener("click", closeDetail);

  /* paged track list shared by Liked Songs, owned playlists and albums */
  function pagedTracks(fetchPage, mapItem, ctx, emptyOpts) {
    var rows = [], offset = 0, token = {}; detail.token = token;
    async function next() {
      var btn = $("dMore"); btn.disabled = true; btn.textContent = "Loading…";
      try {
        var r = await fetchPage(offset); if (detail.token !== token) return;
        var items = (r && r.items) || [];
        items.map(mapItem).filter(function (x) { return x && x.t && x.t.uri && (!x.t.type || x.t.type === "track"); }).forEach(function (x) {
          rows.push(trackRow(x.t, rows.length, x.sub, { play: function (t) { playContext(ctx, t.uri); } }));
        });
        offset += items.length;
        if (offset === items.length) list($("dList"), rows.slice(), emptyOpts);
        else rows.slice(-items.length).forEach(function (r2, i) { $("dList").appendChild(stagger(r2, i)); });
        var more = r && r.total != null ? offset < r.total : items.length === 50;
        btn.hidden = !more || !items.length; lib.more = more ? next : null;
      } catch (e) {
        if (detail.token !== token) return;
        if (!rows.length) errorState($("dList"), e, next); else toast(explain(e), true);
      }
      btn.disabled = false; btn.textContent = "Load more";
    }
    next();
  }
  async function openLiked() {
    openDetail("Playlist", "Liked Songs", "", null, { liked: true });
    try {
      var me = await getMe(), ctx = "spotify:user:" + me.id + ":collection"; detail.ctx = ctx;
      $("dPlay").disabled = $("dShuffle").disabled = false;
      pagedTracks(function (off) {
        return api("GET", "/me/tracks?limit=50&offset=" + off).then(function (r) { if (r && r.total != null) setText("dSub", songs(r.total)); return r; });
      }, function (x) { return x && x.track ? { t: x.track, sub: byline(x.track) } : null; }, ctx, { icon: "heart", title: "No liked songs yet", text: "Tap the heart on any song to save it here." });
    } catch (e) { errorState($("dList"), e, openLiked); }
  }
  async function openPlaylist(pl) {
    var n = plTotal(pl);
    openDetail("Playlist", pl.name, [pl.owner && pl.owner.display_name, n != null ? songs(n) : ""].filter(Boolean).join(" · "), pl, { ctx: pl.uri });
    var me = null; try { me = await getMe(); } catch (e) {}
    var mine = pl.collaborative || (me && pl.owner && pl.owner.id === me.id);
    if (!mine) {
      stateBox($("dList"), { icon: "library", title: "Song list not available", text: "Spotify only shares the songs in playlists you own or collaborate on. You can still play or shuffle this playlist." });
      return;
    }
    pagedTracks(function (off) { return api("GET", "/playlists/" + encodeURIComponent(pl.id) + "/items?limit=50&offset=" + off); },
      function (x) { var t = x && (x.item || x.track); return t ? { t: t } : null; }, pl.uri,
      { icon: "library", title: "This playlist is empty", text: "Add songs to it in Spotify." });
  }
  function openAlbum(al) {
    var yr = al.release_date ? String(al.release_date).slice(0, 4) : "", n = al.total_tracks || (al.tracks && al.tracks.total);
    openDetail("Album", al.name, [byline(al), yr, n ? songs(n) : ""].filter(Boolean).join(" · "), al, { ctx: al.uri });
    var first = al.tracks && al.tracks.items;
    var withAlbum = function (t) { if (t && !t.album) t.album = { name: al.name, images: al.images }; return t; };
    pagedTracks(function (off) {
      if (off === 0 && first && first.length) return Promise.resolve({ items: first, total: al.tracks.total });
      return api("GET", "/albums/" + encodeURIComponent(al.id) + "/tracks?limit=50&offset=" + off);
    }, function (t) { return t ? { t: withAlbum(t), sub: byline(t) } : null; }, al.uri, { icon: "disc", title: "No tracks", text: "Spotify didn’t return this album’s tracks." });
  }

  init.library = function () {
    var seg = $("libSeg");
    LIBTABS.forEach(function (tb, i) {
      var b = h("button", { type: "button", "aria-pressed": String(tb[0] === lib.tab), text: tb[1] });
      b.addEventListener("click", function () { if (lib.tab === tb[0]) return; lib.tab = tb[0]; $$("button", seg).forEach(function (x, j) { x.setAttribute("aria-pressed", String(j === i)); }); $("libFilter").value = ""; loadLibTab(); });
      seg.appendChild(b);
    });
    $("libFilter").addEventListener("input", drawLib);
    loadLibTab();
  };
  refresh.library = function () { if (!$("libDetail").hidden) { closeDetail(); return; } loadLibTab(true); };

  /* =====================================================================
     Insights
     ===================================================================== */
  var RANGES = [["4 weeks", "short_term"], ["6 months", "medium_term"], ["12 months", "long_term"]], rng = 1, topArtistsCache = [];
  function bars(box, entries, onPick, pressed) {
    clear(box);
    var max = entries.length ? entries[0][1] : 1;
    entries.forEach(function (en, i) {
      var fl = h("span", { class: "fl" });
      var b = h("button", { class: "bar", type: "button", "aria-pressed": String(pressed === en[0]), "aria-label": en[0] + ": " + en[1] + " artists" }, h("span", { class: "l", text: en[0] }), h("span", { class: "tr" }, fl), h("span", { class: "c", text: String(en[1]) }));
      b.addEventListener("click", function () { onPick(en[0]); });
      box.appendChild(b);
      setTimeout(function () { fl.style.width = Math.max(6, en[1] / max * 100) + "%"; }, 40 + i * 30);
    });
  }
  function drawGenres(sel) {
    var counts = {};
    topArtistsCache.forEach(function (a) { (a.genres || []).forEach(function (g) { counts[g] = (counts[g] || 0) + 1; }); });
    var e = Object.keys(counts).map(function (g) { return [g, counts[g]]; }).sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); }).slice(0, 8);
    $("genreCard").hidden = !e.length;
    if (!e.length) return;
    bars($("genreBars"), e, function (g) { drawGenres(sel === g ? null : g); }, sel);
    var gl = $("genreList"); clear(gl);
    if (sel) {
      gl.appendChild(h("div", { class: "label", text: "Your artists in " + sel }));
      topArtistsCache.filter(function (a) { return (a.genres || []).indexOf(sel) > -1; }).forEach(function (a, i) { gl.appendChild(stagger(artistRow(a, i), i)); });
    }
  }
  async function loadTop() {
    var rk = RANGES[rng][1], label = RANGES[rng][0];
    skelList($("topArtists"), 5); skelList($("topTracks"), 5);
    try {
      var a = await api("GET", "/me/top/artists?time_range=" + rk + "&limit=50");
      topArtistsCache = a.items || []; drawGenres(null);
      list($("topArtists"), topArtistsCache.slice(0, S.limit).map(function (x, i) { return artistRow(x, i, true); }), { icon: "person", title: "No top artists yet", text: "Spotify needs a bit more listening in the last " + label + "." });
    } catch (e) { $("genreCard").hidden = true; errorState($("topArtists"), e, loadTop); }
    try {
      var t = await api("GET", "/me/top/tracks?time_range=" + rk + "&limit=" + S.limit);
      list($("topTracks"), (t.items || []).map(function (x, i) { return trackRow(x, i, null, { rank: true }); }), { icon: "note", title: "No top tracks yet", text: "Spotify needs a bit more listening in the last " + label + "." });
    } catch (e) { errorState($("topTracks"), e, loadTop); }
  }
  async function loadWhen(force) {
    var box = $("hourChart");
    try {
      var r = await getRecent(force);
      if (!r.length) { $("whenNote").textContent = ""; stateBox(box, { icon: "chart", title: "No recent plays", text: "Your listening times will appear after you play some music." }); clear($("dayChart")); return; }
      var first = new Date(r[r.length - 1].played_at), last = new Date(r[0].played_at), dopt = { month: "short", day: "numeric" };
      $("whenNote").textContent = "Your last " + r.length + " plays, " + first.toLocaleDateString(undefined, dopt) + " to " + last.toLocaleDateString(undefined, dopt) + ". Spotify only shares your 50 most recent plays, so this is a sample.";
      var hrs = []; for (var z = 0; z < 24; z++) hrs.push([]);
      r.forEach(function (x) { hrs[new Date(x.played_at).getHours()].push(x); });
      var max = Math.max.apply(null, hrs.map(function (a) { return a.length; })) || 1; clear(box);
      hrs.forEach(function (arr, hr) {
        var fl = h("span", { class: "fl" });
        var b = h("button", { class: "hr", type: "button", "aria-pressed": "false", "aria-label": arr.length + " plays around " + hr + ":00" }, fl, h("span", { class: "lb", text: hr % 6 === 0 ? String(hr) : "" }));
        b.addEventListener("click", function () {
          var on = b.getAttribute("aria-pressed") === "true";
          $$(".hr", box).forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
          var hl = $("hourList"); clear(hl); if (on) return;
          b.setAttribute("aria-pressed", "true");
          if (!arr.length) { stateBox(hl, { icon: "chart", title: "No plays around " + hr + ":00" }); return; }
          hl.appendChild(h("div", { class: "label", text: arr.length + " plays around " + hr + ":00" }));
          arr.forEach(function (x, i) { hl.appendChild(stagger(trackRow(x.track, i, new Date(x.played_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })), i)); });
        });
        box.appendChild(b);
        setTimeout(function () { fl.style.height = (arr.length / max * 100) + "%"; }, 40 + hr * 15);
      });
      var days = {};
      r.forEach(function (x) { var d = new Date(x.played_at), k = d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); days[k] = days[k] || { n: 0, d: d }; days[k].n++; });
      var keys = Object.keys(days).sort(function (a, b) { return days[a].d - days[b].d; }).slice(-14);
      var dmax = Math.max.apply(null, keys.map(function (k) { return days[k].n; })) || 1, dbox = $("dayChart"); clear(dbox);
      keys.forEach(function (k, i) {
        var fl = h("span", { class: "fl" });
        dbox.appendChild(h("div", { class: "hr", role: "img", "aria-label": days[k].n + " plays on " + days[k].d.toLocaleDateString() }, fl, h("span", { class: "lb", text: (days[k].d.getMonth() + 1) + "/" + days[k].d.getDate() })));
        setTimeout(function () { fl.style.height = (days[k].n / dmax * 100) + "%"; }, 40 + i * 30);
      });
    } catch (e) { errorState(box, e, function () { loadWhen(true); }); }
  }
  init.insights = function () {
    var seg = $("range");
    RANGES.forEach(function (r, i) {
      var b = h("button", { type: "button", "aria-pressed": String(i === rng), text: r[0] });
      b.addEventListener("click", function () { if (rng === i) return; rng = i; $$("button", seg).forEach(function (x, j) { x.setAttribute("aria-pressed", String(j === i)); }); loadTop(); });
      seg.appendChild(b);
    });
    loadTop(); loadWhen();
  };
  refresh.insights = function () { loadTop(); loadWhen(true); };

  /* =====================================================================
     Discover
     ===================================================================== */
  function showTracks(title, tracks) { $("disTitle").textContent = title; list($("disOut"), tracks.map(function (t, i) { return trackRow(t, i); }), { icon: "search", title: "No songs found", text: "Spotify didn’t return any matches." }); }
  async function runSearch() {
    var q = $("q").value.trim(); if (!q) return;
    $("disTitle").textContent = "Results for “" + q + "”"; skelList($("disOut"), 6);
    try {
      var r = await searchApi(q, "track,artist", S.limit), out = [];
      ((r.artists && r.artists.items) || []).slice(0, 3).forEach(function (a, i) { out.push(artistRow(a, i)); });
      ((r.tracks && r.tracks.items) || []).forEach(function (t, i) { out.push(trackRow(t, i)); });
      list($("disOut"), out, { icon: "search", title: "No matches", text: "Try a different spelling or fewer words." });
    } catch (e) { errorState($("disOut"), e, runSearch); }
  }
  async function runGenre(g) {
    $("disTitle").textContent = "Explore " + g; skelList($("disOut"), 6);
    try { var r = await searchApi('genre:"' + g + '"', "track", S.limit, Math.floor(Math.random() * 30)); showTracks("Explore " + g, (r.tracks && r.tracks.items) || []); }
    catch (e) { errorState($("disOut"), e, function () { runGenre(g); }); }
  }
  async function loadDiscoverChips() {
    var box = $("genreChips"); clear(box);
    for (var i = 0; i < 6; i++) box.appendChild(h("span", { class: "sk", style: null, "aria-hidden": "true" }));
    $$(".sk", box).forEach(function (s, i) { s.style.cssText = "display:inline-block;height:34px;border-radius:999px;width:" + (70 + (i * 23) % 60) + "px"; });
    try {
      var a = await api("GET", "/me/top/artists?time_range=medium_term&limit=30"), counts = {};
      (a.items || []).forEach(function (x) { (x.genres || []).forEach(function (g) { counts[g] = (counts[g] || 0) + 1; }); });
      var gs = Object.keys(counts).sort(function (x, y) { return counts[y] - counts[x]; }).slice(0, 12);
      clear(box);
      var pick = function (c, fn) { $$(".chip", box).forEach(function (x) { x.setAttribute("aria-pressed", String(x === c)); }); fn(); };
      if (gs.length) {
        $("genreHead").textContent = "Your genres";
        gs.forEach(function (g) { var c = h("button", { class: "chip", type: "button", "aria-pressed": "false", text: g }); c.addEventListener("click", function () { pick(c, function () { runGenre(g); }); }); box.appendChild(c); });
      } else {
        $("genreHead").textContent = "Your artists";
        var arts = (a.items || []).slice(0, 12);
        if (!arts.length) { stateBox(box, { icon: "person", title: "No artists yet", text: "Your most-played artists will appear here." }); return; }
        arts.forEach(function (ar) { var c = h("button", { class: "chip", type: "button", "aria-pressed": "false", text: ar.name }); c.addEventListener("click", function () { pick(c, function () { artistTop(ar); }); }); box.appendChild(c); });
      }
    } catch (e) { errorState(box, e, loadDiscoverChips); }
  }
  init.discover = function () {
    $("q").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); $("q").blur(); runSearch(); } });
    if (!$("disOut").firstChild) stateBox($("disOut"), { icon: "search", title: "Search Spotify", text: "Find artists and songs, or tap one of your artists." });
    loadDiscoverChips();
  };

  /* =====================================================================
     Vault
     ===================================================================== */
  var vault = { total: 0, memo: {} };
  async function savedAt(i) {
    if (vault.memo[i]) return vault.memo[i];
    var r = await api("GET", "/me/tracks?limit=1&offset=" + i); vault.total = r.total;
    var it = r.items && r.items[0]; vault.memo[i] = it; return it;
  }
  async function savedPage(offset, limit) { var r = await api("GET", "/me/tracks?limit=" + limit + "&offset=" + Math.max(0, offset)); vault.total = r.total; return r.items || []; }
  function vaultRows(items, empty) {
    list($("vaultOut"), items.map(function (x, i) { return trackRow(x.track, i, "Saved " + new Date(x.added_at).toLocaleDateString(undefined, { month: "short", year: "numeric" }) + " · " + byline(x.track)); }), { icon: "archive", title: empty || "Nothing here" });
  }
  async function vaultRun(kind, btn) {
    $$("#vaultChips .chip").forEach(function (c) { c.setAttribute("aria-pressed", String(c === btn)); });
    $("vaultTitle").textContent = kind === "oldest" ? "Your oldest saves" : kind === "random" ? "From your library" : "Saved in " + kind;
    skelList($("vaultOut"), 6);
    try {
      var lim = Math.min(S.limit * 2, 50);
      if (kind === "oldest") { var it = await savedPage(vault.total - lim, lim); vaultRows(it.slice().reverse()); }
      else if (kind === "random") {
        var o = Math.floor(Math.random() * Math.max(1, vault.total - lim)), it2 = await savedPage(o, lim);
        for (var i = it2.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = it2[i]; it2[i] = it2[j]; it2[j] = t; }
        vaultRows(it2.slice(0, S.limit));
      } else {
        var y = +kind, start = new Date(Date.UTC(y, 0, 1)).toISOString(), end = new Date(Date.UTC(y + 1, 0, 1)).toISOString(), lo = 0, hi = vault.total;
        while (lo < hi) { var mid = (lo + hi) >> 1, m = await savedAt(mid); if (m.added_at < end) hi = mid; else lo = mid + 1; }
        var page = await savedPage(lo, 50);
        vaultRows(page.filter(function (x) { return x.added_at >= start && x.added_at < end; }), "No saves in " + y);
      }
    } catch (e) { errorState($("vaultOut"), e, function () { vaultRun(kind, btn); }); }
  }
  async function loadVault() {
    var box = $("vaultChips"); clear(box); $("vaultInfo").textContent = "Loading your library…";
    try {
      var first = await savedAt(0);
      if (!first) { $("vaultInfo").textContent = ""; stateBox(box, { icon: "heart", title: "No saved songs yet", text: "Songs you like in Spotify build up your vault over time." }); return; }
      var oldest = await savedAt(vault.total - 1), y0 = new Date(oldest.added_at).getFullYear(), y1 = new Date().getFullYear();
      $("vaultInfo").textContent = vault.total.toLocaleString() + " saved songs, going back to " + y0 + ".";
      var chip = function (label, kind) { var b = h("button", { class: "chip", type: "button", "aria-pressed": "false", text: label }); b.addEventListener("click", function () { vaultRun(kind, b); }); box.appendChild(b); };
      chip("Oldest saves", "oldest"); chip("Surprise me", "random");
      for (var y = y1; y >= y0; y--) chip(String(y), y);
    } catch (e) { $("vaultInfo").textContent = ""; errorState(box, e, loadVault); }
  }
  init.vault = function () { stateBox($("vaultOut"), { icon: "archive", title: "Rediscover old favorites", text: "Pick your oldest saves, a surprise, or a year you saved songs." }); loadVault(); };

  /* =====================================================================
     DJ
     ===================================================================== */
  var MOODS = { Calm: ["acoustic", "chill", "singer-songwriter"], Energized: ["rock", "dance pop", "pop rock"], Nostalgic: ["classic rock", "oldies", "country classics"], Focused: ["instrumental", "ambient", "lo-fi"], Happy: ["pop", "reggae", "feel-good"], Moody: ["indie", "alternative", "blues"], Romantic: ["r&b", "soul", "love songs"], Confident: ["hip hop", "rap", "trap"] };
  var ACTS = { Driving: ["country rock", "classic rock"], Working: ["lo-fi", "instrumental"], Workout: ["edm", "hard rock", "hip hop"], Cooking: ["soul", "jazz"], "Golf round": ["country", "soft rock"], "Hunting trip": ["outlaw country", "southern rock"], "Hosting friends": ["pop", "funk"], "Winding down": ["acoustic", "jazz"] };
  var pick = { mood: null, act: null }, mix = [];
  function chipset(box, names, key) {
    Object.keys(names).forEach(function (n) {
      var b = h("button", { class: "chip", type: "button", "aria-pressed": "false", text: n });
      b.addEventListener("click", function () { pick[key] = pick[key] === n ? null : n; $$(".chip", box).forEach(function (c) { c.setAttribute("aria-pressed", String(c.textContent === pick[key])); }); });
      box.appendChild(b);
    });
  }
  function shuffleArr(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function drawMix() {
    var total = mix.reduce(function (s, t) { return s + (t.duration_ms || 0); }, 0);
    $("djSave").hidden = !mix.length;
    list($("djOut"), mix.map(function (t, i) {
      return trackRow(t, i, null, { extra: [{ label: "Remove from mix", icon: "minus", danger: true, fn: function () { mix = mix.filter(function (x) { return x.uri !== t.uri; }); drawMix(); return "Removed from mix"; } }] });
    }), { icon: "wave", title: "Nothing found", text: "Try another mood, or add a few artists." });
    if (mix.length) $("djOut").insertBefore(h("p", { class: "cap", text: mix.length + " songs · about " + Math.round(total / 60000) + " min" }), $("djOut").firstChild);
  }
  async function buildMix() {
    var likes = $("djLike").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 5);
    var genres = (pick.mood ? MOODS[pick.mood] : []).concat(pick.act ? ACTS[pick.act] : []);
    if (!genres.length && !likes.length) { note($("djMsg"), "warn", "Pick a mood, an activity or add an artist first."); return; }
    note($("djMsg"), "", ""); skelList($("djOut"), 6); $("djSave").hidden = true;
    var btn = $("djBuild"); btn.disabled = true; btn.textContent = "Building…";
    var target = (+$("djLen").value) * 60000, pools = [];
    try {
      for (var i = 0; i < likes.length; i++) {
        var r = await searchApi(likes[i], "artist", 1), a = r.artists && r.artists.items && r.artists.items[0];
        if (a) pools.push(shuffleArr(await artistTracks(a, 20)));
      }
      var gl = shuffleArr(genres.slice()).slice(0, 4);
      for (var j = 0; j < gl.length; j++) { var gr = await searchApi('genre:"' + gl[j] + '"', "track", 20, Math.floor(Math.random() * 25)); pools.push(shuffleArr(((gr.tracks && gr.tracks.items) || []).slice())); }
      var seen = {}, out = [], sum = 0, guard = 0;
      while (sum < target && guard++ < 400) {
        var any = false;
        for (var p = 0; p < pools.length && sum < target; p++) { var t = pools[p].shift(); if (!t) continue; any = true; if (seen[t.uri]) continue; seen[t.uri] = 1; out.push(t); sum += t.duration_ms || 0; }
        if (!any) break;
      }
      mix = out; drawMix();
      if (out.length && sum < target * 0.8) note($("djMsg"), "warn", "Spotify returned fewer songs than a full " + $("djLen").value + " minutes. Add artists to widen it.");
    } catch (e) { errorState($("djOut"), e, buildMix); }
    btn.disabled = false; btn.textContent = "Build mix";
  }
  async function saveMix() {
    if (!mix.length) return; var b = $("djSave"); b.disabled = true; b.textContent = "Saving…";
    try {
      var nm = ((pick.mood || "") + " " + (pick.act || "")).trim() || "Studio mix";
      var d = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
      var pl = await api("POST", "/me/playlists", { name: nm + " · " + d, description: "Built with Spotify Studio", public: false });
      for (var i = 0; i < mix.length; i += 100) await api("POST", "/playlists/" + pl.id + "/items", { uris: mix.slice(i, i + 100).map(function (t) { return t.uri; }) });
      note($("djMsg"), "ok", "Saved to your library as a private playlist.");
      var u = safeUrl(pl.external_urls && pl.external_urls.spotify);
      if (u) $("djMsg").firstChild.appendChild(h("a", { href: u, target: "_blank", rel: "noopener", text: "Open" }));
    } catch (e) { if (e.auth) return handleAuth(); note($("djMsg"), "bad", "Couldn’t save the playlist. " + explain(e)); }
    b.disabled = false; b.textContent = "Save to Spotify";
  }
  init.dj = function () {
    chipset($("djMood"), MOODS, "mood"); chipset($("djAct"), ACTS, "act");
    stateBox($("djOut"), { icon: "wave", title: "Your mix will appear here", text: "Choose a mood, an activity or a few artists, then build." });
    $("djBuild").addEventListener("click", buildMix); $("djSave").addEventListener("click", saveMix);
  };

  /* =====================================================================
     Settings
     ===================================================================== */
  function initials(me) { var n = (me && (me.display_name || me.id)) || ""; return n.split(/\s+/).filter(Boolean).slice(0, 2).map(function (s) { return s.charAt(0).toUpperCase(); }).join("") || "·"; }
  var THEMES = [["light", "Light"], ["dark", "Dark"], ["system", "Automatic"]];
  THEMES.forEach(function (t) {
    var b = h("button", { type: "button", "aria-pressed": String(S.theme === t[0]), text: t[1] });
    b.addEventListener("click", function () { S.theme = t[0]; saveSettings(); applyTheme(); $$("#themeSeg button").forEach(function (x, i) { x.setAttribute("aria-pressed", String(THEMES[i][0] === S.theme)); }); });
    $("themeSeg").appendChild(b);
  });
  init.settings = async function () {
    $("sLimit").value = String(S.limit);
    var id = lsGet(LS.id) || ""; $("cidMask").textContent = id ? id.slice(0, 4) + "…" + id.slice(-4) : "—";
    $("appVer").textContent = APP_VERSION;
    try { var me = await getMe(); $("who").textContent = me.display_name || me.id; $("whoPlan").textContent = me.product ? "Spotify " + me.product.charAt(0).toUpperCase() + me.product.slice(1) : ""; }
    catch (e) { if (e.auth) return handleAuth(); $("whoPlan").textContent = "Couldn’t load account details"; }
  };
  $("sLimit").addEventListener("change", function () { S.limit = +this.value; saveSettings(); toast("Saved. Applies to new lists."); });
  $("signout").addEventListener("click", function () { lsDel(LS.tok); stopPolling(); location.assign(redirectUri()); });
  $("changeId").addEventListener("click", function () { lsDel(LS.tok); lsDel(LS.id); stopPolling(); location.assign(redirectUri()); });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!$("ambient").hidden) return closeAmbient();
    var s = openSheetId(); if (s) closeSheet(s); else closeNP();
  });
  function handleAuth(msg) { stopPolling(); lsDel(LS.tok); show("setup"); $("clientId").value = lsGet(LS.id) || ""; setMsg(msg || "Your session expired. Connect again.", "warn"); }

  /* =====================================================================
     Setup + boot
     ===================================================================== */
  hydrateIcons();
  $("redirect").value = redirectUri();
  $("copyRedirect").addEventListener("click", async function () { try { await navigator.clipboard.writeText(redirectUri()); this.textContent = "Copied"; } catch (e) { $("redirect").select(); } });
  $("connect").addEventListener("click", beginLogin);
  $("clientId").addEventListener("keydown", function (e) { if (e.key === "Enter") beginLogin(); });

  async function boot() {
    var params = new URLSearchParams(location.search);
    if (params.get("error")) { history.replaceState(null, "", redirectUri()); show("setup"); $("clientId").value = lsGet(LS.id) || ""; setMsg(params.get("error") === "access_denied" ? "Spotify access was declined." : "Spotify returned an error: " + params.get("error"), "bad"); return; }
    if (params.get("code")) { try { await finishLogin(params.get("code"), params.get("state")); } catch (e) { show("setup"); $("clientId").value = lsGet(LS.id) || ""; setMsg(e.message || "Sign-in failed.", "bad"); return; } }
    if (tokens() && lsGet(LS.id)) {
      if (lsGet(LS.scopes) !== SCOPES) { handleAuth("Studio needs a few new permissions to show your library (playlists, albums and followed artists). Tap Connect to approve them."); return; }
      show("app"); syncDock(); render(); goTo("home"); startPolling();
      getMe().then(function (me) { $$(".js-initials").forEach(function (e) { e.textContent = initials(me); }); if (cur === "home") setHeader(); }).catch(function () {});
    } else { show("setup"); $("clientId").value = lsGet(LS.id) || ""; }
  }

  /* service worker: install updates immediately and reload once onto the new interface */
  if ("serviceWorker" in navigator) {
    var hadController = !!navigator.serviceWorker.controller, reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
    navigator.serviceWorker.register("sw.js").then(function (reg) { if (reg && reg.update) reg.update(); }).catch(function () {});
  }
  boot();
})();
