/**
 * 直接连接 Supabase PostgreSQL 执行标签 DDL 并插入数据
 * 用法：/d/softwa/nodejs/node scripts/setup_tags.js
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// 从 .env 加载密钥
const envPath = path.join(__dirname, '..', '.env');
const env = {};
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return;
        const idx = t.indexOf('=');
        if (idx === -1) return;
        env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim();
    });
}

// 从环境变量或命令行参数获取密码
const password = process.env.DB_PASSWORD || process.argv[2];
if (!password) {
    console.error('Usage: node scripts/setup_tags.js <DB_PASSWORD>');
    console.error('  Or set DB_PASSWORD environment variable');
    process.exit(1);
}

const client = new Client({
    host: 'db.orphftlwdwuvoscizndx.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: password,
    ssl: { rejectUnauthorized: false },
});

async function run() {
    await client.connect();
    console.log('[setup_tags] Connected to Supabase PostgreSQL');

    const sqlPath = path.join(__dirname, '..', 'sql', 'tags.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // 按分号拆分，过滤注释和空语句
    const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('--') && s.length > 5);

    let ok = 0, skip = 0;
    for (const stmt of statements) {
        try {
            await client.query(stmt);
            const preview = stmt.replace(/\n/g, ' ').slice(0, 70);
            console.log('  ✓', preview + (preview.length >= 70 ? '...' : ''));
            ok++;
        } catch (err) {
            // 跳过 "already exists" 之类错误
            console.log('  ⏭', err.message.slice(0, 80));
            skip++;
        }
    }

    console.log(`\n[setup_tags] Done: ${ok} succeeded, ${skip} skipped`);

    // 验证
    const { rows: tags } = await client.query('SELECT id, name, parent_id FROM tags ORDER BY sort_order');
    console.log(`\nTags in database (${tags.length}):`);
    tags.forEach(t => {
        const info = t.parent_id ? `  └─ parent=${t.parent_id}` : '';
        console.log(`  ${t.id}: ${t.name}${info}`);
    });

    await client.end();
}

run().catch(e => {
    console.error('[setup_tags] Fatal:', e.message);
    process.exit(1);
});
