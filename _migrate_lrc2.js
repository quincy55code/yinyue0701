const fs = require('fs');
const path = require('path');

// Read .env
const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const eqIdx = line.indexOf('=');
  if (eqIdx > 0 && !line.trim().startsWith('#')) {
    const key = line.substring(0, eqIdx).trim();
    const val = line.substring(eqIdx + 1).trim();
    env[key] = val;
  }
});

const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

// Try using supabase-js client rpc
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://orphftlwdwuvoscizndx.supabase.co', SERVICE_KEY);

// Check if sql method exists
console.log('Has .sql:', typeof supabase.sql);
console.log('Has .rpc:', typeof supabase.rpc);

// Try rpc to call a function - maybe there's a way
if (supabase.sql) {
  console.log('Trying supabase.sql...');
  supabase.sql`ALTER TABLE songs ADD COLUMN IF NOT EXISTS lrc_text TEXT DEFAULT NULL;`
    .then(r => console.log('sql result:', JSON.stringify(r)))
    .catch(e => console.log('sql error:', e.message));
}

// Also try direct REST API SQL call
const https = require('https');
const sqlQuery = 'ALTER TABLE songs ADD COLUMN IF NOT EXISTS lrc_text TEXT DEFAULT NULL;';

// Try various endpoints
const endpoints = [
  '/rest/v1/sql',
  '/sql/v1',
  '/pgrest/sql'
];

async function tryEndpoint(endpoint) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ query: sqlQuery });
    const options = {
      hostname: 'orphftlwdwuvoscizndx.supabase.co',
      path: endpoint,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`${endpoint} => ${res.statusCode}: ${body.substring(0, 300)}`);
        resolve();
      });
    });
    req.on('error', (e) => {
      console.log(`${endpoint} => ERROR: ${e.message}`);
      resolve();
    });
    req.write(data);
    req.end();
  });
}

(async () => {
  for (const ep of endpoints) {
    await tryEndpoint(ep);
  }
})();
