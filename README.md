# SVIA Code Challenge

A timed Python puzzle game for the open day. Visitors pick a level, solve randomly generated questions as fast as possible, and their time appears on a live leaderboard screen.

- **3 levels**: Easy, Medium and Hard, with three question types: *predict the output*, *fill the blank* and *fix the bug*
- **Unique questions for every player**: 28 templates randomize names, numbers, operators, data and structure
- **Hint bot "Byte"** in the bottom-right corner. Each hint adds a time penalty
- **Leaderboard display** (`/leaderboard`) rotates between the three levels, updates live, and shows a QR code so visitors can join
- **Settings** (`/settings`, PIN protected): language, theme, penalties, questions per level, question types, leaderboard reset and CSV export
- Dutch/English UI, dark/light theme, and pages that never scroll

## Running it

Requires Node 20+.

```bash
npm install
npm start
```

This builds the client and serves everything on **http://localhost:3000**. The console prints the network address that other devices (play laptops, the leaderboard TV) should open.

| Screen | URL |
|---|---|
| Game (one per play station) | `http://<ip>:3000/` |
| Leaderboard display | `http://<ip>:3000/leaderboard` |
| Settings | `http://<ip>:3000/settings` |

Before the open day, copy `server/.env.example` to `server/.env` and **change `ADMIN_PIN`**. The default is `1234`. If the QR code shows the wrong address, set `PUBLIC_URL`.

Scores are stored in `server/data/challenge.db` (SQLite). Delete that file, or use *Reset* in settings, to start fresh.

## Hosting with Docker

The image serves the whole app (game, leaderboard, settings) from one container. Scores and settings live in a Docker volume, so they survive restarts and rebuilds.

On your server:

```bash
git clone https://github.com/Thomasv-Z/code-challenge-opendag.git
cd code-challenge-opendag
cp .env.example .env      # set ADMIN_PIN (required) and PUBLIC_URL
docker compose up -d --build
```

The app is now on port 3000 (change it with `HOST_PORT`). To update later, run `git pull && docker compose up -d --build`.

### HTTPS / reverse proxy

Put it behind your existing reverse proxy. The proxy must pass through **WebSocket upgrades on `/ws`**; that's how the live leaderboard updates arrive.

Caddy (HTTPS automatically):

```
challenge.example.com {
    reverse_proxy localhost:3000
}
```

nginx:

```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

Set `PUBLIC_URL` in `.env` to the public address (e.g. `https://challenge.example.com`). Inside Docker the server can't see its own public address, so this is what the leaderboard QR code uses when the display is opened via `localhost`.

### Optional: frontend on GitHub Pages

The container already serves the frontend, so this is only needed if you also want the game at `thomasv-z.github.io`. The server must be reachable over **HTTPS**, since browsers block a Pages site from calling a plain-HTTP API.

1. In `.env`, set `CORS_ORIGIN=https://thomasv-z.github.io` and restart the container.
2. In the GitHub repo, go to **Settings → Secrets and variables → Actions → Variables** and add `API_URL` with your server's HTTPS address.
3. Go to **Settings → Pages → Source** and choose **GitHub Actions**.
4. Push to `main`. The workflow builds and publishes to `https://thomasv-z.github.io/code-challenge-opendag/`.

## Development

```bash
npm run dev        # API on :3000 + Vite on :5173 with hot reload
npm test           # engine + server tests
npm run typecheck
```

The test suite runs every question template through real Python (when `python` is on PATH) across hundreds of seeds. It checks that each computed answer matches CPython's actual output, and that every wrong multiple-choice option really is wrong.

## How it works

```
shared/   question engine: seeded RNG, 28 templates, answer checking (used by server)
server/   Express + SQLite + WebSocket: runs, scoring, leaderboard, settings
client/   React + Vite: game, hint bot, leaderboard display, settings
```

- The server creates a random seed per run and generates the questions from it. The client only ever receives questions **without answers**. Each answer is checked on the server.
- Times are measured with **server timestamps** plus penalties, so the client timer is display-only.
- Names don't have to be unique: every finished run gets its own leaderboard entry.

### Adding a question template

Add a `Template` to `shared/src/templates/{easy,medium,hard}.ts`. `generate(rng)` returns the Python `code`, the `answer`, three `hints` (NL + EN), optional `choices`, and a `verify` program with its exact output. Then run `npm test`: the Python cross-check will catch any answer that doesn't match what Python actually prints.
