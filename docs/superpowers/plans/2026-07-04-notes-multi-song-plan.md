# 笔记支持多首歌曲嵌入 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 笔记编辑器支持选择最多 5 首歌曲，笔记详情页以 song-list 样式展示多首可点击播放的歌曲

**Architecture:** notes 表新增 `song_ids INTEGER[]` 字段；后端在 CRUD 时读写该字段，GET 时回填 `songs_data`（歌曲详情数组）；前端编辑器改为多选搜索弹窗，详情页渲染多首列表

**Tech Stack:** Node.js + Express + Supabase PostgreSQL (PostgREST) + Vanilla JS

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `sql/2026-07-04-notes-song-ids.sql` | 新增 `song_ids` 列 DDL |
| `server.js` | 后端路由改动：POST/PUT/GET notes + GET /api/home |
| `js/ui.js` | 前端改动：编辑器多选 + 详情渲染 + 保存 |
| `css/style.css` | 新增列表和搜索弹窗样式 |

---

### Task 1: SQL DDL — 新增 song_ids 字段

**Files:**
- Create: `sql/2026-07-04-notes-song-ids.sql`

- [ ] **Step 1: 创建 SQL 文件**

```sql
-- sql/2026-07-04-notes-song-ids.sql
-- 在 Supabase SQL Editor 中执行
-- 为 notes 表添加 song_ids 数组字段，支持多首歌曲

ALTER TABLE notes ADD COLUMN IF NOT EXISTS song_ids INTEGER[] DEFAULT '{}';
```

- [ ] **Step 2: 在 Supabase SQL Editor 中执行**

打开 https://supabase.com/dashboard/project/orphftlwdwuvoscizndx/sql/new 粘贴并执行。

- [ ] **Step 3: 验证**

```sql
SELECT song_ids FROM notes LIMIT 5;
```

应返回 `{}`（空数组），无报错。

- [ ] **Step 4: Commit**

```bash
git add sql/2026-07-04-notes-song-ids.sql
git commit -m "feat: add song_ids INTEGER[] column to notes table"
```

---

### Task 2: 后端 — GET/POST/PUT notes 支持 song_ids + songs_data

**Files:**
- Modify: `server.js`（多处，见下文）

**Interfaces:**
- `POST /api/notes` 接受 `song_ids` 数组（代替 `song_id`），验证 ≤ 5
- `PUT /api/notes/:id` 同上
- `GET /api/notes/:id` 返回 `songs_data`（关联歌曲详情数组）
- `GET /api/home` 中的 recentNotes 和 hero 也带上 `songs_data`
- 新增 `attachSongsData(notes)` 工具函数

- [ ] **Step 1: 在 `formatSong` 附近添加 `attachSongsData` 函数**

在 `attachCollectionPaths` 函数之后（约 315 行）添加：

```javascript
// 批量给 notes 对象附加 songs_data（基于 song_ids 数组）
async function attachSongsData(notes) {
    if (!notes || notes.length === 0) return notes;

    // 收集所有 song_id
    const allIds = new Set();
    for (const note of notes) {
        const ids = note.song_ids || [];
        if (Array.isArray(ids)) ids.forEach(id => { if (id != null) allIds.add(id); });
    }
    // 也收集旧的 song_id（向前兼容）
    for (const note of notes) {
        if (note.song_id != null) allIds.add(note.song_id);
    }

    if (allIds.size === 0) {
        return notes.map(n => ({ ...n, songs_data: [] }));
    }

    const { data: songs } = await supabase
        .from('songs')
        .select('*')
        .in('id', [...allIds]);

    const songMap = {};
    if (songs) {
        const formattedSongs = songs.map(formatSong).filter(Boolean);
        const withTags = await attachTags(formattedSongs);
        const withPaths = await attachCollectionPaths(withTags);
        withPaths.forEach(s => { songMap[s.id] = s; });
    }

    return notes.map(n => {
        const ids = n.song_ids || [];
        const data = Array.isArray(ids)
            ? ids.map(id => songMap[id]).filter(Boolean)
            : [];
        return { ...n, songs_data: data };
    });
}
```

- [ ] **Step 2: 修改 `POST /api/notes`**

在路由处理函数中（约 2154 行），在接收 body 处添加 `song_ids`，替换 `song_id` 的使用：

```javascript
// 约 2154 行，修改 destructuring
const { title, content, summary, cover_image, tags, daily_recommend, song_ids, song_id, pinned, published } = req.body;

// 验证 song_ids（不超过 5 首）
const finalSongIds = Array.isArray(song_ids) ? song_ids.slice(0, 5) : (song_id != null ? [song_id] : []);

// 约 2164 行，修改 noteData 构建
const noteData = {
    title: title.trim(),
    content: content.trim(),
    summary: summary || null,
    cover_image: cover_image || null,
    tags: Array.isArray(tags) ? tags : [],
    daily_recommend: !!daily_recommend,
    song_ids: finalSongIds,       // 新增
    song_id: song_id || null,     // 保留兼容
    pinned: !!pinned,
    published: !!published,
    published_at: published ? now : null,
};
```

- [ ] **Step 3: 修改 `PUT /api/notes/:id`**

约 2196 行，同样的改动：

```javascript
// 修改 destructuring
const { title, content, summary, cover_image, tags, daily_recommend, song_ids, song_id, pinned, published } = req.body;

// 在 updateData 构建中：
if (song_ids !== undefined) updateData.song_ids = Array.isArray(song_ids) ? song_ids.slice(0, 5) : [];
if (song_id !== undefined) updateData.song_id = song_id || null;  // 保留
```

- [ ] **Step 4: 修改 `GET /api/notes/:id` — 返回 songs_data**

在约 2110 行附近，找到 `GET /api/notes/:id` 路由。在 `res.json(data)` 之前，attach songs_data：

```javascript
// 找到 res.json(data) 约 2144 行，改为：
const notesWithSongs = await attachSongsData([data]);
res.json(notesWithSongs[0]);
```

- [ ] **Step 5: 修改 `GET /api/notes`（列表）— 也带上 songs_data**

在约 2084 行附近：

```javascript
const notesWithSongs = await attachSongsData(data || []);
res.json({ data: notesWithSongs, total: count, page, limit });
```

- [ ] **Step 6: 修改 `GET /api/notes/admin/list`**

在约 2102 行附近：

```javascript
const notesWithSongs = await attachSongsData(data || []);
res.json(notesWithSongs);
```

- [ ] **Step 7: 修改 `GET /api/home` — recentNotes + hero 带上 songs_data**

在约 2434 行的查询中，为 notes 查询也加上 `song_ids` 字段：

第 2427 行 hero 查询的 select 增加 `song_ids`：
```javascript
.select('id, title, summary, content, tags, song_id, song_ids, daily_recommend, published_at')
```

第 2437 行 recentNotes 查询的 select 增加 `song_ids`：
```javascript
.select('id, title, summary, content, tags, song_id, song_ids, published_at')
```

在约 2534 行 `res.json(...)` 之前，attach songs_data：

```javascript
// 处理 recentNotes 的 songs_data
const recentNotesWithSongs = await attachSongsData(notesResult.data || []);

// 处理 hero 的 songs_data
let heroWithSongs = null;
if (heroResult.data) {
    const heroArr = await attachSongsData([heroResult.data]);
    heroWithSongs = heroArr[0] || heroResult.data;
}
```

然后修改返回值：

```javascript
res.json({
    hero: heroWithSongs,
    recentNotes: recentNotesWithSongs,
    songs,
    recentComments: processedComments,
});
```

- [ ] **Step 8: Commit**

```bash
git add server.js
git commit -m "feat: backend support for multi-song notes (song_ids + songs_data)"
```

---

### Task 3: 前端 CSS — 新增 note-song-list 和搜索弹窗样式

**Files:**
- Modify: `css/style.css`

- [ ] **Step 1: 在 `.song-embed` 之后（约 3811 行）添加 note-song-list 样式**

```css
/* ============================================
   笔记多首歌曲列表 (NOTE SONG LIST)
   ============================================ */
.note-song-list {
    margin: 16px 0;
    border-radius: 8px;
    overflow: hidden;
    background: var(--bg-elevated);
}

.note-song-list-header {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    padding: 10px 12px 4px 12px;
    letter-spacing: 0.3px;
}

.note-song-list-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    cursor: pointer;
    transition: background 0.15s;
    border-radius: 4px;
    margin: 0 4px;
}

.note-song-list-item:hover {
    background: var(--bg-hover);
}

.note-song-list-item:active {
    transform: scale(0.99);
}

.note-song-list-item.playing {
    background: rgba(77, 184, 141, 0.08);
}

.note-song-list-cover {
    width: 40px;
    height: 40px;
    border-radius: 6px;
    object-fit: cover;
    flex-shrink: 0;
}

.note-song-list-placeholder {
    width: 40px;
    height: 40px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
}

.note-song-list-info {
    flex: 1;
    min-width: 0;
}

.note-song-list-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.note-song-list-meta {
    font-size: 12px;
    color: var(--text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.note-song-list-path {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 1px;
}

/* 编辑器歌曲搜索结果弹窗 */
.song-search-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
}

.song-search-modal {
    background: var(--bg-elevated);
    border-radius: 16px;
    width: 520px;
    max-width: 90vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}

.song-search-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 16px 0 16px;
}

.song-search-header input {
    flex: 1;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid var(--border-color);
    background: var(--bg-root);
    color: var(--text-primary);
    font-size: 14px;
    outline: none;
}

.song-search-header input:focus {
    border-color: var(--accent);
}

.song-search-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
}

.song-search-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    cursor: pointer;
    transition: background 0.12s;
    border-left: 3px solid transparent;
}

.song-search-item:hover {
    background: var(--bg-hover);
}

.song-search-item.selected {
    background: rgba(77, 184, 141, 0.08);
    border-left-color: var(--accent);
}

.song-search-item-cover {
    width: 36px;
    height: 36px;
    border-radius: 4px;
    object-fit: cover;
    flex-shrink: 0;
}

.song-search-item-info {
    flex: 1;
    min-width: 0;
}

.song-search-item-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.song-search-item-meta {
    font-size: 11px;
    color: var(--text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.song-search-item-check {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.15s;
    font-size: 11px;
    color: transparent;
}

.song-search-item.selected .song-search-item-check {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
}

.song-search-empty {
    padding: 32px;
    text-align: center;
    color: var(--text-tertiary);
    font-size: 13px;
}

.song-search-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border-color);
}

/* 编辑器多首歌曲 Chips */
.selected-songs-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
}

.selected-song-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px 4px 10px;
    background: rgba(77, 184, 141, 0.12);
    border: 1px solid rgba(77, 184, 141, 0.25);
    border-radius: 20px;
    font-size: 12px;
    color: var(--text-primary);
    cursor: default;
}

.selected-song-chip .remove {
    cursor: pointer;
    opacity: 0.5;
    font-size: 14px;
    line-height: 1;
    color: var(--text-secondary);
}

.selected-song-chip .remove:hover {
    opacity: 1;
    color: var(--accent);
}
```

- [ ] **Step 2: Commit**

```bash
git add css/style.css
git commit -m "style: add note-song-list and song-search-modal styles"
```

---

### Task 4: 前端 ui.js — 编辑器多首歌曲选择 + 详情渲染多首 + 保存

**Files:**
- Modify: `js/ui.js`

**改动点：**

1. `showNoteEditor()` — 歌曲选择 UI 重构：搜索按钮→弹出 Modal 搜索列表→多选 Chips
2. 新增 `openSongSearchModal()` — 歌曲搜索弹窗逻辑
3. `navigateToNote()` — 渲染 `songs_data` 为 `note-song-list`
4. `saveNote()` — 发 `song_ids` 数组

- [ ] **Step 1: 修改 `showNoteEditor()` 中的歌曲搜索部分**

当前约 1321-1331 行的关联歌曲区域改为：

```javascript
// 约 1325 行附近，替换原有的 "关联歌曲" 区域
<div class="note-editor-field">
    <label>关联歌曲（最多 5 首，点击搜索添加）</label>
    <div class="song-selector">
        <button type="button" class="btn-song-search" id="btnSongSearch" style="padding:8px 16px;background:var(--bg-hover);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);cursor:pointer;font-size:13px;">
            🔍 搜索歌曲...
        </button>
        <div id="selectedSongsWrap" class="selected-songs-wrap">${selectedSongsHtml}</div>
    </div>
</div>
```

对应的 `selectedSongsHtml` 构建（替代原有 `songSelectorHtml`）：

```javascript
// 在 showNoteEditor 中，约 1298 行附近
let selectedSongIds = isEditing ? (noteData.song_ids || []) : [];
if (!selectedSongIds.length && selectedSongId) {
    selectedSongIds = [selectedSongId]; // 兼容旧数据
}
// 构建已选歌曲 Chips
let selectedSongsHtml = '';
selectedSongIds.forEach(id => {
    const song = _songCache[id];
    if (song) {
        selectedSongsHtml += `<span class="selected-song-chip" data-song-id="${id}">🎵 ${escapeHtml(song.title)} — ${escapeHtml(song.singer || '')} <span class="remove" data-action="clear-song" data-id="${id}">✕</span></span>`;
    } else {
        selectedSongsHtml += `<span class="selected-song-chip" data-song-id="${id}">歌曲 #${id} <span class="remove" data-action="clear-song" data-id="${id}">✕</span></span>`;
    }
});
```

在 editorState 中改为数组：

```javascript
const editorState = {
    tags: [...tags],
    selectedSongIds: selectedSongIds,   // 改为数组
    isEditing: isEditing,
    noteId: isEditing ? noteData.id : null,
};
```

清除歌曲事件改为按 ID 移除：

```javascript
// 约 1387 行
if (e.target.dataset.action === 'clear-song') {
    const id = parseInt(e.target.dataset.id);
    editorState.selectedSongIds = editorState.selectedSongIds.filter(sid => sid !== id);
    refreshSelectedSongs(editorState.selectedSongIds);
}
```

- [ ] **Step 2: 新增 `openSongSearchModal()` 函数**

在 `showNoteEditor` 之后（约 1450 行）添加：

```javascript
function openSongSearchModal(selectedIds, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'song-search-overlay';
    overlay.innerHTML = `
        <div class="song-search-modal">
            <div class="song-search-header">
                <input type="text" id="songSearchInput" placeholder="搜索歌曲..." autocomplete="off" autofocus>
                <button type="button" id="songSearchClose" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:18px;">✕</button>
            </div>
            <div class="song-search-list" id="songSearchList">
                <div class="song-search-empty">输入关键词搜索歌曲</div>
            </div>
            <div class="song-search-footer">
                <button type="button" class="btn-note-save" id="songSearchDone" style="padding:8px 20px;">确定 (${selectedIds.length}/5)</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#songSearchInput');
    const list = overlay.querySelector('#songSearchList');
    const doneBtn = overlay.querySelector('#songSearchDone');
    const closeBtn = overlay.querySelector('#songSearchClose');

    let currentResults = [];

    const renderList = (results, selected) => {
        if (!results.length) {
            list.innerHTML = '<div class="song-search-empty">未找到相关歌曲</div>';
            return;
        }
        list.innerHTML = results.map(song => {
            const isSelected = selected.includes(song.id);
            const cover = getCoverUrl(song);
            const path = song.collection_path || '';
            const durationStr = song.duration != null ? ' · ' + formatTime(song.duration) : '';
            return `<div class="song-search-item ${isSelected ? 'selected' : ''}" data-song-id="${song.id}">
                ${cover
                    ? `<img class="song-search-item-cover" src="${escapeHtml(cover)}" alt="" loading="lazy">`
                    : '<div class="song-search-item-cover" style="background:' + getCoverFallbackColor(song.id) + ';display:flex;align-items:center;justify-content:center;font-size:14px;">🎵</div>'}
                <div class="song-search-item-info">
                    <div class="song-search-item-title">${escapeHtml(song.title)} — ${escapeHtml(song.singer || '')}${durationStr}</div>
                    ${path ? '<div class="song-search-item-meta">📂 ' + escapeHtml(path) + '</div>' : ''}
                </div>
                <div class="song-search-item-check">${isSelected ? '✓' : ''}</div>
            </div>`;
        }).join('');
    };

    let tempSelected = [...selectedIds];

    input.addEventListener('input', debounce(async () => {
        const q = input.value.trim();
        if (q.length < 2) {
            list.innerHTML = '<div class="song-search-empty">输入关键词搜索歌曲</div>';
            return;
        }
        try {
            const res = await fetch('/api/search?q=' + encodeURIComponent(q));
            if (!res.ok) return;
            const data = await res.json();
            currentResults = data.results || [];
            mergeToCache(currentResults);
            renderList(currentResults, tempSelected);
        } catch {
            list.innerHTML = '<div class="song-search-empty">搜索出错</div>';
        }
    }, 300));

    list.addEventListener('click', (e) => {
        const item = e.target.closest('.song-search-item');
        if (!item) return;
        const id = parseInt(item.dataset.songId);
        const idx = tempSelected.indexOf(id);
        if (idx >= 0) {
            tempSelected.splice(idx, 1);
        } else {
            if (tempSelected.length >= 5) {
                showToast('最多选择 5 首歌曲');
                return;
            }
            tempSelected.push(id);
        }
        renderList(currentResults, tempSelected);
        doneBtn.textContent = `确定 (${tempSelected.length}/5)`;
    });

    doneBtn.addEventListener('click', () => {
        onConfirm(tempSelected);
        overlay.remove();
    });

    const close = () => overlay.remove();
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}
```

- [ ] **Step 3: 新增 `refreshSelectedSongs()` 辅助函数**

```javascript
function refreshSelectedSongs(ids) {
    const wrap = document.getElementById('selectedSongsWrap');
    if (!wrap) return;
    if (!ids.length) {
        wrap.innerHTML = '';
        return;
    }
    wrap.innerHTML = ids.map(id => {
        const song = _songCache[id];
        if (song) {
            return `<span class="selected-song-chip" data-song-id="${id}">🎵 ${escapeHtml(song.title)} — ${escapeHtml(song.singer || '')} <span class="remove" data-action="clear-song" data-id="${id}">✕</span></span>`;
        }
        return `<span class="selected-song-chip" data-song-id="${id}">歌曲 #${id} <span class="remove" data-action="clear-song" data-id="${id}">✕</span></span>`;
    }).join('');
}
```

- [ ] **Step 4: 在 `showNoteEditor` 中添加搜索按钮事件**

在第 1393 行附近，替换原有的 songSearch 事件监听：

```javascript
// 歌曲搜索弹窗按钮
const btnSongSearch = document.getElementById('btnSongSearch');
if (btnSongSearch) {
    btnSongSearch.addEventListener('click', () => {
        openSongSearchModal(editorState.selectedSongIds, (newIds) => {
            editorState.selectedSongIds = newIds;
            refreshSelectedSongs(newIds);
        });
    });
}
```

同时移除旧的歌曲搜索相关代码（约 1393-1412 行原有的 input 事件监听）。

- [ ] **Step 5: 修改 `saveNote()` — 发送 `song_ids` 数组**

约 1466-1474 行，body 中的 `song_id` 改为 `song_ids`：

```javascript
const body = {
    title,
    content,
    summary: summary || null,
    tags: state.tags,
    daily_recommend: dailyRec,
    song_ids: state.selectedSongIds || [],  // 改为数组
    published: publish,
};
// 旧 song_id 不再发送，但后端会兼容
```

- [ ] **Step 6: 修改 `navigateToNote()` — 渲染多首歌曲列表**

约 1112-1133 行，原有的单首 song-embed 渲染替换为多首列表渲染：

```javascript
// 在 'html += renderMarkdown(note.content);' 之前
// 替代原有的 if (note.song_id != null) 逻辑

if (note.songs_data && note.songs_data.length > 0) {
    html += '<div class="note-song-list">';
    html += '<div class="note-song-list-header">🎵 本文章提及的歌曲</div>';
    note.songs_data.forEach((song, i) => {
        const cover = getCoverUrl(song);
        const durationStr = song.duration != null ? formatTime(song.duration) : '';
        const path = song.collection_path || '';
        html += `
        <div class="note-song-list-item ${song.playing ? 'playing' : ''}" data-song-id="${song.id}" data-action="play-embed-song" style="--stagger-index:${Math.min(i, 19)}">
            ${cover
                ? `<img class="note-song-list-cover" src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">`
                : ''}
            <div class="note-song-list-placeholder" style="${cover ? 'display:none' : ''};background:${getCoverFallbackColor(i)}">🎵</div>
            <div class="note-song-list-info">
                <div class="note-song-list-title">${escapeHtml(song.title)} — ${escapeHtml(song.singer || '')}</div>
                <div class="note-song-list-meta">${durationStr}</div>
                ${path ? '<div class="note-song-list-path">📂 ' + escapeHtml(path) + '</div>' : ''}
            </div>
        </div>`;
    });
    html += '</div>';
}
```

同时移除约 1112-1133 行原有的 `if (note.song_id != null) { ... }` 代码块。

- [ ] **Step 7: 添加「播放多首笔记歌曲」的事件处理**

在 `play-embed-song` 的事件处理中（约 2526 行），确保点击 note-song-list-item 也能触发播放。

找到已有的事件处理代码（约 2522-2538 行的 `play-embed-song` 分支），它已经处理了 `[data-action="play-embed-song"]` 的点击。`.note-song-list-item` 也带有 `data-action="play-embed-song"` 和 `data-song-id`，理论上现有委托就能工作。

但需要验证它点击后能正确查找 `_songCache` 并播放。确认 `mergeToCache` 在 `navigateToNote` 的回调中已被调用？不是，但在 `navigateToNote` 中，从后端返回的 `songs_data` 中的歌曲对象如果没有进入 `_songCache`，点击播放时 `playSongById` 的 fallback 逻辑会去 `/api/songs?limit=300` 拉取。

更好的做法：在 `navigateToNote` 中渲染歌曲列表之前先 mergeToCache：

```javascript
// 在 note.songs_data 渲染之前
if (note.songs_data && note.songs_data.length > 0) {
    mergeToCache(note.songs_data);
    html += '<div class="note-song-list">';
    // ... 渲染
}
```

- [ ] **Step 8: Commit**

```bash
git add js/ui.js
git commit -m "feat: multi-song selection in note editor and rendering in note detail"
```

---

### Task 5: 首页笔记卡片兼容

**Files:**
- Modify: `js/ui.js`

首页渲染最近更新笔记的 `renderRecentNotes()` 和 `renderNoteVerticalList()` 需要使用新数据中的 `songs_data` 来展示歌曲信息。

- [ ] **Step 1: 修改 `renderRecentNotes()` — 注明关联歌曲数**

约 762 行，在 note-hscroll-card 的 summary 下方添加歌曲信息：

```javascript
// 约 797 行左右，在 summary 和 footer 之间
const songCount = note.songs_data ? note.songs_data.length : 0;
const songsHint = songCount > 0 ? `<div class="note-hscroll-songs">🎵 ${songCount} 首关联歌曲</div>` : '';
```

在卡片内合适位置插入 `songsHint`（在 `summary` 之后、`note-hscroll-footer` 之前）。

- [ ] **Step 2: 修改 `renderNoteVerticalList()` — 注明关联歌曲数**

类似改动，约 833 行：

```javascript
const songCount = note.songs_data ? note.songs_data.length : 0;
const songsHint = songCount > 0 ? `<div class="note-card-songs">🎵 ${songCount} 首关联歌曲</div>` : '';
```

在 `note-card-tags` 之后或 `note-card-title` 之后插入 `songsHint`。

- [ ] **Step 3: 添加对应的 CSS 小样式**

在 `css/style.css` 中约 835 行的 `.note-hscroll-summary` 之后：

```css
.note-hscroll-songs,
.note-card-songs {
    font-size: 11px;
    color: var(--accent);
    margin-top: 4px;
}
```

- [ ] **Step 4: Commit**

```bash
git add js/ui.js css/style.css
git commit -m "feat: show song count in note cards on homepage"
```

---

### 验证方案

1. 执行 SQL DDL（Supabase SQL Editor）
2. 重启服务器
3. 进入笔记编辑器 → 点击「搜索歌曲...」→ 搜索关键词 → 选 3 首 → 确定 → 确认显示 3 个 Chip
4. 保存并发布
5. 打开笔记详情 → 确认 3 首歌以列表样式展示（封面 + 歌名 + 歌手 + 时长 + 📂目录路径）
6. 点击任意一首 → 确认开始播放
7. 编辑笔记 → 移除 1 首 → 新增 1 首 → 保存 → 确认变更生效
8. 尝试选第 6 首 → 确认被阻止并提示
9. 首页笔记卡片确认显示歌曲数标记
