# Development Troubleshooting

## Metro Cache And Config Changes

Restart Metro after changing `client/metro.config.js`:

```bash
cd client
npx expo start --clear --web
```

If Metro reports stale modules or `EMFILE: too many open files`, stop the dev
server and clear cache:

```bash
rm -rf node_modules/.cache
rm -rf /c/Users/rami/AppData/Local/Temp/metro-cache
cd client
npx expo start --clear --web
```

## WebRTC Warning

This warning is non-fatal:

```text
Attempted to import event-target-shim/index...
```

`client/metro.config.js` maps `event-target-shim/index` directly to the
package entry to avoid Metro fallback warnings. Restart Metro with `--clear`
after config changes.

## Shared Contracts

Client imports shared contracts via:

```js
require("@linker/shared/errorCodes")
```

Server imports them via relative paths from `shared/`. If client resolution
fails, check `watchFolders` and `extraNodeModules` in `client/metro.config.js`.

## MediaSoup Workers

Local development should use a small worker count:

```bash
MEDIASOUP_WORKERS=2
```

If unset, development defaults to at most 2 workers. Production defaults to CPU
count when `MEDIASOUP_WORKERS` is omitted.

## Redis And Mongo

The server expects MongoDB and Redis to be reachable from the values in
`server/.env` or `server/env.example`.

Common symptoms:

- Socket sessions repeatedly reconnect: check Redis.
- API startup fails: check Mongo URI and credentials.
- Queue/push work does not process: check Redis and Bull logs.

## Socket Reconnect Debugging

Use log levels to reduce noise:

```bash
LOG_LEVEL=warn
EXPO_PUBLIC_LOG_LEVEL=warn
```

Temporarily enable verbose MediaSoup logs:

```bash
MEDIASOUP_DEBUG=true
EXPO_PUBLIC_MEDIASOUP_DEBUG=true
```

## Fast Validation Without Tests

Use this when you want lint/export/audit only:

```bash
npm run ci:no-tests
```

This is a fast validation path and does not replace the full test pipeline. It
prints high-severity audit output but is allowed to complete while known
dependency advisories are triaged.
