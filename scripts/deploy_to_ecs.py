"""
deploy_to_ecs.py — 一键部署歌词验证到 ECS
=========================================
1. 传输 verify_lyrics_audio.py 到 ECS
2. 传输 .env 到 ECS
3. 安装所需依赖

用法: python deploy_to_ecs.py
"""
import os
import sys
import time
import json
import hmac
import hashlib
import base64
import string
import urllib.request
import urllib.parse
from datetime import datetime, timezone

# ========== 阿里云 API 配置 ==========
ACCESS_KEY_ID = "LTAI5tXXXXXXXXXXXXX"
ACCESS_KEY_SECRET = "DoPffXXXXXXXXXXXXXXXXX"
INSTANCE_ID = "i-bp18v2inztg7q1wuwgp9"  # IP 121.41.45.199
REGION = "cn-hangzhou"

# ========== 阿里云 API 签名 (已验证可用) ==========
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

def run_command(command, timeout="120"):
    """在 ECS 上执行命令并等待完成"""
    result = call_ecs_api("RunCommand", {
        "InstanceId.1": INSTANCE_ID,
        "Type": "RunShellScript",
        "CommandContent": command,
        "Timeout": timeout,
    })
    if "InvokeId" not in result:
        print(f"  [FAIL] RunCommand error: {result.get('Code')}: {result.get('Message')}")
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
                output = base64.b64decode(r.get("Output", "")).decode('utf-8', errors='replace')
                if status in ("Finished", "Success"):
                    return True, output
                if status == "Failed":
                    return False, output
    return False, "Timeout"


def main():
    # 读取本地文件
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.join(script_dir, "..")

    # 1. 读取并 base64 编码验证脚本
    py_path = os.path.join(script_dir, "verify_lyrics_audio.py")
    with open(py_path, 'rb') as f:
        py_content_b64 = base64.b64encode(f.read()).decode('utf-8')

    # 2. 读取 .env
    env_path = os.path.join(project_dir, ".env")
    with open(env_path, 'rb') as f:
        env_content_b64 = base64.b64encode(f.read()).decode('utf-8')

    print("=" * 50)
    print("  Deploying lyrics verification to ECS")
    print("=" * 50)
    print(f"  Script: {py_path} ({len(py_content_b64)} bytes base64)")
    print(f"  Env:    {env_path} ({len(env_content_b64)} bytes base64)")
    print()

    # Step 1: 安装 Python 依赖
    print("[1] Installing Python dependencies...")
    ok, out = run_command(
        "pip3 install requests pypinyin -q 2>&1 && echo DEPLOY_STEP1_OK"
    )
    if "DEPLOY_STEP1_OK" in out:
        print("  [OK] Dependencies installed")
    else:
        print(f"  [WARN] {out[:200]}")

    # Step 2: 写入验证脚本
    print("[2] Deploying verify_lyrics_audio.py...")
    cmd = f'echo "{py_content_b64}" | base64 -d > /root/verify_lyrics_audio.py && wc -l /root/verify_lyrics_audio.py && echo DEPLOY_STEP2_OK'
    ok, out = run_command(cmd)
    if "DEPLOY_STEP2_OK" in out:
        print(f"  [OK] Script deployed: {out.strip().split(chr(10))[0]}")
    else:
        print(f"  [FAIL] {out[:300]}")
        sys.exit(1)

    # Step 3: 写入 .env
    print("[3] Deploying .env...")
    cmd = f'echo "{env_content_b64}" | base64 -d > /root/.env && wc -c /root/.env && echo DEPLOY_STEP3_OK'
    ok, out = run_command(cmd)
    if "DEPLOY_STEP3_OK" in out:
        print(f"  [OK] .env deployed: {out.strip().split(chr(10))[0]}")
    else:
        print(f"  [FAIL] {out[:300]}")

    # Step 4: 验证
    print("[4] Verifying deployment...")
    cmd = 'python3 -c "import requests, pypinyin; print(\"deps OK\"); " && ffmpeg -version 2>&1 | head -1 && ls -la /root/verify_lyrics_audio.py /root/.env && echo DEPLOY_DONE'
    ok, out = run_command(cmd)
    print(f"  {out[:500]}")

    if "DEPLOY_DONE" in out:
        print()
        print("=" * 50)
        print("  [SUCCESS] Deployment complete!")
        print("=" * 50)
        print()
        print("  To run verification (test 3 songs):")
        print("    ssh root@121.41.45.199")
        print("    cd /root")
        print("    export $(grep -v '^#' .env | xargs)")
        print("    python3 verify_lyrics_audio.py --limit=3")
    else:
        print()
        print("  [WARN] Deployment may have issues. Check output above.")

if __name__ == "__main__":
    main()
