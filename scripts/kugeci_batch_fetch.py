"""
批量从酷歌词(kugeci.com)获取无歌词歌曲
修复版：正确解析搜索页的表格结构获取歌名 + 歌手，匹配后再下载LRC
"""
import json, re, urllib.request, urllib.parse, os, sys, time, html as html_mod

# 从 .env 读取 Supabase 配置
ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env')
SUPABASE_URL = SUPABASE_KEY = None
if os.path.exists(ENV_PATH):
    with open(ENV_PATH, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'): continue
            if '=' in line:
                k, v = line.split('=', 1)
                k, v = k.strip(), v.strip()
                if k == 'SUPABASE_URL': SUPABASE_URL = v
                elif k == 'SUPABASE_SERVICE_ROLE_KEY': SUPABASE_KEY = v

SUPABASE_HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Referer': 'https://www.kugeci.com/',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

def fetch(url, timeout=15):
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            try:
                return raw.decode('utf-8', errors='replace')
            except:
                return raw.decode('gbk', errors='replace')
    except Exception as e:
        return None

def get_lrc_download_url(song_html):
    m = re.search(r'href="(https?://www\.kugeci\.com/download/lrc/[a-zA-Z0-9]+)"', song_html)
    if m: return m.group(1)
    m = re.search(r'href="(/download/lrc/[a-zA-Z0-9]+)"', song_html)
    if m: return 'https://www.kugeci.com' + m.group(1)
    m = re.search(r'downloadlrc[^>]*href="([^"]+)"', song_html)
    if m:
        url = m.group(1)
        return 'https://www.kugeci.com' + url if url.startswith('/') else url
    return None

def is_valid_lrc(text, min_lines=3):
    if not text or len(text) < 50: return False
    lines = [l for l in text.split('\n') if re.search(r'\[\d{2}:\d{2}\.\d{2,3}\]', l)]
    return len(lines) >= min_lines

def search_and_download(title, singer):
    """搜索酷歌词，匹配歌手，下载LRC"""
    search_url = f'https://www.kugeci.com/search?q={urllib.parse.quote(title)}'
    html = fetch(search_url)
    if not html:
        return None, None

    # 解析表格：每一行 <tr> 包含歌名 td[1] 和歌手 td[2]
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL)
    best_match = None
    best_score = 0
    candidates = []

    for row in rows:
        # 找 /song/ 链接
        song_urls = re.findall(r'href="(https?://www\.kugeci\.com/song/[a-zA-Z0-9]+)"', row)
        if not song_urls:
            continue
        song_url = song_urls[0]

        # 提取所有 td 文本
        tds = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
        if len(tds) < 3:
            continue

        row_title = html_mod.unescape(re.sub(r'<[^>]+>', '', tds[1]).strip()).replace(chr(160), '').replace('&nbsp;', '').strip()
        row_singer = html_mod.unescape(re.sub(r'<[^>]+>', '', tds[2]).strip()).replace(chr(160), '').replace('&nbsp;', '').strip()

        # 计算匹配分数
        score = 0
        # 歌名匹配
        if title and title.lower() in row_title.lower():
            score += 3
        # 歌手精确匹配
        if singer and singer.lower() == row_singer.lower():
            score += 5
        # 歌手包含（部分匹配）
        elif singer and row_singer and singer.lower() in row_singer.lower():
            score += 3
        elif singer and row_singer and row_singer.lower() in singer.lower():
            score += 2

        # 翻唱版本降级
        if '(cover:' in row_title.lower(): score -= 1
        if '(DJ' in row_title: score -= 1
        if '(Live)' in row_title or '(live)' in row_title: score -= 1
        if '(0.8' in row_title or '(0.9' in row_title: score -= 2
        if '伴奏' in row_title: score -= 2
        if '英文版' in row_title: score -= 1

        candidates.append((score, song_url, row_title, row_singer))

        if score > best_score:
            best_score = score
            best_match = (song_url, row_title, row_singer)

    if best_score < 3 or not best_match:
        # 尝试用歌手名搜索
        if singer:
            search_url2 = f'https://www.kugeci.com/search?q={urllib.parse.quote(singer)}'
            html2 = fetch(search_url2)
            if html2:
                rows2 = re.findall(r'<tr[^>]*>(.*?)</tr>', html2, re.DOTALL)
                for row in rows2:
                    song_urls = re.findall(r'href="(https?://www\.kugeci\.com/song/[a-zA-Z0-9]+)"', row)
                    if not song_urls: continue
                    tds = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
                    if len(tds) < 3: continue
                    row_title = html_mod.unescape(re.sub(r'<[^>]+>', '', tds[1]).strip()).replace(chr(160), '').replace('&nbsp;', '').strip()
                    row_singer = html_mod.unescape(re.sub(r'<[^>]+>', '', tds[2]).strip()).replace(chr(160), '').replace('&nbsp;', '').strip()
                    score = 0
                    if singer and singer.lower() == row_singer.lower(): score += 5
                    if title and title.lower() in row_title.lower(): score += 3
                    if score > best_score:
                        best_score = score
                        best_match = (song_urls[0], row_title, row_singer)

    if best_score < 3 or not best_match:
        return None, None

    song_url, match_title, match_singer = best_match
    song_html = fetch(song_url)
    if not song_html:
        return None, None

    dl_url = get_lrc_download_url(song_html)
    if dl_url:
        lrc = fetch(dl_url)
        if lrc and is_valid_lrc(lrc):
            return lrc, f'{match_title} - {match_singer}'

    # 试页面内嵌 LRC
    lrc_lines = []
    for line in song_html.split('\n'):
        if re.search(r'\[\d{2}:\d{2}\.\d{2,3}\]', line):
            clean = re.sub(r'<[^>]+>', '', line).strip()
            lrc_lines.append(clean)
    if len(lrc_lines) >= 3:
        return '\n'.join(lrc_lines), 'embedded'

    return None, None


def update_supabase(song_id, lrc_text):
    url = f'{SUPABASE_URL}/rest/v1/songs?id=eq.{song_id}'
    data = json.dumps({'lrc_text': lrc_text}).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=SUPABASE_HEADERS, method='PATCH')
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status in (200, 201, 204)
    except Exception as e:
        return False


if __name__ == '__main__':
    # 非纯音乐候选（从183首无歌词歌曲中筛选出来的）
    # 加上额外的英文/流行歌曲
    SONGS = [
        (35, "把回忆拼好给你", "cici_"),
        (530, "半空", "陈之"),
        (596, "这次要记得", "雪二"),
        (95, "樱花树下的约定（完整版）", "旺仔小乔"),
        (1179, "红色蒲公英", "影视原声"),
        (1558, "传家", "周深"),
        (2186, "你再平凡也是限量版", "任夏"),
        (2195, "人生的道场", "魏佳艺"),
        (2200, "三生石下", "大欢"),
        (2223, "忘情忘你忘最初", "彤大王"),
        (2283, "你看时间等过谁", "彤大王"),
        (2323, "相遇的意义", "队长"),
        (2369, "习惯了", "凌丰"),
        (2394, "迟来的情话 (吉他版)", "周男孩"),
        (2420, "归来是故乡", "亦伊"),
        (2430, "赵小姐的一天", "蒋明"),
        (2611, "非酋", "薛黛霏、朱贺"),
        (2668, "三生石下", "大欢"),
        (3409, "燕无歇", "七叔（叶泽浩）"),
        (3484, "清幽院", "略略略"),
        (4413, "执子之手", "宝石Gem、一哩哩一"),
        (4650, "好兄弟", "肖元斌"),
        (4668, "盗墓笔记·十年人间", "郭聪明"),
        (4672, "黑色斗篷", "肖元斌"),
        (4720, "纸墨江南", "茶二娘"),
        (4722, "阎王判", "残雪"),
        (4832, "童年老家", "马健涛"),
        (4972, "All Falls Down", "Alan Walker"),
        (5070, "爱情惹的祸", "姜玉阳"),
        (5300, "半生雪", "是七叔呢"),
        (5328, "存在", "汪峰"),
        (5370, "一路生花", "温奕心"),
        (5380, "One Better", "Acoustic Hits"),
        (5387, "大海", "张雨生"),
    ]

    print(f"=== 酷歌词批量获取: {len(SONGS)} 首 ===")
    ok, fail = 0, []

    for i, (sid, title, singer) in enumerate(SONGS, 1):
        print(f"[{i}/{len(SONGS)}] #{sid}: {title} - {singer}")

        lrc, src = search_and_download(title, singer)
        if not lrc and singer:
            lrc, src = search_and_download(singer, title)

        if lrc:
            lines = len([l for l in lrc.split('\n') if re.search(r'\[\d{2}:\d{2}\.\d{2,3}\]', l)])
            ok2 = update_supabase(sid, lrc)
            if ok2:
                print(f"  [OK] {lines}行 -> Supabase (src: {src})")
                ok += 1
            else:
                print(f"  [FAIL] 上传失败")
                fail.append((sid, title, singer))
        else:
            print(f"  [SKIP] 酷歌词无匹配结果")
            fail.append((sid, title, singer))

        time.sleep(2)

    print(f"\n{'='*50}")
    print(f"完成! 成功: {ok} | 剩余失败: {len(fail)}")
