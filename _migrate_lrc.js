const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Read .env manually
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
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
const SQL = `ALTER TABLE songs ADD COLUMN IF NOT EXISTS lrc_text TEXT DEFAULT NULL;`;

async function tryPort(port) {
  const connectionString = `postgresql://postgres:${encodeURIComponent(SERVICE_KEY)}@db.orphftlwdwuvoscizndx.supabase.co:${port}/postgres`;
  console.log(`\n=== Trying port ${port} ===`);
  console.log(`Connection: postgresql://postgres:***@db.orphftlwdwuvoscizndx.supabase.co:${port}/postgres`);

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();
    console.log(`Connected on port ${port}!`);
    const res = await client.query(SQL);
    console.log(`ALTER TABLE result:`, res.command || 'OK');
    await client.end();
    return true;
  } catch (err) {
    console.log(`Port ${port} FAILED: ${err.message}`);
    try { await client.end(); } catch (e) { /* ignore */ }
    return false;
  }
}

(async () => {
  console.log('Approach 3: Node.js pg module migration script');

  // Try port 6543 first (transaction pooler)
  let success = await tryPort(6543);
  if (success) {
    console.log('\n*** SUCCESS on port 6543 ***');
    process.exit(0);
  }

  // Try port 5432 (direct connection)
  success = await tryPort(5432);
  if (success) {
    console.log('\n*** SUCCESS on port 5432 ***');
    process.exit(0);
  }

  console.log('\n*** BOTH ports failed for pg approach ***');
  process.exit(1);
})();
