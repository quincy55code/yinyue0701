/**
 * 批量插入 BV1az4ceJEhk 的100首歌到 Supabase
 * 用法：/d/softwa/nodejs/node scripts/insert_bv1az_songs.js
 */
const fs = require('fs');
const path = require('path');

// 从 .env 加载密钥
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const lines = envContent.split('\n');
let serviceKey = '';
for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
        serviceKey = t.split('=').slice(1).join('=').trim();
        break;
    }
}

const BASE = 'https://orphftlwdwuvoscizndx.supabase.co/rest/v1';
const headers = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
};

// 读取 B站 API 返回的页面数据
const pagesPath = path.join(__dirname, '..', 'bv1az_pages.json');
const rawData = JSON.parse(fs.readFileSync(pagesPath, 'utf-8'));
const pages = rawData.data.pages;

const BVID = 'BV1az4ceJEhk';
const VIDEO_URL = `https://www.bilibili.com/video/${BVID}/`;

console.log(`准备插入 ${pages.length} 首歌...\n`);

async function main() {
    let inserted = 0;
    let skipped = 0;

    for (const p of pages) {
        // 解析 "01.大城小爱 - 王力宏" → title, singer
        const part = p.part || '';
        // 去掉前面的序号 "01."
        const withoutNum = part.replace(/^\d+\.\s*/, '');
        // 分割歌名和歌手
        const dashIdx = withoutNum.lastIndexOf(' - ');
        let title, singer;
        if (dashIdx > 0) {
            title = withoutNum.substring(0, dashIdx).trim();
            singer = withoutNum.substring(dashIdx + 3).trim();
        } else {
            // fallback: 用第一个空格分割
            const spaceIdx = withoutNum.indexOf(' ');
            title = spaceIdx > 0 ? withoutNum.substring(0, spaceIdx).trim() : withoutNum.trim();
            singer = spaceIdx > 0 ? withoutNum.substring(spaceIdx + 1).trim() : '';
        }

        const body = {
            title: title,
            singer: singer,
            bilibili_url: `${VIDEO_URL}?p=${p.page}`,
            bvid: BVID,
            page: p.page,
            start_seconds: null,
            end_seconds: null,
            duration_seconds: p.duration,
            cover_url: p.first_frame || '',
        };

        try {
            const resp = await fetch(`${BASE}/songs`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });

            if (resp.ok) {
                const data = await resp.json();
                inserted++;
                if (inserted <= 3 || inserted % 20 === 0) {
                    console.log(`  ✓ [${inserted}] #${data[0]?.id || '?'} ${title} - ${singer} (${p.duration}s)`);
                }
            } else {
                const errText = await resp.text();
                // 409 = duplicate
                if (resp.status === 409) {
                    console.log(`  ⏭ 重复: ${title} - ${singer}`);
                    skipped++;
                } else {
                    console.log(`  ✗ 失败: ${title} - ${singer}: ${errText.slice(0, 100)}`);
                }
            }
        } catch (err) {
            console.log(`  ✗ 网络错误: ${title} - ${singer}: ${err.message}`);
        }
    }

    console.log(`\n完成: ${inserted} 首插入, ${skipped} 首跳过`);
}

main().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});
