# Deployment checks

## Server health

```bash
chmod +x deploy/checks/verify.sh
DOMAIN=linker.land ./deploy/checks/verify.sh
```

## Ready/Metrics (production)

Set `OPS_TOKEN` in `/etc/linker/linker.env`, then:

```bash
OPS_TOKEN="<OPS_TOKEN>" DOMAIN=linker.land ./deploy/checks/verify.sh
```

## WebRTC sanity test (manual)

1. Open the web app on **two devices on different networks** (e.g. WiFi + 4G).
2. Start a call and verify:
   - both peers connect
   - audio/video flows
3. If one side never connects, verify:
   - UFW rules opened `40000-49999/udp`
   - `MEDIASOUP_ANNOUNCED_IP` is your **VPS public IPv4**
   - consider enabling TURN (see `deploy/turn/README.md`)

