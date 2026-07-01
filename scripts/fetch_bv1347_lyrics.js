const path = require('path');
const fs = require('fs');

// ========== 加载 .env ==========
(function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) return;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (key && value) process.env[key] = value;
    });
})();

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headers = {
    "apikey": KEY, "Authorization": `Bearer ${KEY}`,
    "Content-Type": "application/json",
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function searchNetease(title, singer) {
    const url = `https://music.163.com/api/search/pc?type=1&s=${encodeURIComponent(title + ' ' + (singer || ''))}&limit=5`;
    const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://music.163.com/" }
    });
    const data = await resp.json();
    if (data.code !== 200 || !data.result?.songs?.length) return null;

    for (const song of data.result.songs) {
        const lrcUrl = `https://music.163.com/api/song/lyric?id=${song.id}&lv=1&kv=1&tv=-1`;
        const lrcResp = await fetch(lrcUrl, {
            headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://music.163.com/" }
        });
        const lrcData = await lrcResp.json();
        if (lrcData.code === 200 && lrcData.lrc?.lyric) {
            const lines = lrcData.lrc.lyric.split('\n').filter(l => l.includes(']')).length;
            if (lines >= 5) return lrcData.lrc.lyric;
        }
    }
    return null;
}

async function searchLrclib(title, singer) {
    const q = encodeURIComponent(`${title} ${singer || ''}`);
    const resp = await fetch(`https://lrclib.net/api/search?q=${q}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });
    if (!resp.ok) return null;
    const results = await resp.json();
    // Try exact match first, then fallback
    if (results?.length) {
        const exact = results.find(r => r.trackName?.toLowerCase() === title.toLowerCase());
        if (exact?.syncedLyrics) return exact.syncedLyrics;
        // Try first result
        if (results[0]?.syncedLyrics) return results[0].syncedLyrics;
    }
    // Try direct lookup
    const direct = await fetch(`https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(singer || '')}`, {
        headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (direct.ok) {
        const d = await direct.json();
        return d?.syncedLyrics || null;
    }
    return null;
}

async function updateDB(id, lrc) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/songs?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...headers, "Prefer": "return=minimal" },
        body: JSON.stringify({ lrc_text: lrc }),
    });
    return resp.ok;
}

async function main() {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/songs?bvid=eq.BV1347a6dEeA&select=id,title,singer&order=id.asc`, { headers });
    const songs = await resp.json();
    console.log(`Found ${songs.length} songs for BV1347a6dEeA\n`);

    let success = 0, fail = 0;

    for (const song of songs) {
        const cleanTitle = song.title.replace(/^\d+/, '').trim();
        const singer = song.singer || '';

        process.stdout.write(`[${song.id}] ${cleanTitle} - ${singer || '?'}`);

        let lrc = await searchNetease(cleanTitle, singer);
        let source = 'netease';

        if (!lrc) {
            lrc = await searchNetease(cleanTitle, '');
        }

        if (!lrc) {
            lrc = await searchLrclib(cleanTitle, singer);
            source = 'lrclib';
        }

        if (!lrc) {
            lrc = await searchLrclib(cleanTitle, '');
            source = 'lrclib';
        }

        if (lrc) {
            const saved = await updateDB(song.id, lrc);
            if (saved) {
                const lines = lrc.split('\n').filter(l => l.includes(']')).length;
                console.log(`  ✓ ${source} (${lines} lines)`);
                success++;
            } else {
                console.log(`  ✗ update failed`);
                fail++;
            }
        } else {
            console.log(`  ✗ no lyrics found`);
            fail++;
        }

        await sleep(200);
    }

    console.log(`\nDone: ${success} success, ${fail} failed (no lyrics)`);
}

main().catch(e => console.error(e));
