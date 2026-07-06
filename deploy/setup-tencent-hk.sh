#!/usr/bin/env bash
set -euo pipefail

SITE_PATH="${SITE_PATH:-/var/www/ori-lin-site}"
DOMAIN="${DOMAIN:-www.ori-lin.com}"
ROOT_DOMAIN="${ROOT_DOMAIN:-ori-lin.com}"

apt-get update
apt-get install -y nginx rsync

mkdir -p "$SITE_PATH"
chown -R "${SUDO_USER:-root}:${SUDO_USER:-root}" "$SITE_PATH" || true

cat >/etc/nginx/sites-available/ori-lin-site <<NGINX
server {
    listen 80;
    server_name ${DOMAIN} ${ROOT_DOMAIN};

    root ${SITE_PATH};
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/ori-lin-site /etc/nginx/sites-enabled/ori-lin-site
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable nginx
systemctl reload nginx

echo "ORI-LIN site path ready: ${SITE_PATH}"
