const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Use absolute path without Chinese chars
const passPath = 'C:/Users/xiaokang/Desktop/歌曲/.superpowers/db_pass.txt';
const password = fs.readFileSync(passPath, 'utf-8').trim();

const client = new Client({
    host: 'db.orphftlwdwuvoscizndx.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres.orphftlwdwuvoscizndx',
    password,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
});

async function main() {
    await client.connect();
    console.log('Connected to DB');

    const checkRes = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'songs' AND column_name = 'lrc_offset_ms'
    `);

    if (checkRes.rows.length > 0) {
        console.log('lrc_offset_ms 列已存在，跳过。');
    } else {
        await client.query(`ALTER TABLE public.songs ADD COLUMN lrc_offset_ms INTEGER DEFAULT 0`);
        console.log('已添加 lrc_offset_ms 列 (INTEGER, DEFAULT 0)');
    }

    await client.end();
}

main().catch(err => {
    console.error('Failed:', err.message);
    process.exit(1);
});
