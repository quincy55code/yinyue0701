#!/bin/bash
# Wrapper to run verify_lyrics_audio.py with Supabase key from base64 file
KEY=$(python3 -c "import base64; print(base64.b64decode(open('/tmp/key_b64.txt').read().strip()).decode())")
export SUPABASE_SERVICE_ROLE_KEY="$KEY"
exec python3 /root/verify_lyrics_audio.py "$@"
