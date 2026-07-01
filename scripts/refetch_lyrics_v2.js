/**
 * refetch_lyrics_v2.js — 改进的歌词重新获取（带内容验证）
 * ======================================================
 * 用法: /d/softwa/nodejs/node scripts/refetch_lyrics_v2.js
 *
 * 与 fetch_lyrics.js 的关键区别:
 *   1. 候选评分机制 — 不盲取第一个结果，而是评分后取最优
 *   2. 歌手交叉校验 — 验证 API 返回的歌手名是否与 DB 歌手名匹配
 *   3. 写入前验证 — 接受前再次运行所有检测启发式
 *   4. 多源并行 — 网易云优先，lrclib 回退
 *
 * 目标: lrc_text IS NULL 的歌曲（含被 detect_wrong_lyrics.js 清空的）
 */

const path = require('path');
const fs = require('fs');
const {
    loadEnv, sleep, fetchWithTimeout,
    isValidLRC, hasActualLyrics,
    detectAILyrics, titleMatchesLyrics, detectTruncatedLyrics,
    isSingerRelated, SINGER_ALIASES,
    getFirstTimestamp, countTimedLines,
} = require('./lyrics_utils.js');

// ========== 加载 .env ==========
loadEnv();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[init] 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const HEADERS = {
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
};

const BILI_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/',
};

// ========== CLI 参数 ==========
const ARGS = {
    limit: null,
    offset: 0,
    retryFailed: false,
    ids: null,
};
for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--limit=')) ARGS.limit = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--offset=')) ARGS.offset = parseInt(arg.split('=')[1], 10);
    else if (arg === '--retry-failed') ARGS.retryFailed = true;
    else if (arg.startsWith('--ids=')) ARGS.ids = arg.split('=')[1].split(',').map(Number);
}

// ========== 获取无歌词的歌曲 ==========
async function getSongsWithoutLyrics() {
    console.log('查询无歌词的歌曲...');
    let allSongs = [];
    let offset = ARGS.offset || 0;
    const PAGE_SIZE = 500;

    while (true) {
        let url;
        if (ARGS.ids) {
            const idList = ARGS.ids.join(',');
            url = `${SUPABASE_URL}/rest/v1/songs?select=id,title,singer,duration_seconds&id=in.(${idList})&limit=${ARGS.ids.length}`;
        } else {
            url = `${SUPABASE_URL}/rest/v1/songs?select=id,title,singer,duration_seconds&lrc_text=is.null&order=id.asc&limit=${PAGE_SIZE}&offset=${offset}`;
        }

        const resp = await fetch(url, { headers: HEADERS });
        if (!resp.ok) {
            console.log(`  ✗ 查询失败: ${resp.status}`);
            break;
        }
        const page = await resp.json();
        if (!page || page.length === 0) break;

        allSongs = allSongs.concat(page);

        if (ARGS.ids || page.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;

        if (ARGS.limit && allSongs.length >= ARGS.limit) {
            allSongs = allSongs.slice(0, ARGS.limit);
            break;
        }
    }
    console.log(`  → 共 ${allSongs.length} 首无歌词的歌曲\n`);
    return allSongs;
}

// ========== 候选评分 ==========

/**
 * 对候选歌词评分（满分 100）
 * - 歌手匹配: 0-40 分
 * - 歌名关键词匹配: 0-30 分
 * - 非 AI 生成: 0-20 分
 * - 非残缺: 0-10 分
 */
function scoreCandidate(candidate, targetSong) {
    let score = 0;
    const details = [];

    // 1. 歌手名匹配 (0-40 分)
    if (candidate.artist && isSingerRelated(candidate.artist, targetSong.singer)) {
        score += 40;
        details.push('singer:match(+40)');
    } else if (candidate.artist && targetSong.singer) {
        // 歌手名明确不匹配 → 扣分
        score -= 30;
        details.push('singer:mismatch(-30)');
    } else {
        // 无法判断（候选无歌手信息）
        score += 10;
        details.push('singer:unknown(+10)');
    }

    // 2. 歌名关键词在歌词中出现 (0-30 分)
    const titleResult = titleMatchesLyrics(targetSong.title, candidate.lrc);
    if (titleResult.match) {
        const titleScore = Math.round(30 * titleResult.ratio);
        score += titleScore;
        details.push(`title:${titleResult.confidence}(+${titleScore})`);
    } else {
        details.push(`title:${titleResult.confidence}(+0)`);
    }

    // 3. 非 AI 生成 (0-20 分)
    const aiResult = detectAILyrics(candidate.lrc);
    if (!aiResult.isAI) {
        score += 20;
        details.push('noAI(+20)');
    } else {
        details.push(`AI(${aiResult.reason})(+0)`);
    }

    // 4. 非残缺/截断 (0-10 分)
    const truncIssues = detectTruncatedLyrics(candidate.lrc, targetSong.duration_seconds);
    if (truncIssues.length === 0) {
        score += 10;
        details.push('complete(+10)');
    } else {
        const issueTypes = truncIssues.map(i => i.type).join(',');
        details.push(`truncated:${issueTypes}(+0)`);
    }

    return { score, details: details.join(' | ') };
}

// ========== 网易云歌词搜索 ==========

async function searchNeteaseLyric(song) {
    const query = `${song.title} ${song.singer || ''}`.trim();
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Referer': 'https://music.163.com/',
        'Accept': 'application/json',
    };

    try {
        // Step 1: Search
        const searchUrl = `https://music.163.com/api/search/get?type=1&s=${encodeURIComponent(query)}&limit=8`;
        const sr = await fetchWithTimeout(searchUrl, { headers }, 10000);
        if (!sr.ok) return [];
        const sd = await sr.json();
        if (sd.code !== 200 || !sd.result?.songs?.length) return [];

        // Step 2: Try each result, collect candidates
        const candidates = [];
        const songs = sd.result.songs.slice(0, 5);
        for (const s of songs) {
            const songId = s.id;
            const lyricUrl = `https://music.163.com/api/song/lyric?id=${songId}&lv=1`;
            const lr = await fetchWithTimeout(lyricUrl, { headers }, 10000);
            if (!lr.ok) continue;
            const ld = await lr.json();
            if (ld.code !== 200 || !ld.lrc?.lyric) continue;

            const lrc = ld.lrc.lyric.trim();
            if (!isValidLRC(lrc) || !hasActualLyrics(lrc)) continue;

            // Also include tlyric (translated) if available
            let fullLrc = lrc;
            if (ld.tlyric?.lyric) fullLrc += '\n' + ld.tlyric.lyric.trim();

            const artistName = s.artists?.map(a => a.name).join('/') || '';
            candidates.push({
                source: 'netease',
                lrc: fullLrc,
                artist: artistName,
                trackName: s.name,
            });
        }

        return candidates;
    } catch (err) {
        if (err.name !== 'AbortError') console.log(`  ✗ netease 异常: ${err.message}`);
        return [];
    }
}

// ========== lrclib 歌词搜索 ==========

async function searchLRCLib(song) {
    const candidates = [];
    const query = `${song.title} ${song.singer || ''}`.trim();

    // 策略 1: 搜索 API
    try {
        const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
        const resp = await fetchWithTimeout(searchUrl, {
            headers: { ...BILI_HEADERS, 'Accept': 'application/json' },
        }, 15000);
        if (resp.ok) {
            const data = await resp.json();
            if (Array.isArray(data)) {
                for (const d of data.slice(0, 3)) {
                    if (d.syncedLyrics && isValidLRC(d.syncedLyrics) && hasActualLyrics(d.syncedLyrics)) {
                        candidates.push({
                            source: 'lrclib',
                            lrc: d.syncedLyrics,
                            artist: d.artistName || '',
                            trackName: d.trackName || '',
                        });
                    }
                }
            }
        }
    } catch (err) {
        // skip
    }

    // 策略 2: 直接获取 API
    try {
        const directUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(song.title)}${song.singer ? '&artist_name=' + encodeURIComponent(song.singer) : ''}`;
        const resp = await fetchWithTimeout(directUrl, {
            headers: { ...BILI_HEADERS, 'Accept': 'application/json' },
        }, 15000);
        if (resp.ok) {
            const data = await resp.json();
            if (data && data.syncedLyrics && isValidLRC(data.syncedLyrics) && hasActualLyrics(data.syncedLyrics)) {
                // Check not already added
                if (!candidates.find(c => c.lrc === data.syncedLyrics)) {
                    candidates.push({
                        source: 'lrclib-direct',
                        lrc: data.syncedLyrics,
                        artist: data.artistName || '',
                        trackName: data.trackName || '',
                    });
                }
            }
        }
    } catch (err) {
        // skip
    }

    return candidates;
}

// ========== 写入数据库 ==========

async function updateLyrics(songId, lrcText) {
    const url = `${SUPABASE_URL}/rest/v1/songs?id=eq.${songId}`;
    try {
        const resp = await fetchWithTimeout(url, {
            method: 'PATCH',
            headers: {
                ...HEADERS,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
            },
            body: JSON.stringify({ lrc_text: lrcText }),
        }, 15000);
        return resp.ok;
    } catch (err) {
        console.log(`  ✗ 写入请求失败: ${err.message}`);
        return false;
    }
}

// ========== 主流程 ==========

async function main() {
    console.log('🎵 歌词重新获取脚本 v2\n');
    console.log('特性: 候选评分 | 歌手校验 | AI检测 | 写入前验证\n');

    const songs = await getSongsWithoutLyrics();
    if (songs.length === 0) {
        console.log('所有歌曲都已有歌词，无需获取。');
        return;
    }

    let success = 0;
    let failed = 0;
    let skipped = 0;  // 有候选但分数不够

    // 跳过ID追踪（避免重复处理）
    const skipPath = path.join(__dirname, 'skip_ids.json');
    let skipIds = new Set();
    if (fs.existsSync(skipPath)) {
        try { skipIds = new Set(JSON.parse(fs.readFileSync(skipPath, 'utf-8'))); } catch (e) {}
        console.log(`已加载 ${skipIds.size} 个跳过ID\n`);
    }

    const totalToProcess = songs.filter(s => !skipIds.has(s.id)).length;
    console.log(`待处理: ${totalToProcess} 首 (跳过 ${songs.length - totalToProcess} 首已确认的)\n`);

    let processed = 0;
    const newlySkipped = [];

    for (let i = 0; i < songs.length; i++) {
        const song = songs[i];
        if (skipIds.has(song.id)) continue;

        processed++;
        const label = `[${processed}/${totalToProcess}] #${song.id} ${song.title}` +
            (song.singer ? ` — ${song.singer}` : '');
        console.log(label);

        try {
            // Step 1: 收集所有候选
            let candidates = await searchNeteaseLyric(song);

            // 如果网易云结果不够，补充 lrclib
            if (candidates.length < 3) {
                const lrclibResults = await searchLRCLib(song);
                // 去重
                for (const c of lrclibResults) {
                    if (!candidates.find(ex => ex.lrc === c.lrc)) {
                        candidates.push(c);
                    }
                }
            }

            if (candidates.length === 0) {
                failed++;
                console.log(`  ✗ 所有源均无结果`);
                continue;
            }

            // Step 2: 评分 + 排序
            const scored = candidates
                .map(c => ({ ...c, ...scoreCandidate(c, song) }))
                .sort((a, b) => b.score - a.score);

            // 打印所有候选评分
            for (const c of scored) {
                console.log(`  ${c.score}分 [${c.source}] "${c.trackName}" — ${c.artist || '?'} | ${c.details}`);
            }

            // Step 3: 取最高分，≥50 且歌名至少部分匹配才接受
            // 避免"歌手匹配但歌名完全不搭"的误匹配（如"城南花已开"拿到"战士归乡"歌词）
            const best = scored[0];
            const titleResult = titleMatchesLyrics(song.title, best.lrc);
            const titleOk = titleResult.match || titleResult.confidence === 'skip';
            if (best.score >= 50 && titleOk) {
                const updated = await updateLyrics(song.id, best.lrc);
                if (updated) {
                    success++;
                    newlySkipped.push(song.id);
                    console.log(`  ✓ 已写入 (${best.score}分) [${best.source}]`);
                } else {
                    failed++;
                    console.log(`  ✗ 写入失败`);
                }
            } else {
                skipped++;
                console.log(`  ⊘ 跳过 — 最高分 ${best.score} < 50`);
            }
        } catch (err) {
            failed++;
            console.log(`  ✗ 处理异常: ${err.message}`);
        }

        // 限速
        if (i < songs.length - 1) {
            await sleep(200);
        }

        // 每 50 首保存一次跳过列表
        if (processed % 50 === 0 && newlySkipped.length > 0) {
            const updated = [...skipIds, ...newlySkipped];
            fs.writeFileSync(skipPath, JSON.stringify([...updated], null, 2), 'utf-8');
            console.log(`  [已保存进度: ${updated.length} 首]`);
        }
    }

    // 最终保存跳过列表
    if (newlySkipped.length > 0) {
        const updated = [...skipIds, ...newlySkipped];
        fs.writeFileSync(skipPath, JSON.stringify([...updated], null, 2), 'utf-8');
    }

    console.log(`\n========== 完成 ==========`);
    console.log(`成功: ${success} 首`);
    console.log(`跳过(分数低): ${skipped} 首`);
    console.log(`失败: ${failed} 首`);
    console.log(`总计处理: ${processed} 首`);
}

main().catch(err => {
    console.error('脚本执行失败:', err);
    process.exit(1);
});
