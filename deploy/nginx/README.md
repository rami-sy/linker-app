# Nginx (reverse proxy + SSL)

## Install

```bash
sudo apt-get update
sudo apt-get install -y nginx
```

## Configure

```bash
cd /opt/linker
sudo cp deploy/nginx/linker.conf /etc/nginx/sites-available/linker.conf
sudo ln -sf /etc/nginx/sites-available/linker.conf /etc/nginx/sites-enabled/linker.conf
sudo nginx -t
sudo systemctl reload nginx
```

## SSL (Let’s Encrypt)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d linker.land -d www.linker.land
```

## Switch to HTTPS config (recommended)

After certbot finishes, replace the config with the HTTPS version:

```bash
cd /opt/linker
sudo cp deploy/nginx/linker-ssl.conf /etc/nginx/sites-available/linker.conf
sudo nginx -t
sudo systemctl reload nginx
```

## Notes

- Backend expects `TRUST_PROXY=true` in production when behind Nginx.
- Socket.IO uses WebSocket upgrade; config includes `/socket.io/` with buffering off.

