import { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { AppConfig, ChatUi, SocketEvents } from '@poalim/constants';
import {
  BotTypingPayload,
  ChatMessage,
  EditMessagePayload,
  JoinRoomPayload,
  RoomHistoryPayload,
  SendMessagePayload,
  ToggleReactionPayload,
  ReactionKey,
  User,
} from '@poalim/shared-interfaces';
import { BotEngine } from '@poalim/bot-engine';

type RoomId = string;

const DEFAULT_ROOM: RoomId = AppConfig.ROOM_ID as RoomId;
const MAX_HISTORY = 200;

type PersistedBotRoomMemory = ReturnType<BotEngine['dumpRoom']>;

type PersistedRoom = {
  messages: ChatMessage[];
  botMemory: PersistedBotRoomMemory;
  botReplies: Record<string, string>; // userMessageId -> botMessageId
};

type PersistedDb = {
  rooms: Record<string, PersistedRoom>;
};

const DATA_DIR = path.join(process.cwd(), '.poalim-data');
const DATA_FILE = path.join(DATA_DIR, 'chat-db.json');

const ensureDir = (): void => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
};

const loadDb = (): PersistedDb => {
  try {
    if (!fs.existsSync(DATA_FILE)) return { rooms: {} };
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as PersistedDb;
    if (!parsed || typeof parsed !== 'object' || !parsed.rooms) return { rooms: {} };
    return parsed;
  } catch {
    return { rooms: {} };
  }
};

const saveDb = (db: PersistedDb): void => {
  ensureDir();
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
};

export const registerSocketHandlers = (io: Server): void => {
  const bot = new BotEngine();

  const botUser: User = {
    id: ChatUi.BOT.ID,
    username: AppConfig.BOT_NAME,
    isBot: true,
    color: ChatUi.BOT.DEFAULT_COLOR,
  };

  const db = loadDb();

  const historyByRoom = new Map<RoomId, ChatMessage[]>();
  const botRepliesByRoom = new Map<RoomId, Map<string, string>>();

  for (const [roomId, room] of Object.entries(db.rooms)) {
    historyByRoom.set(roomId, (room?.messages ?? []).slice(-MAX_HISTORY));

    const replies = new Map<string, string>();
    for (const [k, v] of Object.entries(room?.botReplies ?? {})) {
      if (typeof k === 'string' && typeof v === 'string') replies.set(k, v);
    }
    botRepliesByRoom.set(roomId, replies);

    bot.hydrateRoom(roomId, room?.botMemory ?? null);
  }

  const getRoomHistory = (roomId: RoomId): ChatMessage[] =>
    historyByRoom.get(roomId) ?? [];

  const setRoomHistory = (roomId: RoomId, messages: ChatMessage[]): void => {
    historyByRoom.set(roomId, messages.slice(-MAX_HISTORY));
  };

  const getBotReplies = (roomId: RoomId): Map<string, string> => {
    const existing = botRepliesByRoom.get(roomId);
    if (existing) return existing;
    const next = new Map<string, string>();
    botRepliesByRoom.set(roomId, next);
    return next;
  };

  const persistRoom = (roomId: RoomId): void => {
    const messages = getRoomHistory(roomId).slice(-MAX_HISTORY);
    const botMemory = bot.dumpRoom(roomId);

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

  const pushToHistory = (roomId: RoomId, msg: ChatMessage): void => {
    setRoomHistory(roomId, [...getRoomHistory(roomId), msg]);
    persistRoom(roomId);
  };

  const updateMessageInHistory = (
    roomId: RoomId,
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
    roomId: RoomId,
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
    roomId: RoomId,
    triggerUserMessageId: string,
    content: string
  ): { msg: ChatMessage; isNew: boolean } => {
    const replies = getBotReplies(roomId);
    const existingBotId = replies.get(triggerUserMessageId);
    const history = getRoomHistory(roomId);

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

  const emitHistory = (socket: Socket, roomId: RoomId): void => {
    const payload: RoomHistoryPayload = {
      roomId,
      messages: getRoomHistory(roomId),
    };
    socket.emit(SocketEvents.ROOM_HISTORY, payload);
  };

  io.on('connection', (socket: Socket) => {
    let currentRoom: RoomId = DEFAULT_ROOM;
    let currentUser: User | null = null;

    socket.on(SocketEvents.JOIN_ROOM, (payload: JoinRoomPayload) => {
      const roomId = ((payload?.roomId as RoomId) || DEFAULT_ROOM) as RoomId;

      currentUser = payload?.user ?? null;

      if (currentRoom && currentRoom !== roomId) {
        socket.leave(currentRoom);
      }

      socket.join(roomId);
      currentRoom = roomId;

      emitHistory(socket, roomId);
    });

    socket.on(SocketEvents.SEND_MESSAGE, (payload: SendMessagePayload) => {
      const roomId = ((payload?.roomId as RoomId) || currentRoom || DEFAULT_ROOM) as RoomId;

      const incoming = payload?.message;
      if (!incoming) return;
      if (!incoming.sender) return;
      if (typeof incoming.content !== 'string') return;

      const sender: User =
        currentUser && !currentUser.isBot ? currentUser : incoming.sender;

      const serverMsg: ChatMessage = {
        ...incoming,
        sender,
        id: incoming.id || randomUUID(),
        timestamp:
          typeof incoming.timestamp === 'number' ? incoming.timestamp : Date.now(),
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

        const { msg, isNew } = upsertBotReply(roomId, serverMsg.id, decision.message.content);

        if (isNew) io.to(roomId).emit(SocketEvents.NEW_MESSAGE, msg);
        else io.to(roomId).emit(SocketEvents.MESSAGE_UPDATED, msg);
      }, decision.typingMs);
    });

    socket.on(SocketEvents.EDIT_MESSAGE, (payload: EditMessagePayload) => {
      const roomId = ((payload?.roomId as RoomId) || currentRoom || DEFAULT_ROOM) as RoomId;
      const messageId = payload?.messageId ?? '';
      const content = payload?.content ?? '';

      if (!messageId || typeof messageId !== 'string') return;
      if (typeof content !== 'string') return;

      const updated = updateMessageInHistory(roomId, messageId, content, currentUser);
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

        const { msg, isNew } = upsertBotReply(roomId, updated.id, decision.message.content);

        if (isNew) io.to(roomId).emit(SocketEvents.NEW_MESSAGE, msg);
        else io.to(roomId).emit(SocketEvents.MESSAGE_UPDATED, msg);
      }, decision.typingMs);
    });

    socket.on(SocketEvents.TOGGLE_REACTION, (payload: ToggleReactionPayload) => {
      const roomId = ((payload?.roomId as RoomId) || currentRoom || DEFAULT_ROOM) as RoomId;
      const messageId = payload?.messageId ?? '';
      const reaction = payload?.reaction as ReactionKey;

      if (!messageId || typeof messageId !== 'string') return;

      if (
        reaction !== 'like' &&
        reaction !== 'heart' &&
        reaction !== 'laugh' &&
        reaction !== 'wow' &&
        reaction !== 'sad'
      ) {
        return;
      }

      const updated = toggleReactionInHistory(roomId, messageId, reaction, currentUser);
      if (!updated) return;

      io.to(roomId).emit(SocketEvents.MESSAGE_UPDATED, updated);
    });
  });
};
