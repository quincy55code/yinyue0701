"""
Fix ECS verify_lyrics_audio.py to hardcode Supabase credentials.
Uses Alibaba Cloud RunCommand API.
"""
import os, sys, time, json, hmac, hashlib, base64, string, urllib.request, urllib.parse
from datetime import datetime, timezone

ACCESS_KEY_ID = "LTAI5tXXXXXXXXXXXXX"
ACCESS_KEY_SECRET = "DoPffXXXXXXXXXXXXXXXXX"
INSTANCE_ID = "i-bp18v2inztg7q1wuwgp9"
REGION = "cn-hangzhou"

# Read Supabase key from local .env or hardcoded
SUPABASE_URL = "https://orphftlwdwuvoscizndx.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ycGhmdGx3ZHd1dm9zY2l6bmR4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTkyNDA4OSwiZXhwIjoyMDk3NTAwMDg5fQ.jDg11vKVIkCYsFPN5T6aLdU08cRx-FXSeZVfRJmi4mo"

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
    canonical_parts = [f"{percent_encode(k)}={percent_encode(v)}" for k, v in sorted_params]
    canonical = '&'.join(canonical_parts)
    string_to_sign = f"{method}&{percent_encode('/')}&{percent_encode(canonical)}"
    key = (secret + "&").encode('utf-8')
    signature = base64.b64encode(
        hmac.new(key, string_to_sign.encode('utf-8'), hashlib.sha1).digest()
    ).decode('utf-8')
    return signature

def call_ecs_api(action, extra_params=None):
    params = {
        "Action": action, "Format": "JSON", "Version": "2014-05-26",
        "AccessKeyId": ACCESS_KEY_ID, "SignatureMethod": "HMAC-SHA1",
        "SignatureVersion": "1.0",
        "SignatureNonce": str(int(time.time() * 1000000)),
        "Timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "RegionId": REGION,
    }
    if extra_params:
        params.update(extra_params)
    signature = sign_request(params, ACCESS_KEY_SECRET, "POST")
    params["Signature"] = signature

    body = urllib.parse.urlencode(params).encode('utf-8')
    req = urllib.request.Request("https://ecs.aliyuncs.com/", data=body, method='POST')
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode())

def run_command(command, timeout="60"):
    result = call_ecs_api("RunCommand", {
        "InstanceId.1": INSTANCE_ID,
        "Type": "RunShellScript",
        "CommandContent": command,
        "Timeout": timeout,
    })
    if "InvokeId" not in result:
        print(f"  RunCommand error: {result.get('Code')}: {result.get('Message')}")
        return False, str(result)

    invoke_id = result["InvokeId"]
    print(f"  InvokeId: {invoke_id}, waiting...")

    for i in range(20):
        time.sleep(3)
        status_result = call_ecs_api("DescribeInvocationResults", {
            "InstanceId": INSTANCE_ID, "InvokeId": invoke_id,
        })
        results = status_result.get("Invocation", {}).get("InvocationResults", {}).get("InvocationResult", [])
        if results:
            for r in results:
                status = r.get("InvocationStatus")
                output = base64.b64decode(r.get("Output", "") or "").decode('utf-8', errors='replace')
                if status in ("Finished", "Success"):
                    return True, output
                if status == "Failed":
                    return False, output
    return False, "Timeout"

print("Fixing Supabase config on ECS...")

# Python command to fix both URL and KEY in the script
fix_cmd = f'''python3 -c "
c = open('/root/verify_lyrics_audio.py').read()
# Fix URL
c = c.replace('SUPABASE_URL = os.environ.get(\\\"SUPABASE_URL\\\", \\\"\\\")', 'SUPABASE_URL = os.environ.get(\\\"SUPABASE_URL\\\", \\\"{SUPABASE_URL}\\\")')
# Fix KEY
c = c.replace('SUPABASE_SERVICE_KEY = os.environ.get(\\\"SUPABASE_SERVICE_ROLE_KEY\\\", \\\"\\\")', 'SUPABASE_SERVICE_KEY = os.environ.get(\\\"SUPABASE_SERVICE_ROLE_KEY\\\", \\\"{SUPABASE_KEY}\\\")')
open('/root/verify_lyrics_audio.py', 'w').write(c)
# Verify
v = open('/root/verify_lyrics_audio.py').read()
if 'SUPABASE_URL = os.environ.get(\\\"SUPABASE_URL\\\", \\\"https://' in v and 'SUPABASE_SERVICE_KEY = os.environ.get(\\\"SUPABASE_SERVICE_ROLE_KEY\\\", \\\"eyJ' in v:
    print('CONFIG_OK')
else:
    print('CONFIG_FAIL')
"
'''

print(f"  Command length: {len(fix_cmd)} chars")
ok, out = run_command(fix_cmd, "60")
print(f"  OK: {ok}, Output: {out[:500]}")
