# FILE: docs/ARCHITECTURE.md

# Architecture Overview

## 1) High Level

### Client (Angular)
- Entry: apps/client/src/app/*
- Feature Chat UI: client/src/lib/feature-chat/*
- Client data access:
  - Socket client: libs/client/data-access/src/lib/socket-client/socket-client.ts
  - Local storage: libs/client/data-access/src/lib/local-storage/local-storage.ts
- Shared types: libs/shared/interfaces/src/lib/*
- Shared constants/text/config: shared/constants/* (exported via @poalim/constants)

### Server (Node + Socket.IO)
- Entry: apps/server/src/main.ts
- Socket handler: libs/server/socket-handler/src/lib/socket-handler.ts
- Bot engine: libs/server/bot-engine/src/lib/bot-engine/bot-engine.ts

## 2) Socket Event Flow

### Client → Server
- JOIN_ROOM: client joins a room with its user snapshot
- SEND_MESSAGE: send a message for persistence + broadcast
- EDIT_MESSAGE: edit a previously sent message (only author allowed)
- TOGGLE_REACTION: toggle a reaction key on a message

### Server → Client
- ROOM_HISTORY: snapshot of messages for the room
- NEW_MESSAGE: broadcast new message to room
- MESSAGE_UPDATED: broadcast updated message (edits / reactions / bot overwrite)
- BOT_TYPING: boolean typing indicator for the bot

Event names are centralized in @poalim/constants under SocketEvents.

## 3) Persistence Model (Server)

The server persists room state to a JSON file on disk.

### What is persisted
Per room:
- messages: bounded history (max N messages)
- botMemory: bot engine room memory (Q/A + pending state)
- botReplies: mapping of userMessageId → botMessageId so bot replies can be updated in-place

Type definitions:
- PersistedDb, PersistedRoom in libs/shared/interfaces/src/lib/sockets/chat-db.types.ts

### Where it is persisted
Implementation is in:
- libs/server/socket-handler/src/lib/socket-handler.ts

Directory + filename is controlled by constants:
- SERVER_PERSISTENCE_CONFIG.DATA_DIR_NAME
- SERVER_PERSISTENCE_CONFIG.DB_FILE_NAME

On disk it becomes something like:
- ./<DATA_DIR_NAME>/<DB_FILE_NAME>

## 4) Bot Engine (Learning Q/A)

Location:
- libs/server/bot-engine/src/lib/bot-engine/bot-engine.ts

Behavior:
- Bot only reacts to non-bot messages.
- A message is treated as a question only if it ends with '?'.
- When user asks an unknown question:
  1) bot asks user to provide an answer next
  2) the next user message that is NOT a question becomes the learned answer
- If user edits:
  - editing an answer updates stored answer
  - editing a question updates key/mappings and can trigger immediate answer if it ends with '?'

Room memory:
- pending: waiting for answer (or null)
- qaByKey: normalized question → entry
- keyByQuestionMessageId, keyByAnswerMessageId: links message IDs back to stored entry

## 5) Client ChatStore (State + Optimistic UI)

Location:
- client/src/lib/feature-chat/services/chat-store/chat-store.service.ts

Responsibilities:
- Owns UI state for chat and delegates socket work to SocketClientService
- Nickname persistence via LocalStorageService
- Optimistic updates for send/edit/reactions so UI feels instant
- Effects subscribe to socket signals:
  - ROOM_HISTORY snapshot
  - NEW_MESSAGE push
  - MESSAGE_UPDATED push

Rules:
- User must have a valid nickname (>= MIN_USERNAME_LENGTH) to send messages
- Only author can edit a message (also enforced server-side)
- Reactions are toggled per user id
