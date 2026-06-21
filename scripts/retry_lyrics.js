/**
 * retry_lyrics.js — 对缺歌词的歌用更智能的策略重试
 * 用法：/d/softwa/nodejs/node scripts/retry_lyrics.js
 */
const path = require('path');
const fs = require('fs');

// 加载 .env
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
let serviceKey = '';
for (const line of envContent.split('\n')) {
    const t = line.trim();
    if (t.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) serviceKey = t.split('=').slice(1).join('=').trim();
}

const SUPABASE_URL = 'https://orphftlwdwuvoscizndx.supabase.co';
const BILI_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://www.bilibili.com/',
};

// 中文歌手名 → 英文名/别名映射
const SINGER_ALIASES = {
    '孙燕姿': ['Stefanie Sun', 'Sun Yanzi', 'Yanzi Sun'],
    '萧敬腾': ['Jam Hsiao'],
    '林宥嘉': ['Yoga Lin'],
    '蔡依林': ['Jolin Tsai'],
    '温岚': ['Landy Wen'],
    '李翊君': ['Li Yijun'],
    '陶喆': ['David Tao'],
    'Tank': ['TANK', '呂建忠'],
    '袁成杰': ['Yuan Chengjie'],
    '戚薇': ['Stephy Qi'],
    '飞轮海': ['Fahrenheit'],
    '田馥甄': ['Hebe Tien', 'Hebe Tian'],
    '海鸣威': ['Ocean Hai'],
    '张靓颖': ['Jane Zhang'],
    '王菲': ['Faye Wong'],
    '莫文蔚': ['Karen Mok'],
    '陈奕迅': ['Eason Chan'],
    '周杰伦': ['Jay Chou'],
    '林俊杰': ['JJ Lin'],
    '五月天': ['Mayday'],
    '梁静茹': ['Fish Leong'],
    '王力宏': ['Leehom Wang'],
    '张韶涵': ['Angela Chang'],
    '王心凌': ['Cyndi Wang'],
    '光良': ['Michael Wong'],
    '张学友': ['Jacky Cheung'],

    // ========== BV1iP 新增 ==========
    '罗志祥': ['Show Luo'],
    '杨丞琳': ['Rainie Yang'],
    '飞儿乐队': ['F.I.R.', 'FIR'],
    'F.I.R': ['F.I.R.', 'FIR'],
    '信乐团': ['Shin'],
    '卢巧音': ['Candy Lo'],
    '黄小琥': ['Tiger Huang'],
    '羽泉': ['Yu Quan'],
    '汪峰': ['Wang Feng'],
    '凤凰传奇': ['Phoenix Legend', 'Ling Hua'],
    '乌兰托娅': ['Wulan Tuoya'],
    '刀郎': ['Dao Lang'],
    '孙楠': ['Sun Nan'],
    '韩红': ['Han Hong'],
    '费玉清': ['Fei Yu-ching'],
    '金沙': ['Jin Sha', 'Kym'],
    '金莎': ['Jin Sha', 'Kym'],
    '许巍': ['Xu Wei'],
    '阿杜': ['A-Do', 'Ah Du'],
    '张芸京': ['Zhang Yunjing', 'Jing Chang'],
    '容祖儿': ['Joey Yung'],
    '沙宝亮': ['Sha Baoliang'],
    '蔡卓妍': ['Charlene Choi'],
    '萧亚轩': ['Elva Hsiao'],
    '庾澄庆': ['Harlem Yu'],
    '刘若英': ['Rene Liu'],
    '林忆莲': ['Sandy Lam'],
    '伍佰': ['Wu Bai', 'Wubai'],
    '陈小春': ['Jordan Chan'],
    '李圣杰': ['Sam Lee'],
    '水木年华': ['Shui Mu Nian Hua'],
    '苏打绿': ['Sodagreen'],
    '谢霆锋': ['Nicholas Tse'],
    '潘玮柏': ['Wilber Pan', 'Will Pan'],
    '江美琪': ['Maggie Chiang'],
    '郁可唯': ['Yisa Yu'],
    'Sweety': ['Sweety'],
    'F4': ['F4', 'JVKV'],
    '华语群星': [],
    'S.H.E': ['S.H.E', 'SHE'],
    'she': ['S.H.E', 'SHE'],
};

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function isValidLRC(text, minLines = 5) {
    if (!text || typeof text !== 'string') return false;
    const timeRe = /\[\d{2}:\d{2}\.\d{2,3}\]/;
    const validLines = text.split('\n').filter(l => timeRe.test(l) && l.replace(timeRe, '').trim());
    return validLines.length >= minLines;
}

/** Check if the matched artist name relates to the original singer */
function isSingerRelated(matchedArtist, originalSinger) {
    if (!originalSinger || !matchedArtist) return true; // can't verify, accept
    const ma = matchedArtist.toLowerCase();
    const os = originalSinger.toLowerCase();

    // Direct match or containment
    if (ma.includes(os) || os.includes(ma)) return true;

    // Split original singer by common separators
    const parts = originalSinger.split(/[&,，、]/).map(p => p.trim().toLowerCase()).filter(Boolean);
    for (const part of parts) {
        if (part.length >= 2 && ma.includes(part)) return true;
    }

    // Check aliases
    const aliases = SINGER_ALIASES[originalSinger] || [];
    for (const part of parts) {
        const partAliases = SINGER_ALIASES[part] || [];
        for (const alias of [...aliases, ...partAliases]) {
            if (ma.includes(alias.toLowerCase())) return true;
        }
    }

    // If matched artist name is very different, reject
    return false;
}

/** 用歌手别名生成更多搜索词 */
function getSearchQueries(song) {
    const queries = [];
    // 歌手名（去掉括号内容，如 "(Live)"）
    const singerClean = (song.singer || '').replace(/\(.*?\)/g, '').trim();
    const titleClean = (song.title || '').replace(/\(.*?\)/g, '').trim();

    // 主歌手名（取第一个，处理顿号/逗号分隔）
    const mainSinger = singerClean.split(/[、,，&]/)[0].trim();

    // 策略1: 歌名 + 原歌手名
    queries.push({ q: `${titleClean} ${singerClean}`, label: 'full' });

    // 策略2: 仅歌名
    queries.push({ q: titleClean, label: 'title-only' });

    // 策略3: 歌名 + 主歌手名
    if (mainSinger !== singerClean) {
        queries.push({ q: `${titleClean} ${mainSinger}`, label: 'main-singer' });
    }

    // 策略4: 用英文别名声搜索
    const aliases = SINGER_ALIASES[mainSinger] || [];
    for (const alias of aliases) {
        queries.push({ q: `${titleClean} ${alias}`, label: `alias:${alias}` });
    }

    return queries;
}

async function searchLRCImproved(song) {
    // 先尝试所有搜索策略
    for (const { q, label } of getSearchQueries(song)) {
        try {
            const encoded = encodeURIComponent(q);
            const url = `https://lrclib.net/api/search?q=${encoded}`;
            console.log(`  → 搜索 [${label}]: ${q.substring(0, 60)}`);

            const resp = await fetch(url, { headers: { ...BILI_HEADERS, 'Accept': 'application/json' } });
            if (!resp.ok) continue;

            const data = await resp.json();
            if (!Array.isArray(data) || data.length === 0) continue;

            // 找第一个有 syncedLyrics 的
            const match = data.find(d => {
                if (!d.syncedLyrics || !isValidLRC(d.syncedLyrics)) return false;
                return isSingerRelated(d.artistName || '', song.singer);
            });
            if (match) {
                console.log(`  ✓ 匹配: ${match.trackName} - ${match.artistName} (${match.syncedLyrics.split('\n').length} 行)`);
                return match.syncedLyrics;
            }

            // 没有 syncedLyrics 但有结果 → 尝试通过 ID 直接获取
            if (data.length > 0 && data[0].id) {
                const directUrl = `https://lrclib.net/api/get/${data[0].id}`;
                const dr = await fetch(directUrl, { headers: { ...BILI_HEADERS, 'Accept': 'application/json' } });
                if (dr.ok) {
                    const dd = await dr.json();
                    if (dd && dd.syncedLyrics && isValidLRC(dd.syncedLyrics) && isSingerRelated(dd.artistName || '', song.singer)) {
                        console.log(`  ✓ 直接获取: ${dd.trackName} - ${dd.artistName} (${dd.syncedLyrics.split('\n').length} 行)`);
                        return dd.syncedLyrics;
                    }
                }
            }
        } catch (err) {
            // skip
        }
    }

    // 最后尝试：直接用歌名+歌手名调用 get API
    try {
        const titleEnc = encodeURIComponent(song.title);
        const singerEnc = encodeURIComponent(song.singer || '');
        const directUrl = `https://lrclib.net/api/get?track_name=${titleEnc}&artist_name=${singerEnc}`;
        console.log(`  → 直接获取: ${song.title} - ${song.singer}`);
        const resp = await fetch(directUrl, { headers: { ...BILI_HEADERS, 'Accept': 'application/json' } });
        if (resp.ok) {
            const data = await resp.json();
            if (data && data.syncedLyrics && isValidLRC(data.syncedLyrics) && isSingerRelated(data.artistName || '', song.singer)) {
                console.log(`  ✓ 直接命中!`);
                return data.syncedLyrics;
            }
        }
    } catch (err) {
        // skip
    }

    return null;
}

async function main() {
    // 获取所有缺歌词的歌
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/songs?select=id,title,singer&lrc_text=is.null&order=id.asc&limit=200`, {
        headers: {
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
        },
    });
    const songs = await resp.json();
    console.log(`还有 ${songs.length} 首缺歌词，尝试改进策略重试...\n`);

    let success = 0;
    let failed = 0;

    for (let i = 0; i < songs.length; i++) {
        const song = songs[i];
        console.log(`[${i + 1}/${songs.length}] #${song.id} ${song.title} - ${song.singer}`);

        const lrc = await searchLRCImproved(song);

        if (lrc) {
            // 写入数据库
            const patchResp = await fetch(`${SUPABASE_URL}/rest/v1/songs?id=eq.${song.id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': serviceKey,
                    'Authorization': `Bearer ${serviceKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal',
                },
                body: JSON.stringify({ lrc_text: lrc }),
            });
            if (patchResp.ok) {
                success++;
                console.log(`  ✓ 已写入数据库`);
            } else {
                failed++;
                console.log(`  ✗ 写入失败: ${patchResp.status}`);
            }
        } else {
            failed++;
            console.log(`  ✗ 所有策略均未找到`);
        }

        if (i < songs.length - 1) {
            await sleep(1500);
        }
    }

    console.log(`\n========== 完成 ==========`);
    console.log(`成功: ${success} 首`);
    console.log(`失败: ${failed} 首`);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
