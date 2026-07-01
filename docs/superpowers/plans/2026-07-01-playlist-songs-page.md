# 歌单歌曲页面内渲染 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点击歌单名后，在内容区域直接渲染歌曲列表（类似"我的收藏"页面），替代弹窗方式。

**Architecture:** 仅在 `js/ui.js` 中新增约 35 行代码，无后端改动。新增 `_currentView = 'playlist-songs'` 视图 + `navigateToPlaylistSongs()` 函数 + goBack 分支 + 全局事件处理。

**Tech Stack:** vanilla JS, single-file IIFE

## Global Constraints

- 仅修改 `c:\Users\xiaokang\Desktop\歌曲\js\ui.js`
- 不修改后端、HTML、CSS
- 保留现有的 `openPlaylistModal` 函数不删除（其他场景可能用到）
- 保持现有的事件委托模式（全局 `click` 监听 `[data-action]`）
- 使用现有 UI 组件：`renderSongList()`、`renderSkeleton()`、`updateViewHeader()`

---

### Task 1: 新增 navigateToPlaylistSongs 函数 + 状态变量

**Files:**
- Modify: `c:\Users\xiaokang\Desktop\歌曲\js\ui.js`

**Interfaces:**
- Consumes: `PlaylistStore.getPlaylistSongs(plId)`, `PlaylistStore.getPlaylist(id)`, `renderSongList(songs)`, `renderSkeleton()`, `updateViewHeader(show, title)`, `setActiveSidebarNav(navId)`
- Produces: `navigateToPlaylistSongs(plId)` function, `_currentPlaylistId` variable, `_currentView = 'playlist-songs'`

- [ ] **Step 1: 新增 `_currentPlaylistId` 变量**

在 `_currentPlaylistData` 后添加一行：

查找位置：
```
let _currentCollectionData = null;  // 当前查看的 collection 对象
```

```js
let _currentPlaylistId = null;      // 当前查看的歌单 ID
```

- [ ] **Step 2: 新增 `navigateToPlaylistSongs` 函数**

在 `renderPlaylists()` 函数之后（第 712 行附近）插入新函数：

```js
    function navigateToPlaylistSongs(plId) {
        _currentView = 'playlist-songs';
        _currentPlaylistId = plId;
        const pl = PlaylistStore.getPlaylist(plId);
        const title = pl ? escapeHtml(pl.name) : '歌单';
        updateViewHeader(true, '📋 ' + title);
        setActiveSidebarNav('playlists');
        $.viewContainer.innerHTML = renderSkeleton(6);
        bindCardClicks();

        PlaylistStore.getPlaylistSongs(plId).then(songs => {
            if (!songs || !songs.length) {
                $.viewContainer.innerHTML = '<div class="empty-state"><span class="empty-icon">📋</span>歌单是空的<br><small>点击歌曲旁的 + 按钮添加到歌单</small></div>';
                return;
            }
            const plSongs = songs.map((s, i) => ({ ...s, _idx: i, _plSong: true }));
            window._currentSongs = plSongs;
            window._currentPlaylist = plId;
            let html = '<button class="btn-play-all" data-action="play-all-pl" data-pl-id="' + plId + '">▶ 播放全部</button>';
            html += '<div class="song-list">';
            plSongs.forEach((song, i) => {
                const cover = getCoverUrl(song);
                html += `
                <div class="song-list-item" data-song-index="${i}" style="--stagger-index:${Math.min(i, 19)}">
                    ${cover
                        ? `<img class="song-list-cover" src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">`
                        : ''}
                    <div class="song-list-placeholder" style="${cover ? 'display:none' : ''};background:${getCoverFallbackColor(i)}">🎵</div>
                    <div class="song-list-index">${i + 1}</div>
                    <div class="song-list-info">
                        <div class="song-list-title">${escapeHtml(song.title)}</div>
                        <div class="song-list-meta">${escapeHtml(song.singer || '')} · ${formatTime(song.duration)}</div>
                    </div>
                    <div class="song-list-actions">
                        <button class="btn-fav ${PlaylistStore.isFavorite(song.id) ? 'favorited' : ''}" data-action="toggle-fav" data-song-id="${song.id}">${PlaylistStore.isFavorite(song.id) ? '❤️' : '♡'}</button>
                        <button class="btn-add" data-action="show-add-to-playlist" data-song-id="${song.id}">+</button>
                        <button class="btn-remove-from-pl" data-action="remove-from-pl" data-pl-id="${plId}" data-song-id="${song.id}" title="从歌单移除">✕</button>
                    </div>
                </div>`;
            });
            html += '</div>';
            $.viewContainer.innerHTML = html;
            bindCardClicks();
        }).catch(() => {
            $.viewContainer.innerHTML = '<div class="empty-state"><span class="empty-icon">⚠️</span>加载歌单失败</div>';
        });
    }
```

- [ ] **Step 3: 修改 goBack() — 增加 playlist-songs 分支**

查找 ``goBack()`` 函数中的 `else if (_currentView === 'playlists')` 分支，在其后添加：

```js
        } else if (_currentView === 'playlist-songs') {
            renderPlaylistsInContent();
```

最终的 `goBack()` 函数应为：

```js
    function goBack() {
        if (_currentView === 'collection-songs') {
            if (_currentCollectionData) {
                navigateToCollectionItems(_currentCollectionData.id);
            } else {
                navigateToCollection();
            }
        } else if (_currentView === 'collection-items') {
            navigateToCollection();
        } else if (_currentView === 'collection') {
            navigateHome();
        } else if (_currentView === 'search') {
            $.searchInput.value = '';
            $.searchClear.style.display = 'none';
            navigateHome();
        } else if (_currentView === 'favorites') {
            navigateHome();
        } else if (_currentView === 'playlists') {
            navigateHome();
        } else if (_currentView === 'playlist-songs') {
            renderPlaylistsInContent();
        }
    }
```

- [ ] **Step 4: 修改 action === 'open-playlist' — 改为页面内渲染**

查找 `if (action === 'open-playlist')` 分支（约第 1552 行），将 `openPlaylistModal(plId);` 改为 `navigateToPlaylistSongs(plId);`：

```js
            if (action === 'open-playlist') {
                const plId = parseInt(btn.dataset.plId);
                navigateToPlaylistSongs(plId);
                return;
            }
```

- [ ] **Step 5: 新增 play-all-pl 和 remove-from-pl 事件处理**

在 `play-all-favs` 分支（约第 1568 行）后添加两个新分支：

```js
            if (action === 'play-all-pl') {
                const songs = window._currentSongs;
                if (songs && songs.length) {
                    Player.playAll(songs, 0);
                }
                return;
            }
            if (action === 'remove-from-pl') {
                e.stopPropagation();
                const pid = parseInt(btn.dataset.plId);
                const sid = parseInt(btn.dataset.songId);
                await PlaylistStore.removeFromPlaylist(pid, sid);
                // 刷新当前视图
                navigateToPlaylistSongs(pid);
                return;
            }
```

- [ ] **Step 6: 修改 onChange 回调**

查找 `_currentView === 'playlists'` 的 onChange 回调（约第 2267 行），增加 `playlist-songs` 的刷新逻辑：

```js
                if (_currentView === 'playlists') renderPlaylistsInContent();
                if (_currentView === 'playlist-songs' && _currentPlaylistId) {
                    // 歌单数据变化时刷新，用现有函数
                    PlaylistStore.getPlaylistSongs(_currentPlaylistId).then(songs => {
                        if (!songs) return;
                        const plSongs = songs.map((s, i) => ({ ...s, _idx: i, _plSong: true }));
                        window._currentSongs = plSongs;
                    });
                }
```

- [ ] **Step 7: 测试验证**

启动服务器测试：

```bash
/d/softwa/nodejs/node server.js
```

验证点：
1. 点击侧边栏"我的歌单" → 显示歌单列表（和原来一样）
2. 点击某个歌单 → 内容区显示 skeleton → 加载完成后显示歌曲列表（有"播放全部"按钮）
3. 歌曲行显示封面、歌名、歌手、时长、fav/+/移除按钮
4. 点击某首歌曲 → 直接播放
5. 点击"播放全部" → 按歌单顺序播放
6. 点击"移除"按钮 → 从歌单移除该歌曲 → 视图自动刷新
7. 点击返回按钮 → 回到歌单列表
8. 页面刷新后不再走弹窗路径

确认没有问题后提交：

```bash
git add -A
git commit -m "feat: 歌单歌曲直接渲染在内容区，替代弹窗（playlist-songs 页面视图）
- 新增 navigateToPlaylistSongs() 函数，点击歌单后在内容区渲染歌曲列表
- 新增 _currentPlaylistId 状态变量和 playlist-songs 视图
- goBack() 从歌单歌曲回到歌单列表
- 新增 play-all-pl 播放全部、remove-from-pl 移除歌曲事件处理
- 使用 skeleton 加载动画优化等待体验
- 保留 openPlaylistModal 弹窗函数（不删除，兼容性保留）"
```
