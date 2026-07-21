#!/usr/bin/env bash
set -euo pipefail

SITE_PATH="${SITE_PATH:-/var/www/ori-lin-site}"

dnf install -y nodejs npm || yum install -y nodejs npm

mkdir -p /var/lib/ori-lin
mkdir -p "$SITE_PATH/comments-server"
cd "$SITE_PATH/comments-server"
npm install --omit=dev

cat >/etc/systemd/system/ori-lin-comments.service <<SERVICE
[Unit]
Description=ORI-LIN comments API
After=network.target

[Service]
Type=simple
WorkingDirectory=${SITE_PATH}/comments-server
Environment=PORT=3100
Environment=COMMENTS_DB=/var/lib/ori-lin/comments.sqlite
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable ori-lin-comments
systemctl restart ori-lin-comments

if ! grep -q "location /api/" /etc/nginx/conf.d/ori-lin-site.conf; then
  python3 - <<'PY'
from pathlib import Path
path = Path("/etc/nginx/conf.d/ori-lin-site.conf")
text = path.read_text()
needle = "    location / {\n"
insert = """    location /api/ {\n        proxy_pass http://127.0.0.1:3100;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n    }\n\n"""
text = text.replace(needle, insert + needle)
path.write_text(text)
PY
fi

nginx -t
systemctl reload nginx
systemctl status ori-lin-comments --no-pager
