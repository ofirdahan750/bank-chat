import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { Server, Socket } from 'socket.io';
import { AppConfig, ChatUi, SocketEvents } from '@poalim/constants';
import {
  BotTypingPayload,
  ChatMessage,
  JoinRoomPayload,
  RoomHistoryPayload,
  SendMessagePayload,
  User,
} from '@poalim/shared-interfaces';
import { BotEngine, BotMemorySnapshot } from '@poalim/bot-engine';

type RoomState = { messages: ChatMessage[] };

type DbShape = {
  rooms: Record<string, RoomState>;
  botMemory: BotMemorySnapshot;
};

const DB_FILE = path.join(process.cwd(), 'data', 'chat-db.json');
const MAX_MESSAGES_PER_ROOM = 500;

const rooms = new Map<string, RoomState>();

const botUser: User = {
  id: ChatUi.BOT.ID,
  username: AppConfig.BOT_NAME,
  isBot: true,
  color: ChatUi.BOT.DEFAULT_COLOR,
};

let bot = new BotEngine(botUser);

let persistTimer: NodeJS.Timeout | null = null;

const schedulePersist = (): void => {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistDb();
  }, 250);
};

const getRoom = (roomId: string): RoomState => {
  const existing = rooms.get(roomId);
  if (existing) return existing;
  const next: RoomState = { messages: [] };
  rooms.set(roomId, next);
  return next;
};

const loadDb = async (): Promise<void> => {
  try {
    const raw = await fs.readFile(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as DbShape;

    Object.entries(parsed.rooms ?? {}).forEach(([roomId, state]) => {
      const msgs = (state?.messages ?? []).filter((m: ChatMessage) => !!m?.id);
      rooms.set(roomId, { messages: msgs.slice(-MAX_MESSAGES_PER_ROOM) });
    });

    bot = new BotEngine(botUser, parsed.botMemory);
  } catch {
    return;
  }
};

const persistDb = async (): Promise<void> => {
  const snapshot: DbShape = {
    rooms: Object.fromEntries(
      Array.from(rooms.entries()).map(([roomId, state]) => [
        roomId,
        { messages: (state.messages ?? []).slice(-MAX_MESSAGES_PER_ROOM) },
      ])
    ),
    botMemory: bot.snapshot(),
  };

  await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(snapshot, null, 2), 'utf-8');
};

void loadDb();

export const registerSocketHandlers = (io: Server): void => {
  io.on('connection', (socket: Socket) => {
    socket.on(SocketEvents.JOIN_ROOM, (payload: JoinRoomPayload) => {
      const roomId = (payload?.roomId ?? 'main').trim() || 'main';
      const user = payload?.user;

      if (!user || !user.id) return;

      socket.data.user = user;
      void socket.join(roomId);

      const room = getRoom(roomId);
      const historyPayload: RoomHistoryPayload = {
        roomId,
        messages: room.messages.slice(-MAX_MESSAGES_PER_ROOM),
      };

      socket.emit(SocketEvents.ROOM_HISTORY, historyPayload);
    });

    socket.on(SocketEvents.SEND_MESSAGE, (payload: SendMessagePayload) => {
      const roomId = (payload?.roomId ?? 'main').trim() || 'main';
      const incoming = payload?.message;
      if (!incoming) return;

      const sender = incoming.sender ?? (socket.data.user as User | undefined);
      if (!sender || !sender.id) return;

      const serverMsg: ChatMessage = {
        id: incoming.id || randomUUID(),
        sender,
        content: (incoming.content ?? '').toString(),
        timestamp: Number.isFinite(incoming.timestamp) ? incoming.timestamp : Date.now(),
        type: incoming.type ?? 'text',
      };

      if (!serverMsg.content.trim()) return;

      const room = getRoom(roomId);
      room.messages = [...room.messages, serverMsg].slice(-MAX_MESSAGES_PER_ROOM);
      schedulePersist();

      io.to(roomId).emit(SocketEvents.NEW_MESSAGE, serverMsg);

      if (serverMsg.sender.isBot) return;

      const action = bot.onUserMessage(roomId, serverMsg);
      if (!action) return;

      const typingOn: BotTypingPayload = { roomId, isTyping: true };
      const typingOff: BotTypingPayload = { roomId, isTyping: false };

      io.to(roomId).emit(SocketEvents.BOT_TYPING, typingOn);

      setTimeout(() => {
        io.to(roomId).emit(SocketEvents.BOT_TYPING, typingOff);

        const botMsg = action.message;
        const nextRoom = getRoom(roomId);
        nextRoom.messages = [...nextRoom.messages, botMsg].slice(-MAX_MESSAGES_PER_ROOM);
        schedulePersist();

        io.to(roomId).emit(SocketEvents.NEW_MESSAGE, botMsg);
      }, Math.max(0, action.typingMs));
    });
  });
};
