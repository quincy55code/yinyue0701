# Task 5: UI 集成 — 歌词按钮 + 打开/关闭逻辑

## Status: Complete

## Commit

`eb233f0` — feat: add lyrics button and window open/close logic

## Files Changed

| File | Change |
|------|--------|
| `index.html` | Added `<button class="btn-ctrl" id="btnLyrics" title="歌词">🎤</button>` in controls-row, before btnMode |
| `js/ui.js` | Added `lyricsWindow` variable, `btnLyrics` to cacheDom, lyrics window management functions, BroadcastChannel listener, button click binding, beforeunload listener |

## Verification Results

### Step 1: HTML button
- Lyrics button (🎤) inserted at line 70 of `index.html`, before `btnMode` (line 71). The controls-row now has 5 buttons: lyrics, mode, prev, play, next.

### Step 2: cacheDom
- `btnLyrics: document.getElementById('btnLyrics')` added to the `els` object in `cacheDom()`, line 24.

### Step 3: Lyrics window management
- `let lyricsWindow = null;` declared at line 8, after `const UI = (() => {`.
- `openLyricsWindow()` (line 594): opens `/lyrics.html?songId=...` as popup (360x520), with window.open popup-blocker guard. Sends `lyrics-open` via BroadcastChannel when the popup loads.
- `closeLyricsWindow()` (line 630): closes the popup if open, resets `lyricsWindow` to null.
- `setupLyricsChannel()` (line 637): listens on `music_player_lyrics` BroadcastChannel for `lyrics-closed` and `mode-change` messages.

### Step 4: Channel setup in init()
- `setupLyricsChannel()` called at line 967 in `init()`, before `setupGlobalListeners()`.

### Step 5: Button click binding
- `if (els.btnLyrics) els.btnLyrics.addEventListener('click', () => openLyricsWindow());` added at line 858 in `setupGlobalListeners()`, alongside other player control button bindings.

### Step 6: beforeunload listener
- `window.addEventListener('beforeunload', () => { closeLyricsWindow(); });` added at lines 975-978, at the end of `init()` before the closing brace.

### Syntax check
- `node --check js/ui.js` passed with no errors.

### Self-review
- All changes follow the task brief exactly (seven steps).
- Script load order in `index.html` preserved: auth.js -> playlist.js -> player.js -> ui.js.
- BroadcastChannel name `music_player_lyrics` matches Task 4's output.
- No new dependencies or breaking changes to existing code paths.
