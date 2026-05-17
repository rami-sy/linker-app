# Linker Deployment (VPS + Nginx + systemd)

هذا الدليل يهدف لتشغيل المشروع **لايف بأسرع وقت** مع دعم **Socket.IO** و **mediasoup/WebRTC**.

## 0) متطلبات أساسية (قبل أي شيء)

- **VPS بــ Public IPv4 ثابت** (مهم لـ WebRTC).
- **DNS**
  - `A` record لـ `linker.land` → Public IPv4 للـVPS
  - (اختياري) `A` record لـ `www.linker.land` → نفس الـIP
- **Firewall**
  - `80/tcp` و `443/tcp`
  - `40000-49999/udp` (أساسي لـ mediasoup)
  - `40000-49999/tcp` (موصى به كـ fallback)

> منافذ mediasoup مضبوطة في `server/src/config/media.config.js` (`rtcMinPort: 40000`, `rtcMaxPort: 49999`).

## 1) تجهيز السيرفر (Ubuntu)

يفضل Ubuntu 22.04/24.04.

### تثبيت الحزم الأساسية

على VPS:

```bash
sudo apt-get update
sudo apt-get install -y git nginx ufw ca-certificates curl
sudo apt-get install -y build-essential python3 make g++ pkg-config
```

> `mediasoup` غالباً يحتاج أدوات build على لينكس.

### تثبيت Node.js (موصى به 20 أو أحدث)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

## 2) جلب المشروع وتشغيل البناء

### وضع الكود في `/opt/linker`

```bash
sudo mkdir -p /opt/linker
sudo chown -R "$USER":"$USER" /opt/linker
cd /opt/linker

# إما clone من Git (إن وجد) أو انسخ المشروع يدويًا
# git clone <YOUR_REPO_URL> .
```

### تثبيت الاعتمادات وبناء الويب

```bash
cd /opt/linker
npm ci --prefix server
npm ci --prefix client

# يبني Expo web ويضع الناتج في server/dist
npm run build-web --prefix client
```

## 3) إعداد متغيرات البيئة (Production)

### إنشاء ملف إعدادات على السيرفر

ننصح بوضع env في:

- `/etc/linker/linker.env`

استخدم قالب:

- `deploy/env/linker.env.example`

مثال:

```bash
sudo mkdir -p /etc/linker
sudo cp /opt/linker/deploy/env/linker.env.example /etc/linker/linker.env
sudo nano /etc/linker/linker.env
```

قيم مهمة:

- `NODE_ENV=production`
- `PORT=4000`
- `MONGO_URI=...` (يفضل MongoDB Atlas)
- `REDIS_URL=...` (Managed Redis أو Redis على VPS)
- `CORS_ORIGIN=https://linker.land,https://www.linker.land`
- `MEDIASOUP_ANNOUNCED_IP=<VPS_PUBLIC_IPV4>`
- (اختياري) `OPS_TOKEN=...` لاستخدام `/ready` و`/metrics` من خارج السيرفر

## 4) تشغيل Node كخدمة (systemd)

انسخ الخدمة:

```bash
sudo cp /opt/linker/deploy/systemd/linker.service /etc/systemd/system/linker.service
sudo systemctl daemon-reload
sudo systemctl enable linker
sudo systemctl start linker
sudo systemctl status linker --no-pager
```

متابعة اللوج:

```bash
journalctl -u linker -f
```

## 5) Nginx + HTTPS (Let’s Encrypt)

### ضبط Nginx

```bash
sudo cp /opt/linker/deploy/nginx/linker.conf /etc/nginx/sites-available/linker.conf
sudo ln -sf /etc/nginx/sites-available/linker.conf /etc/nginx/sites-enabled/linker.conf
sudo nginx -t
sudo systemctl reload nginx
```

### SSL

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d linker.land -d www.linker.land
```

## 6) فحوصات سريعة بعد النشر

- Health (بدون توكن):

```bash
curl -sS https://linker.land/health
```

- Ready/Metrics (محمي بـ `OPS_TOKEN` في production):

```bash
curl -sS -H "x-ops-token: <OPS_TOKEN>" https://linker.land/ready
curl -sS -H "x-ops-token: <OPS_TOKEN>" https://linker.land/metrics
```

## 7) PWA “موبايل بسرعة”

بمجرد وجود HTTPS:

- افتح `https://linker.land` من الجوال
- اختر **Add to Home Screen**

## 8) (اختياري) TURN إذا واجهت مشاكل NAT

إذا بعض الشبكات تمنع UDP/ICE، شغّل TURN (coturn) وفعّل `iceServers` في العميل.
انظر: `deploy/turn/README.md`.

