# 🌑 UmbraMMO

> A browser-based MMORPG built with Node.js and WebSockets — playable entirely in the browser, no downloads required.

---

## 📖 About the Project

**UmbraMMO** (also known as *Umbra Online*) is an open-source, browser-based MMORPG originally created by **AndreplaysGamezitos**.  
The game was shared publicly in a [YouTube community post](https://www.youtube.com/post/Ugkx4GDUbs7AqOVHlvOeNzWgkJtpG1-BCbr4) and the original creator's GitHub profile can be found at [github.com/AndreplaysGamezitos](https://github.com/AndreplaysGamezitos/).

The project features a real-time multiplayer world where players can explore, fight monsters and bosses, level up, use skills, equip items, and interact with other players — all through their web browser.

---

## ✨ Features

- 🌐 **Fully browser-based** — no client download needed
- ⚡ **Real-time multiplayer** via WebSockets
- ⚔️ **Combat system** — PvE combat with mobs and boss encounters
- 🧙 **Skills & abilities** — skill manager with multiple abilities per class
- 🎒 **Inventory & equipment system** — items, weapons, and gear
- 🗺️ **Map editor** — built-in admin tool for world building (can be enabled/disabled via config)
- 👤 **Authentication** — player registration and login with encrypted passwords (bcrypt)
- 💾 **Persistent data** — SQLite database for characters, inventory, progress, and world state
- 🛡️ **Security** — rate limiting, origin validation, and per-IP connection limits
- 📦 **PM2 ready** — production process management out of the box

---

## 🏗️ Architecture

```
UmbraMMO/
├── client/             # Frontend (HTML + CSS + Vanilla JS)
│   ├── index.html      # Game entry point
│   ├── css/            # Stylesheets
│   ├── js/
│   │   ├── main.js     # Core game logic
│   │   ├── engine/     # Rendering engine
│   │   ├── net/        # WebSocket networking layer
│   │   ├── ui/         # HUD and interface components
│   │   └── editor/     # Map editor (admin only)
│   └── assets/         # Sprites, sounds, and other assets
├── server/             # Backend (Node.js)
│   ├── server.js       # Main server entry point
│   ├── config.js       # Environment configuration loader
│   ├── auth.js         # Player authentication
│   ├── database.js     # SQLite data layer
│   ├── combatManager.js  # Combat logic
│   ├── bossManager.js    # Boss AI and encounters
│   ├── mobManager.js     # NPC/mob behavior
│   ├── skillManager.js   # Skills and abilities
│   ├── itemManager.js    # Item handling
│   ├── security.js       # Rate limiting & origin checks
│   └── package.json
├── shared/
│   └── constants.js    # Shared constants (client & server)
├── sql/
│   └── schema.sql      # Database schema
├── ecosystem.config.js # PM2 process config
└── DEPLOYMENT.md       # Full VPS deployment guide
```

---

## 🚀 Getting Started (Local Development)

### Prerequisites

- [Node.js](https://nodejs.org/) **v20.x (LTS)** or higher
- `npm` (comes with Node.js)

### 1. Clone the repository

```bash
git clone https://github.com/cookieukw/UmbraMMO.git
cd UmbraMMO
```

### 2. Install server dependencies

```bash
cd server
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` to match your setup. For local development, the defaults work fine:

```env
NODE_ENV=development
PORT=3000
WS_PATH=/ws
```

> ⚠️ If you want to use the map editor, set `ENABLE_MAP_EDITOR=true` and provide a strong `ADMIN_MAP_PASSWORD` in `.env`.

### 4. Run the server

```bash
# Development (with auto-reload on file changes)
npm run dev

# Or standard start
npm start
```

### 5. Open the game

Open your browser and navigate to:

```
http://localhost:3000
```

The server serves the client files automatically — no separate frontend server needed.

---

## 🗄️ Database

UmbraMMO uses **SQLite** for data persistence. The database file is created automatically on first run.  
The full schema is located at [`sql/schema.sql`](./sql/schema.sql) and includes tables for players, characters, inventory, world state, and more.

To promote a player to admin, use the helper script:

```bash
cd server
node make-admin.js <username>
```

---

## 🛠️ Tech Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Frontend   | HTML5, Vanilla CSS, Vanilla JS      |
| Backend    | Node.js, Express                    |
| Networking | WebSockets (`ws` library)           |
| Database   | SQLite (`sqlite3`)                  |
| Auth       | bcrypt                              |
| Process    | PM2 (production)                    |
| Proxy      | Nginx (production)                  |

---

## 🌐 Production Deployment (VPS)

For a full guide on deploying to a VPS (Ubuntu 22.04) with Nginx, SSL, and PM2, see **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

**Quick overview:**

```bash
# Install PM2 globally
npm install -g pm2

# Start the server with PM2
pm2 start ecosystem.config.js --env production

# Persist across reboots
pm2 save
pm2 startup
```

The `ecosystem.config.js` is preconfigured with:
- **App name:** `umbra-online`
- **Port:** `3000`
- **Max memory restart:** `500MB`
- **Auto-restart:** enabled

---

## 🔒 Security

See [SECURITY.md](./SECURITY.md) for the project's security policy and how to report vulnerabilities.

Key security features built into the server:
- Per-IP connection limit (default: 5)
- Message rate limiting (default: 10 messages/second)
- Optional CORS origin allowlist
- bcrypt password hashing
- Map editor disabled by default in production

---

## 🤝 Contributing

This project was originally shared as a community resource. Feel free to fork, modify, and build on top of it.  
If you improve the game, consider opening a pull request or sharing your changes back with the community!

---

## 📜 Credits

**Original Creator:** [AndreplaysGamezitos](https://github.com/AndreplaysGamezitos/)  
Originally announced on the [YouTube community post](https://www.youtube.com/post/Ugkx4GDUbs7AqOVHlvOeNzWgkJtpG1-BCbr4).

---

## 📄 License

This project is licensed under the **ISC License**. See [`server/package.json`](./server/package.json) for details.
