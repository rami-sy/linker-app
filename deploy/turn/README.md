# TURN (coturn) — optional but recommended for strict NAT networks

If some users cannot connect on certain networks (corporate WiFi, carrier NAT), TURN helps by relaying media.

## 1) Open firewall ports (TURN)

- `3478/udp` and `3478/tcp` (TURN)
- (Optional) `5349/tcp` (TURN over TLS)
- Relay ports range (choose one range and open it). Example:
  - `49152-65535/udp` (common default)

> You already open `40000-49999` for mediasoup. TURN relay ports are separate.

## 2) Install coturn

```bash
sudo apt-get update
sudo apt-get install -y coturn
```

Enable service:

```bash
sudo sed -i 's/^#\\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
```

## 3) Configure `/etc/turnserver.conf`

Minimal example:

```conf
listening-port=3478
fingerprint
lt-cred-mech

server-name=linker.land
realm=linker.land

user=linkeruser:strongpassword

listening-ip=<VPS_PRIVATE_IP_OR_0.0.0.0>
external-ip=<VPS_PUBLIC_IPV4>

min-port=49152
max-port=65535

no-multicast-peers
no-loopback-peers
```

Restart:

```bash
sudo systemctl restart coturn
sudo systemctl status coturn --no-pager
```

## 4) Configure the client (Expo public env)

The client now supports injecting ICE servers into mediasoup transports.

### Option A (recommended): JSON

Set one env var during build:

```bash
EXPO_PUBLIC_ICE_SERVERS_JSON='[
  {"urls":["stun:stun.l.google.com:19302"]},
  {"urls":["turn:linker.land:3478?transport=udp","turn:linker.land:3478?transport=tcp"],"username":"linkeruser","credential":"strongpassword"}
]'
```

### Option B: simple vars

```bash
EXPO_PUBLIC_STUN_URLS="stun:stun.l.google.com:19302"
EXPO_PUBLIC_TURN_URLS="turn:linker.land:3478?transport=udp,turn:linker.land:3478?transport=tcp"
EXPO_PUBLIC_TURN_USERNAME="linkeruser"
EXPO_PUBLIC_TURN_CREDENTIAL="strongpassword"
```

Then rebuild web:

```bash
npm run build-web --prefix client
```

