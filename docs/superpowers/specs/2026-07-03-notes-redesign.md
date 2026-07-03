# 听歌笔记页面改造设计方案

**日期**: 2026-07-03  
**版本**: v1  
**范围**: 仅前端（`js/ui.js` + `css/style.css`），无后端变更

---

## 背景

用户反馈四个问题：
1. 首页笔记只有横向滑动，缺少纵向列表
2. 笔记详情中的关联歌曲点击无法播放（`_songCache` 未命中时）
3. 评论区提示用户输入 `[song:ID]` 语法不直观
4. 评论区卡片不显示该评论所属的笔记标题

## 设计目标

- 最小改动，所有变更集中在 `js/ui.js` 和 `css/style.css`
- 不新增文件，不改动后端 API
- 保持现有架构和代码风格

---

## 模块 1：首页笔记 — 横竖混合布局

**改动文件**: `js/ui.js` + `css/style.css`

### JS 变更

1. **`renderNewHome()`（第 664 行附近）**：在 `renderRecentNotes()` 后追加 `renderNoteVerticalList(data.recentNotes)` 调用

2. **新增 `renderNoteVerticalList(notes)`**：
   - 取 `notes.slice(5)`（前 5 条由横滑展示）
   - 若无则返回空字符串
   - 每项渲染为 `<div class="note-card" data-action="feed-open-note" data-id="">`
   - 显示：日期、标题、摘要（120 字符）、标签
   - 参数 `showHeader` 控制是否显示"更多文章"标题行

### CSS 变更

- 直接复用现有 `.note-card`（第 4062-4105 行），无需新增样式
- 新增 `.note-vertical-section-header`（"更多文章"标题，与 `.home-section-header` 风格一致）

---

## 模块 2：笔记中歌曲播放修复

**改动文件**: `js/ui.js`

### 问题

`navigateToNote()` 在 `_songCache` 未命中时渲染无 `data-action` 的占位卡片，点击无响应。

### 解决

1. **`navigateToNote()`（第 1070-1078 行）**：未命中时仍添加 `data-song-id="${note.song_id}" data-action="play-embed-song"`
   - 初始文字为 "加载中..." + "歌曲ID #N"
   - 后续可通过异步加载更新

2. **`playSongById(songId)`（第 638 行）**：从同步改为 `async`
   - 优先检查 `_songCache[songId]`
   - 未命中时 fetch `/api/songs?bvid=xxx` 或直接 fetch `/api/songs` 查找
   - 找到后 `mergeToCache()` + `Player.playAll()`
   - 失败时 `showToast('⚠️ 无法加载歌曲信息')`

3. **`play-embed-song` handler（第 2498 行）**：移除 `_songCache[songId]` 前置检查
   ```js
   // 修改前
   if (songId && _songCache[songId]) { playSongById(songId); }
   // 修改后
   if (songId) { playSongById(songId); }
   ```

---

## 模块 3：去掉 `[song:ID]` 输入提示

**改动文件**: `js/ui.js`

### 删除 3 处提示

1. **第 1167 行**：`<div class="comment-hint">💡 输入 <code>[song:歌曲ID]</code> 可嵌入歌曲卡片</div>` → 整行删除
2. **第 1171 行**：`（支持 <code>[song:ID]</code> 嵌入歌曲）` → 删除括号内文字
3. **第 1190-1198 行**：`commentInput.focus` 事件监听 → 整块删除

### 保留

- `renderMarkdown()` 仍支持 `[song:ID]` 渲染（向后兼容）

---

## 模块 4：评论卡片显示笔记标题

**改动文件**: `js/ui.js` + `css/style.css`

### JS 变更

1. **`renderCommentItem(c, noteId)` 增加第三个参数 `noteTitle`**（第 1202 行）

2. **在评论内容下方追加来源行**：
   ```js
   html += `<div class="comment-source">
       来自《<span data-action="feed-open-note" data-id="${noteId}">${escapeHtml(noteTitle)}</span>》
   </div>`;
   ```

3. **更新调用处**：
   - `renderComments()` 中 `renderCommentItem(c, noteId)` → `renderCommentItem(c, noteId, note.title)`

### CSS 新增（第 4105 行之后）

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

---

## 验证方法

1. **首页混合布局**：打开首页 → 确认 5 条横滑卡片存在 → 向下滚动确认垂直笔记列表 → 点击卡片/列表项跳转笔记详情
2. **歌曲播放修复**：打开一篇有关联 `song_id` 的笔记 → 点击歌曲嵌入卡片 → 确认播放器启动并开始播放 → 在隐身模式下测试（清空 `_songCache`）
3. **提示删除**：打开任意笔记 → 滚动到评论区 → 确认无 `[song:ID]` 提示文字 → 确认 `focus` 事件无 toast
4. **评论来源显示**：查看评论列表 → 每条评论底部确认显示"来自《笔记标题》"→ 点击笔记标题跳转到对应笔记详情页面
5. **回归测试**：标签页浏览 → 搜索 → 收藏/歌单 → 歌词面板 → 播放器控制
