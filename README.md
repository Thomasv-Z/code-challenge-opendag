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
- The leaderboard keeps the best time per name.

### Adding a question template

Add a `Template` to `shared/src/templates/{easy,medium,hard}.ts`. `generate(rng)` returns the Python `code`, the `answer`, three `hints` (NL + EN), optional `choices`, and a `verify` program with its exact output. Then run `npm test`: the Python cross-check will catch any answer that doesn't match what Python actually prints.
