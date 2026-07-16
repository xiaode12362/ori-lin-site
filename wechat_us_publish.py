#!/usr/bin/env python3
"""Run ORI-LIN WeChat sync through a pinned US Clash Verge node, then restore it."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parent
PIPE = r"\\.\pipe\verge-mihomo"
LOCAL_PROXY = "http://127.0.0.1:7897"
DEFAULT_NODE = "美国 13*"


def load_env() -> None:
    path = ROOT / ".env"
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def dechunk(data: bytes) -> bytes:
    chunks, position = [], 0
    while True:
        end = data.find(b"\r\n", position)
        if end < 0:
            raise RuntimeError("代理控制器返回了不完整的数据")
        size = int(data[position:end].split(b";", 1)[0], 16)
        position = end + 2
        if size == 0:
            return b"".join(chunks)
        chunks.append(data[position : position + size])
        position += size + 2


def controller(method: str, path: str, body: dict | None = None) -> dict:
    payload = b"" if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = (
        f"{method} {path} HTTP/1.1\r\n"
        "Host: localhost\r\nConnection: close\r\nContent-Type: application/json\r\n"
        f"Content-Length: {len(payload)}\r\n\r\n"
    ).encode() + payload
    with open(PIPE, "r+b", buffering=0) as stream:
        stream.write(request)
        parts = []
        while True:
            chunk = stream.read(65536)
            if not chunk:
                break
            parts.append(chunk)
    header, _, response = b"".join(parts).partition(b"\r\n\r\n")
    status = int(header.split(b" ")[1])
    if status >= 400:
        raise RuntimeError(f"代理控制器返回 HTTP {status}")
    if b"transfer-encoding: chunked" in header.lower():
        response = dechunk(response)
    return json.loads(response.decode() or "{}") if response else {}


def main() -> int:
    load_env()
    node = os.getenv("WECHAT_PROXY_NODE", DEFAULT_NODE)
    configs = controller("GET", "/configs")
    proxies = controller("GET", "/proxies").get("proxies", {})
    if node not in proxies:
        raise RuntimeError(f"找不到指定的美国节点：{node}")
    old_mode = configs.get("mode", "rule")
    old_global = proxies.get("GLOBAL", {}).get("now", "DIRECT")
    try:
        controller("PUT", "/proxies/GLOBAL", {"name": node})
        controller("PATCH", "/configs", {"mode": "global"})
        time.sleep(1)
        proxy_map = {"http": LOCAL_PROXY, "https": LOCAL_PROXY}
        geo = requests.get("https://ipinfo.io/json", proxies=proxy_map, timeout=20).json()
        if geo.get("country") != "US":
            raise RuntimeError("公众号专用节点的实际出口不在美国，已停止")
        print(f"公众号发布出口：{geo.get('ip')} · US/{geo.get('region', '')}")
        env = os.environ.copy()
        env.update(
            {
                "HTTP_PROXY": LOCAL_PROXY,
                "HTTPS_PROXY": LOCAL_PROXY,
                "ALL_PROXY": LOCAL_PROXY,
                "WECHAT_US_PROXY_ACTIVE": "1",
            }
        )
        result = subprocess.run(
            [sys.executable, str(ROOT / "wechat_news_sync.py"), *sys.argv[1:]],
            cwd=ROOT,
            env=env,
            timeout=240,
        )
        return result.returncode
    finally:
        try:
            controller("PUT", "/proxies/GLOBAL", {"name": old_global})
        finally:
            controller("PATCH", "/configs", {"mode": old_mode})


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"美国出口同步失败：{exc}", file=sys.stderr)
        raise SystemExit(1)
