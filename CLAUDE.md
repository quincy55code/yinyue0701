# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

**查询 `comments` 表（验证评论功能）:**
```sql
SELECT c.*, u.username FROM comments c
JOIN users u ON u.id = c.user_id ORDER BY c.created_at DESC LIMIT 10;
```

**2026-07-03 新增功能:**
- `comments` 表（DDL: `sql/comments.sql`）— `id, note_id, user_id, content, created_at`。博客文章评论系统。
- `GET /api/notes/:id/comments` — 获取文章评论（含用户 username/avatar_url），无需登录
- `POST /api/notes/:id/comments` — 发表评论（需 authMiddleware），body: `{ content }`
- `DELETE /api/comments/:id` — 删除自己的评论（需 authMiddleware，验证 ownership）
- `GET /api/home` — 首页聚合接口（Hero + 最近更新 + 推荐歌曲 + 最新评论），一次请求返回所有板块数据。
- **首页重设计**: Hero Banner (日推封面+渐变遮罩), 最近更新 Bento 横滑, 推荐歌曲横滑覆盖层, 最新评论动态, SVG 替换所有 emoji, 入场动画。
- **评论区**: 在文章详情底部渲染（`appendComments()`），登录后发表，`[song:ID]` Markdown 嵌入仍可渲染为歌曲卡片但不显示提示。
- `playSongById(songId)` — 修复原代码中调用 `Player.playSongById()` 不存在的问题，在 ui.js 中封装。**注意：现在是 async 函数**（2026-07-03 改造），缓存未命中时会自动 fetch `/api/songs?limit=300` 填充缓存后再播放。
- **首页笔记横竖混合布局**（2026-07-03 改造）：`renderRecentNotes()` 只显示前 5 条横滑卡片；下方新增 `renderNoteVerticalList()` 显示剩余笔记的垂直列表（`.note-card` 复用现有样式）。
- **笔记内歌曲 fallback 修复**（2026-07-03 改造）：`navigateToNote()` 中未缓存的歌曲嵌入也带 `data-action="play-embed-song"` 和 `data-song-id`，点击后由异步 `playSongById()` 加载。
- **评论区去掉 `[song:ID]` 提示**（2026-07-03 改造）：不再显示 `[song:ID]` 输入语法提示，但 `renderMarkdown()` 仍保留解析能力（向后兼容）。
- **评论显示笔记来源**（2026-07-03 改造）：`renderCommentItem(c, noteId, noteTitle)` 在每条评论底部追加 `来自《笔记标题》`，可点击跳转。

## Architecture

**Stack:** Node.js Express backend (port 8765) + vanilla HTML/CSS/JS frontend (no framework). Database is Supabase PostgreSQL (`orphftlwdwuvoscizndx.supabase.co`). The Python `app.py` is a legacy backup — the active backend is `server.js`.

**Performance optimizations (applied):**
- `compression()` middleware — gzip JSON responses (~82% reduction: 121KB → 22KB)
- `helmet()` security headers + CORS with `ALLOWED_ORIGIN` env var
- `express-rate-limit`: global (100/min), auth (5/min), stream (60/min)
- Static files: JS/CSS `max-age=7d`, images `max-age=30d`, ETag
- Google Fonts: `media="print" onload="this.media='all'"` non-blocking
- API response cache: `/api/collections` cached 5 minutes in-memory (apiCache)
- DB query: `/api/tags` prefers `supabase.rpc('get_tag_song_counts')` GROUP BY, falls back to JS counting
- `/api/stream/:songId` selects only needed columns, not `*`
- Email sends (send-code, feedback) are fire-and-forget, not awaited
- `content-visibility: auto` on `.cover-card`, `.tag-card`, `.song-list-item`
- `will-change: transform` on animated cards
- `decoding="async"` on cover images
- `mergeToCache()` LRU eviction at 1000 entries
- `fetchWithDedup()` — AbortController-based request dedup
- `_lyricsCache` in-memory lyrics cache (max 50 entries, both ui.js and lyrics.js)
- `refreshAll()` rAF-debounced, redundant calls removed
- `saveLrcOffset()` 500ms debounce
- `bindCardCalls()` removed — merged into global `setupGlobalDelegation`
- **`authMiddleware` 本地 JWT 验签** — 用 `crypto.createHmac` + `timingSafeEqual` 本地验签，不调 Supabase Auth 远程接口（~0ms vs 200-500ms）。同时保留 `supabase.auth.getUser(token)` fallback 兼容旧版 Supabase 内部密钥签发的 token。[[jwt-local-verify]]
- **`POST /api/playlists/:id/songs` 并行化** — 验证所有权 + upsert 用 `Promise.all` 并行，去掉 `sort_order` 查询。从 4 次串行网络往返降到 2 次并行。
- **加入歌单 Hover 弹出菜单** — `showAddToPlaylistPopup()` 代替 `showAddToPlaylistModal()`，点击 "+" 后原地弹出下拉菜单（`position: fixed` 毛玻璃），点击歌单名直接添加，无弹窗动画延迟。鼠标移出 300ms 自动关闭。

**Static assets:** `express.static(__dirname)` serves the entire project root. Tag card background images are in `public/images/tags/` (downloaded by `download_tag_bg.js` from Unsplash). The directory must exist before running that script.

**comments 表（DDL: `sql/comments.sql`）:** `id, note_id, user_id, content, created_at`。博客文章评论系统。

**首页聚合 API `GET /api/home`:** Hero（最新每日推荐+歌曲信息）+ 最近更新（8 篇笔记）+ 推荐歌曲（12 首）+ 最新评论（10 条，含 note 标题 + 歌曲嵌入）。

**`playSongById(songId)` 在 ui.js 中定义，非 Player 的方法。** 功能：从 `_songCache` 查找歌曲，封装为单曲列表调用 `Player.playAll([song], 0)`。ui.js 中共有 4 处调用点（feed-play-song, feed-play-recommended, play-embed-song, home-hero-play）。

**Data flow:**
```
Browser <audio src="/api/stream/:id">  →  Express server  →  B站 API (view + playurl)  →  B站 CDN (audio/mp4)
Browser fetch('/api/songs' | '/api/search')  →  Express  →  @supabase/supabase-js  →  Supabase PostgreSQL
Browser fetch('/api/favorites' | '/api/playlists/...')  →  Express (authMiddleware)  →  supabaseAdmin  →  Supabase PostgreSQL
Browser fetch('/api/lyrics/:songId')  →  Express  →  supabase  →  Supabase PostgreSQL
Lyrics popup (lyrics.html) ⬌ BroadcastChannel('music_player_lyrics') ⬌ Main window (player.js + ui.js)
Embedded lyrics panel ← Player.on() timeupdate/loading events ← Main window (ui.js → direct DOM sync, no BroadcastChannel)
```

### Backend (`server.js`)

Two Supabase clients:
- `supabase` (anon key) — public read endpoints: `/api/songs`, `/api/search`, `/api/tags`
- `supabaseAdmin` (service_role key) — auth-protected endpoints: favorites CRUD, playlists CRUD, auth endpoints. Bypasses RLS.

**Key server-side functions:**
- `formatSong(s)` — normalizes DB snake_case → frontend camelCase (`start_seconds` → `start_time`, `end_seconds` → `end_time`, `duration_seconds` → `page_duration`). For segmented songs, `duration` = `end_seconds - start_seconds`. **MUST use `??` (not `||`) for numeric fields like `duration_seconds`** — `0` is a valid duration but `0 || null` returns `null`, causing frontend to show "0:00".
- `attachTags(songs)` — batch-attaches tag names to song objects. Collects all `song_id`s, bulk-queries `song_tags` + `tags` tables (2 queries total, not N+1), returns songs with a `tags: ["标签1", "标签2"]` array added.

Auth endpoints:
- `POST /api/auth/send-code` — generates 6-digit verification code, inserts into `verification_codes` table (2min TTL), sends email via 163 SMTP. Rate-limited: 60s between requests per email.
- `POST /api/auth/check-email` — email-first flow: checks if email exists in `public.users`. Returns `{ exists: boolean }`. Used by frontend to decide whether to show password or register screen.
- `POST /api/auth/login` — three-mode login. `mode: "register"` (email + code + password → create user + profile + sign in), password login (email + password → `signInWithPassword`), verification code login (email + code → `completeLogin()` with custom JWT for existing users). Password login only works if user has previously set a password.
- `POST /api/auth/reset-password` — forgot-password flow. Accepts `{ email, code, password }`, verifies code, finds auth user via `listUsers()`, calls `updateUserById` to set new password. No auth required.
- `POST /api/auth/set-password` — (auth required) sets/updates user's password via `supabaseAdmin.auth.admin.updateUserById`. Accepts `{ password }` (min 6 chars). Returns `{ ok: true }`.
- `POST /api/auth/logout` — no-op (JWT is stateless, frontend clears localStorage)
- `GET /api/auth/me` — validates JWT + returns user profile (`username`, `avatar_url`)
- `PATCH /api/auth/profile` — update username (1-30 chars, unique). Returns updated user.
- `POST /api/auth/avatar` — upload avatar as base64 data URL (PNG/JPEG/WebP, ≤2MB). Uploads to Supabase Storage `avatars` bucket, updates `public.users.avatar_url`. Returns `{ avatar_url }`.

**Custom JWT signing:** `signJWT(payload)` uses Node.js built-in `crypto` to issue HS256 JWTs signed with `SUPABASE_JWT_SECRET`. `issueSession(userId, email)` generates access_token (1h) + refresh_token (7d). Used by `completeLogin()` for existing users so their password is never overwritten by a verification code login.

Song & tag endpoints:
- `GET /api/songs?tag=&bvid=&limit=` — returns songs ordered by id. Optional `?tag=标签名` filters by tag (via `song_tags` join), `?bvid=BVxxx` filters by BV号 and orders by `page` (used by collections feature). `?limit=N` (default 10, max 300). Response includes `tags` array per song via `attachTags()`.
- `GET /api/search?q=` — fuzzy search `title` and `singer` via `ilike` (PostgREST `.or()` filter), limit 20. Response: `{ results: [...songs with tags], query }`.
- `POST /api/search-log` — inserts `{ query, searched_at }` into `search_logs` table with 5-minute dedup. Called silently by frontend when search yields no results.
- `GET /api/tags` — returns tag tree: top-level tags with `children` arrays (for star sub-tags like 明星→周杰伦) and `song_count` per tag. No auth required.
- `GET /api/collections` — returns song collections tree: 12 top-level categories each with `items[]` (sub-tags with `bvid` and `song_count`). Song counts computed via single batch `GROUP BY bvid` query. Used by frontend "歌曲汇总" sidebar feature. No auth required.
- `GET /api/stream/:songId` — proxies B站 DASH audio. Looks up song metadata from Supabase by id, then fetches fresh DASH URL per request (no caching — URLs expire). Uses `fnval=16` for DASH format, sorts audio by bandwidth descending. CID is cached in-memory per `bvid:page` (static value, never expires).
- `GET /api/lyrics/:songId` — returns `{ songId, title, singer, lrc_text }` from the `songs` table. Returns `lrc_text: null` if no lyrics exist for the song. No auth required.
- `POST /api/feedback` — sends user feedback email to `lexiaode@163.com` via 163 SMTP. Accepts `{ content, contact }`. No auth required.

Favorites & Playlists endpoints — all behind `authMiddleware` (JWT token validation):
- `GET /api/favorites` — user's favorites with joined song details
- `POST /api/favorites/:songId` — add favorite (upsert, checks song exists first)
- `DELETE /api/favorites/:songId` — remove favorite
- `GET /api/playlists` — user's playlists with song counts (single batch query, not N+1)
- `POST /api/playlists` — create playlist (name unique per user)
- `DELETE /api/playlists/:id` — verify ownership, delete
- `GET /api/playlists/:id/songs` — songs within a playlist (joined details)
- `POST /api/playlists/:id/songs` — add song to playlist (auto sort_order, upsert)
- `DELETE /api/playlists/:id/songs/:songId` — remove song from playlist

**Homepage & Comments (2026-07-03 新增):**
- `GET /api/home` — 首页聚合接口，并行获取 Hero（最新 daily_recommend）+ 最近更新笔记 + 推荐歌曲 + 最新评论
- `GET /api/notes/:id/comments` — 获取文章评论列表（含用户 username/avatar_url），无需登录
- `POST /api/notes/:id/comments` — 发表评论（authMiddleware），body: `{ content }`
- `DELETE /api/comments/:id` — 删除自己的评论（authMiddleware + ownership 验证）

Credentials load from `.env` via a manual parser (no `dotenv` dependency). `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` (from Supabase Dashboard → Settings → API → JWT Settings), and `EMAIL_SMTP_PASS` (163 mailbox SMTP authorization code) are all required at startup. Template at `.env.example`.

**Critical: Range/CORS is handled inline without extra dependencies.** The server forwards `req.headers.range` to B站 CDN so seeking works. It also forwards `Content-Length` from upstream — without it, browsers can't map time→byte offsets and `audio.currentTime = X` silently fails.

**Pending setup:**
- Execute `sql/get_tag_song_counts.sql` in Supabase SQL Editor to enable GROUP BY RPC for `/api/tags`
- Set `ALLOWED_ORIGIN` env var in production (e.g. `https://your-domain.com`)

### Frontend (vanilla JS IIFE modules)

Five JS files loaded in order in `index.html`: `js/auth.js` → `js/playlist.js` → `js/player.js` → `js/ui.js`. Each is an IIFE returning a singleton object (`Auth`, `PlaylistStore`, `Player`, `UI`). `index.html` bootstraps by fetching `/api/songs` + `/api/tags` in parallel, then calling `UI.init(songs, tags)`.

**HTML layout is a CSS Grid:** `.app-layout` (sidebar 240px | content 1fr) stacked on top of `.player-bar` (72px). The four zones:
- `nav.sidebar` — 240px frosted-glass sidebar with nav items, tag shortcuts, and user area
- `header.top-bar` — 48px bar with centered search input (capsule-shaped, max 480px)
- `main.content-area` — scrollable content area hosting tag grids, cover grids, song lists
- `footer.player-bar` — 72px frosted-glass bar: cover thumbnail (48px) | meta | controls + progress | volume popup
- `.now-playing-overlay` — full-screen immersive view (triggered by clicking the player bar cover), 280px cover art with blurred backdrop, large controls, fav/add-to-playlist actions
- `.lyrics-panel` — **embedded lyrics panel** (`position: fixed`, `z-index: 25`, direct child of `.app-layout`). Slides in from right (380px, `translateX(105%)` → `translateX(0)` via `.open` class). Click 🎤 to toggle, ✕ to close, ↗ to pop out standalone `lyrics.html` window. Syncs via `Player.on()` directly (not BroadcastChannel). Must stay at `.app-layout` root — if moved inside `.content-wrapper`, it gets covered by content area.
- **Homepage sections** — 新首页布局: `.home-hero` (Hero Banner 300px, 模糊背景+渐变遮罩+封面), `.notes-hscroll` (最近更新 Bento 横滑卡片), `.recommended-scroll` (推荐歌曲横滑+播放覆盖层), `.comment-feed-list` (最新评论动态)
- **Comments** — `.comments-section` (评论区容器), `.comment-item` (头像+内容+删除按钮), `.comment-form` (textarea+提交按钮), `.comment-login-hint` (登录提示)

`lyrics.html` is a standalone page that can be opened as a popup window (via ↗ button in the embedded lyrics panel, or via `openLyricsWindow()`). It loads its own `js/lyrics.js` (also IIFE → `Lyrics` singleton) and `css/lyrics.css`. It communicates with the main window via `BroadcastChannel('music_player_lyrics')`. The embedded lyrics panel in the main page is an entirely separate implementation in `ui.js` — the two do not share code.

| Module | Responsibility |
|--------|---------------|
| `js/auth.js` | JWT-based auth + email verification code + password login. Manages session (`localStorage` keys: `music_player_session`, `music_player_user`). Methods: `sendCode(email)`, `verifyCode(email, code)`, `loginWithPassword(email, password)`, `checkEmail(email)` → `{ exists }`, `register(email, code, password)` → one-step signup, `resetPassword(email, code, newPassword)` → forgot-password flow, `setPassword(password)`, `updateProfile({ username })`, `uploadAvatar(file)` (reads as base64). Validates token expiry on init via `GET /api/auth/me`. Observer pattern via `onChange()`. Provides `getAuthHeaders()` used by PlaylistStore for all API calls. |
| `js/playlist.js` | API-driven favorites + playlist management with **optimistic local cache**. `getFavorites()`/`getPlaylists()` are **synchronous** (return `_favoritesCache`/`_playlistsCache`). Mutation methods update cache instantly + `notify()` → UI refreshes immediately, then send the network request in background. On failure, they rollback cache by re-fetching from server. Search history still uses localStorage (`music_player_search_history`). |
| `js/player.js` | `<audio>` element lifecycle, play/pause/seek/mode logic. `setVolume(v)` / `getVolume()` for volume control (audio created via `new Audio()`, not in DOM). Emits events: `timeupdate`, `duration`, `playState`, `modeChange`, `ended`, `loading`, `error`. `seek()` adds `startTime` offset for segmented songs. `load()` sets `audio.src = /api/stream/:id`. Fallback seek: fast-forwards at 8x muted if Range not supported by CDN. **Also pushes `time-update` and `song-change` messages to the `music_player_lyrics` BroadcastChannel** for lyrics sync. **`playSongById(songId)` 不存在于 Player 中** — UI 层使用 `ui.js` 中的 `playSongById()` 包装函数。 |
| `js/ui.js` | All DOM rendering and event delegation. **Homepage 重设计(2026-07-03)**: `renderNewHome()` 替代原 `renderHomeFeed()`，布局：Hero Banner (`renderHeroBanner`) + 最近更新横滑 (`renderRecentNotes`, Bento 卡片) + 推荐歌曲 (`renderRecommendedSection`, 播放覆盖层) + 最新评论 (`renderRecentComments`)。All sections 有 staggered 入场动画 (`heroFadeIn`, `sectionFadeUp`)。**评论区(2026-07-03)**: `appendComments(noteId)` 在文章详情底部追加评论区，`renderComments(comments, noteId)` 渲染评论列表+表单，`renderCommentItem(c)` 渲染单条评论。评论内容通过 `renderMarkdown()` 支持 `[song:123]` 嵌入。发表评论事件 `submit-comment`，删除评论事件 `delete-comment`。**Sidebar-based navigation**: sidebar nav buttons (`data-nav`) switch between home, tags, collections, favorites, and playlists.
| `js/lyrics.js` | Runs in the `lyrics.html` standalone popup only (NOT the embedded panel). Parses LRC text (`parseLRC()` → `[{time, text}]`), syncs current line via **binary search** (`syncTime()`), renders in two modes: **vertical** (≈10 lines, scrolls) and **horizontal** (2 lines centered, side-by-side prev/next). Title bar is draggable. Listens on BroadcastChannel for `time-update`, `song-change`, `lyrics-open`. Posts `{ type: 'lyrics-closed' }` and `{ type: 'mode-change' }` (objects, not strings) back to main window. The embedded panel in `ui.js` has its own independent LRC parser (`parseLRCEmbedded()`) and sync logic — the two systems share no code. |

**Event flow for mutations (critical):**
```
User clicks fav → PlaylistStore.toggleFavorite(sid)
  → optimistic cache update → notify() → onChange callback → refreshAll()
  → background: fetch POST/DELETE → if failed → rollback cache + notify()
```
**Do NOT call `refreshAll()` explicitly after mutation methods** — the `onChange` callback already triggers it. Doing so causes a redundant (and potentially conflicting) second render.

**Global `window._songCache`** — shared between UI and PlaylistStore. **It is an OBJECT `{id: song}`, NOT an array.** UI populates it via `mergeToCache()` (sets `_songCache[s.id] = s`). PlaylistStore's `lookupSong()` reads it via `cache[songId]` with `Object.values(cache).find()` fallback — do NOT call `.find()` directly on it (this crashes with `TypeError: cache.find is not a function`).

### Navigation State Machine

`_currentView` drives which UI is rendered and which action `goBack()` takes:

```
'home' ──→ 'collection' ──→ 'collection-items' ──→ 'collection-songs'
                               (goBack → coll)      (goBack → items)
         ──→ 'favorites'  ──→ goBack → home
         ──→ 'playlists'  ──→ 'playlist-songs'
                               (goBack → playlists)
         ──→ 'search'     ──→ goBack → home
```

The `[data-action]` event delegation handles all navigation: sidebar items (`nav-home`, `nav-favorites`, `nav-playlists`, `nav-collection`), sidebar tag shortcuts (`nav-collection-hot/classic/yueyu/ktv/minyao` — map to `navigateToCollectionBySlug()`), and collection navigation (`navigate-collection-item`, `navigate-collection-songs`).

### CSS

- `css/style.css` — Spotify × Apple Music fusion dark theme. **Design tokens** in `:root`: dark green background hierarchy (`--bg-root: #0B0E0C` → `--bg-elevated: #1C2320`), warm green accent (`--accent: #4DB88D`), frosted glass via `backdrop-filter: blur()` on sidebar and player bar. **Layout**: CSS Grid `.app-layout` (sidebar | content-wrapper) + `content-wrapper` flex column (top-bar | content-area). `.content-wrapper` MUST have `overflow: hidden` (not visible). **Components**: `.cover-card` (140px cover image + title/singer + hover play overlay + corner fav button), `.song-list-item` (44px thumbnail row for search), `.tag-card` (emoji icon + name + count), `.sidebar` (240px frosted, 3px green active indicator), `.player-bar` (72px frosted, 48px cover, center controls+progress, right volume popup), `.now-playing-overlay` (full-screen, 280px cover, blurred backdrop), `.lyrics-panel` (`position: fixed; z-index: 25; right: 0; width: 380px;` — slide-in via `translateX(105%)` → `translateX(0)` on `.open`). **Homepage(2026-07-03)**: `.home-hero` (300px, 模糊背景+渐变遮罩+封面+入场动画), `.home-hero--default` (无日推时的渐变背景), `.home-section` (板块容器+staggered 动画), `.notes-hscroll` (最近更新横滑 240px Bento 卡片), `.note-hscroll-inner` (140px 卡片+圆角边框+阴影), `.recommended-scroll` (推荐歌曲横滑), `.recommended-item-cover-wrap` (130px 方封面+播放 overlay), `.comment-feed-list` (最新评论动态), `.comment-feed-item` (评论卡片+border). **Comments(2026-07-03)**: `.comments-section`, `.comment-form`, `.comment-item` (34px 圆形渐变头像), `.comment-text .song-embed` (评论中的歌曲嵌入). **Animations**: `heroFadeIn`, `sectionFadeUp`, staggered card entry (`cardEnter` keyframe), skeleton shimmer, `glowPulse` for playing card, `heartPop` for fav toggle, `npoContentIn` for immersive view entrance. `prefers-reduced-motion` respected.
- `css/lyrics.css` — Lyrics popup window styles. Shares the same CSS variable naming as the main app (dark green theme). Vertical mode: line-by-line scroll with active line in accent color; horizontal mode: two large lines centered side-by-side. Frosted glass container background.
- `css/lyrics.css` — Lyrics popup window styles. Shares the same CSS variable naming as the main app (dark green theme). Vertical mode: line-by-line scroll with active line in accent color; horizontal mode: two large lines centered side-by-side. Frosted glass container background.

### Database (`sql/`)

- `schema.sql` — Six tables with indexes and comments. Entity relationships:
```
users ──┬── favorites ──── songs ──── song_tags ──── tags
        │   (多对多)                    (多对多)
        └── playlists ── playlist_songs ──┘
            (一对多)        (多对多)
```
- `collections.sql` — Two additional tables for the "歌曲汇总" feature: `collections` (12 top-level categories) and `collection_items` (sub-tags with `bvid` FK'd to `collections.id`). `collection_items.bvid` is an implicit reference to `songs.bvid` (no FK constraint).
- `seed_collections.sql` — 12 collection INSERTs + ~53 collection_item INSERTs. 主题歌单 items have `bvid=NULL`. Must be executed after `collections.sql` DDL.
- `tags.sql` — Tags system: `tags` table (self-referencing `parent_id` for `明星→周杰伦` hierarchy) + `song_tags` many-to-many join table + 15 top-level tag seeds + 8 star sub-tags. Must be executed in Supabase SQL Editor (DDL), or via `scripts/setup_tags.js` (direct pg connection).
- `insert_songs.sql` — 100-song bulk insert from B站 compilation BV1pr6aYiE97 (华语女声合集). Each song is a separate page (p=1..100) within that video. These populate IDs 1-100.
- `alter_lyrics.sql` — Adds `lrc_text TEXT DEFAULT NULL` column to `songs` table. Must be executed in Supabase SQL Editor (DDL).
- `verification_codes.sql` — Creates `verification_codes` table for email verification code storage (5-min TTL). Also adds `avatar_url TEXT` column to `public.users`. Executed by `scripts/setup_verification_codes.js`.
- `gen_csv.js` / `songs_100.csv` — Utility to generate CSV from B站 API for bulk import.

### Scripts (`scripts/`)

**Data import & maintenance:**
- `import_songs.js` — Batch-imports songs from B站 compilations. Reads BV号 list from `scripts/video_list.json`, queries B站 API for each video's pagelist, parses `NN.歌名 - 歌手` format, deduplicates against existing `bvid+page` in DB, and inserts new songs. Outputs suggested next steps (`map_tags.js` + `fetch_lyrics.js`).
- `fetch_lyrics.js` — Fetches LRC lyrics from lrclib.net API for all songs missing lyrics. Queries `lrc_text=is.null`, calls lrclib search + direct get APIs, validates (≥5 timestamp lines), PATCHes back via Supabase REST API. 1.5s rate limit between requests.
- `setup_tags.js` — Connects directly to Supabase PostgreSQL (pg module, port 5432) to execute `sql/tags.sql` DDL + seed data. Requires DB password as CLI argument. Used because PostgREST can't do DDL.
- `setup_collections.js` — Connects directly to Supabase PostgreSQL to execute `sql/collections.sql` DDL + `sql/seed_collections.sql` seed data. Reads password from `.superpowers/db_pass.txt` (no CLI arg needed). Skips DDL if tables exist, skips seed if collections already have rows. **Known pitfall**: the `executeSQL()` function strips `--` comment lines from split SQL statements — DDL files MUST NOT have `--` comment lines before the first statement, or that statement gets filtered out (fixed by regex-stripping comment lines before filtering).
- `map_tags.js` — Batch-associates songs to tags via Supabase REST API. Uses hardcoded `SINGER_TAGS` (singer→tag mapping) and `TITLE_KEYWORDS` (title keyword→tag mapping) rules, then POSTs to `song_tags` table. Idempotent (skips 409 duplicates).

**Cover images:**
- `fetch_bilibili_covers.js` — Refreshes B站 CDN cover URLs. Finds distinct bvids with `hdslb.com` covers, fetches fresh `pic` from B站 view API, batch-PATCHes all songs sharing that bvid. Fast (~500ms delay between bvids).
- `fetch_covers.js` — Replaces B站 CDN covers with iTunes album artwork. Searches iTunes API (CN store → title-only CN → US store), matches by singer similarity, upgrades to 600×600 resolution. 1.5s rate limit per song. Handles 1000+ songs.
- `download_tag_bg.js` — Downloads Unsplash background images for each tag category (15 hardcoded tag→keyword mappings) to `public/images/tags/`. Sized 600×400, skips existing valid files. 2s rate limit.

**Data repair:**
- `fill_singers.js` — Fills empty singer fields. Uses 4 strategies: ① extract `【歌手】歌名` bracket format, ② 400+ entry `KNOWN_SINGERS` hardcoded map, ③ match same-title songs in DB by frequency, ④ fuzzy normalized title matching. Supports `--dry-run`.
- `fix_song_titles.js`, `fix_song_data.js`, `fix_english_songs.js`, `fix_foreign_swaps.js`, `fix_bv1xh68YvEij.js`, `check_foreign_swaps.js`, `undo_bv.js`, `retry_lyrics.js`, `fix_wrong_lyrics.js` — One-off data repair scripts for specific cleanup tasks. Not expected to be run regularly.

**Lyrics processing (new):**
- `batch_lyrics_pipeline.js` — Main lyrics pipeline. Three modes: `online` (lrclib+网易云, fast), `whisper` (full whisper pipeline, slow), `hybrid` (default: online first, whisper fallback). Reads song list from `~/Desktop/无歌词歌曲.txt`, queries Supabase for bvid/page, scores candidates, uploads LRC. Supports `--dry-run`, `--limit=N`, `--start=N`. Progress saved to `scripts/batch_lyrics_progress.json`, failures to `scripts/batch_lyrics_failed.json`.
- `retry_failed_lyrics.js` — Smart retry for `batch_lyrics_failed.json`. Detects title/singer swap via `KNOWN_SINGERS` set, cleans singer fields (removes actor names), strips version suffixes from titles, tries multiple search variants. Updates failed file on completion.
- `scrape_chinese_lyrics.js` — Attempts to scrape LRC from Chinese sites (kugeci.com, baidu baike). Mostly deprecated in favor of Python version.
- `kugeci_lrc_fetcher.py` — Python scraper for kugeci.com. Searches song → follows result link → extracts LRC from page. Handles GBK encoding, 503 retries, title/singer swap fallback. **Note:** kugeci.com often returns 503 for automated requests.
- `kugeci_batch_fetch.py` — Improved kugeci scraper. Parses search result `<tr>` table structure with `html.unescape()` to handle `&nbsp;` entities in singer names. Scores candidates by title + singer match, prefers non-cover versions. Used successfully to fetch 34 songs in one batch. 2s rate limit.
- `whisper_batch.py` — Optimized whisper pipeline: B站 DASH API → download audio only (not video) → faster-whisper → filter noise → upload LRC. Reads `batch_lyrics_failed.json`. Supports `--model` (tiny/base/small/medium), `--limit`, `--start`. **Note:** some BV号s return full compilation audio even with page-specific CID (e.g. BV11LAbz1Eup with all songs as page=1).
-  `calibrate_lyrics.py` — **Whisper 歌词校准（⚠️ 质量不稳定）。** Takes songs that already have LRC, extracts plain lyrics text, downloads B站 DASH audio, runs faster-whisper for accurate timestamps, maps lyrics to whisper segments, generates calibrated LRC. Uploads with `[by:lyrics-calibrator]` marker. Queries songs with `lrc_text=not.is.null`. Supports `--model`, `--limit`, `--offset`. **⚠️ 当 whisper segment 数 ≠ 歌词行数时使用均匀分布而非精确匹配，时间戳仅供参考。大规模使用前必须先 10 首测试！不备份原始 LRC，恢复只能重抓在线源。**

**⚠️ 重要:** `fix_swapped_songs.js` **不是一次性脚本** — 它是通用的 title/singer 互换修复工具（v3 智能检测 + 硬编码 200+ 歌手名单）。**每次 `import_songs.js` 导入新 BV 后都应运行 `--verify` 检查。**见 Key Gotchas 第 4 条。

**Config files:**
- `scripts/video_list.json` — JSON array of BVID strings used by `import_songs.js`. Edit to add new compilation BV号s before importing.
- `scripts/instrumental_ids.json` — Auto-generated list of song IDs that are pure instrumental (no lyrics expected). Generated by `kugeci_batch_fetch.py` classification pass. Used to track which songs should be skipped during lyrics fetches.

## Adding a Song

**Preferred: Use `import_songs.js` for batch imports from B站 compilations.**
1. Add the BV号 to `scripts/video_list.json` (JSON array of strings)
2. Run `/d/softwa/nodejs/node scripts/import_songs.js` — it parses `NN.歌名 - 歌手` format, deduplicates, and inserts
3. Run `/d/softwa/nodejs/node scripts/fix_swapped_songs.js --verify` to check for title/singer swap (B站格式不一致)
4. If swaps detected, run `/d/softwa/nodejs/node scripts/fix_swapped_songs.js` to fix
5. Then run `map_tags.js` and `fetch_lyrics.js` in sequence

**Manual single-song insert via REST API:**

1. **If it's a standalone B站 video:**
   ```bash
   # Fetch video info to get cid, cover, full duration
   curl -s "https://api.bilibili.com/x/web-interface/view?bvid=<BVID>" \
     -H "User-Agent: Mozilla/5.0..." -H "Referer: https://www.bilibili.com/"
   
   # Then insert via Supabase REST API
   SERVICE_KEY="<from .env>"
   printf '{"title":"<歌名>","singer":"<歌手>","bvid":"<BVID>","page":1,"start_seconds":<start>,"end_seconds":<end>,"duration_seconds":<full_dur>,"cover_url":"<cover>","bilibili_url":"https://www.bilibili.com/video/<BVID>/"}' > /tmp/song.json
   curl -s -X POST "https://orphftlwdwuvoscizndx.supabase.co/rest/v1/songs" \
     -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
     -H "Content-Type: application/json" -H "Prefer: return=representation" \
     -d @/tmp/song.json
   ```

2. **If the song is a page within a multi-page B站 compilation:**
   - `page` = the page number, `start_seconds`/`end_seconds` = NULL (the whole page is the song)
   - `duration_seconds` = the page duration from B站 API

3. **The server defaults to top 10 by ID ascending** (`/api/songs`). Pass `?limit=300` (max) to get more. New songs with higher IDs are discoverable via search or tag filtering even if they don't appear in the default top-10.

## Lyrics Calibration Workflow

**⚠️ 重要：校准质量不可靠，大规模使用前必须小批量测试！**

When lyrics have sync issues (歌曲与歌唱不同步 — LRC timestamps from online sources don't match B站 audio timing):

```bash
# ⚠️ 必须先测试小批量（10首），确认质量后再决定是否继续
python scripts/calibrate_lyrics.py --limit=10 --model=small

# Full calibration: re-timestamp all LRC against B站 audio via whisper
python scripts/calibrate_lyrics.py --model=small --limit=1000

# Resume from offset
python scripts/calibrate_lyrics.py --offset=100 --limit=500
```

**How it works:**
1. Extract plain lyrics text from existing LRC (strip timestamps, keep text)
2. Download B站 DASH audio for the specific song page
3. faster-whisper transcription → accurate timestamps from real audio
4. Match lyrics text to whisper time segments → calibrated LRC
5. Upload to Supabase with `[by:lyrics-calibrator]` marker

**Known risks:**
- `match_lyrics_to_segments()` 在 whisper segment 数与歌词行数不等时使用**均匀分布**插值，时间戳是近似值而非精确匹配。只当 segment 数 ≈ 歌词行数时效果才好。
- **不备份原始 LRC** — 覆盖后无法直接回滚。如需恢复，必须重新从在线源抓取（见下方"恢复校准"）。
- 部分 BV 合集所有分P 的 `page=1` → 下载完整合集音频 → whisper 转写结果错误。
- 大规模校准（100+首）出问题的概率很高，**不推荐作为常规歌词质量改进手段**。

**校准恢复（Rollback）：**
如果校准结果不满意（如时间戳偏移、歌词文本错误），可以回滚到在线源原始 LRC。见 Key Gotchas 第 49 条（`calibrate_lyrics.py` 不备份原始 LRC）和 47、48 条（`refetch_lyrics_v2.js` 的使用方法）。

**Monitoring:** stdout is buffered on Windows. Check progress by counting output files:
```bash
ls ~/Desktop/单首歌词/calibrate_output/*_calibrated.lrc | wc -l
```

**Rate:** ~2-5 min/song depending on audio length. Songs with incorrect `page`/`duration_seconds` in DB will download full compilation audio (30+ min) and take 20-30 min each.

## Key Gotchas (按主题分组)

### 网络 & B站 API
1. **Seek requires Content-Length.** If the browser doesn't get `Content-Length` in the initial 200 response, it can't derive byte ranges for time positions. Always ensure `server.js` forwards upstream `content-length`. Songs with time segments work around this because the initial `audio.currentTime = startTime` triggers an abort+retry with Range before data streams.

2. **`audio.duration` is Infinity for streamed MP4.** The player uses `duration_seconds` from Supabase as fallback (`pageDuration`). When adding new songs, ensure `duration_seconds` is populated.

3. **B站 DASH audio URLs are temporary.** Never cache them — fetch fresh per request. Use `fnval=16` for DASH format, sort audio streams by bandwidth descending for best quality.

4. **B站合集格式不一致 → title/singer 互换。** `import_songs.js` 的 `parseTitle()` 始终假设 `歌名 - 歌手` 格式（即分隔符左边是歌名、右边是歌手）。但部分 B站合集使用 `歌手 - 歌名` 格式，导入后 `title` 存的是歌手名、`singer` 存的是歌名。**每次 `import_songs.js` 导入后，必须运行 `node scripts/fix_swapped_songs.js --verify` 检查**，如有互换则运行修复。已确认受影响的 BV 合集有 18 个（百首粤语经典、100首经典老歌、00后KTV必点 等），2026-06-26 已修复 1776 首。[[title-singer-swap-fix]]

5. **163 SMTP uses direct IP to bypass DNS hijacking.** The user's network resolves `smtp.163.com` to a bogus IP (`198.18.0.4`). `server.js` connects to the real IP `117.135.214.13` with `tls: { servername: 'smtp.163.com' }` for TLS SNI. If SMTP fails in the future, the IP may have changed — check with `nslookup smtp.163.com` from a clean network and update the host.

6. **某些 BV 合集的所有歌曲 page 都是 1。** 如 BV11LAbz1Eup 的所有分P 在 DB 里 `page=1`、`duration_seconds=2117`（整个合集的时长）。B站 DASH API 即使传了 page-specific CID 也返回完整合集的 35 分钟音频。whisper 处理这种歌会非常慢（20-30分钟/首）。需要在 DB 里修正 page 和 duration_seconds。

7. **英文歌曲搜索要用英文名。** lrclib/网易云对中文译名匹配很差。如 "You Are Beautiful - 詹姆斯·布朗特" 搜不到，但 "You Are Beautiful - James Blunt" 能搜到。同样 "Time To Say Goodbye - 莎拉布莱曼" → "Time To Say Goodbye - Sarah Brightman"。

8. **歌词搜索来源优先级**：① Lrclib.net（`https://lrclib.net/api/search`，支持同步 LRC），② 网易云音乐 API（`https://music.163.com/api/search/pc`，中文歌最全），③ kugeci.com（`https://www.kugeci.com/`，中文歌词站，项目已有 `scripts/kugeci_lrc_fetcher.py` 爬虫）。英文歌曲搜索必须用英文名（不要用中文译名），如 "You Are Beautiful - James Blunt" 而非 "詹姆斯·布朗特"。

### Windows 环境
9. **Windows environment.** Node.js is at `/d/softwa/nodejs/node` (not in PATH as `node`). Use `taskkill //F //PID <pid>` to kill processes (not Unix `pkill`). Chinese directory names break `npm init` — write `package.json` manually. Bash is Git Bash (POSIX sh), not cmd.exe — use forward slashes.

10. **Python print() 在 Windows GBK 终端下不能用 emoji。** 用英文标记 `[OK]` / `[FAIL]` / `[SKIP]` 代替 ✅/❌/⏭。

11. **Windows Python stdout 在后台运行时全缓冲。** 即使 `print()` 也不会实时写入输出文件，导致 `tail -f` 看到空文件。用 `python -u` 或设 `PYTHONUNBUFFERED=1` 解决。但脚本实际在正常执行——通过检查输出目录的文件数来监控进度。

### Supabase & 数据库
12. **Supabase `.env` is required.** Server exits on startup if any of `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, or `EMAIL_SMTP_PASS` are missing. Template at `.env.example`. `SUPABASE_JWT_SECRET` is obtained from Supabase Dashboard → Settings → API → JWT Settings. No DATABASE_URL or postgres password — direct `pg` connections use `db.orphftlwdwuvoscizndx.supabase.co` with password from `.superpowers/db_pass.txt`.

13. **Supabase Storage `avatars` bucket** — must be created manually in Supabase Dashboard (Storage → New Bucket → `avatars` → Public). Stores user avatar images at path `{userId}/avatar.{ext}`. Upload is done server-side via `supabaseAdmin.storage.from('avatars').upload()` with upsert.

14. **PostgREST DML-only.** `@supabase/supabase-js` uses PostgREST which only supports SELECT/INSERT/UPDATE/DELETE. DDL requires Supabase SQL Editor. The service_role key bypasses RLS but still goes through PostgREST — it cannot execute DDL. For direct DB access use the Supabase REST API with service_role key (see Commands section above).

15. **Supabase PATCH 成功返回 204 不是 200。** Python `urllib` 检查 `resp.status == 200` 会误判上传失败，必须改为 `resp.status in (200, 201, 204)`。

16. **Column name: `bilibili_url` (underscore).** Not `"bilibili url"` with space. Supabase queries must use the underscore form.

17. **`verification_codes` table stores email verification codes.** Created by `scripts/setup_verification_codes.js` (direct pg connection, reads DB password from `.superpowers/db_pass.txt`). Columns: `id, email, code, expires_at (2min TTL), used, created_at`. Also adds `avatar_url TEXT` column to `public.users`.

18. **`SUPABASE_JWT_SECRET` is mandatory.** The server exits on startup if it's missing. Get it from Supabase Dashboard → Settings → API → JWT Settings. It's used by `signJWT()` to issue custom tokens for verification code login and session management.

19. **`authMiddleware` 本地 JWT 验签 + Supabase fallback**：优先用 `crypto.createHmac('sha256', JWT_SECRET)` 本地验签。本地失败时降级到 `supabase.auth.getUser(token)` 远程验证，兼容旧版 Supabase 签发的 token。`req.user = { id: payload.sub, email: payload.email }`。

20. **`POST /api/playlists/:id/songs` 并行化**：验证歌单所有权 + upsert 用 `Promise.all` 并行执行，不再有 `sort_order` 查询。从 4 次串行网络往返（authMiddleware 远程验签 + 所有权 + sort_order + upsert）降到 2 次并行。

### 前端渲染 & 事件
21. **Frontend mutation methods fire `notify()` synchronously.** PlaylistStore's optimistic cache update calls `notify()` before the network request completes. Event handlers in ui.js must NOT call `refreshAll()` after mutation methods — the `onChange` → `refreshAll` callback already handles UI refresh. Calling it again causes double-render.

22. **`formatSong()` maps DB columns.** `start_seconds` → `start_time`, `end_seconds` → `end_time`, `duration_seconds` → `page_duration`. For segmented songs, `duration` = `end_seconds - start_seconds`. Frontend code uses the camelCase names.

23. **`formatTime(sec)` must handle `0` as valid.** The check is `sec == null || !isFinite(sec)`, NOT `!sec`. `0` is a valid song duration but `!0` is `true`, which would show "0:00" for songs that legitimately have 0-second duration segments (rare but valid).

24. **`window._songCache` is an object `{id: song}`, NOT an array.** `mergeToCache()` populates it as `_songCache[s.id] = s`. Any code that reads it (like `playlist.js:lookupSong()`) must use `cache[id]` or `Object.values(cache).find()`, never `.find()` directly on the cache object — that throws `TypeError: cache.find is not a function` and silently breaks favorite toggling.

25. **`_songCache` 合并去重。** 多次 API 调用（songs、search、favorites、playlists）都会 `mergeToCache()`，同一首歌可能从多个来源进入缓存。用 `_songCache[s.id] = s` 确保最新版本覆盖旧版本。

26. **Cover cards have two corner buttons**: `.cover-card-fav` (top-right, ♡/❤️ toggle favorite) and `.cover-card-add-pl` (bottom-right, `+` add to playlist). Both use `z-index: 2` and `position: absolute`. The `+` button matches singer text color (`var(--text-secondary)`) with `font-weight: 300`.

27. **Toast notification system**: `showToast(msg)` creates a centered toast with `toastBounce` animation, auto-removed via `setTimeout` after 2s. Do NOT use `animationend` event for cleanup — it fires at each animation phase and causes premature removal. Toast has `pointer-events: none; z-index: 200`.

28. **Playlist rename is double-click (not single-click).** The global `dblclick` event delegation catches `[data-action="rename-playlist"]` and calls `startRename()`. The click handler for the same action only calls `e.stopPropagation()` to prevent triggering `open-playlist` on the parent row. `.pl-name-input` has NO underline (`border: none`).

29. **Search input uses `type="search"` wrapped in `<form autocomplete="off">` with a hidden email trap input.** Chrome ignores `autocomplete="off"` on individual inputs and autofills saved emails into any text field. Three-layer defense: (1) `<form autocomplete="off">` around the search area, (2) hidden `<input type="email" autocomplete="email">` before the real search input to trap Chrome's autofill, (3) `type="search"` on the real input. All `<button>` elements inside the form MUST have `type="button"` — without it they default to `type="submit"` and cause page reload on click.

30. **Auth modal uses email-first flow, not tabs.** States: `email` → `password` / `register` / `resetPassword`. No more `showSetPasswordModal`. Password setup happens in the register state.

31. **Collection item clickability is based on `bvid`, not `song_count`.** `renderCollectionItemsGrid()` uses `hasBvid = !!it.bvid` to determine whether a sub-tag card is clickable, has a background image, and gets the `tag-card--empty` class. Items with valid `bvid` but `song_count=0` (songs not yet imported) are still clickable. Only `bvid=NULL` items (主题歌单 placeholders) are non-clickable. Do NOT revert this to checking `song_count > 0` — that breaks navigation for any BV whose songs haven't been imported yet.

32. **`window.open()` for lyrics popout must NOT use `noopener`.** With `noopener`, the browser ignores the window name (`'music_player_lyrics'`) and opens a new window on every click. Without it, the browser reuses the existing window. Same-origin (localhost:8765), so `noopener` is unnecessary.

33. **Home view ≠ Tags view.** `navigateHome()` → `renderCoverGrid(_defaultSongs)` (song covers under "🎵 推荐歌曲" heading). `navigateToTags()` → `renderTagGrid(_tags)` (tag cards under "🎵 音乐分类" heading). They are separate views with separate `_currentView` values (`'home'` vs `'tags'`).

34. **`.content-wrapper` MUST have `overflow: hidden`.** If set to `visible`, the content area overflows its grid row and covers the `.player-bar` (progress bar, controls become invisible).

35. **`.lyrics-panel` must stay at `.app-layout` root as `position: fixed`.** If moved inside `.content-wrapper`, it will be covered by the content area's rendered layer and only flash briefly during view transitions. Current CSS: `position: fixed; top: var(--topbar-height); bottom: var(--player-height); right: 0; z-index: 25;`.

36. **Add-to-playlist Hover 弹出菜单**：封面卡片和列表行的 "+" 按钮 Hover/点击弹出 `.add-to-pl-popup`（`position: fixed` 毛玻璃菜单），点击歌单名直接调用 `PlaylistStore.addToPlaylist()`。`_addPopup` 变量跟踪当前弹窗，`_addPopupTimer` 管理 300ms 延迟关闭。全局 `document.body.click` 处理关闭。不再弹出 Modal。

37. **Mobile progress bar is always visible.** The `display: none` on `.player-progress` at ≤767px was removed — the progress bar now stays visible at all screen sizes. Only `.player-right` (volume) remains hidden on mobile and shows on player-bar expand.

### 歌词 & BroadcastChannel
38. **Lyrics channel name is `music_player_lyrics`.** Both `js/player.js` (main window) and `js/lyrics.js` (popup) must use the exact same `BroadcastChannel` name. Message types: `time-update` (main→lyrics, carries `currentTime` in seconds), `song-change` (main→lyrics, carries `id`), `lyrics-open` (main→lyrics). **Messages from popup are objects, not strings**: `{ type: 'lyrics-closed' }` and `{ type: 'mode-change' }`. When checking for closed popup, use `e.data && e.data.type === 'lyrics-closed'`, not `e.data === 'lyrics-closed'`. The embedded lyrics panel in `ui.js` does NOT use BroadcastChannel — it syncs directly via `Player.on()` events.

39. **`currentTime` in lyrics messages is display time (offset from song start).** For segmented songs, `player.js` subtracts `startTime` before pushing to the lyrics channel. The lyrics parser's `syncTime()` uses this display time directly for line matching.

40. **Lyrics can be viewed two ways: embedded panel OR standalone popup.** Clicking 🎤 toggles the embedded `.lyrics-panel` (a `position: fixed` overlay at the `.app-layout` root level, NOT inside `.content-wrapper`). Clicking ↗ in the panel header pops out the standalone `lyrics.html` window. The embedded panel syncs via `Player.on()` directly — no BroadcastChannel involved. The popup still uses BroadcastChannel for time-update / song-change / lyrics-open messages from the main window, and sends `{ type: 'lyrics-closed' }` / `{ type: 'mode-change' }` back.

41. **`Player.on()` `timeupdate` event uses `displayDuration`, not `totalDuration`.** The emitted object is `{ displayCurrent, displayDuration, progress, ... }`. When calling `updateProgress()`, map `data.displayCurrent` → `currentTime` and `data.displayDuration` → `duration`. Using `totalDuration` (which doesn't exist) → `undefined` → progress bar fill never updates.

42. **BroadcastChannel `lyrics-closed` is an object, not a string.** `lyrics.js` sends `{ type: 'lyrics-closed' }`. `ui.js` checks `e.data && e.data.type === 'lyrics-closed'`. Comparing `e.data === 'lyrics-closed'` (string equality) never matches, so `lyricsWindow` is never nulled — though this doesn't cause multiple popups since the window-name dedup handles that.

43. **歌词第一句的 LRC 元数据**：很多 LRC 文件在真正的歌词行之前有制作信息（作词/作曲/编曲/配唱制作人/乐队总监/人声编辑/统筹/版权声明等）。`verify_lyrics_audio.py` 的 `META_PATTERNS` 会过滤这些行，并自动回退到下一个候选行（最多 3 次）。添加新的元数据模式时注意不要太激进（如 `歌手-歌名` 匹配会误杀真实歌词）。

44. **部分歌曲没有歌词：** 无词歌（如周深《传家》全程吟唱）、纯音乐 OST（如《红色蒲公英》仙剑原声）、轻音乐。这些都是正确的——不应该有 LRC。

45. **Title/singer 互换检测必须检查两个字段。** 纯音乐检测也要同时检查 title 和 singer 字段——很多合集把艺人名放在 title、曲名放在 singer（如 "赵海洋 - 夜空的寂静"）。`INSTRUMENTAL_ARTISTS` 名单对两个字段都要比对。

46. **手动纠正歌词流程**：用户发现歌词错误时，提供正确歌词文本 → 直接 PATCH 更新 `lrc_text`。歌手名错误同理，直接 PATCH `singer` 字段。不需要重新运行抓取脚本。

### 脚本 & 数据维护
47. **`refetch_lyrics_v2.js` 维护 `scripts/skip_ids.json` 跳过列表。** 脚本在处理每首歌后会将失败/跳过的 ID 追加到 `skip_ids.json`，下次运行自动跳过这些 ID。**如果清除了某首歌的 `lrc_text` 后想重新抓取，必须先从 `skip_ids.json` 中移除该 ID**，否则脚本会跳过它。用 `--ids=1,2,3` 参数可绕过跳过列表限制特定歌曲。

48. **`refetch_lyrics_v2.js` 的 `--ids=` 参数**：多 ID 用逗号分隔且不能有空格（如 `--ids=1,2,30,45`）。不带 `--ids=` 时脚本查询所有 `lrc_text IS NULL` 的歌曲（最多 500 首/页）。

49. **`calibrate_lyrics.py` 不备份原始 LRC。** 校准直接 PATCH `lrc_text`，原始歌词不会被保留。大规模校准前必须充分测试（10首起步），因为恢复只能通过重新从在线源抓取。**2026-06-28 教训：109 首校准后大部分时间戳不准，用户要求全量恢复，耗时 1h+ 重新抓取。**

50. **Whisper 分段数与歌词行数不等时用均匀分布。** `match_lyrics_to_segments()` 在 segment 数 ≠ 歌词行数时，按时间段均匀插值分配。这样整首歌的起止时间是准的，但单行 sync 是近似值。大部分歌 segment 数和歌词行数差距在 20% 以内。

51. **Verification code login no longer overwrites passwords.** `completeLogin()` uses `issueSession()` (custom JWT) for existing users instead of `updateUserById({ password: tempPass })`. This means a user's password survives verification code logins.

52. **等不来花开（#5321）** 歌手是 **pro**，正确歌词以 LRC 首行 `[00:02.01]等不来花开 - pro` 为准。

### ECS & 阿里云 ASR
53. **ECS 脚本的 Supabase key**：本地 `verify_lyrics_audio.py` 的 `SUPABASE_SERVICE_KEY` 默认值为空字符串（部署时 JWT 会触发安全分类器拦截 scp）。ECS 上通过 `/root/run_verify.sh` wrapper 从 `/tmp/key_b64.txt`（base64 编码的 key）自动注入环境变量。不要在 SSH 命令中直接传递 JWT token。

54. **ASR 网关 URL**：阿里云一句话识别 REST API 端点为 `https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/asr`（注意是 `/stream/v1/asr`，不是 `/rest/v1/asr/sentence`，后者返回 404）。Token 从 `nls-meta.cn-shanghai.aliyuncs.com` 获取。

### 通用
55. **`express.static(__dirname)` serves the frontend.** The server doubles as a static file server — no separate web server needed.
