# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Brand

This project is a Chinese / multi-language music streaming web app with song collections, lyrics syncing, blog notes, reviews, and social features. It sources audio from Bilibili (B站) DASH streams and stores metadata in Supabase PostgreSQL.

## Commands

```bash
# Start the server (Node.js v24 at /d/softwa/nodejs/node)
/d/softwa/nodejs/node server.js

# Start with production optimizations (compression, helmet, rate limiting)
ALLOWED_ORIGIN=http://localhost:8765 /d/softwa/nodejs/node server.js

# Kill lingering server process (Windows — pkill doesn't work)
taskkill //F //PID <pid>

# Find process on port 8765
netstat -ano | grep 8765

# ---- Data import & maintenance scripts ----

# Batch import new songs from B站 compilations (reads scripts/video_list.json)
/d/softwa/nodejs/node scripts/import_songs.js

# Run lyrics auto-matching script (fetches LRC from lrclib.net)
/d/softwa/nodejs/node scripts/fetch_lyrics.js

# Improved lyrics refetch with candidate scoring (runs after verify_lyrics_audio.py --fix clears wrong lyrics)
/d/softwa/nodejs/node scripts/refetch_lyrics_v2.js

# Refetch specific songs by ID (comma-separated, no spaces)
/d/softwa/nodejs/node scripts/refetch_lyrics_v2.js --ids=1,2,3

# Detect potentially wrong lyrics (heuristic: AI-generated, truncated, title mismatch)
/d/softwa/nodejs/node scripts/detect_wrong_lyrics.js

# Setup tags tables + initial data (needs DB password, direct pg connection)
/d/softwa/nodejs/node scripts/setup_tags.js <DB_PASSWORD>

# Setup verification_codes table + avatar_url column (reads password from .superpowers/db_pass.txt)
/d/softwa/nodejs/node scripts/setup_verification_codes.js

# Setup collections tables + seed data (reads password from .superpowers/db_pass.txt)
/d/softwa/nodejs/node scripts/setup_collections.js

# Batch map songs to tags (uses Supabase REST API, service_role key)
/d/softwa/nodejs/node scripts/map_tags.js

# ---- Cover image scripts ----

# Refresh B站 CDN cover URLs (fetches fresh pic from B站 API, batched by bvid)
/d/softwa/nodejs/node scripts/fetch_bilibili_covers.js

# Replace B站 CDN covers with iTunes high-res (600x600) artwork
/d/softwa/nodejs/node scripts/fetch_covers.js

# Download Unsplash background images for tag category cards → public/images/tags/
/d/softwa/nodejs/node scripts/download_tag_bg.js

# ---- Lyrics batch pipeline ----

# Full batch: fetch LRC from lrclib + 网易云 for all songs missing lyrics
/d/softwa/nodejs/node scripts/batch_lyrics_pipeline.js --mode=online

# Retry failed songs with smart fixes (swap detection, name cleanup)
/d/softwa/nodejs/node scripts/retry_failed_lyrics.js

# Scrape Chinese lyric sites (kugeci.com, 9ku.com) for hard-to-find songs
python scripts/kugeci_lrc_fetcher.py

# Improved kugeci batch fetch (fixes &nbsp; encoding, table-based result parsing)
python scripts/kugeci_batch_fetch.py

# Whispers batch: download B站 audio → faster-whisper → upload LRC (for songs with NO online lyrics)
python scripts/whisper_batch.py --model=small [--limit=N]

# Calibrate existing LRC: re-timestamp lyrics against actual B站 audio via whisper
python scripts/calibrate_lyrics.py --model=small [--limit=N] [--offset=N]

# ---- Data repair scripts ----

# Fill empty singer fields using known mappings + database matching
/d/softwa/nodejs/node scripts/fill_singers.js [--dry-run]

# Fix swapped title/singer (B站合集格式不一致导致) — 智能检测 + 逐首修复
/d/softwa/nodejs/node scripts/fix_swapped_songs.js --verify    # 仅验证
/d/softwa/nodejs/node scripts/fix_swapped_songs.js --dry-run   # 预览
/d/softwa/nodejs/node scripts/fix_swapped_songs.js             # 执行修复

# npx supabase CLI (for DB migrations; needs linked project or --db-url + password)
npx supabase --version
```

**Supabase REST API (DML only — SELECT/INSERT/UPDATE/DELETE):**
```bash
SERVICE_KEY="<SUPABASE_SERVICE_ROLE_KEY>"
# Query
curl -s "https://orphftlwdwuvoscizndx.supabase.co/rest/v1/songs?select=*&limit=5" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
# Insert
curl -s -X POST "https://orphftlwdwuvoscizndx.supabase.co/rest/v1/songs" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"title":"...","bvid":"...",...}'
# PATCH (update)
curl -s -X PATCH "https://orphftlwdwuvoscizndx.supabase.co/rest/v1/songs?id=eq.1" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"lrc_text":"[00:00.00]..."}'
```

**DDL (ALTER TABLE, CREATE TABLE, etc.) requires Supabase SQL Editor.** PostgREST only does DML. Management API needs a PAT (Personal Access Token), not the service_role key. The `npx supabase db push` approach needs the database password. Simplest path: open https://supabase.com/dashboard/project/orphftlwdwuvoscizndx/sql/new and paste the SQL.

No build step, no linter, no test suite. Dependencies are already installed (`node_modules/`).

## Architecture

**Stack:** Node.js Express backend (port 8765) + vanilla HTML/CSS/JS frontend (no framework). Database is Supabase PostgreSQL (`orphftlwdwuvoscizndx.supabase.co`). The Python `app.py` is a legacy backup — the active backend is `server.js`.

**Data flow:**
```
Browser <audio src="/api/stream/:id"> → Express → B站 API (view + playurl) → B站 CDN (audio/mp4)
Browser fetch('/api/songs' | '/api/search') → Express → @supabase/supabase-js → Supabase PostgreSQL
Browser fetch('favorites' | '/api/playlists/...') → Express (authMiddleware) → supabaseAdmin → Supabase PostgreSQL
Browser fetch('/api/lyrics/:songId') → Express → supabase → Supabase PostgreSQL
Lyrics popup (lyrics.html) ⬌ BroadcastChannel('music_player_lyrics') ⬌ Main window (player.js + ui.js)
Embedded lyrics panel ← Player.on() timeupdate/loading events ← Main window (ui.js direct DOM sync)
```

### Frontend (vanilla JS IIFE modules)

Five JS files loaded in order in `index.html`: `js/auth.js` → `js/playlist.js` → `js/player.js` → `js/ui.js`. Each returns a singleton. `index.html` bootstraps by fetching `/api/songs` + `/api/tags` in parallel, then calling `UI.init(songs, tags)`.

**HTML layout** — CSS Grid `.app-layout` (sidebar 240px | content 1fr) + `.player-bar` (72px fixed bottom):
- `nav.sidebar` — 240px frosted-glass sidebar with nav items, tag shortcuts, user area (auth avatar/button)
- `header.top-bar` — 48px bar with centered search input (capsule-shaped, max 480px)
- `main.content-area` — scrollable content area: song cover grids, tag grids, homepage sections, note detail
- `footer.player-bar` — 72px frosted-glass: cover thumbnail (48px) | meta | controls + progress | volume
- `.now-playing-overlay` — full-screen immersive view (280px cover art, blurred backdrop, large controls)
- `.lyrics-panel` — `position: fixed` overlay (right side, 380px), slides in via `.open` class. Syncs via `Player.on()`. Must stay at `.app-layout` root — `position: fixed`, not inside `.content-wrapper`.
- **Homepage sections**: `.home-hero` (300px Hero Banner with blur+gradient), `.notes-hscroll` (横滑 Bento cards), `.recommended-scroll` (recommended songs horizontal scroll), `.comment-feed-list` (recent comments)

| Module | Responsibility |
|--------|---------------|
| `js/auth.js` | JWT-based auth (email verification code + password). Email-first flow: `checkEmail(email)` → decide password/register. Custom JWT signing local verify. Observer pattern via `onChange()`. Provides `getAuthHeaders()`. |
| `js/playlist.js` | Favorites + playlist CRUD with **optimistic local cache**. `getFavorites()`/`getPlaylists()` are **synchronous** (return local cache). Mutation updates cache instantly + `notify()` → UI refresh, then sends network request asynchronously. On failure, rolls back by re-fetching. |
| `js/player.js` | `<audio>` lifecycle, play/pause/seek/mode. `seek()` handles `startTime` offset for segmented songs. Fallback seek: fast-forward at 8x muted if Range unsupported. Pushes `time-update`/`song-change` to `music_player_lyrics` BroadcastChannel. **`playSongById()` does NOT exist here** — it's in `ui.js`. |
| `js/ui.js` | All DOM rendering + event delegation. **Homepage** (2026-07-03): `renderNewHome()` with Hero Banner + recent notes hscroll + recommended songs + recent comments. Staggered entrance animations. **Comments**: `appendComments(noteId)`, `renderMarkdown()` supports `[song:ID]` embedding. **Navigation**: sidebar buttons (`data-nav`) switch views. **`playSongById(songId)`** — async wrapper that fetches song cache on miss. |
| `js/lyrics.js` | Runs in standalone `lyrics.html` popup only. Parses LRC (`parseLRC()`), binary search sync (`syncTime()`), two modes: vertical (scrollable 10 lines) and horizontal (2 centered lines). Draggable title bar. Communicates via BroadcastChannel. Embedded panel in `ui.js` has its own independent implementation (`parseLRCEmbedded()`) — they share NO code. |

**Event flow for mutations (critical):**
```
User clicks fav → PlaylistStore.toggleFavorite(sid)
  → optimistic cache update → notify() → onChange callback → refreshAll()
  → background: fetch POST/DELETE → if failed → rollback cache + notify()
```
**Do NOT call `refreshAll()` explicitly after mutation methods** — `onChange` handles it.

**Global `window._songCache`** — OBJECT `{id: song}`, NOT an array. Use `cache[s.id]` or `Object.values(cache).find()`, never `.find()` on the object (crashes with `TypeError`).

### Navigation State Machine

```
'home' ──→ 'collection' ──→ 'collection-items' ──→ 'collection-songs'
                               (goBack → coll)      (goBack → items)
         ──→ 'favorites'  ──→ goBack → home
         ──→ 'playlists'  ──→ 'playlist-songs'
                               (goBack → playlists)
         ──→ 'search'     ──→ goBack → home
         ──→ 'notes'      ──→ 'note-detail'
                               (goBack → notes or home)
```

`[data-action]` event delegation handles all navigation. Sidebar shortcuts map via `navigateToCollectionBySlug()`. `goBack()` restores previous view based on `_currentView` state.

### Backend (`server.js`)

Two Supabase clients:
- `supabase` (anon key) — public read endpoints: `/api/songs`, `/api/search`, `/api/tags`
- `supabaseAdmin` (service_role key) — auth-protected endpoints (favorites, playlists, auth). Bypasses RLS.

**Key server-side functions:**
- `formatSong(s)` — DB snake_case → frontend camelCase. **MUST use `??` (not `||`)** for numeric fields like `duration_seconds`.
- `attachTags(songs)` — batch-attaches tag names (2 queries, not N+1).
- `attachSongsData(notes)` — resolves `song_ids INTEGER[]` to full song objects for blog notes.

**Auth endpoints** — email verification code + password login/reset. Custom JWT signing with `crypto.createHmac('sha256', JWT_SECRET)`. `issueSession()` generates access_token (1h) + refresh_token (7d). Verification code login no longer overwrites passwords.

**Song & tag endpoints:**
- `GET /api/songs?tag=&bvid=&limit=` — max 300, includes `tags` array via `attachTags()`
- `GET /api/search?q=` — fuzzy search via PostgREST `ilike`, limit 20
- `GET /api/tags` — tag tree with parent/child hierarchy and `song_count`
- `GET /api/collections` — 12 categories + ~53 sub-tags with bvid
- `GET /api/stream/:songId` — proxies B站 DASH audio (fresh per request, fnval=16)
- `GET /api/lyrics/:songId` — returns `{ songId, title, singer, lrc_text }`

**Notes (blog) endpoints** — all behind `authMiddleware` + `requireAdmin` for mutations:
- `GET /api/notes` — published notes with pagination
- `GET /api/notes/:id` — note detail with `songs_data`
- `GET /api/notes/admin/list` — all notes including drafts
- `POST /api/notes` / `PUT /api/notes/:id` / `DELETE /api/notes/:id` — CRUD
- `POST /api/notes/:id/set-daily` — toggle daily recommendation

**Homepage & Comments:**
- `GET /api/home` — aggregates Hero (latest daily_recommend) + recent notes + recommended songs + recent comments
- `GET /api/notes/:id/comments` — public, includes user profiles
- `POST /api/notes/:id/comments` — auth required
- `DELETE /api/comments/:id` — auth + ownership check

**Reviews** (short reviews on songs):
- `GET /api/reviews?songId=` — public reviews for a song
- `POST /api/reviews` — auth required
- `DELETE /api/reviews/:id` — auth + ownership

**Performance optimizations:** compression (gzip, ~82% reduction), helmet + CORS, rate limiting (global 100/min, auth 5/min, stream 60/min), static files caching (JS/CSS 7d, images 30d), in-memory API cache (5min for `/api/collections`), `content-visibility: auto` on cards, `will-change: transform` on animated elements, `decoding="async"` on images, `mergeToCache()` LRU at 1000 entries, `fetchWithDedup()` AbortController dedup, `_lyricsCache` max 50, rAF-debounced `refreshAll()`, 500ms debounce `saveLrcOffset()`.

**Performance hot paths (already optimized):**
- `authMiddleware` — local JWT verify with `crypto.createHmac` + `timingSafeEqual` (~0ms vs 200-500ms)
- `POST /api/playlists/:id/songs` — `Promise.all` for ownership verify + upsert (2 parallel vs 4 serial)
- `/api/home` — `Promise.all` for parallel queries (Hero, notes, songs, comments)

**Performance pitfalls to avoid:**
- Every new endpoint should use the existing `attachTags()` helper, not manual N+1 loops
- Comment/song resolution in `/api/home` already batches via noteMap/userMap/songMap — follow this pattern
- Don't add new N+1 queries where batch fetch ( `.in('id', ids)`) suffices
- Avoid blocking the event loop in rate-limited endpoints (auth, stream)

## Adding a Song

**Preferred: Use `import_songs.js` for batch imports from B站 compilations.**
1. Add the BV号 to `scripts/video_list.json` (JSON array of strings)
2. Run `/d/softwa/nodejs/node scripts/import_songs.js`
3. Run `/d/softwa/nodejs/node scripts/fix_swapped_songs.js --verify`
4. If swaps detected, run `/d/softwa/nodejs/node scripts/fix_swapped_songs.js` to fix
5. Then run `map_tags.js` and `fetch_lyrics.js` in sequence

**Manual single-song insert via REST API:** See Supabase REST API examples in Commands section.

## Lyrics Calibration Workflow

**⚠️ 校准质量不可靠，大规模使用前必须小批量测试！**

```bash
# Test first 10
python scripts/calibrate_lyrics.py --limit=10 --model=small

# Full calibration
python scripts/calibrate_lyrics.py --model=small --limit=1000

# Resume from offset
python scripts/calibrate_lyrics.py --offset=100 --limit=500
```

**How it works:** Extract plain lyrics → download B站 DASH audio → faster-whisper → match → upload with `[by:lyrics-calibrator]` marker.

**Known risks:** `match_lyrics_to_segments()` uses uniform distribution when whisper segments ≠ lyric lines. **No backup** — rollback requires re-fetching from online sources. Some compilations return full audio even with page-specific CID.

**Monitoring (Windows):** `ls ~/Desktop/单首歌词/calibrate_output/*_calibrated.lrc | wc -l`
**Rate:** ~2-5 min/song. Incorrect `page`/`duration_seconds` → 20-30 min each.

## Key Gotchas (按主题分组)

### 网络 & B站 API
1. **Seek requires Content-Length.** The server MUST forward B站 upstream `content-length`.
2. **`audio.duration` is Infinity for streamed MP4.** Player uses `duration_seconds` (camelCase: `pageDuration`) as fallback.
3. **B站 DASH audio URLs are temporary.** Never cache — fetch fresh per request with `fnval=16`.
4. **B站合集格式不一致 → title/singer 互换。** `import_songs.js` 假设 `歌名 - 歌手`，但部分合集用 `歌手 - 歌名`。每次导入后必须运行 `fix_swapped_songs.js --verify`。[[title-singer-swap-fix]]
5. **163 SMTP uses direct IP** (`117.135.214.13`) to bypass DNS hijacking (`smtp.163.com` resolves to bogus IP). If SMTP fails, recheck with `nslookup` from clean network.
6. **英文歌曲搜索要用英文名。** lrclib/网易云对中文译名匹配很差。
7. **歌词搜索来源优先级**: ① Lrclib.net ② 网易云音乐 API ③ kugeci.com

### Windows 环境
8. **Node.js path:** `/d/softwa/nodejs/node` (not in PATH as `node`). Use `taskkill //F //PID` for Windows. Bash is Git Bash — forward slashes.
9. **Python:** `print()` 不能用 emoji（GBK终端），用 `[OK]`/`[FAIL]`/`[SKIP]`。后台运行时 stdout 全缓冲，用 `python -u`。
10. **`fix_swapped_songs.js` 不是一次性脚本** — 每次导入新 BV 后都应运行 `--verify`。

### Supabase & 数据库
11. **Supabase `.env` is required.** All 5 vars must be present. No `dotenv` — manual parser reads `.env`.
12. **PostgREST DML-only.** DDL requires Supabase SQL Editor or direct pg connection.
13. **`formatSong()` MUST use `??`** (not `||`) for numeric fields — `0` is a valid duration.
14. **Supabase PATCH returns 204, not 200.** Python scripts must check `status in (200, 201, 204)`.
15. **`authMiddleware` 本地 JWT 验签 + Supabase fallback**: `crypto.createHmac('sha256', JWT_SECRET)` first, then `supabase.auth.getUser(token)` remote.
16. **`POST /api/playlists/:id/songs` 并行化**: ownership verify + upsert in `Promise.all`.

### 前端渲染 & 事件
17. **Do NOT call `refreshAll()` after mutation methods** — `onChange` → `refreshAll` already handles it.
18. **`window._songCache` is OBJECT `{id: song}`, NOT array.** Use `cache[id]` or `Object.values(cache).find()`.
19. **`formatTime(sec)` must handle `0`**: check `sec == null || !isFinite(sec)`, NOT `!sec`.
20. **`.content-wrapper` MUST have `overflow: hidden`.** If `visible`, content covers `.player-bar`.
21. **`.lyrics-panel` must stay at `.app-layout` root** as `position: fixed` — not inside `.content-wrapper`.
22. **Search input autocapture defense**: `<form autocomplete="off">` + hidden email trap + `type="search"`. All `<button>` elements need `type="button"`.
23. **Auth modal uses email-first flow**: `email` → `password` / `register` / `resetPassword`.
24. **Collection item clickability uses `bvid`, not `song_count`.** `bvid=NULL` items (主题歌单) are non-clickable.
25. **`window.open()` for lyrics popout must NOT use `noopener`** — breaks window name reuse.
26. **`initDragScroll()` 的 `dragging` 类只能在真实拖动（移动 >5px）后添加。** 不能提前加，否则 CSS `pointer-events: none` 阻止点击。2026-07-04 已修复。
27. **推荐歌曲播放**: `renderRecommendedSection()` sets `window._currentSongs`; `play-recommended` uses `data-song-index` from that array, not `_songCache`.

### 歌词 & BroadcastChannel
28. **BroadcastChannel name is `music_player_lyrics`.** Both windows must match.
29. **Messages from popup are objects** (`{ type: 'lyrics-closed' }`), not raw strings.
30. **`currentTime` in lyrics messages is display time** (subtracted `startTime` for segmented songs).
31. **Embedded lyrics panel (ui.js) ≠ lyrics popup (lyrics.js)** — two independent implementations, no shared code. Embedded syncs via `Player.on()`; popup uses BroadcastChannel.
32. **`Player.on()` `timeupdate` uses `displayDuration`, not `totalDuration`.**
33. **`calibrate_lyrics.py` 不备份原始 LRC** — 覆盖后只能重抓在线源恢复。大规模使用前必须先 10 首测试。
34. **手动纠正歌词**: 直接 PATCH `lrc_text`/`singer` 字段，无需重新运行抓取脚本。

### 脚本 & 数据维护
35. **`refetch_lyrics_v2.js` 维护 `scripts/skip_ids.json`** — 重抓前必须从该文件移除对应 ID。
36. **`setup_collections.js` `executeSQL()`**: DDL files MUST NOT have `--` comment lines before the first statement.
37. **Verification code login no longer overwrites passwords** (`issueSession()` for existing users).
38. **`express.static(__dirname)` serves the frontend** — no separate web server.

### ECS & 阿里云 ASR
39. **ECS Supabase key**: inject via `/tmp/key_b64.txt` (base64) in wrapper script; don't pass JWT in SSH.
40. **ASR 网关 URL**: `https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/asr` (not `/rest/v1/asr/sentence`).
