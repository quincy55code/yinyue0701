"""
kugeci_lrc_fetcher.py — 从酷歌词(kugeci.com)批量抓取LRC歌词
========================================================
用法: python kugeci_lrc_fetcher.py

读取 batch_lyrics_failed.json，逐首搜索酷歌词，下载LRC，
通过 Supabase REST API 上传。
"""

import os
import sys
import json
import re
import time
import urllib.request
import urllib.parse

# ========== 配置 ==========
FAILED_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'batch_lyrics_failed.json')
KUGE_SEARCH = 'https://www.kugeci.com/search?q='

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Referer': 'https://www.kugeci.com/',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

# Load .env for Supabase credentials
ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env')
SUPABASE_URL = None
SUPABASE_KEY = None

if os.path.exists(ENV_PATH):
    with open(ENV_PATH, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, value = line.split('=', 1)
                key, value = key.strip(), value.strip()
                if key == 'SUPABASE_URL':
                    SUPABASE_URL = value
                elif key == 'SUPABASE_SERVICE_ROLE_KEY':
                    SUPABASE_KEY = value

if not SUPABASE_URL or not SUPABASE_KEY:
    print('[ERROR] 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY')
    sys.exit(1)

SUPABASE_HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}


def fetch_url(url, timeout=15, retries=2):
    """HTTP GET with timeout and retry"""
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, headers=HEADERS)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
                content_type = resp.headers.get('Content-Type', '')
                charset = 'utf-8'
                if 'charset=' in content_type:
                    charset = content_type.split('charset=')[-1].split(';')[0].strip()
                return raw.decode(charset, errors='replace')
        except urllib.error.HTTPError as e:
            if e.code == 503 and attempt < retries:
                time.sleep(3)
                continue
            return None
        except Exception as e:
            if attempt < retries:
                time.sleep(2)
                continue
            return None
    return None


def extract_lrc_from_html(html):
    """Extract LRC lyrics from kugeci.com song page HTML"""
    # Method 1: Look for LRC link
    lrc_pattern = r'href="([^"]+\.lrc)"'
    match = re.search(lrc_pattern, html, re.IGNORECASE)
    if match:
        lrc_url = match.group(1)
        if lrc_url.startswith('/'):
            lrc_url = 'https://www.kugeci.com' + lrc_url
        print(f'    LRC link: {lrc_url}')
        lrc_content = fetch_url(lrc_url)
        if lrc_content and is_valid_lrc(lrc_content):
            return lrc_content

    # Method 2: Look for embedded LRC in <pre> or code blocks
    lrc_lines = []
    for line in html.split('\n'):
        # Match [mm:ss.xx] or [mm:ss.xxx] format
        if re.search(r'\[\d{2}:\d{2}\.\d{2,3}\]', line):
            clean = re.sub(r'<[^>]+>', '', line).strip()
            lrc_lines.append(clean)

    if len(lrc_lines) >= 3:
        return '\n'.join(lrc_lines)

    # Method 3: Look for textarea or div containing lyrics
    textarea_match = re.search(r'<(?:textarea|div)[^>]*id="(?:lrc|lyric|lyrics)"[^>]*>(.*?)</(?:textarea|div)>', html, re.DOTALL | re.IGNORECASE)
    if textarea_match:
        content = re.sub(r'<br\s*/?>', '\n', textarea_match.group(1))
        content = re.sub(r'<[^>]+>', '', content).strip()
        if is_valid_lrc(content):
            return content

    return None


def is_valid_lrc(text, min_lines=3):
    """Check if text looks like valid LRC"""
    if not text or len(text) < 50:
        return False
    lines = [l for l in text.split('\n') if re.search(r'\[\d{2}:\d{2}\.\d{2,3}\]', l)]
    return len(lines) >= min_lines


def search_kugeci(title, singer):
    """Search kugeci.com and return LRC if found"""
    query = f'{title} {singer}'.strip()
    search_url = KUGE_SEARCH + urllib.parse.quote(query)

    print(f'    搜索: {search_url[:80]}...')
    html = fetch_url(search_url)
    if not html:
        return None

    # Find song page links
    # Pattern: /song/XXXXX
    song_links = re.findall(r'href="(/song/[a-zA-Z0-9]+)"', html)
    if not song_links:
        print('    未找到歌曲链接')
        return None

    # Try each song link (up to 3)
    for link in song_links[:3]:
        song_url = 'https://www.kugeci.com' + link
        print(f'    尝试: {song_url}')

        song_html = fetch_url(song_url)
        if not song_html:
            continue

        # Check if the song title/singer match
        title_in_page = re.search(r'<title>(.*?)</title>', song_html)
        if title_in_page:
            page_title = title_in_page.group(1)
            print(f'    页面: {page_title[:60]}')

        lrc = extract_lrc_from_html(song_html)
        if lrc:
            return lrc

    return None


def update_supabase(song_id, lrc_text):
    """Upload LRC to Supabase"""
    url = f'{SUPABASE_URL}/rest/v1/songs?id=eq.{song_id}'
    data = json.dumps({'lrc_text': lrc_text}).encode('utf-8')

    req = urllib.request.Request(url, data=data, headers=SUPABASE_HEADERS, method='PATCH')
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status == 200
    except Exception as e:
        print(f'    Upload error: {e}')
        return False


def main():
    if not os.path.exists(FAILED_FILE):
        print('没有失败记录。')
        return

    with open(FAILED_FILE, 'r', encoding='utf-8') as f:
        failed = json.load(f)

    print(f'共 {len(failed)} 首需要从酷歌词获取\n')

    success = 0
    still_failed = []

    for i, song in enumerate(failed):
        sid = song['id']
        title = song.get('title', '')
        singer = song.get('singer', '')
        print(f'[{i+1}/{len(failed)}] ID {sid}: {title} - {singer}')

        lrc = search_kugeci(title, singer)

        if lrc and is_valid_lrc(lrc):
            lines = len([l for l in lrc.split('\n') if re.search(r'\[\d{2}:\d{2}\.\d{2,3}\]', l)])
            print(f'  [OK] Found LRC ({lines} lines)')

            ok = update_supabase(sid, lrc)
            if ok:
                print(f'  [OK] Uploaded to Supabase')
                success += 1
            else:
                print(f'  [FAIL] Upload failed')
                still_failed.append(song)
        else:
            # Try swapping title/singer
            print(f'    Trying swapped title/singer...')
            lrc2 = search_kugeci(singer, title)
            if lrc2 and is_valid_lrc(lrc2):
                lines = len([l for l in lrc2.split('\n') if re.search(r'\[\d{2}:\d{2}\.\d{2,3}\]', l)])
                print(f'  [OK] Found LRC after swap ({lines} lines)')

                ok = update_supabase(sid, lrc2)
                if ok:
                    print(f'  [OK] Uploaded to Supabase')
                    success += 1
                else:
                    print(f'  [FAIL] Upload failed')
                    still_failed.append(song)
            else:
                print(f'  [SKIP] No lyrics found')
                still_failed.append(song)

        time.sleep(2)  # Rate limit

    # Save remaining failures
    with open(FAILED_FILE, 'w', encoding='utf-8') as f:
        json.dump(still_failed, f, ensure_ascii=False, indent=2)

    print(f'\n{"="*60}')
    print(f'  酷歌词抓取完成: ✅ {success} | ❌ {len(still_failed)} 仍需其他方式')
    print(f'{"="*60}')


if __name__ == '__main__':
    main()
