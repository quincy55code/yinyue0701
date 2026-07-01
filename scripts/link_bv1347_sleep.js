const path = require('path');
const fs = require('fs');

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

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    // Find the current 'theme-lists' collection
    const { data: themeCol } = await supabase
        .from('collections')
        .select('id')
        .eq('slug', 'theme-lists')
        .single();

    console.log('theme-lists collection id:', themeCol?.id);

    // Get current '睡前' item
    const { data: items } = await supabase
        .from('collection_items')
        .select('id, title, bvid')
        .eq('title', '睡前')
        .eq('collection_id', themeCol.id);

    console.log('Current 睡前:', JSON.stringify(items, null, 2));

    // Update bvid
    const { error } = await supabase
        .from('collection_items')
        .update({ bvid: 'BV1347a6dEeA' })
        .eq('title', '睡前')
        .eq('collection_id', themeCol.id);

    if (error) {
        console.error('Update failed:', error.message);
        return;
    }
    console.log('✓ Updated 睡前 → BV1347a6dEeA');

    // Verify
    const { data: verify } = await supabase
        .from('collection_items')
        .select('id, title, bvid')
        .eq('collection_id', themeCol.id)
        .order('sort_order', { ascending: true });

    console.log('\nTheme-lists after update:');
    for (const v of verify) {
        console.log('  ' + v.title + ' → ' + v.bvid);
    }

    // Check how many songs use this bvid
    const { count } = await supabase
        .from('songs')
        .select('*', { count: 'exact', head: true })
        .eq('bvid', 'BV1347a6dEeA');

    console.log('\nSongs with BV1347a6dEeA:', count);
}

main().catch(e => console.error(e));
