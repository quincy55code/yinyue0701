# 听歌笔记页面改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 改造首页笔记为横竖混合布局、修复笔记内歌曲播放、去掉 `[song:ID]` 提示、评论显示笔记来源标题

**Architecture:** 全部在前端 `js/ui.js` + `css/style.css` 内完成，无后端变更。4 个独立模块按依赖顺序执行：先修播放（模块 2），接着做混合布局（模块 1）、改评论来源（模块 4）、最后去提示（模块 3）。

**Tech Stack:** Vanilla JS (IIFE), CSS

## Global Constraints

- 仅修改 `js/ui.js` 和 `css/style.css`，不新增文件
- 行号引用基于 2026-07-03 的快照，实际行号可能有 ±5 偏移
- 所有变更保持现有避坑规则（`_songCache` 是对象不是数组；`playSongById` 在 `ui.js` 不在 `Player`；`content-wrapper` 必须 `overflow:hidden` 等）

---

### Task 0: 启动服务器确认当前状态

- [ ] **Step 1: 确认正在运行的服务器进程**

```bash
# 检查进程
netstat -ano | grep 8765
```

- [ ] **Step 2: 在浏览器打开首页，浏览一篇带 song_id 的笔记** — 确认"歌曲 #N"灰色卡片点击无响应

---

### Task 1: 修复合联歌曲无法播放（模块 2）

**Files:**
- Modify: `js/ui.js`

**Interfaces:**
- Consumes: `_songCache`（全局对象）、`mergeToCache()`（ui.js 第 243 行）、`Player.playAll()`（js/player.js）
- Produces: 异步 `playSongById(songId)`、修正后的注详情中灰色卡片

- [ ] **Step 1: 修改 `navigateToNote()` 中的 fallback 渲染（约第 1072 行）**

给未缓存的歌曲占位也加上 `data-action="play-embed-song"` 和 `data-song-id`：

```js
// 修改前（约第 1070-1078 行）
} else {
    // 不在缓存中，尝试用 note 自带的 song_title/singer 回退
    html += `<div class="song-embed" style="margin:12px 0;opacity:0.7">
        <span class="song-embed-icon">🎵</span>
        <div class="song-embed-info">
            <div class="song-embed-title">歌曲 #${note.song_id}</div>
        </div>
    </div>`;
}

// 修改后
} else {
    html += `<div class="song-embed" data-song-id="${note.song_id}" data-action="play-embed-song" style="margin:12px 0;opacity:0.7">
        <span class="song-embed-icon">🎵</span>
        <div class="song-embed-info">
            <div class="song-embed-title">加载中...</div>
            <div class="song-embed-singer">歌曲ID #${note.song_id}</div>
        </div>
    </div>`;
}
```

- [ ] **Step 2: 修改 `playSongById()` 为异步并支持加载缺失歌曲（约第 638 行）**

```js
// 修改前
function playSongById(songId) {
    const song = _songCache[songId];
    if (song) {
        Player.playAll([song], 0);
    }
}

// 修改后
async function playSongById(songId) {
    const song = _songCache[songId];
    if (song) {
        Player.playAll([song], 0);
        return;
    }
    // 从后端获取歌曲元数据
    try {
        const res = await fetch(`/api/songs?limit=1`);
        // 不支持直接按 id 查询，遍历缓存或从搜索结果中找
        // 先尝试从已有 API 获取：/api/search?id=xxx 不可行，改用按 song_id 查询
        // 走 Supabase REST: GET /songs?id=eq.{songId}
        const supabaseRes = await fetch(`/api/songs?id=${songId}`);
        if (supabaseRes.ok) {
            const data = await supabaseRes.json();
            // data 可能是数组或 { data: [...] }
            const songs = Array.isArray(data) ? data : (data.data || []);
            if (songs.length > 0) {
                mergeToCache(songs);
                Player.playAll([_songCache[songId]], 0);
                return;
            }
        }
        showToast('⚠️ 无法加载歌曲信息');
    } catch (err) {
        showToast('⚠️ 加载歌曲失败');
    }
}
```

**但注意**：`/api/songs` 不支持按 id 过滤。需要确认后端是否有按 id 查询的端点。若无，则改用以下策略：

```js
// 替代方案：从现有 songs API 中找出目标歌曲
async function playSongById(songId) {
    const song = _songCache[songId];
    if (song) {
        Player.playAll([song], 0);
        return;
    }
    // 先拉一批歌曲填充缓存（最多 300 首）
    try {
        const res = await fetch('/api/songs?limit=300');
        if (res.ok) {
            const songs = await res.json();
            const data = Array.isArray(songs) ? songs : (songs.data || []);
            mergeToCache(data);
            const found = _songCache[songId];
            if (found) {
                Player.playAll([found], 0);
                return;
            }
        }
        showToast('⚠️ 无法找到这首歌');
    } catch (err) {
        showToast('⚠️ 加载歌曲失败');
    }
}
```

- [ ] **Step 3: 修改 `play-embed-song` handler 去除缓存前置检查（约第 2498 行）**

```js
// 修改前
if (songId && _songCache[songId]) {
    playSongById(songId);
}
// 修改后
if (songId) {
    playSongById(songId);
}
```

- [ ] **Step 4: 测试播放修复**

```bash
# 在浏览器操作：
# 1. 打开一篇带 song_id 的笔记（网络面板中确认 song_id 非空）
# 2. 主动清一下缓存（localStorage.removeItem('music_player_session') 不相关）
# 3. 点击灰色的"加载中..." 歌曲卡片
# 4. 确认播放器启动并播放
# 5. 刷新后再次测试（缓存应被填充）
```

- [ ] **Step 5: 确认 `/api/songs` 是否支持 id 过滤**

```bash
# 检查 server.js 中是否有 id 过滤参数
grep -n "GET /api/songs" server.js
# 查看 api/songs handler 是否支持 ?id= 参数
```

如果当前不支持 id 过滤，第 2 步用替代方案即可。

- [ ] **Step 6: Commit**

```bash
git add js/ui.js
git commit -m "fix: 笔记中 fallback 歌曲卡片可点击 + playSongById 异步加载缺失歌曲"
```

---

### Task 2: 首页笔记 — 横竖混合布局（模块 1）

**Files:**
- Modify: `js/ui.js`
- Modify: `css/style.css`

**Interfaces:**
- Consumes: `data.recentNotes`（含 8 条笔记）、`renderRecentNotes()`、`.note-card` CSS 类
- Produces: `renderNoteVerticalList(notes)` 函数

- [ ] **Step 1: 在 `renderNewHome()` 中追加垂直列表调用（约第 664 行）**

```js
// 修改前
html += renderRecentNotes(data.recentNotes);

// 修改后
html += renderRecentNotes(data.recentNotes);
html += renderNoteVerticalList(data.recentNotes);
```

- [ ] **Step 2: 新增 `renderNoteVerticalList(notes)` 函数**

在 `renderRecentNotes()` 后面（约第 798 行）追加：

```js
function renderNoteVerticalList(notes) {
    if (!notes || notes.length <= 5) return '';

    const remaining = notes.slice(5);
    let itemsHtml = '';
    for (const note of remaining) {
        const date = new Date(note.published_at);
        const dateStr = date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日';
        const summary = note.summary
            ? escapeHtml(note.summary.slice(0, 120))
            : escapeHtml((note.content || '').replace(/[#*`\n\r]/g, '').slice(0, 120));
        const tags = note.tags || [];
        const tagsHtml = tags.map(t => `<span class="note-card-tag">${escapeHtml(t)}</span>`).join('');

        itemsHtml += `<div class="note-card" data-action="feed-open-note" data-id="${note.id}">
            <div class="note-card-date">${dateStr}</div>
            <div class="note-card-title">${escapeHtml(note.title || '')}</div>
            <div class="note-card-summary">${summary}</div>
            ${tagsHtml ? '<div class="note-card-tags">' + tagsHtml + '</div>' : ''}
        </div>`;
    }

    return `<div class="home-section">
        <div class="home-section-header">
            <h3>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-4px;margin-right:6px"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                更多文章
            </h3>
            <span class="home-section-link" data-action="nav-notes">查看全部 →</span>
        </div>
        ${itemsHtml}
    </div>`;
}
```

- [ ] **Step 3: 测试混合布局**

```bash
# 浏览器操作：
# 1. 刷新首页
# 2. 确认横滑区域显示 5 条卡片
# 3. 向下滚动，确认出现"更多文章"垂直列表（若数据 >= 6 条）
# 4. 点击垂直列表中的一条，确认跳转到笔记详情
```

- [ ] **Step 4: Commit**

```bash
git add js/ui.js css/style.css
git commit -m "feat: 首页笔记横竖混合布局 — 首屏横滑 5 条 + 下方垂直列表"
```

---

### Task 3: 评论卡片显示笔记来源标题（模块 4）

**Files:**
- Modify: `js/ui.js`
- Modify: `css/style.css`

- [ ] **Step 1: 为 `renderCommentItem()` 增加 `noteTitle` 参数并在内容下方追加来源行（约第 1202 行）**

```js
// 修改前
function renderCommentItem(c, noteId) {
    // ...
    return `<div class="comment-item" data-comment-id="${c.id}">
        ${avatarHtml}
        <div class="comment-body">
            <div class="comment-meta">
                <span class="comment-username">${username}</span>
                <span class="comment-time">${timeStr}</span>
                ${(isOwner || isAdmin) ? `...` : ''}
            </div>
            <div class="comment-text">${renderedContent}</div>
        </div>
    </div>`;
}

// 修改后
function renderCommentItem(c, noteId, noteTitle) {
    // ... 前 1200 行不变 ...
    return `<div class="comment-item" data-comment-id="${c.id}">
        ${avatarHtml}
        <div class="comment-body">
            <div class="comment-meta">
                <span class="comment-username">${username}</span>
                <span class="comment-time">${timeStr}</span>
                ${(isOwner || isAdmin) ? `...` : ''}
            </div>
            <div class="comment-text">${renderedContent}</div>
            <div class="comment-source">来自《<span data-action="feed-open-note" data-id="${noteId}">${escapeHtml(noteTitle || '未知文章')}</span>》</div>
        </div>
    </div>`;
}
```

- [ ] **Step 2: 修改 `renderComments()` 中的调用处（约第 1179 行）**

```js
// 修改前
html += renderCommentItem(c, noteId);

// 修改后
html += renderCommentItem(c, noteId, note ? note.title : '');
```

- [ ] **Step 3: CSS 新增样式**

在 `css/style.css` 末尾、或 `.note-card` 样式块后（约第 4105 行后）追加：

```css
.comment-source {
    font-size: 12px;
    color: var(--text-tertiary);
    margin-top: 6px;
    cursor: default;
}
.comment-source span {
    color: var(--text-secondary);
    cursor: pointer;
    transition: color 0.2s;
}
.comment-source span:hover { color: var(--accent); }
```

- [ ] **Step 4: 测试评论来源显示**

```bash
# 浏览器操作：
# 1. 打开一篇有评论的笔记
# 2. 确认每条评论底部显示"来自《笔记标题》"
# 3. 点击笔记标题 → 应跳转到对应笔记详情（当前页面已是该笔记，不做导航）
#    注意：若当前已在同一笔记，不应重复导航（现有 feed-open-note 逻辑已处理）
# 4. 返回首页，查看最新评论动态区域 — 确认已有"在《标题》中评论"提示，不需再加来源
```

- [ ] **Step 5: Commit**

```bash
git add js/ui.js css/style.css
git commit -m "feat: 评论卡片底部显示笔记来源标题，点击可跳转"
```

---

### Task 4: 去掉 `[song:ID]` 输入提示（模块 3）

**Files:**
- Modify: `js/ui.js`

- [ ] **Step 1: 删除已登录用户提示（第 1167 行）**

```js
// 删除这一整行：
html += `<div class="comment-hint">💡 输入 <code>[song:歌曲ID]</code> 可嵌入歌曲卡片</div>`;
```

- [ ] **Step 2: 删除未登录用户提示中的 `[song:ID]` 语法（约第 1171 行）**

```js
// 修改前：
<span data-action="show-auth">登录</span>后可发表评论（支持 <code>[song:ID]</code> 嵌入歌曲）

// 修改后：
<span data-action="show-auth">登录</span>后可发表评论
```

- [ ] **Step 3: 删除 focus toast 提示（约第 1190-1198 行）**

```js
// 删除整个 commentInput.focus 监听块：
const commentInput = document.getElementById('commentInput');
if (commentInput) {
    commentInput.addEventListener('focus', () => {
        if (!commentInput.dataset.helped) {
            showToast('💡 输入 [song:歌曲ID] 可嵌入歌曲卡片');
            commentInput.dataset.helped = 'true';
        }
    });
}
```

- [ ] **Step 4: 测试无提示**

```bash
# 浏览器操作：
# 1. 打开一篇笔记，滚动到评论区
# 2. 登录状态下确认无 💡 提示行
# 3. 点击评论输入框 focus → 确认无 toast 弹出
# 4. 登出再刷新 → 确认未登录提示中无 [song:ID] 语法文字
# 5. 在评论中输入 [song:1] 后发表 → 确认仍可渲染为歌曲卡片（向后兼容）
```

- [ ] **Step 5: Commit**

```bash
git add js/ui.js
git commit -m "feat: 去掉评论区 [song:ID] 输入提示（renderMarkdown 向后兼容保留）"
```

---

### Task 5: 完整回归测试

- [ ] **Step 1: 启动/重启服务器**

```bash
# 如果已有进程先 kill
taskkill //F //PID <PID>
/d/softwa/nodejs/node server.js &
```

- [ ] **Step 2: 遍历所有 4 个需求的验收场景**

| # | 场景 | 操作 | 预期 |
|---|------|------|------|
| 1 | 混合布局 | 首页→向下滚动 | 横滑 5 条 + 垂直列表 |
| 2 | 未知歌曲播放 | 打开带 song_id 笔记→点击灰色卡片 | 播放器启动 |
| 3 | 无提示 | 点击评论输入框 | 无 toast |
| 4 | 评论来源 | 查看评论列表 | 底部有"来自《...》" |

- [ ] **Step 3: 回归测试** — 标签页 / 搜索 / 收藏 / 歌单 / 歌词面板 / 播放器控制

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "docs: 完成笔记改造回归测试"
```
