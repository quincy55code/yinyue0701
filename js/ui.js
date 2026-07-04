/**
 * ui.js — DOM 渲染与用户交互
 * ===========================
 * Spotify × Apple Music 融合设计：侧边栏导航 + 封面网格 + 沉浸式 Now Playing
 */
const UI = (() => {
    let _currentView = 'home';
    let _defaultSongs = [];
    let _songCache = {};
    let _searchTimer = null;

    // 歌曲缓存上限（LRU 淘汰）
    const SONG_CACHE_MAX = 1000;
    let _songCacheKeys = []; // 按添加顺序记录 key，用于淘汰最旧条目

    // 歌词内存缓存（避免重复 API 调用）
    let _lyricsCache = {};
    const LYRICS_CACHE_MAX = 50;

    // 请求去重（导航时取消相同端点的旧请求）
    let _pendingAbortControllers = {};

    // refreshAll 防抖
    let _refreshAllPending = null;

    // 歌曲汇总（Collections）状态
    let _currentCollectionData = null;  // 当前查看的 collection 对象（用于 goBack）
    let _collectionTree = null;         // /api/collections 返回的完整树缓存
    let _currentPlaylistId = null;      // 当前查看的歌单 ID

    // 动态流 (Feed) 缓存
    let _feedCache = null;
    let _feedCacheTime = 0;
    const FEED_CACHE_TTL = 5 * 60 * 1000; // 5 分钟

    // 博客文章状态
    let _currentNoteId = null;
    let _notesPage = 1;
    let _notesTotal = 0;
    let _notesLoading = false;

    // 嵌入式歌词状态
    let _embeddedLyricsOpen = false;
    let _embeddedLyricsLines = [];
    let _embeddedLyricsIdx = -1;
    let _lrcOffsetMs = 0;          // 当前歌曲的歌词偏移（毫秒）
    let _currentLyricsSongId = null; // 当前加载歌词的歌曲ID

    // 连续播放失败计数（防止无限跳曲）
    let _consecutiveErrors = 0;

    // ========== DOM 引用 ==========
    let $ = {};

    function cacheDom() {
        // 侧边栏
        $.sidebar = document.getElementById('sidebar');
        $.sidebarNav = document.getElementById('sidebarNav');
        $.sidebarTags = document.getElementById('sidebarTags');
        $.sidebarFavCount = document.getElementById('sidebarFavCount');
        $.sidebarUser = document.getElementById('sidebarUser');
        $.btnLogin = document.getElementById('btnLogin');
        $.userMenuWrap = document.getElementById('userMenuWrap');
        $.btnUserAvatar = document.getElementById('btnUserAvatar');
        $.sidebarAvatarImg = document.getElementById('sidebarAvatarImg');
        $.sidebarAvatarPH = document.getElementById('sidebarAvatarPH');
        $.btnUserLabel = document.getElementById('btnUserLabel');
        $.userDropdown = document.getElementById('userDropdown');

        // 顶部栏
        $.btnMenu = document.getElementById('btnMenu');
        $.topBar = document.getElementById('topBar');
        $.searchInput = document.getElementById('searchInput');
        $.searchClear = document.getElementById('searchClear');
        $.searchDropdown = document.getElementById('searchDropdown');
        $.searchSpinner = document.getElementById('searchSpinner');

        // 内容区
        $.contentArea = document.getElementById('contentArea');
        $.viewHeader = document.getElementById('viewHeader');
        $.viewTitle = document.getElementById('viewTitle');
        $.btnBack = document.getElementById('btnBack');
        $.sectionHeader = document.getElementById('sectionHeader');
        $.viewContainer = document.getElementById('viewContainer');

        // 沉浸式 Now Playing
        $.npoOverlay = document.getElementById('nowPlayingOverlay');
        $.npoBackdrop = document.getElementById('npoBackdrop');
        $.npoCover = document.getElementById('npoCover');
        $.npoTitle = document.getElementById('npoTitle');
        $.npoSinger = document.getElementById('npoSinger');
        $.npoTimeCurrent = document.getElementById('npoTimeCurrent');
        $.npoTimeTotal = document.getElementById('npoTimeTotal');
        $.npoProgressWrap = document.getElementById('npoProgressWrap');
        $.npoProgressFill = document.getElementById('npoProgressFill');
        $.npoBtnPlay = document.getElementById('npoBtnPlay');
        $.npoBtnFav = document.getElementById('npoBtnFav');
        $.npoBtnAddPl = document.getElementById('npoBtnAddPl');

        // 播放栏
        $.playerBar = document.getElementById('playerBar');
        $.playerCover = document.getElementById('playerCover');
        $.playerCoverPH = document.getElementById('playerCoverPH');
        $.nowPlayingTitle = document.getElementById('nowPlayingTitle');
        $.nowPlayingSinger = document.getElementById('nowPlayingSinger');
        $.btnPlay = document.getElementById('btnPlay');
        $.btnMode = document.getElementById('btnMode');
        $.btnLyrics = document.getElementById('btnLyrics');
        $.timeCurrent = document.getElementById('timeCurrent');
        $.timeTotal = document.getElementById('timeTotal');
        $.progressWrap = document.getElementById('progressWrap');
        $.progressFill = document.getElementById('progressFill');

        // 音量
        $.btnVolume = document.getElementById('btnVolume');
        $.volumePopup = document.getElementById('volumePopup');
        $.volumeSlider = document.getElementById('volumeSlider');

        // 抽屉（平板）
        $.drawerOverlay = document.getElementById('drawerOverlay');
        $.drawerSheet = document.getElementById('drawerSheet');
        $.drawerContent = document.getElementById('drawerContent');
        $.drawerFav = document.getElementById('drawerFav');
        $.drawerPl = document.getElementById('drawerPl');
        $.fabDrawer = document.getElementById('fabDrawer');

        // 嵌入式歌词面板
        $.lyricsPanel = document.getElementById('lyricsPanel');
        $.lyricsPanelBody = document.getElementById('lyricsPanelBody');
        $.embeddedLyricsTitle = document.getElementById('embeddedLyricsTitle');
        $.embeddedLyricsSinger = document.getElementById('embeddedLyricsSinger');
        $.lyricsOffsetVal = document.getElementById('lyricsOffsetVal');
        $.lyricsOffsetControls = document.getElementById('lyricsOffsetControls');
        $.btnLyricsClose = document.getElementById('btnLyricsClose');
        $.btnLyricsPopout = document.getElementById('btnLyricsPopout');

        // Modal
        $.modalOverlay = document.getElementById('modalOverlay');
        $.modalTitle = document.getElementById('modalTitle');
        $.modalBody = document.getElementById('modalBody');
        $.modalActions = document.getElementById('modalActions');
    }

    // ========== 工具函数 ==========
    function formatTime(sec) {
        if (sec == null || !isFinite(sec)) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    // ========== 工具函数：相对时间格式化 ==========
    function formatRelativeTime(isoStr) {
        if (!isoStr) return '';
        const now = Date.now();
        const t = new Date(isoStr).getTime();
        const diff = now - t;
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return '刚刚';
        if (minutes < 60) return minutes + ' 分钟前';
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + ' 小时前';
        const days = Math.floor(hours / 24);
        if (days < 7) return days + ' 天前';
        const date = new Date(isoStr);
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return month + ' 月 ' + day + ' 日';
    }

    // ========== Markdown 渲染（安全） ==========
    function renderMarkdown(text) {
        if (!text) return '';
        if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
            // fallback: 纯文本转义
            return escapeHtml(text).replace(/\n/g, '<br>');
        }
        try {
            const raw = marked.parse(text);
            const clean = DOMPurify.sanitize(raw);
            // 替换歌曲嵌入 [song:123]
            return clean.replace(/\[song:(\d+)\]/g, (m, id) => {
                const song = _songCache[parseInt(id)];
                if (song) {
                    return `<div class="song-embed" data-song-id="${song.id}" data-action="play-embed-song">
                        <span class="song-embed-icon">🎵</span>
                        <div class="song-embed-info">
                            <div class="song-embed-title">${escapeHtml(song.title)}</div>
                            <div class="song-embed-singer">${escapeHtml(song.singer || '')}</div>
                        </div>
                    </div>`;
                }
                return m; // 找不到歌曲时保留原文
            });
        } catch (e) {
            return escapeHtml(text).replace(/\n/g, '<br>');
        }
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ========== 工具函数：带认证的 fetch ==========
    async function fetchWithAuth(url, options = {}) {
        const headers = { ...options.headers };
        if (typeof Auth !== 'undefined' && Auth.getAuthHeaders) {
            Object.assign(headers, Auth.getAuthHeaders());
        }
        return fetch(url, { ...options, headers });
    }

    // ========== 工具函数：防抖 ==========
    function debounce(fn, delay) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function h(html) {
        const t = document.createElement('template');
        t.innerHTML = html.trim();
        return t.content.firstChild;
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    /** 将歌曲合并到全局缓存，超限时淘汰最旧条目 */
    function mergeToCache(songs) {
        if (!songs) return;
        songs.forEach(s => {
            if (!s || !s.id) return;
            if (_songCache[s.id]) {
                // 已存在，更新但不改变 key 顺序
                _songCache[s.id] = s;
                return;
            }
            // 检查容量，必要时淘汰最旧的 100 条
            if (_songCacheKeys.length >= SONG_CACHE_MAX) {
                const toRemove = Math.min(100, _songCacheKeys.length);
                for (let i = 0; i < toRemove; i++) {
                    const key = _songCacheKeys.shift();
                    delete _songCache[key];
                }
            }
            _songCache[s.id] = s;
            _songCacheKeys.push(s.id);
        });
    }

    /** 带请求去重的 fetch 包装：相同 key 的新请求自动取消旧请求 */
    async function fetchWithDedup(key, url, options = {}) {
        if (_pendingAbortControllers[key]) {
            _pendingAbortControllers[key].abort();
        }
        const controller = new AbortController();
        _pendingAbortControllers[key] = controller;
        try {
            const resp = await fetch(url, { ...options, signal: controller.signal });
            delete _pendingAbortControllers[key];
            return resp;
        } catch (err) {
            if (err.name === 'AbortError') return null;
            delete _pendingAbortControllers[key];
            throw err;
        }
    }

    /** 防抖的 refreshAll（requestAnimationFrame 合并） */
    function refreshAll() {
        if (_refreshAllPending) return;
        _refreshAllPending = requestAnimationFrame(() => {
            _refreshAllPending = null;
            // 更新侧边栏收藏计数
            if (Auth.isLoggedIn()) {
                const favs = PlaylistStore.getFavorites();
                if ($.sidebarFavCount) {
                    $.sidebarFavCount.textContent = favs.length;
                    $.sidebarFavCount.style.display = favs.length > 0 ? '' : 'none';
                }
            }

            // 更新封面卡片中的 fav 状态
            document.querySelectorAll('.cover-card-fav').forEach(btn => {
                const sid = parseInt(btn.dataset.songId);
                if (sid) {
                    const isFav = PlaylistStore.isFavorite(sid);
                    btn.classList.toggle('favorited', isFav);
                    btn.textContent = isFav ? '❤️' : '♡';
                }
            });

            // 更新列表中的 fav 按钮
            document.querySelectorAll('.song-list-actions .btn-fav').forEach(btn => {
                const sid = parseInt(btn.dataset.songId);
                if (sid) {
                    const isFav = PlaylistStore.isFavorite(sid);
                    btn.classList.toggle('favorited', isFav);
                    btn.textContent = isFav ? '❤️' : '♡';
                }
            });

            // 更新沉浸式视图
            const currentSong = Player.getCurrentSong();
            if (currentSong) updateNowPlayingFav(currentSong.id);

            updateAuthUI();
        });
    }

    /** 规范化B站链接：多P合集补全 ?p= 参数 */
    function getBilibiliUrl(song) {
        let url = song.bilibili_url;
        if (!url) return null;
        // 去除末尾斜杠后统一处理
        url = url.replace(/\/+$/, '');
        // page > 1 且 URL 里没有 ?p= 时补上
        if (song.page > 1 && !url.includes('?p=')) {
            url += '?p=' + song.page;
        }
        return url;
    }

    // ========== 管理员可见性控制 ==========
    // 只有这些邮箱登录后能看到「复制B站链接」按钮
    const ADMIN_EMAILS = new Set(['lexiaode@163.com', 'quincy55@163.com']);

    function isAdminUser() {
        const user = Auth.getUser();
        return user && user.email && ADMIN_EMAILS.has(user.email);
    }

    function parseLRCEmbedded(lrcText) {
        if (!lrcText) return [];
        const result = [];
        const lines = lrcText.split('\n');
        // 匹配一行开头的一个或多个时间戳（如 [01:13.82][00:11.71]）
        const multiTimeRe = /^((?:\[\d{2}:\d{2}\.\d{2,3}\])+)(.*)/;
        const singleTimeRe = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
        const offsetRe = /\[offset:\s*([+-]?\d+)\]/i;
        let offsetMs = 0;
        for (const line of lines) {
            // 解析 [offset:±N] 标签（单位：毫秒）
            const offsetMatch = line.match(offsetRe);
            if (offsetMatch) {
                offsetMs = parseInt(offsetMatch[1], 10);
                continue;
            }
            const m = line.match(multiTimeRe);
            if (!m) continue;

            // 取第一个时间戳作为该行时间
            const firstTimeMatch = m[1].match(singleTimeRe);
            if (!firstTimeMatch) continue;
            const minutes = parseInt(firstTimeMatch[1], 10);
            const seconds = parseInt(firstTimeMatch[2], 10);
            const ms = parseInt(firstTimeMatch[3].padEnd(3, '0'), 10);
            let time = minutes * 60 + seconds + ms / 1000;
            time += offsetMs / 1000;  // 应用全局偏移
            if (time < 0) time = 0;

            // 去掉所有开头的时间戳，只保留纯文本
            const text = m[2].trim();
            if (text) {
                result.push({ time, text });
            }
        }
        result.sort((a, b) => a.time - b.time);
        return result;
    }

    // ========== 封面图辅助 ==========
    function getCoverUrl(song) {
        return song.cover_url || '';
    }

    function getCoverFallbackColor(index) {
        const colors = ['var(--song-1)', 'var(--song-2)', 'var(--song-3)', 'var(--song-4)'];
        return colors[(index || 0) % colors.length];
    }

    // ========== 封面卡片网格 ==========
    function renderCoverGrid(songs) {
        if (!songs || !songs.length) {
            return '<div class="empty-state"><span class="empty-icon">🎵</span>暂无歌曲</div>';
        }
        mergeToCache(songs);

        let html = '<div class="cover-grid">';
        songs.forEach((song, i) => {
            const cover = getCoverUrl(song);
            const coverHTML = cover
                ? `<img class="cover-card-img" src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">`
                : '';
            const phHTML = cover
                ? `<div class="cover-card-placeholder" style="display:none;background:${getCoverFallbackColor(i)}">🎵</div>`
                : `<div class="cover-card-placeholder" style="background:${getCoverFallbackColor(i)}">🎵</div>`;

            html += `
            <div class="cover-card ${song.playing ? 'playing' : ''}" data-song-index="${i}" style="--stagger-index:${Math.min(i, 19)}">
                <div class="cover-card-img-wrap">
                    ${coverHTML}${phHTML}
                    <div class="cover-card-play-overlay">
                        <div class="play-icon-circle">▶</div>
                    </div>
                </div>
                <div class="cover-card-title">${escapeHtml(song.title)}</div>
                <div class="cover-card-singer">${escapeHtml(song.singer || '')}</div>
                <button type="button" class="cover-card-fav ${(song._fav || song.is_favorite) ? 'favorited' : ''}" data-action="toggle-fav" data-song-id="${song.id}">${(song._fav || song.is_favorite) ? '❤️' : '♡'}</button>
                <button class="cover-card-add-pl" data-action="show-add-to-playlist" data-song-id="${song.id}">+</button>
                ${isAdminUser() && song.bilibili_url ? `<button class="cover-card-copy-link" data-action="copy-bilibili-link" data-url="${escapeHtml(getBilibiliUrl(song))}" data-title="${escapeHtml(song.title)}" data-singer="${escapeHtml(song.singer || '')}" data-song-id="${song.id}" title="复制B站链接">🔗</button>` : ''}
            </div>`;
        });
        html += '</div>';
        return html;
    }

    // ========== 歌曲列表（搜索/收藏/歌单用） ==========
    function renderSongList(songs) {
        if (!songs || !songs.length) {
            return '<div class="empty-state"><span class="empty-icon">🎵</span>暂无歌曲</div>';
        }
        mergeToCache(songs);

        let html = '<div class="song-list">';
        songs.forEach((song, i) => {
            const cover = getCoverUrl(song);
            const isFav = song._fav || song.is_favorite;
            html += `
            <div class="song-list-item ${song.playing ? 'playing' : ''}" data-song-index="${i}" style="--stagger-index:${Math.min(i, 19)}">
                ${cover
                    ? `<img class="song-list-cover" src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">`
                    : ''}
                <div class="song-list-placeholder" style="${cover ? 'display:none' : ''};background:${getCoverFallbackColor(i)}">🎵</div>
                <div class="song-list-index">${i + 1}</div>
                <div class="song-list-info">
                    <div class="song-list-title">${escapeHtml(song.title)}</div>
                    <div class="song-list-meta">${escapeHtml(song.singer || '')} · ${formatTime(song.duration)}</div>
                    ${song.collection_path ? `<div class="song-list-collection-path">📂 ${escapeHtml(song.collection_path)}</div>` : ''}
                </div>
                <div class="song-list-actions">
                    ${isAdminUser() && song.bilibili_url ? `<button class="btn-copy-link" data-action="copy-bilibili-link" data-url="${escapeHtml(getBilibiliUrl(song))}" data-title="${escapeHtml(song.title)}" data-singer="${escapeHtml(song.singer || '')}" data-song-id="${song.id}" title="复制B站链接">🔗</button>` : ''}
                    <button class="btn-fav ${isFav ? 'favorited' : ''}" data-action="toggle-fav" data-song-id="${song.id}">${isFav ? '❤️' : '♡'}</button>
                    <button class="btn-add" data-action="show-add-to-playlist" data-song-id="${song.id}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                </div>
            </div>`;
        });
        html += '</div>';
        return html;
    }

    // ========== 歌曲汇总：分类卡片渲染 ==========

    // 所有可用的标签背景图（62张）→ 每次渲染时随机洗牌后分配，保证每张卡片不同
    const COLLECTION_IMAGE_POOL = [
        'DJ', '一人一首成名曲', '丝绸', '乐谱', '书店', '光影',
        '公路', '励志', '华语', '古寺', '古风', '咖啡馆',
        '城市夜景', '天桥', '小号', '小提琴', '录音棚', '彩虹',
        '影视', '情歌', '摇滚', '星空', '极光', '棱镜',
        '民谣', '水墨', '水彩', '沙漠', '油彩', '治愈',
        '流行', '海浪', '涂鸦', '深空', '湖泊', '瀑布',
        '烟雾', '热门', '禅意', '秋叶', '竹林', '篝火',
        '粤语', '纹理', '经典', '耳机', '草原', '萨克斯',
        '薰衣草', '贝斯', '轻音乐', '迷雾', '隧道', '雨街',
        '雪山', '霓虹', '青春', '音乐节', '麦克风', '黄昏',
        '黑胶', '鼓点',
    ];

    function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    function getShuffledImagePool() {
        const pool = [...COLLECTION_IMAGE_POOL];
        shuffleArray(pool);
        return pool;
    }

    function getCollectionItemBgStyle(parentName, index) {
        // 基于 (父分类名, 索引) 生成唯一哈希 → HSL 渐变
        // 保证任意两张子目录卡片的背景色都不同（跨分类也不重复）
        const key = parentName + '::' + index;
        let hash = 0;
        for (let i = 0; i < key.length; i++) {
            hash = ((hash << 5) - hash) + key.charCodeAt(i);
            hash |= 0;
        }
        const h1 = Math.abs(hash) % 360;
        const h2 = (h1 + 40 + (Math.abs(hash >> 8) % 60)) % 360;
        const s1 = 35 + (Math.abs(hash >> 10) % 25);
        const s2 = 40 + (Math.abs(hash >> 14) % 25);
        const l1 = 22 + (Math.abs(hash >> 18) % 12);
        const l2 = 12 + (Math.abs(hash >> 22) % 10);
        return `background: linear-gradient(135deg, hsl(${h1}, ${s1}%, ${l1}%) 0%, hsl(${h2}, ${s2}%, ${l2}%) 100%)`;
    }

    // ========== 骨架屏 HTML 生成器 ==========
    function renderSkeletonCollectionGrid() {
        let html = '<div class="tag-grid">';
        for (let i = 0; i < 12; i++) {
            html += `<div class="skeleton skeleton-card" style="--stagger-index:${i};animation-delay:${i * 0.03}s"></div>`;
        }
        html += '</div>';
        return html;
    }

    function renderSkeletonCoverGrid(count) {
        let html = '<div class="cover-grid">';
        for (let i = 0; i < Math.min(count || 6, 20); i++) {
            html += `<div class="skeleton skeleton-cover-card" style="--stagger-index:${i};animation-delay:${i * 0.03}s"></div>`;
        }
        html += '</div>';
        return html;
    }

    function renderCollectionGrid(collections) {
        if (!collections || !collections.length) {
            return '<div class="empty-state"><span class="empty-icon">📊</span>暂无分类</div>';
        }
        // 每次渲染洗牌图片池 → 每张分类卡片都有不同的高清背景图
        const imagePool = getShuffledImagePool();
        let html = '<div class="tag-grid">';
        collections.forEach((c, i) => {
            const slug = imagePool[i % imagePool.length];
            const bgStyle = `background-image: url('/public/images/tags/${slug}.jpg')`;
            html += `
            <div class="tag-card tag-card--image" style="--tag-color:${getCoverFallbackColor(i)};--stagger-index:${Math.min(i, 19)};${bgStyle};background-size:cover;background-position:center" data-action="navigate-collection-item" data-collection-id="${c.id}">
                <div class="tag-card-name">${escapeHtml(c.name)}</div>
            </div>`;
        });
        html += '</div>';
        return html;
    }

    function renderCollectionItemsGrid(items, collectionName, collectionSlug) {
        if (!items || !items.length) {
            return `<div class="empty-state"><span class="empty-icon">📋</span>${escapeHtml(collectionName)}暂无子分类</div>`;
        }
        // 每次渲染洗牌图片池 → 子目录卡片也使用随机高清背景图
        const imagePool = getShuffledImagePool();
        let html = '<div class="tag-grid">';
        items.forEach((it, i) => {
            const songCount = (it.song_count || 0) > 0 ? ` · ${it.song_count}首` : '';
            const hasBvid = !!it.bvid;
            const hasSongs = it.song_count > 0;
            const action = hasBvid ? 'navigate-collection-songs' : '';
            const bgColor = getCoverFallbackColor(i);
            const slug = imagePool[i % imagePool.length];
            const bgStyle = hasBvid
                ? `background-image: url('/public/images/tags/${slug}.jpg');background-size:cover;background-position:center`
                : '';
            html += `
            <div class="tag-card tag-card--image ${!hasBvid ? 'tag-card--empty' : ''}" style="--tag-color:${bgColor};--stagger-index:${Math.min(i, 19)};${bgStyle}" data-action="${action}" data-bvid="${escapeHtml(it.bvid || '')}" data-item-title="${escapeHtml(it.title)}">
                <div class="tag-card-name">${escapeHtml(it.title)}${songCount}</div>
            </div>`;
        });
        html += '</div>';
        return html;
    }

    // ========== 视图导航 ==========
    function updateViewHeader(show, title) {
        $.viewHeader.style.display = show ? 'flex' : 'none';
        $.viewTitle.textContent = title || '';
        $.sectionHeader.style.display = show ? 'none' : '';
    }

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
        } else if (_currentView === 'notes') {
            navigateHome();
        } else if (_currentView === 'note') {
            // 从文章详情返回列表
            if (_currentNoteId) {
                if (window._currentUserIsAdmin) {
                    renderNotesListAdmin();
                } else {
                    _currentView = 'notes';
                    navigateToNotes();
                }
                _currentNoteId = null;
                return;
            }
            navigateHome();
        }
    }

    function navigateHome() {
        _currentView = 'home';
        _currentCollectionData = null;
        updateViewHeader(false, '');
        $.sectionHeader.style.display = 'none';
        renderNewHome();
        setActiveSidebarNav('home');
    }

    // ========== 播放单个歌曲（修复 playSongById 不存在的问题） ==========

    /** 播放单首歌曲（通过 id 从缓存查找并封装为单曲列表） */
    async function playSongById(songId) {
        const song = _songCache[songId];
        if (song) {
            Player.playAll([song], 0);
            return;
        }
        // 缓存未命中，拉一批歌曲填充缓存
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

    // ========== 首页 — 全新设计 ==========

    async function renderNewHome() {
        $.viewContainer.innerHTML = renderSkeletonNewHome();

        try {
            const res = await fetch('/api/home');
            if (!res.ok) throw new Error('加载失败');
            const data = await res.json();

            // 合并推荐歌曲到缓存
            if (data.songs) mergeToCache(data.songs);

            let html = '';

            // 1. Hero Banner
            html += renderHeroBanner(data.hero);

            // 2. 最近更新（横滑 + 垂直列表）
            html += renderRecentNotes(data.recentNotes);
            html += renderNoteVerticalList(data.recentNotes);

            // 3. 推荐歌曲横滑
            html += renderRecommendedSection(data.songs);

            // 4. 最新评论
            html += renderRecentComments(data.recentComments);

            html += '<div style="height:24px"></div>';
            $.viewContainer.innerHTML = html;
            initDragScroll(); // 初始化横滑区域的拖动滚动
        } catch (err) {
            $.viewContainer.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span>首页加载失败<br><small>${escapeHtml(err.message)}</small></div>`;
        }
    }

    // ========== 横滑区域拖动 + 动量惯性滚动 ==========
function initDragScroll() {
    const containers = document.querySelectorAll('.notes-hscroll, .recommended-scroll');
    if (!containers.length) return;

    containers.forEach(container => {
        let isDragging = false;
        let startX = 0;
        let scrollStart = 0;
        let hasMoved = false;

        // 动量惯性状态
        let momentumRAF = null;
        let velocity = 0;
        let lastMoveTime = 0;
        let lastMoveX = 0;
        const history = []; // [{x, time}] 采样队列

        // 停止进行中的惯性动画
        function stopMomentum() {
            if (momentumRAF) {
                cancelAnimationFrame(momentumRAF);
                momentumRAF = null;
            }
            velocity = 0;
            history.length = 0;
        }

        // 惯性减速动画
        function startMomentum(initialVel) {
            stopMomentum();
            velocity = initialVel;
            if (Math.abs(velocity) < 0.5) return; // 太慢不启动

            let lastTime = performance.now();

            function step(now) {
                const dt = Math.min(now - lastTime, 50); // 限制最大步长 50ms
                lastTime = now;

                // 摩擦系数 0.96，帧率无关
                velocity *= Math.pow(0.96, dt / 16.67);

                const delta = velocity * dt;
                const maxScroll = container.scrollWidth - container.clientWidth;
                let newScroll = container.scrollLeft + delta;

                // 边界弹性 — 到达边界时速度衰减更快
                if (newScroll < 0) {
                    newScroll = 0;
                    velocity *= -0.3; // 反弹衰减
                } else if (newScroll > maxScroll) {
                    newScroll = maxScroll;
                    velocity *= -0.3;
                }

                container.scrollLeft = newScroll;

                // 继续或停止
                if (Math.abs(velocity) > 0.5 && container.scrollLeft > 0 && container.scrollLeft < maxScroll) {
                    momentumRAF = requestAnimationFrame(step);
                } else {
                    momentumRAF = null;
                    // 惯性结束，CSS proximity snap 自动吸附对齐
                }
            }

            momentumRAF = requestAnimationFrame(step);
        }

        const onPointerDown = (e) => {
            stopMomentum(); // 新拖拽立即打断惯性
            isDragging = true;
            hasMoved = false;
            startX = e.pageX || e.touches[0].pageX;
            scrollStart = container.scrollLeft;
            container.classList.add('dragging');

            // 初始化速度追踪
            lastMoveTime = performance.now();
            lastMoveX = startX;
            history.length = 0;
            history.push({ x: startX, time: lastMoveTime });
        };

        const onPointerMove = (e) => {
            if (!isDragging) return;
            const x = e.pageX || (e.touches && e.touches[0].pageX);
            if (x === undefined) return;
            const dx = (x - startX) * 2;
            if (Math.abs(dx) > 5) {
                hasMoved = true;
                e.preventDefault();
            }
            container.scrollLeft = scrollStart - dx;

            // 记录移动历史（用于松手时计算速度）
            const now = performance.now();
            history.push({ x: x, time: now });
            if (history.length > 6) history.shift(); // 保留最近 ~100ms
            lastMoveX = x;
            lastMoveTime = now;
        };

        const onPointerEnd = () => {
            isDragging = false;
            container.classList.remove('dragging');

            // 短暂禁用元素上的点击，防止拖动误触发导航
            if (hasMoved) {
                container.classList.add('drag-scroll-lock');
                setTimeout(() => container.classList.remove('drag-scroll-lock'), 80);
            }

            // ---- 计算动量惯性 ----
            if (!hasMoved) return;

            // 取历史中最近 2 个采样点计算速度
            const len = history.length;
            if (len < 2) return;

            const latest = history[len - 1];
            const prev = history[Math.max(0, len - 3)]; // 跳过一个采样避免瞬时噪声

            const dt = latest.time - prev.time;
            if (dt <= 0) return;

            // 速度 = dx / dt (px/ms)，考虑拖动倍率 2x
            const rawVelocity = ((prev.x - latest.x) * 2) / dt;
            // 阈值：1.2px/ms ≈ 1200px/s 才启动惯性（太快了不好，降低到 0.5）
            const absVel = Math.abs(rawVelocity);
            if (absVel > 1.0) {
                // 速度增益稍微放大，让惯性感更强
                const gain = Math.min(1.0 + (absVel - 1.0) * 0.3, 2.0);
                startMomentum(rawVelocity * gain);
            }
            // else: 慢速拖动 → CSS proximity snap 处理
        };

        // 鼠标事件
        container.addEventListener('pointerdown', onPointerDown);
        container.addEventListener('pointermove', onPointerMove);
        container.addEventListener('pointerup', onPointerEnd);
        container.addEventListener('pointerleave', (e) => {
            // pointerleave 只在非拖拽状态忽略
            if (isDragging) onPointerEnd(e);
        });

        // 触摸事件
        container.addEventListener('touchstart', onPointerDown, { passive: true });
        container.addEventListener('touchmove', onPointerMove, { passive: false });
        container.addEventListener('touchend', onPointerEnd);

        // 清理惯性（组件卸载时）
        // 注意：container 本身没有生命周期钩子，但页面刷新时自然销毁
    });
}

function renderSkeletonNewHome() {
        return `
            <div class="skeleton-shimmer" style="height:280px;border-radius:16px;margin-bottom:24px"></div>
            <div class="skeleton-shimmer" style="height:20px;width:120px;border-radius:8px;margin-bottom:12px"></div>
            <div style="display:flex;gap:12px;margin-bottom:28px">${'<div class="skeleton-shimmer" style="width:220px;height:100px;border-radius:12px;flex-shrink:0"></div>'.repeat(4)}</div>
            <div class="skeleton-shimmer" style="height:20px;width:120px;border-radius:8px;margin-bottom:12px"></div>
            <div style="display:flex;gap:12px;margin-bottom:28px">${'<div class="skeleton-shimmer" style="width:120px;height:156px;border-radius:12px;flex-shrink:0"></div>'.repeat(4)}</div>
            <div class="skeleton-shimmer" style="height:20px;width:120px;border-radius:8px;margin-bottom:12px"></div>
            ${'<div class="skeleton-shimmer" style="height:60px;border-radius:12px;margin-bottom:8px"></div>'.repeat(3)}
        `;
    }

    // ========== Hero Banner ==========

    function renderHeroBanner(hero) {
        if (!hero) {
            // 默认 Hero
            return `<div class="home-hero home-hero--default">
                <div class="home-hero-bg-pattern"></div>
                <div class="home-hero-gradient"></div>
                <div class="home-hero-content">
                    <div class="home-hero-badge">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16"/></svg>
                        音乐笔记
                    </div>
                    <div class="home-hero-title">青春旋律</div>
                    <div class="home-hero-summary">记录每一首触动心弦的歌曲，分享每一段难忘的旋律</div>
                </div>
            </div>`;
        }

        const coverUrl = hero.song_cover || '';
        const title = escapeHtml(hero.title || '');
        const summary = escapeHtml(hero.summary ? hero.summary.slice(0, 150) : '');
        const songTitle = escapeHtml(hero.song_title || '');
        const songSinger = escapeHtml(hero.song_singer || '');

        return `<div class="home-hero">
            ${coverUrl ? `<div class="home-hero-bg" style="background-image:url(${escapeHtml(coverUrl)})"></div>` : ''}
            <div class="home-hero-gradient"></div>
            ${coverUrl ? `<img class="home-hero-cover" src="${escapeHtml(coverUrl)}" alt="" decoding="async" loading="eager">` : ''}
            <div class="home-hero-content">
                <div class="home-hero-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>
                    每日推荐
                </div>
                <div class="home-hero-title">${title}</div>
                <div class="home-hero-summary">${summary}</div>
                <div class="home-hero-actions">
                    <button class="home-hero-btn home-hero-btn--primary" data-action="home-hero-play" data-song-id="${hero.song_id || ''}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                        播放歌曲
                    </button>
                    <button class="home-hero-btn home-hero-btn--secondary" data-action="feed-open-note" data-id="${hero.id}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        阅读文章
                    </button>
                </div>
            </div>
        </div>`;
    }

    // ========== 最近更新横滑（Bento 卡片） ==========

    function renderRecentNotes(notes) {
        if (!notes || notes.length === 0) return '';

        let cardsHtml = '';
        for (const note of notes) {
            const date = new Date(note.published_at);
            const dateStr = date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日';
            const cleanTitle = escapeHtml(note.title || '');
            const summary = note.summary
                ? escapeHtml(note.summary.slice(0, 60))
                : escapeHtml((note.content || '').replace(/[#*`\n\r]/g, '').slice(0, 60));
            const tags = note.tags || [];
            const tagsHtml = tags.slice(0, 2).map(t =>
                `<span class="note-hscroll-tag">${escapeHtml(t)}</span>`
            ).join('');

            // 根据标题计算渐变色
            const colorIdx = Math.abs(hashStr(note.title || '')) % 5;
            const gradients = [
                'linear-gradient(135deg, #1a2e25, #2d4a3a)',
                'linear-gradient(135deg, #2e1a2e, #4a2d3a)',
                'linear-gradient(135deg, #1a2a3e, #2d3a5a)',
                'linear-gradient(135deg, #3e2a1a, #5a3a2d)',
                'linear-gradient(135deg, #1a3a3e, #2d4a5a)',
            ];
            const gradientStyle = tags.length > 0 ? '' : `style="background:${gradients[colorIdx]}"`;

            cardsHtml += `<div class="note-hscroll-card" data-action="feed-open-note" data-id="${note.id}">
                <div class="note-hscroll-inner">
                    <div class="note-hscroll-top">
                        <div class="note-hscroll-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        </div>
                        <div class="note-hscroll-date">${dateStr}</div>
                    </div>
                    <div class="note-hscroll-title">${cleanTitle}</div>
                    <div class="note-hscroll-summary">${summary}</div>
                    ${note.songs_data && note.songs_data.length > 0 ? `<div class="note-hscroll-songs">🎵 ${note.songs_data.length} 首关联歌曲</div>` : ''}
                    <div class="note-hscroll-footer">
                        ${tagsHtml ? '<div class="note-hscroll-tags">' + tagsHtml + '</div>' : ''}
                        <span class="note-hscroll-readmore">阅读 →</span>
                    </div>
                </div>
            </div>`;
        }

        return `<div class="home-section">
            <div class="home-section-header">
                <h3>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-4px;margin-right:6px"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    最近更新
                </h3>
                <span class="home-section-link" data-action="nav-notes">查看全部 →</span>
            </div>
            <div class="notes-hscroll">${cardsHtml}</div>
        </div>`;
    }

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
                ${note.songs_data && note.songs_data.length > 0 ? `<div class="note-card-songs">🎵 ${note.songs_data.length} 首关联歌曲</div>` : ''}
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

    // ========== 推荐歌曲横滑 ==========

    function renderRecommendedSection(songs) {
        if (!songs || songs.length === 0) return '';

        let itemsHtml = '';
        window._currentSongs = songs;
        window._currentPlaylist = null;
        for (let i = 0; i < Math.min(songs.length, 12); i++) {
            const s = songs[i];
            if (!s) continue;
            itemsHtml += `<div class="recommended-item" data-action="play-recommended" data-song-index="${i}">
                <div class="recommended-item-cover-wrap">
                    <img class="recommended-item-cover" src="${escapeHtml(s.cover_url || '')}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'">
                    <div class="recommended-item-play-overlay">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>
                    </div>
                </div>
                <div class="recommended-item-title">${escapeHtml(s.title || '')}</div>
                <div class="recommended-item-singer">${escapeHtml(s.singer || '')}</div>
            </div>`;
        }

        return `<div class="home-section">
            <div class="home-section-header">
                <h3>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-4px;margin-right:6px"><circle cx="12" cy="12" r="10"/><polygon points="10,8 16,12 10,16"/></svg>
                    推荐歌曲
                </h3>
                <span class="home-section-link" data-action="nav-collection">查看更多 →</span>
            </div>
            <div class="recommended-scroll">${itemsHtml}</div>
        </div>`;
    }

    // ========== 最新评论动态 ==========

    function renderRecentComments(comments) {
        if (!comments || comments.length === 0) return '';

        let itemsHtml = '';
        for (const c of comments) {
            const username = escapeHtml(c.username || '用户');
            const noteTitle = escapeHtml(c.note_title || '未知文章');
            const avatarHtml = c.avatar_url
                ? `<img class="comment-feed-avatar" src="${escapeHtml(c.avatar_url)}" alt="" decoding="async">`
                : `<div class="comment-feed-avatar-placeholder">${username.charAt(0).toUpperCase()}</div>`;

            // 渲染评论内容（支持 [song:123] 嵌入）
            const renderedContent = renderMarkdown(c.content || '');
            const timeStr = formatRelativeTime(c.created_at);

            itemsHtml += `<div class="comment-feed-item">
                <div class="comment-feed-header">
                    ${avatarHtml}
                    <div class="comment-feed-header-text">
                        <span class="comment-feed-user">${username}</span>
                        <span class="comment-feed-meta">在 <span class="comment-feed-note-link" data-action="feed-open-note" data-id="${c.note_id}">${noteTitle}</span> 中评论</span>
                    </div>
                    <span class="comment-feed-time">${timeStr}</span>
                </div>
                <div class="comment-feed-text">${renderedContent}</div>
            </div>`;
        }

        return `<div class="home-section">
            <div class="home-section-header">
                <h3>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-4px;margin-right:6px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    最新评论
                </h3>
            </div>
            <div class="comment-feed-list">${itemsHtml}</div>
        </div>`;
    }

    function hashStr(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const ch = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + ch;
            hash = hash & hash;
        }
        return hash;
    }

    // ========== 歌曲汇总导航 ==========
    async function navigateToCollection() {
        _currentView = 'collection';
        _currentCollectionData = null;
        updateViewHeader(false, '');
        $.sectionHeader.style.display = '';
        $.sectionHeader.textContent = '📊 歌曲汇总';
        setActiveSidebarNav('collection');

        // 缓存已存在时直接渲染（跳过骨架屏）
        if (_collectionTree) {
            $.viewContainer.innerHTML = renderCollectionGrid(_collectionTree);
            return;
        }
        $.viewContainer.innerHTML = renderSkeletonCollectionGrid();

        try {
            const resp = await fetch('/api/collections');
            if (!resp.ok) throw new Error('加载失败');
            const data = await resp.json();
            _collectionTree = data.collections || [];
            $.viewContainer.innerHTML = renderCollectionGrid(_collectionTree);
        } catch (e) {
            $.viewContainer.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span>加载失败<br><small>${escapeHtml(e.message)}</small></div>`;
        }
    }

    function navigateToCollectionItems(collId) {
        if (!_collectionTree) return;
        const coll = _collectionTree.find(c => c.id === collId);
        if (!coll) return;

        _currentView = 'collection-items';
        _currentCollectionData = coll;
        updateViewHeader(true, coll.name);
        $.viewContainer.innerHTML = renderCollectionItemsGrid(coll.items, coll.name, coll.slug);
    }

    // ========== 博客文章列表 (Notes List) ==========

    async function navigateToNotes() {
        _currentView = 'notes';
        updateViewHeader(false, '');
        $.sectionHeader.style.display = 'none';
        setActiveSidebarNav('notes');
        _notesPage = 1;
        _notesTotal = 0;

        // 检查是否为管理员
        if (Auth.isLoggedIn()) {
            const user = Auth.getUser();
            window._currentUserIsAdmin = (user.email === 'lexiaode@163.com' || user.email === 'quincy55@163.com');
        } else {
            window._currentUserIsAdmin = false;
        }

        if (window._currentUserIsAdmin) {
            renderNotesListAdmin();
        } else {
            await renderNotesList();
        }
    }

    async function renderNotesList() {
        _notesLoading = true;
        $.viewContainer.innerHTML = '<div class="skeleton-shimmer" style="height:80px;border-radius:12px;margin-bottom:12px"></div>'.repeat(4);

        try {
            const res = await fetch(`/api/notes?page=${_notesPage}&limit=10`);
            if (!res.ok) throw new Error('加载失败');
            const { data, total } = await res.json();
            _notesTotal = total;
            _notesLoading = false;

            let html = '<div class="notes-list-header"><h2>✍️ 听歌笔记</h2></div>';

            if (!data || data.length === 0) {
                html += '<div class="empty-state"><span class="empty-icon">📝</span>还没有文章</div>';
            } else {
                for (const note of data) {
                    const date = new Date(note.published_at);
                    const dateStr = date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日';
                    const summary = note.summary || (note.content ? note.content.replace(/[#*`\n\r]/g, '').slice(0, 120) : '');
                    html += `<div class="note-card" data-action="feed-open-note" data-id="${note.id}">
                        <div class="note-card-date">${dateStr}</div>
                        <div class="note-card-title">${escapeHtml(note.title)}</div>
                        <div class="note-card-summary">${escapeHtml(summary)}</div>
                        ${note.tags && note.tags.length ? '<div class="note-card-tags">' + note.tags.map(t => `<span class="note-card-tag">${escapeHtml(t)}</span>`).join('') + '</div>' : ''}
                    </div>`;
                }
            }

            // 分页
            if (_notesPage * 10 < _notesTotal) {
                html += `<div class="load-more-wrap"><button class="btn-load-more" data-action="load-more-notes">加载更多</button></div>`;
            }

            $.viewContainer.innerHTML = html;
        } catch (err) {
            _notesLoading = false;
            $.viewContainer.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span>加载失败<br><small>${escapeHtml(err.message)}</small></div>`;
        }
    }

    async function renderNotesListAdmin() {
        try {
            const res = await fetchWithAuth('/api/notes/admin/list');
            if (!res.ok) throw new Error('加载失败');
            const notes = await res.json();

            let html = '<div class="notes-list-header">';
            html += '<h2>✍️ 听歌笔记（管理）</h2>';
            html += '<button class="btn-write-note" data-action="show-note-editor">✏️ 写新文章</button>';
            html += '</div>';

            if (!notes || notes.length === 0) {
                html += '<div class="empty-state"><span class="empty-icon">📝</span>还没有文章<br><small>点击"写新文章"开始创作</small></div>';
            } else {
                for (const note of notes) {
                    const date = new Date(note.published_at || note.created_at);
                    const dateStr = date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日';
                    const statusBadge = note.published
                        ? '<span style="font-size:11px;color:var(--accent);margin-left:8px">● 已发布</span>'
                        : '<span style="font-size:11px;color:#F39C12;margin-left:8px">● 草稿</span>';
                    const dailyBadge = note.daily_recommend
                        ? '<span style="font-size:11px;color:#9B59B6;margin-left:8px">📌 每日推荐</span>'
                        : '';
                    const summary = note.summary || (note.content ? note.content.replace(/[#*`\n\r]/g, '').slice(0, 120) : '');
                    html += `<div class="note-card" data-action="feed-open-note" data-id="${note.id}">
                        <div class="note-card-date">${dateStr}${statusBadge}${dailyBadge}</div>
                        <div class="note-card-title">${escapeHtml(note.title)}</div>
                        <div class="note-card-summary">${escapeHtml(summary)}</div>
                        ${note.tags && note.tags.length ? '<div class="note-card-tags">' + note.tags.map(t => `<span class="note-card-tag">${escapeHtml(t)}</span>`).join('') + '</div>' : ''}
                    </div>`;
                }
            }

            $.viewContainer.innerHTML = html;
        } catch (err) {
            $.viewContainer.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span>加载失败<br><small>${escapeHtml(err.message)}</small></div>`;
        }
    }

    // ========== 博客文章详情 (Note Detail) ==========

    async function navigateToNote(id) {
        _currentView = 'note';
        _currentNoteId = id;
        updateViewHeader(true, '听歌笔记');
        setActiveSidebarNav('notes');
        $.sectionHeader.style.display = 'none';

        $.viewContainer.innerHTML = '<div class="skeleton-shimmer" style="height:300px;border-radius:12px"></div>';

        try {
            const res = await fetch(`/api/notes/${id}`);
            if (!res.ok) throw new Error('文章不存在');
            const note = await res.json();

            const date = new Date(note.published_at || note.created_at);
            const dateStr = date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日';

            let html = '<div class="note-detail">';
            // 标签
            if (note.tags && note.tags.length > 0) {
                html += '<div class="note-detail-tags">';
                note.tags.forEach(t => {
                    html += `<span class="note-detail-tag">${escapeHtml(t)}</span>`;
                });
                html += '</div>';
            }
            html += `<h1>${escapeHtml(note.title)}</h1>`;

            // 关联歌曲嵌入（song_ids 多首，向前兼容 song_id）
            const linkedSongs = note.songs_data || [];
            if (linkedSongs.length > 0) {
                mergeToCache(linkedSongs);
                html += '<div class="note-song-list">';
                html += '<div class="note-song-list-header">🎵 本文章提及的歌曲</div>';
                linkedSongs.forEach((song, i) => {
                    const cover = getCoverUrl(song);
                    const durationStr = song.duration != null ? ' · ' + formatTime(song.duration) : '';
                    const path = song.collection_path || '';
                    const coverHtml = cover
                        ? `<img class="note-song-list-cover" src="${escapeHtml(cover)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">`
                        : '';
                    const phStyle = cover ? 'display:none' : '';
                    const phBg = getCoverFallbackColor(i);
                    html += `<div class="note-song-list-item" data-song-id="${song.id}" data-action="play-embed-song" style="--stagger-index:${Math.min(i, 19)}">
                        ${coverHtml}
                        <div class="note-song-list-placeholder" style="${phStyle};background:${phBg}">🎵</div>
                        <div class="note-song-list-info">
                            <div class="note-song-list-title">${escapeHtml(song.title)} — ${escapeHtml(song.singer || '')}</div>
                            <div class="note-song-list-meta">${durationStr}</div>
                            ${path ? '<div class="note-song-list-path">📂 ' + escapeHtml(path) + '</div>' : ''}
                        </div>
                    </div>`;
                });
                html += '</div>';
            }

            html += `<div class="note-detail-meta">
                <span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    ${dateStr}
                </span>
                <span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    ${Math.ceil((note.content || '').length / 500)} 分钟阅读
                </span>
            </div>`;
            html += '<hr class="note-detail-divider">';
            html += renderMarkdown(note.content);
            html += '</div>';

            // 管理员操作按钮
            if (window._currentUserIsAdmin) {
                html += `<div class="note-detail-actions">
                    <button class="note-detail-btn" data-action="edit-note" data-note-id="${note.id}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        编辑
                    </button>
                    <button class="note-detail-btn note-detail-btn--danger" data-action="delete-note" data-note-id="${note.id}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        删除
                    </button>
                </div>`;
            }

            $.viewContainer.innerHTML = html;

            // 在文章详情底部渲染评论区
            appendComments(note.id);
        } catch (err) {
            $.viewContainer.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span>${escapeHtml(err.message)}</div>`;
        }
    }

    // ========== 评论系统 ==========

    /** 在文章详情底部追加评论区 */
    async function appendComments(noteId) {
        const container = document.createElement('div');
        container.id = 'commentsSection';
        container.innerHTML = '<div class="skeleton-shimmer" style="height:60px;border-radius:12px;margin-top:32px"></div>';
        $.viewContainer.appendChild(container);

        try {
            const [commentsRes, noteRes] = await Promise.all([
                fetch(`/api/notes/${noteId}/comments`),
                fetch(`/api/notes/${noteId}`),
            ]);

            if (!commentsRes.ok) throw new Error('加载评论失败');
            const comments = await commentsRes.json();
            const note = noteRes.ok ? await noteRes.json() : null;

            renderComments(comments, noteId, note);
        } catch (err) {
            container.innerHTML = `<div class="comments-section"><div class="comment-empty">⚠️ 加载评论失败</div></div>`;
        }
    }

    function renderComments(comments, noteId, note) {
        const container = document.getElementById('commentsSection');
        if (!container) return;

        let html = '<div class="comments-section">';

        // 评论标题 + 数量
        const count = comments ? comments.length : 0;
        html += `<div class="comments-section-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:6px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            评论
            <span class="comments-count">${count}</span>
        </div>`;

        // 评论表单
        const isLoggedIn = Auth.isLoggedIn();
        if (isLoggedIn) {
            html += `<div class="comment-form">
                <textarea id="commentInput" placeholder="写下你的评论..." maxlength="2000"></textarea>
                <button class="comment-submit-btn" id="commentSubmitBtn" data-action="submit-comment">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    发表
                </button>
            </div>`;
        } else {
            html += `<div class="comment-login-hint">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px;margin-right:4px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span data-action="show-auth">登录</span>后可发表评论
            </div>`;
        }

        // 评论列表
        if (comments && comments.length > 0) {
            html += '<div class="comments-list">';
            for (const c of comments) {
                html += renderCommentItem(c, noteId, note ? note.title : '');
            }
            html += '</div>';
        } else {
            html += '<div class="comment-empty">暂无评论，来说点什么吧～</div>';
        }

        html += '</div>';
        container.innerHTML = html;
    }

    function renderCommentItem(c, noteId, noteTitle) {
        const username = escapeHtml(c.username || '用户');
        const initial = username.charAt(0).toUpperCase();
        const avatarHtml = c.avatar_url
            ? `<img class="comment-avatar" src="${escapeHtml(c.avatar_url)}" alt="" decoding="async">`
            : `<div class="comment-avatar-placeholder">${initial}</div>`;

        // 渲染评论内容（支持 Markdown + [song:123]）
        const renderedContent = renderMarkdown(c.content || '');
        const timeStr = formatRelativeTime(c.created_at);
        const user = Auth.getUser();
        const isOwner = user && c.user_id === user.id;
        const isAdmin = user && (user.email === 'lexiaode@163.com' || user.email === 'quincy55@163.com');

        return `<div class="comment-item" data-comment-id="${c.id}">
            ${avatarHtml}
            <div class="comment-body">
                <div class="comment-meta">
                    <span class="comment-username">${username}</span>
                    <span class="comment-time">${timeStr}</span>
                    ${(isOwner || isAdmin)
                        ? `<button class="comment-delete-btn" data-action="delete-comment" data-comment-id="${c.id}">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            删除
                        </button>`
                        : ''}
                </div>
                <div class="comment-text">${renderedContent}</div>
                <div class="comment-source">来自《<span data-action="feed-open-note" data-id="${noteId}">${escapeHtml(noteTitle || '未知文章')}</span>》</div>
            </div>
        </div>`;
    }

    async function showNoteEditor(existingNoteId) {
        if (!Auth.isLoggedIn()) { showAuthModal(); return; }

        let noteData = null;
        if (existingNoteId) {
            try {
                const res = await fetch(`/api/notes/${existingNoteId}`);
                if (res.ok) noteData = await res.json();
            } catch { /* 忽略 */ }
        }

        const isEditing = !!noteData;
        const title = isEditing ? noteData.title : '';
        const content = isEditing ? noteData.content : '';
        const tags = isEditing ? (noteData.tags || []) : [];
        const summary = isEditing ? (noteData.summary || '') : '';
        const published = isEditing ? noteData.published : false;
        const dailyRec = isEditing ? noteData.daily_recommend : false;
        let selectedSongIds = isEditing ? (noteData.song_ids || []) : [];
        if (!selectedSongIds.length && noteData && noteData.song_id != null) {
            selectedSongIds = [noteData.song_id];
        }

        // 构建编辑器 HTML
        let tagsHtml = tags.map(t => `<span class="tag-chip">${escapeHtml(t)}<span class="remove-tag" data-action="remove-tag">×</span></span>`).join('');

        // 构建已选歌曲 Chips
        let selectedSongsHtml = '';
        if (selectedSongIds.length) {
            selectedSongsHtml = selectedSongIds.map(id => {
                const song = _songCache[id];
                if (song) {
                    return `<span class="selected-song-chip" data-song-id="${id}">🎵 ${escapeHtml(song.title)} — ${escapeHtml(song.singer || '')} <span class="remove" data-action="clear-song" data-id="${id}">✕</span></span>`;
                }
                return `<span class="selected-song-chip" data-song-id="${id}">歌曲 #${id} <span class="remove" data-action="clear-song" data-id="${id}">✕</span></span>`;
            }).join('');
        }

        const bodyHTML = `<div class="note-editor-field">
            <label>标题</label>
            <input type="text" id="noteTitle" value="${escapeHtml(title)}" placeholder="文章标题...">
        </div>
        <div class="note-editor-field">
            <label>摘要（可选，留空则自动截取）</label>
            <input type="text" id="noteSummary" value="${escapeHtml(summary)}" placeholder="简短描述...">
        </div>
        <div class="note-editor-field">
            <label>标签（回车添加）</label>
            <div class="tag-input-wrap" id="tagInputWrap">
                ${tagsHtml}
                <input type="text" class="tag-input-inline" id="tagInput" placeholder="输入标签后回车...">
            </div>
        </div>
        <div class="note-editor-field">
            <label>正文（Markdown 语法）</label>
            <textarea id="noteContent">${escapeHtml(content)}</textarea>
        </div>
        <div class="note-editor-field">
            <label>关联歌曲（最多 5 首，点击搜索添加）</label>
            <div class="song-selector">
                <button type="button" class="btn-song-search" id="btnSongSearch" style="padding:8px 16px;background:var(--bg-hover);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);cursor:pointer;font-size:13px;">
                    🔍 搜索歌曲...
                </button>
                <div id="selectedSongsWrap" class="selected-songs-wrap">${selectedSongsHtml}</div>
            </div>
        </div>
        <div class="toggle-row">
            <span class="toggle-label">设为每日推荐</span>
            <label class="toggle-switch">
                <input type="checkbox" id="dailyRecToggle" ${dailyRec ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
        </div>
        <div class="toggle-row">
            <span class="toggle-label">发布</span>
            <label class="toggle-switch">
                <input type="checkbox" id="publishedToggle" ${published ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
        </div>`;

        const actionsHTML = `<div class="note-editor-actions">
            <button class="btn-note-preview" id="btnPreview">👁️ 预览</button>
            <button class="btn-note-save" id="btnSaveDraft">💾 保存草稿</button>
            <button class="btn-note-publish" id="btnPublish">📢 发布</button>
        </div>`;

        showModal(isEditing ? '✏️ 编辑文章' : '✏️ 写新文章', bodyHTML, actionsHTML);

        // 编辑状态存储
        const editorState = {
            tags: [...tags],
            selectedSongIds: selectedSongIds,
            isEditing: isEditing,
            noteId: isEditing ? noteData.id : null,
        };

        // 标签输入事件
        const tagInput = document.getElementById('tagInput');
        const tagWrap = document.getElementById('tagInputWrap');
        if (tagInput) {
            tagInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = tagInput.value.trim();
                    if (val && !editorState.tags.includes(val)) {
                        editorState.tags.push(val);
                        refreshTagChips(tagWrap, editorState.tags);
                    }
                    tagInput.value = '';
                }
            });
        }

        // 全局事件：移除标签、清空歌曲
        document.body.addEventListener('click', function editorTagHandler(e) {
            if (e.target.dataset.action === 'remove-tag') {
                const tagText = e.target.parentElement.textContent.replace('×', '').trim();
                editorState.tags = editorState.tags.filter(t => t !== tagText);
                refreshTagChips(tagWrap, editorState.tags);
            }
            if (e.target.dataset.action === 'clear-song') {
                const id = parseInt(e.target.dataset.id);
                editorState.selectedSongIds = editorState.selectedSongIds.filter(sid => sid !== id);
                const wrap = document.getElementById('selectedSongsWrap');
                if (wrap) wrap.innerHTML = buildSelectedSongsHtml(editorState.selectedSongIds);
            }
        });

        // 歌曲搜索弹窗按钮
        const btnSongSearch = document.getElementById('btnSongSearch');
        if (btnSongSearch) {
            btnSongSearch.addEventListener('click', () => {
                openSongSearchModal(editorState.selectedSongIds, (newIds) => {
                    editorState.selectedSongIds = newIds;
                    const wrap = document.getElementById('selectedSongsWrap');
                    if (wrap) wrap.innerHTML = buildSelectedSongsHtml(newIds);
                });
            });
        }

        // 预览按钮
        const btnPreview = document.getElementById('btnPreview');
        if (btnPreview) {
            btnPreview.addEventListener('click', () => {
                const md = document.getElementById('noteContent').value;
                const previewHTML = renderMarkdown(md);
                const previewWindow = window.open('', '_blank', 'width=700,height=600');
                previewWindow.document.write(`
                    <!DOCTYPE html><html><head><meta charset="UTF-8"><title>文章预览</title>
                    <style>
                        body { max-width:680px; margin:24px auto; padding:0 20px; background:#0B0E0C; color:#EDF0EE; font-family:Inter,sans-serif; line-height:1.8; }
                        h1 { font-size:26px; } h2 { font-size:20px; margin-top:24px; }
                        blockquote { border-left:3px solid #4DB88D; padding-left:16px; color:#9BA89F; }
                        code { background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:4px; }
                        pre { background:rgba(0,0,0,0.2); padding:16px; border-radius:8px; overflow-x:auto; }
                        .song-embed { display:flex; align-items:center; gap:12px; padding:12px; background:#1C2320; border-radius:8px; margin:16px 0; }
                        img { max-width:100%; border-radius:8px; }
                        table { width:100%; border-collapse:collapse; }
                        th,td { border:1px solid #2C3330; padding:8px 12px; text-align:left; }
                    </style></head><body>${previewHTML}</body></html>
                `);
            });
        }

        // 保存草稿
        const btnSaveDraft = document.getElementById('btnSaveDraft');
        if (btnSaveDraft) {
            btnSaveDraft.addEventListener('click', () => saveNote(editorState, false));
        }

        // 发布
        const btnPublish = document.getElementById('btnPublish');
        if (btnPublish) {
            btnPublish.addEventListener('click', () => saveNote(editorState, true));
        }
    }

    function refreshTagChips(wrap, tags) {
        const input = wrap.querySelector('.tag-input-inline');
        wrap.innerHTML = tags.map(t => `<span class="tag-chip">${escapeHtml(t)}<span class="remove-tag" data-action="remove-tag">×</span></span>`).join('');
        if (input) wrap.appendChild(input);
    }

    // ========== 多首歌曲搜索弹窗 ==========

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

        function renderList(results, selected) {
            if (!results.length) {
                list.innerHTML = '<div class="song-search-empty">未找到相关歌曲</div>';
                return;
            }
            list.innerHTML = results.map(song => {
                const isSelected = selected.includes(song.id);
                const cover = getCoverUrl(song);
                const path = song.collection_path || '';
                const durationStr = song.duration != null ? ' · ' + formatTime(song.duration) : '';
                const coverHtml = cover
                    ? `<img class="song-search-item-cover" src="${escapeHtml(cover)}" alt="" loading="lazy">`
                    : `<div class="song-search-item-cover" style="background:${getCoverFallbackColor(song.id)};display:flex;align-items:center;justify-content:center;font-size:14px;">🎵</div>`;
                return `<div class="song-search-item ${isSelected ? 'selected' : ''}" data-song-id="${song.id}">
                    ${coverHtml}
                    <div class="song-search-item-info">
                        <div class="song-search-item-title">${escapeHtml(song.title)} — ${escapeHtml(song.singer || '')}${durationStr}</div>
                        ${path ? '<div class="song-search-item-meta">📂 ' + escapeHtml(path) + '</div>' : ''}
                    </div>
                    <div class="song-search-item-check">${isSelected ? '✓' : ''}</div>
                </div>`;
            }).join('');
        }

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

    function buildSelectedSongsHtml(ids) {
        if (!ids || !ids.length) return '';
        return ids.map(id => {
            const song = _songCache[id];
            if (song) {
                return `<span class="selected-song-chip" data-song-id="${id}">🎵 ${escapeHtml(song.title)} — ${escapeHtml(song.singer || '')} <span class="remove" data-action="clear-song" data-id="${id}">✕</span></span>`;
            }
            return `<span class="selected-song-chip" data-song-id="${id}">歌曲 #${id} <span class="remove" data-action="clear-song" data-id="${id}">✕</span></span>`;
        }).join('');
    }

    async function saveNote(state, publish) {
        const title = document.getElementById('noteTitle')?.value?.trim();
        const content = document.getElementById('noteContent')?.value?.trim();
        const summary = document.getElementById('noteSummary')?.value?.trim();
        const dailyRec = document.getElementById('dailyRecToggle')?.checked || false;

        if (!title) { showToast('请输入标题'); return; }
        if (!content) { showToast('请输入正文'); return; }

        const body = {
            title,
            content,
            summary: summary || null,
            tags: state.tags,
            daily_recommend: dailyRec,
            song_ids: state.selectedSongIds || [],
            published: publish,
        };

        try {
            const url = state.isEditing ? `/api/notes/${state.noteId}` : '/api/notes';
            const method = state.isEditing ? 'PUT' : 'POST';
            const res = await fetchWithAuth(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const err = await res.json();
                showToast(err.error || '保存失败');
                return;
            }

            hideModal();
            showToast(publish ? '文章已发布' : '草稿已保存');

            // 刷新首页缓存
            _feedCache = null;
            _feedCacheTime = 0;

            // 刷新列表
            if (state.isEditing && _currentView === 'note') {
                navigateToNote(state.noteId);
            } else {
                renderNotesListAdmin();
            }
        } catch (err) {
            showToast('网络错误');
        }
    }

    async function deleteNote(id) {
        if (!confirm('确定要删除这篇文章吗？此操作不可恢复。')) return;

        try {
            const res = await fetchWithAuth(`/api/notes/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('删除失败');

            showToast('已删除');
            _feedCache = null;
            _feedCacheTime = 0;

            if (_currentView === 'note') {
                _currentView = 'notes';
                renderNotesListAdmin();
            } else {
                navigateHome();
            }
        } catch (err) {
            showToast('删除失败');
        }
    }

    async function navigateToCollectionSongs(bvid, title) {
        if (!bvid) return;

        _currentView = 'collection-songs';
        updateViewHeader(true, title);

        $.viewContainer.innerHTML = renderSkeletonCoverGrid(6);

        try {
            const resp = await fetch(`/api/songs?bvid=${encodeURIComponent(bvid)}&limit=300&withTags=false`);
            if (!resp.ok) throw new Error('加载失败');
            const songs = await resp.json();
            if (!songs || !songs.length) {
                $.viewContainer.innerHTML = '<div class="empty-state"><span class="empty-icon">🎵</span>暂无歌曲</div>';
                return;
            }
            window._currentSongs = songs;
            window._currentPlaylist = null;
            $.viewContainer.innerHTML = renderCoverGrid(songs);
            bindCardClicks();
        } catch (e) {
            $.viewContainer.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span>加载失败<br><small>${escapeHtml(e.message)}</small></div>`;
        }
    }

    // ========== 事件委托: collection 快捷导航 ==========
    async function navigateToCollectionBySlug(slug) {
        // 确保 collection tree 已加载
        if (!_collectionTree) {
            try {
                const resp = await fetch('/api/collections');
                if (!resp.ok) throw new Error('加载失败');
                const data = await resp.json();
                _collectionTree = data.collections || [];
            } catch (e) {
                console.error('[collection shortcut]', e.message);
                return;
            }
        }
        const coll = _collectionTree.find(c => c.slug === slug);
        if (coll) {
            navigateToCollectionItems(coll.id);
        }
    }

    function setActiveSidebarNav(navId) {
        document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
        const active = document.querySelector(`.sidebar-item[data-nav="${navId}"]`);
        if (active) active.classList.add('active');
    }

    // ========== 侧边栏收藏/歌单视图 ==========
    function renderFavoritesInContent() {
        _currentView = 'favorites';
        updateViewHeader(true, '⭐ 我的收藏');
        setActiveSidebarNav('favorites');

        const favs = PlaylistStore.getFavorites();
        if (!favs || !favs.length) {
            $.viewContainer.innerHTML = '<div class="empty-state"><span class="empty-icon">⭐</span>还没有收藏歌曲<br><small>点击歌曲旁的 ♡ 按钮添加</small></div>';
            return;
        }
        const songs = favs.map((f, i) => ({ ...f, _fav: true }));
        window._currentSongs = songs;
        window._currentPlaylist = null;

        let html = '<button class="btn-play-all" data-action="play-all-favs">▶ 播放全部收藏</button>';
        html += renderSongList(songs);
        $.viewContainer.innerHTML = html;
        bindCardClicks();
    }

    function renderPlaylistsInContent() {
        _currentView = 'playlists';
        updateViewHeader(true, '📋 我的歌单');
        setActiveSidebarNav('playlists');
        renderPlaylists();
    }

    function startRename(plId) {
        // 防止重复打开
        if (document.querySelector('.pl-name-input')) return;

        const nameEl = document.querySelector(`.song-list-title[data-pl-id="${plId}"]`);
        if (!nameEl) return;

        const oldName = nameEl.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'pl-name-input';
        input.value = oldName;
        input.maxLength = 100;
        input.style.width = '100%';
        nameEl.replaceWith(input);
        input.focus();
        input.select();

        const commit = async () => {
            const newName = input.value.trim();
            if (!newName || newName === oldName) {
                // 恢复原样
                input.replaceWith(nameEl);
                return;
            }
            try {
                await PlaylistStore.renamePlaylist(plId, newName);
                // 重命名成功 → 刷新歌单列表 UI（cache 已更新，但 renderPlaylists 重建 DOM）
                renderPlaylists();
            } catch (e) {
                // PlaylistStore 已回滚 cache 并 notify()
                // 重新渲染以恢复旧名字
                renderPlaylists();
                alert(e.message);
            }
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') { input.value = oldName; input.blur(); }
        });
        input.addEventListener('blur', commit);
    }

    function renderPlaylists() {
        const pls = PlaylistStore.getPlaylists();
        if (!pls || !pls.length) {
            $.viewContainer.innerHTML = `
                <div class="empty-state"><span class="empty-icon">📋</span>还没有歌单<br><small>点击下方按钮创建第一个歌单</small></div>
                <button class="btn-new-pl" data-action="new-playlist">+ 新建歌单</button>`;
            return;
        }
        let html = '<button class="btn-new-pl" data-action="new-playlist" style="margin-bottom:12px">+ 新建歌单</button>';
        html += '<div class="song-list">';
        pls.forEach(pl => {
            html += `
            <div class="song-list-item" data-action="open-playlist" data-pl-id="${pl.id}" style="--stagger-index:${Math.min(pls.indexOf(pl), 19)}">
                <div class="song-list-placeholder" style="background:linear-gradient(135deg,${getCoverFallbackColor(pl.id)},${getCoverFallbackColor(pl.id * 2)});font-size:20px;display:flex">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
                <div class="song-list-info" style="cursor:pointer" data-action="open-playlist" data-pl-id="${pl.id}">
                    <div class="song-list-title" data-action="rename-playlist-dbl" data-pl-id="${pl.id}" title="双击改名">${escapeHtml(pl.name)}</div>
                    <div class="song-list-meta">${pl.song_count || 0} 首歌曲</div>
                </div>
                <div class="song-list-actions">
                    <button class="btn-fav favorited" data-action="delete-playlist" data-pl-id="${pl.id}" title="删除歌单">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>`;
        });
        html += '</div>';
        $.viewContainer.innerHTML = html;
    }

    function navigateToPlaylistSongs(plId) {
        _currentView = 'playlist-songs';
        _currentPlaylistId = plId;
        const pl = PlaylistStore.getPlaylist(plId);
        const title = pl ? escapeHtml(pl.name) : '歌单';
        updateViewHeader(true, '📋 ' + title);
        setActiveSidebarNav('playlists');
        $.viewContainer.innerHTML = `<div class="loading-wrap"><div class="loading-ring"></div><span>加载中...</span></div>`;
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
                        <button class="btn-add" data-action="show-add-to-playlist" data-song-id="${song.id}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </button>
                        <button class="btn-remove-from-pl" data-action="remove-from-pl" data-pl-id="${plId}" data-song-id="${song.id}" title="从歌单移除">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
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

    // ========== 播放栏 ==========
    function updatePlayBar(song) {
        if (!song) {
            $.nowPlayingTitle.textContent = '未在播放';
            $.nowPlayingSinger.textContent = '';
            $.playerCover.style.display = 'none';
            $.playerCoverPH.style.display = 'flex';
            $.playerCoverPH.textContent = '🎵';
            return;
        }
        $.nowPlayingTitle.textContent = song.title;
        $.nowPlayingSinger.textContent = song.singer || '';

        const cover = getCoverUrl(song);
        if (cover) {
            $.playerCover.src = cover;
            $.playerCover.style.display = '';
            $.playerCoverPH.style.display = 'none';
        } else {
            $.playerCover.style.display = 'none';
            $.playerCoverPH.style.display = 'flex';
            $.playerCoverPH.textContent = '🎵';
        }
    }

    function updateProgress(data) {
        if (data.duration > 0) {
            const pct = (data.currentTime / data.duration) * 100;
            $.progressFill.style.width = pct + '%';
            $.npoProgressFill.style.width = pct + '%';
        }
        $.timeCurrent.textContent = formatTime(data.currentTime);
        $.npoTimeCurrent.textContent = formatTime(data.currentTime);
    }

    function updateDuration(dur) {
        $.timeTotal.textContent = formatTime(dur);
        $.npoTimeTotal.textContent = formatTime(dur);
    }

    const MODE_ICONS = {
        'loop-all': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 7 7 2 12 7"/><path d="M7 22V2"/><polyline points="22 17 17 22 12 17"/><path d="M17 2v20"/></svg>`,
        'loop-single': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12C2 6.5 6.5 2 12 2s10 4.5 10 10-4.5 10-10 10"/><polyline points="2 8 2 12 6 12"/><text x="18" y="13" text-anchor="middle" font-size="8" fill="currentColor" stroke="none" font-weight="700">1</text></svg>`,
        'shuffle': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>`,
    };

    const VOLUME_ICONS = {
        high: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
        medium: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`,
        low: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/></svg>`,
        mute: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`,
    };

    function updateModeDisplay() {
        const mode = Player.getMode();
        $.btnMode.innerHTML = MODE_ICONS[mode] || MODE_ICONS['loop-all'];
        $.btnMode.className = 'btn-ctrl btn-mode';
        if (mode === 'loop-all') { $.btnMode.classList.add('loop-all'); $.btnMode.title = '列表循环'; }
        if (mode === 'loop-single') { $.btnMode.classList.add('loop-single'); $.btnMode.title = '单曲循环'; }
        if (mode === 'shuffle') { $.btnMode.classList.add('shuffle'); $.btnMode.title = '随机播放'; }
    }

    function updateVolumeIcon() {
        const v = Player.getVolume();
        let icon;
        if (v === 0) icon = VOLUME_ICONS.mute;
        else if (v < 0.3) icon = VOLUME_ICONS.low;
        else if (v < 0.6) icon = VOLUME_ICONS.medium;
        else icon = VOLUME_ICONS.high;
        $.btnVolume.innerHTML = icon;
    }

    function updatePlayButton(playing) {
        $.btnPlay.textContent = playing ? '⏸' : '▶';
        $.npoBtnPlay.textContent = playing ? '⏸' : '▶';
    }

    // ========== 沉浸式 Now Playing ==========
    function openNowPlaying() {
        const song = Player.getCurrentSong();
        if (!song) return;

        $.npoTitle.textContent = song.title;
        $.npoSinger.textContent = song.singer || '';

        const cover = getCoverUrl(song);
        if (cover) {
            $.npoCover.src = cover;
            // 用封面主色设置背景渐变
            $.npoBackdrop.style.background = `radial-gradient(ellipse at center, rgba(77,184,141,0.08) 0%, rgba(0,0,0,0.55) 70%)`;
        } else {
            $.npoCover.src = '';
            $.npoBackdrop.style.background = `radial-gradient(ellipse at center, rgba(77,184,141,0.06) 0%, rgba(0,0,0,0.55) 70%)`;
        }

        const isFav = PlaylistStore.isFavorite(song.id);
        $.npoBtnFav.textContent = isFav ? '❤️ 已收藏' : '♡ 收藏';
        $.npoBtnFav.dataset.songId = song.id;
        $.npoBtnAddPl.dataset.songId = song.id;

        $.npoOverlay.style.display = 'flex';
        updatePlayButton(Player.getIsPlaying());
    }

    function closeNowPlaying() {
        $.npoOverlay.style.display = 'none';
    }

    function updateNowPlayingFav(songId) {
        if ($.npoOverlay.style.display === 'flex') {
            const isFav = PlaylistStore.isFavorite(songId);
            $.npoBtnFav.textContent = isFav ? '❤️ 已收藏' : '♡ 收藏';
        }
    }

    // ========== 刷新 ==========
    /**
     * refreshAll — UI 刷新所有收藏/歌单状态。
     * 由 PlaylistStore.onChange 回调调用。不应从事件 handler 中显式调用。
     * 使用 requestAnimationFrame 防抖，同一帧内多次调用合并为一次。
     */
    function updateAuthUI() {
        if (Auth.isLoggedIn()) {
            const user = Auth.getUser();
            $.btnLogin.style.display = 'none';
            $.userMenuWrap.style.display = '';
            $.btnUserLabel.textContent = user.username || '用户';

            // 头像
            if (user.avatar_url) {
                $.sidebarAvatarImg.src = user.avatar_url;
                $.sidebarAvatarImg.style.display = '';
                $.sidebarAvatarPH.style.display = 'none';
            } else {
                $.sidebarAvatarImg.style.display = 'none';
                $.sidebarAvatarPH.style.display = '';
                $.sidebarAvatarPH.textContent = (user.username || '用')[0];
            }

            if ($.sidebarFavCount) {
                const favs = PlaylistStore.getFavorites();
                $.sidebarFavCount.textContent = favs.length;
                $.sidebarFavCount.style.display = favs.length > 0 ? '' : 'none';
            }

            // 管理员 FAB
            const isAdmin = (user.email === 'lexiaode@163.com' || user.email === 'quincy55@163.com');
            if (isAdmin && !document.querySelector('.fab-note')) {
                const fab = document.createElement('button');
                fab.className = 'fab-note';
                fab.innerHTML = '✏️';
                fab.setAttribute('data-action', 'show-note-editor');
                fab.title = '写新文章';
                document.body.appendChild(fab);
            } else if (!isAdmin) {
                const existingFab = document.querySelector('.fab-note');
                if (existingFab) existingFab.remove();
            }
        } else {
            $.btnLogin.style.display = '';
            $.userMenuWrap.style.display = 'none';
            if ($.sidebarFavCount) $.sidebarFavCount.style.display = 'none';
            const existingFab = document.querySelector('.fab-note');
            if (existingFab) existingFab.remove();
        }
    }

    // ========== Modal ==========
    function showModal(title, bodyHTML, actionsHTML) {
        $.modalTitle.textContent = title;
        $.modalBody.innerHTML = bodyHTML;
        $.modalActions.innerHTML = actionsHTML;
        $.modalOverlay.classList.add('show');
    }

    function hideModal() {
        $.modalOverlay.classList.remove('show');
    }

    function showToast(msg) {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();
        const el = document.createElement('div');
        el.className = 'toast';
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2000);
    }

    // ========== 搜索 ==========
    function setupSearch() {
        // 输入时仅更新 UI（显示/隐藏清除按钮、搜索历史下拉），不自动搜索
        $.searchInput.addEventListener('input', () => {
            const q = $.searchInput.value.trim();
            $.searchClear.style.display = q ? '' : 'none';

            if (!q) {
                $.searchDropdown.style.display = 'none';
                // 恢复默认视图
                if (_currentView === 'search') navigateHome();
                return;
            }

            // 搜索历史下拉
            const history = PlaylistStore.getSearchHistory();
            if (history.length && document.activeElement === $.searchInput) {
                renderSearchDropdown(history);
            }
        });

        // Enter 键触发搜索
        $.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const q = $.searchInput.value.trim();
                if (q) {
                    $.searchDropdown.style.display = 'none';
                    doSearch(q);
                }
            }
        });

        $.searchInput.addEventListener('focus', () => {
            const q = $.searchInput.value.trim();
            const history = PlaylistStore.getSearchHistory();
            if (!q && history.length) renderSearchDropdown(history);
        });

        $.searchInput.addEventListener('blur', () => {
            setTimeout(() => { $.searchDropdown.style.display = 'none'; }, 200);
        });

        $.searchClear.addEventListener('click', () => {
            $.searchInput.value = '';
            $.searchClear.style.display = 'none';
            $.searchDropdown.style.display = 'none';
            if (_currentView === 'search') navigateHome();
        });

        // 确认按钮触发搜索
        const confirmBtn = document.getElementById('searchConfirm');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                const q = $.searchInput.value.trim();
                if (q) {
                    $.searchDropdown.style.display = 'none';
                    doSearch(q);
                }
            });
        }
    }

    function renderSearchDropdown(history) {
        if (!history.length) { $.searchDropdown.style.display = 'none'; return; }
        $.searchDropdown.innerHTML = `
            <div class="shd-header">
                <span>最近搜索</span>
                <button type="button" class="shd-clear" data-action="clear-search-history">清除</button>
            </div>
            ${history.slice(0, 8).map(q => `
                <div class="shd-item" data-action="search-history" data-query="${escapeHtml(q)}">
                    <span style="color:var(--text-tertiary)">🕐</span>
                    <span class="shd-query">${escapeHtml(q)}</span>
                </div>
            `).join('')}
        `;
        $.searchDropdown.style.display = '';
    }

    async function doSearch(q) {
        _currentView = 'search';
        $.sectionHeader.style.display = 'none';
        $.viewHeader.style.display = 'none';
        setActiveSidebarNav('');

        // 显示 spinner
        $.searchSpinner.classList.add('active');

        try {
            const resp = await fetch('/api/search?q=' + encodeURIComponent(q));
            if (!resp.ok) throw new Error('搜索失败');
            const data = await resp.json();
            const results = data.results || [];

            PlaylistStore.addSearchHistory(q);

            if (!results.length) {
                // 无结果 — 记录搜索日志
                fetch('/api/search-log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: q, searched_at: new Date().toISOString() }),
                }).catch(() => {});
                $.viewContainer.innerHTML = `
                    <div class="empty-state search-empty">
                        <span class="empty-icon">🔍</span>
                        没有找到 "<strong>${escapeHtml(q)}</strong>" 的相关歌曲
                    </div>`;
                $.searchSpinner.classList.remove('active');
                return;
            }

            window._currentSongs = results;
            window._currentPlaylist = null;
            $.viewContainer.innerHTML = renderSongList(results);
            bindCardClicks();
        } catch (e) {
            $.viewContainer.innerHTML = `<div class="empty-state"><span class="empty-icon">⚠️</span>搜索出错<br><small>${escapeHtml(e.message)}</small></div>`;
        } finally {
            $.searchSpinner.classList.remove('active');
        }
    }

    // ========== 歌词窗口 ==========
    let lyricsWindow = null;

    function openLyricsWindow() {
        const song = Player.getCurrentSong();
        if (!song || !song.id) return;
        if (lyricsWindow && !lyricsWindow.closed) {
            lyricsWindow.focus();
            return;
        }
        lyricsWindow = window.open(
            'lyrics.html?songId=' + song.id,
            'music_player_lyrics',
            'width=360,height=520'
        );
    }

    function closeLyricsWindow() {
        if (lyricsWindow && !lyricsWindow.closed) {
            lyricsWindow.close();
        }
        lyricsWindow = null;
    }

    // ========== 嵌入式歌词面板 ==========

    /** 嵌入式歌词：带歌词缓存的 fetch */
    async function fetchLyricsEmbedded(songId) {
        _currentLyricsSongId = songId;

        // 检查内存缓存
        if (_lyricsCache[songId]) {
            const cached = _lyricsCache[songId];
            if ($.embeddedLyricsTitle) $.embeddedLyricsTitle.textContent = cached.title || '歌词';
            if ($.embeddedLyricsSinger) $.embeddedLyricsSinger.textContent = cached.singer || '';
            _embeddedLyricsLines = cached.lines;
            _embeddedLyricsIdx = -1;
            _lrcOffsetMs = cached.offset || 0;
            updateOffsetDisplay();
            renderLyricsEmbedded();
            return;
        }

        try {
            const resp = await fetch(`/api/lyrics/${songId}`);
            if (!resp.ok) {
                _embeddedLyricsLines = [];
                _embeddedLyricsIdx = -1;
                _lrcOffsetMs = 0;
                updateOffsetDisplay();
                renderLyricsEmbedded();
                return;
            }
            const data = await resp.json();
            if ($.embeddedLyricsTitle) {
                $.embeddedLyricsTitle.textContent = data.title || '歌词';
            }
            if ($.embeddedLyricsSinger) {
                $.embeddedLyricsSinger.textContent = data.singer || '';
            }
            _embeddedLyricsLines = parseLRCEmbedded(data.lrc_text);
            _embeddedLyricsIdx = -1;

            // 优先使用服务端偏移，其次 localStorage
            if (data.lrc_offset_ms && data.lrc_offset_ms !== 0) {
                _lrcOffsetMs = data.lrc_offset_ms;
            } else {
                _lrcOffsetMs = loadLrcOffset(songId);
            }
            updateOffsetDisplay();

            // 写入歌词缓存（限制最大条目数）
            _lyricsCache[songId] = {
                title: data.title || '歌词',
                singer: data.singer || '',
                lines: _embeddedLyricsLines,
                offset: _lrcOffsetMs,
            };
            const cacheKeys = Object.keys(_lyricsCache);
            if (cacheKeys.length > LYRICS_CACHE_MAX) {
                delete _lyricsCache[cacheKeys[0]];
            }

            renderLyricsEmbedded();
        } catch (err) {
            console.error('[lyrics-embedded] 加载歌词失败:', err);
            _embeddedLyricsLines = [];
            _embeddedLyricsIdx = -1;
            renderLyricsEmbedded();
        }
    }

    function renderLyricsEmbedded() {
        const body = $.lyricsPanelBody;
        if (!body) return;

        if (_embeddedLyricsLines.length === 0) {
            body.innerHTML = `
                <div class="lyrics-empty">
                    <div class="empty-icon">🎵</div>
                    <div>暂无歌词</div>
                </div>`;
            return;
        }

        // 竖版模式：≈10 行，当前行居中
        const visibleCount = 10;
        const halfCount = Math.floor(visibleCount / 2);
        let startIdx = Math.max(0, _embeddedLyricsIdx - halfCount);
        let endIdx = Math.min(_embeddedLyricsLines.length, startIdx + visibleCount);
        if (endIdx - startIdx < visibleCount) {
            startIdx = Math.max(0, endIdx - visibleCount);
        }

        const visibleLines = _embeddedLyricsLines.slice(startIdx, endIdx);

        body.innerHTML = visibleLines.map((l, i) => {
            const globalIdx = startIdx + i;
            const cls = globalIdx === _embeddedLyricsIdx ? 'lyric-line active' : 'lyric-line';
            return `<div class="${cls}" data-idx="${globalIdx}">${escapeHtml(l.text)}</div>`;
        }).join('');

        autoResizeEmbeddedLyrics();
    }

    function syncLyricsEmbedded(currentSec) {
        if (_embeddedLyricsLines.length === 0) return;

        // 应用用户手动偏移
        const adjustedSec = currentSec + _lrcOffsetMs / 1000;

        // 二分查找：最后一个 time <= adjustedSec 的行
        let lo = 0, hi = _embeddedLyricsLines.length - 1;
        let found = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (_embeddedLyricsLines[mid].time <= adjustedSec) {
                found = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }

        if (found !== _embeddedLyricsIdx) {
            _embeddedLyricsIdx = found;
            renderLyricsEmbedded();
        }
    }

    function autoResizeEmbeddedLyrics() {
        const body = $.lyricsPanelBody;
        if (!body) return;
        const h = body.clientHeight;
        const lineHeight = Math.max(28, Math.min(50, h / 10));
        const activeSize = Math.max(14, lineHeight * 0.52);
        const baseSize = Math.max(12, lineHeight * 0.38);
        body.style.setProperty('--v-active-size', Math.round(activeSize) + 'px');
        body.style.setProperty('--v-base-size', Math.round(baseSize) + 'px');
    }

    function openLyricsPanel() {
        if (!$.lyricsPanel) return;
        _embeddedLyricsOpen = true;
        $.lyricsPanel.classList.add('open');

        const song = Player.getCurrentSong();
        if (song && song.id) {
            fetchLyricsEmbedded(song.id);
        } else {
            $.lyricsPanelBody.innerHTML = `
                <div class="lyrics-empty">
                    <div class="empty-icon">🎵</div>
                    <div>等待播放...</div>
                </div>`;
        }
    }

    function closeLyricsPanel() {
        _embeddedLyricsOpen = false;
        if ($.lyricsPanel) $.lyricsPanel.classList.remove('open');
    }

    function toggleLyricsPanel() {
        if (_embeddedLyricsOpen) {
            closeLyricsPanel();
        } else {
            openLyricsPanel();
        }
    }

    function popoutLyricsEmbedded() {
        const song = Player.getCurrentSong();
        if (!song || !song.id) return;
        // 把当前偏移传给独立窗口（通过 URL 参数）
        const offsetParam = _lrcOffsetMs !== 0 ? '&offset=' + _lrcOffsetMs : '';
        if (lyricsWindow && !lyricsWindow.closed) {
            lyricsWindow.focus();
            return;
        }
        lyricsWindow = window.open(
            'lyrics.html?songId=' + song.id + offsetParam,
            'music_player_lyrics',
            'width=360,height=520'
        );
    }

    // ========== 歌词偏移控制 ==========

    function loadLrcOffset(songId) {
        if (!songId) return 0;
        try {
            const raw = localStorage.getItem('lrc_offset_' + songId);
            return raw ? parseInt(raw, 10) : 0;
        } catch (e) { return 0; }
    }

    /** 保存歌词偏移到 localStorage（带 500ms 防抖） */
    let _lrcOffsetSaveTimer = null;

    function saveLrcOffset(songId, offsetMs) {
        if (!songId) return;
        clearTimeout(_lrcOffsetSaveTimer);
        _lrcOffsetSaveTimer = setTimeout(() => {
            try {
                localStorage.setItem('lrc_offset_' + songId, String(offsetMs));
            } catch (e) { /* ignore */ }
        }, 500);
    }

    function isLrcOffsetAllowed() {
        return typeof Auth !== 'undefined' && Auth.isLoggedIn && Auth.isLoggedIn();
    }

    function updateOffsetDisplay() {
        if (!$.lyricsOffsetControls) return;

        // 仅登录用户可见偏移控件
        const allowed = isLrcOffsetAllowed();
        $.lyricsOffsetControls.style.display = allowed ? 'flex' : 'none';

        if (!allowed || !$.lyricsOffsetVal) return;
        const sec = _lrcOffsetMs / 1000;
        const sign = sec >= 0 ? '+' : '';
        $.lyricsOffsetVal.textContent = sign + sec.toFixed(1) + 's';
        // 偏移不为0时高亮
        $.lyricsOffsetVal.style.color = _lrcOffsetMs !== 0
            ? 'var(--accent)'
            : 'var(--text-secondary)';
        // 显示/隐藏重置按钮
        const resetBtn = document.getElementById('btnOffsetReset');
        if (resetBtn) {
            resetBtn.style.visibility = _lrcOffsetMs !== 0 ? 'visible' : 'hidden';
        }
    }

    function adjustLrcOffset(deltaMs) {
        if (!isLrcOffsetAllowed()) return;
        _lrcOffsetMs += deltaMs;
        // 限制在 ±30 秒内
        if (_lrcOffsetMs > 30000) _lrcOffsetMs = 30000;
        if (_lrcOffsetMs < -30000) _lrcOffsetMs = -30000;
        updateOffsetDisplay();
        saveLrcOffset(_currentLyricsSongId, _lrcOffsetMs);
        saveLrcOffsetToServer(_currentLyricsSongId, _lrcOffsetMs);
    }

    function resetLrcOffset() {
        if (!isLrcOffsetAllowed()) return;
        _lrcOffsetMs = 0;
        updateOffsetDisplay();
        saveLrcOffset(_currentLyricsSongId, 0);
        saveLrcOffsetToServer(_currentLyricsSongId, 0);
    }

    async function saveLrcOffsetToServer(songId, offsetMs) {
        if (!songId) return;
        try {
            const headers = { 'Content-Type': 'application/json' };
            // 附加认证头（如果已登录）
            if (typeof Auth !== 'undefined' && Auth.getAuthHeaders) {
                Object.assign(headers, Auth.getAuthHeaders());
            }
            await fetch(`/api/lyrics/${songId}/offset`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ offset_ms: offsetMs }),
            });
        } catch (e) { /* 静默失败，本地已保存 */ }
    }

    // ========== 歌曲短评 (Reviews) — 已删除 2026-07-03 ==========

    // ========== 平板底部抽屉 ==========
    function openDrawer(tab = 'fav') {
        const source = tab === 'fav' ? document.getElementById('drawerFav') : document.getElementById('drawerPl');
        // 同步从侧边栏数据刷新
        if (tab === 'fav' && Auth.isLoggedIn()) {
            const favs = PlaylistStore.getFavorites();
            source.innerHTML = favs.length
                ? renderSongList(favs.map((f, i) => ({ ...f, _fav: true })))
                : '<div class="empty-state"><span class="empty-icon">⭐</span>还没有收藏</div>';
        }
        if (tab === 'pl' && Auth.isLoggedIn()) {
            source.innerHTML = renderPlaylistsInDrawer();
        }
        $.drawerContent.innerHTML = '';
        $.drawerContent.appendChild(source.cloneNode(true));

        // 更新 tab 样式
        document.querySelectorAll('.drawer-tab').forEach(t => t.classList.remove('active'));
        const activeTab = document.querySelector(`.drawer-tab[data-drawer-tab="${tab}"]`);
        if (activeTab) activeTab.classList.add('active');

        // 显示
        $.drawerOverlay.style.display = '';
        $.drawerSheet.style.display = '';
        requestAnimationFrame(() => {
            $.drawerOverlay.classList.add('show');
            $.drawerSheet.classList.add('show');
        });
    }

    function renderPlaylistsInDrawer() {
        const pls = PlaylistStore.getPlaylists();
        if (!pls || !pls.length) {
            return '<div class="empty-state"><span class="empty-icon">📋</span>还没有歌单</div>';
        }
        return pls.map(pl => `
            <div class="playlist-item" data-action="open-playlist" data-pl-id="${pl.id}">
                <span style="font-size:20px">📋</span>
                <span class="pl-name">${escapeHtml(pl.name)}</span>
                <span class="pl-count"><button class="btn-show-all" data-action="open-playlist" data-pl-id="${pl.id}">展示全部</button>${pl.song_count || 0} 首</span>
            </div>
        `).join('');
    }

    function closeDrawer() {
        $.drawerOverlay.classList.remove('show');
        $.drawerSheet.classList.remove('show');
        setTimeout(() => {
            $.drawerOverlay.style.display = '';
            $.drawerSheet.style.display = '';
        }, 400);
    }

    // ========== 卡片点击绑定 ==========
    /**
     * bindCardClicks 已移除 — 点击逻辑已合并到 setupGlobalDelegation。
     * 保留在 render 函数中但不执行任何操作，避免调用点报错。
     */
    function bindCardClicks() {}

    // ========== Event Delegation ==========
    function setupGlobalDelegation() {
        document.body.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) {
                // 非 data-action 点击：关闭 popup 或检测封面卡片和列表行（播放）
                closeAddPopup();
                const coverCard = e.target.closest('.cover-card');
                if (coverCard && !e.target.closest('button')) {
                    const idx = parseInt(coverCard.dataset.songIndex);
                    if (!isNaN(idx) && window._currentSongs) {
                        Player.playAll(window._currentSongs, idx);
                    }
                    return;
                }
                const listItem = e.target.closest('.song-list-item');
                if (listItem && !e.target.closest('button')) {
                    const idx = parseInt(listItem.dataset.songIndex);
                    if (!isNaN(idx) && window._currentSongs) {
                        Player.playAll(window._currentSongs, idx);
                        return;
                    }
                    // 歌单列表项（没有 songIndex，有 plId）→ 进入歌单
                    const plId = parseInt(listItem.dataset.plId);
                    if (!isNaN(plId)) {
                        navigateToPlaylistSongs(plId);
                    }
                    return;
                }
                return;
            }
            const action = btn.dataset.action;

            // === 导航 ===
            if (action === 'nav-home') {
                e.preventDefault();
                navigateHome();
                return;
            }
            if (action === 'nav-favorites') {
                e.preventDefault();
                if (!Auth.isLoggedIn()) { showAuthModal(); return; }
                renderFavoritesInContent();
                bindCardClicks();
                return;
            }
            if (action === 'nav-playlists') {
                e.preventDefault();
                if (!Auth.isLoggedIn()) { showAuthModal(); return; }
                renderPlaylistsInContent();
                return;
            }
            if (action === 'nav-collection') {
                e.preventDefault();
                await navigateToCollection();
                return;
            }
            if (action === 'nav-collection-hot') {
                e.preventDefault();
                await navigateToCollectionBySlug('hot-songs');
                return;
            }
            if (action === 'nav-collection-classic') {
                e.preventDefault();
                await navigateToCollectionBySlug('jing-dian-huai-jiu');
                return;
            }
            if (action === 'nav-collection-yueyu') {
                e.preventDefault();
                await navigateToCollectionBySlug('yue-yu-jing-dian');
                return;
            }
            if (action === 'nav-collection-ktv') {
                e.preventDefault();
                await navigateToCollectionBySlug('ktv-must-sing');
                return;
            }
            if (action === 'nav-collection-minyao') {
                e.preventDefault();
                await navigateToCollectionBySlug('min-yao');
                return;
            }
            if (action === 'navigate-collection-item') {
                const collId = parseInt(btn.dataset.collectionId);
                if (collId) navigateToCollectionItems(collId);
                return;
            }
            if (action === 'navigate-collection-songs') {
                const bvid = btn.dataset.bvid;
                const itemTitle = btn.dataset.itemTitle || '';
                if (bvid) await navigateToCollectionSongs(bvid, itemTitle);
                return;
            }

            // === 博客导航 ===
            if (action === 'nav-notes') {
                e.preventDefault();
                _currentView = 'notes';
                navigateToNotes();
                return;
            }
            if (action === 'nav-all-reviews') {
                e.preventDefault();
                showToast('短评功能已关闭');
                return;
            }
            if (action === 'feed-open-note') {
                const noteId = parseInt(btn.dataset.id);
                if (!isNaN(noteId)) navigateToNote(noteId);
                return;
            }
            if (action === 'feed-play-recommended') {
                const songId = parseInt(btn.dataset.songId);
                if (songId && _songCache[songId]) {
                    playSongById(songId);
                    showToast('▶ 正在播放每日推荐歌曲');
                }
                return;
            }
            if (action === 'feed-play-song') {
                const songId = parseInt(btn.dataset.songId);
                if (songId && _songCache[songId]) {
                    playSongById(songId);
                }
                return;
            }
            if (action === 'play-recommended') {
                const idx = parseInt(btn.dataset.songIndex);
                if (!isNaN(idx) && window._currentSongs && window._currentSongs[idx]) {
                    Player.playAll(window._currentSongs, idx);
                }
                return;
            }
            if (action === 'play-embed-song') {
                e.preventDefault();
                e.stopPropagation();
                const songId = parseInt(btn.dataset.songId);
                if (songId) {
                    playSongById(songId);
                }
                return;
            }
            if (action === 'show-note-editor') {
                showNoteEditor();
                return;
            }
            if (action === 'edit-note') {
                const noteId = parseInt(btn.dataset.noteId);
                if (!isNaN(noteId)) showNoteEditor(noteId);
                return;
            }
            if (action === 'delete-note') {
                const noteId = parseInt(btn.dataset.noteId);
                if (!isNaN(noteId)) deleteNote(noteId);
                return;
            }
            if (action === 'home-hero-play') {
                const songId = parseInt(btn.dataset.songId);
                if (songId && _songCache[songId]) {
                    playSongById(songId);
                }
                return;
            }
            // --- 评论事件 ---
            if (action === 'submit-comment') {
                e.preventDefault();
                const commentInput = document.getElementById('commentInput');
                if (!commentInput) return;
                const content = commentInput.value.trim();
                if (!content) { showToast('请输入评论内容'); return; }
                const noteId = _currentNoteId;
                if (!noteId) return;
                try {
                    const res = await fetchWithAuth(`/api/notes/${noteId}/comments`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content }),
                    });
                    if (!res.ok) {
                        const err = await res.json();
                        showToast(err.error || '评论失败');
                        return;
                    }
                    // 成功，重新加载评论
                    showToast('评论已发表');
                    const commentsSection = document.getElementById('commentsSection');
                    if (commentsSection) commentsSection.remove();
                    appendComments(noteId);
                } catch (err) {
                    showToast('网络错误');
                }
                return;
            }
            if (action === 'delete-comment') {
                const commentId = parseInt(btn.dataset.commentId);
                if (!commentId || !confirm('确定要删除这条评论？')) return;
                try {
                    const res = await fetchWithAuth(`/api/comments/${commentId}`, { method: 'DELETE' });
                    if (!res.ok) { showToast('删除失败'); return; }
                    showToast('评论已删除');
                    const item = btn.closest('.comment-item');
                    if (item) item.remove();
                } catch (err) {
                    showToast('网络错误');
                }
                return;
            }
            if (action === 'load-more-notes') {
                _notesPage++;
                await renderNotesList();
                return;
            }
            // --- 短评事件 — 已删除 2026-07-03 ---
            if (action === 'load-more-reviews' || action === 'submit-review' || action === 'delete-review' || action === 'play-review-song') {
                return;
            }
            if (action === 'nav-back') {
                goBack();
                return;
            }

            // === 播放器 ===
            if (action === 'toggle-play') {
                Player.togglePlay();
                return;
            }
            if (action === 'prev') {
                Player.prev();
                return;
            }
            if (action === 'next') {
                Player.next();
                return;
            }
            if (action === 'toggle-mode') {
                const modes = ['loop-all', 'loop-single', 'shuffle'];
                const current = Player.getMode();
                const idx = modes.indexOf(current);
                Player.setMode(modes[(idx + 1) % modes.length]);
                return;
            }
            if (action === 'open-lyrics') {
                toggleLyricsPanel();
                return;
            }
            if (action === 'open-now-playing') {
                openNowPlaying();
                return;
            }
            if (action === 'close-now-playing') {
                closeNowPlaying();
                return;
            }

            // === 复制B站链接 ===
            if (action === 'copy-bilibili-link') {
                e.stopPropagation();
                const url = btn.dataset.url;
                const title = btn.dataset.title || '';
                const singer = btn.dataset.singer || '';
                const songId = btn.dataset.songId || '';
                if (url) {
                    const text = `${url} — ${title} — ${singer} (ID: ${songId})`;
                    try {
                        await navigator.clipboard.writeText(text);
                        showToast('已复制：' + title);
                    } catch {
                        // 降级：用 textarea
                        const ta = document.createElement('textarea');
                        ta.value = text;
                        ta.style.position = 'fixed';
                        ta.style.left = '-9999px';
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        document.body.removeChild(ta);
                        showToast('已复制：' + title);
                    }
                }
                return;
            }

            // === 收藏 ===
            if (action === 'toggle-fav') {
                e.stopPropagation();
                if (!Auth.isLoggedIn()) { showAuthModal(); return; }
                const sid = parseInt(btn.dataset.songId);
                await PlaylistStore.toggleFavorite(sid);
                // 更新沉浸式视图（onChange 回调中的 refreshAll 处理 DOM 更新）
                if ($.npoOverlay.style.display === 'flex') {
                    const isFav = PlaylistStore.isFavorite(sid);
                    $.npoBtnFav.textContent = isFav ? '❤️ 已收藏' : '♡ 收藏';
                }
                return;
            }
            if (action === 'toggle-fav-npo') {
                if (!Auth.isLoggedIn()) { showAuthModal(); return; }
                const sid = parseInt(btn.dataset.songId);
                await PlaylistStore.toggleFavorite(sid);
                return;
            }

            // === 歌单 ===
            if (action === 'show-add-to-playlist') {
                e.stopPropagation();
                if (!Auth.isLoggedIn()) { showAuthModal(); return; }
                const sid = parseInt(btn.dataset.songId);
                showAddToPlaylistPopup(sid, btn);
                return;
            }
            // 非 data-action 点击关闭 popup 由最外层处理
            if (action === 'new-playlist') {
                showCreatePlaylistModal();
                return;
            }
            if (action === 'rename-playlist') {
                e.stopPropagation();  // 防止触发 open-playlist（双击时在 dblclick 处理重命名）
                return;
            }
            if (action === 'open-playlist') {
                const plId = parseInt(btn.dataset.plId);
                navigateToPlaylistSongs(plId);
                return;
            }
            if (action === 'delete-playlist') {
                e.stopPropagation();
                const plId = parseInt(btn.dataset.plId);
                const pl = PlaylistStore.getPlaylist(plId);
                if (pl && confirm('确定删除歌单 "' + pl.name + '" 吗？')) {
                    await PlaylistStore.deletePlaylist(plId);
                }
                return;
            }

            // === 播放全部 ===
            if (action === 'play-all-favs') {
                const favs = PlaylistStore.getFavorites();
                if (favs.length) {
                    window._currentSongs = favs;
                    window._currentPlaylist = null;
                    Player.playAll(favs, 0);
                }
                return;
            }
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
                navigateToPlaylistSongs(pid);
                return;
            }

            // === Auth ===
            if (action === 'show-feedback') {
                showFeedbackModal();
                return;
            }
            if (action === 'show-auth') {
                showAuthModal();
                return;
            }
            if (action === 'toggle-user-menu') {
                $.userDropdown.style.display = $.userDropdown.style.display === 'none' ? '' : 'none';
                return;
            }
            if (action === 'logout') {
                await Auth.logout();
                $.userDropdown.style.display = 'none';
                updateAuthUI();
                if (_currentView === 'favorites' || _currentView === 'playlists') navigateHome();
                return;
            }
            if (action === 'change-username') {
                $.userDropdown.style.display = 'none';
                showChangeUsernameModal();
                return;
            }
            if (action === 'change-avatar') {
                $.userDropdown.style.display = 'none';
                triggerAvatarUpload();
                return;
            }

            // === 搜索 ===
            if (action === 'search-history') {
                const q = btn.dataset.query;
                $.searchInput.value = q;
                $.searchClear.style.display = '';
                $.searchDropdown.style.display = 'none';
                doSearch(q);
                return;
            }
            if (action === 'clear-search-history') {
                PlaylistStore.clearSearchHistory();
                $.searchDropdown.style.display = 'none';
                return;
            }

            // === Modal ===
            if (action === 'close-modal') {
                hideModal();
                return;
            }
            if (action === 'new-playlist-from-add') {
                const sid = parseInt(btn.dataset.songId);
                showCreatePlaylistModal(sid);
                return;
            }
        });

        // 双击歌单名 → 重命名
        document.body.addEventListener('dblclick', (e) => {
            const btn = e.target.closest('[data-action="rename-playlist"], [data-action="rename-playlist-dbl"]');
            if (!btn) return;
            e.stopPropagation();
            const plId = parseInt(btn.dataset.plId);
            if (plId) startRename(plId);
        });

        // 进度条拖拽（支持 click + drag）
        function setupProgressDrag(wrap) {
            let dragging = false;

            function seekTo(clientX) {
                const rect = wrap.getBoundingClientRect();
                const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                const time = pct * Player.getDuration();
                Player.seek(time);
            }

            wrap.addEventListener('mousedown', (e) => {
                dragging = true;
                seekTo(e.clientX);
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!dragging) return;
                seekTo(e.clientX);
            });

            document.addEventListener('mouseup', () => {
                dragging = false;
            });

            // 触摸支持
            wrap.addEventListener('touchstart', (e) => {
                dragging = true;
                seekTo(e.touches[0].clientX);
                e.preventDefault();
            }, { passive: false });

            document.addEventListener('touchmove', (e) => {
                if (!dragging) return;
                seekTo(e.touches[0].clientX);
            });

            document.addEventListener('touchend', () => {
                dragging = false;
            });
        }

        setupProgressDrag($.progressWrap);
        setupProgressDrag($.npoProgressWrap);

        // 音量 — 初始状态
        Player.setVolume(0.8);
        updateVolumeIcon();

        $.btnVolume.addEventListener('click', () => {
            $.volumePopup.style.display = $.volumePopup.style.display === 'none' ? '' : 'none';
        });
        $.volumeSlider.addEventListener('input', () => {
            Player.setVolume($.volumeSlider.value / 100);
            updateVolumeIcon();
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.player-right')) {
                $.volumePopup.style.display = 'none';
            }
        });

        // 用户下拉关闭
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.user-menu-wrap')) {
                $.userDropdown.style.display = 'none';
            }
        });

        // Modal 关闭
        $.modalOverlay.addEventListener('click', (e) => {
            if (e.target === $.modalOverlay) hideModal();
        });

        // 抽屉
        $.fabDrawer.addEventListener('click', () => openDrawer('fav'));
        $.drawerOverlay.addEventListener('click', () => closeDrawer());

        // 抽屉 tabs
        document.querySelectorAll('.drawer-tab').forEach(tab => {
            tab.addEventListener('click', () => openDrawer(tab.dataset.drawerTab));
        });

        // 滚动阴影
        $.contentArea.addEventListener('scroll', () => {
            $.topBar.classList.toggle('scrolled', $.contentArea.scrollTop > 0);
        });

        // 手机端点击 player-info 展开播放栏
        const playerNow = document.getElementById('playerNow');
        if (playerNow && $.playerBar) {
            playerNow.addEventListener('click', (e) => {
                // 不拦截封面点击
                if (e.target.closest('.player-cover-wrap')) return;
                if (window.innerWidth < 768) {
                    $.playerBar.classList.toggle('expanded');
                }
            });
        }

        // 歌词面板按钮
        if ($.btnLyricsClose) {
            $.btnLyricsClose.addEventListener('click', () => closeLyricsPanel());
        }
        if ($.btnLyricsPopout) {
            $.btnLyricsPopout.addEventListener('click', () => popoutLyricsEmbedded());
        }

        // 歌词偏移按钮
        const btnOffsetMinus = document.getElementById('btnOffsetMinus');
        const btnOffsetPlus = document.getElementById('btnOffsetPlus');
        const btnOffsetReset = document.getElementById('btnOffsetReset');
        if (btnOffsetMinus) {
            btnOffsetMinus.addEventListener('click', () => adjustLrcOffset(-500));
        }
        if (btnOffsetPlus) {
            btnOffsetPlus.addEventListener('click', () => adjustLrcOffset(+500));
        }
        if (btnOffsetReset) {
            btnOffsetReset.addEventListener('click', () => resetLrcOffset());
        }

        // 歌词面板：点击/拖拽歌词行跳转播放进度
        if ($.lyricsPanelBody) {
            let lyricsDragging = false;

            function seekLyricsByClientY(clientY) {
                const lineEl = document.elementFromPoint(
                    $.lyricsPanelBody.getBoundingClientRect().left + 20,
                    clientY
                )?.closest('.lyric-line');
                if (!lineEl) return;
                const idx = parseInt(lineEl.dataset.idx);
                if (!isNaN(idx) && _embeddedLyricsLines[idx]) {
                    Player.seek(_embeddedLyricsLines[idx].time);
                }
            }

            $.lyricsPanelBody.addEventListener('mousedown', (e) => {
                const line = e.target.closest('.lyric-line');
                if (!line) return;
                lyricsDragging = true;
                const idx = parseInt(line.dataset.idx);
                if (!isNaN(idx) && _embeddedLyricsLines[idx]) {
                    Player.seek(_embeddedLyricsLines[idx].time);
                }
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!lyricsDragging) return;
                seekLyricsByClientY(e.clientY);
            });

            document.addEventListener('mouseup', () => {
                lyricsDragging = false;
            });

            // 触摸支持
            $.lyricsPanelBody.addEventListener('touchstart', (e) => {
                const line = e.target.closest('.lyric-line');
                if (!line) return;
                lyricsDragging = true;
                const idx = parseInt(line.dataset.idx);
                if (!isNaN(idx) && _embeddedLyricsLines[idx]) {
                    Player.seek(_embeddedLyricsLines[idx].time);
                }
                e.preventDefault();
            }, { passive: false });

            document.addEventListener('touchmove', (e) => {
                if (!lyricsDragging) return;
                seekLyricsByClientY(e.touches[0].clientY);
            });

            document.addEventListener('touchend', () => {
                lyricsDragging = false;
            });
        }

        // 窗口缩放时自适应歌词字号
        window.addEventListener('resize', () => {
            if (_embeddedLyricsOpen) {
                autoResizeEmbeddedLyrics();
            }
        });
    }

    // ========== Auth Modal (Email-First) ==========

    /**
     * Email-First 登录弹窗
     * 3 个状态：'email' → 'password'（已有账号）/ 'register'（新用户或验证码登录）
     */
    function showAuthModal() {
        let state = 'email';    // 'email' | 'password' | 'register'
        let email = '';
        let isNewUser = false;  // true = 新注册需设密码，false = 已有账号用验证码
        let countdown = 0;
        let cdTimer = null;

        function stopCountdown() {
            if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
        }

        function render() {
            let fields, btnText, title;

            if (state === 'email') {
                // ===== 状态 1: 输入邮箱 =====
                title = '👤 登录 / 注册';
                fields = `
                    <input class="modal-input" id="authEmail" type="email" placeholder="请输入邮箱地址" autocomplete="email" value="${escapeHtml(email)}">
                    <div class="auth-error" id="authError" style="display:none"></div>`;
                btnText = '继续';
            } else if (state === 'password') {
                // ===== 状态 2: 已有账号 → 输入密码 =====
                title = '🔑 登录';
                fields = `
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:13px;color:var(--text-secondary)">
                        <span style="cursor:pointer;color:var(--accent)" data-action="auth-back">← 返回</span>
                        <span>${escapeHtml(email)}</span>
                    </div>
                    <input class="modal-input" id="authPassword" type="password" placeholder="请输入密码" autocomplete="current-password">
                    <div class="auth-error" id="authError" style="display:none"></div>
                    <div style="margin-top:10px;text-align:center;display:flex;justify-content:center;gap:16px">
                        <a data-action="auth-use-code" style="cursor:pointer;color:var(--accent);font-size:13px">用验证码登录</a>
                        <a data-action="auth-forgot-pwd" style="cursor:pointer;color:var(--text-tertiary);font-size:13px">忘记密码？</a>
                    </div>`;
                btnText = '登录';
            } else if (state === 'resetPassword') {
                // ===== 状态 3: 忘记密码 → 验证码 + 新密码 =====
                title = '🔑 重置密码';
                fields = `
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:13px;color:var(--text-secondary)">
                        <span style="cursor:pointer;color:var(--accent)" data-action="auth-back">← 返回</span>
                        <span>${escapeHtml(email)}</span>
                    </div>
                    <div class="auth-code-sent">验证码已发送至 <strong>${escapeHtml(email)}</strong></div>
                    <input class="modal-input auth-code-input" id="authCode" type="text" placeholder="请输入6位验证码" maxlength="6" autocomplete="one-time-code" inputmode="numeric">
                    <input class="modal-input" id="authPassword" type="password" placeholder="设置新密码（至少6位）" autocomplete="new-password" style="margin-top:8px">
                    <div class="auth-error" id="authError" style="display:none"></div>
                    <div style="margin-top:10px;text-align:center">
                        <a id="btnResend" style="cursor:pointer;color:var(--accent);font-size:13px;${countdown > 0 ? 'opacity:0.5;pointer-events:none' : ''}">${countdown > 0 ? `重新发送 (${countdown}s)` : '重新发送'}</a>
                    </div>`;
                btnText = '重置密码';
            } else {
                // ===== 状态 4: 注册 / 验证码登录 =====
                title = isNewUser ? '✨ 创建账号' : '🔑 登录';
                const hint = `验证码已发送至 <strong>${escapeHtml(email)}</strong>`;

                const passwordField = isNewUser
                    ? `<input class="modal-input" id="authPassword" type="password" placeholder="设置密码（至少6位）" autocomplete="new-password" style="margin-top:8px">`
                    : '';

                fields = `
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:13px;color:var(--text-secondary)">
                        <span style="cursor:pointer;color:var(--accent)" data-action="auth-back">← 更换邮箱</span>
                    </div>
                    <div class="auth-code-sent">${hint}</div>
                    <input class="modal-input auth-code-input" id="authCode" type="text" placeholder="请输入6位验证码" maxlength="6" autocomplete="one-time-code" inputmode="numeric">
                    ${passwordField}
                    <div class="auth-error" id="authError" style="display:none"></div>
                    <div style="margin-top:10px;text-align:center">
                        <a id="btnResend" style="cursor:pointer;color:var(--accent);font-size:13px;${countdown > 0 ? 'opacity:0.5;pointer-events:none' : ''}">${countdown > 0 ? `重新发送 (${countdown}s)` : '重新发送'}</a>
                    </div>`;
                btnText = isNewUser ? '注册' : '登录';
            }

            showModal(title,
                `<div class="auth-form">${fields}</div>`,
                `<button class="btn btn-secondary" data-action="close-modal">取消</button>
                 <button class="btn btn-primary" id="btnAuthSubmit">${btnText}</button>`
            );

            const errEl = document.getElementById('authError');
            const submitBtn = document.getElementById('btnAuthSubmit');

            // 返回链接 (password / register state)
            const backLink = document.querySelector('[data-action="auth-back"]');
            if (backLink) {
                backLink.addEventListener('click', () => {
                    stopCountdown();
                    state = 'email';
                    countdown = 0;
                    isNewUser = false;
                    render();
                });
            }

            // "用验证码登录" 链接 (password state)
            const useCodeLink = document.querySelector('[data-action="auth-use-code"]');
            if (useCodeLink) {
                useCodeLink.addEventListener('click', async () => {
                    const link = useCodeLink;
                    link.style.pointerEvents = 'none';
                    link.textContent = '发送中…';
                    try {
                        await Auth.sendCode(email);
                        isNewUser = false;  // 已有账号，不显示密码框
                        state = 'register';
                        countdown = 60;
                        render();
                        startCountdownUI();
                    } catch (e) {
                        link.style.pointerEvents = '';
                        link.textContent = '用验证码登录';
                        if (errEl) { errEl.textContent = e.message; errEl.style.display = ''; }
                    }
                });
            }

            // "忘记密码？" 链接 (password state)
            const forgotPwdLink = document.querySelector('[data-action="auth-forgot-pwd"]');
            if (forgotPwdLink) {
                forgotPwdLink.addEventListener('click', async () => {
                    const link = forgotPwdLink;
                    link.style.pointerEvents = 'none';
                    link.textContent = '发送中…';
                    try {
                        await Auth.sendCode(email);
                        state = 'resetPassword';
                        countdown = 60;
                        render();
                        startCountdownUI();
                    } catch (e) {
                        link.style.pointerEvents = '';
                        link.textContent = '忘记密码？';
                        if (errEl) { errEl.textContent = e.message; errEl.style.display = ''; }
                    }
                });
            }

            // 重新发送链接 (register / resetPassword state)
            const resendBtn = document.getElementById('btnResend');
            if (resendBtn) {
                resendBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    if (countdown > 0) return;
                    resendBtn.textContent = '发送中…';
                    resendBtn.style.pointerEvents = 'none';
                    try {
                        await Auth.sendCode(email);
                        countdown = 60;
                        resendBtn.textContent = `重新发送 (${countdown}s)`;
                        resendBtn.style.opacity = '0.5';
                        resendBtn.style.pointerEvents = 'none';
                        cdTimer = setInterval(() => {
                            countdown--;
                            const b = document.getElementById('btnResend');
                            if (b) {
                                if (countdown > 0) {
                                    b.textContent = `重新发送 (${countdown}s)`;
                                } else {
                                    b.textContent = '重新发送';
                                    b.style.opacity = '';
                                    b.style.pointerEvents = '';
                                    stopCountdown();
                                }
                            }
                        }, 1000);
                    } catch (e2) {
                        resendBtn.textContent = '重新发送';
                        resendBtn.style.opacity = '';
                        resendBtn.style.pointerEvents = '';
                        if (errEl) { errEl.textContent = e2.message; errEl.style.display = ''; }
                    }
                });
            }

            function startCountdownUI() {
                stopCountdown();
                cdTimer = setInterval(() => {
                    countdown--;
                    const b = document.getElementById('btnResend');
                    if (b) {
                        if (countdown > 0) {
                            b.textContent = `重新发送 (${countdown}s)`;
                        } else {
                            b.textContent = '重新发送';
                            b.style.opacity = '';
                            b.style.pointerEvents = '';
                            stopCountdown();
                        }
                    }
                }, 1000);
            }

            // 提交按钮
            submitBtn.addEventListener('click', async () => {
                try {
                    if (state === 'email') {
                        // ===== Email → 检查账号 =====
                        email = document.getElementById('authEmail').value.trim();
                        if (!email || !email.includes('@')) {
                            throw new Error('请输入有效的邮箱地址');
                        }
                        submitBtn.disabled = true;
                        submitBtn.textContent = '正在登录…';

                        const result = await Auth.checkEmail(email);

                        if (result.exists) {
                            // 已有账号 → 密码登录
                            state = 'password';
                            render();
                        } else {
                            // 新用户 → 发送验证码 → 注册
                            isNewUser = true;
                            submitBtn.textContent = '发送中…';
                            await Auth.sendCode(email);
                            state = 'register';
                            countdown = 60;
                            render();
                            startCountdownUI();
                        }
                    } else if (state === 'password') {
                        // ===== 密码登录 =====
                        const pwd = document.getElementById('authPassword').value;
                        if (!pwd) throw new Error('请输入密码');
                        submitBtn.disabled = true;
                        submitBtn.textContent = '登录中…';
                        await Auth.loginWithPassword(email, pwd);
                        hideModal();
                        updateAuthUI();
                        PlaylistStore.loadFromServer();
                    } else if (state === 'resetPassword') {
                        // ===== 忘记密码 → 重置 =====
                        const code = document.getElementById('authCode').value.trim();
                        if (code.length !== 6 || !/^\d{6}$/.test(code)) {
                            throw new Error('请输入6位数字验证码');
                        }
                        const pwd = document.getElementById('authPassword').value;
                        if (!pwd || pwd.length < 6) {
                            throw new Error('密码长度至少 6 位');
                        }
                        submitBtn.disabled = true;
                        submitBtn.textContent = '重置中…';
                        stopCountdown();
                        await Auth.resetPassword(email, code, pwd);
                        // 重置成功 → 回到密码登录态
                        state = 'password';
                        render();
                    } else {
                        // ===== 注册 / 验证码登录 =====
                        const code = document.getElementById('authCode').value.trim();
                        if (code.length !== 6 || !/^\d{6}$/.test(code)) {
                            throw new Error('请输入6位数字验证码');
                        }

                        stopCountdown();
                        if (isNewUser) {
                            // 新用户：验证码 + 密码 → 注册
                            const pwd = document.getElementById('authPassword').value;
                            if (!pwd || pwd.length < 6) {
                                throw new Error('密码长度至少 6 位');
                            }
                            submitBtn.disabled = true;
                            submitBtn.textContent = '注册中…';
                            await Auth.register(email, code, pwd);
                        } else {
                            // 已有账号：验证码 → 登录
                            submitBtn.disabled = true;
                            submitBtn.textContent = '登录中…';
                            await Auth.verifyCode(email, code);
                        }

                        hideModal();
                        updateAuthUI();
                        PlaylistStore.loadFromServer();
                    }
                } catch (e) {
                    if (errEl) {
                        errEl.textContent = e.message;
                        errEl.style.display = '';
                    }
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        if (state === 'email') submitBtn.textContent = '继续';
                        else if (state === 'password') submitBtn.textContent = '登录';
                        else if (state === 'resetPassword') submitBtn.textContent = '重置密码';
                        else submitBtn.textContent = isNewUser ? '注册' : '登录';
                    }
                }
            });

            // 自动聚焦
            setTimeout(() => {
                if (state === 'email') {
                    const el = document.getElementById('authEmail');
                    if (el) el.focus();
                } else if (state === 'password') {
                    const el = document.getElementById('authPassword');
                    if (el) el.focus();
                } else {
                    const el = document.getElementById('authCode');
                    if (el) el.focus();
                }
            }, 100);

            // Enter 键提交
            const enterEls = [
                document.getElementById('authEmail'),
                document.getElementById('authPassword'),
                document.getElementById('authCode'),
            ];
            enterEls.forEach(el => {
                if (el) {
                    el.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            const btn = document.getElementById('btnAuthSubmit');
                            if (btn && !btn.disabled) btn.click();
                        }
                    });
                }
            });
        }

        render();
    }

    // ========== Add to Playlist Popup (Hover 弹出) ==========
    let _addPopup = null;
    let _addPopupTimer = null;

    function showAddToPlaylistPopup(songId, anchorEl) {
        closeAddPopup();

        const pls = PlaylistStore.getPlaylists();
        const popup = document.createElement('div');
        popup.className = 'add-to-pl-popup';
        popup.dataset.songId = songId;

        let html = '';
        if (pls.length) {
            html += pls.map(pl =>
                `<div class="add-to-pl-item" data-action="add-to-pl-item" data-pl-id="${pl.id}" data-song-id="${songId}">${escapeHtml(pl.name)}</div>`
            ).join('');
        } else {
            html += '<div class="add-to-pl-empty">暂无歌单</div>';
        }
        html += '<div class="add-to-pl-divider"></div>';
        html += `<div class="add-to-pl-item add-to-pl-new" data-action="new-playlist-from-add" data-song-id="${songId}">+ 新建歌单</div>`;
        popup.innerHTML = html;

        // 定位
        const rect = anchorEl.getBoundingClientRect();
        popup.style.left = Math.min(rect.right + 4, window.innerWidth - 200) + 'px';
        popup.style.top = rect.top + 'px';

        // 如果弹出层超出底部，向上偏移
        document.body.appendChild(popup);
        requestAnimationFrame(() => {
            const popupRect = popup.getBoundingClientRect();
            if (popupRect.bottom > window.innerHeight) {
                popup.style.top = (rect.top - popupRect.height - 4) + 'px';
            }
        });

        // 点击项处理
        popup.addEventListener('click', async (e) => {
            const item = e.target.closest('.add-to-pl-item');
            if (!item) return;

            const action = item.dataset.action;

            if (action === 'add-to-pl-item') {
                e.stopPropagation();
                if (!Auth.isLoggedIn()) { closeAddPopup(); showAuthModal(); return; }
                const plId = parseInt(item.dataset.plId);
                const sid = parseInt(item.dataset.songId);
                await PlaylistStore.addToPlaylist(plId, sid);
                closeAddPopup();
                showToast('已添加到歌单');
                return;
            }

            if (action === 'new-playlist-from-add') {
                e.stopPropagation();
                closeAddPopup();
                const sid = parseInt(item.dataset.songId);
                showCreatePlaylistModal(sid);
                return;
            }
        });

        // Hover 管理
        popup.addEventListener('mouseenter', () => {
            clearTimeout(_addPopupTimer);
        });
        popup.addEventListener('mouseleave', () => {
            _addPopupTimer = setTimeout(closeAddPopup, 300);
        });

        _addPopup = popup;
    }

    function closeAddPopup() {
        clearTimeout(_addPopupTimer);
        if (_addPopup) {
            _addPopup.remove();
            _addPopup = null;
        }
    }

    function showCreatePlaylistModal(pendingSongId) {
        showModal('新建歌单',
            `<input class="modal-input" id="newPlName" type="text" placeholder="歌单名称" autocomplete="off">`,
            `<button class="btn btn-secondary" data-action="close-modal">取消</button><button class="btn btn-primary" id="btnCreatePl">创建</button>`
        );
        document.getElementById('btnCreatePl').addEventListener('click', async () => {
            const name = document.getElementById('newPlName').value.trim();
            if (!name) return;
            try {
                const pl = await PlaylistStore.createPlaylist(name);
                hideModal();
                if (pendingSongId) {
                    await PlaylistStore.addToPlaylist(pl.id, pendingSongId);
                    showToast('已添加到歌单');
                }
                if (_currentView === 'playlists') renderPlaylistsInContent();
                if (_currentView === 'playlist-songs' && _currentPlaylistId) {
                    PlaylistStore.getPlaylistSongs(_currentPlaylistId).then(songs => {
                        if (!songs) return;
                        const plSongs = songs.map((s, i) => ({ ...s, _idx: i, _plSong: true }));
                        window._currentSongs = plSongs;
                    });
                }
            } catch (e) {
                alert(e.message);
            }
        });
    }

    // ========== 修改用户名 Modal ==========
    function showChangeUsernameModal() {
        const user = Auth.getUser();
        showModal('✏️ 修改用户名',
            `<input class="modal-input" id="newUsername" type="text" placeholder="新用户名" value="${escapeHtml(user.username || '')}" maxlength="30" autocomplete="off">`,
            `<button class="btn btn-secondary" data-action="close-modal">取消</button><button class="btn btn-primary" id="btnSaveUsername">保存</button>`
        );
        document.getElementById('btnSaveUsername').addEventListener('click', async () => {
            const username = document.getElementById('newUsername').value.trim();
            if (!username) return;
            try {
                await Auth.updateProfile({ username });
                hideModal();
                updateAuthUI();
            } catch (e) {
                alert(e.message);
            }
        });
    }

    // ========== 头像上传 ==========
    let _avatarFileInput = null;

    function triggerAvatarUpload() {
        if (!_avatarFileInput) {
            _avatarFileInput = document.createElement('input');
            _avatarFileInput.type = 'file';
            _avatarFileInput.accept = 'image/png,image/jpeg,image/webp';
            _avatarFileInput.addEventListener('change', async () => {
                const file = _avatarFileInput.files[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) {
                    alert('图片不能超过 2MB');
                    return;
                }
                try {
                    await Auth.uploadAvatar(file);
                    updateAuthUI();
                } catch (e) {
                    alert('头像上传失败: ' + e.message);
                }
            });
        }
        _avatarFileInput.click();
    }

    // ========== 意见反馈 Modal ==========
    function showFeedbackModal() {
        showModal('💬 意见反馈',
            `<textarea class="modal-textarea" id="feedbackContent" placeholder="请告诉我们您的想法…" rows="5" maxlength="2000"></textarea>
             <input class="modal-input" id="feedbackContact" type="text" placeholder="联系方式（选填，方便我们回复）" style="margin-top:8px">`,
            `<button class="btn btn-secondary" data-action="close-modal">取消</button><button class="btn btn-primary" id="btnSendFeedback">发送反馈</button>`
        );
        document.getElementById('btnSendFeedback').addEventListener('click', async () => {
            const content = document.getElementById('feedbackContent').value.trim();
            const contact = document.getElementById('feedbackContact').value.trim();
            if (content.length < 2) { alert('请至少输入 2 个字符'); return; }
            const btn = document.getElementById('btnSendFeedback');
            btn.disabled = true;
            btn.textContent = '发送中…';
            try {
                const resp = await fetch('/api/feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content, contact: contact || undefined }),
                });
                const data = await resp.json();
                if (!resp.ok) throw new Error(data.error);
                hideModal();
                alert('感谢反馈！');
            } catch (e) {
                alert('发送失败: ' + e.message);
                btn.disabled = false;
                btn.textContent = '发送反馈';
            }
        });
    }

    function openPlaylistModal(plId) {
        // 已改用 navigateToPlaylistSongs 直接在内容区渲染，保留此函数兼容性
        navigateToPlaylistSongs(plId);
    }

    // ========== 播放器事件（Player.on 回调签名: fn(eventName, data)） ==========
    function setupPlayerEvents() {
        Player.on((eventName, data) => {
            switch (eventName) {
            case 'playState':
                updatePlayButton(data);
                break;
            case 'timeupdate':
                updateProgress({ currentTime: data.displayCurrent, duration: data.displayDuration });
                // 同步嵌入式歌词
                if (_embeddedLyricsOpen) {
                    syncLyricsEmbedded(data.displayCurrent);
                }
                break;
            case 'duration':
                updateDuration(data);
                break;
            case 'modeChange':
                updateModeDisplay();
                break;
            case 'error':
                // 歌曲加载失败，自动跳过到下一首
                _consecutiveErrors++;
                if (_consecutiveErrors >= 5) {
                    showToast('连续多首歌曲加载失败，请检查网络后手动播放');
                    _consecutiveErrors = 0;
                } else {
                    showToast('加载失败，正在尝试下一首');
                    Player.next();
                }
                break;
            case 'ended':
                // 歌曲播放完毕，自动播放下一首
                Player.next();
                break;
            case 'loading':
                // 歌曲加载成功，重置错误计数
                _consecutiveErrors = 0;
                updatePlayBar(data);
                // 切换歌曲时刷新嵌入式歌词
                if (_embeddedLyricsOpen && data && data.id) {
                    fetchLyricsEmbedded(data.id);
                }
                // 更新卡片状态
                document.querySelectorAll('.cover-card.playing, .song-list-item.playing').forEach(el => el.classList.remove('playing'));
                break;
            }
        });
    }

    // ========== 初始化 ==========
    async function init(songs) {
        cacheDom();
        window._songCache = {};
        _defaultSongs = songs;
        mergeToCache(songs);

        // 后台预加载歌曲汇总数据（不阻塞首屏渲染）
        fetch('/api/collections')
            .then(r => r.json())
            .then(d => { _collectionTree = d.collections || []; })
            .catch(() => {});

        // 初始渲染：推荐歌曲封面网格
        window._currentSongs = songs;
        $.viewContainer.innerHTML = renderCoverGrid(songs);
        bindCardClicks();
        setActiveSidebarNav('home');

        // 初始化播放器
        Player.init();

        // 恢复登录状态
        await Auth.init();
        updateAuthUI();

        // 如果已登录，加载服务器数据
        if (Auth.isLoggedIn()) {
            PlaylistStore.loadFromServer().then(() => {
                const favs = PlaylistStore.getFavorites();
                if ($.sidebarFavCount) {
                    $.sidebarFavCount.textContent = favs.length;
                    $.sidebarFavCount.style.display = favs.length > 0 ? '' : 'none';
                }
            });
        }

        // 设置事件
        setupSearch();
        setupGlobalDelegation();
        setupPlayerEvents();

        // 初始化模式按钮显示（修复刷新后仍显示 emoji 的问题）
        updateModeDisplay();

        // PlaylistStore 状态变化 → 刷新 UI
        PlaylistStore.onChange(() => {
            refreshAll();
        });

        // Auth 状态变化 → 更新 UI
        Auth.onChange(() => {
            updateAuthUI();
            updateOffsetDisplay();
            if (Auth.isLoggedIn()) {
                PlaylistStore.loadFromServer();
            }
        });

        // Lyrics 窗口关闭监听
        try {
            const bc = new BroadcastChannel('music_player_lyrics');
            bc.onmessage = (e) => {
                if (e.data && e.data.type === 'lyrics-closed') {
                    lyricsWindow = null;
                }
            };
        } catch (e) { /* BroadcastChannel not supported */ }

        // 主窗口关闭
        window.addEventListener('beforeunload', () => {
            closeLyricsWindow();
        });
    }

    // ========== Public API ==========
    return {
        init,
        renderSongList,
        renderCoverGrid,
        navigateHome,
        updatePlayBar,
        updateModeDisplay,
        refreshAll,
        hideModal,
        openDrawer,
        closeDrawer,
        openNowPlaying,
        closeNowPlaying,
    };
})();
