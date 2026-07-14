#!/usr/bin/env python3
"""
ORI-LIN -> WeChat Official Account auto-sync script.

Usage:
  python wechat_sync.py                   # auto-find latest day-XXX.html
  python wechat_sync.py day-003.html      # specify article
  python wechat_sync.py --dry-run         # convert only, no API calls
  python wechat_sync.py --draft-only      # create draft, don't publish

Environment variables (or .env file):
  WECHAT_APPID=wxXXXXXXXX
  WECHAT_APPSECRET=XXXXXXXX

Dependencies:
  pip install requests
  # For cover image generation (optional):
  pip install Pillow
"""

import json
import os
import re
import sys
import time
import glob
from pathlib import Path
from datetime import datetime

# IPv6 is disabled at OS level (sysctl), so regular requests will use IPv4
import requests as HTTP

# Try loading .env file; auto-recreate if missing (git pull may delete it)
_env_path = Path(__file__).parent / ".env"
_DEFAULT_APPID = "wx9c7ec502f5b0f3ad"
_DEFAULT_SECRET = "46e5038f4f22414ff9c78d04a5f2dc81"
if not _env_path.exists():
    _env_path.write_text(f"WECHAT_APPID={_DEFAULT_APPID}\nWECHAT_APPSECRET={_DEFAULT_SECRET}\n", encoding="utf-8")
    os.chmod(_env_path, 0o600)
if _env_path.exists():
    for line in _env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

# ===== Configuration =====
WECHAT_APPID = os.environ.get("WECHAT_APPID", _DEFAULT_APPID)
WECHAT_APPSECRET = os.environ.get("WECHAT_APPSECRET", _DEFAULT_SECRET)
SITE_DIR = Path(__file__).parent
WECHAT_API = "https://api.weixin.qq.com/cgi-bin"
LOG_FILE = SITE_DIR / "wechat_sync.log"

# ===== WeChat article inline styles =====
S_TITLE = "font-size:22px;font-weight:bold;color:#1a1a1a;line-height:1.4;margin:0 0 8px;letter-spacing:0.5px;"
S_META = "font-size:13px;color:#999;margin:0 0 20px;"
S_DECK = "font-size:15px;color:#555;line-height:1.85;margin:0 0 25px;padding:14px 18px;background:#f8f5f0;border-left:3px solid #c8a45c;border-radius:0 6px 6px 0;"
S_H2 = "font-size:17px;font-weight:bold;color:#1a1a1a;margin:0 0 12px;padding-left:12px;border-left:4px solid #c8a45c;line-height:1.5;"
S_EYEBROW = "font-size:12px;color:#c8a45c;font-weight:bold;letter-spacing:2px;margin:0 0 6px;"
S_P = "font-size:15px;color:#333;line-height:1.9;margin:0 0 16px;text-align:justify;"
S_LI = "font-size:15px;color:#333;line-height:1.85;margin:0 0 10px;padding-left:6px;"
S_OL = "padding-left:22px;margin:0 0 16px;"
S_SEC_KEY = "margin:0 0 22px;padding:18px 20px;background:#fdf8f0;border-radius:8px;"
S_SEC_SCENARIO = "margin:0 0 22px;padding:18px 20px;background:#fafafa;border-radius:8px;"
S_SEC_PODCAST = "margin:0 0 22px;padding:18px 20px;background:#f0f6f2;border-radius:8px;border-left:3px solid #5a9d6e;"
S_SEC_SOURCE = "margin:0 0 22px;padding:14px 18px;background:#f7f7f7;border-radius:8px;"
S_HR = "border:none;border-top:1px solid #eee;margin:28px 0;"
S_FOOTER = "text-align:center;font-size:13px;color:#c8a45c;margin:30px 0 15px;font-weight:bold;letter-spacing:1px;"
S_FOOTER_SUB = "text-align:center;font-size:12px;color:#aaa;margin:0 0 20px;"


def log(msg):
    """Print and append to log file."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def get_visible_text(html_fragment):
    """Extract Chinese text from an HTML fragment, preferring data-zh attribute."""
    m = re.search(r'data-zh="([^"]*)"', html_fragment)
    if m:
        return m.group(1)
    text = re.sub(r"<[^>]+>", "", html_fragment)
    return text.strip()


def parse_article(html_content):
    """Parse ORI-LIN article HTML and extract structured Chinese content."""
    article = {"title": "", "date": "", "tags": "", "deck": "", "sections": []}

    # Title
    m = re.search(r'<h1[^>]*class="article-title"[^>]*>(.*?)</h1>', html_content, re.S)
    if m:
        article["title"] = get_visible_text(m.group(1))

    # Date
    m = re.search(r'<time[^>]*>([^<]*)</time>', html_content)
    if m:
        article["date"] = m.group(1).strip()

    # Tags (first span with data-zh inside brief-meta)
    m = re.search(r'<div class="brief-meta">.*?<span[^>]*data-zh="([^"]*)"', html_content, re.S)
    if m:
        article["tags"] = m.group(1)

    # Deck
    m = re.search(r'<p[^>]*class="article-deck"[^>]*>(.*?)</p>', html_content, re.S)
    if m:
        article["deck"] = get_visible_text(m.group(1))

    # Sections
    raw_sections = re.findall(
        r'<section[^>]*class="article-section[^"]*"[^>]*>(.*?)</section>',
        html_content,
        re.S,
    )
    for sec_html in raw_sections:
        section = {"eyebrow": "", "heading": "", "paragraphs": [], "list_items": []}

        # Eyebrow
        m = re.search(r'<p[^>]*class="eyebrow"[^>]*>(.*?)</p>', sec_html, re.S)
        if m:
            section["eyebrow"] = get_visible_text(m.group(1))

        # Heading (h2)
        m = re.search(r"<h2[^>]*>(.*?)</h2>", sec_html, re.S)
        if m:
            section["heading"] = get_visible_text(m.group(1))

        # Paragraphs (exclude eyebrow)
        paras = re.findall(
            r'<p(?![^>]*class="eyebrow")[^>]*>(.*?)</p>', sec_html, re.S
        )
        for p in paras:
            text = get_visible_text(p)
            if text:
                section["paragraphs"].append(text)

        # List items
        items = re.findall(r"<li[^>]*>(.*?)</li>", sec_html, re.S)
        for li in items:
            text = get_visible_text(li)
            if text:
                section["list_items"].append(text)

        article["sections"].append(section)

    return article


def convert_to_wechat_html(article):
    """Convert parsed article to WeChat-compatible HTML with inline styles."""
    parts = []

    # Title
    parts.append(f'<h1 style="{S_TITLE}">{article["title"]}</h1>')

    # Meta
    meta_parts = []
    if article["date"]:
        meta_parts.append(article["date"])
    if article["tags"]:
        meta_parts.append(article["tags"])
    if meta_parts:
        parts.append(f'<p style="{S_META}">{" &middot; ".join(meta_parts)}</p>')

    # Deck
    if article["deck"]:
        parts.append(f'<p style="{S_DECK}">{article["deck"]}</p>')

    parts.append(f'<hr style="{S_HR}"/>')

    # Sections
    for i, sec in enumerate(article["sections"]):
        # Choose section wrapper style
        if i == 0:
            wrapper = f'<section style="{S_SEC_KEY}">'
        elif i == 1:
            wrapper = f'<section style="{S_SEC_SCENARIO}">'
        elif sec["eyebrow"] == "饭局版播客稿":
            wrapper = f'<section style="{S_SEC_PODCAST}">'
        elif sec["heading"] == "公开资料底稿":
            wrapper = f'<section style="{S_SEC_SOURCE}">'
        else:
            wrapper = "<section>"

        parts.append(wrapper)

        if sec["eyebrow"]:
            parts.append(f'<p style="{S_EYEBROW}">{sec["eyebrow"]}</p>')

        if sec["heading"]:
            parts.append(f'<h2 style="{S_H2}">{sec["heading"]}</h2>')

        for p in sec["paragraphs"]:
            parts.append(f'<p style="{S_P}">{p}</p>')

        if sec["list_items"]:
            parts.append(f'<ol style="{S_OL}">')
            for li in sec["list_items"]:
                parts.append(f'<li style="{S_LI}">{li}</li>')
            parts.append("</ol>")

        parts.append("</section>")

        if i < len(article["sections"]) - 1:
            parts.append(f'<hr style="{S_HR}"/>')

    # Footer
    parts.append(f'<p style="{S_FOOTER}">ORI-LIN</p>')
    parts.append(
        f'<p style="{S_FOOTER_SUB}">中国土老板和全球顶级聪明人的桥梁<br/>ori-lin.com</p>'
    )

    return "\n".join(parts)


def create_cover_image(article, output_path):
    """Create a cover image for the WeChat article using Pillow."""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        log("Pillow not available, skipping cover image generation")
        return None

    W, H = 900, 383
    img = Image.new("RGB", (W, H), "#1a1a2e")
    draw = ImageDraw.Draw(img)

    # Gradient background
    for y in range(H):
        r = int(26 + (22 - 26) * y / H)
        g = int(26 + (33 - 26) * y / H)
        b = int(46 + (62 - 46) * y / H)
        draw.line([(0, y), (W, y)], fill=(r, g, b))

    # Find fonts
    font_paths = [
        "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/msyhbd.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/wqy-zenhei/wqy-zenhei.ttc",
    ]
    font_large = None
    font_medium = None
    font_small = None
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                font_large = ImageFont.truetype(fp, 42)
                font_medium = ImageFont.truetype(fp, 28)
                font_small = ImageFont.truetype(fp, 18)
                break
            except Exception:
                continue

    if not font_large:
        font_large = ImageFont.load_default()
        font_medium = font_large
        font_small = font_large

    # ORI-LIN brand
    draw.text((50, 40), "ORI-LIN", fill="#c8a45c", font=font_large)

    # Day number / date
    day_label = article.get("date", "")
    if day_label:
        draw.text((50, 100), day_label, fill="#ffffff", font=font_medium)

    # Title (truncate to fit)
    title = article.get("title", "")
    # Simple word wrap
    max_chars_per_line = 22
    lines = []
    current = ""
    for ch in title:
        current += ch
        if len(current) >= max_chars_per_line:
            lines.append(current)
            current = ""
    if current:
        lines.append(current)
    lines = lines[:3]  # Max 3 lines

    y_offset = 160
    for line in lines:
        draw.text((50, y_offset), line, fill="#ffffff", font=font_medium)
        y_offset += 40

    # Bottom tagline
    draw.text((50, H - 35), "ori-lin.com", fill="#666", font=font_small)

    img.save(output_path, "PNG", optimize=True)
    return output_path


def truncate_utf8(text, max_bytes=64):
    """Truncate text to fit within max_bytes when UTF-8 encoded."""
    encoded = text.encode("utf-8")
    if len(encoded) <= max_bytes:
        return text
    # Truncate bytes, then decode carefully to avoid splitting a multi-byte char
    truncated = encoded[:max_bytes]
    return truncated.decode("utf-8", errors="ignore").rstrip()


def post_json(url, params=None, payload=None, timeout=30):
    """POST JSON with ensure_ascii=False so Chinese chars are sent as UTF-8 bytes,
    not \\uXXXX escapes (WeChat counts escaped length for size limits)."""
    headers = {"Content-Type": "application/json; charset=utf-8"}
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    resp = HTTP.post(url, params=params, data=data, headers=headers, timeout=timeout)
    return resp.json()


# ===== WeChat API functions =====

def get_access_token():
    """Get WeChat MP access token."""
    url = f"{WECHAT_API}/token"
    params = {
        "grant_type": "client_credential",
        "appid": WECHAT_APPID,
        "secret": WECHAT_APPSECRET,
    }
    resp = HTTP.get(url, params=params, timeout=10)
    data = resp.json()
    if "access_token" not in data:
        raise Exception(f"Failed to get access token: {json.dumps(data, ensure_ascii=False)}")
    return data["access_token"]


def upload_cover_image(access_token, image_path):
    """Upload a permanent material image for article cover."""
    url = f"{WECHAT_API}/material/add_material"
    params = {"access_token": access_token, "type": "image"}
    with open(image_path, "rb") as f:
        files = {"media": (Path(image_path).name, f, "image/png")}
        resp = HTTP.post(url, params=params, files=files, timeout=30)
    data = resp.json()
    if "media_id" not in data:
        raise Exception(f"Failed to upload cover image: {json.dumps(data, ensure_ascii=False)}")
    return data["media_id"]


def create_draft(access_token, title, content, thumb_media_id, digest=""):
    """Create a draft article in WeChat MP."""
    url = f"{WECHAT_API}/draft/add"
    params = {"access_token": access_token}
    # Truncate title/digest by UTF-8 bytes (WeChat limit: 64 bytes for title, 120 for digest)
    title = truncate_utf8(title, 64)
    digest = truncate_utf8(digest or title, 120)
    payload = {
        "articles": [
            {
                "title": title,
                "author": "ORI-LIN",
                "digest": digest,
                "content": content,
                "content_source_url": "https://www.ori-lin.com",
                "thumb_media_id": thumb_media_id,
                "need_open_comment": 1,
                "only_fans_can_comment": 0,
            }
        ]
    }
    data = post_json(url, params, payload)
    if "media_id" not in data:
        raise Exception(f"Failed to create draft: {json.dumps(data, ensure_ascii=False)}")
    return data["media_id"]


def publish_draft(access_token, media_id):
    """Publish a draft article."""
    url = f"{WECHAT_API}/freepublish/submit"
    params = {"access_token": access_token}
    payload = {"media_id": media_id}
    data = post_json(url, params, payload)
    if data.get("errcode", 0) != 0:
        raise Exception(f"Failed to publish: {json.dumps(data, ensure_ascii=False)}")
    return data


def find_latest_article():
    """Find the latest day-XXX.html file in the site directory."""
    pattern = str(SITE_DIR / "day-*.html")
    files = glob.glob(pattern)
    if not files:
        return None
    # Sort by filename (day-001 < day-002 < ...)
    files.sort()
    return files[-1]


def main():
    dry_run = "--dry-run" in sys.argv
    draft_only = "--draft-only" in sys.argv

    # Find article file
    article_file = None
    for arg in sys.argv[1:]:
        if not arg.startswith("--") and arg.endswith(".html"):
            candidate = SITE_DIR / arg
            if candidate.exists():
                article_file = str(candidate)
            break

    if not article_file:
        article_file = find_latest_article()

    if not article_file:
        log("ERROR: No article file found")
        sys.exit(1)

    log(f"Processing: {article_file}")

    # Read and parse
    html_content = Path(article_file).read_text(encoding="utf-8")
    article = parse_article(html_content)

    if not article["title"]:
        log("ERROR: Could not extract article title")
        sys.exit(1)

    log(f"Title: {article['title']}")
    log(f"Date: {article['date']}")
    log(f"Sections: {len(article['sections'])}")

    # Convert to WeChat HTML
    wechat_html = convert_to_wechat_html(article)
    content_length = len(wechat_html)
    log(f"WeChat HTML length: {content_length} chars")

    if content_length > 20000:
        log(f"WARNING: Content exceeds 20000 char limit ({content_length})")

    # Dry run: save HTML and exit
    if dry_run:
        output_file = SITE_DIR / "wechat_preview.html"
        output_file.write_text(
            f'<!DOCTYPE html><html><head><meta charset="utf-8">'
            f'<title>{article["title"]}</title></head><body>'
            f'<div style="max-width:677px;margin:0 auto;padding:20px;">'
            f'{wechat_html}</div></body></html>',
            encoding="utf-8",
        )
        log(f"Dry run complete. Preview saved to: {output_file}")
        return

    # Check credentials
    if not WECHAT_APPID or not WECHAT_APPSECRET:
        log("ERROR: WECHAT_APPID or WECHAT_APPSECRET not set")
        log("Create a .env file with:")
        log('  WECHAT_APPID=your_appid')
        log('  WECHAT_APPSECRET=your_secret')
        sys.exit(1)

    # Create cover image
    cover_path = SITE_DIR / "wechat_cover.png"
    log("Creating cover image...")
    create_cover_image(article, str(cover_path))

    # Get access token
    log("Getting WeChat access token...")
    access_token = get_access_token()
    log("Access token obtained")

    # Upload cover image
    log("Uploading cover image...")
    if cover_path.exists():
        thumb_media_id = upload_cover_image(access_token, str(cover_path))
        log(f"Cover image uploaded: {thumb_media_id}")
    else:
        log("ERROR: Cover image not created")
        sys.exit(1)

    # Create draft
    log("Creating draft article...")
    digest = article["deck"][:120] if article["deck"] else article["title"]
    draft_media_id = create_draft(
        access_token, article["title"], wechat_html, thumb_media_id, digest
    )
    log(f"Draft created: {draft_media_id}")

    if draft_only:
        log("Draft-only mode: skipping publish")
        return

    # Publish
    log("Publishing article...")
    try:
        result = publish_draft(access_token, draft_media_id)
        log(f"Published successfully! Result: {json.dumps(result, ensure_ascii=False)}")
        log(f"Article: {article['title']}")
        log(f"Draft media_id: {draft_media_id}")
    except Exception as e:
        log(f"Publish failed (draft still saved): {e}")
        log("You can manually publish the draft from the WeChat MP backend.")


if __name__ == "__main__":
    main()
