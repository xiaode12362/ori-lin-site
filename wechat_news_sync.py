#!/usr/bin/env python3
"""Sync one complete ORI-LIN news.json edition to WeChat Official Account."""

import argparse
import hashlib
import html
import json
import re
import sys
import time
from pathlib import Path

from wechat_sync import (
    create_cover_image,
    create_draft,
    get_access_token,
    post_json,
    publish_draft,
    upload_cover_image,
)


ROOT = Path(__file__).resolve().parent
NEWS = ROOT / "news.json"
STATE = ROOT / ".wechat_news_state.json"
PREVIEW = ROOT / "wechat_news_preview.html"
API = "https://api.weixin.qq.com/cgi-bin"


def esc(value):
    return html.escape(str(value or ""), quote=True)


def get_edition(target_date=None):
    editions = json.loads(NEWS.read_text(encoding="utf-8")).get("editions", [])
    edition = next((x for x in editions if not target_date or x.get("date") == target_date), None)
    if not edition:
        raise RuntimeError(f"news.json 中找不到期次：{target_date or '最新一期'}")
    items = edition.get("items", [])
    cn = sum(x.get("group") == "国内社会金融" for x in items)
    intl = sum(x.get("group") == "国际重大一手新闻" for x in items)
    if (len(items), cn, intl) != (20, 10, 10):
        raise RuntimeError(f"期次不完整：总数 {len(items)}，国内 {cn}，国际 {intl}")
    return edition


def stock_block(stock):
    return f"""
    <p><strong>{esc(stock.get('name'))}（{esc(stock.get('ticker'))}）｜{esc(stock.get('direction') or '暂不明确')}</strong><br>
    直接原因：{esc(stock.get('reason'))}<br>
    证据：{esc(stock.get('evidence'))}<br>
    确认信号：{esc(stock.get('trigger'))}<br>
    失效条件：{esc(stock.get('invalidCondition'))}</p>"""


def card(item, number):
    stocks = "".join(stock_block(x) for x in item.get("stocks", []))
    if not stocks:
        stocks = '<p>证据不足，暂不映射到具体股票。</p>'
    return f"""
    <section>
      <p><small>{number:02d} · {esc(item.get('group'))} · {esc(item.get('category'))}</small></p>
      <h2>{esc(item.get('title'))}</h2>
      <p><strong>发生了什么：</strong>{esc(item.get('whatHappened') or item.get('verdict'))}</p>
      <p><strong>为什么这样做：</strong>{esc(item.get('whyThisAction') or item.get('governmentIntent'))}</p>
      <p><strong>这意味着什么：</strong>{esc(item.get('whatItMeans') or item.get('essence'))}</p>
      <h3>具体影响哪些股票</h3>
      {stocks}
      <p><strong>接下来盯什么：</strong>{esc(item.get('watchNext') or item.get('upCondition'))}</p>
      <p><strong>一句话结论：</strong>{esc(item.get('oriCall'))}</p>
      <p><small>原文：{esc(item.get('originalSource'))} · {esc(item.get('publishedAt'))} · <a href="{esc(item.get('originalUrl'))}">查看一手原文</a></small></p>
      <hr>
    </section>"""


def render(edition):
    cards = "".join(card(item, i) for i, item in enumerate(edition["items"], 1))
    return f"""
    <section style="line-height:1.75;">
      <h1>ORI-LIN 每日20条一手新闻</h1>
      <p>{esc(edition['date'])}｜国内 10 条 + 国际 10 条</p>
      <blockquote>股票仅为研究关注清单，不是无条件买入指令。先看证据，再等验证信号。</blockquote>
      {cards}
      <p><small>新闻事实、官方目标与 ORI-LIN 分析已分开呈现。持续跟踪请访问 ori-lin.com。</small></p>
    </section>"""


def read_state():
    return json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {"editions": {}}


def write_state(state):
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def confirm(token, publish_id):
    for _ in range(30):
        data = post_json(
            f"{API}/freepublish/get",
            {"access_token": token},
            {"publish_id": publish_id},
        )
        status = data.get("publish_status")
        if status == 0:
            return {"status": "published", "article_id": data.get("article_id", "")}
        if status != 1:
            raise RuntimeError(f"公众号发布失败：publish_status={status}")
        time.sleep(10)
    return {"status": "publishing"}


def find_remote(token, title):
    """Find the same dated title remotely so reruns or another machine do not duplicate it."""
    for endpoint, status in (("freepublish/batchget", "published"), ("draft/batchget", "draft")):
        data = post_json(
            f"{API}/{endpoint}",
            {"access_token": token},
            {"offset": 0, "count": 20, "no_content": 1},
        )
        if data.get("errcode", 0):
            raise RuntimeError(f"公众号远端去重检查失败：{data.get('errmsg')}")
        for item in data.get("item", []):
            articles = item.get("content", {}).get("news_item", [])
            if any(article.get("title") == title for article in articles):
                return {"status": status, "media_id": item.get("media_id", "")}
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date")
    parser.add_argument("--draft-only", action="store_true")
    parser.add_argument("--render-only", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    edition = get_edition(args.date)
    content = re.sub(r"\s*\n\s*", "", render(edition)).strip()
    PREVIEW.write_text(content, encoding="utf-8")
    if args.render_only:
        print(f"预览已生成：{PREVIEW}")
        return 0

    edition_date = edition["date"]
    digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
    state = read_state()
    records = state.setdefault("editions", {})
    old = records.get(edition_date, {})
    if old.get("content_hash") == digest and old.get("status") == "published":
        print(f"{edition_date} 已发布，跳过重复操作")
        return 0
    if old.get("content_hash") == digest and args.draft_only and old.get("status") == "draft":
        print(f"{edition_date} 已在草稿箱，跳过重复操作")
        return 0
    if old and old.get("content_hash") != digest and not args.force:
        raise RuntimeError("同日期内容已同步过但发生变化；为避免重复发布，请人工核对后加 --force")

    token = get_access_token()
    title = f"ORI-LIN｜{edition_date} 每日20条一手新闻"
    remote = find_remote(token, title)
    if remote and remote["status"] == "published":
        records[edition_date] = {"content_hash": digest, **remote}
        write_state(state)
        print(f"{edition_date} 已在公众号发布，跳过重复操作")
        return 0
    if remote and remote["status"] == "draft" and args.draft_only:
        records[edition_date] = {"content_hash": digest, **remote}
        write_state(state)
        print(f"{edition_date} 已在公众号草稿箱，跳过重复操作")
        return 0
    if remote and remote["status"] == "draft":
        media_id = remote["media_id"]
    else:
        media_id = ""

    if not media_id:
        cover = ROOT / "wechat_cover.png"
        create_cover_image(
            {"date": edition_date, "title": "每日20条一手新闻"}, str(cover)
        )
        thumb_id = upload_cover_image(token, str(cover))
        media_id = create_draft(
            token,
            title,
            content,
            thumb_id,
            "国内社会金融10条 + 国际重大一手新闻10条：发生了什么、影响谁、接下来盯什么。",
        )
    records[edition_date] = {
        "content_hash": digest,
        "media_id": media_id,
        "status": "draft",
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    write_state(state)
    if args.draft_only:
        print(f"{edition_date} 已同步到公众号草稿箱")
        return 0

    submitted = publish_draft(token, media_id)
    publish_id = submitted.get("publish_id")
    records[edition_date].update({"publish_id": publish_id, "status": "publishing"})
    write_state(state)
    result = confirm(token, publish_id)
    records[edition_date].update(result)
    write_state(state)
    print(f"{edition_date} 公众号状态：{result['status']}")
    return 0 if result["status"] == "published" else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"同步失败：{exc}", file=sys.stderr)
        raise SystemExit(1)
