# 歌单歌曲页面内渲染设计方案

> **目标：** 点击歌单名后，在内容区域直接渲染该歌单的歌曲列表（类似"我的收藏"页面），替代当前的弹窗（Modal）方式。

## 现状问题

- 点击歌单 → `openPlaylistModal(plId)` 弹出一个 Modal
  - 先显示 loading spinner
  - 等 `getPlaylistSongs()` 异步请求完成后才渲染内容
  - Modal 需要点"关闭"才能退出，操作路径长
  - Modal 内的歌曲播放完后无法自动下一首（`_currentPlaylist` 未设置）
- 和"我的收藏"体验不一致：收藏直接在内容区渲染，歌单需要弹窗

## 设计方案

### 核心思路

新增 `_currentView = 'playlist-songs'` 视图，让歌单歌曲直接在内容区渲染：

1. **点击歌单** → `navigateToPlaylistSongs(plId)` → 更新 header → 显示 skeleton loading → 后台 fetch 歌曲 → 渲染 `renderSongList()` + "播放全部" + "移除歌曲"按钮
2. **返回按钮** → `goBack()` 处理 `playlist-songs` → 回到歌单列表（`renderPlaylistsInContent`）
3. **保留旧弹窗**不受影响（`openPlaylistModal` 还在，但不被导航调用）
4. 其余事件（播放、fav、加入歌单）通过现有的全局事件委托自动工作

### 状态变量

新增：
- `_currentPlaylistId` — 当前正在查看的歌单 ID（用于 goBack 等场景）

### 数据流

```
用户点击歌单行 → action="open-playlist"
  → navigateToPlaylistSongs(plId)
    → _currentView = 'playlist-songs'
    → _currentPlaylistId = plId
    → updateViewHeader(true, "📋 歌单名")
    → 显示 skeleton（renderSkeleton 6个）
    → getPlaylistSongs(plId) 异步 fetch
    → songs.map(s => ({...s, _plSong: true}))
    → window._currentSongs = songs
    → window._currentPlaylist = plId
    → renderSongList(songs) + "播放全部" + "移除"按钮
```

### goBack 导航

```
playlist-songs → renderPlaylistsInContent()（回到歌单列表）
```

### "播放全部" 按钮

新增 `action="play-all-pl"`，播放 `_currentSongs`（歌单歌曲）。

### "移除歌曲" 按钮

在渲染的歌曲行中加入 `data-action="remove-from-pl"` 按钮，通过全局事件委托调用 `PlaylistStore.removeFromPlaylist()`，完成后重新刷新视图 `navigateToPlaylistSongs(plId)`。

### 延迟优化

- 先导航（更新 header + skeleton）→ 再异步 fetch → 最后替换内容
- 用户立即看到布局变化，不需要等弹出窗口
- skeleton 加载动画让等待视觉舒适

### 涉及文件

**仅修改 `c:\Users\xiaokang\Desktop\歌曲\js\ui.js`**，不改其他文件。

### 修改点

1. 新增 `_currentPlaylistId` 变量
2. 新增 `navigateToPlaylistSongs(plId)` 函数（约 30 行）
3. 修改 `goBack()` — 增加 `playlist-songs` 分支
4. 修改 `action === 'open-playlist'` — 改为调用 `navigateToPlaylistSongs` 而不是 `openPlaylistModal`
5. 新增 `action === 'play-all-pl'` — 播放全部歌单歌曲
6. 新增 `action === 'remove-from-pl'` — 从歌单移除歌曲并刷新视图
7. 修改 `onChange` 回调 — 当 `_currentView === 'playlist-songs'` 时刷新当前歌单视图