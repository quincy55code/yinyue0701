/**
 * playlist.js — 歌单与收藏管理 (localStorage)
 * =============================================
 * 数据结构:
 *   favorites: string[]          — 收藏的歌曲 ID 数组
 *   custom_playlists: { name: string, songs: string[] }[]
 *
 * 所有变更自动写入 localStorage，并提供 onChange 回调供 UI 刷新。
 */

const PlaylistStore = (() => {
    const KEYS = {
        favorites: 'music_player_favorites',
        playlists: 'music_player_playlists',
    };

    // 变更监听器
    let _listeners = [];

    function notify() {
        _listeners.forEach(fn => fn());
    }

    /** 注册变更回调 */
    function onChange(fn) {
        _listeners.push(fn);
        return () => { _listeners = _listeners.filter(f => f !== fn); };
    }

    // ========== 收藏 ==========

    function getFavorites() {
        try {
            const raw = localStorage.getItem(KEYS.favorites);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    function saveFavorites(arr) {
        localStorage.setItem(KEYS.favorites, JSON.stringify(arr));
        notify();
    }

    function isFavorite(songId) {
        return getFavorites().includes(String(songId));
    }

    function addFavorite(songId) {
        const favs = getFavorites();
        const id = String(songId);
        if (!favs.includes(id)) {
            favs.push(id);
            saveFavorites(favs);
        }
    }

    function removeFavorite(songId) {
        const favs = getFavorites().filter(f => f !== String(songId));
        saveFavorites(favs);
    }

    function toggleFavorite(songId) {
        if (isFavorite(songId)) {
            removeFavorite(songId);
            return false;
        } else {
            addFavorite(songId);
            return true;
        }
    }

    // ========== 自定义歌单 ==========

    function getPlaylists() {
        try {
            const raw = localStorage.getItem(KEYS.playlists);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    function savePlaylists(pls) {
        localStorage.setItem(KEYS.playlists, JSON.stringify(pls));
        notify();
    }

    function getPlaylist(name) {
        return getPlaylists().find(pl => pl.name === name);
    }

    function createPlaylist(name) {
        const trimmed = name.trim();
        if (!trimmed) return null;
        const pls = getPlaylists();
        if (pls.some(pl => pl.name === trimmed)) return null; // 重名
        const newPl = { name: trimmed, songs: [] };
        pls.push(newPl);
        savePlaylists(pls);
        return newPl;
    }

    function deletePlaylist(name) {
        const pls = getPlaylists().filter(pl => pl.name !== name);
        savePlaylists(pls);
    }

    function addToPlaylist(playlistName, songId) {
        const pls = getPlaylists();
        const pl = pls.find(p => p.name === playlistName);
        if (!pl) return;
        const id = String(songId);
        if (!pl.songs.includes(id)) {
            pl.songs.push(id);
            savePlaylists(pls);
        }
    }

    function removeFromPlaylist(playlistName, songId) {
        const pls = getPlaylists();
        const pl = pls.find(p => p.name === playlistName);
        if (!pl) return;
        pl.songs = pl.songs.filter(s => s !== String(songId));
        savePlaylists(pls);
    }

    return {
        onChange,

        getFavorites,
        isFavorite,
        addFavorite,
        removeFavorite,
        toggleFavorite,

        getPlaylists,
        getPlaylist,
        createPlaylist,
        deletePlaylist,
        addToPlaylist,
        removeFromPlaylist,
    };
})();
