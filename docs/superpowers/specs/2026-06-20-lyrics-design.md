# 歌词功能 — 设计文档

**日期:** 2026-06-20
**状态:** 已确认

---

## 需求摘要

为每首歌添加 LRC 格式歌词，通过独立弹出窗口显示在桌面。支持竖条形（10句）和长条形（2句）两种显示模式，唱到哪句哪句高亮。歌词存储在数据库中，并自动为现有歌曲匹配歌词。

---

## 架构

```
主窗口 (index.html)                    歌词弹出窗口 (lyrics.html)
┌──────────────────────┐    Broadcast    ┌────────────────────────┐
│ player.js             │    Channel      │ lyrics.js              │
│  timeupdate ──────────┼──────────────→ │  解析 LRC              │
│  广播 {currentTime}   │                │  定位当前行             │
│                       │               │  高亮 + 自动滚动        │
│  [歌词] 按钮 ←────────┼─────────────── │  模式切换 (竖/横)       │
│  监听 {lyrics-closed} │                │  关闭按钮               │
└──────────────────────┘                └────────────────────────┘

数据库: songs 表新增 lrc_text 列 (TEXT, nullable)
API:    GET /api/lyrics/:songId  →  { songId, title, singer, lrc_text }
```

---

## 数据库变更

在 `songs` 表新增 `lrc_text` 列：

```sql
ALTER TABLE songs ADD COLUMN lrc_text TEXT DEFAULT NULL;
COMMENT ON COLUMN songs.lrc_text IS 'LRC 格式歌词，每行 [mm:ss.xx]lyric，NULL 表示暂无歌词';
```

**为什么不用独立表：** 歌词与歌曲是强一对一关系，独立表不必要。同列存储查询简单（SELECT 一个字段即可），且随歌曲自动级联删除。

---

## 后端

### 新端点

**`GET /api/lyrics/:songId`**

- 查询 `songs` 表获取 `lrc_text`、`title`、`singer`
- 成功：`200 { songId, title, singer, lrc_text }`
- 歌曲不存在：`404 { error: '歌曲不存在' }`
- `lrc_text` 为 null 时返回 null，前端据此显示"暂无歌词"

无需认证（公开数据）。

---

## 前端

### 新文件: `lyrics.html` + `js/lyrics.js`

**`js/lyrics.js`** — IIFE 模块，暴露 `Lyrics` 单例：

| 方法 | 说明 |
|------|------|
| `open(song)` | 打开歌词弹出窗口，传入歌曲对象 |
| `close()` | 关闭歌词窗口 |
| `syncTime(currentSec)` | 主窗口推送当前播放时间（秒） |
| `syncSong(song)` | 主窗口推送当前歌曲信息 |
| `loadLyrics(lrcText)` | 加载并解析 LRC 文本 |
| `toggleMode()` | 切换竖条形 / 长条形 |

**通信：BroadcastChannel**（同源窗口间广播）

频道名: `music_player_lyrics`

消息类型：

| type | 方向 | payload |
|------|------|---------|
| `time-update` | 主→歌词 | `{ currentTime: number }` |
| `song-change` | 主→歌词 | `{ id, title, singer, lrcText }` |
| `lyrics-open` | 主→歌词 | `{ id, title, singer, lrcText }` |
| `lyrics-closed` | 歌词→主 | `{}` |
| `mode-change` | 歌词→主 | `{ mode: 'vertical' \| 'horizontal' }` |

### 歌词窗口 UI (`lyrics.html`)

- 小窗口 (360×520)，无浏览器工具栏 (`window.open` 指定 features)
- 顶部标题栏：歌名 — 歌手 + `[竖/横]` 切换 + `✕` 关闭
- 标题栏可拖拽移动整个窗口（mousedown 事件）
- 毛玻璃半透明背景，与主播放器 CSS 变量一致的暖色系
- **竖条形模式：** 当前行在中间，前后各显示 4~5 行（共约 10 行可见），当前行用主题色 + 较大字号高亮，自动滚动
- **长条形模式：** 只显示当前行 + 下一行（共 2 行），当前行大字居中高亮，渐隐过渡

### 主窗口变更

- `player.js`：在 `timeupdate` 事件处理中通过 BroadcastChannel 推送当前时间；歌曲切换时推送歌曲信息
- `index.html`：底部播放栏新增歌词按钮（`🎤`），点击打开歌词窗口
- `ui.js`：监听 `lyrics-closed` 消息更新歌词按钮状态；`song-change` 时自动拉取歌词

---

## LRC 解析逻辑

```
输入: "[00:12.50]那些年错过的大雨\n[00:16.80]那些年错过的爱情\n..."
输出: [{ time: 12.5, text: "那些年错过的大雨" }, { time: 16.8, text: "那些年错过的爱情" }, ...]
```

- 正则: `/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/`
- 时间秒数 = `minutes * 60 + seconds + ms/1000`
- 忽略空行和非 LRC 行（如 `[ti:]`、`[ar:]` 等元数据标签）
- 按时间排序

高亮判定：当前播放时间 ≥ 第N行时间 且 < 第N+1行时间 → 第N行高亮。

---

## 歌词自动匹配

为现有 100 首歌自动获取 LRC 歌词：

### 匹配流程

1. 查询所有 `lrc_text IS NULL` 的歌曲
2. 对每首歌，用 `{title} {singer}` 调用公开 LRC API 搜索
3. 取第一个结果，校验：歌词非空、至少有 5 行时间戳行
4. 写入数据库 `UPDATE songs SET lrc_text = $lrc WHERE id = $id`
5. 匹配失败的跳过，日志记录

### API 选择

优先使用公开的 LRC 搜索接口（如 QQ音乐、歌词迷等），需要有较高中文歌曲覆盖率。

### 执行方式

可选两种：
- A) 写一个 Node.js 脚本 (`scripts/fetch_lyrics.js`)，手动执行
- B) 在 server.js 中增加一个懒加载逻辑：播放歌曲时如果数据库无歌词，自动尝试匹配并写入

**建议选 A**（独立脚本，不阻塞播放流程），但也可以在 API 端点中加入按需匹配。

---

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `sql/schema.sql` | 修改 | 新增 `lrc_text` 列 |
| `sql/alter_lyrics.sql` | 新增 | 已有数据库的 ALTER TABLE 语句 |
| `server.js` | 修改 | 新增 `GET /api/lyrics/:songId` |
| `js/player.js` | 修改 | 新增 BroadcastChannel 推送 |
| `js/ui.js` | 修改 | 新增歌词按钮 + 消息监听 |
| `lyrics.html` | 新增 | 歌词弹出窗口 |
| `js/lyrics.js` | 新增 | 歌词窗口逻辑 |
| `css/lyrics.css` | 新增 | 歌词窗口样式 |
| `scripts/fetch_lyrics.js` | 新增 | 歌词自动匹配脚本 |
| `index.html` | 修改 | 新增歌词按钮、引入 lyrics.js |

---

## 边缘情况

- **无歌词的歌曲：** 歌词窗口显示"🎵 暂无歌词"，不崩溃
- **LRC 格式异常：** 解析失败时降级显示纯文本（无时间同步高亮）
- **窗口被浏览器拦截：** `window.open` 返回 null 时提示用户允许弹窗
- **多窗口同步：** 如果用户打开多个主窗口，每个都广播到同一频道。用 `songId` 过滤，只响应当前播放歌曲的消息
- **歌曲切换时窗口已关：** 主窗口广播前检查 BroadcastChannel 是否仍有监听者（无法直接检测，依赖 `lyrics-closed` 消息更新状态）
- **长条形模式下无下一行：** 只显示当前行
