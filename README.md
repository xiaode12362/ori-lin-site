# ORI-LIN Website

This is the first static bilingual website package for `www.ori-lin.com`.

## What is included

- `index.html`: bilingual landing page and daily brief delivery page
- `styles.css`: responsive visual system
- `script.js`: Chinese / English language switch

## Membership positioning

- Asset verification threshold: USD 30M+
- Annual fee: RMB 10,000
- Minimum commitment: 10 years, RMB 100,000 total
- Access: direct entry to the private member community after approval
- Delivery: daily bilingual brief on the website, synchronized to the private community

## How to publish

Upload the full `ori-lin-site` folder to a static hosting service such as Vercel, Cloudflare Pages, Netlify, or any server that can serve HTML files.

For `www.ori-lin.com`, point the domain DNS to the hosting provider:

- Vercel usually asks for a `CNAME` record for `www`
- Cloudflare Pages usually asks for a custom domain connection inside Pages
- Netlify usually asks for a `CNAME` record or nameserver setup

## Recommended production chain

1. Create a GitHub repository named `ori-lin-site`.
2. Put the files from this folder at the repository root.
3. Import that repository into Vercel as a static site.
4. Add `www.ori-lin.com` as the production domain in Vercel.
5. In your domain registrar DNS, create the `www` record exactly as Vercel instructs.
6. After DNS verifies, every GitHub update will trigger a Vercel deployment automatically.

## Recommended China / WeChat chain

For better WeChat access from China, deploy the same GitHub repository to a Tencent Cloud Hong Kong server.

Suggested chain:

1. Codex updates the site locally.
2. Codex commits and pushes to GitHub `main`.
3. GitHub Actions deploys the static files to the Tencent HK server over SSH.
4. Nginx serves the files from `/var/www/ori-lin-site`.
5. DNS points `www.ori-lin.com` to the Tencent HK server IP, or use `hk.ori-lin.com` as a China-friendly mirror.

Required GitHub repository secrets:

- `TENCENT_HOST`: Tencent HK server IP address
- `TENCENT_USER`: SSH user, usually `root` or `ubuntu`
- `TENCENT_PORT`: SSH port, usually `22`
- `TENCENT_SSH_PRIVATE_KEY`: private key allowed to log in to the server
- `TENCENT_SITE_PATH`: deployment path, suggested `/var/www/ori-lin-site`

An example Nginx config is included at `deploy/tencent-hk-nginx.conf`.

This folder already includes:

- `vercel.json` for Vercel static deployment settings
- `CNAME` declaring `www.ori-lin.com`
- `.gitignore` for deployment noise

## Daily publishing routine

For now, add the next day's content inside `index.html` under the `#today` and `#archive` sections.

The next production step should be turning daily briefs into separate Markdown or JSON files, then generating archive pages automatically.

## Automation

A daily Codex automation named `ORI-LIN Daily Brief Publishing` has been created for this workspace.

Schedule: every day at 08:00 Asia/Shanghai.

Task: generate the daily bilingual ORI-LIN brief and update the static website package in `outputs/ori-lin-site`. Once GitHub/Vercel credentials are connected in this environment, the task can also push the update so Vercel deploys automatically.
