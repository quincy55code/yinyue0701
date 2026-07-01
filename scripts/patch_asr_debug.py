"""Patch verify_lyrics_audio.py to add ASR debug logging"""
import re

with open("/root/verify_lyrics_audio.py", "r") as f:
    content = f.read()

old = '''            with urllib.request.urlopen(req, timeout=20) as resp:
                result = json.loads(resp.read().decode())
                if result.get("status") == 20000000:
                    return result.get("result", "")
                else:
                    if attempt < max_retries - 1:
                        time.sleep(1)
                    continue'''

new = '''            with urllib.request.urlopen(req, timeout=20) as resp:
                raw = resp.read().decode()
                result = json.loads(raw)
                status = result.get("status")
                if status == 20000000:
                    return result.get("result", "")
                else:
                    print(f"    ASR status={status}, msg={result.get('status_text', '?')}, result={result.get('result', '?')[:80]}")
                    if attempt < max_retries - 1:
                        time.sleep(1)
                    continue'''

if old in content:
    content = content.replace(old, new)
    with open("/root/verify_lyrics_audio.py", "w") as f:
        f.write(content)
    print("PATCHED: recognize_speech debug logging added")
else:
    print("NOT FOUND: old pattern not in file")
    # Show current recognize_speech function
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if 'def recognize_speech' in line:
            for j in range(i, min(i+25, len(lines))):
                print(f"{j+1}: {lines[j]}")
            break
