/**
 * batch_lyrics_pipeline.js — 批量歌词补充流水线
 * ==============================================
 * 用法: /d/softwa/nodejs/node scripts/batch_lyrics_pipeline.js [--mode=hybrid|whisper|online]
 *
 * 三种模式:
 *   hybrid  (默认): 优先在线LRC → 找不到或质量差的 → whisper 管线
 *   online  : 仅从 lrclib/网易云 获取LRC（快速）
 *   whisper : 全部走 whisper 转写管线（慢但准确）
 *
 * 流程:
 *   1. 读取桌面"无歌词歌曲.txt"，过滤纯音乐
 *   2. 查询 Supabase 获取每首歌的 bvid/page
 *   3. 在线模式: 搜索 lrclib/网易云 → 评分 → 写入
 *   4. Whisper模式: 下载歌词文本 → 调用 bili_lyrics_extractor.py → 上传LRC
 */

const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');

// ========== 加载 .env ==========
function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) {
        console.error('[env] .env 文件不存在');
        process.exit(1);
    }
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) return;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (key && value && !process.env[key]) {
            process.env[key] = value;
        }
    });
}

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
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
};

const BILI_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/',
};

// ========== CLI ==========
const MODE = process.argv.includes('--mode=whisper') ? 'whisper'
    : process.argv.includes('--mode=online') ? 'online'
    : 'hybrid';
const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = (() => {
    const arg = process.argv.find(a => a.startsWith('--limit='));
    return arg ? parseInt(arg.split('=')[1], 10) : null;
})();
const START_INDEX = (() => {
    const arg = process.argv.find(a => a.startsWith('--start='));
    return arg ? parseInt(arg.split('=')[1], 10) : 0;
})();

const INPUT_FILE = path.join(require('os').homedir(), 'Desktop', '无歌词歌曲.txt');
const OUTPUT_DIR = path.join(require('os').homedir(), 'Desktop', '单首歌词', 'output');
const LYRIC_TXT_DIR = path.join(require('os').homedir(), 'Desktop', '单首歌词', 'lyrics_txt');
const PYTHON_SCRIPT = path.join(require('os').homedir(), 'Desktop', '单首歌词', 'bili_lyrics_extractor.py');
const PROGRESS_FILE = path.join(__dirname, 'batch_lyrics_progress.json');
const FAILED_FILE = path.join(__dirname, 'batch_lyrics_failed.json');

// ========== 纯音乐识别 ==========
const INSTRUMENTAL_KEYWORDS = [
    '纯音乐', '轻音乐', '钢琴', '小提琴', '大提琴', '吉他曲', '交响', '管弦',
    '伴奏', 'instrumental', 'piano', 'violin', 'cello', 'orchestra',
    'BGM', 'bgm', 'OST(纯音乐)', '原声带',
];

const INSTRUMENTAL_TITLE_PATTERNS = [
    /夜的钢琴曲/,                        // 石进系列
    /卡农/,                             // Canon
    /梦中的婚礼/,                        // Richard Clayderman
    /秋日私语/,                          // Richard Clayderman
    /致爱丽丝/,                          // Beethoven
    /土耳其进行曲/,                       // Mozart
    /梁祝/,                             // Butterfly Lovers
    /克罗地亚/,                          // Croatian Rhapsody
    /神秘园/,                            // Secret Garden
    /森林狂想曲/,                         //
    /故乡的原风景/,                       //
    /风居住的街道/,                       //
    /穿越时空的思念/,                     //
    /天空之城/,                          //
    /Summer$/,                         // 久石让 (但 Summer 也可能是歌名)
    /^The Rain$/,                      //
    /^Rain after Summer$/,
    /River Flows/,                     //
    /Sakura Tears/,
    /Windy Hill/,
    /Luv Letter/,
    /Tassel/,
    /Komorebi/,
    /Lullaby/,
    /His Theme/,
    /Going Home/,
    /My Heart Will Go On.*Kenny/,
    /Auld Lang Syne/,
    /友谊天长地久/,
    /Jasmine Flower/,
    /茉莉花/,
    /With An Orchid/,
    /The South Wind/,
    /The Immigrant/,
    /The Level Plain/,
    /The Twisting Of The Rope/,
    /Sundial Dreams/,
    /The Right Path/,
    /Through the Arbor/,
    /Anticipation/,
    /Born a Stranger/,
    /For When You Are Alone/,
    /My Sunset/,
    /Collapsing World/,
    /Eutopia/,
    /Lifeline/,
    /Coming Home/,
    /Nuit Silencieuse/,
    /Ard Skellig/,
    /End \(Interlude\)/,
    /Death Pledge/,
    /Somewhere.*July/,
    /Town of Windmill/,
    /A Little Story/,
    /Felicity/,
    /Star Sky/,
    /Intro$/,
    /羽根/,
    /潮鸣/,
    /ふたりの気持ち/,
    /いつも何度でも/,
    /かたわれ時/,
    /五月雨/,
    /回梦游仙/,
    /御剑江湖/,
    /命起涟漪/,
    /温馨时刻/,
    /雪落下的声音.*文武贝/,
    /海の形/,
    /夏野与暗恋/,
    /星茶会/,
    /所念皆星河/,
    /云村的烟花/,
    /和煦的糖果风/,
    /为霜/,
    /无仙/,
    /绵雪/,
    /幻昼/,
    /逆时针向/,
    /忆夏思乡/,
    /烟袋斜街/,
    /街道的寂寞/,
    /爱如烟花一瞬间/,
    /瞬间的永恒/,
    /夜空的寂静/,
    /那天的遇见/,
    /安静的午后/,
    /暖雨/,
    /月下花轻舞/,
    /夏·烟火/,
    /风之谷/,
    /夏夜/,
    /第101次约会/,
    /夜的钢琴曲/,
    /罗密欧与朱丽叶/,
    /罗地亚狂想曲/,
    /克罗地亚狂想曲/,
    /悲伤的西班牙/,
    /镜中的安娜/,
    /蓝色的爱/,
    /琵琶语/,
    /夜曲.*肖邦/,
    /Merry Christmas Mr\.? Lawrence/,
    /Always With Me/,
    /Refrain/,
    /沉醉于风中/,
    /FuGa pang/,
    /free lucky/,
    /White Cherry/,
    /The History/,
    /The Way.*Florian/,
    /The truth that you leave/,
    /Where Are You.*Aniface/,
    /Here We Are Again/,
    /0666感谢观看/,                       // 片尾感谢
];

const INSTRUMENTAL_ARTISTS = new Set([
    '石进', 'Richard Clayderman', 'Yiruma', '李闰珉', '久石让', '宗次郎',
    'Pachelbel', 'Mozart', '肖邦', '贝多芬', 'Secret Garden', '神秘园',
    'Kevin Kern', 'Thomas Greenberg', 'Valentin', 'Isaac Shepard',
    'Otokaze', 'AniFace', 'Aniface', 'Candy_Wind', 'Candy Wind',
    'DJ Okawari', 'July', 'm-taku', 'a_hisa', '羽肿', '邱有句',
    '接靓', '赵海洋', 'Pianoboy高至豪', 'MoreanP', '傅许',
    'Joanie Madden', 'Kenny G', 'Yanni', 'Nicolas de Angelis',
    'Enzalla', 'Zeraphym', 'Snigellin', 'Illusionary Daytime',
    'Shirfine', 'Lightscape', 'Yoohsic Roomz', 'Sadako', 'If',
    'Days乐团', 'Laura Shigi', 'Xeup', 'Dreyma', 'FLORIAN BUR',
    '高梨康治', '和田薰', '和田薫', '折戸伸治', '折户伸治',
    '骆集益', '曾志豪', '胡伟立', '文武贝', '林键标', '四季音色',
    'Traditional', '吴金黛', '林海', '矶村由纪子', '磯村由紀子',
    '阿南亮子', 'S.E.N.S.', '木村弓', '奥户巴寿', '奥戸巴寿',
    '坂本龙一', '昙轩', 'LIKPIA', '深町纯', 'Asphyxia',
    '印加部落', 'Toby Fox', 'Jannik', 'Peter Jeremias',
    'RADWIMPS', 'α·Pav', '2Someone', '闫东炜',
]);

function isInstrumental(song) {
    const title = (song.title || '').toLowerCase();
    const singer = (song.singer || '');

    // 检查歌手或标题是否在纯音乐艺人名单（防止 title/singer 互换）
    if (INSTRUMENTAL_ARTISTS.has(singer.trim())) {
        return { instrumental: true, reason: `纯音乐艺人(歌手字段): ${singer}` };
    }
    if (INSTRUMENTAL_ARTISTS.has(title.trim())) {
        return { instrumental: true, reason: `纯音乐艺人(标题字段-可能互换): ${title}` };
    }

    // 检查标题关键词
    for (const kw of INSTRUMENTAL_KEYWORDS) {
        if (title.includes(kw.toLowerCase())) {
            return { instrumental: true, reason: `标题含纯音乐关键词: ${kw}` };
        }
    }

    // 检查标题模式
    for (const pattern of INSTRUMENTAL_TITLE_PATTERNS) {
        if (pattern.test(song.title)) {
            return { instrumental: true, reason: `标题匹配纯音乐模式: ${pattern}` };
        }
    }

    // 歌手为空 + 标题为纯英文/数字 + 不含明显的人声提示
    // 避免误杀英文歌曲（如 "Trouble Is A Friend"）
    if (!singer.trim() && /^[\x00-\x7F\s\d]+$/.test(song.title) && song.title.length > 3) {
        // 额外检查：标题是否像歌名（含常见英文歌词词汇）
        const vocalHints = ['love', 'you', 'me', 'my', 'heart', 'baby', 'night',
            'never', 'always', 'away', 'back', 'dream', 'feel', 'girl', 'life',
            'time', 'want', 'need', 'know', 'come', 'gone', 'stay', 'friend'];
        const lowerTitle = song.title.toLowerCase();
        if (!vocalHints.some(w => lowerTitle.includes(w))) {
            return { instrumental: true, reason: '无歌手+纯英文标题(无vocal特征)' };
        }
    }

    return { instrumental: false, reason: '' };
}

// ========== 解析歌曲列表 ==========
function parseSongList(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    const songs = [];

    for (const line of lines) {
        // 格式: ID\t标题\t歌手 (3列，tab分隔)
        const parts = line.split('\t');
        if (parts.length >= 3) {
            const id = parseInt(parts[0], 10);
            const title = parts[1].trim();
            const singer = parts[2].trim();
            if (id && title) {
                songs.push({ id, title, singer, line });
            }
        }
    }

    return songs;
}

// ========== 查询 Supabase 获取 BV号 ==========
async function fetchSongMetadata(songIds) {
    console.log(`\n查询 ${songIds.length} 首歌的 BV号/page 信息...`);

    const allMetadata = [];
    const BATCH_SIZE = 100;

    for (let i = 0; i < songIds.length; i += BATCH_SIZE) {
        const batch = songIds.slice(i, i + BATCH_SIZE);
        const idList = batch.join(',');
        const url = `${SUPABASE_URL}/rest/v1/songs?select=id,title,singer,bvid,page,duration_seconds&id=in.(${idList})&limit=${BATCH_SIZE}`;

        try {
            const resp = await fetchWithTimeout(url, { headers: HEADERS }, 30000);
            if (!resp.ok) {
                console.log(`  ✗ 查询失败 (offset=${i}): ${resp.status}`);
                continue;
            }
            const data = await resp.json();
            allMetadata.push(...data);
        } catch (err) {
            console.log(`  ✗ 查询异常 (offset=${i}): ${err.message}`);
        }
    }

    console.log(`  → 获取到 ${allMetadata.length} 条记录`);
    return allMetadata;
}

// ========== HTTP 工具 ==========
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ========== LRC 基础检测 ==========
function isValidLRC(text, minLines = 5) {
    if (!text || typeof text !== 'string') return false;
    const timeRe = /\[\d{2}:\d{2}\.\d{2,3}\]/;
    const validLines = text.split('\n').filter(l => timeRe.test(l) && l.replace(timeRe, '').trim());
    return validLines.length >= minLines;
}

// ========== 在线LRC搜索 ==========
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
                for (const d of data.slice(0, 5)) {
                    if (d.syncedLyrics && isValidLRC(d.syncedLyrics)) {
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
    } catch (err) { /* skip */ }

    // 策略 2: 直接获取
    try {
        const directUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(song.title)}${song.singer ? '&artist_name=' + encodeURIComponent(song.singer) : ''}`;
        const resp = await fetchWithTimeout(directUrl, {
            headers: { ...BILI_HEADERS, 'Accept': 'application/json' },
        }, 15000);
        if (resp.ok) {
            const data = await resp.json();
            if (data && data.syncedLyrics && isValidLRC(data.syncedLyrics)) {
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
    } catch (err) { /* skip */ }

    return candidates;
}

async function searchNeteaseLyric(song) {
    const query = `${song.title} ${song.singer || ''}`.trim();
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
            candidates.push({
                source: 'netease',
                lrc: fullLrc,
                artist: artistName,
                trackName: s.name,
            });
        }
        return candidates;
    } catch (err) {
        return [];
    }
}

// ========== 歌手名模糊匹配 ==========
function isSingerRelated(candidateArtist, targetSinger) {
    if (!candidateArtist || !targetSinger) return false;
    const a = candidateArtist.replace(/[\s\/&、,，]+/g, '').toLowerCase();
    const b = targetSinger.replace(/[\s\/&、,，]+/g, '').toLowerCase();
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;
    // Check individual characters (for compound names)
    const bChars = b.replace(/[a-z]/gi, '').split('');
    if (bChars.length >= 2 && bChars.every(c => a.includes(c))) return true;
    return false;
}

// ========== 候选评分 ==========
function scoreCandidate(candidate, song) {
    let score = 0;
    const details = [];

    if (candidate.artist && isSingerRelated(candidate.artist, song.singer)) {
        score += 40;
        details.push('singer:match(+40)');
    } else if (candidate.artist && song.singer) {
        score -= 30;
        details.push('singer:mismatch(-30)');
    } else {
        score += 10;
        details.push('singer:unknown(+10)');
    }

    // Title keyword match
    const titleKeywords = song.title.replace(/[（(].+[）)]/g, '').replace(/[\s\-_·]+/g, '').toLowerCase();
    const lrcText = candidate.lrc.toLowerCase();
    if (titleKeywords.length >= 2 && lrcText.includes(titleKeywords)) {
        score += 30;
        details.push('title:match(+30)');
    } else {
        details.push('title:nomatch(+0)');
    }

    // Check for AI-generated signs
    const aiSigns = ['ai生成', 'generated by', '歌词制作', 'lyrics by ai'];
    const hasAI = aiSigns.some(s => candidate.lrc.toLowerCase().includes(s));
    if (!hasAI) {
        score += 20;
        details.push('noAI(+20)');
    } else {
        details.push('AI(+0)');
    }

    // Check completeness (≥10 lines)
    const timedLineCount = candidate.lrc.split('\n').filter(l => /\[\d{2}:\d{2}\.\d{2,3}\]/.test(l)).length;
    if (timedLineCount >= 10) {
        score += 10;
        details.push(`lines:${timedLineCount}(+10)`);
    } else {
        score += Math.max(0, timedLineCount - 5);
        details.push(`lines:${timedLineCount}(+${Math.max(0, timedLineCount - 5)})`);
    }

    return { score, details: details.join(' | ') };
}

// ========== 上传歌词到 Supabase ==========
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
        console.log(`  ✗ 上传失败: ${err.message}`);
        return false;
    }
}

// ========== 从LRC提取纯文本歌词 ==========
function extractPlainLyrics(lrcText) {
    const lines = [];
    const timeRe = /\[\d{2}:\d{2}\.\d{2,3}\]/g;
    for (const line of lrcText.split('\n')) {
        const text = line.replace(timeRe, '').trim();
        if (text && !text.startsWith('[ti:') && !text.startsWith('[ar:') &&
            !text.startsWith('[by:') && !text.startsWith('[al:') &&
            !text.startsWith('[offset:') && text.length >= 1) {
            lines.push(text);
        }
    }
    return lines;
}

// ========== Whisper 管线（调用 Python 脚本） ==========
function runWhisperPipeline(song, lyricsFile) {
    return new Promise((resolve, reject) => {
        const bvid = song.bvid;
        if (!bvid) {
            reject(new Error('无 BV号'));
            return;
        }

        const args = [
            PYTHON_SCRIPT,
            bvid,
            '--output', OUTPUT_DIR,
            '--model', 'small',
        ];
        if (lyricsFile) {
            args.push('--lyrics', lyricsFile);
        }

        console.log(`    🎤 启动 whisper: python ${args.join(' ')}`);

        const proc = spawn('python', args, {
            cwd: path.dirname(PYTHON_SCRIPT),
            stdio: ['ignore', 'pipe', 'pipe'],
            encoding: 'utf-8',
            timeout: 15 * 60 * 1000, // 15 minutes max
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data;
            // Print progress
            const lines = data.split('\n').filter(l => l.trim());
            for (const line of lines.slice(-2)) {
                if (line.trim()) console.log(`      ${line.trim()}`);
            }
        });

        proc.stderr.on('data', (data) => {
            stderr += data;
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
            } else {
                reject(new Error(`Whisper exited with code ${code}: ${stderr.slice(-500)}`));
            }
        });

        proc.on('error', (err) => {
            reject(err);
        });
    });
}

// ========== 查找 whisper 输出的 LRC 文件 ==========
function findLRCOutput(outputDir, bvid) {
    if (!fs.existsSync(outputDir)) return null;
    const files = fs.readdirSync(outputDir);
    // LRC files sorted by modification time
    const lrcFiles = files
        .filter(f => f.endsWith('.lrc'))
        .map(f => path.join(outputDir, f))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return lrcFiles[0] || null;
}

// ========== 进度管理 ==========
function loadProgress() {
    if (fs.existsSync(PROGRESS_FILE)) {
        return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    }
    return { completed: [], failed: [], skipped_instrumental: [] };
}

function saveProgress(progress) {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function loadFailed() {
    if (fs.existsSync(FAILED_FILE)) {
        return JSON.parse(fs.readFileSync(FAILED_FILE, 'utf-8'));
    }
    return [];
}

function saveFailed(failed) {
    fs.writeFileSync(FAILED_FILE, JSON.stringify(failed, null, 2));
}

// ========== 主流程 ==========
async function main() {
    console.log('='.repeat(60));
    console.log('  批量歌词补充流水线');
    console.log(`  模式: ${MODE}${DRY_RUN ? ' (dry-run)' : ''}`);
    console.log('='.repeat(60));

    // 1. 解析歌曲列表
    console.log('\n[1/5] 读取歌曲列表...');
    const allSongs = parseSongList(INPUT_FILE);
    console.log(`  → 共 ${allSongs.length} 首歌曲`);

    // 2. 识别并过滤纯音乐
    console.log('\n[2/5] 识别纯音乐/器乐曲目...');
    const progress = loadProgress();
    const vocalSongs = [];
    const instrumentalSongs = [];

    for (const song of allSongs) {
        if (progress.skipped_instrumental.includes(song.id)) {
            instrumentalSongs.push(song);
            continue;
        }
        if (progress.completed.includes(song.id)) {
            continue;
        }
        const result = isInstrumental(song);
        if (result.instrumental) {
            instrumentalSongs.push(song);
            progress.skipped_instrumental.push(song.id);
        } else {
            vocalSongs.push(song);
        }
    }

    console.log(`  → 纯音乐/器乐: ${instrumentalSongs.length} 首`);
    console.log(`  → 需处理歌曲: ${vocalSongs.length} 首`);
    console.log(`  → 已完成: ${progress.completed.length} 首`);

    // 打印部分纯音乐确认
    console.log('\n  纯音乐示例:');
    for (const s of instrumentalSongs.slice(0, 10)) {
        const r = isInstrumental(s);
        console.log(`    ID ${s.id}: ${s.title} - ${s.singer}  [${r.reason}]`);
    }
    if (instrumentalSongs.length > 10) {
        console.log(`    ... 及其他 ${instrumentalSongs.length - 10} 首`);
    }

    // 保存进度
    saveProgress(progress);

    // 打印纯音乐 ID 列表到文件
    const instrumentaIdsFile = path.join(__dirname, 'instrumental_ids.json');
    fs.writeFileSync(instrumentaIdsFile, JSON.stringify(instrumentalSongs.map(s => s.id), null, 2));
    console.log(`\n  纯音乐 ID 列表已保存: ${instrumentaIdsFile}`);

    if (DRY_RUN) {
        console.log('\n[Dry-run] 不执行实际处理，退出。');
        return;
    }

    // 3. 查询 Supabase 获取 BV信息
    const remainingSongs = vocalSongs.filter(s => !progress.completed.includes(s.id));
    console.log(`\n[3/5] 查询 ${remainingSongs.length} 首歌的 BV信息...`);

    const songIds = remainingSongs.map(s => s.id);
    const metadataList = await fetchSongMetadata(songIds);

    // 创建 ID → metadata 映射
    const metaMap = {};
    for (const m of metadataList) {
        metaMap[m.id] = m;
    }

    // 补充元数据
    const enrichedSongs = remainingSongs.map(s => ({
        ...s,
        bvid: metaMap[s.id]?.bvid || null,
        page: metaMap[s.id]?.page || null,
        duration_seconds: metaMap[s.id]?.duration_seconds || null,
    }));

    const noBvid = enrichedSongs.filter(s => !s.bvid);
    if (noBvid.length > 0) {
        console.log(`  ⚠ ${noBvid.length} 首无 BV号（将跳过）`);
        for (const s of noBvid.slice(0, 10)) {
            console.log(`    ID ${s.id}: ${s.title}`);
        }
    }

    // 4. 批量处理
    console.log(`\n[4/5] 开始批量处理 (模式: ${MODE})...`);

    let startIndex = START_INDEX;
    let processed = 0;
    const failed = loadFailed();

    // 确保目录存在
    if (!fs.existsSync(LYRIC_TXT_DIR)) {
        fs.mkdirSync(LYRIC_TXT_DIR, { recursive: true });
    }

    for (let i = startIndex; i < enrichedSongs.length; i++) {
        const song = enrichedSongs[i];
        if (LIMIT && processed >= LIMIT) break;

        console.log(`\n--- [${i + 1}/${enrichedSongs.length}] ID ${song.id}: ${song.title} - ${song.singer} ---`);

        if (!song.bvid) {
            console.log(`  ⏭ 无 BV号，跳过`);
            failed.push({ ...song, reason: '无BV号' });
            saveFailed(failed);
            continue;
        }

        try {
            let lrcText = null;

            if (MODE === 'hybrid' || MODE === 'online') {
                // 尝试在线获取 LRC
                console.log(`  🔍 搜索在线LRC...`);

                const lrclibResults = await searchLRCLib(song);
                const neteaseResults = await searchNeteaseLyric(song);
                const allCandidates = [...lrclibResults, ...neteaseResults];

                if (allCandidates.length > 0) {
                    // 评分并选最优
                    const scored = allCandidates.map(c => ({
                        ...c,
                        ...scoreCandidate(c, song),
                    }));
                    scored.sort((a, b) => b.score - a.score);

                    const best = scored[0];
                    console.log(`  📊 候选: ${scored.length} 个, 最优: ${best.source} (${best.score}分)`);
                    console.log(`     ${best.details}`);

                    if (best.score >= 30) {
                        lrcText = best.lrc;
                        console.log(`  ✅ 在线LRC达标，直接使用`);
                    } else {
                        console.log(`  ⚠ 在线LRC质量不足 (${best.score}分)`);
                    }
                } else {
                    console.log(`  ❌ 在线无结果`);
                }
            }

            // Whisper 回退
            if (!lrcText && (MODE === 'whisper' || MODE === 'hybrid')) {
                console.log(`  🎤 启动 Whisper 管线...`);

                // 准备歌词文本文件
                let lyricsFile = null;

                // 尝试从在线结果提取纯文本
                if (MODE === 'hybrid') {
                    const lrclibResults = await searchLRCLib(song);
                    const neteaseResults = await searchNeteaseLyric(song);
                    const allCandidates = [...lrclibResults, ...neteaseResults];

                    if (allCandidates.length > 0) {
                        const scored = allCandidates.map(c => ({
                            ...c,
                            ...scoreCandidate(c, song),
                        }));
                        scored.sort((a, b) => b.score - a.score);
                        const bestLrc = scored[0].lrc;
                        const plainLyrics = extractPlainLyrics(bestLrc);

                        if (plainLyrics.length >= 5) {
                            const lyricsFilePath = path.join(LYRIC_TXT_DIR, `${song.id}_lyrics.txt`);
                            fs.writeFileSync(lyricsFilePath, plainLyrics.join('\n'), 'utf-8');
                            lyricsFile = lyricsFilePath;
                            console.log(`    📝 歌词文本: ${plainLyrics.length} 行 → ${lyricsFilePath}`);
                        }
                    }
                }

                try {
                    await runWhisperPipeline(song, lyricsFile);

                    // 查找输出的 LRC
                    const lrcPath = findLRCOutput(OUTPUT_DIR, song.bvid);
                    if (lrcPath) {
                        lrcText = fs.readFileSync(lrcPath, 'utf-8');
                        console.log(`    ✅ Whisper LRC: ${lrcPath}`);
                    }
                } catch (whisperErr) {
                    console.log(`    ✗ Whisper 失败: ${whisperErr.message}`);
                }
            }

            // 上传歌词
            if (lrcText && isValidLRC(lrcText, 3)) {
                if (!DRY_RUN) {
                    const ok = await updateLyrics(song.id, lrcText);
                    if (ok) {
                        console.log(`  ✅ 已上传到 Supabase`);
                        progress.completed.push(song.id);
                        saveProgress(progress);
                        processed++;
                    } else {
                        console.log(`  ✗ 上传失败`);
                        failed.push({ ...song, reason: '上传失败' });
                        saveFailed(failed);
                    }
                } else {
                    console.log(`  [dry-run] 将上传 ${lrcText.split('\n').length} 行 LRC`);
                    processed++;
                }
            } else {
                console.log(`  ❌ 未能获取有效歌词`);
                failed.push({ ...song, reason: '无有效歌词' });
                saveFailed(failed);
            }

            // 速率限制
            await sleep(1500);

        } catch (err) {
            console.log(`  ✗ 异常: ${err.message}`);
            failed.push({ ...song, reason: err.message });
            saveFailed(failed);
        }
    }

    // 5. 汇总
    console.log('\n' + '='.repeat(60));
    console.log('  处理完成！');
    console.log('='.repeat(60));
    console.log(`  ✅ 成功: ${progress.completed.length} 首`);
    console.log(`  ❌ 失败: ${failed.length} 首`);
    console.log(`  🎵 纯音乐已跳过: ${instrumentalSongs.length} 首`);
    console.log(`  ⏳ 剩余: ${allSongs.length - progress.completed.length - failed.length - instrumentalSongs.length} 首`);
    console.log(`\n  进度文件: ${PROGRESS_FILE}`);
    console.log(`  失败记录: ${FAILED_FILE}`);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
