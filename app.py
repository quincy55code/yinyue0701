"""
音乐播放器 — FastAPI 后端
代理 B站 DASH 音频流，前端无需直接面对跨域和防盗链问题
"""

import time
import math
import asyncio
from typing import Optional

import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse

app = FastAPI(title="Music Player Backend")

# CORS — 允许前端跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ========== 歌曲配置 ==========
# start_time / end_time: 单位秒，仅当歌曲是长视频中的一段时使用
SONGS = [
    {
        "id": 1,
        "title": "离别开出花",
        "bvid": "BV1pY5q6jECZ",
        "page": 1,           # 分P（默认第1P）
        "start_time": 45 * 60 + 48,   # 45:48
        "end_time": 49 * 60 + 47,     # 49:47
    },
    {
        "id": 2,
        "title": "小幸运",
        "bvid": "BV1pr6aYiE97",
        "page": 2,           # 分P 2
        "start_time": None,
        "end_time": None,
    },
    {
        "id": 3,
        "title": "匆匆那年",
        "bvid": "BV1pr6aYiE97",
        "page": 7,           # 分P 7
        "start_time": None,
        "end_time": None,
    },
    {
        "id": 4,
        "title": "虞兮叹",
        "bvid": "BV1dp4y1A7c3",
        "page": 1,
        "start_time": None,
        "end_time": None,
    },
]

# B站 API 请求头（防盗链基础配置）
BILI_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.bilibili.com/",
}

# 全局 httpx client（复用连接池）
_client: Optional[httpx.AsyncClient] = None


async def get_client() -> httpx.AsyncClient:
    """获取或创建 httpx AsyncClient（复用连接）"""
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=10.0),
            follow_redirects=True,
        )
    return _client


# ========== API 端点 ==========


@app.get("/api/songs")
async def get_songs():
    """返回歌曲列表（只返回元数据，不含内部配置）"""
    return [
        {
            "id": s["id"],
            "title": s["title"],
            "start_time": s["start_time"],
            "end_time": s["end_time"],
            "duration": (s["end_time"] - s["start_time"]) if s["start_time"] and s["end_time"] else None,
        }
        for s in SONGS
    ]


@app.get("/api/stream/{song_id}")
async def stream_audio(song_id: int, request: Request):
    """代理 B站 DASH 音频流 — 获取最新音频 URL 并流式转发给前端"""
    # 1. 查找歌曲配置
    song = next((s for s in SONGS if s["id"] == song_id), None)
    if song is None:
        raise HTTPException(status_code=404, detail="Song not found")

    client = await get_client()

    try:
        # 2. 获取视频信息 → 拿到 cid
        view_url = f"https://api.bilibili.com/x/web-interface/view?bvid={song['bvid']}"
        view_resp = await client.get(view_url, headers=BILI_HEADERS)
        view_resp.raise_for_status()
        view_data = view_resp.json()

        if view_data.get("code") != 0:
            raise HTTPException(
                status_code=502,
                detail=f"B站视频信息获取失败: {view_data.get('message', 'unknown')}",
            )

        # 处理分P
        pages = view_data["data"].get("pages", [])
        page_num = song["page"] - 1  # 转为 0-based 索引
        if page_num >= len(pages):
            raise HTTPException(status_code=400, detail="分P不存在")
        cid = pages[page_num]["cid"]

        # 3. 获取播放地址（DASH 格式）
        play_url = (
            f"https://api.bilibili.com/x/player/playurl"
            f"?bvid={song['bvid']}&cid={cid}"
            f"&fnval=16&fnver=0&fourk=1"
        )
        play_resp = await client.get(play_url, headers=BILI_HEADERS)
        play_resp.raise_for_status()
        play_data = play_resp.json()

        if play_data.get("code") != 0:
            raise HTTPException(
                status_code=502,
                detail=f"B站播放地址获取失败: {play_data.get('message', 'unknown')}",
            )

        # 4. 提取 DASH 音频流 URL
        dash = play_data["data"].get("dash")
        if not dash or not dash.get("audio"):
            raise HTTPException(status_code=502, detail="该视频没有可用的 DASH 音频流")

        # 优先选择最高码率的音频
        audios = sorted(dash["audio"], key=lambda a: a.get("bandwidth", 0), reverse=True)
        audio_url = audios[0]["base_url"] or audios[0]["baseUrl"]

        # 部分音频 URL 可能缺少协议前缀
        if audio_url.startswith("//"):
            audio_url = "https:" + audio_url

        # 5. 流式转发
        async def audio_stream():
            """从 B站 CDN 流式下载音频并逐块转发"""
            try:
                async with client.stream("GET", audio_url, headers={
                    **BILI_HEADERS,
                    "Range": "bytes=0-",  # 从头开始请求
                }) as upstream:
                    upstream.raise_for_status()
                    async for chunk in upstream.aiter_bytes(chunk_size=256 * 1024):  # 256KB 块
                        yield chunk
                        # 检查客户端是否断开
                        if await request.is_disconnected():
                            break
            except httpx.HTTPError as e:
                # 流已开始，无法返回 HTTP 错误，只能终止
                print(f"[stream error] song_id={song_id}: {e}")

        return StreamingResponse(
            audio_stream(),
            media_type="audio/mp4",       # B站 DASH 音频通常是 mp4a/m4a
            headers={
                "Accept-Ranges": "bytes",
                "Cache-Control": "no-cache",
                "Content-Disposition": "inline",
            },
        )

    except HTTPException:
        raise
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"请求B站API失败: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {e}")


@app.on_event("shutdown")
async def shutdown():
    """关闭全局 httpx client"""
    global _client
    if _client:
        await _client.aclose()
        _client = None


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
