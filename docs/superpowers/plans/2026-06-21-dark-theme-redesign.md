# 极简暗色主题重设计 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将音乐播放器从暖桃色系升级为极简暗色 + 冰鸢尾紫点缀的高级感界面。

**Architecture:** 纯 CSS 变量驱动的暗色主题重写，所有样式集中在 `css/style.css`（约 1200 行 → 约 900 行），`css/lyrics.css` 同步适配，`index.html` 微调播放栏结构为单行布局并引入 Inter 字体。`js/ui.js` 新增视图切换动画和平板底部抽屉逻辑。不动后端和业务逻辑。

**Tech Stack:** 原生 CSS（CSS Variables, Flexbox, Grid, @keyframes）, 原生 JavaScript（BroadcastChannel, DOM manipulation）, Inter 字体（Google Fonts）

## Global Constraints

- 色值严格使用 spec 定义的 token：`--bg-root: #09090b`, `--bg-surface: #141416`, `--bg-hover: #1e1e21`, `--bg-active: #252528`
- 点缀色：`--accent: #a5a0f0`, `--accent-hover: #bdb8f5`, `--accent-active: #8b86d6`
- 字号仅用 11/12/14/16/20/24/32，禁用 13/15/18px
- 字重仅用 400/500/600/700
- 间距阶梯 4/8/12/20/32/48（4px 基准）
- 动效曲线：`--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`, `--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)`, `--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)`
- 时长：`--duration-fast: 150ms`, `--duration-base: 250ms`, `--duration-slow: 400ms`
- 播放栏单行布局，高度约 64px
- 主容器 `max-width: 1280px`
- 右侧面板宽度 300px
- 必须包含 `@media (prefers-reduced-motion: reduce)` 动效禁用
- 不修改 `server.js`, `js/player.js`, `js/playlist.js`, `js/auth.js`

---

### Task 1: CSS 变量 & Reset 基础

**Files:**
- Modify: `css/style.css`（全文替换）

**Interfaces:**
- Produces: 所有 CSS 变量 token、reset 规则、body 基础样式、滚动条样式 — 后续所有 Task 依赖这些变量

- [ ] **Step 1: 替换 `:root` CSS 变量块**

将现有的 `:root` 块（行 6-32）替换为：

```css
/* ============================================
   音乐播放器 — 极简暗色主题
   ============================================ */

/* ---------- CSS Variables ---------- */
:root {
    /* 背景层级 */
    --bg-root: #09090b;
    --bg-surface: #141416;
    --bg-hover: #1e1e21;
    --bg-active: #252528;

    /* 文字层级 */
    --text-primary: #f0f0f2;
    --text-secondary: #9a9aa0;
    --text-tertiary: #5c5c64;

    /* 点缀色 — 冰鸢尾紫 */
    --accent: #a5a0f0;
    --accent-hover: #bdb8f5;
    --accent-active: #8b86d6;
    --accent-glow: rgba(165, 160, 240, 0.12);

    /* 边框 (暗色下用半透明白色) */
    --border-subtle: rgba(255, 255, 255, 0.06);
    --border-card: rgba(255, 255, 255, 0.10);
    --border-active: rgba(255, 255, 255, 0.14);

    /* 阴影 — 暗色下用大扩散深黑影 */
    --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.3);
    --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.4);
    --shadow-lg: 0 16px 48px rgba(0, 0, 0, 0.5);

    /* 圆角 */
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;
    --radius-full: 9999px;

    /* 动效 */
    --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
    --duration-fast: 150ms;
    --duration-base: 250ms;
    --duration-slow: 400ms;

    /* 排版 */
    --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
    --font-mono: "JetBrains Mono", "SF Mono", "Cascadia Code", monospace;

    /* 间距阶梯 */
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 12px;
    --space-lg: 20px;
    --space-xl: 32px;
    --space-2xl: 48px;

    /* 歌曲主题色（保留用于标签色彩） */
    --song-1: #a5a0f0;
    --song-2: #f0b27a;
    --song-3: #85c1c9;
    --song-4: #c9a0dc;
}
```

- [ ] **Step 2: 替换 Reset & Base 样式**

将现有的 reset/base 块（行 34-55）替换为：

```css
/* ---------- Reset & Base ---------- */
*, *::before, *::after {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

html, body {
    height: 100%;
    overflow: hidden;
}

body {
    font-family: var(--font-sans);
    font-size: 14px;
    line-height: 1.6;
    letter-spacing: -0.01em;
    color: var(--text-primary);
    background: var(--bg-root);
    display: flex;
    flex-direction: column;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

/* ---------- Scrollbar (global dark) ---------- */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.10);
    border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.18);
}
```

- [ ] **Step 3: 验证**

启动服务器并打开浏览器：
```bash
/d/softwa/nodejs/node server.js
# 浏览器打开 http://localhost:8765
```

确认：背景为深黑色 `#09090b`，文字为浅灰白色，滚动条为 4px 半透明。

- [ ] **Step 4: Commit**

```bash
git add css/style.css
git commit -m "feat: add dark theme CSS variables and base reset"
```

---

### Task 2: 布局 & Header

**Files:**
- Modify: `css/style.css`（在 Task 1 基础上追加/替换）

**Interfaces:**
- Consumes: Task 1 的所有 CSS 变量

- [ ] **Step 1: 写入 Header 样式**

将现有 header 块替换为：

```css
/* ---------- Header ---------- */
.app-header {
    padding: 0 var(--space-xl);
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border-subtle);
}

.app-logo {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
}

.app-logo .icon {
    width: 32px;
    height: 32px;
    background: var(--accent);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: #fff;
}

.app-logo h1 {
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary);
}
```

- [ ] **Step 2: 写入 Main Layout 样式**

```css
/* ---------- Main Layout ---------- */
.app-main {
    flex: 1;
    display: flex;
    overflow: hidden;
    padding: 0 var(--space-xl);
    gap: var(--space-lg);
    max-width: 1280px;
    width: 100%;
    margin: 0 auto;
}

/* ---------- Song List Panel ---------- */
.song-list-panel {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.section-header {
    padding: var(--space-lg) 0 var(--space-sm);
    font-size: 11px;
    font-weight: 600;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

.song-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-sm) 0 var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
}

/* 视图容器 — 标签网格 / 歌曲列表共用 */
.view-container {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-sm) 0 var(--space-md);
}
```

- [ ] **Step 3: 验证**

重启服务器，确认：
- Header 高度 56px，底部有极淡分割线
- 内容区左右有 32px 边距
- 宽屏时内容居中不超 1280px

- [ ] **Step 4: Commit**

```bash
git add css/style.css
git commit -m "feat: add dark theme layout and header styles"
```

---

### Task 3: 歌曲卡片 & 按钮

**Files:**
- Modify: `css/style.css`（继续追加）

**Interfaces:**
- Consumes: Task 1 变量, Task 2 布局

- [ ] **Step 1: 写入歌曲卡片样式**

```css
/* Song Card */
.song-card {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md) 16px;
    background: var(--bg-surface);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: transform var(--duration-fast) var(--ease-spring),
                border-color var(--duration-fast) var(--ease-out),
                box-shadow var(--duration-fast) var(--ease-out);
    border: 1px solid transparent;
    position: relative;
    animation: cardEnter var(--duration-slow) var(--ease-out) both;
}

.song-card:hover {
    transform: translateY(-2px) scale(1.01);
    border-color: var(--border-card);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.song-card:active {
    transform: translateY(0) scale(0.99);
}

.song-card.playing {
    border-color: rgba(165, 160, 240, 0.25);
    animation: glowPulse 3s var(--ease-in-out) infinite;
}

.song-card .card-index {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-full);
    background: var(--bg-hover);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
    flex-shrink: 0;
    transition: background var(--duration-fast) var(--ease-out),
                color var(--duration-fast) var(--ease-out);
}

.song-card.playing .card-index {
    background: var(--accent);
    color: #fff;
}

.song-card .card-info {
    flex: 1;
    min-width: 0;
}

.song-card .card-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.song-card .card-meta {
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 2px;
}

.song-card .card-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
}
```

- [ ] **Step 2: 写入按钮样式（收藏、添加、删除）**

```css
/* Favorite Button */
.btn-fav {
    width: 34px;
    height: 34px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 20px;
    border-radius: var(--radius-full);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform var(--duration-fast) var(--ease-spring),
                color var(--duration-fast) var(--ease-out);
    color: var(--text-tertiary);
    line-height: 1;
}

.btn-fav:hover { transform: scale(1.18); }
.btn-fav:active { transform: scale(0.88); }

.btn-fav.favorited {
    color: #f87171;
    animation: heartPop 0.4s var(--ease-spring);
}

/* Add to Playlist Button */
.btn-add {
    width: 34px;
    height: 34px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 18px;
    border-radius: var(--radius-full);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform var(--duration-fast) var(--ease-spring),
                color var(--duration-fast) var(--ease-out);
    color: var(--text-tertiary);
}

.btn-add:hover {
    color: var(--accent);
    transform: scale(1.18);
}
```

- [ ] **Step 3: 写入 stagger 入场动画 keyframes**

```css
/* Card stagger entrance */
@keyframes cardEnter {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
}

@keyframes glowPulse {
    0%, 100% { box-shadow: 0 0 12px rgba(165, 160, 240, 0.04); }
    50%      { box-shadow: 0 0 28px rgba(165, 160, 240, 0.14); }
}

@keyframes heartPop {
    0%   { transform: scale(1); }
    30%  { transform: scale(1.35); }
    60%  { transform: scale(0.9); }
    100% { transform: scale(1); }
}
```

- [ ] **Step 4: 验证**

刷新浏览器，确认：
- 卡片背景为 `#141416`，hover 时上浮 2px + 微边框 + 阴影
- 播放中卡片有紫色边框 + 呼吸光晕
- 收藏按钮 hover 放大 1.18x，点击收藏有弹跳动画

- [ ] **Step 5: Commit**

```bash
git add css/style.css
git commit -m "feat: add dark theme song cards and button styles"
```

---

### Task 4: 标签系统

**Files:**
- Modify: `css/style.css`

**Interfaces:**
- Consumes: Task 1 变量, Task 2 布局

- [ ] **Step 1: 写入标签视图导航 & 卡片网格**

```css
/* ================================================================
   标签系统 — 视图导航、卡片网格、徽章
   ================================================================ */

/* 返回导航栏 */
.view-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
}

.btn-back {
    padding: 6px 14px;
    border: 1px solid var(--border-card);
    border-radius: var(--radius-sm);
    background: var(--bg-surface);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 500;
    font-family: var(--font-sans);
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out);
    white-space: nowrap;
}

.btn-back:hover {
    background: var(--bg-hover);
    border-color: var(--border-active);
    color: var(--text-primary);
}

.view-title {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* 标签卡片网格 */
.tag-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    padding: var(--space-sm) 0;
}

/* 标签卡片 */
.tag-card {
    background: var(--bg-surface);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    padding: 24px 12px;
    text-align: center;
    cursor: pointer;
    transition: transform var(--duration-fast) var(--ease-spring),
                border-color var(--duration-fast) var(--ease-out),
                box-shadow var(--duration-fast) var(--ease-out);
    position: relative;
    overflow: hidden;
    user-select: none;
}

.tag-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--tag-color, var(--accent));
    opacity: 0.6;
    transition: opacity var(--duration-fast) var(--ease-out);
}

.tag-card:hover {
    transform: translateY(-4px);
    border-color: var(--border-card);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.tag-card:hover::before { opacity: 1; }

.tag-card:active { transform: translateY(-1px); }

.tag-card .tag-card-icon {
    font-size: 28px;
    margin-bottom: var(--space-sm);
    display: block;
}

.tag-card .tag-card-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 4px;
}

.tag-card .tag-card-count {
    font-size: 11px;
    color: var(--text-tertiary);
}

/* 标签徽章（歌曲卡片内） */
.tag-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
}

.tag-badge {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 500;
    line-height: 1.6;
    background: var(--tag-bg, rgba(165, 160, 240, 0.15));
    color: var(--tag-color, var(--accent));
    cursor: pointer;
    transition: opacity var(--duration-fast);
}

.tag-badge:hover { opacity: 0.75; }
```

- [ ] **Step 2: 验证**

刷新浏览器，确认：
- 标签卡片 3 列网格，间距 16px
- 顶部色条 hover 时变亮
- 卡片 hover 上浮 4px
- 标签徽章在歌曲卡片内显示为紫色半透明底

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "feat: add dark theme tag system styles"
```

---

### Task 5: 右侧面板

**Files:**
- Modify: `css/style.css`

**Interfaces:**
- Consumes: Task 1 变量, Task 2 布局, Task 3 歌曲卡片组件

- [ ] **Step 1: 写入右侧面板样式**

```css
/* ---------- Right Panel ---------- */
.right-panel {
    width: 300px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    overflow: hidden;
}

.panel-tabs {
    display: flex;
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
}

.panel-tab {
    flex: 1;
    padding: 14px 0;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
    font-family: var(--font-sans);
    transition: color var(--duration-fast) var(--ease-out);
    position: relative;
}

.panel-tab:hover { color: var(--text-primary); }

.panel-tab.active { color: var(--accent); }

.panel-tab.active::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 50%;
    transform: translateX(-50%);
    width: 32px;
    height: 2px;
    background: var(--accent);
    border-radius: 2px;
}

.panel-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-md);
}
```

- [ ] **Step 2: 写入面板内列表项样式**

```css
/* Playlist item in panel */
.playlist-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease-out);
}

.playlist-item:hover { background: var(--bg-hover); }

.playlist-item .pl-name {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
}

.playlist-item .pl-count {
    font-size: 12px;
    color: var(--text-tertiary);
}

.playlist-item .btn-delete {
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-out);
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 14px;
    color: var(--text-tertiary);
    border-radius: 50%;
}

.playlist-item:hover .btn-delete { opacity: 1; }

.playlist-item .btn-delete:hover {
    color: #f87171;
    background: rgba(248, 113, 113, 0.12);
}

/* New playlist button */
.btn-new-pl {
    width: 100%;
    padding: 10px;
    border: 2px dashed var(--border-card);
    background: transparent;
    cursor: pointer;
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    color: var(--text-secondary);
    font-family: var(--font-sans);
    transition: border-color var(--duration-fast) var(--ease-out),
                color var(--duration-fast) var(--ease-out);
    margin-top: var(--space-sm);
}

.btn-new-pl:hover {
    border-color: var(--accent);
    color: var(--accent);
}

/* Play-All button */
.btn-play-all {
    width: 100%;
    padding: 10px 16px;
    border: none;
    background: var(--accent);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-sans);
    margin-bottom: var(--space-sm);
    transition: transform var(--duration-fast) var(--ease-spring),
                box-shadow var(--duration-fast) var(--ease-out);
    box-shadow: 0 2px 12px rgba(165, 160, 240, 0.25);
}

.btn-play-all:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 20px rgba(165, 160, 240, 0.4);
}

.btn-play-all:active { transform: translateY(0); }

/* Playlist item play button */
.btn-playlist-play {
    width: 30px;
    height: 30px;
    border: none;
    background: rgba(165, 160, 240, 0.15);
    color: var(--accent);
    cursor: pointer;
    font-size: 12px;
    border-radius: var(--radius-full);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: transform var(--duration-fast) var(--ease-spring),
                background var(--duration-fast) var(--ease-out),
                color var(--duration-fast) var(--ease-out);
    line-height: 1;
}

.btn-playlist-play:hover {
    background: var(--accent);
    color: #fff;
    transform: scale(1.12);
}

/* Empty state */
.empty-state {
    text-align: center;
    padding: 40px var(--space-lg);
    color: var(--text-tertiary);
    font-size: 14px;
    line-height: 1.8;
}

.empty-state .empty-icon {
    font-size: 48px;
    display: block;
    margin-bottom: var(--space-md);
    opacity: 0.4;
}

/* Playlist song item (inside playlist detail) */
.pl-song-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    font-size: 14px;
    color: var(--text-primary);
    transition: background var(--duration-fast) var(--ease-out);
}

.pl-song-item:hover { background: var(--bg-hover); }

.pl-song-item .btn-remove-song {
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-out);
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 14px;
    color: var(--text-tertiary);
    border-radius: 50%;
}

.pl-song-item:hover .btn-remove-song { opacity: 1; }
.pl-song-item .btn-remove-song:hover { color: #f87171; }
```

- [ ] **Step 3: 验证**

刷新浏览器，确认右侧面板：
- 宽度 300px，有微边框
- Tab 切换指示器为紫色
- 列表项 hover 背景变化
- 删除按钮 hover 变红

- [ ] **Step 4: Commit**

```bash
git add css/style.css
git commit -m "feat: add dark theme right panel styles"
```

---

### Task 6: 播放栏（单行布局）

**Files:**
- Modify: `css/style.css`

**Interfaces:**
- Consumes: Task 1 变量, Task 2 布局

- [ ] **Step 1: 写入播放栏容器 & 进度条**

```css
/* ---------- Player Bar ---------- */
.player-bar {
    flex-shrink: 0;
    background: rgba(20, 20, 22, 0.82);
    backdrop-filter: blur(24px) saturate(1.2);
    -webkit-backdrop-filter: blur(24px) saturate(1.2);
    border-top: 1px solid var(--border-subtle);
    padding: var(--space-sm) var(--space-xl) var(--space-md);
    display: flex;
    align-items: center;
    gap: var(--space-lg);
}

/* Progress — 在播放栏顶部 */
.progress-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex: 1;
}

.progress-time {
    font-size: 11px;
    color: var(--text-tertiary);
    width: 36px;
    text-align: center;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
    font-family: var(--font-mono);
}

.progress-bar-wrap {
    flex: 1;
    height: 4px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 2px;
    cursor: pointer;
    position: relative;
    transition: height var(--duration-fast) var(--ease-out);
}

.progress-bar-wrap:hover { height: 6px; }

.progress-bar-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 2px;
    width: 0%;
    transition: width 0.1s linear;
    position: relative;
}

.progress-bar-fill::after {
    content: '';
    position: absolute;
    right: -5px;
    top: 50%;
    transform: translateY(-50%);
    width: 12px;
    height: 12px;
    background: #fff;
    border: 2px solid var(--accent);
    border-radius: 50%;
    opacity: 1;
    transition: transform var(--duration-fast) var(--ease-spring);
}

.progress-bar-wrap:hover .progress-bar-fill::after {
    transform: translateY(-50%) scale(1.25);
}
```

- [ ] **Step 2: 写入控件 & 播放信息**

```css
/* Controls */
.controls-row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex-shrink: 0;
}

.btn-ctrl {
    width: 36px;
    height: 36px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 20px;
    border-radius: var(--radius-full);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform var(--duration-fast) var(--ease-spring),
                color var(--duration-fast) var(--ease-out);
    color: var(--text-secondary);
}

.btn-ctrl:hover {
    transform: scale(1.1);
    color: var(--text-primary);
}

.btn-ctrl.play-btn {
    width: 48px;
    height: 48px;
    font-size: 24px;
    background: var(--accent);
    color: #fff;
    box-shadow: 0 4px 16px rgba(165, 160, 240, 0.3);
}

.btn-ctrl.play-btn:hover {
    background: var(--accent-hover);
    transform: scale(1.08);
    box-shadow: 0 4px 24px rgba(165, 160, 240, 0.45);
}

.btn-ctrl.play-btn:active { transform: scale(0.94); }

/* Mode Toggle */
.btn-mode {
    width: 34px;
    height: 34px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 14px;
    border-radius: var(--radius-full);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    transition: color var(--duration-fast) var(--ease-out),
                background var(--duration-fast) var(--ease-out);
    position: relative;
    font-weight: 700;
    font-family: var(--font-sans);
}

.btn-mode:hover {
    color: var(--accent);
    background: var(--bg-hover);
}

.btn-mode.loop-all { color: var(--text-secondary); }
.btn-mode.loop-single { color: var(--accent); }
.btn-mode.shuffle { color: var(--accent); }

.btn-mode.loop-single::after {
    content: '1';
    position: absolute;
    font-size: 8px;
    font-weight: 700;
    bottom: 5px;
    right: 7px;
}

/* Current song info — 在播放栏左侧 */
.player-info {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-shrink: 0;
    min-width: 140px;
    max-width: 240px;
}

.now-playing-label {
    font-size: 11px;
    color: var(--text-tertiary);
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
}

.now-playing-label .dot {
    width: 6px;
    height: 6px;
    background: #4ade80;
    border-radius: 50%;
    animation: pulseDot 1.5s var(--ease-in-out) infinite;
}

@keyframes pulseDot {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.35; }
}

.now-playing-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
```

- [ ] **Step 3: 验证**

刷新浏览器，确认播放栏：
- 单行布局：歌名 | 控件 | 进度条 | 时间
- 毛玻璃效果 — 深色半透明 + 模糊
- 进度条 hover 从 4px 变 6px
- 拖拽手柄始终可见
- 播放按钮有紫色光晕

- [ ] **Step 4: Commit**

```bash
git add css/style.css
git commit -m "feat: add dark theme player bar with single-row layout"
```

---

### Task 7: 模态框、搜索 & 认证

**Files:**
- Modify: `css/style.css`

**Interfaces:**
- Consumes: Task 1 变量

- [ ] **Step 1: 写入模态框样式**

```css
/* ---------- Modal / Menu ---------- */
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 100;
}

.modal-overlay.show { display: flex; }

.modal-box {
    background: var(--bg-surface);
    border: 1px solid var(--border-card);
    border-radius: var(--radius-lg);
    padding: 24px;
    min-width: 320px;
    max-width: 420px;
    box-shadow: var(--shadow-lg);
    animation: modalIn var(--duration-base) var(--ease-out);
}

@keyframes modalIn {
    from { opacity: 0; transform: translateY(16px) scale(0.95); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
}

.modal-title {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: var(--space-lg);
    color: var(--text-primary);
}

.modal-input {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid var(--border-card);
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-family: var(--font-sans);
    color: var(--text-primary);
    background: var(--bg-root);
    outline: none;
    transition: border-color var(--duration-fast) var(--ease-out);
}

.modal-input:focus {
    border-color: var(--accent);
}

.modal-actions {
    display: flex;
    gap: var(--space-sm);
    margin-top: var(--space-lg);
    justify-content: flex-end;
}

.btn {
    padding: 8px 20px;
    border: none;
    border-radius: var(--radius-full);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    font-family: var(--font-sans);
    transition: background var(--duration-fast) var(--ease-out),
                transform var(--duration-fast) var(--ease-spring);
}

.btn:active { transform: scale(0.96); }

.btn-primary {
    background: var(--accent);
    color: #fff;
}

.btn-primary:hover { background: var(--accent-hover); }

.btn-secondary {
    background: var(--bg-hover);
    color: var(--text-secondary);
}

.btn-secondary:hover { background: var(--bg-active); }
```

- [ ] **Step 2: 写入搜索框样式**

```css
/* ---------- Search Box ---------- */
.search-wrap {
    position: relative;
    margin-bottom: var(--space-lg);
}

.search-input {
    width: 100%;
    padding: 10px 40px 10px 14px;
    border: 1px solid var(--border-card);
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-family: var(--font-sans);
    color: var(--text-primary);
    background: var(--bg-surface);
    outline: none;
    transition: border-color var(--duration-fast) var(--ease-out),
                box-shadow var(--duration-fast) var(--ease-out);
}

.search-input::placeholder { color: var(--text-tertiary); }

.search-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(165, 160, 240, 0.15);
}

.search-clear {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 14px;
    color: var(--text-tertiary);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color var(--duration-fast) var(--ease-out),
                background var(--duration-fast) var(--ease-out);
}

.search-clear:hover {
    color: var(--accent);
    background: var(--bg-hover);
}

/* ---------- Search Empty State ---------- */
.search-empty .empty-icon {
    font-size: 48px;
    display: block;
    margin-bottom: var(--space-md);
    opacity: 0.4;
}

.search-empty strong { color: var(--accent); }

/* ---------- Search History Dropdown ---------- */
.search-history-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-surface);
    border: 1px solid var(--border-card);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-md);
    z-index: 50;
    margin-top: 4px;
    max-height: 320px;
    overflow-y: auto;
    animation: dropdownIn 0.15s var(--ease-out);
}

@keyframes dropdownIn {
    from { opacity: 0; transform: translateY(-6px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
}

.shd-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 6px;
    font-size: 11px;
    color: var(--text-tertiary);
    font-weight: 600;
    letter-spacing: 0.04em;
}

.shd-clear {
    border: none;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    font-size: 11px;
    font-family: var(--font-sans);
    padding: 2px 8px;
    border-radius: var(--radius-full);
    transition: color var(--duration-fast) var(--ease-out),
                background var(--duration-fast) var(--ease-out);
}

.shd-clear:hover {
    color: var(--accent);
    background: rgba(165, 160, 240, 0.12);
}

.shd-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: 10px 14px;
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease-out);
    font-size: 14px;
}

.shd-item:hover { background: var(--bg-hover); }

.shd-query {
    flex: 1;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
```

- [ ] **Step 3: 写入认证相关样式**

```css
/* ---------- Header Right (Auth) ---------- */
.header-right {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-shrink: 0;
}

.btn-login {
    padding: 8px 20px;
    border: 1px solid var(--accent);
    background: transparent;
    color: var(--accent);
    font-size: 14px;
    font-weight: 600;
    border-radius: var(--radius-full);
    cursor: pointer;
    font-family: var(--font-sans);
    transition: background var(--duration-fast) var(--ease-out),
                color var(--duration-fast) var(--ease-out),
                transform var(--duration-fast) var(--ease-spring);
}

.btn-login:hover {
    background: var(--accent);
    color: #fff;
    transform: translateY(-1px);
}

/* ---------- User Menu ---------- */
.user-menu-wrap { position: relative; }

.btn-user {
    padding: 8px 16px;
    border: 1px solid var(--border-card);
    background: var(--bg-surface);
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 600;
    border-radius: var(--radius-full);
    cursor: pointer;
    font-family: var(--font-sans);
    transition: border-color var(--duration-fast) var(--ease-out),
                transform var(--duration-fast) var(--ease-spring);
}

.btn-user:hover {
    border-color: var(--border-active);
    transform: translateY(-1px);
}

.user-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    background: var(--bg-surface);
    border: 1px solid var(--border-card);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-md);
    z-index: 60;
    min-width: 140px;
    overflow: hidden;
    animation: dropdownIn 0.15s var(--ease-out);
}

.user-dropdown-item {
    padding: 10px 16px;
    font-size: 14px;
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease-out);
    color: var(--text-primary);
}

.user-dropdown-item:hover { background: var(--bg-hover); }

/* ---------- Auth Form (in Modal) ---------- */
.auth-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
}

.auth-error {
    color: #f87171;
    font-size: 12px;
    padding: 4px 0;
}

.auth-switch {
    margin-top: 4px;
    font-size: 12px;
    color: var(--text-tertiary);
    text-align: center;
    width: 100%;
}

.auth-switch a {
    color: var(--accent);
    cursor: pointer;
    text-decoration: none;
    font-weight: 600;
}

.auth-switch a:hover { text-decoration: underline; }
```

- [ ] **Step 4: 验证**

刷新浏览器，确认：
- 模态弹窗深色底 + 弹簧入场动画
- 搜索框 focus 有紫色边框 + 外光晕
- 下拉菜单有微缩放出场动画
- 登录按钮、用户菜单样式正确

- [ ] **Step 5: Commit**

```bash
git add css/style.css
git commit -m "feat: add dark theme modal, search and auth styles"
```

---

### Task 8: 响应式设计

**Files:**
- Modify: `css/style.css`（追加 @media 块）

**Interfaces:**
- Consumes: Task 1-7 所有样式

- [ ] **Step 1: 在文件末尾追加平板断点（768px – 1023px）**

```css
/* ================================================================
   响应式设计
   ================================================================ */

/* ---------- 平板 (768px - 1023px) ---------- */
@media (max-width: 1023px) {
    .app-main {
        padding: 0 var(--space-lg);
    }

    .right-panel {
        display: none;
    }

    /* 右下角 FAB 按钮 */
    .fab-drawer-trigger {
        display: flex;
        position: fixed;
        bottom: calc(64px + var(--space-lg));
        right: var(--space-lg);
        width: 48px;
        height: 48px;
        border-radius: var(--radius-full);
        background: var(--accent);
        color: #fff;
        border: none;
        cursor: pointer;
        font-size: 20px;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 20px rgba(165, 160, 240, 0.35);
        z-index: 90;
        transition: transform var(--duration-fast) var(--ease-spring);
    }

    .fab-drawer-trigger:hover { transform: scale(1.1); }
    .fab-drawer-trigger:active { transform: scale(0.9); }

    /* 底部抽屉 */
    .drawer-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        z-index: 110;
        opacity: 0;
        transition: opacity var(--duration-base) var(--ease-out);
        pointer-events: none;
    }

    .drawer-overlay.show {
        opacity: 1;
        pointer-events: auto;
    }

    .drawer-sheet {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: 60vh;
        background: var(--bg-surface);
        border-radius: var(--radius-lg) var(--radius-lg) 0 0;
        border-top: 1px solid var(--border-card);
        z-index: 111;
        display: flex;
        flex-direction: column;
        transform: translateY(100%);
        transition: transform var(--duration-slow) var(--ease-spring);
    }

    .drawer-sheet.show {
        transform: translateY(0);
    }

    .drawer-handle {
        width: 32px;
        height: 4px;
        background: var(--border-active);
        border-radius: 2px;
        margin: var(--space-sm) auto;
        flex-shrink: 0;
    }

    .drawer-content {
        flex: 1;
        overflow-y: auto;
        padding: 0 var(--space-lg) var(--space-lg);
    }

    /* 平板播放栏稍紧凑 */
    .player-bar {
        padding: var(--space-sm) var(--space-lg) var(--space-md);
    }

    .player-info {
        min-width: 100px;
        max-width: 180px;
    }
}

/* 桌面隐藏 FAB（在 1024px+ 用 display:none 覆盖） */
.fab-drawer-trigger { display: none; }
.drawer-overlay { display: none; }
.drawer-sheet { display: none; }
```

- [ ] **Step 2: 追加手机断点（< 768px）**

```css
/* ---------- 手机 (< 768px) ---------- */
@media (max-width: 767px) {
    .app-main {
        padding: 0 var(--space-md);
    }

    .app-header {
        padding: 0 var(--space-md);
    }

    /* 去掉副标题 */
    .header-left { display: none; }

    /* 迷你播放栏 */
    .player-bar {
        padding: 0 var(--space-md);
        height: 48px;
        gap: var(--space-sm);
    }

    .player-bar .progress-row { display: none; }

    .player-bar .player-info {
        flex: 1;
        min-width: 0;
        cursor: pointer;
    }

    .player-bar .btn-ctrl:not(.play-btn):not(#btnNext) { display: none; }

    .btn-ctrl.play-btn {
        width: 40px;
        height: 40px;
        font-size: 20px;
    }

    .btn-ctrl {
        width: 32px;
        height: 32px;
        font-size: 18px;
    }

    .now-playing-title { font-size: 12px; }

    /* 展开的完整播放栏 */
    .player-bar.expanded {
        height: auto;
        flex-wrap: wrap;
        padding: var(--space-sm) var(--space-md) var(--space-md);
    }

    .player-bar.expanded .progress-row {
        display: flex;
        width: 100%;
        order: -1;
    }

    .player-bar.expanded .btn-ctrl { display: flex; }
    .player-bar.expanded .player-info { flex: 0; }

    /* 歌曲卡片紧凑 */
    .song-card {
        padding: 10px 12px;
        gap: var(--space-sm);
    }

    .song-card .card-index {
        width: 28px;
        height: 28px;
        font-size: 11px;
    }

    .song-card .card-title { font-size: 14px; }
    .song-card .card-meta { font-size: 11px; }

    .btn-fav, .btn-add {
        width: 30px;
        height: 30px;
        font-size: 16px;
    }

    /* FAB 需要为迷你播放栏留空间 */
    .fab-drawer-trigger {
        bottom: calc(48px + var(--space-md));
        right: var(--space-md);
    }
}
```

- [ ] **Step 3: 追加标签网格响应式**

```css
/* ---------- 标签网格响应式 ---------- */
@media (max-width: 600px) {
    .tag-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-md);
    }

    .tag-card {
        padding: 16px 10px;
    }

    .tag-card .tag-card-icon {
        font-size: 24px;
    }

    .tag-card .tag-card-name {
        font-size: 12px;
    }
}
```

- [ ] **Step 4: 追加 reduced-motion 媒体查询**

```css
/* ---------- Reduced Motion ---------- */
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
    }
}
```

- [ ] **Step 5: 验证**

- 调整浏览器宽度到 ~800px：确认右侧面板隐藏，右下角出现紫色 FAB 按钮
- 点击 FAB：确认底部抽屉滑入
- 调整到 ~400px：确认播放栏变为迷你模式，header 副标题隐藏
- 系统设置 reduced-motion：所有动画消失

- [ ] **Step 6: Commit**

```bash
git add css/style.css
git commit -m "feat: add responsive design for tablet and mobile"
```

---

### Task 9: 歌词 CSS 同步

**Files:**
- Modify: `css/lyrics.css`

**Interfaces:**
- Consumes: Task 1 的配色规范
- Produces: 暗色歌词弹窗样式

- [ ] **Step 1: 替换 `:root` 变量块（lyrics.css 行 5-18）**

```css
/* ============================================
   歌词弹出窗口样式 — 极简暗色主题
   ============================================ */

:root {
    --bg-root: #09090b;
    --bg-surface: #141416;
    --accent: #a5a0f0;
    --accent-light: rgba(165, 160, 240, 0.15);
    --text-primary: #f0f0f2;
    --text-secondary: #9a9aa0;
    --text-tertiary: #5c5c64;
    --border-subtle: rgba(255, 255, 255, 0.06);
    --radius-sm: 8px;
    --radius-md: 12px;
    --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    --duration-fast: 150ms;
    --duration-base: 250ms;
    --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
}
```

- [ ] **Step 2: 替换 `.lyrics-container` 背景**

```css
/* 主容器 — 深色毛玻璃效果 */
.lyrics-container {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: rgba(20, 20, 22, 0.92);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 12px;
    overflow: hidden;
}
```

- [ ] **Step 3: 替换标题栏**

```css
/* 标题栏 — 可拖拽区域 */
.lyrics-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    cursor: move;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border-subtle);
}
```

- [ ] **Step 4: 替换歌词行颜色**

将 `.lyrics-vertical .lyric-line` 和 `.lyrics-horizontal .lyric-line` 中的 `color: var(--text-muted)` 改为 `color: var(--text-tertiary)`，`.active` 的颜色保持 `var(--accent)`。还需要把文件末尾的 `.lyrics-empty` 颜色改为 `var(--text-tertiary)`。

具体修改：全文搜索替换 `var(--text-muted)` → `var(--text-tertiary)`，搜索替换 `var(--border)` → `var(--border-subtle)`。

- [ ] **Step 5: 验证**

打开歌词弹窗，确认：
- 背景为深色毛玻璃
- 标题栏下面有极淡分割线
- 当前歌词行高亮为紫色
- 非活跃歌词行为三级灰色

- [ ] **Step 6: Commit**

```bash
git add css/lyrics.css
git commit -m "feat: sync lyrics popup with dark theme"
```

---

### Task 10: index.html 结构调整

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: Task 1-8 的 CSS class 名
- Produces: 播放栏单行 DOM 结构 + Inter 字体引入

- [ ] **Step 1: 在 `<head>` 中引入 Inter 字体**

在 `<link rel="stylesheet" href="css/style.css">` 之前添加：

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: 重构播放栏 DOM 为单行布局**

将现有的播放栏 `footer` 内容（行 54-81）替换为：

```html
<!-- ====== 底部播放栏（单行） ====== -->
<footer class="player-bar" id="playerBar">
    <!-- 当前播放信息 -->
    <div class="player-info">
        <span class="now-playing-label">
            <span class="dot" id="nowPlayingDot" style="display:none"></span>
        </span>
        <span class="now-playing-title" id="nowPlayingTitle">未在播放</span>
    </div>

    <!-- 播放控件 -->
    <div class="controls-row">
        <button class="btn-mode btn-ctrl loop-all" id="btnMode" title="列表循环">🔁</button>
        <button class="btn-ctrl" id="btnPrev" title="上一首">⏮</button>
        <button class="btn-ctrl play-btn" id="btnPlay" title="播放/暂停">▶</button>
        <button class="btn-ctrl" id="btnNext" title="下一首">⏭</button>
        <button class="btn-ctrl" id="btnLyrics" title="歌词">🎤</button>
    </div>

    <!-- 进度条 -->
    <div class="progress-row">
        <span class="progress-time" id="timeCurrent">0:00</span>
        <div class="progress-bar-wrap" id="progressWrap">
            <div class="progress-bar-fill" id="progressFill"></div>
        </div>
        <span class="progress-time" id="timeTotal">0:00</span>
    </div>
</footer>
```

- [ ] **Step 3: 在 `</body>` 前添加平板抽屉 DOM**

```html
<!-- ====== 平板底部抽屉 ====== -->
<div class="drawer-overlay" id="drawerOverlay"></div>
<div class="drawer-sheet" id="drawerSheet">
    <div class="drawer-handle"></div>
    <div class="drawer-content" id="drawerContent"></div>
</div>
<button class="fab-drawer-trigger" id="fabDrawer" title="收藏 & 歌单">⭐</button>
```

- [ ] **Step 4: 验证**

重启服务器，刷新浏览器，确认：
- Inter 字体已加载（DevTools → Network → Fonts）
- 播放栏为单行：歌名 | 按钮 | 进度条
- DOM 中没有多余的绝对定位元素

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: restructure player bar to single-row and add Inter font"
```

---

### Task 11: JS — 视图切换动画

**Files:**
- Modify: `js/ui.js`

**Interfaces:**
- Consumes: `UI.renderHome()`, `UI.renderTag()`, `UI.renderStar()` 渲染函数
- Produces: 视图切换时触发 CSS 动画，卡片入场 stagger

- [ ] **Step 1: 在 `renderHome` / `renderTag` / `renderStar` 渲染完成后添加视图入场动画**

在 `js/ui.js` 中找到渲染视图容器的核心方法。这些方法最终将 HTML 写入 `viewContainer`。在每个渲染方法中，DOM 更新后添加动画触发逻辑。

在文件末尾（`UI` 对象 return 之前）添加：

```js
/**
 * 视图切换动画：为新渲染的内容添加淡入效果
 */
function _animateViewEntrance(container) {
    container.style.animation = 'none';
    container.offsetHeight; // 强制回流
    container.style.animation = `viewFade var(--duration-base) var(--ease-out)`;
}

/**
 * 卡片 stagger 入场：为 .song-card 或 .tag-card 依次添加 animation-delay
 * @param {HTMLElement} container - 视图容器
 * @param {string} selector - 卡片选择器，如 '.song-card' 或 '.tag-card'
 */
function _staggerCards(container, selector) {
    const cards = container.querySelectorAll(selector);
    cards.forEach((card, i) => {
        card.style.animationDelay = `${i * 50}ms`;
    });
}
```

- [ ] **Step 2: 在渲染函数中调用动画**

找到每个将内容写入 `viewContainer` 的地方 — 通常在 `UI.refreshAll()` 或各 `render*` 方法中。在设置 `innerHTML` 后调用：

```js
// 在设置 viewContainer.innerHTML = ... 之后添加：
_staggerCards(viewContainer, '.song-card');
_staggerCards(viewContainer, '.tag-card');
```

具体来说，在 `renderHome` 方法中标签网格渲染后、`renderTag` 中的歌曲列表渲染后、以及搜索结果渲染后，各添加一行：

```js
requestAnimationFrame(() => _staggerCards(viewContainer, '.song-card, .tag-card'));
```

- [ ] **Step 3: 添加 CSS 动画 keyframe（在 style.css 中）**

如果 `viewFade` 尚未定义，在 `css/style.css` 的动画区添加：

```css
@keyframes viewFade {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 4: 验证**

刷新浏览器：
- 首次加载时卡片从下往上依次淡入
- 点击标签进入标签视图，歌曲卡片有 stagger 动画
- 返回首页，标签卡片有 stagger 动画

- [ ] **Step 5: Commit**

```bash
git add js/ui.js css/style.css
git commit -m "feat: add view transition and card stagger animations"
```

---

### Task 12: JS — 平板底部抽屉

**Files:**
- Modify: `js/ui.js`

**Interfaces:**
- Consumes: Task 5 右侧面板渲染逻辑, Task 8 响应式 CSS, Task 10 drawer DOM
- Produces: `UI.openDrawer()`, `UI.closeDrawer()`, FAB 按钮事件

- [ ] **Step 1: 在 `UI` 对象中添加抽屉控制方法**

在 `js/ui.js` 的 `UI` 对象中添加以下方法：

```js
/**
 * 打开底部抽屉（平板模式）
 * @param {'fav'|'pl'} tab — 默认激活的 tab
 */
openDrawer(tab = 'fav') {
    const overlay = document.getElementById('drawerOverlay');
    const sheet = document.getElementById('drawerSheet');
    const content = document.getElementById('drawerContent');

    // 复制面板内容到抽屉
    const source = tab === 'fav'
        ? document.getElementById('panelFav')
        : document.getElementById('panelPl');
    if (source) {
        content.innerHTML = source.innerHTML;
    }

    // 显示抽屉
    overlay.style.display = 'block';
    sheet.style.display = 'flex';
    requestAnimationFrame(() => {
        overlay.classList.add('show');
        sheet.classList.add('show');
    });
},

/**
 * 关闭底部抽屉
 */
closeDrawer() {
    const overlay = document.getElementById('drawerOverlay');
    const sheet = document.getElementById('drawerSheet');
    overlay.classList.remove('show');
    sheet.classList.remove('show');
    setTimeout(() => {
        overlay.style.display = '';
        sheet.style.display = '';
    }, 400);
},

/**
 * 判断当前是否为平板宽度（抽屉模式）
 */
_isTablet() {
    return window.innerWidth < 1024;
}
```

- [ ] **Step 2: 绑定 FAB 按钮和遮罩事件**

在 `UI.init()` 或 DOM 就绪后的初始化代码中添加：

```js
// FAB 按钮 — 打开抽屉
const fabBtn = document.getElementById('fabDrawer');
if (fabBtn) {
    fabBtn.addEventListener('click', () => UI.openDrawer('fav'));
}

// 点击遮罩关闭抽屉
const drawerOverlay = document.getElementById('drawerOverlay');
if (drawerOverlay) {
    drawerOverlay.addEventListener('click', () => UI.closeDrawer());
}
```

- [ ] **Step 3: 在 `refreshAll` 中同步抽屉内容**

当右侧面板内容更新时（`refreshAll` 被调用），如果当前处于平板模式且抽屉打开，需要同步更新抽屉内容。在 `refreshAll` 末尾添加：

```js
// 如果抽屉打开，同步更新
const sheet = document.getElementById('drawerSheet');
if (sheet && sheet.classList.contains('show')) {
    // 重新复制当前激活 tab 的内容
    const favTab = document.getElementById('tabFav');
    const isFav = favTab && favTab.classList.contains('active');
    const source = isFav
        ? document.getElementById('panelFav')
        : document.getElementById('panelPl');
    const content = document.getElementById('drawerContent');
    if (source && content) {
        content.innerHTML = source.innerHTML;
    }
}
```

- [ ] **Step 4: 验证**

在平板宽度下（768-1023px）：
- 右下角出现紫色 FAB ⭐ 按钮
- 点击 FAB → 底部抽屉从下往上 spring 滑入，占 60% 高度
- 点击半透明遮罩 → 抽屉滑出关闭
- 切换到桌面宽度 → FAB 和抽屉隐藏，右侧面板恢复

- [ ] **Step 5: Commit**

```bash
git add js/ui.js
git commit -m "feat: add tablet bottom drawer with FAB trigger"
```

---

### Task 13: 最终检查 & 清理

**Files:**
- Modify: `css/style.css`（仅清理）

**Interfaces:**
- 无新增接口

- [ ] **Step 1: 检查 CSS 文件中是否有残留的旧色值**

```bash
cd "c:/Users/xiaokang/Desktop/歌曲"
grep -n '#F5E6D3\|#FFFDF9\|#E8917B\|#d47a64\|#fce4de\|#4A3F3B\|#8B7D78\|#b0a59f\|#ede4da' css/style.css css/lyrics.css
```

如果 grep 返回任何结果，替换为对应的新色值。

- [ ] **Step 2: 检查是否还有 13px / 15px / 18px 等禁用字号**

```bash
grep -n 'font-size: 13px\|font-size: 15px\|font-size: 18px' css/style.css css/lyrics.css
```

如果有结果，替换为最近的允许字号（13→12 或 14, 15→14 或 16, 18→16 或 20）。

- [ ] **Step 3: 全功能走查**

启动服务器，依次测试：
1. 首页加载 — 标签卡片 grid + stagger 动画
2. 点击标签 → 歌曲列表
3. 搜索歌曲
4. 播放歌曲 — 卡片紫色边框 + 呼吸光晕
5. 收藏/取消收藏 — 红心动画
6. 创建歌单 / 添加歌曲到歌单
7. 登录/注册
8. 打开歌词弹窗 — 暗色毛玻璃
9. 调整到平板宽度 — FAB + 底部抽屉
10. 调整到手机宽度 — 迷你播放栏
11. 所有 hover/active 状态

- [ ] **Step 4: 修复走查中发现的问题**

- [ ] **Step 5: 最终提交**

```bash
git add -A
git commit -m "chore: final cleanup and polish for dark theme"
```
