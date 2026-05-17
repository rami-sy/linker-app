# systemd service (Linker)

## Install

```bash
sudo mkdir -p /etc/linker
sudo cp /opt/linker/deploy/env/linker.env.example /etc/linker/linker.env
sudo nano /etc/linker/linker.env

sudo cp /opt/linker/deploy/systemd/linker.service /etc/systemd/system/linker.service
sudo systemctl daemon-reload
sudo systemctl enable linker
sudo systemctl start linker
sudo systemctl status linker --no-pager
```

## Logs

```bash
journalctl -u linker -f
```

