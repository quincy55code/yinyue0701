/**
 * detect_wrong_lyrics.js — 检测数据库中的错误歌词
 * ===============================================
 * 用法:
 *   node scripts/detect_wrong_lyrics.js --report             仅报告（不修改数据库）
 *   node scripts/detect_wrong_lyrics.js --mark-wrong=high    清除高置信度错误歌词
 *   node scripts/detect_wrong_lyrics.js --mark-wrong=all     清除高+中置信度错误歌词
 *   node scripts/detect_wrong_lyrics.js --ids=20,604,782     仅检测指定ID
 *   node scripts/detect_wrong_lyrics.js --limit=100          仅处理前N首（测试用）
 *
 * 输出文件:
 *   scripts/wrong_lyrics_report.json  — 完整检测报告
 *   scripts/cleared_ids.json          — 被清空的歌曲ID列表
 */

const path = require('path');
const fs = require('fs');
const {
    loadEnv, sleep, fetchWithTimeout,
    isValidLRC, hasActualLyrics,
    getFirstTimestamp, getLastTimestamp, countTimedLines,
    detectAILyrics, titleMatchesLyrics, detectTruncatedLyrics,
    computeLyricsFingerprint, metadataLineRatio,
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

// ========== 解析CLI参数 ==========
const ARGS = {
    report: false,
    markWrong: null,   // 'high' | 'all'
    ids: null,         // [1,2,3]
    limit: null,       // number
};
for (const arg of process.argv.slice(2)) {
    if (arg === '--report') ARGS.report = true;
    else if (arg.startsWith('--mark-wrong=')) ARGS.markWrong = arg.split('=')[1];
    else if (arg.startsWith('--ids=')) ARGS.ids = arg.split('=')[1].split(',').map(Number);
    else if (arg.startsWith('--limit=')) ARGS.limit = parseInt(arg.split('=')[1], 10);
}

if (!ARGS.report && !ARGS.markWrong) {
    ARGS.report = true; // 默认 report 模式
}

// ========== 获取所有带歌词的歌曲 ==========
async function getSongsWithLyrics(ids, limit) {
    console.log('查询有歌词的歌曲...');
    let allSongs = [];
    let offset = 0;
    const PAGE_SIZE = 1000;

    while (true) {
        let url;
        if (ids) {
            // 按 ID 查询 (使用 in.() 语法)
            const idList = ids.join(',');
            url = `${SUPABASE_URL}/rest/v1/songs?select=id,title,singer,duration_seconds,lrc_text&id=in.(${idList})&limit=${ids.length}`;
        } else {
            url = `${SUPABASE_URL}/rest/v1/songs?select=id,title,singer,duration_seconds,lrc_text&lrc_text=not.is.null&order=id.asc&limit=${PAGE_SIZE}&offset=${offset}`;
        }

        const resp = await fetch(url, { headers: HEADERS });
        if (!resp.ok) {
            console.log(`  ✗ 查询失败: ${resp.status}`);
            break;
        }
        const page = await resp.json();
        if (!page || page.length === 0) break;

        // 过滤掉 lrc_text 为空的
        const withLyrics = page.filter(s => s.lrc_text && s.lrc_text.trim());
        allSongs = allSongs.concat(withLyrics);

        if (ids || page.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;

        if (limit && allSongs.length >= limit) {
            allSongs = allSongs.slice(0, limit);
            break;
        }
    }
    console.log(`  → 共 ${allSongs.length} 首带歌词的歌曲\n`);
    return allSongs;
}

// ========== 对单首歌曲运行所有检测启发式 ==========
function analyzeSong(song) {
    const lrc = song.lrc_text;
    const findings = [];

    // H1: AI 假歌词
    const aiResult = detectAILyrics(lrc);
    if (aiResult.isAI) {
        findings.push({
            heuristic: 'H1_AI_LYRICS',
            confidence: 'high',
            detail: aiResult.reason,
            markers: aiResult.markers,
            ratio: aiResult.ratio,
        });
    }

    // H2: 歌名关键词缺失
    const titleResult = titleMatchesLyrics(song.title, lrc);
    if (!titleResult.match && titleResult.confidence === 'high') {
        findings.push({
            heuristic: 'H2_TITLE_MISMATCH',
            confidence: 'high',
            detail: `Title "${song.title}" keywords not found in lyrics`,
            matched: titleResult.matched,
            missed: titleResult.missed,
        });
    } else if (!titleResult.match && titleResult.confidence === 'medium') {
        findings.push({
            heuristic: 'H2_TITLE_MISMATCH',
            confidence: 'medium',
            detail: `Title "${song.title}" low keyword match (${(titleResult.ratio * 100).toFixed(0)}%)`,
            matched: titleResult.matched,
            missed: titleResult.missed,
        });
    }

    // H3: 歌词残缺
    const truncIssues = detectTruncatedLyrics(lrc, song.duration_seconds);
    for (const issue of truncIssues) {
        let confidence = 'low';
        if (issue.type === 'likely_truncated') confidence = 'medium';
        else if (issue.type === 'starts_late') confidence = 'medium';
        else if (issue.type === 'low_coverage') confidence = 'medium';
        else if (issue.type === 'low_line_count') confidence = 'low';

        findings.push({
            heuristic: 'H3_TRUNCATED',
            confidence,
            detail: issue.detail,
            issueType: issue.type,
        });
    }

    // H5: 元数据占比过高
    const metaRatio = metadataLineRatio(lrc);
    if (metaRatio > 0.4) {
        findings.push({
            heuristic: 'H5_METADATA_HEAVY',
            confidence: 'low',
            detail: `${(metaRatio * 100).toFixed(0)}% of timed lines are metadata`,
            ratio: metaRatio,
        });
    }

    // H4: 指纹——在第二轮批量计算
    const fingerprint = computeLyricsFingerprint(lrc);

    return {
        id: song.id,
        title: song.title,
        singer: song.singer,
        duration_seconds: song.duration_seconds,
        lrc_length: lrc.length,
        timed_lines: countTimedLines(lrc),
        first_ts: getFirstTimestamp(lrc),
        last_ts: getLastTimestamp(lrc),
        fingerprint,
        findings,
        lrc_preview: lrc.substring(0, 300),
    };
}

// ========== H4: 指纹冲突检测（需要全局视图） ==========
function detectFingerprintConflicts(results) {
    // 构建指纹 → 歌曲列表映射
    const fpMap = new Map();
    for (const r of results) {
        if (!r.fingerprint || r.fingerprint.length < 10) continue;
        if (!fpMap.has(r.fingerprint)) fpMap.set(r.fingerprint, []);
        fpMap.get(r.fingerprint).push(r);
    }

    // 找出冲突的指纹
    for (const [fp, songs] of fpMap) {
        if (songs.length < 2) continue;

        // 检查歌名是否不同（同名不同歌手的不算冲突）
        const titles = songs.map(s => s.title.replace(/[\(（\[].*?[\)）\]]/g, '').trim());
        const uniqueTitles = [...new Set(titles)];

        if (uniqueTitles.length >= 2) {
            // 这些歌曲共享相同歌词内容但歌名不同 → 至少有些是错的
            for (const song of songs) {
                const confidence = uniqueTitles.length >= 3 ? 'medium' : 'low';
                const otherTitles = uniqueTitles.filter(t => t !== song.title.replace(/[\(（\[].*?[\)）\]]/g, '').trim());
                song.findings.push({
                    heuristic: 'H4_FINGERPRINT_CONFLICT',
                    confidence,
                    detail: `Same lyrics as ${songs.length - 1} other songs with different titles: ${otherTitles.slice(0, 3).join(', ')}`,
                    sharedWith: songs.filter(s => s.id !== song.id).map(s => s.id),
                });
            }
        }
    }
}

// ========== 降低"仅 H2"高置信度的误报 ==========
/**
 * 如果只有 H2 触发（无其他启发式），且歌词看起来结构良好，
 * 则降为中置信度。这类通常是"歌名是隐喻"的歌曲（如"星月神话"）。
 */
function downgradeSoloH2(results) {
    for (const r of results) {
        const highFindings = r.findings.filter(f => f.confidence === 'high');
        // 只有一个 HIGH 发现，且是 H2
        if (highFindings.length === 1 && highFindings[0].heuristic === 'H2_TITLE_MISMATCH') {
            // 检查是否有"严重"的其他问题（排除 starts_late，长前奏很常见）
            const hasSeriousIssues = r.findings.some(f =>
                f.heuristic === 'H3_TRUNCATED' &&
                (f.issueType === 'likely_truncated' || f.issueType === 'low_coverage')
            ) || r.findings.some(f => f.heuristic === 'H1_AI_LYRICS');

            // 歌词行数够多 + 无严重问题 → 可能是歌名隐喻/繁简问题
            if (r.timed_lines >= 12 && !hasSeriousIssues) {
                highFindings[0].confidence = 'medium';
                highFindings[0].detail += ' (downgraded: lyrics look well-formed, title may be metaphorical)';
            }
        }
    }
}

// ========== 分类汇总 ==========
function classifyResults(results) {
    const summary = {
        total: results.length,
        clean: 0,
        highConfidenceBad: 0,
        mediumConfidenceBad: 0,
        lowConfidenceBad: 0,
        byHeuristic: {},
    };

    for (const r of results) {
        const highs = r.findings.filter(f => f.confidence === 'high');
        const meds = r.findings.filter(f => f.confidence === 'medium');
        const lows = r.findings.filter(f => f.confidence === 'low');

        r.maxConfidence = highs.length > 0 ? 'high' : (meds.length > 0 ? 'medium' : (lows.length > 0 ? 'low' : 'clean'));

        if (r.maxConfidence === 'high') summary.highConfidenceBad++;
        else if (r.maxConfidence === 'medium') summary.mediumConfidenceBad++;
        else if (r.maxConfidence === 'low') summary.lowConfidenceBad++;
        else summary.clean++;

        for (const f of r.findings) {
            if (!summary.byHeuristic[f.heuristic]) {
                summary.byHeuristic[f.heuristic] = { high: 0, medium: 0, low: 0 };
            }
            summary.byHeuristic[f.heuristic][f.confidence]++;
        }
    }

    return summary;
}

// ========== 打印报告 ==========
function printReport(results, summary) {
    console.log('═══════════════════════════════════════════');
    console.log('         歌词质量检测报告');
    console.log('═══════════════════════════════════════════\n');

    console.log(`总计检测: ${summary.total} 首`);
    console.log(`  干净:    ${summary.clean} 首 (${(summary.clean / summary.total * 100).toFixed(1)}%)`);
    console.log(`  高置信度问题: ${summary.highConfidenceBad} 首 (${(summary.highConfidenceBad / summary.total * 100).toFixed(1)}%)`);
    console.log(`  中置信度问题: ${summary.mediumConfidenceBad} 首 (${(summary.mediumConfidenceBad / summary.total * 100).toFixed(1)}%)`);
    console.log(`  低置信度问题: ${summary.lowConfidenceBad} 首 (${(summary.lowConfidenceBad / summary.total * 100).toFixed(1)}%)`);

    console.log('\n--- 按启发式分类 ---');
    for (const [heuristic, counts] of Object.entries(summary.byHeuristic)) {
        const total = counts.high + counts.medium + counts.low;
        console.log(`  ${heuristic}: ${total} 首 (高:${counts.high} 中:${counts.medium} 低:${counts.low})`);
    }

    // 打印高置信度问题详情
    const highBad = results.filter(r => r.maxConfidence === 'high');
    if (highBad.length > 0) {
        console.log(`\n--- 高置信度问题详情 (${highBad.length} 首) ---`);
        for (const r of highBad) {
            console.log(`  #${r.id} ${r.title} — ${r.singer || '(无歌手)'}`);
            for (const f of r.findings.filter(f => f.confidence === 'high')) {
                console.log(`    [${f.heuristic}] ${f.detail}`);
            }
        }
    }

    // 打印中置信度问题概要
    const medBad = results.filter(r => r.maxConfidence === 'medium');
    if (medBad.length > 0) {
        console.log(`\n--- 中置信度问题概要 (${medBad.length} 首) ---`);
        for (const r of medBad) {
            const reasons = r.findings.filter(f => f.confidence === 'medium').map(f => f.heuristic).join(', ');
            console.log(`  #${r.id} ${r.title} — ${r.singer || '(无歌手)'}  [${reasons}]`);
        }
    }
}

// ========== 清除错误歌词 ==========
async function clearWrongLyrics(results, confidenceLevel) {
    const toClear = results.filter(r => {
        if (confidenceLevel === 'all') return r.maxConfidence === 'high' || r.maxConfidence === 'medium';
        return r.maxConfidence === 'high';
    });

    if (toClear.length === 0) {
        console.log(`\n没有需要清除的歌词 (confidence >= ${confidenceLevel})`);
        return [];
    }

    console.log(`\n准备清除 ${toClear.length} 首歌曲的歌词...`);

    let cleared = 0;
    const clearedIds = [];

    for (let i = 0; i < toClear.length; i++) {
        const song = toClear[i];
        const label = `[${i + 1}/${toClear.length}] #${song.id} ${song.title} — ${song.singer || ''}`;

        try {
            const url = `${SUPABASE_URL}/rest/v1/songs?id=eq.${song.id}`;
            const resp = await fetchWithTimeout(url, {
                method: 'PATCH',
                headers: {
                    ...HEADERS,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal',
                },
                body: JSON.stringify({ lrc_text: null }),
            }, 15000);

            if (resp.ok) {
                cleared++;
                clearedIds.push(song.id);
                console.log(`  ✓ ${label}`);
            } else {
                console.log(`  ✗ ${label} — 写入失败: ${resp.status}`);
            }
        } catch (err) {
            console.log(`  ✗ ${label} — 请求失败: ${err.message}`);
        }

        // 短暂延迟避免请求过快
        if (i < toClear.length - 1) {
            await sleep(100);
        }
    }

    console.log(`\n清除完成: ${cleared}/${toClear.length} 首`);
    return clearedIds;
}

// ========== 主流程 ==========
async function main() {
    console.log('🔍 歌词质量检测脚本\n');
    console.log(`模式: ${ARGS.markWrong ? `检测 + 清除 (置信度: ${ARGS.markWrong})` : '仅报告'}`);
    if (ARGS.ids) console.log(`目标: 指定ID (${ARGS.ids.length} 首)`);
    if (ARGS.limit) console.log(`限制: 前 ${ARGS.limit} 首`);
    console.log('');

    // 1. 获取歌曲
    const songs = await getSongsWithLyrics(ARGS.ids, ARGS.limit);
    if (songs.length === 0) {
        console.log('没有找到带歌词的歌曲。');
        return;
    }

    // 2. 逐首分析
    console.log(`分析 ${songs.length} 首歌曲...`);
    const results = [];
    for (let i = 0; i < songs.length; i++) {
        const song = songs[i];
        const result = analyzeSong(song);
        results.push(result);

        if ((i + 1) % 500 === 0) {
            console.log(`  进度: ${i + 1}/${songs.length}`);
        }
    }
    console.log(`  完成: ${songs.length} 首歌曲已分析\n`);

    // 3. 指纹冲突检测（全局）
    detectFingerprintConflicts(results);

    // 3.5. 降低"仅 H2"误报
    downgradeSoloH2(results);

    // 4. 分类汇总
    const summary = classifyResults(results);

    // 5. 打印报告
    printReport(results, summary);

    // 6. 写入报告文件
    const reportPath = path.join(__dirname, 'wrong_lyrics_report.json');
    fs.writeFileSync(reportPath, JSON.stringify({
        generated_at: new Date().toISOString(),
        summary,
        results: results.map(r => ({
            id: r.id,
            title: r.title,
            singer: r.singer,
            maxConfidence: r.maxConfidence,
            findings: r.findings,
            lrc_preview: r.lrc_preview,
        })),
    }, null, 2), 'utf-8');
    console.log(`\n报告已写入: ${reportPath}`);

    // 7. 如果需要，清除错误歌词
    if (ARGS.markWrong) {
        const clearedIds = await clearWrongLyrics(results, ARGS.markWrong);

        if (clearedIds.length > 0) {
            const clearedPath = path.join(__dirname, 'cleared_ids.json');
            fs.writeFileSync(clearedPath, JSON.stringify(clearedIds, null, 2), 'utf-8');
            console.log(`已清除ID列表写入: ${clearedPath}`);
        }
    }

    console.log('\n✅ 检测完成');
}

main().catch(err => {
    console.error('脚本执行失败:', err);
    process.exit(1);
});
