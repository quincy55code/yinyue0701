/**
 * 音乐播放器 — Node.js 后端
 * 代理 B站 DASH 音频流，前端无需直接面对跨域和防盗链问题
 */

const express = require('express');

const app = express();
const PORT = 8765;

// CORS — 允许前端跨域访问
app.use((_req, res, next) => {
    res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
    });
    if (_req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// 提供静态文件（index.html, css, js）
app.use(express.static(__dirname));

// ========== 歌曲配置 ==========
const SONGS = [
    {
        id: 1,
        title: "离别开出花",
        bvid: "BV1pY5q6jECZ",
        page: 1,
        start_time: 45 * 60 + 48,   // 45:48
        end_time: 49 * 60 + 47,     // 49:47
        page_duration: 3199,        // B站视频总时长（秒）
    },
    {
        id: 2,
        title: "小幸运",
        bvid: "BV1pr6aYiE97",
        page: 2,
        start_time: null,
        end_time: null,
        page_duration: 266,         // B站页面时长 4:26
    },
    {
        id: 3,
        title: "匆匆那年",
        bvid: "BV1pr6aYiE97",
        page: 7,
        start_time: null,
        end_time: null,
        page_duration: 242,         // B站页面时长 4:02
    },
    {
        id: 4,
        title: "虞兮叹",
        bvid: "BV1dp4y1A7c3",
        page: 1,
        start_time: null,
        end_time: null,
        page_duration: 211,         // B站页面时长 3:31
    },
];

// B站 API 请求头
const BILI_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Referer": "https://www.bilibili.com/",
};

// ========== API 端点 ==========

/** GET /api/songs — 返回歌曲列表 */
app.get('/api/songs', (_req, res) => {
    res.json(SONGS.map(s => ({
        id: s.id,
        title: s.title,
        start_time: s.start_time,
        end_time: s.end_time,
        page_duration: s.page_duration || null,
        duration: (s.start_time && s.end_time) ? (s.end_time - s.start_time) : (s.page_duration || null),
    })));
});

/** GET /api/stream/:songId — 代理 B站 DASH 音频流 */
app.get('/api/stream/:songId', async (req, res) => {
    const songId = parseInt(req.params.songId);
    const song = SONGS.find(s => s.id === songId);
    if (!song) return res.status(404).json({ error: 'Song not found' });

    try {
        // 1. 获取视频信息 → 拿 cid
        const viewUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${song.bvid}`;
        const viewResp = await fetch(viewUrl, { headers: BILI_HEADERS });
        const viewData = await viewResp.json();

        if (viewData.code !== 0) {
            return res.status(502).json({ error: `B站视频信息获取失败: ${viewData.message}` });
        }

        const pages = viewData.data.pages || [];
        const pageIdx = song.page - 1;
        if (pageIdx >= pages.length) {
            return res.status(400).json({ error: '分P不存在' });
        }
        const cid = pages[pageIdx].cid;

        // 2. 获取播放地址（DASH 格式）
        const playUrl = `https://api.bilibili.com/x/player/playurl?bvid=${song.bvid}&cid=${cid}&fnval=16&fnver=0&fourk=1`;
        const playResp = await fetch(playUrl, { headers: BILI_HEADERS });
        const playData = await playResp.json();

        if (playData.code !== 0) {
            return res.status(502).json({ error: `B站播放地址获取失败: ${playData.message}` });
        }

        const dash = playData.data.dash;
        if (!dash || !dash.audio || dash.audio.length === 0) {
            return res.status(502).json({ error: '该视频没有可用的 DASH 音频流' });
        }

        // 优先最高码率
        const audios = [...dash.audio].sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));
        let audioUrl = audios[0].base_url || audios[0].baseUrl;

        // 补全协议前缀
        if (audioUrl.startsWith('//')) {
            audioUrl = 'https:' + audioUrl;
        }

        // 3. 流式转发 — 转发浏览器的 Range 请求头
        const browserRange = req.headers.range;                      // 浏览器 seek 时发来的 Range
        const upstreamHeaders = { ...BILI_HEADERS };
        if (browserRange) {
            upstreamHeaders["Range"] = browserRange;                 // 转发 Range 给 B站 CDN
        }

        const upstreamResp = await fetch(audioUrl, {
            headers: upstreamHeaders,
        });

        if (!upstreamResp.ok && upstreamResp.status !== 206) {
            return res.status(502).json({ error: `B站 CDN 请求失败: ${upstreamResp.status}` });
        }

        const isPartial = upstreamResp.status === 206;
        const upstreamContentLength = upstreamResp.headers.get('content-length');

        // 基础响应头
        const baseHeaders = {
            'Content-Type': 'audio/mp4',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache',
        };

        if (isPartial) {
            // B站 CDN 支持 Range → 返回 206 Partial Content
            res.status(206);
            const contentRange = upstreamResp.headers.get('content-range');
            if (contentRange) baseHeaders['Content-Range'] = contentRange;
            if (upstreamContentLength) baseHeaders['Content-Length'] = upstreamContentLength;
            res.set(baseHeaders);
        } else if (upstreamContentLength) {
            // 全文件 + 有 Content-Length → 转发并流式传输（浏览器可以 seek）
            baseHeaders['Content-Length'] = upstreamContentLength;
            res.set(baseHeaders);
        } else {
            // 全文件但没有 Content-Length → 先下载到内存，再返回（确保浏览器能 seek）
            console.log(`[stream] songId=${songId}: 上游无 Content-Length，缓冲完整文件...`);
            const buffer = Buffer.from(await upstreamResp.arrayBuffer());
            baseHeaders['Content-Length'] = buffer.length;
            res.set(baseHeaders);
            res.end(buffer);
            return;
        }

        // 管道转发（仅当上游有 Content-Length 或为 206 时走这里）
        const reader = upstreamResp.body.getReader();

        req.on('close', () => {
            reader.cancel().catch(() => {});
        });

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(Buffer.from(value));
            }
        } catch (e) {
            // 客户端断开连接 — 正常情况
        }

        res.end();
    } catch (err) {
        console.error(`[stream error] songId=${songId}:`, err.message);
        if (!res.headersSent) {
            res.status(502).json({ error: `请求B站失败: ${err.message}` });
        }
    }
});

app.listen(PORT, () => {
    console.log(`🎵 音乐播放器后端已启动 → http://localhost:${PORT}`);
    console.log(`   歌曲列表: http://localhost:${PORT}/api/songs`);
    console.log(`   前端页面: http://localhost:${PORT}`);
});
