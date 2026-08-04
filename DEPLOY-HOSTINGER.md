# Deploying on Hostinger

A start-to-finish path from "nothing" to this shop running in production on a
Hostinger VPS with its own mailbox. Facts below (plans, prices, hostnames,
policies) were checked against official hostinger.com pages on **2026-08-04**;
intro prices are promo-dependent and change often — treat the *renewal* price
as the planning figure.

---

## 1. What to buy

| Item | Buy | Cost (checked 2026-08-04) |
|---|---|---|
| Server | **VPS KVM 4** (4 vCPU, 16 GB RAM, 200 GB NVMe) | $12.99/mo intro (24-mo term), renews $28.99/mo |
| Budget alternative | VPS KVM 2 (2 vCPU, 8 GB, 100 GB) | $8.79/mo intro, renews $14.99/mo — see caveat below |
| Mailbox | **Hostinger Email, Starter** (1 mailbox, 5 GB) | ~$0.39/mo promo (48-mo prepay), renews ~$1.59/mo |
| Domain | Your shop domain (register or transfer to Hostinger) | ~$10–15/yr depending on TLD |

**Why a VPS and not Hostinger's cheaper managed hosting?** Hostinger's shared
and "Web Apps" plans do run Next.js now, but they only provide **MySQL** —
Hostinger has no managed PostgreSQL at all; Postgres is officially VPS-only
(their managed platform's database wizard points at external Supabase/Atlas
instead, which this template's own-your-data rule rejects). This app is
Payload + Postgres, so a VPS running both the app and the database is the
only Hostinger-native fit.

**Why KVM 4 and not KVM 2?** Runtime is light — the storefront is ~500
prerendered pages and Postgres holds a small catalogue. The peak is
`pnpm build`: it fans out to 6 workers (`experimental.cpus` in
`next.config.js`), each with its own DB pool, and build workers commonly
peak 1–2 GB each. On KVM 2's 8 GB, rebuilding *in place* next to the live
server + Postgres risks the build being OOM-killed. KVM 4's 16 GB absorbs
build + serve + database comfortably. KVM 2 is fine **if you build
off-server** (in CI, or locally with the artifact rsynced up) and only run
the app + DB on the VPS.

**Mailbox rather than a self-hosted mail server** — the template only needs
SMTP + IMAP credentials, and a hosted mailbox sidesteps the IP-reputation
fight entirely. See §7 for why, and the appendix if you want to self-host
mail anyway.

During VPS checkout pick **plain Ubuntu 24.04 LTS** as the OS (skip the
one-click app templates — they preinstall their own Node versions; this
project pins Node ≥ 24.15 and installs it cleanly itself).

---

## 2. Point the domain at the VPS

hPanel → Domains → your domain → **DNS / Nameservers**:

1. Delete any existing `A`, `AAAA` or `CNAME` records named `@` or `www`.
2. Add `A  @   → <VPS IP>` and `A  www → <VPS IP>` (the VPS IP is on its
   dashboard; every Hostinger VPS has a dedicated IPv4).
3. Allow up to 24 h propagation (usually minutes).

Do this first — Let's Encrypt (§5) needs the domain resolving to the VPS.

---

## 3. First login and base hardening

SSH in as root (key or password set during VPS creation):

```bash
ssh root@<VPS-IP>

apt update && apt upgrade -y

# A non-root user for the app
adduser shop
usermod -aG sudo shop

# Firewall — use ONE of the two, not both:
# (a) UFW on the box:
ufw allow OpenSSH && ufw allow http && ufw allow https && ufw enable
# (b) or hPanel → VPS → Security → Firewall (create a group, allow TCP
#     22, 80, 443). ⚠️ hPanel gotcha: an ACTIVE firewall group with zero
#     rules blocks ALL traffic, including your SSH session — add the three
#     allow rules before enabling it.
```

Log out and continue as `shop` (`ssh shop@<VPS-IP>`).

---

## 4. Install the stack

**Node 24 + pnpm** (via nvm, matching `.nvmrc`):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 24          # must be >= 24.15.0
corepack enable pnpm
```

**PostgreSQL** (Ubuntu 24.04's apt ships Postgres 16 — no extra repo needed):

```bash
sudo apt install -y postgresql
sudo -u postgres psql <<'SQL'
CREATE USER shop WITH PASSWORD 'CHANGE-ME-LONG-RANDOM';
CREATE DATABASE ecommerce OWNER shop;
SQL
```

**Nginx + certbot + PM2** (the stack Hostinger's own Node.js tutorial
recommends; note snap is unsupported on Hostinger VPS, so certbot comes
from apt):

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
npm install -g pm2
```

---

## 5. Deploy the app

```bash
cd ~ && git clone <your-repo-url> shop && cd shop
pnpm install --ignore-workspace

cp .env.example .env
nano .env
```

The four variables, production values:

```
PAYLOAD_SECRET=            # openssl rand -base64 32 — losing/rotating this
                           # invalidates the encrypted credentials stored in
                           # the admin (Stripe, email, Google), so keep it safe
DATABASE_URL=postgresql://shop:CHANGE-ME-LONG-RANDOM@127.0.0.1:5432/ecommerce
NEXT_PUBLIC_SERVER_URL=https://yourdomain.com    # canonicals, sitemap, feed
                                                 # and email links derive from it
PREVIEW_SECRET=            # any random string
```

Seed (optional — the demo catalogue and policy pages, into the **empty** DB):

```bash
gunzip -c seed/database.sql.gz | psql "$DATABASE_URL"
```

Build and run under PM2:

```bash
pnpm build
pm2 start "pnpm start" --name shop
pm2 startup   # prints a sudo command — run it
pm2 save
```

**Nginx** as the TLS-terminating reverse proxy — `sudo nano
/etc/nginx/sites-available/shop`:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Product images are uploaded through the admin
    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/shop /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# HTTPS (also sets up the http->https redirect; auto-renews via systemd timer)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Open `https://yourdomain.com/admin`, create the first admin user. The shop
is live.

---

## 6. The mailbox (order emails + admin inbox)

Buy **Hostinger Email** for the shop domain (hPanel → Emails). Then:

1. **Connect the domain**: Emails → Mailboxes → Domain settings → **Connect
   automatically**. Because the domain's DNS is at Hostinger, hPanel adds
   everything itself: 2 MX records (`mx1`/`mx2.hostinger.com`), the SPF TXT
   (`v=spf1 include:_spf.mail.hostinger.com ~all`), 3 DKIM CNAMEs and a
   DMARC record. **This is the SPF/DKIM launch-checklist item from the
   README — done for you.** Allow up to 24 h.
2. Create the mailbox, e.g. `orders@yourdomain.com`, with a strong password.
3. In the shop admin → **Settings → Email**, enter:

   | Field | Value |
   |---|---|
   | SMTP host / port | `smtp.hostinger.com` / `465` (SSL) |
   | IMAP host / port | `imap.hostinger.com` / `993` (SSL) |
   | Username | the full address (`orders@yourdomain.com`) |
   | Password | the mailbox password (stored encrypted, write-only) |
   | From address | `orders@yourdomain.com` |

   No app password exists or is needed — Hostinger enables plain
   IMAP/SMTP for external apps by default. (If your account has legacy
   **Titan** email instead, the hosts are `imap.titan.email` /
   `smtp.titan.email`, same ports.)
4. Use the **"Send test email to me"** panel to prove the credentials, then
   place a test order end-to-end.

Sending limits: 1,000/day on the cheapest tier, 100 recipients/message —
roughly 30× this shop's expected volume. The admin's Mail view reads the
same mailbox over IMAP, so replies and customer history work from day one.

---

## 7. Why not run our own mail server on the VPS?

Hostinger is unusually permissive here — outbound port 25 is **not** blocked
(official policy), reverse-DNS/PTR is self-service in hPanel, and Hostinger
even publishes self-hosted-mail tutorials. Technically, `docker-mailserver`
would run fine on any plan.

The problem is reputation, not technology: budget-VPS IP ranges are heavily
blacklisted (the majority of Hostinger's AS47583 IPs appear on at least one
blocklist), Hostinger's own policy makes **delisting your job** and offers
no IP swap, and outbound mail is capped at 5/minute. For a shop whose order
confirmations *must* arrive, a $1.59/mo mailbox with provider-managed IP
reputation, SPF and DKIM is the correct trade. Revisit self-hosting only if
volume outgrows the hosted tiers — the appendix below sketches the path.

---

## 8. After it's running — admin checklist

In order, in the admin:

1. **Settings → Company** — real name, legal entity, address, phone,
   registration numbers, returns address, policy numbers. Everything
   (emails, schema.org, policy pages, footer) derives from here.
2. **Settings → Brand & Theme** — logos + palette.
3. **Settings → Stripe** — paste the live secret key, publishable key and
   webhook secret (write-only, encrypted). In the Stripe dashboard: add a
   webhook endpoint for `https://yourdomain.com/api/payments/stripe/webhooks`
   (the admin page lists exactly which events to enable) and set the
   Checkout business name + branding.
4. **Settings → Email** — §6 above.
5. **Settings → Analytics** — GA4 measurement ID; leave the consent banner
   ON for EU traffic.
6. **Settings → Google Merchant Center** — save once (mints the feed
   token), then paste the Export tab's feed URL into Merchant Center →
   Data sources → **Scheduled fetch**. See the README's Merchant section.
7. Policy pages: if you seeded, they exist — read them; terms/privacy need
   a lawyer's pass for your jurisdiction before launch.

---

## 9. Backups — do not rely on Hostinger's free tier

Hostinger's free VPS backups are **weekly** full-server images (daily is a
paid upgrade), and a snapshot is a single manual image that expires after a
day. Weekly granularity is too coarse for an order database. Add a nightly
dump:

```bash
mkdir -p ~/backups
crontab -e
# 03:30 nightly: dump the DB and uploaded media, keep 14 days
30 3 * * * pg_dump "$DATABASE_URL" | gzip > ~/backups/db-$(date +\%F).sql.gz && find ~/backups -name 'db-*.gz' -mtime +14 -delete
40 3 * * * tar czf ~/backups/media-$(date +\%F).tgz -C ~/shop/public media && find ~/backups -name 'media-*.tgz' -mtime +14 -delete
```

Periodically copy `~/backups` somewhere off the VPS. Keep the weekly
Hostinger image on top as disaster recovery — it restores the whole box.

---

## 10. Updating the shop

```bash
cd ~/shop && git pull
pnpm install --ignore-workspace   # only if dependencies changed
pnpm build                        # the RAM peak — on KVM 2, build off-box instead
pm2 restart shop
```

Content changes (products, prices, pages) need **no** rebuild — the ISR
hooks purge affected pages automatically. Rebuilds are only for code.

---

## Appendix — self-hosting mail anyway

If you later insist on the VPS being its own mail server:

- Confirmed possible on Hostinger: port 25 open (no unblock ticket needed),
  PTR record self-service in hPanel next to the VPS IP.
- Use **docker-mailserver** (runs in ~2 GB RAM; Mailcow's official minimum
  is 6 GiB + swap — it does not fit KVM 2 alongside the shop).
- You must set the PTR to your mail hostname, keep SPF/DKIM/DMARC
  immaculate, warm the IP slowly, and check blocklists (mxtoolbox) —
  **delisting is on you**, and Hostinger will not swap the IP.
- The 5 emails/minute VPS rate cap is fine at transactional volume.
- The shop config stays identical either way: Settings → Email just points
  at `localhost`/your hostname instead of `smtp.hostinger.com` — nothing in
  the template assumes any particular provider.
