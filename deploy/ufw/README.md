# UFW rules (Linker + mediasoup)

## What this opens

- `22/tcp` (OpenSSH) — adjust if your SSH runs on a different port
- `80/tcp` (HTTP)
- `443/tcp` (HTTPS)
- `40000-49999/udp` (mediasoup RTP)
- `40000-49999/tcp` (mediasoup TCP fallback)

## Apply on the VPS

```bash
cd /opt/linker
chmod +x deploy/ufw/setup-ufw.sh
./deploy/ufw/setup-ufw.sh
```

## Custom RTP port range (optional)

If you changed mediasoup ports in `server/src/config/media.config.js`, run:

```bash
RTP_MIN_PORT=40000 RTP_MAX_PORT=49999 ./deploy/ufw/setup-ufw.sh
```

