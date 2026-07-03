# 个人听歌笔记与音乐鉴赏网站 — 设计方案

> **日期：** 2026-07-03  
> **状态：** 设计稿 v1  
> **目标：** 将通用音乐播放器改造为个人听歌笔记/音乐鉴赏/日常感悟网站，保留所有现有功能

---

## 1. 概述

### 1.1 目标

将现有音乐播放网站从通用播放器改造为"个人听歌笔记与音乐鉴赏"网站。核心变化：

- **首页**从歌曲封面网格改为**动态时间流**（博客文章+歌曲短评+收藏动态+每日推荐）
- 新增**博客系统**（Markdown 编辑，仅管理员可发布）
- 新增**歌曲短评**（登录用户可写，管理员短评在首页展示）
- 新增**每日推荐**（管理员的特殊博客文章）
- 保留所有现有功能（播放、收藏、歌单、歌词、标签、歌曲汇总、用户认证）

### 1.2 设计原则

- **渐进增强**：现有功能零删除，只新增不改造现有逻辑
- **最小依赖**：博客编辑器使用纯 textarea + Markdown 预览（引入 `marked.js` ~10KB 负责渲染，`DOMPurify` 防 XSS）
- **一致性**：遵循现有 CSS 设计令牌（暗绿主题、毛玻璃效果）
- **可扩展**：动态流后端使用 `UNION ALL` 查询，新增类型只需加 UNION 分支

---

## 2. 数据模型

### 2.1 `notes` 表 — 博客文章

```sql
CREATE TABLE notes (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,                -- Markdown 正文
    summary TEXT,                         -- 摘要（自动截取或手动）
    cover_image TEXT,                     -- 可选封面图 URL
    tags TEXT[] DEFAULT '{}',             -- 标签数组
    daily_recommend BOOLEAN DEFAULT false, -- 是否为每日推荐
    song_id INTEGER REFERENCES songs(id) ON DELETE SET NULL,  -- 推荐的歌曲
    pinned BOOLEAN DEFAULT false,         -- 是否置顶
    published BOOLEAN DEFAULT false,      -- false=草稿, true=已发布
    published_at TIMESTAMPTZ,             -- 发布时间
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notes_published ON notes(published, published_at DESC);
CREATE INDEX idx_notes_daily ON notes(daily_recommend, published_at DESC) WHERE daily_recommend = true;
```

### 2.2 `reviews` 表 — 歌曲短评

```sql
CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating SMALLINT CHECK (rating >= 1 AND rating <= 5),
    content TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT false,        -- 管理员标记，首页动态流只展示管理员短评
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_reviews_song ON reviews(song_id, created_at DESC);
CREATE INDEX idx_reviews_feed ON reviews(is_admin, created_at DESC) WHERE is_admin = true;
```

### 2.3 `daily_recommends` 表

每日推荐复用 `notes` 表，通过 `daily_recommend = true` 和 `song_id` 字段标识。
不需要单独建表。

---

## 3. 后端 API

| 端点 | 方法 | 认证 | 速率限制 | 说明 |
|------|------|------|----------|------|
| `GET /api/feed` | GET | 否 | 100/min | 混合动态流（最近 20 条） |
| `GET /api/notes` | GET | 否 | 100/min | 博客列表（分页，?page=1&limit=10） |
| `GET /api/notes/:id` | GET | 否 | 100/min | 单篇文章详情 + Markdown |
| `POST /api/notes` | POST | 管理员 | 30/min | 创建文章 |
| `PUT /api/notes/:id` | PUT | 管理员 | 30/min | 更新文章 |
| `DELETE /api/notes/:id` | DELETE | 管理员 | 10/min | 删除文章 |
| `GET /api/notes/admin/list` | GET | 管理员 | 60/min | 获取所有文章（含草稿） |
| `GET /api/reviews?song_id=&limit=` | GET | 否 | 100/min | 获取某首歌的短评 |
| `GET /api/reviews/recent` | GET | 否 | 100/min | 最近短评（首页用） |
| `POST /api/reviews` | POST | 登录 | 10/min | 写短评 |
| `DELETE /api/reviews/:id` | DELETE | 作者/管理员 | 10/min | 删除短评 |
| `POST /api/notes/:id/set-daily` | POST | 管理员 | 10/min | 设/取消每日推荐 |

### 3.1 动态流 `/api/feed` 实现

```javascript
// 后端逻辑：UNION ALL 四种类型，按时间倒序，取前 20 条
// 返回统一的 feed 结构
[
  {
    type: 'note',              // 'note' | 'review' | 'favorite' | 'daily_recommend'
    id: 1,                     // 数据源主键
    title: '文章标题',
    summary: '文章摘要...',
    song_id: 123,              // 可选，关联歌曲
    song_title: '歌名',
    singer: '歌手',
    cover_url: '...',
    rating: 5,                 // 仅 review 类型
    content: '短评内容',        // 仅 review / daily_recommend 类型
    timestamp: '2026-07-03T10:00:00Z'
  },
  // ...
]
```

**查询策略（伪 SQL）：**

```sql
(
    SELECT 'note' AS type, id, title, summary, NULL AS song_id, 
           NULL AS content, NULL AS rating,
           NULL AS song_title, NULL AS singer, NULL AS cover_url,
           published_at AS timestamp
    FROM notes 
    WHERE published = true AND daily_recommend = false
) UNION ALL (
    SELECT 'daily_recommend' AS type, n.id, n.title, n.summary, n.song_id,
           n.content AS content, NULL AS rating,
           s.title AS song_title, s.singer, s.cover_url,
           n.published_at AS timestamp
    FROM notes n
    LEFT JOIN songs s ON s.id = n.song_id
    WHERE n.published = true AND n.daily_recommend = true
) UNION ALL (
    SELECT 'review' AS type, r.id, s.title AS note_title, r.content, s.id AS song_id,
           r.content, r.rating,
           s.title AS song_title, s.singer, s.cover_url,
           r.created_at AS timestamp
    FROM reviews r
    JOIN songs s ON s.id = r.song_id
    WHERE r.is_admin = true
) UNION ALL (
    SELECT 'favorite' AS type, f.id, s.title, s.singer, s.id,
           NULL, NULL,
           s.title, s.singer, s.cover_url,
           f.created_at AS timestamp
    FROM favorites f
    JOIN songs s ON s.id = f.song_id
    WHERE f.user_id = '<ADMIN_UUID>'
)
ORDER BY timestamp DESC LIMIT 20;
```

---

## 4. 前端架构

### 4.1 侧边栏导航

新增 2 个侧边栏按钮，位于"我的歌单"下方：

```
侧边栏（更新后）:
├── 🏠 首页          ← 改造：动态流 + 推荐歌曲
├── 📊 歌曲汇总
├── ⭐ 我的收藏
├── 📋 我的歌单
├── ✍️ 听歌笔记      ← 新增
├── 💬 歌曲短评      ← 新增
└── [用户区域]
```

### 4.2 `_currentView` 状态机

新增状态：
```javascript
_currentView 新增值:
'notes'       — 博客文章列表（侧边栏"听歌笔记"）
'note'        — 单篇文章详情
'all-reviews' — 所有歌曲短评汇总
```

完整状态机：
```
'home' ──→ (动态流 + 最近在听)
    │
    ├──→ 'collection' → 'collection-items' → 'collection-songs'
    ├──→ 'favorites'
    ├──→ 'playlists' → 'playlist-songs'
    ├──→ 'search'
    ├──→ 'notes' → 'note' (点击文章)
    └──→ 'all-reviews'
```

### 4.3 首页渲染

```
┌────────────────────────────────────────────┐
│  🏠 首页  ·  青春旋律                     │
├────────────────────────────────────────────┤
│  ┌─ 动态时间线 ──────────────────────────┐  │
│  │                                        │  │
│  │  📌 每日推荐（置顶，有特殊样式）       │  │
│  │  ┌────────────────────────────────┐    │  │
│  │  │ ⭐ 今日推荐：《歌名》            │    │  │
│  │  │ 封面 + 推荐理由...              │    │  │
│  │  └────────────────────────────────┘    │  │
│  │                                        │  │
│  │  ✍️ 写了一篇博客                       │  │
│  │  ┌────────────────────────────────┐    │  │
│  │  │ 标题：xxxx                      │    │  │
│  │  │ 摘要：xxxxxxxx...               │    │  │
│  │  │ 📅 7月3日 · 阅读 3min 🏷️ #标签   │  │
│  │  └────────────────────────────────┘    │  │
│  │                                        │  │
│  │  💬 给《歌名》写了短评                 │  │
│  │  ┌────────────────────────────────┐    │  │
│  │  │ ⭐⭐⭐⭐☆                       │    │  │
│  │  │ "这首歌太好听了..."             │    │  │
│  │  └────────────────────────────────┘    │  │
│  │                                        │  │
│  │  ⭐ 收藏了《歌名》                      │  │
│  │  ┌────────────────────────────────┐    │  │
│  │  │ 🎵 封面 · 歌名 — 歌手          │    │  │
│  │  └────────────────────────────────┘    │  │
│  │                                        │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  📌 推荐歌曲（可横向滚动）                   │
│  ──────────────────────────────              │
│  [封面1][封面2][封面3][封面4]...[查看更多→]  │
│                                              │
│  🖊️ [写新文章] 按钮（仅管理员可见，固定右下） │
└──────────────────────────────────────────────┘
```

### 4.4 博客文章详情页

```
┌────────────────────────────────────┐
│  ← 返回  听歌笔记                  │
├────────────────────────────────────┤
│  🏷️ #标签1  #标签2                 │
│                                    │
│  # 文章标题                        │
│                                    │
│  📅 2026年7月3日 · ☕ 3分钟阅读    │
│                                    │
│  — 内容分隔线 —                    │
│                                    │
│  [Markdown 渲染内容]               │
│                                    │
│  正文段落...                       │
│                                    │
│  🎵 关联歌曲：[点击播放]           │
│     歌名 — 歌手                   │
│                                    │
│  更多正文...                       │
│                                    │
│  ————————————————                   │
│  [✏️ 编辑]（仅管理员可见）          │
└────────────────────────────────────┘
```

### 4.5 博客编辑器（弹窗/模态框）

- 管理员的模态框编辑器，支持：
  - 标题输入（text input）
  - 正文 textarea（Markdown 语法）
  - "插入歌曲"按钮 → 搜索歌曲 → 生成 `[song:id]` 占位符
  - 标签输入（输入后回车添加，点击 × 删除）
  - 是否"设为每日推荐"开关
  - 如果是每日推荐，选一首关联歌曲
  - 按钮：保存草稿 / 预览 / 发布
- 预览弹窗使用 `marked.js` 渲染 Markdown

### 4.6 歌曲短评交互

**在歌词面板集成：**
- 歌词面板底部新增 `.reviews-inline` 区域
- 显示该歌曲的前 3 条短评 + "查看全部"
- 管理员短评有 👑 标记
- 底部有输入框 + ✏️ 提交（登录用户可写）
- 评分用 ⭐ × 5 点击选择

**短评汇总页（`all-reviews`）：**
- 按时间倒序展示所有短评
- 每条显示歌曲封面（小）、歌名、评分、内容、作者
- 点击歌曲封面 → 播放该歌曲

### 4.7 博客列表页

```
┌──────────────────────────────────┐
│  ✍️ 听歌笔记                     │
│  [✏️ 写新文章] （仅管理员可见）   │
│                                  │
│  ┌─ 文章卡片 ────────────────┐  │
│  │ 📅 7月3日                   │  │
│  │ ## 文章标题                 │  │
│  │ 摘要：前120字...            │  │
│  │ 🏷️ #流行 #推荐               │  │
│  │ [阅读全文 →]                │  │
│  └────────────────────────────┘  │
│  ┌─ 文章卡片 ────────────────┐  │
│  │ ...                        │  │
│  └────────────────────────────┘  │
│  [加载更多]                      │
└──────────────────────────────────┘
```

---

## 5. CSS 样式

### 5.1 动态流卡片

```css
.feed-card {
    background: var(--bg-elevated);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 12px;
    cursor: pointer;
    transition: background 0.2s, transform 0.15s;
}
.feed-card:hover { background: var(--bg-hover); }
.feed-card:active { transform: scale(0.99); }

/* 每类卡片左侧色条 */
.feed-card--note     { border-left: 3px solid var(--accent); }       /* 绿色 */
.feed-card--review   { border-left: 3px solid #F39C12; }             /* 橙色 */
.feed-card--favorite { border-left: 3px solid #E74C3C; }             /* 红色 */
.feed-card--daily    { border-left: 3px solid #9B59B6; }             /* 紫色 */
```

### 5.2 博客文章详情

```css
.note-detail {
    max-width: 720px;
    margin: 0 auto;
    padding: 24px 0;
    line-height: 1.8;
    color: var(--text-primary);
}
.note-detail h1 { font-size: 26px; font-weight: 700; margin: 0 0 8px; }
.note-detail h2 { font-size: 20px; font-weight: 600; margin-top: 28px; }
.note-detail h3 { font-size: 17px; font-weight: 600; margin-top: 20px; }
.note-detail p { margin-bottom: 16px; }
.note-detail blockquote {
    border-left: 3px solid var(--accent);
    padding-left: 16px;
    color: var(--text-secondary);
    margin: 16px 0;
}
.note-detail code {
    background: var(--bg-code, rgba(255,255,255,0.06));
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 0.9em;
}
.note-detail pre { /* 代码块 */ }
.note-detail .song-embed {
    display: flex; align-items: center; gap: 12px;
    padding: 12px; border-radius: 8px;
    background: var(--bg-elevated); cursor: pointer;
}
```

### 5.3 编辑器

```css
.note-editor textarea {
    width: 100%; min-height: 360px;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 8px; padding: 16px;
    color: var(--text-primary);
    font-family: 'Courier New', monospace;
    font-size: 14px; line-height: 1.7;
    resize: vertical;
}
.note-editor textarea:focus {
    outline: none; border-color: var(--accent);
}
.tag-chip {
    display: inline-flex; align-items: center; gap: 4px;
    background: var(--accent-dim, rgba(77,184,141,0.15));
    color: var(--accent); border-radius: 12px;
    padding: 2px 10px; font-size: 13px;
}
.tag-chip .remove { cursor: pointer; opacity: 0.6; }
.tag-chip .remove:hover { opacity: 1; }
```

---

## 6. 交互细节

### 6.1 点击动态流卡片

| 卡片类型 | 点击行为 |
|----------|----------|
| 博客文章 (`note`) | `navigateToNote(id)` → 文章详情页 |
| 每日推荐 (`daily_recommend`) | 播放关联歌曲（有每日推荐弹窗说明） |
| 歌曲短评 (`review`) | 播放该歌曲，打开歌词面板 |
| 收藏动态 (`favorite`) | 播放该歌曲 |

### 6.2 歌曲嵌入（博客正文）

博客正文中使用 `[song:123]` 格式标记嵌入歌曲。
渲染时检测 `\[song:(\d+)\]` 正则，从 `_songCache` 查找歌曲，生成可点击的嵌入卡片。
点击嵌入卡片 → `Player.playSongById(id)`。

### 6.3 管理员编辑器入口

- 侧边栏"听歌笔记"列表页顶部显示"✏️ 写新文章"按钮（仅管理员）
- 文章详情页底部显示"✏️ 编辑"按钮（仅管理员）
- 首页右下角浮动"🖊️"按钮（仅管理员可见）

### 6.4 Markdown 渲染

- 使用 `marked.js` (CDN, ~10KB gzipped) 在客户端渲染 Markdown
- 使用 `DOMPurify` (CDN, ~6KB) sanitize HTML 防止 XSS
- 渲染后在 DOM 中查找 `[song:123]` 占位符，替换为可点击的歌曲嵌入卡片
- `index.html` 的 `<head>` 中异步加载两个库

---

## 7. Markdown 渲染方案

**为什么用 `marked.js` + `DOMPurify`：**
- 比手写解析器可靠（支持表格、代码块、嵌套列表等）
- **marked** ~10KB 压缩，**DOMPurify** ~6KB 压缩，对加载时间影响极小
- DOMPurify 是业界标准 XSS 防护（OWASP 推荐）
- 两个库都支持 CDN 异步加载，不阻塞页面渲染

**加载方式：**
```html
<!-- index.html head 末尾 -->
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js" defer></script>
<script src="https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js" defer></script>
```

**渲染流程（ui.js）：**
```javascript
function renderMarkdown(text) {
    if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
        return escapeHtml(text).replace(/\n/g, '<br>'); // fallback
    }
    const raw = marked.parse(text);
    const clean = DOMPurify.sanitize(raw);
    // 替换歌曲嵌入
    return clean.replace(/\[song:(\d+)\]/g, (m, id) => {
        const song = _songCache[id];
        if (song) return `<div class="song-embed" data-song-id="${song.id}">🎵 ${escapeHtml(song.title)} — ${escapeHtml(song.singer || '')}</div>`;
        return m; // 找不到歌曲时保留原文
    });
}
```

---

## 8. 实施计划

### Phase 1: 数据库（0.5 天）
1. Supabase SQL Editor 执行 `notes` 表 DDL
2. Supabase SQL Editor 执行 `reviews` 表 DDL

### Phase 2: 后端 API（2 天）
1. `server.js` 添加管理员身份检测辅助函数（复用 `isAdminUser` 逻辑）
2. `GET /api/feed` — 混合动态流（UNION ALL 查询）
3. `GET /api/notes` — 已发布文章列表（分页）
4. `GET /api/notes/admin/list` — 所有文章含草稿
5. `GET /api/notes/:id` — 文章详情
6. `POST /api/notes` — 创建文章
7. `PUT /api/notes/:id` — 更新文章
8. `DELETE /api/notes/:id` — 删除文章
9. `GET /api/reviews?song_id=` — 歌曲短评
10. `GET /api/reviews/recent` — 最近短评
11. `POST /api/reviews` — 写短评
12. `DELETE /api/reviews/:id` — 删除短评
13. `POST /api/notes/:id/set-daily` — 每日推荐开关

### Phase 3: 前端 — CDN + 工具函数（0.5 天）
1. `index.html` 加载 marked.js + DOMPurify（defer）
2. `js/ui.js` 新增 `renderMarkdown()` 函数
3. 新增 `formatDate()`、`truncateSummary()` 等工具函数

### Phase 4: 前端 — 首页动态流（1.5 天）
1. 新增 `_feedCache` 缓存 + `fetchFeed()` 函数
2. `renderHomeFeed()` — 首页新渲染
3. `renderFeedCard(type, data)` — 四种卡片
4. 推荐歌曲横滑条（从 `_defaultSongs` 取 6-8 首）
5. 侧边栏激活状态更新

### Phase 5: 前端 — 博客系统（2 天）
1. `renderNotesList()` — 文章列表页
2. `renderNoteDetail(id)` — 文章详情 + Markdown 渲染 + 歌曲嵌入
3. `showNoteEditor(note?)` — 编辑器模态框
4. 标签增删交互
5. 文章卡片点击 → 详情页
6. 侧边栏"听歌笔记"按钮事件

### Phase 6: 前端 — 短评系统（1 天）
1. 歌词面板底部短评展示（`.reviews-inline`）
2. 短评输入 + 评分
3. `renderAllReviews()` — 短评汇总页
4. 侧边栏"歌曲短评"按钮事件

### Phase 7: 前端 — 每日推荐（0.5 天）
1. 编辑器中"设为每日推荐"选项 + 歌曲选择
2. 首页每日推荐卡片特殊样式（紫色边框 + "📌"标记）
3. 确保每日推荐在动态流中置顶

### Phase 8: CSS + 响应式 + 优化（1 天）
1. 动态流卡片样式 + 动画
2. 文章详情 Markdown 样式
3. 编辑器样式
4. 短评样式
5. 响应式适配（平板/手机）
6. 骨架屏加载动画
7. `content-visibility` / `will-change` 优化

### Phase 9: 测试与微调（1 天）
1. 全功能回归测试（播放、收藏、歌单等不受影响）
2. 博客 CRUD 全流程测试
3. 短评写入 + 展示测试
4. 首页动态流所有四种类型测试
5. 管理员/普通用户权限测试

**总计估计：10 天**

---

## 9. 不在此设计范围内的内容

- 用户个人主页（简化：只展示时间线）
- 富文本编辑器（使用纯 Markdown + textarea）
- 文章分类（使用标签替代）
- 图片上传（使用外部图床，管理员手动粘贴 URL）
- RSS 订阅
- 文章评论（非必要，可后续添加）
- 用户通知系统

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 首页加载性能（动态流 N+1 查询） | 中 | UNION ALL 单次查询 + 5 分钟内存缓存（`_feedCache`） |
| Markdown 渲染 XSS 漏洞 | 高 | DOMPurify sanitize + 严格 CSP |
| marked.js + DOMPurify CDN 加载失败 | 低 | fallback: 纯文本显示，无样式 |
| 现有功能被破坏 | 高 | 所有新功能只新增不修改现有代码，回归测试 |
| 博客编辑器过于简陋不好用 | 低 | MVP 先行，后续用户反馈再改进 |
| 歌曲嵌入 `[song:123]` 找不到歌曲 | 低 | 保留原文占位符，不报错 |
