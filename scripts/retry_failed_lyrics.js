/**
 * retry_failed_lyrics.js — 重试失败歌曲（智能修复搜索）
 * =====================================================
 * 用法: /d/softwa/nodejs/node scripts/retry_failed_lyrics.js
 *
 * 策略:
 *   1. 检测 title/singer 是否互换（歌手名单在标题字段）→ 交换后重搜
 *   2. 清理歌手字段（去掉多余人名、演员名等）
 *   3. 清理标题字段（去掉 feat./remix/版本 等后缀）
 *   4. 重新搜索 lrclib + 网易云
 */

const path = require('path');
const fs = require('fs');

function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) { console.error('[env] .env 文件不存在'); process.exit(1); }
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) return;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (key && value && !process.env[key]) process.env[key] = value;
    });
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[init] 缺少环境变量');
    process.exit(1);
}

const HEADERS = {
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
};

const BILI_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://www.bilibili.com/',
};

// ========== 已知歌手名单（用于检测 title/singer 互换） ==========
const KNOWN_SINGERS = new Set([
    '周杰伦', '林俊杰', '王力宏', '陈奕迅', '张学友', '刘德华', '郭富城', '黎明',
    '张靓颖', '张韶涵', '王心凌', '杨丞琳', '田馥甄', '蔡依林', '萧亚轩', '孙燕姿',
    '林宥嘉', '五月天', '苏打绿', 'S.H.E', '飞儿乐团', 'F.I.R.飞儿乐团',
    '伍佰', '陶喆', '王力宏', '汪苏泷', '许嵩', '徐良', '本兮', '小贱',
    '周深', '毛不易', '薛之谦', '李荣浩', '华晨宇', '张杰',
    '邓紫棋', 'G.E.M. 邓紫棋', '于文文', '任然', '陈粒',
    '凤凰传奇', '羽泉', 'Beyond', 'BEYOND', '信乐团',
    '刘若英', '梁静茹', '张惠妹', '那英', '韩红', '王菲',
    '许巍', '朴树', '刀郎', '赵雷', '李健',
    '林忆莲', '王蓉', '杨钰莹', '许茹芸', '阿桑', '郭静',
    '曲婉婷', '蔡健雅', '戴佩妮', '范玮琪', '温岚',
    '谭咏麟', '张国荣', '陈百强', '林子祥', '叶倩文', '李克勤', '草蜢',
    '张宇', '周传雄', '游鸿明', '巫启贤', '光良', '品冠',
    '胡歌', '刘亦菲', '杨幂',
    'Taylor Swift', 'Justin Bieber', 'The Kid LAROI', 'Bruno Mars',
    'Lady Gaga', 'Rihanna', 'Adele', 'Ed Sheeran', 'Coldplay',
    'Maroon 5', 'OneRepublic', 'Imagine Dragons', 'The Weeknd',
    'Eminem', 'Dr. Dre', 'Sia', 'Alan Walker', 'Martin Garrix',
    'Dua Lipa', 'Shawn Mendes', 'Charlie Puth', 'Wiz Khalifa',
    'Lenka', 'James Blunt', 'Sarah Brightman', 'Maria Arredondo',
    'Daniel Powter', 'Rod Stewart', 'Enya', 'Groove Coverage',
    'M2M', 'Darren Hayes', 'Michael Learns To Rock',
    'Carly Rae Jepsen', 'Owl City', 'Clean Bandit', 'Zara Larsson',
    'David Guetta', 'Troye Sivan', 'Charli xcx', 'Demi Lovato',
    'Marshmello', 'Rita Ora', 'Fall Out Boy', 'The Chainsmokers',
    'Destiny\'s Child', 'Eagles', 'Westlife', 'Train',
    'Avril Lavigne', 'Katy Perry', 'Miley Cyrus', 'Selena Gomez',
    '沈谧仁', '奇然', '海鸣威', '海明威', '七叔', '叶泽浩',
    '等什么君', '邓寓君', '浅影阿', '平生不晚', '小阿七',
    '阿YueYue', '叶里', '音频怪物', '双笙', 'HITA', '排骨教主',
    '洛天依', '言和', '乐正绫', '萨顶顶', '刘珂矣', '花粥',
    '银临', 'Aki阿杰', '赵传', '任贤齐', '周华健', '齐豫',
    '宝石Gem', '潘玮柏', '弦子', '张碧晨', '杨宗纬',
]);

// 清理标题（去掉版本后缀）
function cleanTitle(title) {
    return title
        .replace(/[（(][^)）]*[)）]/g, '')  // 去掉括号内容
        .replace(/\(feat\..+?\)/gi, '')       // feat.
        .replace(/\(ft\..+?\)/gi, '')         // ft.
        .replace(/\(with.+?\)/gi, '')         // with
        .replace(/[-–—]\s*(Remix|Remaster|Live|Demo|Edit|Mix|Radio\s*Edit|Version|Ver\.|Album|Original|Taylor.s|Clean|Explicit).*/gi, '')
        .replace(/[（(](DJ|弹唱|Live|现场|Remix|Remaster|Demo|Edit|Mix|Radio|Version|Ver\.|Album|Original|Taylor.s|Clean|Explicit|完整版|吉他|女声|男生|女生|戏腔|爱国|加速|降速|烟嗓)[^)）]*[)）]/gi, '')
        .replace(/[-–—]\s*(DJ|弹唱|Live|现场|Remix).*/gi, '')
        .trim();
}

// 清理歌手（去掉演员名等）
function cleanSinger(singer) {
    // Remove known non-singer names
    const nonSingers = ['林正英', '午马', '影视原声', 'Traditional'];
    let names = singer.split(/[\s\/&,，、]+/);
    names = names.filter(n => !nonSingers.includes(n.trim()));
    return names.join(' ');
}

// 检测 title/singer 是否互换
function detectSwap(song) {
    const titleIsSinger = KNOWN_SINGERS.has(song.title.trim());
    const singerIsTitle = song.singer.trim() && !KNOWN_SINGERS.has(song.singer.trim());
    return titleIsSinger && singerIsTitle;
}

// ========== 工具 ==========
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function isValidLRC(text, minLines = 5) {
    if (!text || typeof text !== 'string') return false;
    const timeRe = /\[\d{2}:\d{2}\.\d{2,3}\]/;
    return text.split('\n').filter(l => timeRe.test(l) && l.replace(timeRe, '').trim()).length >= minLines;
}

// ========== 搜索 ==========
async function searchLRCLib(title, singer) {
    const candidates = [];
    const query = `${title} ${singer}`.trim();

    try {
        const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
        const resp = await fetchWithTimeout(searchUrl, {
            headers: { ...BILI_HEADERS, 'Accept': 'application/json' },
        }, 15000);
        if (resp.ok) {
            const data = await resp.json();
            if (Array.isArray(data)) {
                for (const d of data.slice(0, 5)) {
                    if (d.syncedLyrics && isValidLRC(d.syncedLyrics)) {
                        candidates.push({ source: 'lrclib', lrc: d.syncedLyrics, artist: d.artistName || '', trackName: d.trackName || '' });
                    }
                }
            }
        }
    } catch (err) { /* skip */ }

    try {
        const directUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}${singer ? '&artist_name=' + encodeURIComponent(singer) : ''}`;
        const resp = await fetchWithTimeout(directUrl, {
            headers: { ...BILI_HEADERS, 'Accept': 'application/json' },
        }, 15000);
        if (resp.ok) {
            const data = await resp.json();
            if (data && data.syncedLyrics && isValidLRC(data.syncedLyrics)) {
                if (!candidates.find(c => c.lrc === data.syncedLyrics)) {
                    candidates.push({ source: 'lrclib-direct', lrc: data.syncedLyrics, artist: data.artistName || '', trackName: data.trackName || '' });
                }
            }
        }
    } catch (err) { /* skip */ }

    return candidates;
}

async function searchNetease(title, singer) {
    const query = `${title} ${singer}`.trim();
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://music.163.com/',
        'Accept': 'application/json',
    };

    try {
        const searchUrl = `https://music.163.com/api/search/get?type=1&s=${encodeURIComponent(query)}&limit=8`;
        const sr = await fetchWithTimeout(searchUrl, { headers }, 10000);
        if (!sr.ok) return [];
        const sd = await sr.json();
        if (sd.code !== 200 || !sd.result?.songs?.length) return [];

        const candidates = [];
        for (const s of sd.result.songs.slice(0, 5)) {
            const songId = s.id;
            const lyricUrl = `https://music.163.com/api/song/lyric?id=${songId}&lv=1`;
            const lr = await fetchWithTimeout(lyricUrl, { headers }, 10000);
            if (!lr.ok) continue;
            const ld = await lr.json();
            if (ld.code !== 200 || !ld.lrc?.lyric) continue;

            const lrc = ld.lrc.lyric.trim();
            if (!isValidLRC(lrc)) continue;

            let fullLrc = lrc;
            if (ld.tlyric?.lyric) fullLrc += '\n' + ld.tlyric.lyric.trim();

            const artistName = s.artists?.map(a => a.name).join('/') || '';
            candidates.push({ source: 'netease', lrc: fullLrc, artist: artistName, trackName: s.name });
        }
        return candidates;
    } catch (err) {
        return [];
    }
}

async function updateLyrics(songId, lrcText) {
    const url = `${SUPABASE_URL}/rest/v1/songs?id=eq.${songId}`;
    try {
        const resp = await fetchWithTimeout(url, {
            method: 'PATCH',
            headers: { ...HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify({ lrc_text: lrcText }),
        }, 15000);
        return resp.ok;
    } catch (err) {
        return false;
    }
}

// ========== 主流程 ==========
async function main() {
    const FAILED_FILE = path.join(__dirname, 'batch_lyrics_failed.json');
    if (!fs.existsSync(FAILED_FILE)) {
        console.log('没有失败记录，无需重试。');
        return;
    }

    const failed = JSON.parse(fs.readFileSync(FAILED_FILE, 'utf-8'));
    console.log(`共 ${failed.length} 首失败歌曲，开始智能重试...\n`);

    let retrySuccess = 0;
    let retryFailed = 0;
    const stillFailed = [];

    for (let i = 0; i < failed.length; i++) {
        const song = failed[i];
        console.log(`[${i + 1}/${failed.length}] ID ${song.id}: ${song.title} - ${song.singer}`);

        // 检测互换
        const swapped = detectSwap(song);
        if (swapped) {
            console.log(`  🔄 检测到 title/singer 互换，交换搜索...`);
        }

        // 准备多个搜索变体
        const searchPairs = [];

        if (swapped) {
            // 交换后搜索
            searchPairs.push({ title: song.singer, singer: song.title, label: '交换后' });
        }

        // 原始（清理后）
        const cleanT = cleanTitle(song.title);
        const cleanS = cleanSinger(song.singer);
        searchPairs.push({ title: cleanT, singer: cleanS, label: '清理后' });

        // 只用歌名
        if (cleanT !== song.title || cleanS !== song.singer) {
            searchPairs.push({ title: cleanT, singer: '', label: '仅歌名(清理)' });
        }

        // 去重
        const seen = new Set();
        const unique = [];
        for (const sp of searchPairs) {
            const key = `${sp.title}|${sp.singer}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(sp);
            }
        }

        let found = false;

        for (const sp of unique) {
            if (found) break;

            console.log(`  🔍 [${sp.label}] "${sp.title}" - "${sp.singer}"`);

            const lrclibResults = await searchLRCLib(sp.title, sp.singer);
            const neteaseResults = await searchNetease(sp.title, sp.singer);
            const all = [...lrclibResults, ...neteaseResults];

            if (all.length > 0) {
                const lrc = all[0].lrc;
                console.log(`  ✅ 找到 (${all[0].source}): ${all[0].trackName} - ${all[0].artist}`);

                const ok = await updateLyrics(song.id, lrc);
                if (ok) {
                    console.log(`  ✅ 已上传到 Supabase`);
                    retrySuccess++;
                    found = true;
                } else {
                    console.log(`  ✗ 上传失败`);
                }
            }
        }

        if (!found) {
            console.log(`  ❌ 所有搜索变体均无结果`);
            retryFailed++;
            stillFailed.push(song);
        }

        await sleep(1500);
    }

    // 更新失败文件
    fs.writeFileSync(FAILED_FILE, JSON.stringify(stillFailed, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log(`  重试完成: ✅ ${retrySuccess} | ❌ ${retryFailed} (仍需 whisper)`);
    console.log(`  剩余失败: ${stillFailed.length} 首 → ${FAILED_FILE}`);
    console.log('='.repeat(60));
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
