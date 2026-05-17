# Managed services (MongoDB + Redis)

To get live quickly, prefer managed services.

## MongoDB (Atlas)

1. Create a cluster in MongoDB Atlas.
2. Create a database user.
3. Add network access:
   - Quick option: allow `0.0.0.0/0` temporarily (not recommended long-term).
   - Better: allow only your VPS public IP.
4. Copy the connection string and set:

```bash
MONGO_URI="mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority"
```

## Redis (Managed)

Options:

- Upstash Redis
- Redis Cloud

Set:

```bash
REDIS_URL="redis://:<password>@<host>:<port>"
```

## If you must self-host Redis on the VPS (fast fallback)

```bash
sudo apt-get update
sudo apt-get install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

Then set:

```bash
REDIS_URL="redis://127.0.0.1:6379"
```

