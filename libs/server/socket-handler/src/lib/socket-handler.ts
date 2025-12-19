import { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import { AppConfig, ChatUi, SocketEvents } from '@poalim/constants';
import {
  BotTypingPayload,
  ChatMessage,
  JoinRoomPayload,
  RoomHistoryPayload,
  SendMessagePayload,
  User,
} from '@poalim/shared-interfaces';
import { BotEngine } from '@poalim/bot-engine';

type RoomId = string;

const DEFAULT_ROOM: RoomId = 'main';
const MAX_HISTORY = 200;

export const registerSocketHandlers = (io: Server): void => {
  const bot = new BotEngine();

  const botUser: User = {
    id: ChatUi.BOT.ID,
    username: AppConfig.BOT_NAME,
    isBot: true,
    color: ChatUi.BOT.DEFAULT_COLOR,
  };

  const historyByRoom = new Map<RoomId, ChatMessage[]>();

  const getRoomHistory = (roomId: RoomId): ChatMessage[] =>
    historyByRoom.get(roomId) ?? [];

  const setRoomHistory = (roomId: RoomId, messages: ChatMessage[]): void => {
    historyByRoom.set(roomId, messages.slice(-MAX_HISTORY));
  };

  const pushToHistory = (roomId: RoomId, msg: ChatMessage): void => {
    setRoomHistory(roomId, [...getRoomHistory(roomId), msg]);
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
      const roomId = (payload?.roomId || DEFAULT_ROOM) as RoomId;

      currentUser = payload.user;

      if (currentRoom && currentRoom !== roomId) {
        socket.leave(currentRoom);
      }

      socket.join(roomId);
      currentRoom = roomId;

      emitHistory(socket, roomId);
    });

    socket.on(SocketEvents.SEND_MESSAGE, (payload: SendMessagePayload) => {
      const roomId = (payload?.roomId || currentRoom || DEFAULT_ROOM) as RoomId;

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
      if (!decision) return;

      const typingOn: BotTypingPayload = { roomId, isTyping: true };
      io.to(roomId).emit(SocketEvents.BOT_TYPING, typingOn);

      setTimeout(() => {
        const typingOff: BotTypingPayload = { roomId, isTyping: false };
        io.to(roomId).emit(SocketEvents.BOT_TYPING, typingOff);

        const botMsg: ChatMessage = {
          ...decision.message,
          sender: botUser,
          id: decision.message.id || randomUUID(),
          timestamp:
            typeof decision.message.timestamp === 'number'
              ? decision.message.timestamp
              : Date.now(),
        };

        pushToHistory(roomId, botMsg);
        io.to(roomId).emit(SocketEvents.NEW_MESSAGE, botMsg);
      }, decision.typingMs);
    });
  });
};
