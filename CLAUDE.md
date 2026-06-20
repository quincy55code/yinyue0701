# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start the server (Node.js v24 at /d/softwa/nodejs/node)
/d/softwa/nodejs/node server.js

# Kill lingering server process (Windows — pkill doesn't work)
taskkill //F //PID <pid>

# Find process on port 8765
netstat -ano | grep 8765
```

No build step, no linter, no test suite. Dependencies are already installed (`node_modules/`).

## Architecture

**Stack:** Node.js Express backend (port 8765) + vanilla HTML/CSS/JS frontend (no framework). The Python `app.py` is a legacy backup — the active backend is `server.js`.

**Data flow:**
```
Browser <audio src="/api/stream/:id">  →  Express server  →  B站 API (view + playurl)  →  B站 CDN (audio/mp4)
```

### Backend (`server.js`)

Two endpoints:
- `GET /api/songs` — returns song metadata (id, title, start/end times, page_duration)
- `GET /api/stream/:songId` — proxies B站 DASH audio. Fetches fresh DASH URL per request (no caching — URLs expire).

Songs are hardcoded in the `SONGS` array with `bvid`, `page`, optional `start_time`/`end_time` (for time segments), and `page_duration` (the B站 page's full duration in seconds — needed because streaming MP4 gives `audio.duration = Infinity`).

**Critical: Range/CORS is handled inline without extra dependencies.** The server forwards `req.headers.range` to B站 CDN so seeking works. It also forwards `Content-Length` from upstream — without it, browsers can't map time→byte offsets and `audio.currentTime = X` silently fails.

### Frontend (vanilla JS IIFE modules)

Three JS files loaded in order: `playlist.js` → `player.js` → `ui.js`. Each is an IIFE returning a singleton object (`PlaylistStore`, `Player`, `UI`). `index.html` bootstraps by fetching `/api/songs` then calling `UI.init(songs)`.

| Module | Responsibility |
|--------|---------------|
| `js/playlist.js` | localStorage CRUD for favorites + custom playlists. Keys: `music_player_favorites` (string[]), `music_player_playlists` ({name, songs}[]). Observer pattern via `onChange()`. |
| `js/player.js` | `<audio>` element lifecycle, play/pause/seek/mode logic. Emits events: `timeupdate`, `duration`, `playState`, `modeChange`, `ended`, `loading`, `error`. `seek()` adds `startTime` offset for segmented songs. |
| `js/ui.js` | All DOM rendering and event delegation. Progress bar uses `click` (not drag). Global `[data-action]` attribute pattern for event handling. |

### CSS (`css/style.css`)

Design system via CSS variables: warm peach `--bg-primary: #F5E6D3`, coral accent `--accent: #E8917B`. Frosted glass player bar (`backdrop-filter: blur`). Per-song color variables (`--song-1` through `--song-4`). Responsive: right panel collapses below 768px.

## Key Gotchas

1. **Seek requires Content-Length.** If the browser doesn't get `Content-Length` in the initial 200 response, it can't derive byte ranges for time positions. Always ensure `server.js` forwards upstream `content-length`. Songs with time segments (离别开出花) work around this because the initial `audio.currentTime = startTime` triggers an abort+retry with Range before data streams.

2. **`audio.duration` is Infinity for streamed MP4.** The player uses `page_duration` from B站 as fallback. When adding new songs, include `page_duration` in the `SONGS` config.

3. **B站 DASH audio URLs are temporary.** Never cache them — fetch fresh per request. Use `fnval=16` for DASH format, sort audio streams by bandwidth descending for best quality.

4. **Windows environment.** Node.js is at `/d/softwa/nodejs/node` (not in PATH as `node`). Use `taskkill //F //PID <pid>` to kill processes (not Unix `pkill`). Chinese directory names break `npm init` — write `package.json` manually.

5. **`express.static(__dirname)` serves the frontend.** The server doubles as a static file server — no separate web server needed.
