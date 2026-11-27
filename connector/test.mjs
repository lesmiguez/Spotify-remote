// Local test: runs the Worker with an in-memory KV and a simulated Spotify API.
import worker from "./worker.js";
const KEY = "k".repeat(32), store = new Map();
const env = { CONNECTOR_KEY: KEY, SPOTIFY_CLIENT_ID: "cid", KV: { get: async k => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); }, delete: async k => { store.delete(k); } } };
const sp = { playing: false, item: "spotify:track:AAAAAAAAAAAAAAAAAAAAAA", active: true, queue: [], calls: [], tokenCalls: 0 };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  url = String(url); const m = init.method || "GET";
  if (url.startsWith("https://accounts.spotify.com/api/token")) {
    sp.tokenCalls++; const b = new URLSearchParams(init.body);
    if (b.get("grant_type") === "authorization_code") return new Response(JSON.stringify({ access_token: "at1", refresh_token: "rt1", expires_in: 3600 }));
    return new Response(JSON.stringify({ access_token: "at2", refresh_token: "rt2", expires_in: 3600 }));
  }
  const u = new URL(url); sp.calls.push(m + " " + u.pathname + u.search);
  if (!sp.active && !u.searchParams.get("device_id") && m !== "GET") return new Response(JSON.stringify({ error: { status: 404, message: "No active device", reason: "NO_ACTIVE_DEVICE" } }), { status: 404 });
  if (u.pathname === "/v1/me/player" && m === "GET") return sp.active ? new Response(JSON.stringify({ is_playing: sp.playing, item: { uri: sp.item, duration_ms: 1e5, name: "SECRET TRACK NAME" }, progress_ms: 1000, shuffle_state: false, repeat_state: "off", device: { id: "d1", name: "Les’s iPhone", type: "Smartphone", volume_percent: 50 } })) : new Response(null, { status: 204 });
  if (u.pathname === "/v1/me/player/devices") return new Response(JSON.stringify({ devices: [{ id: "d1", name: "Les’s iPhone", type: "Smartphone", is_active: false }] }));
  if (u.pathname === "/v1/me/player/play") { const b = init.body ? JSON.parse(init.body) : null; sp.active = true; sp.playing = true; if (b && b.uris) sp.item = b.offset ? b.offset.uri : b.uris[0]; return new Response(null, { status: 204 }); }
  if (u.pathname === "/v1/me/player/pause") { sp.playing = false; return new Response(null, { status: 204 }); }
  if (u.pathname === "/v1/me/player/next") { sp.item = "spotify:track:BBBBBBBBBBBBBBBBBBBBBB"; return new Response(null, { status: 204 }); }
  if (u.pathname === "/v1/me/player/queue") { sp.queue.push(u.searchParams.get("uri")); return new Response(null, { status: 204 }); }
  return new Response("{}", { status: 404 });
};
let pass = 0, fail = 0; const check = (n, ok, info) => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (ok ? "" : " -> " + JSON.stringify(info))); };
const call = (body, path = "/mcp", auth = "Bearer " + KEY) => worker.fetch(new Request("https://sr.example.workers.dev" + path, { method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) }, body: JSON.stringify(body) }), env);
const tool = async (name, args) => (await (await call({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: args } })).json()).result;

check("rejects requests without the key", (await call({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "/mcp", null)).status === 401);
check("rejects a wrong key", (await call({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "/mcp", "Bearer " + "x".repeat(32))).status === 401);
check("accepts the key in the path", (await call({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "/mcp/" + KEY, null)).status === 200);
const init = await (await call({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } })).json();
check("initialize negotiates the protocol version", init.result.protocolVersion === "2025-06-18" && init.result.capabilities.tools);
check("notification returns 202", (await call({ jsonrpc: "2.0", method: "notifications/initialized" })).status === 202);
const list = await (await call({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
check("lists 9 tools", list.result.tools.length === 9, list.result.tools.map(t => t.name));
// setup flow
const s1 = await worker.fetch(new Request("https://sr.example.workers.dev/setup?key=" + KEY), env);
const loc = new URL(s1.headers.get("Location")); const state = loc.searchParams.get("state");
check("setup redirects to Spotify with PKCE and the callback URL", s1.status === 302 && loc.host === "accounts.spotify.com" && loc.searchParams.get("code_challenge_method") === "S256" && loc.searchParams.get("redirect_uri") === "https://sr.example.workers.dev/callback");
check("setup refuses without the key", (await worker.fetch(new Request("https://sr.example.workers.dev/setup?key=nope"), env)).status === 401);
const cb = await worker.fetch(new Request("https://sr.example.workers.dev/callback?code=abc&state=" + state), env);
check("callback stores the refresh token", cb.status === 200 && store.get("refresh") === "rt1");
check("callback can't be replayed", (await worker.fetch(new Request("https://sr.example.workers.dev/callback?code=abc&state=" + state), env)).status === 400);
// tools
let r = await tool("play", { uris: ["spotify:track:CCCCCCCCCCCCCCCCCCCCCC", "spotify:track:DDDDDDDDDDDDDDDDDDDDDD"] });
check("play starts the list and confirms the first song", !r.isError && r.structuredContent.confirmed && sp.item === "spotify:track:CCCCCCCCCCCCCCCCCCCCCC", r);
r = await tool("play", { uris: ["spotify:track:CCCCCCCCCCCCCCCCCCCCCC", "spotify:track:DDDDDDDDDDDDDDDDDDDDDD"], offset_uri: "spotify:track:DDDDDDDDDDDDDDDDDDDDDD" });
check("play from a chosen song", sp.item === "spotify:track:DDDDDDDDDDDDDDDDDDDDDD" && r.structuredContent.confirmed);
r = await tool("pause", {}); check("pause confirmed", r.structuredContent.confirmed && !sp.playing);
r = await tool("next", {}); check("next confirmed", r.structuredContent.confirmed);
r = await tool("add_to_queue", { uris: ["spotify:track:EEEEEEEEEEEEEEEEEEEEEE", "bad", "spotify:track:FFFFFFFFFFFFFFFFFFFFFF"] });
check("queue adds valid URIs in order, drops invalid", r.structuredContent.queued === 2 && sp.queue.join() === "spotify:track:EEEEEEEEEEEEEEEEEEEEEE,spotify:track:FFFFFFFFFFFFFFFFFFFFFF", r);
r = await tool("get_playback", {}); check("state never includes track names (Spotify content)", !JSON.stringify(r).includes("SECRET TRACK NAME") && r.structuredContent.device.name);
sp.active = false; sp.playing = false;
r = await tool("play", { uris: ["spotify:track:CCCCCCCCCCCCCCCCCCCCCC"] });
check("no active device: falls back to the available phone", !r.isError && sp.calls.some(c => c.includes("device_id=d1")), sp.calls.slice(-4));
r = await tool("play", { uris: ["javascript:alert(1)"] }); check("rejects invalid URIs", r.isError);
store.set("access", JSON.stringify({ t: "old", exp: 0 })); const before = sp.tokenCalls;
await tool("get_playback", {}); check("refreshes an expired token and stores the rotated refresh token", sp.tokenCalls === before + 1 && store.get("refresh") === "rt2");
check("unknown method → JSON-RPC error", (await (await call({ jsonrpc: "2.0", id: 3, method: "nope" })).json()).error.code === -32601);
console.log(`\n${pass}/${pass + fail} connector checks passed`);
