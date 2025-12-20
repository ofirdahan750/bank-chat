import { randomUUID } from 'crypto';
import { Server, Socket } from 'socket.io';
import * as fs from 'fs';
import * as path from 'path';

import { AppConfig, ChatUi, SocketEvents } from '@poalim/constants';
import {
  BotReplyUpsertResult,
  BotTypingPayload,
  ChatMessage,
  EditMessagePayload,
  JoinRoomPayload,
  PersistedDb,
  RoomHistoryPayload,
  RoomId,
  SendMessagePayload,
  SocketEvent,
  User,
  emptySocketEvent,
  isSocketEventValue,
  socketEvent,
} from '@poalim/shared-interfaces';

import { BotEngine } from '../lib/bot-engine/bot-engine';

const DEFAULT_ROOM: RoomId = AppConfig.ROOM_ID as RoomId;
const MAX_HISTORY: number = 200;

const DATA_DIR: string = path.join(process.cwd(), '.poalim-data');
const DATA_FILE: string = path.join(DATA_DIR, 'chat-db.json');

const EMPTY_DB: PersistedDb = { rooms: {} };

const GUEST_USER: User = {
  id: '',
  username: '',
  isBot: false,
  color: ChatUi.USER.DEFAULT_COLOR,
};

const ensureDir = (): void => {
  // Make sure the persistence folder exists before writing
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
};

const loadDb = (): PersistedDb => {
  // Read the local json DB (best-effort; never crash the server on parse errors)
  try {
    if (!fs.existsSync(DATA_FILE)) return EMPTY_DB;

    const raw: string = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed: PersistedDb = JSON.parse(raw) as PersistedDb;

    if (!parsed || typeof parsed !== 'object' || !parsed.rooms) return EMPTY_DB;
    return parsed;
  } catch {
    return EMPTY_DB;
  }
};

const saveDb = (db: PersistedDb): void => {
  // Atomic-ish write: write temp file first, then rename
  ensureDir();

  const tmp: string = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
};

export const registerSocketHandlers = (io: Server): void => {
  const bot: BotEngine = new BotEngine();

  const botUser: User = {
    id: ChatUi.BOT.ID,
    username: AppConfig.BOT_NAME,
    isBot: true,
    color: ChatUi.BOT.DEFAULT_COLOR,
  };

  const db: PersistedDb = loadDb();

  // In-memory caches (fast path)
  const historyByRoom: Map<RoomId, ChatMessage[]> = new Map<
    RoomId,
    ChatMessage[]
  >();
  const botRepliesByRoom: Map<RoomId, Map<string, string>> = new Map<
    RoomId,
    Map<string, string>
  >();

  // Hydrate cache + bot memory from disk
  for (const [roomId, room] of Object.entries(db.rooms)) {
    historyByRoom.set(roomId, room.messages.slice(-MAX_HISTORY));

    const replies: Map<string, string> = new Map<string, string>();
    for (const [k, v] of Object.entries(room.botReplies)) {
      if (typeof k === 'string' && typeof v === 'string') replies.set(k, v);
    }
    botRepliesByRoom.set(roomId, replies);

    bot.hydrateRoom(roomId, room.botMemory);
  }

  const getRoomHistory = (roomId: RoomId): ChatMessage[] => {
    return historyByRoom.get(roomId) ?? [];
  };

  const setRoomHistory = (roomId: RoomId, messages: ChatMessage[]): void => {
    // Keep history bounded to avoid unbounded memory growth
    historyByRoom.set(roomId, messages.slice(-MAX_HISTORY));
  };

  const getBotReplies = (roomId: RoomId): Map<string, string> => {
    const existing = botRepliesByRoom.get(roomId);
    if (existing) return existing;

    const next: Map<string, string> = new Map<string, string>();
    botRepliesByRoom.set(roomId, next);
    return next;
  };

  const persistRoom = (roomId: RoomId): void => {
    // Persist only the bounded history + bot state
    const messages: ChatMessage[] = getRoomHistory(roomId).slice(-MAX_HISTORY);
    const botMemory = bot.dumpRoom(roomId);

    // Clean stale reply mappings (only keep ids that still exist in history)
    const ids: Set<string> = new Set<string>(
      messages.map((m: ChatMessage) => m.id)
    );
    const repliesMap: Map<string, string> = getBotReplies(roomId);

    const cleaned: Record<string, string> = {};
    for (const [userMsgId, botMsgId] of repliesMap.entries()) {
      if (!ids.has(userMsgId)) continue;
      if (!ids.has(botMsgId)) continue;
      cleaned[userMsgId] = botMsgId;
    }

    // Rebuild map from cleaned record
    repliesMap.clear();
    for (const [k, v] of Object.entries(cleaned)) repliesMap.set(k, v);

    db.rooms[roomId] = { messages, botMemory, botReplies: cleaned };
    saveDb(db);
  };

  const pushToHistory = (roomId: RoomId, msg: ChatMessage): void => {
    setRoomHistory(roomId, [...getRoomHistory(roomId), msg]);
    persistRoom(roomId);
  };

  const updateMessageInHistory = (
    roomId: RoomId,
    messageId: string,
    nextContent: string,
    editor: User
  ): SocketEvent<ChatMessage> => {
    // Only a real (non-bot) user with an id can edit
    if (editor.isBot) return emptySocketEvent<ChatMessage>();
    if (!editor.id) return emptySocketEvent<ChatMessage>();

    const history: ChatMessage[] = getRoomHistory(roomId);
    const idx: number = history.findIndex(
      (m: ChatMessage) => m.id === messageId
    );
    if (idx < 0) return emptySocketEvent<ChatMessage>();

    const target: ChatMessage = history[idx];

    // Only the original author can edit their message
    if (target.sender.isBot) return emptySocketEvent<ChatMessage>();
    if (target.sender.id !== editor.id) return emptySocketEvent<ChatMessage>();

    const clean: string = nextContent.trim();
    if (!clean) return emptySocketEvent<ChatMessage>();
    if (target.content.trim() === clean) return emptySocketEvent<ChatMessage>();

    const now: number = Date.now();
    const edits = [...(target.edits ?? [])];
    edits.push({ previousContent: target.content, editedAt: now });

    const updated: ChatMessage = {
      ...target,
      content: clean,
      editedAt: now,
      edits,
    };

    const next: ChatMessage[] = [...history];
    next[idx] = updated;

    setRoomHistory(roomId, next);
    persistRoom(roomId);

    return socketEvent<ChatMessage>(updated);
  };

  const upsertBotReply = (
    roomId: RoomId,
    triggerUserMessageId: string,
    content: string
  ): BotReplyUpsertResult => {
    const replies: Map<string, string> = getBotReplies(roomId);
    const existingBotId = replies.get(triggerUserMessageId);
    const history: ChatMessage[] = getRoomHistory(roomId);

    // If we already replied to that user message -> update the bot message in place
    if (existingBotId) {
      const idx: number = history.findIndex(
        (m: ChatMessage) => m.id === existingBotId
      );
      if (idx >= 0) {
        const prev: ChatMessage = history[idx];

        const updated: ChatMessage = {
          ...prev,
          sender: botUser,
          type: 'system',
          content,
          timestamp: Date.now(),
          ...(prev.edits ? { edits: prev.edits } : {}),
        };

        const next: ChatMessage[] = [...history];
        next[idx] = updated;

        setRoomHistory(roomId, next);
        persistRoom(roomId);

        return { msg: updated, isNew: false };
      }
    }

    // Otherwise -> create a new bot message and map it to the triggering user msg id
    const botMsg: ChatMessage = {
      id: randomUUID(),
      sender: botUser,
      content,
      timestamp: Date.now(),
      type: 'system',
    };

    replies.set(triggerUserMessageId, botMsg.id);
    pushToHistory(roomId, botMsg);

    return { msg: botMsg, isNew: true };
  };

  io.on('connection', (socket: Socket) => {
    // Per-connection state
    let currentRoom: RoomId = DEFAULT_ROOM;
    let currentUser: User = GUEST_USER;

    const emitHistory = (roomId: RoomId): void => {
      const payload: RoomHistoryPayload = {
        roomId,
        messages: getRoomHistory(roomId),
      };

      socket.emit(SocketEvents.ROOM_HISTORY, payload);
    };

    socket.on(SocketEvents.JOIN_ROOM, (payload: JoinRoomPayload) => {
      const roomId: RoomId = payload.roomId || DEFAULT_ROOM;

      // Keep the latest user snapshot from the client
      currentUser = payload.user;

      socket.leave(currentRoom);
      socket.join(roomId);
      currentRoom = roomId;

      emitHistory(roomId);
    });

    socket.on(SocketEvents.SEND_MESSAGE, (payload: SendMessagePayload) => {
      const roomId: RoomId = payload.roomId || currentRoom || DEFAULT_ROOM;

      const incoming: ChatMessage = payload.message;
      if (!incoming.sender) return;
      if (typeof incoming.content !== 'string') return;

      // Prefer the connection user (avoid spoofing sender from payload)
      const sender: User =
        currentUser && !currentUser.isBot ? currentUser : incoming.sender;

      const serverMsg: ChatMessage = {
        ...incoming,
        sender,
        id: incoming.id || randomUUID(),
        timestamp:
          typeof incoming.timestamp === 'number'
            ? incoming.timestamp
            : Date.now(),
      };

      pushToHistory(roomId, serverMsg);
      io.to(roomId).emit(SocketEvents.NEW_MESSAGE, serverMsg);

      const action = bot.onUserMessage(roomId, serverMsg, botUser);
      persistRoom(roomId);

      if (!action) return;

      const typingOn: BotTypingPayload = { roomId, isTyping: true };
      io.to(roomId).emit(SocketEvents.BOT_TYPING, typingOn);

      setTimeout(() => {
        const typingOff: BotTypingPayload = { roomId, isTyping: false };
        io.to(roomId).emit(SocketEvents.BOT_TYPING, typingOff);

        const result: BotReplyUpsertResult = upsertBotReply(
          roomId,
          serverMsg.id,
          action.message.content
        );

        if (result.isNew)
          io.to(roomId).emit(SocketEvents.NEW_MESSAGE, result.msg);
        else io.to(roomId).emit(SocketEvents.MESSAGE_UPDATED, result.msg);
      }, action.typingMs);
    });

    socket.on(SocketEvents.EDIT_MESSAGE, (payload: EditMessagePayload) => {
      const roomId: RoomId = payload.roomId || currentRoom || DEFAULT_ROOM;

      const messageId: string = payload.messageId;
      const content: string = payload.content;

      if (!messageId || typeof messageId !== 'string') return;
      if (typeof content !== 'string') return;

      const updatedEvent: SocketEvent<ChatMessage> = updateMessageInHistory(
        roomId,
        messageId,
        content,
        currentUser
      );

      if (!isSocketEventValue(updatedEvent)) return;

      const updated: ChatMessage = updatedEvent.value;
      io.to(roomId).emit(SocketEvents.MESSAGE_UPDATED, updated);

      const decision = bot.onMessageEdited(roomId, updated, botUser);
      persistRoom(roomId);

      if (!decision) return;

      const typingOn: BotTypingPayload = { roomId, isTyping: true };
      io.to(roomId).emit(SocketEvents.BOT_TYPING, typingOn);

      setTimeout(() => {
        const typingOff: BotTypingPayload = { roomId, isTyping: false };
        io.to(roomId).emit(SocketEvents.BOT_TYPING, typingOff);

        const result: BotReplyUpsertResult = upsertBotReply(
          roomId,
          updated.id,
          decision.message.content
        );

        if (result.isNew)
          io.to(roomId).emit(SocketEvents.NEW_MESSAGE, result.msg);
        else io.to(roomId).emit(SocketEvents.MESSAGE_UPDATED, result.msg);
      }, decision.typingMs);
    });
  });
};
