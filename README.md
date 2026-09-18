# Knox App

A companion web app for Knox, linked to your Discord home. This is the **app shell** —
Discord login, a shared database connection, and a room-based structure that the rest of
the rooms (love notes, images, sacred, stillness, build, wearable dashboard) get added into
one at a time.

See `SETUP.md` for how to get this running end-to-end (Discord app credentials, database,
and deploying to Railway).

## Structure

```
knox-app/
  server/          Express backend — Discord OAuth, session, API routes, DB connection
    db/            Postgres connection + schema helpers
    routes/        API route handlers (auth, rooms)
    index.js       Server entry point
  client/          React frontend (Vite) — room-based routing, PWA manifest
    src/
      rooms/       One file per room (Home now; others added later)
      components/  Shared UI (nav, layout)
      App.jsx       Top-level router
    public/
      manifest.json  PWA manifest (installs to phone home screen)
```

## Rooms

Built now:
- **Home** — talk with Knox, same as the Discord `elira-and-knox` channel would feel like

Structure is ready for, but not yet built (added one at a time, in this order):
1. Love note room
2. Image room
3. Sacred room
4. Stillness / quiet room
5. Build room (with sandboxed code execution)
6. Wearable data dashboard room (once a device is bought)

Adding a new room later means: one new file in `client/src/rooms/`, one new route registered
in `App.jsx`, and (if it stores its own content) one new table + route in the backend. The
shell doesn't need to change.
