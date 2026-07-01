"""Read Supabase key from .env and send to ECS via SSH"""
import os, subprocess, base64

# Read key from .env
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
supabase_key = None
with open(env_path) as f:
    for line in f:
        if line.startswith('SUPABASE_SERVICE_ROLE_KEY='):
            supabase_key = line.split('=', 1)[1].strip()
            break

if not supabase_key:
    print("ERROR: SUPABASE_SERVICE_ROLE_KEY not found in .env")
    exit(1)

print(f"Key length: {len(supabase_key)}")

# Write key to ECS via SSH, using base64 to avoid shell escaping issues
key_b64 = base64.b64encode(supabase_key.encode()).decode()
print(f"Base64 length: {len(key_b64)}")

# Step 1: Write base64-encoded key to ECS
cmd1 = f'ssh -o StrictHostKeyChecking=no root@121.41.45.199 "echo {key_b64} > /tmp/key_b64.txt"'
print("Writing key to ECS...")
r = subprocess.run(cmd1, shell=True, capture_output=True, timeout=15)
print(f"  stdout: {r.stdout.decode()}")
print(f"  stderr: {r.stderr.decode()}")
print(f"  returncode: {r.returncode}")

# Step 2: Decode and fix the Python script
cmd2 = '''ssh -o StrictHostKeyChecking=no root@121.41.45.199 'python3 -c "
import base64
key = base64.b64decode(open(\"/tmp/key_b64.txt\").read().strip()).decode()
c = open(\"/root/verify_lyrics_audio.py\").read()
c = c.replace(\"KEY_PLACEHOLDER\", key)
open(\"/root/verify_lyrics_audio.py\", \"w\").write(c)
print(\"KEY FIXED, len=\" + str(len(key)))
"' '''
print("Fixing script on ECS...")
r = subprocess.run(cmd2, shell=True, capture_output=True, timeout=15)
print(f"  stdout: {r.stdout.decode()}")
print(f"  stderr: {r.stderr.decode()}")

# Step 3: Verify
cmd3 = 'ssh -o StrictHostKeyChecking=no root@121.41.45.199 "grep -c \\"eyJhbGci\\" /root/verify_lyrics_audio.py"'
print("Verifying...")
r = subprocess.run(cmd3, shell=True, capture_output=True, timeout=10)
print(f"  JWT occurrences: {r.stdout.decode().strip()}")
print("Done!")
