"""Set --fix as default mode on ECS verify script via RunCommand"""
import urllib.request, urllib.parse, json, time, hmac, hashlib, base64, string
from datetime import datetime, timezone

AK='LTAI5tXXXXXXXXXXXXX'; AKS='DoPffXXXXXXXXXXXXXXXXX'
INST='i-bp18v2inztg7q1wuwgp9'; REG='cn-hangzhou'

RES=set(string.ascii_letters+string.digits+'-_.~')
def pe(s):
    r=[]
    for c in s:
        if c in RES: r.append(c)
        else:
            for b in c.encode('utf-8'): r.append('%{:02X}'.format(b))
    return ''.join(r)

def sign(params, secret):
    sp=sorted(params.items())
    cp=[f'{pe(k)}={pe(v)}' for k,v in sp]
    can='&'.join(cp)
    sts=f'POST&{pe("/")}&{pe(can)}'
    key=(secret+'&').encode()
    return base64.b64encode(hmac.new(key, sts.encode(), hashlib.sha1).digest()).decode()

def api(action, extra=None):
    params={'Action':action,'Format':'JSON','Version':'2014-05-26',
        'AccessKeyId':AK,'SignatureMethod':'HMAC-SHA1','SignatureVersion':'1.0',
        'SignatureNonce':str(int(time.time()*1000000)),
        'Timestamp':datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'RegionId':REG}
    if extra: params.update(extra)
    params['Signature']=sign(params, AKS)
    body=urllib.parse.urlencode(params).encode()
    req=urllib.request.Request('https://ecs.aliyuncs.com/', data=body, method='POST')
    req.add_header('Content-Type','application/x-www-form-urlencoded')
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode())

def run_cmd(cmd, timeout='120'):
    r=api('RunCommand',{'InstanceId.1':INST,'Type':'RunShellScript','CommandContent':cmd,'Timeout':timeout})
    iid=r.get('InvokeId','')
    if not iid: return False, str(r)
    for _ in range(25):
        time.sleep(3)
        sr=api('DescribeInvocationResults',{'InstanceId':INST,'InvokeId':iid})
        results=sr.get('Invocation',{}).get('InvocationResults',{}).get('InvocationResult',[])
        for rr in results:
            st=rr.get('InvocationStatus')
            out=base64.b64decode(rr.get('Output','') or '').decode('utf-8',errors='replace')
            if st in ('Finished','Success'): return True, out
            if st=='Failed': return False, out
    return False,'Timeout'

# Step 1: Set --fix as default (change default=True to default=False for --report)
cmd1 = """sed -i 's/\"--report\", action=\"store_true\", default=True/\"--report\", action=\"store_true\", default=False/' /root/verify_lyrics_audio.py && echo STEP1_OK"""
print("Step 1: Set --report default=False...")
ok, out = run_cmd(cmd1)
print(f"  OK={ok}, Out={out[:200]}")

# Step 2: Verify the change
cmd2 = "grep 'default' /root/verify_lyrics_audio.py"
print("\nStep 2: Verify...")
ok, out = run_cmd(cmd2)
print(f"  {out[:300]}")

# Step 3: Run verify on 20 songs (now defaults to --fix mode)
cmd3 = "cd /root && bash run_verify.sh --limit=20 2>&1"
print("\nStep 3: Run --fix on 20 songs...")
ok, out = run_cmd(cmd3, timeout='300')
print(f"  OK={ok}")
print(out[-1500:] if len(out) > 1500 else out)
