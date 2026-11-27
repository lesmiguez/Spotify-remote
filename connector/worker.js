/**
 * Studio Remote — a personal remote MCP server (Cloudflare Worker) that lets Claude-hosted
 * Studio DJ control Spotify playback through the Spotify Web API.
 *
 * Bindings (Cloudflare dashboard → Worker → Settings):
 *   KV              KV namespace (stores the Spotify refresh token and a short-lived access token)
 *   SPOTIFY_CLIENT_ID   variable: the Client ID of your Spotify developer app (the same one Studio uses)
 *   CONNECTOR_KEY       secret: a long random string; Claude must present it on every request
 *
 * Endpoints:
 *   GET  /setup?key=KEY   one-time Spotify sign-in (PKCE, no client secret)
 *   GET  /callback        Spotify redirect target (add https://<worker>/callback in the Spotify dashboard)
 *   POST /mcp             MCP (Streamable HTTP, JSON responses). Auth: "Authorization: Bearer KEY" header
 *   POST /mcp/KEY         same, with the key in the path (for connectors without custom headers)
 *
 * Spotify policy: tools return playback STATE only (ok, playing, device, track URI). They never
 * return track names, artwork or other Spotify Content to Claude.
 */
const SCOPES = "user-read-playback-state user-modify-playback-state";
const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const API = "https://api.spotify.com/v1";
const URI_RE = /^spotify:(track|episode):[A-Za-z0-9]{22}$/;
const CTX_RE = /^spotify:(album|playlist|artist|show):[A-Za-z0-9]{22}$|^spotify:user:[^:]{1,64}:collection$/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/setup") return setup(url, env);
      if (url.pathname === "/callback") return callback(url, env);
      if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
        if (!authorized(req, url, env)) return new Response("Unauthorized", { status: 401 });
        if (req.method === "GET") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
        if (req.method === "DELETE") return new Response(null, { status: 204 });
        if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
        return mcp(req, env);
      }
      if (url.pathname === "/") return text("Studio Remote is running.");
      return new Response("Not found", { status: 404 });
    } catch (e) {
      return new Response("Server error", { status: 500 });
    }
  }
};

/* ---------- auth ---------- */
function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length || !b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0;
}
function authorized(req, url, env) {
  const key = env.CONNECTOR_KEY || "";
  if (key.length < 24) return false;
  const h = req.headers.get("Authorization") || "";
  if (h.startsWith("Bearer ") && same(h.slice(7).trim(), key)) return true;
  const seg = url.pathname.split("/")[2] || "";
  return same(decodeURIComponent(seg), key);
}
const text = (t, s = 200) => new Response(t, { status: s, headers: { "Content-Type": "text/plain; charset=utf-8" } });
const page = (t, s = 200) => new Response(`<!DOCTYPE html><meta name="viewport" content="width=device-width"><title>Studio Remote</title><body style="font:17px -apple-system,sans-serif;padding:32px;max-width:520px;margin:auto"><h2>Studio Remote</h2><p>${t}</p></body>`, { status: s, headers: { "Content-Type": "text/html; charset=utf-8" } });

/* ---------- one-time Spotify sign-in (PKCE) ---------- */
function b64url(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
async function setup(url, env) {
  if (!same(url.searchParams.get("key") || "", env.CONNECTOR_KEY || "") || (env.CONNECTOR_KEY || "").length < 24) return page("The setup link needs your connector key.", 401);
  if (!env.SPOTIFY_CLIENT_ID) return page("Add the SPOTIFY_CLIENT_ID variable to this Worker first.", 500);
  if (!env.KV) return page("Bind a KV namespace named KV to this Worker first.", 500);
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  await env.KV.put("pkce:" + state, verifier, { expirationTtl: 600 });
  const q = new URLSearchParams({ client_id: env.SPOTIFY_CLIENT_ID, response_type: "code", redirect_uri: url.origin + "/callback", code_challenge_method: "S256", code_challenge: challenge, scope: SCOPES, state });
  return Response.redirect("https://accounts.spotify.com/authorize?" + q, 302);
}
async function callback(url, env) {
  if (url.searchParams.get("error")) return page("Spotify sign-in was cancelled: " + escapeHtml(url.searchParams.get("error")), 400);
  const state = url.searchParams.get("state") || "", code = url.searchParams.get("code") || "";
  const verifier = state && await env.KV.get("pkce:" + state);
  if (!verifier || !code) return page("This sign-in link expired. Open the setup link again.", 400);
  await env.KV.delete("pkce:" + state);
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: url.origin + "/callback", client_id: env.SPOTIFY_CLIENT_ID, code_verifier: verifier })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.refresh_token) return page("Spotify didn’t complete sign-in (" + escapeHtml(j.error_description || j.error || r.status) + "). Check that " + escapeHtml(url.origin) + "/callback is listed as a Redirect URI in your Spotify app.", 400);
  await env.KV.put("refresh", j.refresh_token);
  await env.KV.put("access", JSON.stringify({ t: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 }));
  return page("Connected to Spotify. You can close this page and add the connector in Claude.");
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

/* ---------- Spotify Web API ---------- */
async function token(env, force) {
  if (!force) {
    const c = JSON.parse((await env.KV.get("access")) || "null");
    if (c && c.exp > Date.now()) return c.t;
  }
  const refresh = await env.KV.get("refresh");
  if (!refresh) throw new ToolError("Studio Remote isn’t signed in to Spotify yet. Open the setup link once.");
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: env.SPOTIFY_CLIENT_ID })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new ToolError("Spotify sign-in expired. Open the setup link again.");
  if (j.refresh_token && j.refresh_token !== refresh) await env.KV.put("refresh", j.refresh_token);   // PKCE refresh tokens rotate
  await env.KV.put("access", JSON.stringify({ t: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 }));
  return j.access_token;
}
class ToolError extends Error {}
async function sp(env, method, path, body, retried) {
  const t = await token(env, retried === "auth");
  const r = await fetch(API + path, { method, headers: { Authorization: "Bearer " + t, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401 && retried !== "auth") return sp(env, method, path, body, "auth");
  if (r.status === 429) throw new ToolError("Spotify is rate-limiting requests. Try again in " + (r.headers.get("Retry-After") || "a few") + " seconds.");
  if (r.status === 204 || r.status === 202) return { status: r.status, data: null };
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const reason = data && data.error && (data.error.reason || data.error.message);
    const e = new ToolError(r.status === 404 ? "NO_ACTIVE_DEVICE" : r.status === 403 ? "Spotify refused this command" + (reason ? " (" + reason + ")" : "") + ". Spotify Premium is required." : "Spotify error " + r.status + (reason ? ": " + reason : ""));
    e.status = r.status; throw e;
  }
  return { status: r.status, data };
}
const qs = (o) => { const p = new URLSearchParams(); Object.entries(o).forEach(([k, v]) => { if (v != null && v !== "") p.set(k, v); }); const s = p.toString(); return s ? "?" + s : ""; };
async function devices(env) { return ((await sp(env, "GET", "/me/player/devices")).data || {}).devices || []; }
async function state(env) {
  const r = await sp(env, "GET", "/me/player");
  const s = r.data;
  if (!s) return { active: false };
  return { active: true, playing: !!s.is_playing, item_uri: s.item ? s.item.uri : null, progress_ms: s.progress_ms || 0, duration_ms: s.item ? s.item.duration_ms : 0,
    shuffle: !!s.shuffle_state, repeat: s.repeat_state, device: s.device ? { id: s.device.id, name: s.device.name, type: s.device.type, volume: s.device.volume_percent } : null,
    context_uri: s.context ? s.context.uri : null };
}
/* run a command; if Spotify has no active device, target the most recently available one */
async function withDevice(env, deviceId, fn) {
  try { return await fn(deviceId); }
  catch (e) {
    if (!(e instanceof ToolError) || e.message !== "NO_ACTIVE_DEVICE" || deviceId) throw e;
    const list = await devices(env);
    const pick = list.find(d => d.is_active) || list.find(d => d.type === "Smartphone") || list[0];
    if (!pick) throw new ToolError("No Spotify device is available. Open Spotify on your phone or speaker, then try again.");
    return await fn(pick.id);
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function confirm(env, check, tries = 5) {
  for (let i = 0; i < tries; i++) { await sleep(i ? 350 : 250); try { const s = await state(env); if (check(s)) return s; } catch (e) {} }
  return null;
}

/* ---------- tools ---------- */
const TOOLS = [
  { name: "get_playback", description: "Current Spotify playback state: whether something is playing, on which device, the current track URI, progress, shuffle and repeat. Returns no track names or other Spotify content.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true, title: "Playback state" } },
  { name: "list_devices", description: "Spotify Connect devices available to the listener.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true, title: "Devices" } },
  { name: "play", description: "Start playback. Give track URIs (up to 100, played in order) or a context URI (album, playlist, artist or the listener's Liked Songs), optionally starting at offset_uri. With no arguments, resumes. Uses the active device, or the most recent available one.", inputSchema: { type: "object", properties: { uris: { type: "array", items: { type: "string" }, maxItems: 100 }, context_uri: { type: "string" }, offset_uri: { type: "string" }, device_id: { type: "string" } } }, annotations: { readOnlyHint: false, destructiveHint: false, title: "Play" } },
  { name: "pause", description: "Pause playback.", inputSchema: { type: "object", properties: { device_id: { type: "string" } } }, annotations: { readOnlyHint: false, destructiveHint: false, title: "Pause" } },
  { name: "next", description: "Skip to the next track.", inputSchema: { type: "object", properties: { device_id: { type: "string" } } }, annotations: { readOnlyHint: false, destructiveHint: false, title: "Next" } },
  { name: "previous", description: "Go back to the previous track (Spotify restarts the current track if it has played for a few seconds).", inputSchema: { type: "object", properties: { device_id: { type: "string" } } }, annotations: { readOnlyHint: false, destructiveHint: false, title: "Previous" } },
  { name: "add_to_queue", description: "Add tracks to the end of the Spotify queue, in order (up to 20).", inputSchema: { type: "object", properties: { uris: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 20 }, device_id: { type: "string" } }, required: ["uris"] }, annotations: { readOnlyHint: false, destructiveHint: false, title: "Add to queue" } },
  { name: "set_shuffle", description: "Turn shuffle on or off.", inputSchema: { type: "object", properties: { state: { type: "boolean" }, device_id: { type: "string" } }, required: ["state"] }, annotations: { readOnlyHint: false, destructiveHint: false, title: "Shuffle" } },
  { name: "transfer", description: "Move playback to another Spotify Connect device.", inputSchema: { type: "object", properties: { device_id: { type: "string" }, play: { type: "boolean" } }, required: ["device_id"] }, annotations: { readOnlyHint: false, destructiveHint: false, title: "Transfer" } }
];
const devArg = a => (typeof a.device_id === "string" && /^[A-Za-z0-9]{1,80}$/.test(a.device_id)) ? a.device_id : undefined;
async function run(env, name, a) {
  a = a && typeof a === "object" ? a : {};
  switch (name) {
    case "get_playback": return await state(env);
    case "list_devices": return { devices: (await devices(env)).map(d => ({ id: d.id, name: d.name, type: d.type, active: d.is_active, restricted: d.is_restricted })) };
    case "play": {
      const uris = Array.isArray(a.uris) ? a.uris.filter(u => URI_RE.test(u)).slice(0, 100) : [];
      const ctx = typeof a.context_uri === "string" && CTX_RE.test(a.context_uri) ? a.context_uri : null;
      if (Array.isArray(a.uris) && a.uris.length && !uris.length) throw new ToolError("No valid track URIs were given.");
      const body = ctx ? { context_uri: ctx } : uris.length ? { uris } : undefined;
      if (body && typeof a.offset_uri === "string" && URI_RE.test(a.offset_uri) && (ctx || uris.includes(a.offset_uri))) body.offset = { uri: a.offset_uri };
      await withDevice(env, devArg(a), d => sp(env, "PUT", "/me/player/play" + qs({ device_id: d }), body));
      const want = body && body.offset ? body.offset.uri : uris[0];
      const s = await confirm(env, s => s.active && s.playing && (!want || s.item_uri === want));
      return { ok: true, confirmed: !!s, state: s || undefined };
    }
    case "pause": {
      await withDevice(env, devArg(a), d => sp(env, "PUT", "/me/player/pause" + qs({ device_id: d })));
      const s = await confirm(env, s => !s.playing);
      return { ok: true, confirmed: !!s, state: s || undefined };
    }
    case "next": case "previous": {
      const before = await state(env).catch(() => ({}));
      await withDevice(env, devArg(a), d => sp(env, "POST", "/me/player/" + name + qs({ device_id: d })));
      const s = await confirm(env, s => s.item_uri !== before.item_uri || (name === "previous" && s.progress_ms < 4000));
      return { ok: true, confirmed: !!s, state: s || undefined };
    }
    case "add_to_queue": {
      const uris = (Array.isArray(a.uris) ? a.uris : []).filter(u => URI_RE.test(u)).slice(0, 20);
      if (!uris.length) throw new ToolError("No valid track URIs were given.");
      let n = 0;
      for (const u of uris) { await withDevice(env, devArg(a), d => sp(env, "POST", "/me/player/queue" + qs({ uri: u, device_id: d }))); n++; }
      return { ok: true, queued: n };
    }
    case "set_shuffle": {
      await withDevice(env, devArg(a), d => sp(env, "PUT", "/me/player/shuffle" + qs({ state: a.state ? "true" : "false", device_id: d })));
      return { ok: true, shuffle: !!a.state };
    }
    case "transfer": {
      const id = devArg(a); if (!id) throw new ToolError("A device_id from list_devices is required.");
      await sp(env, "PUT", "/me/player", { device_ids: [id], play: !!a.play });
      const s = await confirm(env, s => s.device && s.device.id === id);
      return { ok: true, confirmed: !!s, state: s || undefined };
    }
  }
  throw new ToolError("Unknown tool: " + name);
}

/* ---------- MCP (JSON-RPC over Streamable HTTP, JSON responses) ---------- */
async function mcp(req, env) {
  let msg; try { msg = await req.json(); } catch (e) { return rpcErr(null, -32700, "Parse error"); }
  if (Array.isArray(msg)) {
    const out = (await Promise.all(msg.map(m => handle(m, env)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202 });
  }
  const res = await handle(msg, env);
  return res ? json(res) : new Response(null, { status: 202 });
}
const json = (o) => new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });
const rpcErr = (id, code, message) => json({ jsonrpc: "2.0", id, error: { code, message } });
async function handle(m, env) {
  if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") return m && m.id != null ? { jsonrpc: "2.0", id: m.id, error: { code: -32600, message: "Invalid request" } } : null;
  if (m.id == null) return null;   // notifications (e.g. notifications/initialized)
  const ok = result => ({ jsonrpc: "2.0", id: m.id, result });
  switch (m.method) {
    case "initialize": {
      const v = m.params && m.params.protocolVersion;
      return ok({ protocolVersion: VERSIONS.includes(v) ? v : VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: "studio-remote", version: "1.0.0" },
        instructions: "Controls the listener's Spotify playback (play, pause, skip, queue, devices). Use track URIs from Spotify's own search; this server never returns track names or other Spotify content." });
    }
    case "ping": return ok({});
    case "tools/list": return ok({ tools: TOOLS });
    case "tools/call": {
      const p = m.params || {};
      if (!TOOLS.some(t => t.name === p.name)) return { jsonrpc: "2.0", id: m.id, error: { code: -32602, message: "Unknown tool" } };
      try {
        const data = await run(env, p.name, p.arguments);
        return ok({ content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data, isError: false });
      } catch (e) {
        const msg = e instanceof ToolError ? (e.message === "NO_ACTIVE_DEVICE" ? "No active Spotify device. Open Spotify on a device, then try again." : e.message) : "Studio Remote hit an unexpected error.";
        return ok({ content: [{ type: "text", text: msg }], isError: true });
      }
    }
    default: return { jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "Method not found" } };
  }
}
