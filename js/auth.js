/**
 * auth.js — 用户认证状态管理
 * ============================
 * 管理登录/注册/登出、会话持久化（localStorage）、
 * 提供 onChange 回调供 UI 订阅状态变化。
 */
const Auth = (() => {
    const SESSION_KEY = 'music_player_session';
    const USER_KEY = 'music_player_user';

    let _session = null;   // { access_token, refresh_token, expires_at }
    let _user = null;      // { id, email, username }
    let _listeners = [];

    function notify() {
        _listeners.forEach(fn => fn(_user));
    }

    /** 注册状态变化回调 */
    function onChange(fn) {
        _listeners.push(fn);
        return () => { _listeners = _listeners.filter(f => f !== fn); };
    }

    function isLoggedIn() {
        return !!(_session && _session.access_token);
    }

    function getUser() {
        return _user;
    }

    function getToken() {
        return _session ? _session.access_token : null;
    }

    function authHeaders() {
        const token = getToken();
        return token ? { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
    }

    // 仅导出 headers 对象构建方法（供 PlaylistStore 使用）
    function getAuthHeaders() {
        const token = getToken();
        if (!token) return { 'Content-Type': 'application/json' };
        return {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
        };
    }
    // 挂在 Auth 上供外部使用
    Auth.getAuthHeaders = getAuthHeaders;

    /** 保存会话到 localStorage */
    function saveSession(session, user) {
        _session = session;
        _user = user;
        try {
            localStorage.setItem(SESSION_KEY, JSON.stringify(session));
            localStorage.setItem(USER_KEY, JSON.stringify(user));
        } catch (e) { /* ignore */ }
        notify();
    }

    /** 清除会话 */
    function clearSession() {
        _session = null;
        _user = null;
        try {
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(USER_KEY);
        } catch (e) { /* ignore */ }
        notify();
    }

    /** 初始化：尝试从 localStorage 恢复会话并验证 */
    async function init() {
        try {
            const savedSession = localStorage.getItem(SESSION_KEY);
            const savedUser = localStorage.getItem(USER_KEY);
            if (!savedSession || !savedUser) return;

            _session = JSON.parse(savedSession);
            _user = JSON.parse(savedUser);

            // 检查 token 是否过期
            if (_session.expires_at && Date.now() > _session.expires_at * 1000) {
                clearSession();
                return;
            }

            // 向服务器验证会话有效性
            const resp = await fetch('/api/auth/me', {
                headers: { 'Authorization': 'Bearer ' + _session.access_token },
            });

            if (resp.ok) {
                const data = await resp.json();
                _user = data.user;
                notify();
            } else {
                clearSession();
            }
        } catch (e) {
            clearSession();
        }
    }

    /** 登录 */
    async function login(email, password) {
        const resp = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const data = await resp.json();
        if (!resp.ok) {
            throw new Error(data.error || '登录失败');
        }

        saveSession(data.session, data.user);
        return data.user;
    }

    /** 注册 */
    async function signup(email, password, username) {
        const resp = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, username }),
        });

        const data = await resp.json();
        if (!resp.ok) {
            throw new Error(data.error || '注册失败');
        }

        saveSession(data.session, data.user);
        return data.user;
    }

    /** 登出 */
    async function logout() {
        try {
            if (_session) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + _session.access_token },
                });
            }
        } catch (e) { /* ignore */ }
        clearSession();
    }

    return {
        init,
        isLoggedIn,
        getUser,
        getToken,
        login,
        signup,
        logout,
        onChange,
        getAuthHeaders, // 占位，上面会覆盖
    };
})();
