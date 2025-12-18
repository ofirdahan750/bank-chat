import { Server, Socket } from 'socket.io';
import { randomUUID } from 'crypto';
import { SocketEvents } from '@poalim/constants';
import {
  BotTypingPayload,
  JoinRoomPayload,
  RoomHistoryPayload,
  SendMessagePayload,
  ChatMessage,
} from '@poalim/shared-interfaces';
import { BotEngine } from '@poalim/bot-engine';

type RoomId = string;

const DEFAULT_ROOM: RoomId = 'main';
const MAX_HISTORY = 200;

export const registerSocketHandlers = (io: Server): void => {
  const bot = new BotEngine();
  const historyByRoom = new Map<RoomId, ChatMessage[]>();

  const getRoomHistory = (roomId: RoomId): ChatMessage[] =>
    historyByRoom.get(roomId) ?? [];

  const pushToHistory = (roomId: RoomId, msg: ChatMessage): void => {
    const next = [...getRoomHistory(roomId), msg].slice(-MAX_HISTORY);
    historyByRoom.set(roomId, next);
  };

  const emitHistoryToSocket = (socket: Socket, roomId: RoomId): void => {
    const payload: RoomHistoryPayload = {
      roomId,
      messages: getRoomHistory(roomId),
    };
    socket.emit(SocketEvents.ROOM_HISTORY, payload);
  };

  io.on('connection', (socket: Socket) => {
    let currentRoom: RoomId = DEFAULT_ROOM;

    socket.on(SocketEvents.JOIN_ROOM, (payload: JoinRoomPayload) => {
      const roomId = payload?.roomId || DEFAULT_ROOM;

      // move user to the requested room
      socket.leave(currentRoom);
      socket.join(roomId);
      currentRoom = roomId;

      // send full history only to this socket
      emitHistoryToSocket(socket, roomId);
    });

    socket.on(SocketEvents.SEND_MESSAGE, (payload: SendMessagePayload) => {
      const roomId = payload?.roomId || currentRoom || DEFAULT_ROOM;
      const incoming = payload?.message;

      // safety: ignore malformed events instead of crashing the server
      if (!incoming || !incoming.sender || typeof incoming.content !== 'string') return;

      // server is source of truth for id/timestamp
      const serverMsg: ChatMessage = {
        ...incoming,
        id: incoming.id || randomUUID(),
        timestamp: Date.now(),
      };

      pushToHistory(roomId, serverMsg);
      io.to(roomId).emit(SocketEvents.NEW_MESSAGE, serverMsg);

      // bot logic runs ONLY on user messages
      const decision = bot.onUserMessage(roomId, serverMsg);
      if (!decision) return;

      const typingOn: BotTypingPayload = { roomId, isTyping: true };
      io.to(roomId).emit(SocketEvents.BOT_TYPING, typingOn);

      setTimeout(() => {
        const typingOff: BotTypingPayload = { roomId, isTyping: false };
        io.to(roomId).emit(SocketEvents.BOT_TYPING, typingOff);

        pushToHistory(roomId, decision.botMessage);
        io.to(roomId).emit(SocketEvents.NEW_MESSAGE, decision.botMessage);
      }, decision.typingMs);
    });
  });
};
