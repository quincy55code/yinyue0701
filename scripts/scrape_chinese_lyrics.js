/**
 * scrape_chinese_lyrics.js — 从中文歌词网站抓取 LRC 歌词
 * ======================================================
 * 用法: /d/softwa/nodejs/node scripts/scrape_chinese_lyrics.js
 *
 * 来源:
 *   - kugeci.com (酷歌词) — 搜索 API + LRC 下载
 *   - 9ku.com (九酷歌词)
 *   - 百度百科 (纯文本歌词)
 *
 * 用于处理 lrclib / 网易云 都找不到的冷门歌曲
 */

const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

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

// ========== 工具 ==========
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function isValidLRC(text, minLines = 3) {
    if (!text || typeof text !== 'string') return false;
    const timeRe = /\[\d{2}:\d{2}\.\d{2,3}\]/;
    return text.split('\n').filter(l => timeRe.test(l)).length >= minLines;
}

// ========== 酷歌词 (kugeci.com) ==========
async function searchKugeci(title, singer) {
    const query = encodeURIComponent(`${title} ${singer}`.trim());
    const searchUrl = `https://www.kugeci.com/search?q=${query}`;

    try {
        const resp = await fetchWithTimeout(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/json',
                'Referer': 'https://www.kugeci.com/',
            },
        }, 15000);

        if (!resp.ok) return null;

        const html = await resp.text();

        // 搜索页面结果: /song/XXXXX 链接
        const songLinkMatch = html.match(/href="(\/song\/[^"]+)"[^>]*>\s*(.+?)\s*<\/a>/);
        if (!songLinkMatch) return null;

        const songPath = songLinkMatch[1];
        const songUrl = `https://www.kugeci.com${songPath}`;

        // Fetch song page for LRC
        const songResp = await fetchWithTimeout(songUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html',
                'Referer': searchUrl,
            },
        }, 15000);

        if (!songResp.ok) return null;

        const songHtml = await songResp.text();

        // Extract LRC from the page
        // kugeci.com format: lrc/lyrics 文档; txt 文档 links
        const lrcLinkMatch = songHtml.match(/href="([^"]+\.lrc)"/i) ||
                            songHtml.match(/href="([^"]+)"[^>]*>\s*lrc/i);

        if (lrcLinkMatch) {
            let lrcUrl = lrcLinkMatch[1];
            if (lrcUrl.startsWith('/')) lrcUrl = `https://www.kugeci.com${lrcUrl}`;

            const lrcResp = await fetchWithTimeout(lrcUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            }, 10000);

            if (lrcResp.ok) {
                const lrc = await lrcResp.text();
                if (isValidLRC(lrc)) return lrc;
            }
        }

        // Alternative: LRC might be embedded in the page
        const lrcEmbedMatch = songHtml.match(/<pre[^>]*class="[^"]*lrc[^"]*"[^>]*>([\s\S]*?)<\/pre>/i) ||
                             songHtml.match(/<div[^>]*id="lrc"[^>]*>([\s\S]*?)<\/div>/i);

        if (lrcEmbedMatch) {
            const lrc = lrcEmbedMatch[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
            if (isValidLRC(lrc)) return lrc;
        }

        // Last resort: check if page has raw LRC text
        const rawLrc = extractLRCFromHTML(songHtml);
        if (rawLrc && isValidLRC(rawLrc)) return rawLrc;

        return null;
    } catch (err) {
        return null;
    }
}

function extractLRCFromHTML(html) {
    // Look for timestamp patterns in the HTML
    const lines = [];
    const regex = /(\[\d{2}:\d{2}\.\d{2,3}\][^\n<]*)/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        lines.push(match[1]);
    }
    return lines.length >= 3 ? lines.join('\n') : null;
}

// ========== 百度百科 纯文本歌词 ==========
async function searchBaiduBaike(title, singer) {
    // 百度百科通常有纯文本歌词（无时间戳，需配合 whisper）
    const query = encodeURIComponent(`${title} ${singer} 歌词`);
    const url = `https://baike.baidu.com/item/${encodeURIComponent(title)}`;

    try {
        const resp = await fetchWithTimeout(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        }, 10000);

        if (!resp.ok) return null;

        const html = await resp.text();

        // Look for lyrics section
        const lyricMatch = html.match(/歌词[\s\S]{0,500}?<div[^>]*>([\s\S]{100,2000}?)<\/div>/i);
        if (lyricMatch) {
            const text = lyricMatch[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
            const lines = text.split('\n').filter(l => l.trim() && l.trim().length > 2);
            if (lines.length >= 5) {
                return { plainText: lines.join('\n'), source: 'baidu_baike' };
            }
        }
        return null;
    } catch (err) {
        return null;
    }
}

// ========== 上传 ==========
async function updateLyrics(songId, lrcText) {
    const url = `${SUPABASE_URL}/rest/v1/songs?id=eq.${songId}`;
    try {
        const resp = await fetchWithTimeout(url, {
            method: 'PATCH',
            headers: { ...HEADERS },
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
        console.log('没有失败记录。');
        return;
    }

    const failed = JSON.parse(fs.readFileSync(FAILED_FILE, 'utf-8'));
    console.log(`共 ${failed.length} 首需要从中文歌词网站获取\n`);

    let success = 0;
    let stillFailed = [];

    for (let i = 0; i < failed.length; i++) {
        const song = failed[i];
        console.log(`[${i + 1}/${failed.length}] ID ${song.id}: ${song.title} - ${song.singer}`);

        // 尝试酷歌词
        console.log(`  🔍 搜索酷歌词...`);
        const lrc = await searchKugeci(song.title, song.singer);

        if (lrc && isValidLRC(lrc)) {
            const lines = lrc.split('\n').filter(l => /\[\d{2}:\d{2}\.\d{2,3}\]/.test(l)).length;
            console.log(`  ✅ 找到 LRC (${lines} 行)`);

            const ok = await updateLyrics(song.id, lrc);
            if (ok) {
                console.log(`  ✅ 已上传到 Supabase`);
                success++;
            } else {
                console.log(`  ✗ 上传失败`);
                stillFailed.push(song);
            }
        } else {
            // 尝试其他来源
            console.log(`  🔍 搜索百度百科...`);
            const baike = await searchBaiduBaike(song.title, song.singer);

            if (baike?.plainText) {
                console.log(`  📝 找到纯文本歌词 (${baike.plainText.split('\n').length} 行)`);
                console.log(`  ⚠ 需要 whisper 转写获取时间戳`);
                // 标记为需要 whisper
                song._plainLyrics = baike.plainText;
                stillFailed.push(song);
            } else {
                console.log(`  ❌ 所有来源均无歌词`);
                stillFailed.push(song);
            }
        }

        await sleep(2000); // Rate limit
    }

    // 保存结果
    fs.writeFileSync(FAILED_FILE, JSON.stringify(stillFailed, null, 2));

    // Save plain lyrics for whisper processing
    const needWhisper = stillFailed.filter(s => s._plainLyrics);
    if (needWhisper.length > 0) {
        const whisperDir = path.join(require('os').homedir(), 'Desktop', '单首歌词', 'lyrics_txt');
        if (!fs.existsSync(whisperDir)) fs.mkdirSync(whisperDir, { recursive: true });
        for (const s of needWhisper) {
            const filePath = path.join(whisperDir, `${s.id}_lyrics.txt`);
            fs.writeFileSync(filePath, s._plainLyrics, 'utf-8');
            console.log(`  歌词文本已保存: ${filePath}`);
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`  抓取完成: ✅ ${success} | ❌ ${stillFailed.length} (其中 ${needWhisper.length} 有纯文本需whisper)`);
    console.log('='.repeat(60));
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
