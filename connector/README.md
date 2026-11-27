# Studio Remote connector

A personal remote MCP server, hosted as a Cloudflare Worker on the free plan. It lets the Claude-hosted Studio DJ press play, pause, skip and add to your Spotify queue. It only sends playback commands and returns playback state; it never returns song names or other Spotify content to Claude.

Setup takes about 15 minutes, in a browser:
1. Cloudflare → Workers & Pages → Create → Worker named `studio-remote` → Deploy → Edit code → paste `worker.js` → Deploy.
2. Storage & Databases → KV → create namespace `studio-remote`. Then on the Worker: Settings → Bindings → add KV namespace with variable name `KV`.
3. Worker → Settings → Variables and Secrets: add `SPOTIFY_CLIENT_ID` (text, the same Client ID Studio uses) and `CONNECTOR_KEY` (secret, a random string of at least 24 characters).
4. Spotify developer dashboard → your app → Settings → Redirect URIs: add `https://studio-remote.<your-subdomain>.workers.dev/callback`.
5. Open `https://studio-remote.<your-subdomain>.workers.dev/setup?key=<CONNECTOR_KEY>` and approve.
6. In Claude → Settings → Connectors → Add custom connector: name **Studio Remote**, URL `https://studio-remote.<your-subdomain>.workers.dev/mcp/<CONNECTOR_KEY>`.

`node test.mjs` runs the local test suite against a simulated Spotify.
