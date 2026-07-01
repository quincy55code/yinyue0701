"""
通过阿里云 ECS API (RunCommand) 将本地 SSH 公钥添加到服务器
无需密码登录，直接用 API 操作
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

# ========== 配置 ==========
ACCESS_KEY_ID = "LTAI5tXXXXXXXXXXXXX"
ACCESS_KEY_SECRET = "DoPffXXXXXXXXXXXXXXXXX"
INSTANCE_ID = "i-bp11r90r4g94sb3ewt00Z"
REGION = "cn-shanghai"

# 读取本地公钥
SSH_PUBKEY_PATH = os.path.expanduser("~/.ssh/id_rsa.pub")
with open(SSH_PUBKEY_PATH) as f:
    public_key = f.read().strip()

print(f"[1] Public key: {public_key[:60]}...")

# ========== 阿里云 API 签名 ==========
RESERVED_CHARS = set(string.ascii_letters + string.digits + '-_.~')

def percent_encode(s):
    """按照阿里云规范进行百分号编码"""
    result = []
    for char in s:
        if char in RESERVED_CHARS:
            result.append(char)
        else:
            # Python's encode with errors=replace would turn some chars into ?
            b = char.encode('utf-8')
            for byte in b:
                result.append('%{:02X}'.format(byte))
    return ''.join(result)

def sign_request(params, secret, method="POST"):
    """阿里云 API 签名 v1 (HMAC-SHA1)"""
    sorted_params = sorted(params.items())
    # Build canonical query string with proper percent-encoding
    canonical_parts = []
    for k, v in sorted_params:
        canonical_parts.append(f"{percent_encode(k)}={percent_encode(v)}")
    canonical = '&'.join(canonical_parts)
    # Build string to sign
    string_to_sign = f"{method}&{percent_encode('/')}&{percent_encode(canonical)}"
    # HMAC-SHA1 sign
    key = (secret + "&").encode('utf-8')
    signature = base64.b64encode(
        hmac.new(key, string_to_sign.encode('utf-8'), hashlib.sha1).digest()
    ).decode('utf-8')
    return signature

def call_ecs_api(action, extra_params=None):
    """调用阿里云 ECS API (POST 方式避免 URL 长度限制)"""
    params = {
        "Action": action,
        "Format": "JSON",
        "Version": "2014-05-26",
        "AccessKeyId": ACCESS_KEY_ID,
        "SignatureMethod": "HMAC-SHA1",
        "SignatureVersion": "1.0",
        "SignatureNonce": str(int(time.time() * 1000000)),
        "Timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "RegionId": REGION,
    }
    if extra_params:
        params.update(extra_params)

    signature = sign_request(params, ACCESS_KEY_SECRET, "POST")
    params["Signature"] = signature

    # Use POST to avoid URL length issues with large base64 CommandContent
    body = urllib.parse.urlencode(params).encode('utf-8')
    req = urllib.request.Request(
        "https://ecs.aliyuncs.com/",
        data=body,
        method='POST'
    )
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("User-Agent", "aliyun-api-python/1.0")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode())


# ========== Step 1: 多区域查找 ECS 实例 ==========
print("[2] Looking up ECS instances across regions...")

ALL_REGIONS = [
    "cn-shanghai", "cn-beijing", "cn-hangzhou", "cn-shenzhen",
    "cn-guangzhou", "cn-qingdao", "cn-hongkong", "cn-chengdu",
    "cn-zhangjiakou", "cn-wulanchabu", "cn-heyuan", "cn-nanjing",
    "ap-southeast-1", "ap-northeast-1", "eu-central-1", "us-west-1",
]

all_instances = []
for region in ALL_REGIONS:
    result = call_ecs_api("DescribeInstances", {
        "RegionId": region,
        "PageSize": "50",
    })
    if "Instances" in result:
        instances = result["Instances"].get("Instance", [])
        for inst in instances:
            inst["_region"] = region
            all_instances.append(inst)
            pub_ip = inst.get('PublicIpAddress', {}).get('IpAddress', ['N/A'])[0] if inst.get('PublicIpAddress') else 'N/A'
            print(f"  [{region}] {inst['InstanceId']} | {inst.get('InstanceName', 'N/A')} | Status={inst.get('Status')} | IP={pub_ip}")

if not all_instances:
    print("  No ECS instances found in any region.")
    print("  Possible issues: AccessKey has no ECS permissions, or no instances exist.")
    sys.exit(1)

# Find the instance matching the user's IP
target = None
for inst in all_instances:
    pub_ip = inst.get('PublicIpAddress', {}).get('IpAddress', [''])[0] if inst.get('PublicIpAddress') else ''
    if pub_ip == '121.41.45.199':
        target = inst
        break

if not target:
    print(f"\n  [WARN] No instance found with IP 121.41.45.199")
    # Fall back to the first running instance
    for inst in all_instances:
        if inst.get('Status') == 'Running':
            target = inst
            print(f"  Using first running instance: {inst['_region']}/{inst['InstanceId']}")
            break

if not target:
    print("  [FAIL] No running instance found at all.")
    sys.exit(1)

REAL_INSTANCE_ID = target['InstanceId']
REAL_REGION = target['_region']
print(f"\n  Target: {REAL_INSTANCE_ID} (Region: {REAL_REGION}, Name: {target.get('InstanceName', 'N/A')})")

# ========== Step 2: 添加 SSH 公钥 ==========
print("\n[3] Adding SSH public key to instance...")

command = f'mkdir -p ~/.ssh && echo "{public_key}" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && chmod 700 ~/.ssh && echo DONE'

result = call_ecs_api("RunCommand", {
    "RegionId": REAL_REGION,
    "InstanceId.1": REAL_INSTANCE_ID,
    "Type": "RunShellScript",
    "CommandContent": command,
    "Timeout": "60",
})

print(f"  Response: {json.dumps(result, indent=2, ensure_ascii=False)}")

if "CommandId" in result and "InvokeId" in result:
    command_id = result.get("CommandId")
    invoke_id = result.get("InvokeId")
    print(f"  [OK] Command sent (InvokeId: {invoke_id})")

    # Step 3: Wait for completion
    print("[4] Waiting for execution...")
    for i in range(15):
        time.sleep(3)
        status_result = call_ecs_api("DescribeInvocationResults", {
            "RegionId": REAL_REGION,
            "InstanceId": REAL_INSTANCE_ID,
            "InvokeId": invoke_id,
        })
        invocation = status_result.get("Invocation", {})
        results = invocation.get("InvocationResults", {}).get("InvocationResult", [])
        if results:
            for r in results:
                status = r.get("InvocationStatus")
                output = r.get("Output", "")
                print(f"  Status: {status} | Output: {output[:200]}")
                if status in ("Finished", "Success"):
                    if "DONE" in output:
                        print("  [OK] SSH public key added successfully!")
                    else:
                        print(f"  [WARN] Output: {output}")
                    sys.exit(0)
                if status == "Failed":
                    print(f"  [FAIL] Execution failed: {output}")
                    sys.exit(1)
    print("  [WARN] Timeout checking status")
else:
    print(f"  [FAIL] RunCommand failed: {result.get('Code', 'Unknown')}")
    sys.exit(1)
