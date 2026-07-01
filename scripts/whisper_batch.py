"""
whisper_batch.py — 批量 whisper 转写剩余缺歌词歌曲
==================================================
优化：直接下载 B站 DASH 音频（不下载视频），转写后上传
用法: python scripts/whisper_batch.py [--limit=N]
"""

import os
import sys
import json
import re
import time
import struct
import hashlib
import urllib.request
import urllib.parse
import subprocess
import tempfile
from pathlib import Path

# ========== 路径配置 ==========
SCRIPT_DIR = Path(__file__).parent.parent
FAILED_FILE = SCRIPT_DIR / 'scripts' / 'batch_lyrics_failed.json'
OUTPUT_DIR = Path(os.path.expanduser('~')) / 'Desktop' / '单首歌词' / 'output'
WHISPER_DIR = Path(os.path.expanduser('~')) / 'Desktop' / '单首歌词' / 'whisper_output'

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
WHISPER_DIR.mkdir(parents=True, exist_ok=True)

# ========== 加载 .env ==========
ENV_PATH = SCRIPT_DIR / '.env'
SUPABASE_URL = None
SUPABASE_KEY = None

if ENV_PATH.exists():
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
    print('[ERROR] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    sys.exit(1)

SUPABASE_HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}

BILI_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com/',
}

# ffmpeg path
def get_ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return 'ffmpeg'

FFMPEG = get_ffmpeg()


def fetch_json(url, headers=None, timeout=20):
    """HTTP GET and parse JSON"""
    req = urllib.request.Request(url, headers=headers or BILI_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        print(f'    HTTP error: {e}')
        return None


def get_bvid_page_info(bvid):
    """Get video info and pagelist from B站 API"""
    url = f'https://api.bilibili.com/x/web-interface/view?bvid={bvid}'
    data = fetch_json(url)
    if not data or data.get('code') != 0:
        return None
    return data['data']


def get_dash_audio_url(bvid, cid):
    """Get DASH audio URL for a specific video/page"""
    # Build query with WBI signing
    url = f'https://api.bilibili.com/x/player/wbi/playurl?bvid={bvid}&cid={cid}&fnval=16&fnver=0&fourk=1'
    data = fetch_json(url)
    if not data or data.get('code') != 0:
        print(f'    Playurl API error: {data.get("message") if data else "unknown"}')
        return None

    dash = data['data'].get('dash', {})
    audio_tracks = dash.get('audio', [])
    if not audio_tracks:
        print('    No DASH audio tracks found')
        return None

    # Sort by bandwidth descending, pick highest quality
    audio_tracks.sort(key=lambda x: x.get('bandwidth', 0), reverse=True)
    best = audio_tracks[0]
    return best['baseUrl']


def download_file(url, output_path, timeout=120):
    """Download a file"""
    req = urllib.request.Request(url, headers=BILI_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            total = int(resp.headers.get('Content-Length', 0))
            downloaded = 0
            with open(output_path, 'wb') as f:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
            size_mb = os.path.getsize(output_path) / 1024 / 1024
            print(f'    Downloaded: {size_mb:.1f} MB')
            return True
    except Exception as e:
        print(f'    Download error: {e}')
        return False


def extract_audio_wav(input_path, output_wav):
    """Convert audio to WAV 16kHz mono for whisper"""
    cmd = [FFMPEG, '-y', '-i', str(input_path), '-ac', '1', '-ar', '16000', '-sample_fmt', 's16', str(output_wav)]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if result.returncode != 0:
        print(f'    ffmpeg error: {result.stderr[:200]}')
        return False
    size_mb = os.path.getsize(output_wav) / 1024 / 1024
    print(f'    WAV: {size_mb:.1f} MB')
    return True


def transcribe_whisper(wav_path, model_size='small'):
    """Run faster-whisper transcription"""
    from faster_whisper import WhisperModel

    print(f'    Loading model: {model_size}...')
    model = WhisperModel(model_size, device='cpu', compute_type='int8')

    print(f'    Transcribing...')
    segments, info = model.transcribe(
        str(wav_path),
        language='zh',
        beam_size=5,
        word_timestamps=True,
    )

    print(f'    Language: {info.language} (p={info.language_probability:.2f})')

    results = []
    for seg in segments:
        results.append({
            'start': seg.start,
            'end': seg.end,
            'text': seg.text.strip(),
        })

    return results


def filter_noise(segments):
    """Filter hallucinated/non-speech segments"""
    clean = []
    for seg in segments:
        text = seg['text']
        ascii_chars = sum(1 for c in text if ord(c) < 128)
        ascii_ratio = ascii_chars / max(len(text), 1)

        is_noise = False
        if ascii_ratio > 0.5 and len([c for c in text if '一' <= c <= '鿿']) == 0:
            is_noise = True
        elif len(text) <= 2 and not any('一' <= c <= '鿿' for c in text):
            is_noise = True

        if not is_noise:
            clean.append(seg)

    print(f'    Filtered: {len(segments)} -> {len(clean)} segments ({len(segments) - len(clean)} noise removed)')
    return clean


def generate_lrc(segments, title=''):
    """Generate LRC format"""
    lines = []
    if title:
        lines.append(f'[ti:{title}]')
    lines.append('[ar:B站音乐视频]')
    lines.append('[by:whisper-batch]')
    lines.append('')

    for seg in segments:
        minutes = int(seg['start']) // 60
        seconds = int(seg['start']) % 60
        hundredths = int((seg['start'] - int(seg['start'])) * 100)
        timestamp = f'[{minutes:02d}:{seconds:02d}.{hundredths:02d}]'
        lines.append(f'{timestamp}{seg["text"]}')

    return '\n'.join(lines)


def upload_to_supabase(song_id, lrc_text):
    """Upload LRC to Supabase"""
    url = f'{SUPABASE_URL}/rest/v1/songs?id=eq.{song_id}'
    data = json.dumps({'lrc_text': lrc_text}).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=SUPABASE_HEADERS, method='PATCH')
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status in (200, 201, 204)
    except Exception as e:
        print(f'    Upload error: {e}')
        return False


def process_song(song, model_size='small'):
    """Process one song through the full pipeline"""
    sid = song['id']
    title = song.get('title', '')
    singer = song.get('singer', '')
    bvid = song.get('bvid', '')
    page = song.get('page', 1)

    print(f'\n{"="*50}')
    print(f'  ID {sid}: {title} - {singer}')
    print(f'  BV: {bvid}, Page: {page}')
    print(f'{"="*50}')

    if not bvid:
        print('  [SKIP] No BV号')
        return False

    # Step 1: Get video info
    print('  [1/5] Getting video info...')
    info = get_bvid_page_info(bvid)
    if not info:
        print('  [FAIL] Cannot get video info')
        return False

    pages = info.get('pages', [])
    if not pages:
        print('  [FAIL] No pages found')
        return False

    # Find the right page
    target_page = None
    for p in pages:
        if p.get('page') == page:
            target_page = p
            break
    if not target_page:
        # Use first page if specific page not found
        target_page = pages[0]
        print(f'    Using page {target_page["page"]} (requested {page})')

    cid = target_page.get('cid')
    page_title = target_page.get('part', title)
    print(f'    Page: {page_title} (cid={cid})')

    # Step 2: Get DASH audio URL
    print('  [2/5] Getting audio URL...')
    audio_url = get_dash_audio_url(bvid, cid)
    if not audio_url:
        print('  [FAIL] Cannot get audio URL')
        return False

    # Step 3: Download audio
    print('  [3/5] Downloading audio...')
    audio_file = WHISPER_DIR / f'{sid}_{bvid}_p{page}.m4a'
    if audio_file.exists():
        print(f'    Audio already exists: {audio_file.name}')
    else:
        if not download_file(audio_url, audio_file):
            print('  [FAIL] Download failed')
            return False

    # Step 4: Convert to WAV and transcribe
    wav_file = WHISPER_DIR / f'{sid}_{bvid}_p{page}.wav'
    if not wav_file.exists():
        print('  [4/5] Extracting audio + transcribing...')
        if not extract_audio_wav(audio_file, wav_file):
            print('  [FAIL] Audio extraction failed')
            return False

        segments = transcribe_whisper(wav_file, model_size)
        if not segments:
            print('  [FAIL] Transcription produced no results')
            return False

        segments = filter_noise(segments)
    else:
        print('  [4/5] WAV exists, transcribing...')
        segments = transcribe_whisper(wav_file, model_size)
        if not segments:
            print('  [FAIL] Transcription produced no results')
            return False
        segments = filter_noise(segments)

    # Step 5: Generate LRC and upload
    print('  [5/5] Generating LRC and uploading...')
    lrc = generate_lrc(segments, f'{title} - {singer}')

    # Save locally
    lrc_file = WHISPER_DIR / f'{sid}_{title}.lrc'
    with open(lrc_file, 'w', encoding='utf-8') as f:
        f.write(lrc)

    lines = len([l for l in lrc.split('\n') if re.search(r'\[\d{2}:\d{2}\.\d{2}\]', l)])
    print(f'    LRC: {lines} lines -> {lrc_file.name}')

    ok = upload_to_supabase(sid, lrc)
    if ok:
        print(f'  [OK] Uploaded to Supabase!')
        # Clean up audio files to save space
        if audio_file.exists():
            audio_file.unlink()
        return True
    else:
        print(f'  [FAIL] Upload failed')
        return False


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Batch whisper lyrics extraction')
    parser.add_argument('--limit', type=int, default=0, help='Max songs to process (0=all)')
    parser.add_argument('--model', default='small', choices=['tiny', 'base', 'small', 'medium'], help='Whisper model')
    parser.add_argument('--start', type=int, default=0, help='Start index')
    args = parser.parse_args()

    if not FAILED_FILE.exists():
        print('No failed songs file found.')
        return

    with open(FAILED_FILE, 'r', encoding='utf-8') as f:
        failed = json.load(f)

    # Filter: only songs with bvid and without _plainLyrics for -l
    songs = [s for s in failed if s.get('bvid')]

    if args.start > 0:
        songs = songs[args.start:]

    if args.limit > 0:
        songs = songs[:args.limit]

    print(f'Processing {len(songs)} songs with whisper ({args.model} model)')
    print(f'Output: {WHISPER_DIR}\n')

    success = 0
    still_failed = []

    for i, song in enumerate(songs):
        print(f'\n[{i+1}/{len(songs)}]')
        try:
            ok = process_song(song, args.model)
            if ok:
                success += 1
            else:
                still_failed.append(song)
        except Exception as e:
            print(f'  [ERROR] {e}')
            still_failed.append(song)

        # Brief pause between songs
        time.sleep(2)

    # Save remaining failures
    with open(FAILED_FILE, 'w', encoding='utf-8') as f:
        json.dump(still_failed, f, ensure_ascii=False, indent=2)

    print(f'\n{"="*60}')
    print(f'  Whisper batch complete: OK {success} | FAIL {len(still_failed)}')
    print(f'  Remaining: {FAILED_FILE}')
    print(f'{"="*60}')


if __name__ == '__main__':
    main()
