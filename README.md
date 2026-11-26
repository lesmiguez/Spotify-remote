# Spotify Studio

One web app for Spotify: playback control without opening the Spotify app, real listening analytics (top artists and tracks, genres, listening by hour), discovery, a vault of your oldest saved songs, and a DJ that builds playlists and saves them to Spotify. It talks to Spotify's Web API directly using Authorization Code with PKCE. There is no server and no backend, and no secret is stored anywhere.

Requires Spotify Premium.

Design: **Studio One** (Carbon, Emerald, Canvas, Porcelain, Slate). Light by default, Dark or Automatic in Settings. Bottom tab bar and mini-player when folded; compact sidebar, multi-panel pages and a persistent now-playing panel on wide screens. Optional ambient mode (full-screen artwork, keeps the screen awake where supported).

## How "without opening the app" works

The page sends commands to a Spotify device on your account (your phone's Spotify app, a speaker, a computer). The Spotify app on your phone must have been opened and played something recently so it shows up as a device. After that, this page controls it and does not bring the app to the foreground.

Limits:
- iPhones do not let the Web API change volume. The volume slider is disabled for phones. Use the side buttons.
- If the phone's Spotify app has been closed for a while it can drop off the device list. Open it, play a song for a second, return here, tap Refresh in the device sheet.

## Setup (about 10 minutes)

### 1. Create a Spotify developer app
Environment: a web browser on any computer or your phone.

1. Go to https://developer.spotify.com/dashboard and sign in with your Premium account.
2. Click **Create app**.
3. App name: `Spotify Remote`. Description: anything.
4. **Redirect URI**: leave empty for now, you will add it in step 3.
5. Under "Which API/SDKs are you planning to use?" tick **Web API**.
6. Accept the terms and click **Save**.
7. Open the app, click **Settings**, and copy the **Client ID** (32 characters). You do not need the Client Secret and should never paste it anywhere.

### 2. Host the files over HTTPS
Spotify requires an HTTPS redirect address. Easiest free option is GitHub Pages.

Environment: github.com in a browser.

1. Create a new **public** repository named `spotify-remote`.
2. Click **Add file → Upload files** and upload everything in this folder: `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icon.svg`, `icon-180.png`, `icon-512.png`. Commit.
3. Repository **Settings → Pages**. Source: **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
4. After about a minute the page shows your address, like `https://YOURNAME.github.io/spotify-remote/`.

Any static host that serves HTTPS works too (Netlify, Cloudflare Pages).

### 3. Register the redirect address
1. Open your page's address in Safari. The setup screen shows a **Redirect URI**. Tap **Copy**.
2. Back in the Spotify dashboard: your app → **Settings → Redirect URIs**, paste it, click **Add**, then **Save**.
   It must match exactly, including the trailing slash.

### 4. Connect
1. In Safari on the iPhone, open your page's address.
2. Paste the Client ID and tap **Connect to Spotify**.
3. Approve the permissions. You return to the page.
4. Tap the device chip at the top and pick your phone.

### 5. Put it on your Home Screen
In Safari tap **Share → Add to Home Screen**. It then opens full screen like an app.

## Notes
- Development-mode Spotify apps only work for accounts you add under **User Management** in the dashboard. Your own account is the owner, so you are covered.
- Tokens live in this browser's local storage on your device. **Sign out** (three-dot menu) clears them. Revoke access any time at https://www.spotify.com/account/apps/
- Scopes requested: playback state and control, currently playing, account type, top items, recently played, library read/write (Save buttons), and private playlist creation. Nothing else.
- Spotify only shares your 50 most recent plays, so the hour-of-day and recent-days charts are a sample, not full history.
- Spotify removed recommendation tools for new apps, so the DJ builds mixes from genre search and your chosen artists.
- If you used an earlier version, the app asks you to reconnect once to approve the new permissions.
- The page only contacts `api.spotify.com` and `accounts.spotify.com` (enforced by a Content Security Policy in `index.html`).
- Not tested against live Spotify when this was written; report anything odd.

## Playback engine (v2.2)

All playback goes through one `PlaybackController` in `app.js`:
- **One state store.** The home player, mini-player, expanded player, docked panel and ambient mode all render from the same state.
- **Confirmed state only from Spotify.** It comes only from `GET /me/player`. Responses that arrive out of order, or that started before a newer command was sent, are discarded.
- **Serialized commands.** Commands are sent one at a time, because Spotify does not guarantee ordering across Player endpoints. Every command names the target `device_id`.
- **Pending vs confirmed.** Taps take effect on screen immediately and are marked pending until a bounded back-off check (about 6 seconds max) confirms them. If Spotify ends up somewhere else, Spotify's state wins.
- **Previous** restarts the track after the first 3 seconds, like the Spotify app.
- **Lists keep their context.** Albums and playlists play in their own context from the selected track. Other lists (search, top tracks, recents, Vault, DJ, Liked Songs rows) play the visible list from the selected track.
- **Errors and limits.** 429 `Retry-After` pauses all requests. An expired token is refreshed once. Network loss, inactive devices (falls back to the last used device), restricted devices and Spotify's `disallows` are all handled.
- **Foreground return.** Reopening the app, returning to it, or coming back online resyncs immediately.
- **Diagnostics.** Settings → Playback diagnostics shows the device, context, shuffle/repeat, last command and sync latency. It never shows tokens.

Spotify API limits that still apply: no reordering or removal in the queue, the queue endpoint can be approximate, no Smart Shuffle control, and offsets are documented only for albums and playlists.

## Studio 3.0

- **Navigation:** Home, Search, Library, Insights, Modes (configurable in Settings; Settings lives behind the avatar on phones and in the sidebar on wide screens). Search is also one tap away in every header (`/` or ⌘K on a keyboard).
- **Search:** one request per query returns songs, artists, albums and playlists (Spotify allows 10 per type for personal apps), plus matches from your own library. Recent searches stay on the device.
- **Library:** playlists, albums, artists and Liked Songs with A–Z / creator / recent sort, on-device pins (shown first and on Home), artist pages (catalog songs + releases), and the former Vault inside Liked Songs (newest, oldest, by year, surprise).
- **Track menu:** play, queue, add to playlist (only playlists you own or collaborate on), save/remove from Liked Songs, go to album/artist, copy link, open in Spotify.
- **Modes:** Drive, Focus, Discover, Relax — each a saved recipe of music source, shuffle, repeat, stop timer and keep-awake. Timers and keep-awake run inside Studio, so they only work while it stays open. The mix builder lives on the same screen.
- **Insights:** optional on-device history. Spotify only exposes the last 50 plays, so Studio records what it sees (IDs, names, a small artwork URL, time, length) for 90 days, never uploads it, flags detected gaps, and deletes it on sign-out or from Settings. Spotify's own top artists/tracks remain separately labelled.
- **Performance:** library lists and top artists render from a short-lived local cache (max 12 hours, cleared on sign-out) and refresh in the background; the playlist list is prefetched when idle.

## Claude DJ (3.1)

The DJ runs as a **Claude-hosted artifact** ("Studio DJ", linked from Modes → Claude DJ), not on GitHub Pages:

- **Claude Sonnet on your Claude plan.** AI-powered artifacts call Claude with the viewer's own subscription allowance; there is no API key and nothing is billed separately. GitHub Pages has no supported way to do this (that would require the paid API).
- **Spotify's official Claude connector supplies the taste data** (search, recommendations, listening history, library). Studio's own Spotify connection never sends anything to Claude, because Spotify's Developer Policy (III.14) prohibits ingesting Spotify Content from an app's Web API into an AI model.
- **Memory** (loves, not for me, never play, moments, notes; discovery, energy and autonomy sliders) is stored privately for your Claude account in the artifact's database, and is editable on the page.
- **Playback:** the connector can't start playback, and artifacts can't call the Web API. So the DJ hands Studio a set as `#dj=<base64url JSON>` (Play in Studio / Add to queue) or via the clipboard (Copy for app → Studio → Paste set). Studio validates the track IDs and plays them through the same playback engine.
- `tests/djtest.py` covers the Studio side: link, cold start, queue mode, paste, hostile payloads, and the signed-out hand-off.
