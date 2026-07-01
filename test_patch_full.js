/**
 * Full test for PATCH /api/playlists/:id
 * Uses supabaseAdmin to manage test user + http for API calls
 */
const http = require('http');
const { createClient } = require('/dev/null'); // will be replaced
delete require.cache[require.resolve('/dev/null')];

const SUPABASE_URL = 'https://orphftlwdwuvoscizndx.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ycGhmdGx3ZHd1dm9zY2l6bmR4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTkyNDA4OSwiZXhwIjoyMDk3NTAwMDg5fQ.jDg11vKVIkCYsFPN5T6aLdU08cRx-FXSeZVfRJmi4mo';

function req(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, 'http://localhost:8765');
        const opts = {
            hostname: url.hostname, port: url.port, path: url.pathname, method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (token) opts.headers['Authorization'] = 'Bearer ' + token;
        const r = http.request(opts, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });
        r.on('error', reject);
        if (body) r.write(JSON.stringify(body));
        r.end();
    });
}

async function main() {
    console.log('=== PATCH /api/playlists/:id ===\n');

    // 0. Send verification code
    const email = 'lexiaode@163.com';
    console.log('0. Sending verification code...');
    const codeResp = await req('POST', '/api/auth/send-code', { email });
    console.log('   Status:', codeResp.status, JSON.stringify(codeResp.body));
    if (codeResp.status !== 200) { console.log('FAIL: abort'); return; }

    // 1. Look up verification code from DB using REST API
    console.log('1. Fetching verification code from DB...');
    const supabaseRest = (endpoint) => {
        return new Promise((resolve, reject) => {
            const url = new URL(endpoint, SUPABASE_URL);
            const opts = {
                hostname: url.hostname, port: 443, path: url.pathname + url.search,
                method: 'GET',
                headers: {
                    'apikey': SERVICE_KEY,
                    'Authorization': 'Bearer ' + SERVICE_KEY,
                },
            };
            const r = https.request(opts, (res) => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); } catch { resolve(null); }
                });
            });
            r.on('error', reject);
            r.end();
        });
    };

    // Use https module
    const https = require('https');
    const codes = await new Promise((resolve, reject) => {
        const path = '/rest/v1/verification_codes?email=eq.' + encodeURIComponent(email) + '&order=created_at.desc&limit=1';
        const url = new URL(path, SUPABASE_URL);
        const opts = {
            hostname: url.hostname, port: 443, path: url.pathname + url.search,
            method: 'GET',
            headers: {
                'apikey': SERVICE_KEY,
                'Authorization': 'Bearer ' + SERVICE_KEY,
            },
        };
        const r = https.request(opts, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch { resolve([]); }
            });
        });
        r.on('error', reject);
        r.end();
    });

    if (!codes || codes.length === 0) {
        console.log('FAIL: no verification codes found');
        return;
    }
    const code = codes[0].code;
    console.log('   Found code:', code);

    // 2. Login with verification code
    console.log('2. Logging in with verification code...');
    const loginResp = await req('POST', '/api/auth/login', { email, code });
    console.log('   Status:', loginResp.status);
    if (loginResp.status !== 200) { console.log('FAIL:', JSON.stringify(loginResp.body)); return; }
    const token = loginResp.body.token || loginResp.body.access_token;
    if (!token) { console.log('FAIL: no token in response:', JSON.stringify(loginResp.body)); return; }
    console.log('   Token obtained:', token.substring(0, 20) + '...');
    const isNew = loginResp.body.is_new_user;
    console.log('   Is new user:', isNew);

    // 3. Create a test playlist
    console.log('3. Creating test playlist...');
    const createResp = await req('POST', '/api/playlists', { name: '测试歌单' }, token);
    console.log('   Status:', createResp.status, JSON.stringify(createResp.body));
    if (createResp.status !== 200) { console.log('FAIL: abort'); return; }
    const plId = createResp.body.id;

    // 4. Test PATCH
    console.log('4. PATCH rename...');
    const patchResp = await req('PATCH', '/api/playlists/' + plId, { name: '新歌单名称' }, token);
    console.log('   Status:', patchResp.status, JSON.stringify(patchResp.body));
    if (patchResp.status === 200) console.log('PASS');
    else console.log('FAIL');

    // 5. Empty name
    console.log('5. Empty name...');
    const emptyResp = await req('PATCH', '/api/playlists/' + plId, { name: '' }, token);
    console.log('   Status:', emptyResp.status, JSON.stringify(emptyResp.body));
    if (emptyResp.status === 400) console.log('PASS');
    else console.log('FAIL');

    // 6. Non-existent
    console.log('6. Non-existent...');
    const noneResp = await req('PATCH', '/api/playlists/999999', { name: '不存在' }, token);
    console.log('   Status:', noneResp.status, JSON.stringify(noneResp.body));
    if (noneResp.status === 404) console.log('PASS');
    else console.log('FAIL');

    console.log('\n=== Done ===');
}
main().catch(console.error);
