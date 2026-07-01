"""
检查哪些无歌词歌曲在酷歌词上有 LRC
"""
import json, re, urllib.request, urllib.parse, os, sys, time

KUGE_SEARCH = 'https://www.kugeci.com/search?q='

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Referer': 'https://www.kugeci.com/',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

def fetch_url(url, timeout=15):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return raw.decode('utf-8', errors='replace')
    except Exception as e:
        return None

def is_valid_lrc(text, min_lines=3):
    if not text or len(text) < 50:
        return False
    lines = [l for l in text.split('\n') if re.search(r'\[\d{2}:\d{2}\.\d{2,3}\]', l)]
    return len(lines) >= min_lines

def search_kugeci(title, singer):
    query = f'{title} {singer}'.strip()
    search_url = KUGE_SEARCH + urllib.parse.quote(query)
    html = fetch_url(search_url)
    if not html:
        return None, None

    song_links = re.findall(r'href="(/song/[a-zA-Z0-9]+)"', html)
    if not song_links:
        return None, None

    for link in song_links[:3]:
        song_url = 'https://www.kugeci.com' + link
        song_html = fetch_url(song_url)
        if not song_html:
            continue

        lrc_pattern = r'href="([^"]+\.lrc)"'
        match = re.search(lrc_pattern, song_html, re.IGNORECASE)
        if match:
            lrc_url = match.group(1)
            if lrc_url.startswith('/'):
                lrc_url = 'https://www.kugeci.com' + lrc_url
            lrc_content = fetch_url(lrc_url)
            if lrc_content and is_valid_lrc(lrc_content):
                return lrc_content, lrc_url

        lrc_lines = []
        for line in song_html.split('\n'):
            if re.search(r'\[\d{2}:\d{2}\.\d{2,3}\]', line):
                clean = re.sub(r'<[^>]+>', '', line).strip()
                lrc_lines.append(clean)
        if len(lrc_lines) >= 3:
            return '\n'.join(lrc_lines), 'embedded'

    return None, None

# 候选歌曲（非纯音乐，有歌词潜力的）
CANDIDATES = [
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

print(f"=== 候选 {len(CANDIDATES)} 首，批量检查酷歌词 ===")
print(f"测试前10首，查看酷歌词是否可访问...\n")

test = CANDIDATES[:10]
for sid, title, singer in test:
    print(f"#{sid:>5}  {title:<30}  {singer or '<无>'}")
    lrc, src = search_kugeci(title, singer)
    if lrc:
        lines = len([l for l in lrc.split('\n') if re.search(r'\[\d{2}:\d{2}\.\d{2,3}\]', l)])
        print(f"  [OK] 找到! {lines} 行 - {src}\n")
    else:
        print(f"  [SKIP] 酷歌词未找到\n")
    time.sleep(1.5)
