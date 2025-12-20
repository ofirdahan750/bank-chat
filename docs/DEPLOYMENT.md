# FILE: docs/DEPLOYMENT.md

# Deployment

This repo typically deploys as:
- Client → static hosting (example: Netlify)
- Server → container hosting / Node hosting (example: Koyeb)

Exact providers can vary; the important parts are:
- client must know server socket URL
- server must allow CORS origins for the deployed client URL

## 1) Client Deployment Notes
- Client must be built with:
~~~bash
npx nx build client
~~~
- Deploy the output folder produced by Nx (depends on Nx/angular config).
- The client uses AppConfig.SOCKET_URL and the runtime page protocol:
  - If the page is HTTPS and socket URL is non-local, it forces HTTPS (WSS)
  - It trims trailing slashes

## 2) Server Deployment Notes
- Server exposes:
  - GET /health for health checks
  - Socket.IO for chat
- CORS origins must include:
  - localhost dev URL
  - deployed client origin URL

Server entry:
- apps/server/src/main.ts

Socket handling:
- libs/server/socket-handler/src/lib/socket-handler.ts

## 3) Persistence in Production
Server persists JSON DB to a path derived from:
- SERVER_PERSISTENCE_CONFIG.DATA_DIR_NAME
- SERVER_PERSISTENCE_CONFIG.DB_FILE_NAME

If the hosting platform uses ephemeral filesystem:
- persistence resets on redeploy / restart

If it uses a persistent volume:
- data survives redeploy until you delete/reset it

## 4) Reset Chat / Bot Memory (Server)
This project stores all history + bot memory in the persisted JSON DB file.

To fully reset:
1) Stop the server
2) Delete the DB file:
   - ./<DATA_DIR_NAME>/<DB_FILE_NAME>
3) Start server again

Example (adjust names to your config):
~~~bash
rm -f ./.poalim-data/chat-db.json
~~~

If you cannot access the filesystem directly on the platform:
- remove / recreate the attached volume, or
- add a one-time admin operation during deployment that deletes the file (only if allowed by your rules)
