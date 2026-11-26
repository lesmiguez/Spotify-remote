(function () {
  "use strict";

  /* =========================================================
     Config
     ========================================================= */
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

  /* =========================================================
     Icons (static, trusted strings)
     ========================================================= */
  var PATHS = {
    logo: '<rect class="lg-bg" width="24" height="24" rx="6.5"/><circle class="lg-ring" cx="12" cy="12" r="6.3" fill="none" stroke-width="1.8"/><path class="lg-fg" d="M10.5 9.3v5.4l4.3-2.7z"/>',
    home: '<path d="M3.5 10.5 12 3.5l8.5 7V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-6v6H5A1.5 1.5 0 0 1 3.5 19z"/>',
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
    chevron: '<path d="M6 9l6 6 6-6"/>',
    queue: '<path d="M4 6h12M4 12h12M4 18h8M17 15v6M14 18h6"/>',
    minus: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12h7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    volume: '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    mic: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>'
  };
  var FILLED = { play: 1, pause: 1, next: 1, prev: 1, more: 1 };
  function svg(n) { return '<svg viewBox="0 0 24 24" class="ic' + (FILLED[n] ? " fi" : "") + '" aria-hidden="true" focusable="false">' + (PATHS[n] || "") + "</svg>"; }
  function icon(n) { var s = document.createElement("span"); s.className = "ico"; s.innerHTML = svg(n); return s; }
  function hydrateIcons(root) { (root || document).querySelectorAll("[data-icon]").forEach(function (el) { el.innerHTML = svg(el.getAttribute("data-icon")); el.classList.add("ico"); }); }

  /* =========================================================
     DOM helpers
     ========================================================= */
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
  function stagger(el, i) { el.style.animationDelay = Math.min((i || 0) * 28, 300) + "ms"; return el; }
  function safeUrl(u) { return typeof u === "string" && u.indexOf("https://") === 0 ? u : null; }

  /* =========================================================
     Settings + theme
     ========================================================= */
  var S = { limit: 10, theme: "light" };
  try { var rawS = JSON.parse(lsGet(LS.set) || "{}"); if (rawS.limit) S.limit = +rawS.limit; if (rawS.theme) S.theme = rawS.theme; } catch (e) {}
  function saveSettings() { lsSet(LS.set, JSON.stringify(S)); }
  var darkMq = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
  function applyTheme() {
    var t = S.theme === "system" ? (darkMq && darkMq.matches ? "dark" : "light") : S.theme;
    document.documentElement.setAttribute("data-theme", t);
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", t === "dark" ? "#0D1210" : "#F4F6F5");
  }
  if (darkMq && darkMq.addEventListener) darkMq.addEventListener("change", function () { if (S.theme === "system") applyTheme(); });
  applyTheme();

  /* =========================================================
     Feedback
     ========================================================= */
  var toastTimer;
  function toast(msg, bad) {
    var t = $("toast"); t.hidden = true; t.textContent = msg; t.className = "toast" + (bad ? " bad" : "");
    void t.offsetWidth; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }
  function show(id) { $("setup").hidden = id !== "setup"; $("app").hidden = id !== "app"; }
  function setMsg(msg, kind) { var n = $("setupMsg"); n.textContent = msg || ""; n.className = "note" + (kind ? " " + kind : ""); n.hidden = !msg; }
  function note(target, kind, text) { clear(target); if (text) target.appendChild(h("div", { class: "note " + kind, role: "status", text: text })); }
  function banner(kind, text) { note($("banner"), kind, text); }
  function fmt(ms) { var s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function paintRange(el) { var min = +el.min, max = +el.max, v = +el.value; el.style.setProperty("--p", (max > min ? ((v - min) / (max - min)) * 100 : 0) + "%"); }
  function skel(t, n) { clear(t); for (var i = 0; i < (n || 4); i++) t.appendChild(h("div", { class: "skel" })); }
  function skelRail(t, n, round) { clear(t); for (var i = 0; i < (n || 5); i++) t.appendChild(h("div", { class: "skel tilesk" + (round ? " round" : "") })); }

  /* =========================================================
     PKCE auth
     ========================================================= */
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

  /* =========================================================
     API
     ========================================================= */
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
  function fail(target, e) { if (e.auth) return handleAuth(); if (target) note(target, "warn", explain(e)); else toast(explain(e), true); }

  var meCache = null;
  async function getMe() { if (!meCache) meCache = await api("GET", "/me"); return meCache; }
  async function marketOf() { try { return (await getMe()).country || "US"; } catch (e) { return "US"; } }

  /* =========================================================
     Items: thumbnails, rows, tiles, action sheet
     ========================================================= */
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
    var n = (o && o.name) || "?";
    return h("span", { class: "thumb" + (round ? " round" : ""), "aria-hidden": "true", text: n.charAt(0).toUpperCase() });
  }
  function list(target, rows, emptyText) {
    clear(target);
    if (!rows.length) { target.appendChild(h("p", { class: "empty", text: emptyText || "Nothing to show." })); return; }
    rows.forEach(function (r, i) { target.appendChild(stagger(r, i)); });
  }
  function isNow(uri) { return !!(st.item && st.item.uri === uri); }

  async function playUri(uri) { await api("PUT", "/me/player/play", { uris: [uri] }); setTimeout(poll, 600); }
  function playTrack(t) { playUri(t.uri).then(function () { toast("Playing " + t.name); }).catch(function (e) { if (e.auth) return handleAuth(); toast(explain(e), true); }); }
  function trackItems(t, extra) {
    var items = [
      { label: "Play now", icon: "play", fn: function () { return playUri(t.uri).then(function () { return "Playing " + t.name; }); } },
      { label: "Add to queue", icon: "queue", fn: function () { return api("POST", "/me/player/queue?uri=" + encodeURIComponent(t.uri)).then(function () { setTimeout(loadQueue, 600); return "Added to queue"; }); } },
      { label: "Save to Liked Songs", icon: "heart", fn: function () { return api("PUT", "/me/tracks?ids=" + encodeURIComponent(t.id)).then(function () { return "Saved to Liked Songs"; }); } }
    ];
    return items.concat(extra || []);
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
    main.addEventListener("click", function () { playTrack(t); });
    var more = h("button", { class: "more", type: "button", "aria-label": "More options for " + t.name }, icon("more"));
    more.addEventListener("click", function () { trackSheet(t, o.extra); });
    row.appendChild(main); row.appendChild(more);
    return row;
  }
  function artistRow(a, i, rank) {
    var row = h("div", { class: "it" });
    var main = h("button", { class: "itmain", type: "button", "aria-label": "Top songs by " + a.name });
    if (rank) main.appendChild(h("span", { class: "rk", text: String(i + 1) }));
    main.appendChild(thumb(a, true));
    main.appendChild(h("span", { class: "m" }, h("span", { class: "n", text: a.name }), h("span", { class: "b", text: (a.genres || []).slice(0, 2).join(", ") || "Artist" })));
    main.addEventListener("click", function () { artistTop(a); });
    row.appendChild(main);
    return row;
  }
  function trackTile(t) {
    var w = h("div", { class: "tile", "data-uri": t.uri });
    var b = h("button", { class: "tmain", type: "button", "aria-label": "Play " + t.name + (byline(t) ? " by " + byline(t) : "") },
      h("span", { class: "tart" }, thumb(t, false, 300)), h("span", { class: "tn", text: t.name }), h("span", { class: "tb", text: byline(t) }));
    b.addEventListener("click", function () { playTrack(t); });
    var m = h("button", { class: "tmore", type: "button", "aria-label": "More options for " + t.name }, icon("more"));
    m.addEventListener("click", function () { trackSheet(t); });
    w.appendChild(b); w.appendChild(m);
    return w;
  }
  function artistTile(a) {
    var b = h("button", { class: "tile artist tmain", type: "button", "aria-label": "Top songs by " + a.name },
      h("span", { class: "tart round" }, thumb(a, true, 300)), h("span", { class: "tn", text: a.name }), h("span", { class: "tb", text: (a.genres || [])[0] || "Artist" }));
    b.addEventListener("click", function () { artistTop(a); });
    return b;
  }
  async function artistTop(a) {
    goTo("discover");
    $("disTitle").textContent = "Top songs by " + a.name; skel($("disOut"), 5);
    try { var r = await api("GET", "/artists/" + a.id + "/top-tracks?market=" + (await marketOf())); showTracks("Top songs by " + a.name, r.tracks || []); }
    catch (e) { fail($("disOut"), e); }
  }
  function markNow() {
    document.querySelectorAll("[data-uri]").forEach(function (el) { el.classList.toggle("now", isNow(el.getAttribute("data-uri"))); });
  }

  /* Action sheet */
  function openActions(o) {
    var art = $("actArt"); clear(art); art.appendChild(thumb(o.obj, o.round));
    $("actTitle").textContent = o.title || ""; $("actSub").textContent = o.sub || "";
    var box = $("actList"); clear(box);
    o.items.forEach(function (it) {
      var b = h("button", { class: "actbtn" + (it.danger ? " danger" : ""), type: "button" }, icon(it.icon), h("span", { text: it.label }));
      b.addEventListener("click", async function () {
        closeSheet("actions");
        try { var msg = await it.fn(); if (msg) toast(msg); } catch (e) { if (e.auth) return handleAuth(); toast(explain(e), true); }
      });
      box.appendChild(b);
    });
    var u = safeUrl(o.url);
    if (u) box.appendChild(h("a", { class: "actbtn", href: u, target: "_blank", rel: "noopener" }, icon("open"), h("span", { text: "Open in Spotify" })));
    openSheet("actions");
  }

  /* Sheets */
  var lastFocus = null;
  function openSheet(id) {
    lastFocus = document.activeElement; var s = $(id); s.hidden = false;
    var f = s.querySelector(".panel button, .panel select, .panel a"); if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) {} }, 40);
  }
  function closeSheet(id) { var s = $(id); if (s.hidden) return; s.hidden = true; if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} } }
  function anySheetOpen() { return ["actions", "devices", "menu"].filter(function (id) { return !$(id).hidden; })[0]; }
  document.querySelectorAll("[data-close]").forEach(function (el) { el.addEventListener("click", function () { closeSheet(el.getAttribute("data-close")); }); });

  /* =========================================================
     Navigation
     ========================================================= */
  var VIEWS = [["home", "Home", "home"], ["listening", "Listening", "chart"], ["discover", "Discover", "compass"], ["vault", "Vault", "archive"], ["dj", "DJ", "wave"]];
  var SUB = { listening: ["Insights", "Your listening"], discover: ["Explore", "Discover"], vault: ["Your library", "The vault"], dj: ["Mix builder", "The DJ"] };
  var cur = "home", loaded = {}, init = {};
  VIEWS.forEach(function (v) {
    var b = h("button", { type: "button", "data-v": v[0] }, icon(v[2]), h("span", { class: "nl", text: v[1] }));
    b.addEventListener("click", function () { goTo(v[0]); });
    $("navItems").appendChild(b);
  });
  function greeting() {
    var hr = new Date().getHours(), g = hr < 5 ? "Good evening" : hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
    var n = meCache && meCache.display_name ? meCache.display_name.split(" ")[0] : "";
    return n ? g + ", " + n : g;
  }
  function setHeader() {
    if (cur === "home") { $("eyebrow").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }); $("vtitle").textContent = greeting(); }
    else { $("eyebrow").textContent = SUB[cur][0]; $("vtitle").textContent = SUB[cur][1]; }
  }
  function goTo(id) {
    cur = id;
    document.querySelectorAll(".view").forEach(function (s) { s.classList.toggle("on", s.id === "v-" + id); });
    $("navItems").querySelectorAll("button").forEach(function (b) { if (b.getAttribute("data-v") === id) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    setHeader(); banner("", "");
    document.title = (id === "home" ? "Spotify Studio" : VIEWS.filter(function (x) { return x[0] === id; })[0][1] + " · Studio");
    if (!loaded[id]) { loaded[id] = 1; init[id] && init[id](); }
    window.scrollTo(0, 0);
  }

  /* =========================================================
     Adaptive artwork color
     ========================================================= */
  function rgbToHs(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn, l = (mx + mn) / 2, s = dl === 0 ? 0 : dl / (1 - Math.abs(2 * l - 1)), hh = 0;
    if (dl) { if (mx === r) hh = ((g - b) / dl) % 6; else if (mx === g) hh = (b - r) / dl + 2; else hh = (r - g) / dl + 4; hh = (hh * 60 + 360) % 360; }
    return { h: Math.round(hh), s: s };
  }
  function extractColor(url) {
    return new Promise(function (res) {
      var im = new Image(); im.crossOrigin = "anonymous"; im.decoding = "async";
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
          if (best.w < 0.5) return res({ h: 150, s: 0.06 });
          res(rgbToHs(best.r / best.w, best.g / best.w, best.b / best.w));
        } catch (e) { res(null); }
      };
      im.onerror = function () { res(null); };
      im.src = url;
    });
  }
  function setArtColor(c) {
    var root = document.documentElement.style;
    if (!c) { root.setProperty("--art-h", "141"); root.setProperty("--art-s", "52"); return; }
    root.setProperty("--art-h", String(c.h)); root.setProperty("--art-s", String(Math.round(Math.min(c.s, 0.62) * 100)));
  }

  /* =========================================================
     Player
     ========================================================= */
  var st = { item: null, playing: false, progress: 0, at: 0, device: null, shuffle: false, repeat: "off" };
  var lastItemId = null, dragging = false, busyUntil = 0, artKey = null;
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
    var img = $("art"), fb = $("artFallback"), bg = $("npBg"), ma = $("miniArt"), mf = $("miniFb");
    var letter = (it && it.name ? it.name : "♪").charAt(0).toUpperCase();
    fb.textContent = letter; mf.textContent = letter;
    if (url) {
      img.classList.remove("on"); img.alt = it.album && it.album.name ? "Album art: " + it.album.name : "Artwork";
      img.onload = function () { img.classList.add("on"); }; img.src = url;
      bg.src = url; bg.hidden = false; ma.src = url; ma.hidden = false;
      extractColor(url).then(function (c) { if (artKey === url) setArtColor(c); });
    } else {
      img.classList.remove("on"); img.removeAttribute("src"); img.alt = "";
      bg.hidden = true; bg.removeAttribute("src"); ma.hidden = true; ma.removeAttribute("src");
      setArtColor(null);
    }
  }
  function render() {
    var it = st.item;
    document.documentElement.setAttribute("data-playing", String(!!(st.playing && it)));
    var sub = it ? byline(it) : (st.device ? "Press play to start" : "Choose a device to begin");
    $("title").textContent = it ? it.name : "Not playing";
    $("artist").textContent = sub;
    $("miniTitle").textContent = it ? it.name : "Not playing";
    $("miniArtist").textContent = it ? byline(it) : (st.device ? st.device.name : "Tap to choose a device");
    $("deviceName").textContent = st.device ? st.device.name : "No device";
    $("npCtx").textContent = st.device ? "Playing on " + st.device.name : "No device connected";
    document.querySelectorAll(".js-play").forEach(function (b) { b.setAttribute("aria-label", st.playing ? "Pause" : "Play"); });
    $("artWrap").classList.toggle("paused", !st.playing);
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
    var it = st.item, seek = $("seek"), bar = $("miniBar");
    if (!it || !it.duration_ms) { seek.value = 0; paintRange(seek); $("tNow").textContent = "0:00"; $("tLen").textContent = "0:00"; bar.style.transform = "scaleX(0)"; return; }
    var pos = Math.min(it.duration_ms, st.progress + (st.playing ? Date.now() - st.at : 0));
    $("tLen").textContent = fmt(it.duration_ms);
    bar.style.transform = "scaleX(" + (pos / it.duration_ms).toFixed(4) + ")";
    if (!dragging) { seek.value = Math.round((pos / it.duration_ms) * 1000); paintRange(seek); $("tNow").textContent = fmt(pos); }
  }
  setInterval(function () { if (!document.hidden) tick(); }, 500);

  async function loadQueue() {
    try {
      var q = await api("GET", "/me/player/queue"), l = ((q && q.queue) || []).filter(function (t) { return t && t.uri; });
      list($("queueList"), l.slice(0, 10).map(function (t, i) { return trackRow(t, i); }), "Nothing queued.");
      list($("homeQueue"), l.slice(0, 5).map(function (t, i) { return trackRow(t, i); }), "Nothing queued.");
    } catch (e) { if (e.auth) return handleAuth(); }
  }
  async function checkSaved() {
    var it = st.item, b = $("npSave");
    if (!it || !it.id || it.type === "episode") { b.hidden = true; return; }
    b.hidden = false; b.setAttribute("aria-pressed", "false"); b.setAttribute("aria-label", "Save to Liked Songs");
    try {
      var r = await api("GET", "/me/tracks/contains?ids=" + encodeURIComponent(it.id));
      if (st.item && st.item.id === it.id) { var on = !!(r && r[0]); b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-label", on ? "Remove from Liked Songs" : "Save to Liked Songs"); }
    } catch (e) { if (e.auth) return handleAuth(); }
  }
  $("npSave").addEventListener("click", async function () {
    var it = st.item, b = this; if (!it) return;
    var on = b.getAttribute("aria-pressed") === "true"; b.setAttribute("aria-pressed", String(!on));
    try { await api(on ? "DELETE" : "PUT", "/me/tracks?ids=" + encodeURIComponent(it.id)); toast(on ? "Removed from Liked Songs" : "Saved to Liked Songs"); b.setAttribute("aria-label", on ? "Save to Liked Songs" : "Remove from Liked Songs"); }
    catch (e) { b.setAttribute("aria-pressed", String(on)); if (e.auth) return handleAuth(); toast(explain(e), true); }
  });

  var pollTimer = null, failures = 0;
  async function poll() {
    if (document.hidden) return;
    try { applyPlayer(await api("GET", "/me/player")); failures = 0; }
    catch (e) { if (e.auth) return handleAuth(); if (++failures === 3) toast("Having trouble reaching Spotify.", true); }
  }
  function startPolling() { stopPolling(); poll(); pollTimer = setInterval(poll, 4000); }
  function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && !$("app").hidden) poll(); });

  async function cmd(method, path, optimistic, body) {
    var snap = Object.assign({}, st);
    if (optimistic) { optimistic(); render(); }
    try { await api(method, path, body); setTimeout(poll, 450); }
    catch (e) { if (e.auth) return handleAuth(); st = snap; render(); toast(explain(e), true); }
  }
  function togglePlay() {
    if (!st.device) { openDevices(); return; }
    if (st.playing) cmd("PUT", "/me/player/pause", function () { st.progress += Date.now() - st.at; st.at = Date.now(); st.playing = false; });
    else cmd("PUT", "/me/player/play", function () { st.at = Date.now(); st.playing = true; }, {});
  }
  function nextTrack() { if (!st.device) return openDevices(); cmd("POST", "/me/player/next"); }
  document.querySelectorAll(".js-play").forEach(function (b) { b.addEventListener("click", togglePlay); });
  $("next").addEventListener("click", nextTrack);
  $("miniNext").addEventListener("click", nextTrack);
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

  /* Full-screen now playing (folded) / docked panel (wide) */
  var dockMq = window.matchMedia("(min-width:1100px)");
  function docked() { return dockMq.matches; }
  function syncDock() {
    var np = $("np");
    if (docked()) { np.classList.remove("open"); np.style.transform = ""; np.removeAttribute("inert"); np.removeAttribute("role"); np.removeAttribute("aria-modal"); document.body.classList.remove("np-open"); }
    else if (!np.classList.contains("open")) np.setAttribute("inert", "");
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
    try { $("miniOpen").focus({ preventScroll: true }); } catch (e) {}
  }
  if (dockMq.addEventListener) dockMq.addEventListener("change", syncDock); else if (dockMq.addListener) dockMq.addListener(syncDock);
  $("miniOpen").addEventListener("click", openNP);
  $("npClose").addEventListener("click", closeNP);
  $("npDevice").addEventListener("click", openDevices);
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
    np.addEventListener("touchend", function () {
      if (y0 == null) return; np.style.transition = ""; y0 = null;
      if (dy > 110) closeNP(); else np.style.transform = "";
    });
  })();

  /* Devices */
  function devIcon(type) { return type === "Computer" ? "computer" : type === "Smartphone" ? "device" : "speaker"; }
  function openDevices() { openSheet("devices"); loadDevices(); }
  async function loadDevices() {
    var box = $("devList"); skel(box, 2);
    try {
      var d = await api("GET", "/me/player/devices"), l = (d && d.devices) || [];
      clear(box);
      if (!l.length) { box.appendChild(h("p", { class: "empty", text: "No devices are available right now." })); return; }
      l.forEach(function (dev) {
        var b = h("button", { type: "button", class: "dev" + (dev.is_active ? " on" : "") }, icon(devIcon(dev.type)), h("div", null, h("div", { class: "dn", text: dev.name }), h("div", { class: "dt", text: dev.type + (dev.is_active ? " · Playing here" : "") })));
        b.addEventListener("click", async function () {
          try { await api("PUT", "/me/player", { device_ids: [dev.id], play: true }); closeSheet("devices"); toast("Playing on " + dev.name); setTimeout(poll, 700); }
          catch (e) { if (e.auth) return handleAuth(); toast(explain(e), true); }
        });
        box.appendChild(b);
      });
    } catch (e) { if (e.auth) return handleAuth(); clear(box); box.appendChild(h("p", { class: "empty", text: "Couldn’t load devices." })); }
  }
  $("deviceBtn").addEventListener("click", openDevices);
  $("devRefresh").addEventListener("click", loadDevices);

  /* =========================================================
     Home
     ========================================================= */
  var recentCache = null;
  async function getRecent() {
    if (recentCache) return recentCache;
    var r = await api("GET", "/me/player/recently-played?limit=50");
    recentCache = ((r && r.items) || []).filter(function (x) { return x.track; });
    return recentCache;
  }
  init.home = async function () {
    var rr = $("homeRecent"); skelRail(rr, 6);
    try {
      var rec = await getRecent(), seen = {}, out = [];
      rec.forEach(function (x) { if (!seen[x.track.id]) { seen[x.track.id] = 1; out.push(x.track); } });
      list(rr, out.slice(0, 14).map(trackTile), "No recent plays yet.");
    } catch (e) { fail(rr, e); }
    var ar = $("homeArtists"); skelRail(ar, 5, true);
    try { var ta = await api("GET", "/me/top/artists?time_range=short_term&limit=12"); list(ar, (ta.items || []).map(artistTile), "Listen a little more and your artists will show up here."); }
    catch (e) { fail(ar, e); }
  };

  /* =========================================================
     Listening
     ========================================================= */
  var RANGES = [["4 weeks", "short_term"], ["6 months", "medium_term"], ["12 months", "long_term"]], rng = 1, topArtistsCache = [];
  function bars(box, entries, onPick, pressed) {
    clear(box);
    if (!entries.length) { box.appendChild(h("p", { class: "empty", text: "Not enough data yet." })); return; }
    var max = entries[0][1];
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
    bars($("genreBars"), e, function (g) { drawGenres(sel === g ? null : g); }, sel);
    var gl = $("genreList"); clear(gl);
    if (sel) {
      gl.appendChild(h("div", { class: "f", text: "Your artists in " + sel }));
      topArtistsCache.filter(function (a) { return (a.genres || []).indexOf(sel) > -1; }).forEach(function (a, i) { gl.appendChild(stagger(artistRow(a, i), i)); });
    }
  }
  async function loadTop() {
    var rk = RANGES[rng][1]; skel($("topArtists")); skel($("topTracks")); skel($("genreBars"), 3);
    try {
      var a = await api("GET", "/me/top/artists?time_range=" + rk + "&limit=50");
      topArtistsCache = a.items || []; drawGenres(null);
      list($("topArtists"), topArtistsCache.slice(0, S.limit).map(function (x, i) { return artistRow(x, i, true); }), "No top artists for this range yet.");
      var t = await api("GET", "/me/top/tracks?time_range=" + rk + "&limit=" + S.limit);
      list($("topTracks"), (t.items || []).map(function (x, i) { return trackRow(x, i, null, { rank: true }); }), "No top tracks for this range yet.");
    } catch (e) { fail($("topArtists"), e); clear($("topTracks")); clear($("genreBars")); }
  }
  async function loadWhen() {
    try {
      var r = await getRecent();
      if (!r.length) { $("whenNote").textContent = "No recent plays to chart."; return; }
      var first = new Date(r[r.length - 1].played_at), last = new Date(r[0].played_at), dopt = { month: "short", day: "numeric" };
      $("whenNote").textContent = "Your last " + r.length + " plays, " + first.toLocaleDateString(undefined, dopt) + " to " + last.toLocaleDateString(undefined, dopt) + ". Spotify only shares your 50 most recent plays, so this is a sample.";
      var hrs = []; for (var z = 0; z < 24; z++) hrs.push([]);
      r.forEach(function (x) { hrs[new Date(x.played_at).getHours()].push(x); });
      var max = Math.max.apply(null, hrs.map(function (a) { return a.length; })) || 1, box = $("hourChart"); clear(box);
      hrs.forEach(function (arr, hr) {
        var fl = h("span", { class: "fl" });
        var b = h("button", { class: "hr", type: "button", "aria-pressed": "false", "aria-label": arr.length + " plays around " + hr + ":00" }, fl, h("span", { class: "lb", text: hr % 6 === 0 ? String(hr) : "" }));
        b.addEventListener("click", function () {
          var on = b.getAttribute("aria-pressed") === "true";
          box.querySelectorAll(".hr").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
          var hl = $("hourList"); clear(hl); if (on) return;
          b.setAttribute("aria-pressed", "true");
          hl.appendChild(h("div", { class: "f", text: arr.length + " plays around " + hr + ":00" }));
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
    } catch (e) { fail($("hourChart"), e); }
  }
  init.listening = function () {
    var seg = $("range");
    RANGES.forEach(function (r, i) {
      var b = h("button", { type: "button", "aria-pressed": String(i === rng), text: r[0] });
      b.addEventListener("click", function () { if (rng === i) return; rng = i; seg.querySelectorAll("button").forEach(function (x, j) { x.setAttribute("aria-pressed", String(j === i)); }); loadTop(); });
      seg.appendChild(b);
    });
    loadTop(); loadWhen();
  };

  /* =========================================================
     Discover
     ========================================================= */
  function showTracks(title, tracks) { $("disTitle").textContent = title; list($("disOut"), tracks.map(function (t, i) { return trackRow(t, i); }), "No tracks found."); }
  async function searchApi(q, type, limit, offset) {
    var m = await marketOf();
    var path = function (l) { return "/search?q=" + encodeURIComponent(q) + "&type=" + type + "&limit=" + l + "&market=" + m + (offset ? "&offset=" + offset : ""); };
    try { return await api("GET", path(limit)); }
    catch (e) { if (e.status === 400 && limit > 10) return api("GET", path(10)); throw e; }
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
    $("disTitle").textContent = "Explore " + g; skel($("disOut"), 5);
    try { var r = await searchApi('genre:"' + g + '"', "track", S.limit, Math.floor(Math.random() * 30)); showTracks("Explore " + g, (r.tracks && r.tracks.items) || []); }
    catch (e) { fail($("disOut"), e); }
  }
  init.discover = async function () {
    $("q").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); $("q").blur(); runSearch(); } });
    var box = $("genreChips");
    try {
      var a = await api("GET", "/me/top/artists?time_range=medium_term&limit=30"), counts = {};
      (a.items || []).forEach(function (x) { (x.genres || []).forEach(function (g) { counts[g] = (counts[g] || 0) + 1; }); });
      var gs = Object.keys(counts).sort(function (x, y) { return counts[y] - counts[x]; }).slice(0, 12);
      if (!gs.length) box.appendChild(h("p", { class: "empty", text: "Listen to more and your genres will appear here." }));
      gs.forEach(function (g) {
        var b = h("button", { class: "chip", type: "button", "aria-pressed": "false", text: g });
        b.addEventListener("click", function () { box.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-pressed", String(c === b)); }); runGenre(g); });
        box.appendChild(b);
      });
    } catch (e) { fail(box, e); }
  };

  /* =========================================================
     Vault
     ========================================================= */
  var vault = { total: 0, memo: {} };
  async function savedAt(i) {
    if (vault.memo[i]) return vault.memo[i];
    var r = await api("GET", "/me/tracks?limit=1&offset=" + i); vault.total = r.total;
    var it = r.items && r.items[0]; vault.memo[i] = it; return it;
  }
  async function savedPage(offset, limit) { var r = await api("GET", "/me/tracks?limit=" + limit + "&offset=" + Math.max(0, offset)); vault.total = r.total; return r.items || []; }
  function vaultRows(items, empty) {
    list($("vaultOut"), items.map(function (x, i) { return trackRow(x.track, i, "Saved " + new Date(x.added_at).toLocaleDateString(undefined, { month: "short", year: "numeric" }) + " · " + byline(x.track)); }), empty || "Nothing here.");
  }
  async function vaultRun(kind, btn) {
    document.querySelectorAll("#vaultChips .chip").forEach(function (c) { c.setAttribute("aria-pressed", String(c === btn)); });
    $("vaultTitle").textContent = btn.textContent; skel($("vaultOut"), 5);
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
        vaultRows(page.filter(function (x) { return x.added_at >= start && x.added_at < end; }), "No saves in " + y + ".");
      }
    } catch (e) { fail($("vaultOut"), e); }
  }
  init.vault = async function () {
    var box = $("vaultChips");
    try {
      var first = await savedAt(0);
      if (!first) { $("vaultInfo").textContent = "Your library has no saved songs yet."; return; }
      var oldest = await savedAt(vault.total - 1), y0 = new Date(oldest.added_at).getFullYear(), y1 = new Date().getFullYear();
      $("vaultInfo").textContent = vault.total.toLocaleString() + " saved songs, going back to " + y0 + ".";
      var chip = function (label, kind) { var b = h("button", { class: "chip", type: "button", "aria-pressed": "false", text: label }); b.addEventListener("click", function () { vaultRun(kind, b); }); box.appendChild(b); };
      chip("Oldest saves", "oldest"); chip("Surprise me", "random");
      for (var y = y1; y >= y0; y--) chip(String(y), y);
    } catch (e) { fail($("vaultInfo"), e); }
  };

  /* =========================================================
     DJ
     ========================================================= */
  var MOODS = { Calm: ["acoustic", "chill", "singer-songwriter"], Energized: ["rock", "dance pop", "pop rock"], Nostalgic: ["classic rock", "oldies", "country classics"], Focused: ["instrumental", "ambient", "lo-fi"], Happy: ["pop", "reggae", "feel-good"], Moody: ["indie", "alternative", "blues"], Romantic: ["r&b", "soul", "love songs"], Confident: ["hip hop", "rap", "trap"] };
  var ACTS = { Driving: ["country rock", "classic rock"], Working: ["lo-fi", "instrumental"], Workout: ["edm", "hard rock", "hip hop"], Cooking: ["soul", "jazz"], "Golf round": ["country", "soft rock"], "Hunting trip": ["outlaw country", "southern rock"], "Hosting friends": ["pop", "funk"], "Winding down": ["acoustic", "jazz"] };
  var pick = { mood: null, act: null }, mix = [];
  function chipset(box, names, key) {
    Object.keys(names).forEach(function (n) {
      var b = h("button", { class: "chip", type: "button", "aria-pressed": "false", text: n });
      b.addEventListener("click", function () { pick[key] = pick[key] === n ? null : n; box.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-pressed", String(c.textContent === pick[key])); }); });
      box.appendChild(b);
    });
  }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function drawMix() {
    var total = mix.reduce(function (s, t) { return s + (t.duration_ms || 0); }, 0);
    $("djSave").hidden = !mix.length;
    list($("djOut"), mix.map(function (t, i) {
      return trackRow(t, i, null, { extra: [{ label: "Remove from mix", icon: "minus", danger: true, fn: function () { mix = mix.filter(function (x) { return x.uri !== t.uri; }); drawMix(); return "Removed from mix"; } }] });
    }), "Nothing found. Try another mood or add artists.");
    if (mix.length) $("djOut").insertBefore(h("p", { class: "cap", text: mix.length + " songs · about " + Math.round(total / 60000) + " min" }), $("djOut").firstChild);
  }
  async function buildMix() {
    var likes = $("djLike").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 5);
    var genres = (pick.mood ? MOODS[pick.mood] : []).concat(pick.act ? ACTS[pick.act] : []);
    if (!genres.length && !likes.length) { note($("djMsg"), "warn", "Pick a mood, an activity or add an artist first."); return; }
    note($("djMsg"), "", ""); skel($("djOut"), 5); $("djSave").hidden = true; $("djBuild").disabled = true;
    var target = (+$("djLen").value) * 60000, market = await marketOf(), pools = [];
    try {
      for (var i = 0; i < likes.length; i++) {
        var r = await searchApi(likes[i], "artist", 1), a = r.artists && r.artists.items && r.artists.items[0];
        if (a) { var tt = await api("GET", "/artists/" + a.id + "/top-tracks?market=" + market); pools.push(shuffle((tt.tracks || []).slice())); }
      }
      var gl = shuffle(genres.slice()).slice(0, 4);
      for (var j = 0; j < gl.length; j++) { var gr = await searchApi('genre:"' + gl[j] + '"', "track", 20, Math.floor(Math.random() * 25)); pools.push(shuffle(((gr.tracks && gr.tracks.items) || []).slice())); }
      var seen = {}, out = [], sum = 0, guard = 0;
      while (sum < target && guard++ < 400) {
        var any = false;
        for (var p = 0; p < pools.length && sum < target; p++) { var t = pools[p].shift(); if (!t) continue; any = true; if (seen[t.uri]) continue; seen[t.uri] = 1; out.push(t); sum += t.duration_ms || 0; }
        if (!any) break;
      }
      mix = out; drawMix();
      if (out.length && sum < target * 0.8) note($("djMsg"), "warn", "Spotify returned fewer songs than a full " + $("djLen").value + " minutes. Add artists to widen it.");
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
      note($("djMsg"), "ok", "Saved to your library as a private playlist.");
      var u = safeUrl(pl.external_urls && pl.external_urls.spotify);
      if (u) $("djMsg").firstChild.appendChild(h("a", { href: u, target: "_blank", rel: "noopener", text: "Open" }));
    } catch (e) { b.disabled = false; if (e.auth) return handleAuth(); note($("djMsg"), "bad", "Couldn’t save the playlist. " + explain(e)); return; }
    b.disabled = false;
  }
  init.dj = function () { chipset($("djMood"), MOODS, "mood"); chipset($("djAct"), ACTS, "act"); $("djBuild").addEventListener("click", buildMix); $("djSave").addEventListener("click", saveMix); };

  /* =========================================================
     Account + settings
     ========================================================= */
  function initials(me) { var n = (me && (me.display_name || me.id)) || ""; return n.split(/\s+/).filter(Boolean).slice(0, 2).map(function (s) { return s.charAt(0).toUpperCase(); }).join("") || "·"; }
  var THEMES = [["light", "Light"], ["dark", "Dark"], ["system", "Automatic"]];
  THEMES.forEach(function (t) {
    var b = h("button", { type: "button", "aria-pressed": String(S.theme === t[0]), text: t[1] });
    b.addEventListener("click", function () { S.theme = t[0]; saveSettings(); applyTheme(); $("themeSeg").querySelectorAll("button").forEach(function (x, i) { x.setAttribute("aria-pressed", String(THEMES[i][0] === S.theme)); }); });
    $("themeSeg").appendChild(b);
  });
  async function openMenu() {
    $("sLimit").value = String(S.limit); openSheet("menu");
    try { var me = await getMe(); $("who").textContent = (me.display_name || me.id) + (me.product ? " · " + me.product.charAt(0).toUpperCase() + me.product.slice(1) : ""); $("menuAvatar").textContent = initials(me); }
    catch (e) { $("who").textContent = "Signed in"; }
  }
  $("menuBtn").addEventListener("click", openMenu);
  $("navSettings").addEventListener("click", openMenu);
  $("sLimit").addEventListener("change", function () { S.limit = +this.value; saveSettings(); toast("Saved. Applies to new lists."); });
  $("signout").addEventListener("click", function () { lsDel(LS.tok); stopPolling(); location.assign(redirectUri()); });
  $("changeId").addEventListener("click", function () { lsDel(LS.tok); lsDel(LS.id); stopPolling(); location.assign(redirectUri()); });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var s = anySheetOpen(); if (s) closeSheet(s); else closeNP();
  });
  function handleAuth(msg) { stopPolling(); lsDel(LS.tok); show("setup"); $("clientId").value = lsGet(LS.id) || ""; setMsg(msg || "Your session expired. Connect again.", "warn"); }

  /* =========================================================
     Setup + boot
     ========================================================= */
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
      if (lsGet(LS.scopes) !== SCOPES) { handleAuth("Studio needs a few new permissions (listening history, library and playlists). Tap Connect to approve them."); return; }
      show("app"); syncDock(); render(); goTo("home"); startPolling();
      getMe().then(function (me) { $("avatarTxt").textContent = initials(me); if (cur === "home") setHeader(); }).catch(function () {});
    } else { show("setup"); $("clientId").value = lsGet(LS.id) || ""; }
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
  boot();
})();
