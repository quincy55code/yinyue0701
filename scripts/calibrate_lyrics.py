"""
calibrate_lyrics.py — 歌词校准：用 whisper 给已有歌词重新打时间戳
==============================================================
用法: python scripts/calibrate_lyrics.py --limit=10

流程:
  1. 从 Supabase 取已有 LRC 的歌曲
  2. 从 LRC 提取纯文本歌词（去掉时间戳）
  3. 下载 B站 DASH 音频
  4. faster-whisper 转写 → 获取准确时间戳
  5. 歌词文本 + whisper时间戳 → 匹配校正
  6. 生成校准后 LRC → 上传 Supabase
"""

import os
import sys
import json
import re
import time
import urllib.request
import urllib.error
import subprocess
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.parent
OUTPUT_DIR = Path(os.path.expanduser('~')) / 'Desktop' / '单首歌词' / 'calibrate_output'
LYRICS_TXT_DIR = Path(os.path.expanduser('~')) / 'Desktop' / '单首歌词' / 'lyrics_txt'

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
LYRICS_TXT_DIR.mkdir(parents=True, exist_ok=True)

# ========== 加载 .env ==========
ENV_PATH = SCRIPT_DIR / '.env'
SUPABASE_URL = None
SUPABASE_KEY = None
if ENV_PATH.exists():
    with open(ENV_PATH, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'): continue
            if '=' in line:
                k, v = line.split('=', 1)
                k, v = k.strip(), v.strip()
                if k == 'SUPABASE_URL': SUPABASE_URL = v
                elif k == 'SUPABASE_SERVICE_ROLE_KEY': SUPABASE_KEY = v

if not SUPABASE_URL or not SUPABASE_KEY:
    print('[ERROR] Missing env vars'); sys.exit(1)

SUPABASE_HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}

BILI_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://www.bilibili.com/',
}

def get_ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return 'ffmpeg'
FFMPEG = get_ffmpeg()


def fetch_json(url, timeout=20):
    req = urllib.request.Request(url, headers=BILI_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        print(f'    HTTP error: {e}')
        return None


def get_songs_with_lrc(limit=10, offset=0):
    """Get songs that have LRC from Supabase"""
    url = f'{SUPABASE_URL}/rest/v1/songs?select=id,title,singer,bvid,page,duration_seconds,lrc_text&lrc_text=not.is.null&order=id.asc&limit={limit}&offset={offset}'
    req = urllib.request.Request(url, headers={
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        print(f'Query error: {e}')
        return []


def extract_plain_lyrics(lrc_text):
    """Extract plain text lyrics from LRC (strip timestamps and metadata)"""
    lines = []
    time_re = re.compile(r'\[\d{2}:\d{2}\.\d{2,3}\]')
    for line in lrc_text.split('\n'):
        # Skip metadata tags
        if line.startswith('[ti:') or line.startswith('[ar:') or \
           line.startswith('[by:') or line.startswith('[al:') or \
           line.startswith('[offset:') or line.startswith('[length:'):
            continue
        # Remove timestamps
        text = time_re.sub('', line).strip()
        # Skip empty lines and pure punctuation
        if text and len(text) >= 1:
            lines.append(text)
    return lines


def get_page_info(bvid, page):
    """Get video info and specific page CID"""
    url = f'https://api.bilibili.com/x/web-interface/view?bvid={bvid}'
    data = fetch_json(url)
    if not data or data.get('code') != 0: return None

    pages = data['data'].get('pages', [])
    for p in pages:
        if p.get('page') == page:
            return {'cid': p['cid'], 'title': p.get('part', ''), 'duration': p.get('duration', 0)}
    # Fallback to first page
    if pages:
        return {'cid': pages[0]['cid'], 'title': pages[0].get('part', ''), 'duration': pages[0].get('duration', 0)}
    return None


def get_dash_audio_url(bvid, cid):
    """Get DASH audio URL"""
    url = f'https://api.bilibili.com/x/player/wbi/playurl?bvid={bvid}&cid={cid}&fnval=16&fnver=0&fourk=1'
    data = fetch_json(url)
    if not data or data.get('code') != 0:
        print(f'    Playurl error: {data.get("message") if data else "unknown"}')
        return None
    audio = data['data'].get('dash', {}).get('audio', [])
    if not audio: return None
    audio.sort(key=lambda x: x.get('bandwidth', 0), reverse=True)
    return audio[0]['baseUrl']


def download_file(url, path, timeout=120):
    req = urllib.request.Request(url, headers=BILI_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            with open(path, 'wb') as f:
                while True:
                    chunk = resp.read(65536)
                    if not chunk: break
                    f.write(chunk)
        return True
    except Exception as e:
        print(f'    Download error: {e}')
        return False


def extract_wav(input_path, output_wav):
    cmd = [FFMPEG, '-y', '-i', str(input_path), '-ac', '1', '-ar', '16000', '-sample_fmt', 's16', str(output_wav)]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    return result.returncode == 0


def transcribe_whisper(wav_path, model_size='small'):
    from faster_whisper import WhisperModel
    print(f'    Loading {model_size} model...')
    model = WhisperModel(model_size, device='cpu', compute_type='int8')
    print(f'    Transcribing...')
    segments, info = model.transcribe(str(wav_path), language='zh', beam_size=5, word_timestamps=True)
    print(f'    Language: {info.language} (p={info.language_probability:.2f})')
    results = [{'start': s.start, 'end': s.end, 'text': s.text.strip()} for s in segments]
    return results


def filter_noise(segments):
    clean = []
    for seg in segments:
        text = seg['text']
        ascii_chars = sum(1 for c in text if ord(c) < 128)
        ascii_ratio = ascii_chars / max(len(text), 1)
        has_chinese = any('一' <= c <= '鿿' for c in text)
        if ascii_ratio > 0.5 and not has_chinese: continue
        if len(text) <= 2 and not has_chinese: continue
        clean.append(seg)
    return clean


def match_lyrics_to_segments(segments, correct_lyrics):
    """Map correct lyrics text to whisper time segments

    Strategy:
    - If counts match → 1:1 mapping
    - If counts differ → distribute lyrics evenly across the time span
    """
    if len(segments) == len(correct_lyrics):
        print(f'    Perfect match: {len(segments)} segments = {len(correct_lyrics)} lyrics')
        for seg, text in zip(segments, correct_lyrics):
            seg['text'] = text
        return segments

    print(f'    Mismatch: {len(segments)} segments vs {len(correct_lyrics)} lyrics → distributing')
    total_start = segments[0]['start']
    total_end = segments[-1]['end']
    total_dur = total_end - total_start
    n = len(correct_lyrics)

    new_segments = []
    for i, text in enumerate(correct_lyrics):
        start = total_start + (total_dur * i / n)
        end = total_start + (total_dur * (i + 1) / n)
        new_segments.append({'start': start, 'end': end, 'text': text})
    return new_segments


def generate_lrc(segments, title='', singer=''):
    lines = []
    if title: lines.append(f'[ti:{title}]')
    if singer: lines.append(f'[ar:{singer}]')
    lines.append('[by:lyrics-calibrator]')
    lines.append('')
    for seg in segments:
        m = int(seg['start']) // 60
        s = int(seg['start']) % 60
        h = int((seg['start'] - int(seg['start'])) * 100)
        lines.append(f'[{m:02d}:{s:02d}.{h:02d}]{seg["text"]}')
    return '\n'.join(lines)


def upload_lrc(song_id, lrc_text):
    url = f'{SUPABASE_URL}/rest/v1/songs?id=eq.{song_id}'
    data = json.dumps({'lrc_text': lrc_text}).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=SUPABASE_HEADERS, method='PATCH')
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status in (200, 201, 204)
    except Exception as e:
        print(f'    Upload error: {e}')
        return False


def calibrate_song(song, model_size='small'):
    sid = song['id']
    title = song.get('title', '')
    singer = song.get('singer', '')
    bvid = song.get('bvid', '')
    page = song.get('page', 1)
    old_lrc = song.get('lrc_text', '')

    print(f'\n{"="*55}')
    print(f'  ID {sid}: {title} - {singer}')
    print(f'  BV: {bvid}, Page: {page}')
    print(f'{"="*55}')

    # Step 1: Extract plain lyrics from old LRC
    print('  [1/5] Extracting plain lyrics...')
    plain_lyrics = extract_plain_lyrics(old_lrc)
    print(f'    {len(plain_lyrics)} lines extracted')

    if len(plain_lyrics) < 3:
        print('  [FAIL] Too few lyrics lines')
        return False

    # Save lyrics txt
    lyrics_file = LYRICS_TXT_DIR / f'{sid}_lyrics.txt'
    with open(lyrics_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(plain_lyrics))

    # Step 2: Get page info
    print('  [2/5] Getting page info...')
    info = get_page_info(bvid, page)
    if not info:
        print('  [FAIL] Cannot get page info')
        return False
    cid = info['cid']
    print(f'    CID: {cid}')

    # Step 3: Download audio
    print('  [3/5] Downloading audio...')
    audio_file = OUTPUT_DIR / f'{sid}_{bvid}_p{page}.m4a'
    wav_file = OUTPUT_DIR / f'{sid}_{bvid}_p{page}.wav'

    if not audio_file.exists():
        audio_url = get_dash_audio_url(bvid, cid)
        if not audio_url:
            print('  [FAIL] Cannot get audio URL')
            return False
        if not download_file(audio_url, audio_file):
            print('  [FAIL] Download failed')
            return False
        size_mb = os.path.getsize(audio_file) / 1024 / 1024
        print(f'    Downloaded: {size_mb:.1f} MB')
    else:
        print(f'    Audio cached: {audio_file.name}')

    # Step 4: Extract WAV + Whisper
    print('  [4/5] Whisper transcription...')
    if not wav_file.exists():
        if not extract_wav(audio_file, wav_file):
            print('  [FAIL] Audio extraction failed')
            return False

    segments = transcribe_whisper(wav_file, model_size)
    if not segments:
        print('  [FAIL] No transcription')
        return False

    segments = filter_noise(segments)
    print(f'    {len(segments)} valid segments after filtering')

    # Step 5: Match lyrics + Generate LRC + Upload
    print('  [5/5] Matching lyrics + uploading...')
    calibrated = match_lyrics_to_segments(segments, plain_lyrics)
    new_lrc = generate_lrc(calibrated, title, singer)

    # Save locally
    lrc_file = OUTPUT_DIR / f'{sid}_{title}_calibrated.lrc'
    with open(lrc_file, 'w', encoding='utf-8') as f:
        f.write(new_lrc)

    lines = len([l for l in new_lrc.split('\n') if re.search(r'\[\d{2}:\d{2}\.\d{2}\]', l)])
    print(f'    Calibrated LRC: {lines} lines → {lrc_file.name}')

    if upload_lrc(sid, new_lrc):
        print(f'  [OK] Uploaded!')
        # Clean up
        if audio_file.exists(): audio_file.unlink()
        return True
    else:
        print(f'  [FAIL] Upload failed')
        return False


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Calibrate LRC lyrics with whisper timestamps')
    parser.add_argument('--limit', type=int, default=10, help='Number of songs')
    parser.add_argument('--offset', type=int, default=0, help='Start offset')
    parser.add_argument('--model', default='small', choices=['tiny','base','small','medium'])
    args = parser.parse_args()

    print(f'Fetching {args.limit} songs with LRC (offset={args.offset})...')
    songs = get_songs_with_lrc(args.limit, args.offset)
    print(f'Got {len(songs)} songs\n')

    ok = 0
    fail = 0
    for i, song in enumerate(songs):
        print(f'\n[{i+1}/{len(songs)}]')
        try:
            if calibrate_song(song, args.model):
                ok += 1
            else:
                fail += 1
        except Exception as e:
            print(f'  [ERROR] {e}')
            fail += 1
        time.sleep(1)

    print(f'\n{"="*55}')
    print(f'  Calibration complete: OK {ok} | FAIL {fail}')
    print(f'{"="*55}')


if __name__ == '__main__':
    main()
