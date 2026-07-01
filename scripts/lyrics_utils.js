/**
 * lyrics_utils.js — 歌词处理共享工具模块
 * ==========================================
 * 供 detect_wrong_lyrics.js / refetch_lyrics_v2.js 等脚本使用
 * 消除跨脚本代码重复，统一验证逻辑
 */

const path = require('path');
const fs = require('fs');

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

// ========== 工具函数 ==========

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ========== LRC 基础验证 ==========

/** 校验 LRC 格式：至少有 minLines 行有效时间戳行 */
function isValidLRC(text, minLines = 5) {
    if (!text || typeof text !== 'string') return false;
    const timeRe = /\[\d{2}:\d{2}\.\d{2,3}\]/;
    const validLines = text.split('\n').filter(l => timeRe.test(l) && l.replace(timeRe, '').trim());
    return validLines.length >= minLines;
}

/** Schema-validation: reject metadata-only LRC lines */
function hasActualLyrics(lrc) {
    const lines = lrc.split('\n').filter(l => /\[\d{2}:\d{2}\.\d{2,3}\]/.test(l));
    const lyricLines = lines.filter(l => {
        const text = l.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim();
        return text && !/^(作词|作曲|编曲|制作人|混音|录音|和声|吉他|贝斯|钢琴|键盘|鼓手|弦乐|监制|出品|发行|OP|SP|母带|企划|文案|封面|演唱|歌手|专辑|原唱|翻唱|词曲|制作|编曲人|混音师|录音室|策划|监棚|指导|Written|Composed|Produced|Arranged|Mixed|Mastered|Lyrics|Music|Vocal|Guitar|Bass|Piano|Drums|Strings)/i.test(text);
    });
    return lyricLines.length >= 3;
}

// ========== LRC 解析辅助 ==========

/** 获取 LRC 中第一个有效时间戳行的时间（秒） */
function getFirstTimestamp(lrcText) {
    if (!lrcText) return null;
    const timeRe = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
    const lines = lrcText.split('\n');
    for (const line of lines) {
        const m = line.match(timeRe);
        if (m) {
            return parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + parseInt(m[3].padEnd(3, '0'), 10) / 1000;
        }
    }
    return null;
}

/** 获取 LRC 中最后一个有效时间戳行的时间（秒） */
function getLastTimestamp(lrcText) {
    if (!lrcText) return null;
    const timeRe = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
    let last = null;
    let m;
    while ((m = timeRe.exec(lrcText)) !== null) {
        last = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + parseInt(m[3].padEnd(3, '0'), 10) / 1000;
    }
    return last;
}

/** 获取有效时间戳行数 */
function countTimedLines(lrcText) {
    if (!lrcText) return 0;
    const timeRe = /\[\d{2}:\d{2}\.\d{2,3}\]/;
    return lrcText.split('\n').filter(l => timeRe.test(l) && l.replace(timeRe, '').trim()).length;
}

// ========== 检测启发式 H1: AI 生成假歌词 ==========

const AI_SECTION_MARKERS = /\((?:副歌|间奏|说唱|合唱|主歌|过门|尾奏|前奏|间奏曲|rap|verse|chorus|bridge|intro|outro|interlude|solo|hook|instrumental|前奏曲)\)/i;

function detectAILyrics(lrcText) {
    if (!lrcText) return { isAI: false, reason: '' };
    const lines = lrcText.split('\n');
    let sectionMarkerCount = 0;
    let lyricLineCount = 0;

    for (const l of lines) {
        if (!/\[\d{2}:\d{2}\.\d{2,3}\]/.test(l)) continue;
        const text = l.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim();
        if (!text) continue;
        lyricLineCount++;
        if (AI_SECTION_MARKERS.test(text)) sectionMarkerCount++;
    }

    if (lyricLineCount === 0) return { isAI: false, reason: 'no_lyric_lines' };

    const ratio = sectionMarkerCount / lyricLineCount;

    // ≥3 个段落标记 OR ≥15% 的行是段落标记 → AI 生成
    if (sectionMarkerCount >= 3) {
        return { isAI: true, reason: `${sectionMarkerCount} section markers`, markers: sectionMarkerCount, ratio };
    }
    if (ratio >= 0.15) {
        return { isAI: true, reason: `${(ratio * 100).toFixed(0)}% section markers`, markers: sectionMarkerCount, ratio };
    }
    return { isAI: false, reason: '', markers: sectionMarkerCount, ratio };
}

// ========== 检测启发式 H2: 歌名关键词匹配 ==========

/**
 * 从歌名中提取搜索关键词
 * 对于中文歌名，提取所有 2-4 字子串作为关键词
 */
function extractTitleKeywords(title) {
    if (!title) return [];
    // 去掉括号内容
    let t = title.replace(/[\(（\[].*?[\)）\]]/g, '').trim();
    // 去掉常见后缀
    t = t.replace(/[之歌之曲版]$/g, '').replace(/^歌曲[：:]?/g, '');
    // 去掉常见前缀
    t = t.replace(/^(经典|怀旧|热门|新歌|抖音|DJ版?|Remix|Cover|Live|原版)\s*/gi, '');

    const keywords = [];

    // 对于短歌名 (≤3字)，整个歌名作为关键词
    if (t.length <= 3) {
        if (t.length >= 2) keywords.push(t);
        return keywords;
    }

    // 提取所有 3 字子串
    for (let i = 0; i <= t.length - 3; i++) {
        keywords.push(t.substring(i, i + 3));
    }

    // 也加入 2 字子串（对短歌名更敏感）
    for (let i = 0; i <= t.length - 2; i++) {
        const kw = t.substring(i, i + 2);
        if (!keywords.includes(kw)) keywords.push(kw);
    }

    // 对于 4 字歌名，整体也是关键
    if (t.length === 4) keywords.push(t);

    // 去重并过滤单字
    return [...new Set(keywords)].filter(k => k.length >= 2);
}

/**
 * 检查歌名关键词是否在歌词中出现
 * 返回 { match: boolean, ratio: 0-1, matched: string[], missed: string[] }
 */
function titleMatchesLyrics(title, lrcText) {
    if (!title || !lrcText) return { match: true, ratio: 1, matched: [], missed: [], confidence: 'skip' };

    const keywords = extractTitleKeywords(title);
    if (keywords.length === 0) return { match: true, ratio: 1, matched: [], missed: [], confidence: 'skip' };

    // 规范化歌词文本：去空格、去标点、小写
    const normalizedLrc = lrcText
        .replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '')  // 去掉时间戳
        .replace(/[\s，。！？、；：""''（）\(\)\[\]{}《》…—\-_,.!?;:'"()\[\]{}·\/\\|@#$%^&*+=<>`~]/g, '')
        .toLowerCase();

    // 也规范化歌名
    const normalizedTitle = title
        .replace(/[\(（\[].*?[\)）\]]/g, '')
        .replace(/[\s，。！？、；：""''（）\(\)\[\]{}《》…—\-_,.!?;:'"()\[\]{}·\/\\|@#$%^&*+=<>`~]/g, '')
        .toLowerCase()
        .trim();

    const matched = [];
    const missed = [];

    for (const kw of keywords) {
        if (normalizedLrc.includes(kw.toLowerCase())) {
            matched.push(kw);
        } else {
            missed.push(kw);
        }
    }

    const ratio = keywords.length > 0 ? matched.length / keywords.length : 1;

    // 完整歌名在歌词中 → 高置信度匹配
    if (normalizedTitle.length >= 2 && normalizedLrc.includes(normalizedTitle)) {
        return { match: true, ratio: Math.max(ratio, 0.5), matched, missed, confidence: 'title_full_match' };
    }

    // 一个关键词都不匹配 → 几乎肯定是错歌
    if (matched.length === 0 && keywords.length >= 1) {
        // 单关键词短歌名：可能是繁简转换问题（如"难却" vs "難卻"）
        // 如果 LRC 其他指标健康（行数够多、无 AI 标记），降为中置信度
        if (keywords.length === 1 && normalizedTitle.length <= 3) {
            const timedLines = countTimedLines(lrcText);
            const aiResult = detectAILyrics(lrcText);
            const metaRatio = metadataLineRatio(lrcText);
            if (timedLines >= 15 && !aiResult.isAI && metaRatio <= 0.4) {
                return { match: false, ratio: 0, matched, missed, confidence: 'medium' };
            }
        }
        return { match: false, ratio: 0, matched, missed, confidence: 'high' };
    }

    // 匹配率 < 30% → 可疑（至少有 2 个关键词）
    if (ratio < 0.3 && keywords.length >= 2) {
        return { match: false, ratio, matched, missed, confidence: 'medium' };
    }

    return { match: ratio >= 0.3, ratio, matched, missed, confidence: ratio >= 0.5 ? 'high' : 'low' };
}

// ========== 检测启发式 H3: 歌词残缺 ==========

function detectTruncatedLyrics(lrcText, expectedDurationSec) {
    if (!lrcText) return [{ type: 'empty', detail: 'No LRC text' }];
    const issues = [];

    const firstTs = getFirstTimestamp(lrcText);
    const lastTs = getLastTimestamp(lrcText);
    const lineCount = countTimedLines(lrcText);

    // 首行开始太晚 (>25s)
    if (firstTs !== null && firstTs > 25) {
        issues.push({ type: 'starts_late', detail: `First lyric at ${firstTs.toFixed(1)}s`, firstTs });
    }

    // lrclib 已知截断模式：55-61s 区间
    if (firstTs !== null && firstTs > 55 && firstTs < 61) {
        issues.push({ type: 'likely_truncated', detail: `Starts at ${firstTs.toFixed(1)}s (common truncation point)`, firstTs });
    }

    // 覆盖率过低
    if (expectedDurationSec && lastTs !== null && expectedDurationSec > 30) {
        const coverage = lastTs / expectedDurationSec;
        if (coverage < 0.5) {
            issues.push({ type: 'low_coverage', detail: `Lyrics cover ${(coverage * 100).toFixed(0)}% of song (${lastTs.toFixed(0)}s / ${expectedDurationSec}s)`, coverage });
        }
    }

    // 行数过少
    if (lineCount < 15) {
        issues.push({ type: 'low_line_count', detail: `Only ${lineCount} timed lines`, lineCount });
    }

    return issues;
}

// ========== 检测启发式 H4: 歌词指纹 ==========

/**
 * 计算歌词内容指纹（前 5 行有效歌词文本，去标点空格）
 */
function computeLyricsFingerprint(lrcText) {
    if (!lrcText) return '';
    const lines = lrcText.split('\n')
        .filter(l => /\[\d{2}:\d{2}\.\d{2,3}\]/.test(l))
        .map(l => l.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim())
        .filter(Boolean)
        // 跳过元数据行
        .filter(l => !/^(作词|作曲|编曲|制作人|混音|录音|和声|吉他|贝斯|钢琴|键盘|鼓手|弦乐|监制|出品|发行|OP|SP|母带|企划|文案|封面|演唱|歌手|专辑|原唱|翻唱|词曲)/i.test(l))
        .slice(0, 5)
        .map(l => l.replace(/[\s\p{P}]/gu, ''))
        .join('|');
    return lines;
}

// ========== 检测启发式 H5: 元数据占比 ==========

function metadataLineRatio(lrcText) {
    if (!lrcText) return 1;
    const lines = lrcText.split('\n').filter(l => /\[\d{2}:\d{2}\.\d{2,3}\]/.test(l));
    if (lines.length === 0) return 1;

    const metaPattern = /^(作词|作曲|编曲|制作人|混音|录音|和声|吉他|贝斯|钢琴|键盘|鼓手|弦乐|监制|出品|发行|OP|SP|母带|企划|文案|封面|演唱|歌手|专辑|原唱|翻唱|词曲|制作|编曲人|混音师|录音室|策划|监棚|指导)/i;
    let metaCount = 0;
    for (const l of lines) {
        const text = l.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/g, '').trim();
        if (!text) continue;
        if (metaPattern.test(text)) metaCount++;
    }
    return metaCount / lines.length;
}

// ========== 歌手别名与匹配 ==========

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
    // ========== 新增 ==========
    '程响': ['Cheng Xiang'],
    '黄静美': ['Huang Jingmei'],
    '尹昔眠': ['Yin Ximian'],
    'Uu': ['Uu'],
    'cici_': ['cici', 'Cici'],
    '大籽': ['Da Zi'],
    '平生不晚': ['Ping Sheng Bu Wan'],
    '海伦': ['Hai Lun', 'Helen'],
    '浮生': ['Fu Sheng'],
    '张茜': ['Zhang Qian', 'Zhang Xi'],
    '任然': ['Ren Ran'],
    '傅梦彤': ['Fu Mengtong'],
    '阿悠悠': ['A Youyou'],
    '王贰浪': ['Wang Erlang'],
    '叶炫清': ['Ye Xuanqing'],
    '邓紫棋': ['G.E.M.', 'GEM', 'Gloria Tang'],
    '薛之谦': ['Joker Xue'],
    '李荣浩': ['Li Ronghao'],
    '毛不易': ['Mao Buyi'],
    '周深': ['Zhou Shen', 'Charlie Zhou'],
    '华晨宇': ['Hua Chenyu'],
    '张碧晨': ['Zhang Bichen'],
};

/**
 * 检查匹配到的歌手名是否与原歌手相关
 */
function isSingerRelated(matchedArtist, originalSinger) {
    if (!originalSinger || !matchedArtist) return true; // can't verify, accept
    const ma = matchedArtist.toLowerCase().trim();
    const os = originalSinger.toLowerCase().trim();

    // Direct match or containment
    if (ma.includes(os) || os.includes(ma)) return true;

    // Split original singer by common separators
    const parts = originalSinger.split(/[&,，、/]/).map(p => p.trim().toLowerCase()).filter(Boolean);
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

    return false;
}

// ========== 导出 ==========

module.exports = {
    loadEnv,
    sleep,
    fetchWithTimeout,
    isValidLRC,
    hasActualLyrics,
    getFirstTimestamp,
    getLastTimestamp,
    countTimedLines,
    detectAILyrics,
    extractTitleKeywords,
    titleMatchesLyrics,
    detectTruncatedLyrics,
    computeLyricsFingerprint,
    metadataLineRatio,
    SINGER_ALIASES,
    isSingerRelated,
};
