import json, urllib.request

SVC = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ycGhmdGx3ZHd1dm9zY2l6bmR4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTkyNDA4OSwiZXhwIjoyMDk3NTAwMDg5fQ.jDg11vKVIkCYsFPN5T6aLdU08cRx-FXSeZVfRJmi4mo"
URL = "https://orphftlwdwuvoscizndx.supabase.co/rest/v1/songs"
HEAD = {"apikey": SVC, "Authorization": "Bearer " + SVC, "Content-Type": "application/json", "Prefer": "return=minimal"}

swaps = {
    1804: ("Last Dance", "伍佰 And China Blue"),
    1836: ("被动", "伍佰 And China Blue"),
    1905: ("爱你一万年", "伍佰 And China Blue"),
    1838: ("浪人情歌", "伍佰 And China Blue"),
    1853: ("与你到永久", "伍佰 And China Blue"),
    1794: ("挪威的森林", "伍佰 And China Blue"),
    # 第二批
    1802: ("奔跑", "羽·泉、黄征"),
    1787: ("思念是一种病", "蔡健雅、张震岳"),
    1846: ("浪花一朵朵", "任贤齐、阿牛、光良"),
}

for sid, (t, s) in swaps.items():
    data = json.dumps({"title": t, "singer": s}).encode("utf-8")
    req = urllib.request.Request(f"{URL}?id=eq.{sid}", data=data, headers=HEAD, method="PATCH")
    resp = urllib.request.urlopen(req)
    print(f"ID={sid}: OK -> {t} - {s}")