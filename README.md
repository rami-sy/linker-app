# Linker

Social platform for chat, voice/video calls, live streaming, and user discovery.

## Stack

| Package | Tech |
| ------- | ---- |
| [`client/`](client/) | Expo 54, React Native, expo-router, Redux, Socket.IO, mediasoup-client |
| [`server/`](server/) | Express, MongoDB, Redis, Socket.IO, mediasoup |
| [`shared/`](shared/) | Shared error codes and permission constants |
| [`deploy/`](deploy/) | Nginx, systemd, TURN production configs |

## Quick start

```bash
# Install
npm install --prefix server
npm install --prefix client

# Development (both apps)
npm run dev

# Development web only after Metro config changes
cd client && npx expo start --clear --web
```

Set environment variables using [`server/env.example`](server/env.example) and [`client/env.example`](client/env.example).

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Run server + client |
| `npm run test:server` | Server Jest tests |
| `npm run test:client` | Client smoke/unit tests |
| `npm run ci` | Lint + test + web build |
| `npm run ci:no-tests` | Lint + web export + high-severity audit, without tests |
| `npm run audit:high` | Server + client npm audit at high severity |

## Security notes

- Rotate `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` if exposed; restrict in Google Cloud Console.
- Treat every `EXPO_PUBLIC_*` value as public; never put server secrets there.
- Set `ALLOW_DEV_OTP=false` in production; never enable magic OTP bypass.
- Protected uploads: `/uploads` and `/api/files` require authentication in production.
- Keep `MEDIASOUP_WORKERS=2` for local development; omit it in production to use CPU count.

## Development Notes

- Restart Metro with `--clear` after changing `client/metro.config.js`.
- If Windows/Metro throws `EMFILE: too many open files`, clear Metro cache and restart.
- `client/metro.config.js` aliases `@linker/shared` and `event-target-shim/index`.
- `npm run ci:no-tests` is only a fast validation path; it does not replace tests. It prints high-severity audit output but does not currently fail the workflow while known dependency advisories are being triaged.

## Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md) — VPS / Nginx / WebRTC ports
- [SECURITY_GUIDE.md](SECURITY_GUIDE.md) — Rate limits, CORS, env vars
- [docs/DEV_TROUBLESHOOTING.md](docs/DEV_TROUBLESHOOTING.md) — Metro, WebRTC, Redis/Mongo, and worker-count troubleshooting
- [compliance/](compliance/) — Platform compliance policy documents (private ops)

## Compliance documents

Operational policy files live in [`compliance/`](compliance/) and should not contain production secrets. Keep them in a private repo for audits when possible.
