/**
 * 批量插入 BV1vm411Z7ZN 的200首歌到 Supabase
 * 网易云评论10W+的神仙歌曲200首合集
 * 用法：/d/softwa/nodejs/node scripts/insert_bv1vm_songs.js
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

// 已知歌手名称集合（从 map_tags.js 提取 + 新增）
const KNOWN_SINGERS = new Set([
    // 原有
    '莫文蔚','陈慧琳','陈奕迅','张学友','刘德华','邓紫棋','林俊杰','王菲','林忆莲','周迅',
    '刘珂矣','音阙诗听','陈粒','房东的猫','周杰伦','温岚','阿桑','一支榴莲','蓝心羽','苏星婕',
    '许茹芸','辛晓琪','金海心','范玮琪','梁咏琪','孙燕姿','梁静茹','张韶涵','张惠妹','刘若英',
    '萧亚轩','蔡健雅','戴佩妮','张靓颖','田馥甄','丁当','张芸京','戚薇','A-Lin','金莎',
    '江美琪','张碧晨','袁娅维TIA RAY','王力宏','周传雄','五月天','F.I.R.飞儿乐团','S.H.E',
    '蔡依林','陶喆','王心凌','光良','容祖儿','杨丞琳','Twins','马天宇','海鸣威','李圣杰',
    'F4','苏打绿','沙宝亮','陈小春','庾澄庆','伍佰','吴克群','林志炫','阿杜','潘玮柏',
    '许嵩','黄小琥','Tank','林宥嘉','信乐团','谢霆锋','水木年华','张宇','萧敬腾','李翊君',
    '郭静','彭佳慧','飞轮海','孙楠','韩红','袁成杰','郁可唯','单依纯','黄霄雲','任然',
    '大籽','阿肆','阿YueYue','徐佳莹','梦然','回小仙','王靖雯','卢润泽','潘成','丹正母子',
    '窝窝','王睿卓','PAMajor','温奕心','王搏','王艳薇','南方凯','旺仔小乔','周林枫','尹昔眠',
    '罗志祥','Sweety','许巍','卢巧音','蔡卓妍','徐誉滕','誓言','王强','羽泉','汪峰',
    '凤凰传奇','费玉清','华语群星','刀郎','乌兰托娅','金沙','飞儿乐队','F.I.R','she','twins',
    '于文文','刘惜君','周笔畅','刘瑞琦','戴羽彤','小蓝背心','叶斯淳','yihuik苡慧','Uu','刘梦妤',
    '深海鱼子酱','王大毛','曾惜','陈雪凝','冯提莫','李雅微','叶炫清','张钰','刘思涵',
    '岑宁儿','木小雅','于果','路飞文','cici_','怪阿姨','唐伯虎Annie','李宇春',
    // BV1iP 新增
    '夏婉安','王蓉','胡杨林','蔡淳佳','弦子','本兮',
    // BV1vm 新增歌手 — 从200首数据中提取
    '薛之谦', '李荣浩', '毛不易', '赵雷', '柳爽', '宋冬野', '郭顶',
    '花粥', '周深', '周兴哲', '告五人', '张杰', '好妹妹', '张泽熙',
    '展展与罗罗', '尚士达', '广东雨神', '张叶蕾', '徐靖博', '戴荃',
    '永彬Ryan.B', '王一博', '王贰浪', '焦迈奇', '许飞', '杨千嬅',
    '谢春花', '光泽', '隔壁老樊', '司南', '吴雨霏', '队长', '颜人中',
    '阿冗', '赵紫骅', '齐一', '陈绮贞', '鹿先森乐队', '陈楚生', '王铮亮',
    '茄子蛋', '逃跑计划', '许佳嚎', '迟里乌布', 'Morerare', '马頔',
    '张紫豪', '李常超', 'Lao乾妈', '徐秉龙', '沈以诚', '沈谧仁', '奇然',
    '南征北战NZBZ', '邵帅', '王字十三杀', '京水', '舟遥', '陈鸿宇',
    '柏松', '马良', 'GALA', 'Beyond', '张国荣', '卢冠廷', '中島美嘉',
    '米津玄师', 'Jam', 'Olly Murs', 'Sia', 'RAM WIRE', '丁可',
    'Approaching Nirvana', 'The Kid LAROI', 'Justin Bieber',
    'Martin Garrix', 'David Guetta', 'Kirsty刘瑾睿', 'Shang', 'lil sophy',
    '三亩地', '七叔', '叶泽浩', '双笙', '陈元汐', '银临', 'Aki阿杰',
    '孙茜茹', '花粥', '马雨阳', '张希', '曹方', '筷子兄弟',
    '买辣椒也用券', '于果', '梁汉文', 'G.E.M.邓紫棋',
    '永彬Ryan.B', '戴荃', '程响', '盛哲', '李袁杰', '胡歌', '艾辰',
    '许巍', '陈柯宇', '陶喆', '颜人中', '赵雷',
]);

// 歌手名别称映射（统一歌手名）
const SINGER_ALIASES = {
    'G.E.M.邓紫棋': '邓紫棋',
    'G.E.M.鄧紫棋': '邓紫棋',
    'GALA': 'GALA',
    'cici_': 'cici_',
    'Uu': 'Uu (刘梦妤)',
};

/**
 * 解析 part 字段，提取歌手和歌名
 * 格式多样化：
 *   "001. 张芸京-偏爱"          → 歌手-歌名
 *   "010. 星辰大海-黄霄雲"       → 歌名-歌手
 *   "030. 毛不易 - 消愁"         → 歌手 - 歌名
 *   "029. 可-薛之谦&张靓颖"      → 歌名-歌手（合作）
 */
function parsePart(part) {
    // 去掉前面的序号 "001. "
    let rest = part.replace(/^\d{3,4}\.\s*/, '');
    if (!rest) return { title: part, singer: '' };

    let title, singer;

    // 策略1: 有 " - " (空格-横线-空格) 分隔符
    const spaceDashIdx = rest.lastIndexOf(' - ');
    if (spaceDashIdx > 0) {
        const left = rest.substring(0, spaceDashIdx).trim();
        const right = rest.substring(spaceDashIdx + 3).trim();
        // 判断哪边是歌手（已知歌手列表匹配）
        if (KNOWN_SINGERS.has(left)) {
            singer = left; title = right;
        } else if (KNOWN_SINGERS.has(right)) {
            title = left; singer = right;
        } else {
            // 默认：短的为歌手，长的为歌名
            if (left.length <= right.length) {
                singer = left; title = right;
            } else {
                title = left; singer = right;
            }
        }
        return { title, singer };
    }

    // 策略2: 无空格 "-" 分隔符。用最后一个 "-" 分割
    const dashIdx = rest.lastIndexOf('-');
    if (dashIdx > 0) {
        const left = rest.substring(0, dashIdx).trim();
        const right = rest.substring(dashIdx + 1).trim();

        // 处理合作歌手 "薛之谦&张靓颖"
        const rightClean = right.split('&')[0].split('(')[0].split('（')[0].trim();
        const leftClean = left.split('&')[0].split('(')[0].split('（')[0].trim();

        // 尝试匹配已知歌手
        const leftIsSinger = KNOWN_SINGERS.has(left) || KNOWN_SINGERS.has(leftClean);
        const rightIsSinger = KNOWN_SINGERS.has(right) || KNOWN_SINGERS.has(rightClean);

        if (leftIsSinger && !rightIsSinger) {
            singer = left; title = right;
        } else if (rightIsSinger && !leftIsSinger) {
            title = left; singer = right;
        } else if (leftIsSinger && rightIsSinger) {
            // 两边都有歌手名 — 用更短的作为歌手
            if (left.length <= right.length) {
                singer = left; title = right;
            } else {
                title = left; singer = right;
            }
        } else {
            // 两边都不在已知列表 — 启发式判断
            // 常见模式：中文2-4字为歌手名，歌名较长
            const hasChinese = /[一-龥]/;
            if (hasChinese.test(left) && hasChinese.test(right)) {
                // 用长度启发：歌手通常≤4字，歌名通常≥2字
                if (left.length <= 4 && right.length >= 2) {
                    singer = left; title = right;
                } else if (right.length <= 4) {
                    title = left; singer = right;
                } else {
                    // 默认左歌手右歌名
                    singer = left; title = right;
                }
            } else if (!hasChinese.test(left) && hasChinese.test(right)) {
                // 左边英文/数字（歌名），右边中文（歌手）
                title = left; singer = right;
            } else {
                // 默认左歌手右歌名
                singer = left; title = right;
            }
        }
        return { title, singer };
    }

    // 策略3: 没有分隔符，整个就是歌名
    return { title: rest, singer: '' };
}

// 读取 B站 API 返回的页面数据
const pagesPath = path.join(__dirname, '..', 'bv1vm_pages.json');
const rawData = JSON.parse(fs.readFileSync(pagesPath, 'utf-8'));
const pages = rawData.data;

const BVID = 'BV1vm411Z7ZN';
const VIDEO_URL = `https://www.bilibili.com/video/${BVID}/`;

console.log(`准备插入 ${pages.length} 首歌...`);
console.log('='.repeat(60));

async function main() {
    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    // 先检查哪些已存在（按 bvid 查）
    const checkResp = await fetch(
        `${BASE}/songs?select=id,bvid,page&bvid=eq.${BVID}&order=page`,
        { headers }
    );
    const existing = checkResp.ok ? await checkResp.json() : [];
    const existingPages = new Set(existing.map(s => s.page));
    if (existing.length > 0) {
        console.log(`已有 ${existing.length} 首来自此视频的歌曲 (pages: ${[...existingPages].join(',')})`);
    }

    for (const p of pages) {
        if (existingPages.has(p.page)) {
            console.log(`  ⏭ 跳过 P${p.page}: 已存在`);
            skipped++;
            continue;
        }

        const parsed = parsePart(p.part);
        const title = parsed.title;
        const singer = parsed.singer;

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
                const logLine = `  ✓ [${inserted}] #${data[0]?.id || '?'} ${title} - ${singer} (${p.duration}s)`;
                if (inserted <= 5 || inserted % 25 === 0) {
                    console.log(logLine);
                }
            } else {
                const errText = await resp.text();
                if (resp.status === 409) {
                    console.log(`  ⏭ 重复: ${title} - ${singer}`);
                    skipped++;
                } else {
                    console.log(`  ✗ 失败 P${p.page} ${title} - ${singer}: ${errText.slice(0, 120)}`);
                    errors++;
                }
            }
        } catch (err) {
            console.log(`  ✗ 网络错误 P${p.page} ${title} - ${singer}: ${err.message}`);
            errors++;
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`完成: ${inserted} 首插入, ${skipped} 首跳过, ${errors} 失败`);
    console.log(`总计: ${pages.length} 首`);
}

main().catch(e => {
    console.error('致命错误:', e);
    process.exit(1);
});
