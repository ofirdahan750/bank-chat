# README.md

Poalim Challenge — Real-time Chat (Nx Monorepo)

A real-time chat application built as an Nx monorepo:
- Client: Angular (standalone components) + Signals-based store
- Transport: Socket.IO
- Server: Socket handler + JSON persistence (bounded history)
- Bot: lightweight rules-based “learn Q/A” engine (per room)

---

## Table of Contents

- Requirements
- Repo Layout
- Quick Start
- Configuration
- CLI Cheatsheet
- Testing
- Deployment
- Troubleshooting
- Documentation Map

---

## Requirements

- Node.js (LTS recommended)
- npm
- (Optional) Watchman (macOS) — can reduce file watcher issues in large repos

---

## Repo Layout

High-level structure:

- apps/client/ — Angular app shell (router, layout)
- client/src/lib/feature-chat/ — Chat feature (UI)
- client/src/lib/feature-chat/services/chat-store/ — ChatStore (state + effects + optimistic updates)
- libs/client/data-access/ — Socket client + LocalStorage wrapper
- libs/server/socket-handler/ — Socket.IO handlers + persistence
- libs/server/bot-engine/ — Bot logic (learns question/answer)
- shared/ / libs/shared-* — shared constants + interfaces

---

## Quick Start

### Install
npm install

### Discover Nx projects and targets
npx nx show projects
npx nx show project client

### Run (dev)
npx nx serve client
# server target name depends on your workspace:
# npx nx show projects
# npx nx serve <server-project>

### Build
npx nx build client
# npx nx build <server-project>

---

## Configuration

Configuration values are centralized in constants (examples used in code):
- AppConfig.SOCKET_URL
- AppConfig.ROOM_ID
- AppConfig.BOT_NAME
- AppConfig.MIN_USERNAME_LENGTH
- AppConfig.MAX_MSG_LENGTH
- ChatUi (UI limits/defaults)
- SocketEvents (event names)

---

## CLI Cheatsheet

See docs/CLI.md for a full reference.

### Nx
npx nx show projects
npx nx show project client

npx nx serve <project>
npx nx build <project>
npx nx test <project>
npx nx lint <project>

npx nx run-many -t test --all
npx nx run-many -t build --all
npx nx affected -t test

npx nx reset
npx nx graph

### Jest (direct)
npx jest path/to/file.spec.ts -c path/to/jest.config.ts

### Reset server persistence (local)
rm -rf .poalim-data
# or:
rm -f .poalim-data/chat-db.json

---

## Testing

- Client unit tests: store/services
- Server unit tests: socket-handler behavior
- Bot engine unit tests

Run:
npx nx test <project>

More details: docs/TESTING.md

---

## Deployment

See docs/DEPLOYMENT.md

---

## Troubleshooting

See docs/TROUBLESHOOTING.md

---

## Documentation Map

- docs/ARCHITECTURE.md — big picture
- docs/FEATURE_CHAT.md — UI behavior
- docs/SOCKET_PROTOCOL.md — Socket.IO events and payloads
- docs/PERSISTENCE.md — what’s stored and how to reset it
- docs/TESTING.md — test strategy + recipes
- docs/CLI.md — complete command reference
- docs/DEPLOYMENT.md — deploy notes + reset instructions
- docs/TROUBLESHOOTING.md — common issues
