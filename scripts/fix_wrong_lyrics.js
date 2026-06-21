/**
 * 清掉匹配错误的歌词（设为 NULL），以便重新拉取
 * 用法：/d/softwa/nodejs/node scripts/fix_wrong_lyrics.js
 */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
let serviceKey = '';
for (const line of envContent.split('\n')) {
    const t = line.trim();
    if (t.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
        serviceKey = t.split('=').slice(1).join('=').trim();
        break;
    }
}

const BASE = 'https://orphftlwdwuvoscizndx.supabase.co/rest/v1';
const HEADERS = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
};

// 这些歌的歌词是 title-only 搜索匹配到的错误结果
const WRONG_IDS = [218, 228, 232];

async function main() {
    for (const id of WRONG_IDS) {
        const resp = await fetch(`${BASE}/songs?id=eq.${id}`, {
            method: 'PATCH',
            headers: HEADERS,
            body: JSON.stringify({ lrc_text: null }),
        });
        console.log(`#${id}: ${resp.ok ? '✓ 已清空' : '✗ 失败 ' + resp.status}`);
    }
    console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
