# 笔记支持多首歌曲嵌入设计文档

## 背景

当前笔记（notes）功能仅支持关联**单首歌曲**（`notes.song_id`），展示为一条 `song-embed` 卡片。用户希望在笔记中嵌入**最多 5 首歌曲**，以类似「我的收藏」列表样式展示，并显示每首歌的目录路径。写笔记时通过弹窗搜索歌曲，搜索结果展示所有来源，由用户自由选择。

## 需求梳理

1. **笔记编辑器** — 搜索歌曲弹窗，搜索结果展示所有匹配的歌曲（含目录路径 `collection_path`），用户选择后添加到列表
2. **数据库** — 用 JSONB 字段 `song_ids` 存储歌曲 ID 数组，最多 5 首
3. **歌曲展示** — 以 `song-list` 列表样式渲染（封面缩略图 + 歌名 + 歌手 + 时长 + 目录路径），可点击播放
4. **笔记详情页** — `navigateToNote()` 中渲染多首歌曲列表
5. **首页笔记卡片** — linked songs 作为摘要信息补充（可选）

## 数据库变更

### `notes` 表

- 新增字段：`song_ids INTEGER[] DEFAULT '{}'`（JSONB → PostgreSQL INTEGER ARRAY 更合适，ID 数组，最多 5 个元素）
- `song_id` 保持不动（向前兼容，未来可废弃），但编辑器不再使用它，后端返回时也优先用 `song_ids`

**DDL：**
```sql
ALTER TABLE notes ADD COLUMN IF NOT EXISTS song_ids INTEGER[] DEFAULT '{}';
```

新建 SQL 文件 `sql/2026-07-04-notes-song-ids.sql`。

## 架构变更

### 后端 (`server.js`)

1. **CREATE/PUT 笔记** — 接受 `song_ids` 数组（代替 `song_id`），验证最多 5 个元素
2. **GET 笔记详情** — 返回带 `song_ids` 和关联的歌曲详情 `songs_data`
3. **GET /api/home** — 首页最近更新笔记也带上 `songs_data`
4. **GET /api/search** — 搜索结果已包含 `collection_path`，前端可直接使用

### 前端 (`js/ui.js`)

1. **`showNoteEditor()`** — 修改：
   - 歌曲选择 UI 从单首改为多首列表（Chips 显示已选歌曲）
   - 点击搜索按钮/区域弹出 Modal，展示搜索结果列表
   - 搜索结果展示 `collection_path`（目录路径），点击选择/取消
   - 最多 5 首限制，超过时提示
   - 已选歌曲显示为 Chip 列表（带移除按钮）

2. **`navigateToNote()`** — 修改：
   - 读取 `note.song_ids` 和 `note.songs_data`
   - 渲染为 `song-list` 样式（覆盖封面 + 歌名 + 歌手 + 时长 + 📂目录路径）
   - 每行 `data-action="play-embed-song"` 和 `data-song-index` 点击播放

3. **`saveNote()`** — 发送 `song_ids` 数组代替 `song_id`

4. **首页 `renderRecentNotes()` / `renderNoteVerticalList()`** — 可选：展示首条歌曲信息

### 样式 (`css/style.css`)

- 新增 `.note-song-list` 容器样式（参考 `.song-list`）
- `.note-song-list-item`（列表行，封面 44px + 信息 + 目录路径）
- 点击 hover 效果，保持与 `.song-list-item` 一致

## 详细设计

### 编辑器歌曲选择交互

```
[编辑笔记 Modal]
├── 标题输入
├── 摘要输入
├── 标签输入
├── 正文 textarea
├── 关联歌曲 ──────────────────
│   ├── [搜索歌曲] 按钮 → 点击弹出搜索 Modal
│   │   └── 搜索 Modal：
│   │       ├── 搜索输入框（聚焦自动搜索）
│   │       ├── 搜索结果列表（song-list 样式，每行显示 collection_path）
│   │       │   └── 点击选中/取消，已选的打勾标记
│   │       └── [确定] 按钮（关闭弹窗，同步已选歌曲到编辑器）
│   └── 已选歌曲 Chips（蓝色标签，带✕移除按钮，最多5个）
├── 每日推荐 toggle
├── 发布 toggle
└── [保存草稿] [发布]
```

### 笔记详情页歌曲展示

```
┌─ 标题 ─────────────────────────┐
│ 🏷️ 标签1 标签2                  │
│                                 │
│ 正文内容...                     │
│                                 │
│ ── 本文章提及的歌曲 ──          │
│ ┌─────────────────────────────┐ │
│ │ 🖼 告白气球 — 周杰伦 · 3:35  │ │  ← clickable
│ │    📂 华语金曲 > 周杰伦       │ │
│ ├─────────────────────────────┤ │
│ │ 🖼 七里香 — 周杰伦 · 3:58    │ │  ← clickable
│ │    📂 经典怀旧 > 华语经典     │ │
│ └─────────────────────────────┘ │
│                                 │
│ 评论区...                       │
└─────────────────────────────────┘
```

## 文件修改清单

| 文件 | 修改内容 |
|------|---------|
| `sql/2026-07-04-notes-song-ids.sql` | 新增 `ALTER TABLE` DDL |
| `server.js` | `POST /api/notes` + `PUT /api/notes/:id` 接受 `song_ids`，`GET /api/notes/:id` 返回 `songs_data`，`GET /api/home` 带上 `songs_data` |
| `js/ui.js` | `showNoteEditor()` 重构歌曲选择，新增搜索弹窗函数，`navigateToNote()` 多歌曲渲染，`saveNote()` 发 `song_ids` |
| `css/style.css` | 新增 `.note-song-list`、`.note-song-list-item`、`.song-search-modal` 样式 |

## 验证方案

1. 执行 SQL DDL 添加 `song_ids` 列
2. 重启服务器
3. 进入笔记编辑器，搜索歌曲，选择 3 首，保存并发布
4. 打开笔记详情页，确认 3 首以列表样式展示，每首有目录路径
5. 点击任意一首歌曲，确认开始播放
6. 编辑同一篇笔记，移除 1 首，新增 1 首（≤5），保存，确认变更生效
7. 尝试选择第 6 首，确认被阻止并提示
8. 首页最近更新列表确认不报错