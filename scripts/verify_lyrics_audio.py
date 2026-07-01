"""
verify_lyrics_audio.py — 音频验证歌词脚本
==========================================
通过阿里云一句话识别 ASR，对比 LRC 第一句歌词与实际音频是否一致。

用法:
  python3 verify_lyrics_audio.py --report         仅检测，生成报告
  python3 verify_lyrics_audio.py --fix            自动清除错误歌词 (设为 NULL)
  python3 verify_lyrics_audio.py --limit=50       只检测前 N 首
  python3 verify_lyrics_audio.py --ids=1,2,3      只检测指定 ID

流程:
  1. 解析 LRC → 跳过元数据行 (作词/作曲/编曲...)，找到第一句真正歌词
  2. 从 B站 DASH API 获取音频 URL
  3. ffmpeg 截取歌词时间点前后 15 秒音频 → PCM 16kHz mono
  4. 阿里云 ASR 转文字
  5. 对比: 匹配→通过 / 歌曲错→标记清除 / API失败→跳过
"""

import os
import sys
import re
import json
import time
import hmac
import hashlib
import base64
import string
import subprocess
import tempfile
import urllib.request
import urllib.parse
from datetime import datetime, timezone

# ========== 配置 ==========
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://orphftlwdwuvoscizndx.supabase.co")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")  # set by wrapper
ALIYUN_AK_ID = os.environ.get("ALIYUN_ACCESS_KEY_ID", "LTAI5tXXXXXXXXXXXXX")
ALIYUN_AK_SECRET = os.environ.get("ALIYUN_ACCESS_KEY_SECRET", "DoPffXXXXXXXXXXXXXXXXX")
ASR_APPKEY = os.environ.get("ALIYUN_ASR_APPKEY", "n1vY9toGDWrvm5OX")
ASR_REGION = "cn-shanghai"

BILI_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://www.bilibili.com/",
}

# ========== 阿里云 API 签名 (与 ECS 脚本相同逻辑) ==========
RESERVED_CHARS = set(string.ascii_letters + string.digits + '-_.~')

def percent_encode(s):
    result = []
    for char in s:
        if char in RESERVED_CHARS:
            result.append(char)
        else:
            for byte in char.encode('utf-8'):
                result.append('%{:02X}'.format(byte))
    return ''.join(result)

def sign_request(params, secret, method="POST"):
    sorted_params = sorted(params.items())
    canonical_parts = []
    for k, v in sorted_params:
        canonical_parts.append(f"{percent_encode(k)}={percent_encode(v)}")
    canonical = '&'.join(canonical_parts)
    string_to_sign = f"{method}&{percent_encode('/')}&{percent_encode(canonical)}"
    key = (secret + "&").encode('utf-8')
    signature = base64.b64encode(
        hmac.new(key, string_to_sign.encode('utf-8'), hashlib.sha1).digest()
    ).decode('utf-8')
    return signature

def call_aliyun_api(host, action, extra_params=None, method="POST"):
    """通用阿里云 API 调用"""
    params = {
        "AccessKeyId": ALIYUN_AK_ID,
        "Action": action,
        "Format": "JSON",
        "Version": "2019-02-28",
        "SignatureMethod": "HMAC-SHA1",
        "SignatureVersion": "1.0",
        "SignatureNonce": str(int(time.time() * 1000000)),
        "Timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "RegionId": ASR_REGION,
    }
    if extra_params:
        params.update(extra_params)

    signature = sign_request(params, ALIYUN_AK_SECRET, method)
    params["Signature"] = signature

    url = f"https://{host}/?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, method=method)
    req.add_header("User-Agent", "lyrics-verify/1.0")

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {"error": str(e)}

# ========== ASR Token ==========
def get_asr_token():
    """获取阿里云语音识别 Access Token"""
    result = call_aliyun_api(
        "nls-meta.cn-shanghai.aliyuncs.com",
        "CreateToken",
        {"RoleArn": "acs:ram::1480842666938748:role/aliyunnlsdefaultrole"},
    )
    if "Token" in result:
        return result["Token"].get("Id")
    print(f"  [WARN] Failed to get ASR token: {json.dumps(result, ensure_ascii=False)[:200]}")
    return None

# ========== ASR 一句话识别 ==========
def recognize_speech(audio_data, token, max_retries=2):
    """调用阿里云一句话识别 API"""
    url = f"https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/asr?appkey={ASR_APPKEY}"

    for attempt in range(max_retries):
        req = urllib.request.Request(url, data=audio_data, method="POST")
        req.add_header("X-NLS-Token", token)
        req.add_header("Content-Type", "application/octet-stream")
        req.add_header("Content-Length", str(len(audio_data)))

        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                raw = resp.read().decode()
                result = json.loads(raw)
                status = result.get("status")
                if status == 20000000:
                    return result.get("result", "")
                else:
                    print(f"    ASR status={status}, msg={result.get('status_text', '?')}")
                    if attempt < max_retries - 1:
                        time.sleep(1)
                    continue
        except Exception as e:
            print(f"    ASR error (attempt {attempt+1}): {e}")
            if attempt < max_retries - 1:
                time.sleep(1)
            continue

    return None

# ========== LRC 解析 ==========
META_PATTERNS = [
    re.compile(r'^(作词|作曲|编曲|制作人|混音|录音|和声|吉他|贝斯|钢琴|键盘|鼓手|弦乐|监制|出品|发行|OP|SP|母带|企划|文案|封面|演唱|歌手|专辑|原唱|翻唱|词曲|制作|编曲人|混音师|录音室|策划|监棚|指导|音乐总监|音响顾问|声乐指导|打击乐|乐队总监|人声编辑|统筹|PGM|Program|贝斯|古琴|小提琴|大提琴|二胡|琵琶|笛子|箫|Program)', re.I),
    re.compile(r'^(Written|Composed|Produced|Arranged|Mixed|Mastered|Lyrics|Music|Vocal|Guitar|Bass|Piano|Drums|Strings)', re.I),
    re.compile(r'^\s*$'),
    re.compile(r'^[0-9,.\-\s]+$'),
    # 版权声明 / 授权声明
    re.compile(r'^[「「].*?(未经|著作权|许可|不得|翻唱|翻录|使用|授权).*?[」」]'),
    re.compile(r'^(未经|著作权|许可|不得翻唱|不得翻录)'),
    # "词 : XXX" / "曲 : XXX" / "词/曲 : XXX" format
    re.compile(r'^(词|曲|编曲|制作|混音|录[音制]|和声|配唱|吉他|贝斯|钢琴|弦乐|鼓|PGM|Program|乐队总监|人声编辑|统筹)\s*[:：]', re.I),
    # "配唱制作人" / "配唱监制" / "制作人" (no colon needed if followed by more roles)
    re.compile(r'^(配唱制作人|配唱监制|音乐制作人|执行制作)', re.I),
    # Speaker tag: "XXX：" or "XXX:" format (like "李秉成：看不穿...")
    re.compile(r'^[一-鿿\w]{1,6}\s*[：:].{2,}', re.I),
]

def is_meta_line(text):
    """判断是否是元数据/制作人员行"""
    text = text.strip()
    if not text:
        return True
    for pat in META_PATTERNS:
        if pat.match(text):
            return True
    # Skip very short lines that are likely instrumental markers
    if len(text) <= 2 and not re.search(r'[一-鿿]', text):
        return True
    return False

def parse_lrc_first_line(lrc_text):
    """
    解析 LRC，返回候选歌词行列表（第一个有效行 + 2个备选行）。
    跳过元数据行和 t=0 附近的"歌手-歌名"行。
    返回: [(timestamp_seconds, text), ...] 最多 3 个
    """
    if not lrc_text:
        return []

    time_re = re.compile(r'\[(\d{2}):(\d{2})\.(\d{2,3})\]')
    lines = lrc_text.split('\n')
    candidates = []

    for line in lines:
        m = time_re.search(line)
        if not m:
            continue

        minutes = int(m.group(1))
        seconds = int(m.group(2))
        centiseconds_str = m.group(3).ljust(3, '0')
        milliseconds = int(centiseconds_str[:3])
        timestamp = minutes * 60 + seconds + milliseconds / 1000

        text = time_re.sub('', line).strip()

        if is_meta_line(text):
            continue

        # 跳过 t=0 附近的 "歌手 - 歌名" 格式行
        if timestamp < 1.0 and re.match(r'^[一-鿿\w\s]+[-—–][一-鿿\w\s]+$', text):
            continue

        candidates.append((timestamp, text))
        if len(candidates) >= 3:
            break

    return candidates


# ========== 文本对比 ==========
def normalize_text(text):
    """规范化文本用于对比"""
    # 去空格、标点、英文大小写统一
    text = re.sub(r'[\s，。！？、；：""''（）\(\)\[\]{}《》…—\-_,.!?;:\'"()\[\]{}·\/\\|@#$%^&*+=<>`~]', '', text)
    return text.lower()

def compare_texts(expected, actual):
    """
    对比预期歌词和 ASR 识别结果。
    返回: (match: bool, score: float, detail: str)
    """
    if not actual:
        return False, 0, "ASR returned empty"

    norm_expected = normalize_text(expected)
    norm_actual = normalize_text(actual)

    if not norm_expected or not norm_actual:
        return False, 0, "Empty after normalization"

    # 方法1: 预期文本是否是实际文本的子串（或反之）
    if norm_expected in norm_actual:
        return True, 1.0, f"exact substring match"
    if norm_actual in norm_expected:
        return True, 0.9, f"ASR text is substring of expected"

    # 方法2: 字符级重叠率
    expected_chars = set(norm_expected)
    actual_chars = set(norm_actual)
    if not expected_chars:
        return False, 0, "No Chinese characters in expected"

    overlap = expected_chars & actual_chars
    char_score = len(overlap) / len(expected_chars)

    # 方法3: 用 pypinyin 比较（可选，如果安装了）
    try:
        from pypinyin import lazy_pinyin
        expected_py = ''.join(lazy_pinyin(norm_expected))
        actual_py = ''.join(lazy_pinyin(norm_actual))

        # 拼音编辑距离相似度
        if len(expected_py) > 0 and len(actual_py) > 0:
            py_overlap = len(set(expected_py) & set(actual_py))
            py_score = py_overlap / max(len(set(expected_py)), len(set(actual_py)))
            # 综合评分
            score = max(char_score, py_score * 0.8)
        else:
            score = char_score
    except ImportError:
        score = char_score

    if score >= 0.5:
        return True, score, f"char_overlap={char_score:.2f}"
    elif score >= 0.2:
        return False, score, f"low_match={score:.2f}"
    else:
        return False, score, f"no_match={score:.2f}"


# ========== B站音频获取 ==========
def get_bilibili_audio_info(bvid, page=1):
    """获取 B站视频的 DASH 音频 URL 和 CID"""
    try:
        # 获取视频信息
        view_url = f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}"
        req = urllib.request.Request(view_url, headers=BILI_HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())

        if data.get("code") != 0:
            return None, None

        pages = data["data"]["pages"]
        target_page = None
        for p in pages:
            if p["page"] == page:
                target_page = p
                break

        if not target_page:
            return None, None

        cid = target_page["cid"]

        # 获取 DASH 播放 URL
        play_url = f"https://api.bilibili.com/x/player/playurl?bvid={bvid}&cid={cid}&fnval=16"
        req = urllib.request.Request(play_url, headers=BILI_HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            pdata = json.loads(resp.read().decode())

        if pdata.get("code") != 0:
            return None, None

        dash = pdata.get("data", {}).get("dash", {})
        audios = dash.get("audio", [])
        if not audios:
            return None, None

        # 选最高码率
        audios.sort(key=lambda a: a.get("bandwidth", 0), reverse=True)
        audio_url = audios[0].get("baseUrl") or audios[0].get("base_url")

        return audio_url, cid
    except Exception as e:
        return None, None


# ========== 音频截取 ==========
def extract_audio_segment(audio_url, start_time, duration=15):
    """
    截取音频片段 → PCM 16kHz mono。
    先 curl 下载音频（带 B站 Headers），再 ffmpeg 从本地文件截取。
    start_time: 开始时间 (秒)
    duration: 截取长度 (秒)
    返回: (PCM audio bytes, sample_rate) 或 (None, None)
    """
    if start_time < 0:
        start_time = 0

    import tempfile, os as _os
    tmpfile = None
    try:
        # Step 1: 用 curl 下载音频头部（带正确的 B站 Headers，ffmpeg 不传这些）
        # B站 CDN URL 可能很快过期，且需要特定 User-Agent + Referer
        download_end = int((start_time + duration + 5) * 16000)  # ~16KB/s
        if download_end < 2000000:
            download_end = 2000000  # 至少 2MB，确保足够的 seek 空间
        tmpfile = '/tmp/lyrics_audio_' + str(_os.getpid()) + '.m4s'
        curl_cmd = [
            'curl', '-sL', '--max-time', '30',
            '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            '-H', 'Referer: https://www.bilibili.com/',
            '-r', f'0-{download_end}',
            audio_url, '-o', tmpfile
        ]
        curl_result = subprocess.run(curl_cmd, timeout=35, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if curl_result.returncode != 0 or not _os.path.exists(tmpfile) or _os.path.getsize(tmpfile) < 10000:
            print(f"    curl failed: exit={curl_result.returncode}, size={_os.path.getsize(tmpfile) if _os.path.exists(tmpfile) else 0}")
            return None, None

        # Step 2: 用 ffmpeg 从本地文件截取并转 PCM
        ffmpeg_cmd = [
            'ffmpeg', '-ss', str(start_time), '-t', str(duration),
            '-i', tmpfile,
            '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1',
            '-loglevel', 'error', '-f', 's16le', 'pipe:1'
        ]
        ffmpeg_result = subprocess.run(ffmpeg_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
        if ffmpeg_result.returncode != 0 or len(ffmpeg_result.stdout) < 1000:
            stderr = ffmpeg_result.stderr.decode('utf-8', errors='replace')
            if stderr:
                print(f"    ffmpeg stderr: {stderr[:200]}")
            return None, None

        return ffmpeg_result.stdout, 16000

    except subprocess.TimeoutExpired:
        print(f"    timeout (curl or ffmpeg)")
        return None, None
    except Exception as e:
        print(f"    error: {e}")
        return None, None
    finally:
        if tmpfile and _os.path.exists(tmpfile):
            try: _os.unlink(tmpfile)
            except: pass


# ========== Supabase 查询 ==========
def supabase_request(path, method="GET", body=None):
    """简单的 Supabase REST API 请求"""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    }

    req = urllib.request.Request(url, method=method)
    for k, v in headers.items():
        req.add_header(k, v)

    if body:
        req.add_header("Content-Type", "application/json")
        req.add_header("Prefer", "return=minimal")
        req.data = json.dumps(body).encode('utf-8')

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read().decode()
            if not content:
                return []
            return json.loads(content)
    except Exception as e:
        return {"error": str(e)}

def get_songs_for_verification(limit=None, ids=None, offset=0):
    """获取需要验证的歌曲"""
    if ids:
        id_list = ",".join(str(i) for i in ids)
        path = f"songs?select=id,title,singer,bvid,page,lrc_text&id=in.({id_list})&limit={len(ids)}"
    else:
        path = f"songs?select=id,title,singer,bvid,page,lrc_text&lrc_text=not.is.null&order=id.asc"
        if limit:
            path += f"&limit={limit}"
        if offset:
            path += f"&offset={offset}"

    return supabase_request(path)

def clear_lyrics(song_id):
    """将歌曲歌词设为 NULL"""
    return supabase_request(f"songs?id=eq.{song_id}", method="PATCH", body={"lrc_text": None})

def update_lrc_text(song_id, lrc_text):
    """更新歌曲歌词 (用于偏移修正)"""
    return supabase_request(f"songs?id=eq.{song_id}", method="PATCH", body={"lrc_text": lrc_text})

def shift_lrc_timestamps(lrc_text, delta_seconds):
    """
    将所有 LRC 时间戳平移 delta_seconds 秒。
    正值 = 延后, 负值 = 提前。
    时间戳不会低于 0。
    """
    if not lrc_text:
        return lrc_text

    def shift_timestamp(m):
        minutes = int(m.group(1))
        seconds = int(m.group(2))
        centi = m.group(3).ljust(2, '0')
        total = minutes * 60 + seconds + int(centi) / 100.0
        new_total = total + delta_seconds
        if new_total < 0:
            new_total = 0
        new_min = int(new_total // 60)
        new_sec = new_total % 60
        return "[%02d:%05.2f]" % (new_min, new_sec)

    time_re = re.compile(r'\[(\d{2}):(\d{2})\.(\d{2,3})\]')
    return time_re.sub(shift_timestamp, lrc_text)

def try_offset_search(audio_url, token, ts, expected_text, max_offset=10, step=2):
    """
    在原始时间戳附近搜索正确的偏移量。
    下载一段覆盖所有偏移范围的音频，然后逐个偏移提取 10 秒窗口做 ASR 识别。

    参数:
        audio_url: B站 DASH 音频 URL
        token: ASR token
        ts: LRC 原始时间戳 (秒)
        expected_text: 预期的歌词文本
        max_offset: 最大搜索偏移 (秒)
        step: 偏移步长 (秒)

    返回: (delta_seconds, score, asr_text) 或 None
    """
    # 偏移列表，按绝对值排序 (最近优先)
    offsets = []
    for i in range(1, max_offset // step + 1):
        off = i * step
        offsets.append(off)
        offsets.append(-off)

    # 计算下载范围：覆盖从 ts-max_offset 到 ts+max_offset+10s 窗口
    max_time_needed = ts + max_offset + 12
    if max_time_needed < 20:
        max_time_needed = 20
    download_bytes = int((max_time_needed + 5) * 16000)
    if download_bytes < 2000000:
        download_bytes = 2000000

    import tempfile as _tempfile
    tmpfile = None
    try:
        # 下载一大段音频
        tmpfile = '/tmp/lyrics_adj_' + str(os.getpid()) + '.m4s'
        curl_cmd = [
            'curl', '-sL', '--max-time', '30',
            '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            '-H', 'Referer: https://www.bilibili.com/',
            '-r', '0-%d' % download_bytes,
            audio_url, '-o', tmpfile
        ]
        curl_result = subprocess.run(curl_cmd, timeout=35, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if curl_result.returncode != 0 or not os.path.exists(tmpfile) or os.path.getsize(tmpfile) < 10000:
            return None

        # 逐个偏移尝试
        for offset in offsets:
            extract_start = ts + offset - 1  # 提前 1 秒
            if extract_start < 0:
                extract_start = 0

            ffmpeg_cmd = [
                'ffmpeg', '-ss', str(extract_start), '-t', '10',
                '-i', tmpfile,
                '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1',
                '-loglevel', 'error', '-f', 's16le', 'pipe:1'
            ]
            ffmpeg_result = subprocess.run(ffmpeg_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
            if ffmpeg_result.returncode != 0 or len(ffmpeg_result.stdout) < 1000:
                continue

            asr_text = recognize_speech(ffmpeg_result.stdout, token)
            if not asr_text:
                continue

            matched, score, detail = compare_texts(expected_text, asr_text)
            if matched:
                return offset, score, asr_text[:50]

        return None
    except Exception:
        return None
    finally:
        if tmpfile and os.path.exists(tmpfile):
            try:
                os.unlink(tmpfile)
            except:
                pass


# ========== 主流程 ==========
def main():
    import argparse
    parser = argparse.ArgumentParser(description="歌词音频验证")
    parser.add_argument("--report", action="store_true", default=False, help="仅生成报告")
    parser.add_argument("--fix", action="store_true", default=True, help="自动清除错误歌词")
    parser.add_argument("--limit", type=int, help="限制检测数量")
    parser.add_argument("--ids", type=str, help="指定歌曲 ID，逗号分隔")
    parser.add_argument("--offset", type=int, default=0, help="跳过前 N 首")
    args = parser.parse_args()

    print("=" * 60)
    print("  歌词音频验证 (ASR-based)")
    print("=" * 60)
    print(f"  Mode: {'FIX' if args.fix else 'REPORT ONLY'}")
    print(f"  ASR Region: {ASR_REGION}")
    print()

    # 1. 获取 ASR Token
    print("[1] Getting ASR token...")
    token = get_asr_token()
    if not token:
        print("  [FAIL] Cannot get ASR token. Check credentials.")
        sys.exit(1)
    print(f"  Token: {token[:20]}...")

    # 2. 获取歌曲
    print("[2] Fetching songs from Supabase...")
    ids = None
    if args.ids:
        ids = [int(x.strip()) for x in args.ids.split(",") if x.strip()]
    songs = get_songs_for_verification(limit=args.limit, ids=ids, offset=args.offset)
    if isinstance(songs, dict) and songs.get("error"):
        print(f"  [FAIL] Supabase error: {songs['error']}")
        sys.exit(1)
    print(f"  Loaded {len(songs)} songs with lyrics")

    # 3. 逐首验证
    print(f"[3] Verifying {len(songs)} songs...")
    print()

    results = {
        "passed": [],      # 歌词正确
        "failed": [],      # 歌词错误
        "skipped": [],     # 无法验证 (API失败等)
        "adjusted": [],    # 偏移已修正
        "errors": [],      # 处理异常
    }

    stats = {"total": len(songs), "verified": 0, "passed": 0, "failed": 0, "skipped": 0, "adjusted": 0}

    for i, song in enumerate(songs):
        sid = song["id"]
        title = song.get("title", "?")
        singer = song.get("singer", "?")
        lrc = song.get("lrc_text", "")

        label = f"[{i+1}/{len(songs)}] #{sid} {title} — {singer}"

        # 解析 LRC — 获取候选行（最多3个，用于回退）
        candidates = parse_lrc_first_line(lrc)
        if not candidates:
            results["skipped"].append({
                "id": sid, "title": title, "singer": singer,
                "reason": "No valid lyric line found in LRC"
            })
            stats["skipped"] += 1
            print(f"{label}")
            print(f"  SKIP: No valid lyric line found")
            continue

        # 获取 B站音频 URL（只需一次）
        bvid = song.get("bvid", "")
        page = song.get("page", 1)
        audio_url, cid = get_bilibili_audio_info(bvid, page)
        if not audio_url:
            results["skipped"].append({
                "id": sid, "title": title, "singer": singer,
                "reason": f"Cannot get B站 audio URL (bvid={bvid}, page={page})"
            })
            stats["skipped"] += 1
            print(f"{label}")
            print(f"  SKIP: Cannot get audio URL")
            continue

        # 逐个尝试候选行
        result = None  # Final result: "passed", "failed", "skipped", "adjusted"
        near_misses = []  # (ci, ts, text, asr_text, score, detail) — 候选行有ASR结果但不匹配
        for ci, (ts, text) in enumerate(candidates):
            # 截取音频片段
            extract_start = max(0, ts - 2)  # 提前 2 秒开始
            audio_data, sr = extract_audio_segment(audio_url, extract_start, 15)
            if not audio_data:
                continue  # 音频提取失败 → 尝试下一个候选行

            # ASR 识别
            asr_text = recognize_speech(audio_data, token)
            if asr_text is None:
                continue  # ASR 失败 → 尝试下一个候选行

            # 对比
            matched, score, detail = compare_texts(text, asr_text)

            if matched:
                results["passed"].append({
                    "id": sid, "title": title, "singer": singer,
                    "expected": text[:50], "actual": asr_text[:50],
                    "score": score, "detail": detail, "timestamp": ts
                })
                stats["passed"] += 1
                tag = "(try %d/%d)" % (ci+1, len(candidates)) if ci > 0 else ""
                print("%s" % label)
                print("  PASS %s (%.0f%%) ts=%.1fs | LRC: \"%s\" | ASR: \"%s\"" % (tag, score*100, ts, text[:40], asr_text[:40]))
                result = "passed"
                break
            elif asr_text:  # ASR 返回了文本但不匹配 → 收集为 near-miss
                near_misses.append((ci, ts, text, asr_text, score, detail))
                continue  # 继续尝试下一个候选行
            # else: ASR 返回空字符串 → 继续尝试下一个候选行

        # --- 所有候选行都未直接匹配，尝试偏移搜索 ---
        if result is None and near_misses:
            # 按分数降序排列，优先尝试最接近的候选行
            near_misses.sort(key=lambda x: x[4], reverse=True)
            print("%s" % label)
            for ci, ts, text, asr_text, score, detail in near_misses:
                tag = "(try %d/%d)" % (ci+1, len(candidates)) if ci > 0 else ""
                print("  NEAR-MISS %s (%.0f%%) ts=%.1fs | LRC: \"%s\" | ASR: \"%s\"" % (tag, score*100, ts, text[:40], asr_text[:40]))
                print("  -> Searching offset...")

                offset_result = try_offset_search(audio_url, token, ts, text)
                if offset_result:
                    delta, adj_score, adj_asr = offset_result
                    # 平移 LRC 时间戳
                    new_lrc = shift_lrc_timestamps(lrc, delta)

                    if args.fix:
                        update_result = update_lrc_text(sid, new_lrc)
                        if isinstance(update_result, dict) and update_result.get("error"):
                            print("    Update failed: %s" % update_result['error'])
                        else:
                            print("    -> LRC shifted by %+.1fs, score=%.0f%% | ASR: \"%s\"" % (delta, adj_score*100, adj_asr[:40]))
                    else:
                        print("    -> [REPORT] Would shift by %+.1fs, score=%.0f%% | ASR: \"%s\"" % (delta, adj_score*100, adj_asr[:40]))

                    results["adjusted"].append({
                        "id": sid, "title": title, "singer": singer,
                        "expected": text[:50], "actual": adj_asr[:50],
                        "score": adj_score, "detail": "offset=%+.1fs" % delta,
                        "timestamp": ts, "delta": delta
                    })
                    stats["adjusted"] += 1
                    stats["verified"] += 1
                    result = "adjusted"
                    break
                else:
                    print("    No offset matched")

        # --- 偏移搜索也失败 → 歌词确实错误 ---
        if result is None and near_misses:
            best_ci, best_ts, best_text, best_asr, best_score, best_detail = near_misses[0]
            tag = "(try %d/%d)" % (best_ci+1, len(candidates)) if best_ci > 0 else ""
            # 如果偏移搜索过程中没打印过 label（理论上不会，但保险起见）
            print("  FAIL %s (%.0f%%) ts=%.1fs | LRC: \"%s\" | ASR: \"%s\"" % (tag, best_score*100, best_ts, best_text[:40], best_asr[:40]))

            results["failed"].append({
                "id": sid, "title": title, "singer": singer,
                "expected": best_text[:50], "actual": best_asr[:50],
                "score": best_score, "detail": best_detail, "timestamp": best_ts
            })
            stats["failed"] += 1

            # 如果开了 --fix，清除歌词
            if args.fix:
                clear_result = clear_lyrics(sid)
                if isinstance(clear_result, dict) and clear_result.get("error"):
                    print("    Clear failed: %s" % clear_result['error'])
                else:
                    print("    -> Lyrics cleared (set to NULL)")
            result = "failed"

        if result is None:
            # 所有候选行的 ASR 都返回空字符串或音频提取失败
            results["skipped"].append({
                "id": sid, "title": title, "singer": singer,
                "reason": "All ASR returned empty (likely instrumental intro)"
            })
            stats["skipped"] += 1
            print("%s" % label)
            print("  SKIP: All lines ASR returned empty")

        if result in ("passed", "failed", "adjusted"):
            stats["verified"] += 1

        # 限速
        time.sleep(0.5)

    # 4. 汇总报告
    print()
    print("=" * 60)
    print("  VERIFICATION SUMMARY")
    print("=" * 60)
    print(f"  Total:       {stats['total']}")
    print(f"  Verified:    {stats['verified']}")
    print(f"  Passed:      {stats['passed']} ({stats['passed']/max(stats['verified'],1)*100:.0f}%)")
    print(f"  Adjusted:    {stats['adjusted']} ({stats['adjusted']/max(stats['verified'],1)*100:.0f}%)")
    print(f"  Failed:      {stats['failed']} ({stats['failed']/max(stats['verified'],1)*100:.0f}%)")
    print(f"  Skipped:     {stats['skipped']}")

    # 写入 JSON 报告
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "config": {
            "mode": "fix" if args.fix else "report",
            "asr_region": ASR_REGION,
        },
        "stats": stats,
        "results": results,
    }

    report_path = "lyrics_verify_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\n  Report saved: {report_path}")

    if args.fix:
        cleared_path = "lyrics_cleared_ids.json"
        cleared_ids = [r["id"] for r in results["failed"]]
        adjusted_ids = [r["id"] for r in results["adjusted"]]
        with open(cleared_path, "w", encoding="utf-8") as f:
            json.dump({"cleared": cleared_ids, "adjusted": adjusted_ids}, f, ensure_ascii=False)
        print(f"  Cleared IDs: {cleared_path} ({len(cleared_ids)} cleared + {len(adjusted_ids)} adjusted)")

    # 打印调整详情
    if results["adjusted"]:
        print(f"\n  Adjusted songs (offset fixed):")
        for r in results["adjusted"]:
            print(f"    #{r['id']} {r['title']} — {r['singer']}")
            print(f"      Original ts: {r['timestamp']:.1f}s | Delta: {r['delta']:+.1f}s")
            print(f"      Expected: {r['expected']}")
            print(f"      ASR got:  {r['actual']}")

    # 打印失败详情
    if results["failed"]:
        print(f"\n  Failed songs:")
        for r in results["failed"]:
            print(f"    #{r['id']} {r['title']} — {r['singer']}")
            print(f"      Expected: {r['expected']}")
            print(f"      ASR got:  {r['actual']}")
            print(f"      Score: {r['score']:.0%} | {r['detail']}")

if __name__ == "__main__":
    main()
