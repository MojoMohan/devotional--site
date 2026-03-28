# Devotional Site Deployment

## Railway

This repository is ready for a full Railway deployment from the repo root.

### What is already configured

- `railway.json` builds and starts the app from `server/`
- `server/server.js` reads `PORT` from Railway
- `server/server.js` exposes `GET /health` for Railway health checks
- `server/server.js` supports `DATABASE_PATH` so SQLite can live on a mounted volume
- sessions are proxy-aware for HTTPS production traffic

### Railway setup

1. Push this repository to GitHub.
2. In Railway, create a new project from the GitHub repo.
3. Add a volume and mount it to `/data`.
4. Set `DATABASE_PATH=/data/devotional/data.db`.
5. Set the rest of the environment variables from `server/.env.example`.
6. Deploy.

### Required environment variables

- `SESSION_SECRET`
- `DATABASE_PATH`

### Optional environment variables

- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLIC_KEY`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `TIDIO_PUBLIC_KEY`
- `TIDIO_WEBHOOK_SECRET`

### Health check

Railway should use:

```text
/health
```

### Important note about SQLite

Do not leave the database inside the container filesystem in production. Use a Railway volume and point `DATABASE_PATH` at that mounted path so CMS data survives redeploys.
