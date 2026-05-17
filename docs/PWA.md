# PWA rollout (fast mobile “live”)

Because the web build is served over HTTPS from the same domain, users can install it as a PWA quickly.

## Android (Chrome)

1. Open `https://linker.land`
2. Menu → **Install app** / **Add to Home screen**
3. Confirm

## iOS (Safari)

1. Open `https://linker.land`
2. Share button → **Add to Home Screen**
3. Confirm

## Notes

- PWA requires HTTPS (already covered by Nginx + Let’s Encrypt).
- Some native capabilities differ (background execution, push behavior, etc.).

