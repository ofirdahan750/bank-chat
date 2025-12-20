// libs/server/socket-handler/src/lib/socket-handler.ts

import { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  AppConfig,
  ChatUi,
  REACTION_KEYS,
  SERVER_PERSISTENCE_CONFIG,
  SocketEvents,
} from '@poalim/constants';
import {
  BotEngineRoomId,
  BotTypingPayload,
  ChatMessage,
  EditMessagePayload,
  JoinRoomPayload,
  PersistedDb,
  ReactionKey,
  RoomHistoryPayload,
  SendMessagePayload,
  ToggleReactionPayload,
  User,
} from '@poalim/shared-interfaces';
import { BotEngine } from '@poalim/bot-engine';

const DEFAULT_ROOM_ID: BotEngineRoomId = AppConfig.ROOM_ID as BotEngineRoomId;

const DATA_DIR_PATH: string = path.join(
  process.cwd(),
  SERVER_PERSISTENCE_CONFIG.DATA_DIR_NAME
);

const DATA_FILE_PATH: string = path.join(
  DATA_DIR_PATH,
  SERVER_PERSISTENCE_CONFIG.DB_FILE_NAME
);

const ensureDir = (): void => {
  if (!fs.existsSync(DATA_DIR_PATH)) {
    fs.mkdirSync(DATA_DIR_PATH, { recursive: true });
  }
};

const loadDb = (): PersistedDb => {
  try {
    if (!fs.existsSync(DATA_FILE_PATH)) return { rooms: {} };

    const raw: string = fs.readFileSync(
      DATA_FILE_PATH,
      SERVER_PERSISTENCE_CONFIG.FILE_ENCODING
    );

    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') return { rooms: {} };
    const obj = parsed as { rooms?: unknown };

    if (!obj.rooms || typeof obj.rooms !== 'object') return { rooms: {} };

    return parsed as PersistedDb;
  } catch {
    return { rooms: {} };
  }
};

const saveDb = (db: PersistedDb): void => {
  ensureDir();

  // Atomic write: write temp file, then rename.
  const tmpPath: string = `${DATA_FILE_PATH}${SERVER_PERSISTENCE_CONFIG.TMP_SUFFIX}`;

  fs.writeFileSync(
    tmpPath,
    JSON.stringify(db, null, 2),
    SERVER_PERSISTENCE_CONFIG.FILE_ENCODING
  );

  fs.renameSync(tmpPath, DATA_FILE_PATH);
};

const isReactionKey = (value: unknown): value is ReactionKey => {
  if (typeof value !== 'string') return false;

  // Keep server validation in sync with the shared union.
  return (REACTION_KEYS as readonly string[]).includes(value);
};

const normalizeRoomId = (
  candidate: unknown,
  fallback: BotEngineRoomId
): BotEngineRoomId => {
  if (typeof candidate !== 'string') return fallback;

  const trimmed = candidate.trim();
  return (trimmed ? trimmed : fallback) as BotEngineRoomId;
};

export const registerSocketHandlers = (io: Server): void => {
  const bot = new BotEngine();

  const botUser: User = {
    id: ChatUi.BOT.ID,
    username: AppConfig.BOT_NAME,
    isBot: true,
    color: ChatUi.BOT.DEFAULT_COLOR,
  };

  const db: PersistedDb = loadDb();

  // In-memory caches (source of truth is persisted DB).
  const historyByRoom = new Map<BotEngineRoomId, ChatMessage[]>();
  const botRepliesByRoom = new Map<BotEngineRoomId, Map<string, string>>();

  for (const [roomIdRaw, room] of Object.entries(db.rooms)) {
    const roomId = roomIdRaw as BotEngineRoomId;

    historyByRoom.set(
      roomId,
      (room?.messages ?? []).slice(-SERVER_PERSISTENCE_CONFIG.MAX_HISTORY)
    );

    const replies = new Map<string, string>();
    for (const [k, v] of Object.entries(room?.botReplies ?? {})) {
      if (typeof k === 'string' && typeof v === 'string') replies.set(k, v);
    }
    botRepliesByRoom.set(roomId, replies);

    bot.hydrateRoom(roomId, room?.botMemory ?? null);
  }

  const getRoomHistory = (roomId: BotEngineRoomId): ChatMessage[] =>
    historyByRoom.get(roomId) ?? [];

  const setRoomHistory = (
    roomId: BotEngineRoomId,
    messages: ChatMessage[]
  ): void => {
    historyByRoom.set(
      roomId,
      messages.slice(-SERVER_PERSISTENCE_CONFIG.MAX_HISTORY)
    );
  };

  const getBotReplies = (roomId: BotEngineRoomId): Map<string, string> => {
    const existing = botRepliesByRoom.get(roomId);
    if (existing) return existing;

    const next = new Map<string, string>();
    botRepliesByRoom.set(roomId, next);
    return next;
  };

  const persistRoom = (roomId: BotEngineRoomId): void => {
    const messages = getRoomHistory(roomId).slice(
      -SERVER_PERSISTENCE_CONFIG.MAX_HISTORY
    );

    const botMemory = bot.dumpRoom(roomId);

    // Keep only reply links that still exist in history.
    const ids = new Set(messages.map((m) => m.id));
    const repliesMap = getBotReplies(roomId);
    const cleaned: Record<string, string> = {};

    for (const [userMsgId, botMsgId] of repliesMap.entries()) {
      if (!ids.has(userMsgId)) continue;
      if (!ids.has(botMsgId)) continue;
      cleaned[userMsgId] = botMsgId;
    }

    repliesMap.clear();
    for (const [k, v] of Object.entries(cleaned)) repliesMap.set(k, v);

    db.rooms[roomId] = { messages, botMemory, botReplies: cleaned };
    saveDb(db);
  };

  const pushToHistory = (roomId: BotEngineRoomId, msg: ChatMessage): void => {
    setRoomHistory(roomId, [...getRoomHistory(roomId), msg]);
    persistRoom(roomId);
  };

  const updateMessageInHistory = (
    roomId: BotEngineRoomId,
    messageId: string,
    nextContent: string,
    editor: User | null
  ): ChatMessage | null => {
    if (!editor || editor.isBot) return null;

    const history = getRoomHistory(roomId);
    const idx = history.findIndex((m: ChatMessage) => m.id === messageId);
    if (idx < 0) return null;

    const target = history[idx];
    if (!target) return null;
    if (target.sender?.isBot) return null;
    if (target.sender?.id !== editor.id) return null;

    const clean = nextContent.trim();
    if (!clean) return null;
    if ((target.content ?? '').trim() === clean) return null;

    const now = Date.now();
    const edits = [...(target.edits ?? [])];
    edits.push({ previousContent: target.content, editedAt: now });

    const updated: ChatMessage = {
      ...target,
      content: clean,
      editedAt: now,
      edits,
    };

    const next = [...history];
    next[idx] = updated;

    setRoomHistory(roomId, next);
    persistRoom(roomId);

    return updated;
  };

  const toggleReactionInHistory = (
    roomId: BotEngineRoomId,
    messageId: string,
    reaction: ReactionKey,
    actor: User | null
  ): ChatMessage | null => {
    if (!actor || actor.isBot) return null;
    if (!actor.id) return null;

    const history = getRoomHistory(roomId);
    const idx = history.findIndex((m) => m.id === messageId);
    if (idx < 0) return null;

    const target = history[idx];
    if (!target) return null;

    const reactions = { ...(target.reactions ?? {}) };
    const list = [...(reactions[reaction] ?? [])];

    const i = list.indexOf(actor.id);
    if (i >= 0) list.splice(i, 1);
    else list.push(actor.id);

    if (list.length === 0) delete reactions[reaction];
    else reactions[reaction] = list;

    const updated: ChatMessage = {
      ...target,
      reactions,
    };

    const next = [...history];
    next[idx] = updated;

    setRoomHistory(roomId, next);
    persistRoom(roomId);

    return updated;
  };

  const upsertBotReply = (
    roomId: BotEngineRoomId,
    triggerUserMessageId: string,
    content: string
  ): { msg: ChatMessage; isNew: boolean } => {
    const replies = getBotReplies(roomId);
    const existingBotId = replies.get(triggerUserMessageId);
    const history = getRoomHistory(roomId);

    // If bot already replied to this user message, update that bot message.
    if (existingBotId) {
      const idx = history.findIndex((m) => m.id === existingBotId);
      if (idx >= 0) {
        const prev = history[idx];

        const updated: ChatMessage = {
          ...prev,
          sender: botUser,
          type: 'system',
          content,
          timestamp: Date.now(),
          editedAt: undefined,
        };

        const next = [...history];
        next[idx] = updated;

        setRoomHistory(roomId, next);
        persistRoom(roomId);

        return { msg: updated, isNew: false };
      }
    }

    // Otherwise create a new bot message.
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

  const emitHistory = (socket: Socket, roomId: BotEngineRoomId): void => {
    const payload: RoomHistoryPayload = {
      roomId,
      messages: getRoomHistory(roomId),
    };

    socket.emit(SocketEvents.ROOM_HISTORY, payload);
  };

  io.on('connection', (socket: Socket) => {
    let currentRoom: BotEngineRoomId = DEFAULT_ROOM_ID;
    let currentUser: User | null = null;

    socket.on(SocketEvents.JOIN_ROOM, (payload: JoinRoomPayload) => {
      const roomId: BotEngineRoomId = normalizeRoomId(
        payload?.roomId,
        DEFAULT_ROOM_ID
      );

      currentUser = payload?.user ?? null;

      if (currentRoom && currentRoom !== roomId) {
        socket.leave(currentRoom);
      }

      socket.join(roomId);
      currentRoom = roomId;

      emitHistory(socket, roomId);
    });

    socket.on(SocketEvents.SEND_MESSAGE, (payload: SendMessagePayload) => {
      const roomId: BotEngineRoomId = normalizeRoomId(
        payload?.roomId,
        currentRoom
      );

      const incoming = payload?.message;
      if (!incoming) return;
      if (!incoming.sender) return;
      if (typeof incoming.content !== 'string') return;

      // Trust the server session user if present (prevents client spoofing).
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

      const decision = bot.onUserMessage(roomId, serverMsg, botUser);
      persistRoom(roomId);

      if (!decision) return;

      const typingOn: BotTypingPayload = { roomId, isTyping: true };
      io.to(roomId).emit(SocketEvents.BOT_TYPING, typingOn);

      setTimeout(() => {
        const typingOff: BotTypingPayload = { roomId, isTyping: false };
        io.to(roomId).emit(SocketEvents.BOT_TYPING, typingOff);

        const { msg, isNew } = upsertBotReply(
          roomId,
          serverMsg.id,
          decision.message.content
        );

        if (isNew) io.to(roomId).emit(SocketEvents.NEW_MESSAGE, msg);
        else io.to(roomId).emit(SocketEvents.MESSAGE_UPDATED, msg);
      }, decision.typingMs);
    });

    socket.on(SocketEvents.EDIT_MESSAGE, (payload: EditMessagePayload) => {
      const roomId: BotEngineRoomId = normalizeRoomId(
        payload?.roomId,
        currentRoom
      );

      const messageId = payload?.messageId ?? '';
      const content = payload?.content ?? '';

      if (!messageId || typeof messageId !== 'string') return;
      if (typeof content !== 'string') return;

      const updated = updateMessageInHistory(
        roomId,
        messageId,
        content,
        currentUser
      );
      if (!updated) return;

      io.to(roomId).emit(SocketEvents.MESSAGE_UPDATED, updated);

      const decision = bot.onMessageEdited(roomId, updated, botUser);
      persistRoom(roomId);

      if (!decision) return;

      const typingOn: BotTypingPayload = { roomId, isTyping: true };
      io.to(roomId).emit(SocketEvents.BOT_TYPING, typingOn);

      setTimeout(() => {
        const typingOff: BotTypingPayload = { roomId, isTyping: false };
        io.to(roomId).emit(SocketEvents.BOT_TYPING, typingOff);

        const { msg, isNew } = upsertBotReply(
          roomId,
          updated.id,
          decision.message.content
        );

        if (isNew) io.to(roomId).emit(SocketEvents.NEW_MESSAGE, msg);
        else io.to(roomId).emit(SocketEvents.MESSAGE_UPDATED, msg);
      }, decision.typingMs);
    });

    socket.on(
      SocketEvents.TOGGLE_REACTION,
      (payload: ToggleReactionPayload) => {
        const roomId: BotEngineRoomId = normalizeRoomId(
          payload?.roomId,
          currentRoom
        );

        const messageId = payload?.messageId ?? '';
        const reactionRaw = payload?.reaction;

        if (!messageId || typeof messageId !== 'string') return;
        if (!isReactionKey(reactionRaw)) return;

        const updated = toggleReactionInHistory(
          roomId,
          messageId,
          reactionRaw,
          currentUser
        );
        if (!updated) return;

        io.to(roomId).emit(SocketEvents.MESSAGE_UPDATED, updated);
      }
    );
  });
};
