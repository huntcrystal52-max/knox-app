# Setting up the Knox app

This gets the app shell running: Discord login, connected to Knox's existing database, deployed
on Railway. Do these in order — each step needs the one before it.

## 1. Create the GitHub repo

1. On GitHub, create a new repository (e.g. `knox-app`), separate from `Knox-bot`.
2. On your machine/Chromebook, or directly on GitHub, add all the files from this folder to it.
3. Commit and push.

## 2. Register a Discord OAuth app (or reuse Knox-bot's)

You can reuse Knox-bot's existing Discord application rather than making a new one.

1. Go to https://discord.com/developers/applications
2. Open the Knox-bot application (or create a new one if you'd rather keep them separate).
3. Go to **OAuth2 > General**. Copy the **Client ID** and **Client Secret** — you'll need these
   in step 5.
4. Go to **OAuth2 > Redirects** and add:
   - `http://localhost:3001/auth/discord/callback` (for testing on your own machine)
   - `https://<your-railway-app>.up.railway.app/auth/discord/callback` (add this once you know
     your Railway URL from step 4 — you can come back and add it after)

## 3. Get your Discord user ID

1. In Discord, go to **Settings > Advanced** and turn on **Developer Mode**.
2. Right-click your own username anywhere and choose **Copy User ID**.
3. Keep this — it goes in `ALLOWED_DISCORD_IDS` so only you can log in.

## 4. Create the Railway project

1. In Railway, create a **new project** (separate from Knox-bot's project, but you'll connect
   it to the same database).
2. Add a service: **Deploy from GitHub repo**, pick the `knox-app` repo.
3. Since this repo has two apps in it (`server/` and `client/`), you'll actually want **two**
   Railway services from this one repo:
   - One service with **Root Directory** set to `server` — this is the backend
   - One service with **Root Directory** set to `client` — this is the frontend
4. Note the backend service's public URL once it deploys (Railway gives you one automatically,
   or you can set a custom domain). You'll need it in step 5 and to add it to Discord's redirect
   list from step 2.

## 5. Connect it to Knox's existing database

1. In your **Knox-bot** Railway project, open the Postgres database service and find its
   **connection variables** (look for `DATABASE_URL` or the individual host/port/user/password).
2. In your new **knox-app** backend service (from step 4), go to **Variables** and either:
   - Reference the same database by copying its `DATABASE_URL` value across, or
   - If Railway offers "variable references" between projects in your account, use that so it
     always stays in sync.

## 6. Set environment variables

On the **backend** service (`server`), add these variables (see `server/.env.example` for the
full list with explanations):

| Variable | Value |
|---|---|
| `DATABASE_URL` | From step 5 |
| `DISCORD_CLIENT_ID` | From step 2 |
| `DISCORD_CLIENT_SECRET` | From step 2 |
| `DISCORD_REDIRECT_URI` | `https://<your-backend-url>/auth/discord/callback` |
| `ALLOWED_DISCORD_IDS` | Your Discord user ID from step 3 |
| `SESSION_SECRET` | Any long random string (Railway can generate one, or run the command in `.env.example`) |
| `CLIENT_URL` | Your frontend service's URL from step 4 |

On the **frontend** service (`client`), add:

| Variable | Value |
|---|---|
| `VITE_API_URL` | Your backend service's URL from step 4 |

Redeploy both services after setting these so they pick up the new variables.

## 7. Add real app icons (optional, can do later)

`client/public/icon-192.png` and `icon-512.png` are placeholder icons right now (a simple ring
shape) so the PWA manifest has something valid to point at. Swap them for real artwork whenever
you have it — same filenames, same folder.

## 8. Try it

1. Visit your frontend's Railway URL on your phone.
2. Log in with Discord.
3. You should land on the home room.
4. On iPhone: tap Share > **Add to Home Screen**. On Android Chrome: tap the menu > **Install
   app** (or you'll get an automatic install prompt). It'll open full-screen from your home
   screen from then on.

## Testing locally first (optional but recommended)

Before deploying, you can run it on your own machine to make sure Discord login works:

```bash
# Terminal 1
cd server
cp .env.example .env   # fill in the values
npm install
npm run dev

# Terminal 2
cd client
cp .env.example .env
npm install
npm run dev
```

Then visit `http://localhost:5173`. Local testing needs `http://localhost:3001/auth/discord/callback`
added as a redirect in Discord (step 2 already covers this).

## What's next

Once this is live and you can log in and see the home room, the next room to add is the first of
the simple content rooms (love notes, images, sacred, stillness) — they all reuse the same
`room_content` table and `/api/rooms/:room` routes already built into this shell, so adding one
is mostly a new frontend page rather than new backend work.
