import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { AppConfig, SocketEvents } from '@poalim/constants';
import {
  BotTypingPayload,
  ChatMessage,
  JoinRoomPayload,
  RoomHistoryPayload,
  SendMessagePayload,
  User,
} from '@poalim/shared-interfaces';

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

type HistoryHandler = (payload: RoomHistoryPayload) => void;
type MessageHandler = (msg: ChatMessage) => void;

@Injectable({ providedIn: 'root' })
export class SocketClientService {
  private socket: Socket | null = null;

  private readonly historyHandlers: HistoryHandler[] = [];
  private readonly messageHandlers: MessageHandler[] = [];

  readonly connectionState = signal<ConnectionState>('disconnected');
  readonly botTyping = signal<boolean>(false);

  onRoomHistory(handler: HistoryHandler): void {
    this.historyHandlers.push(handler);
  }

  onNewMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  connect(me: User, roomId = 'main'): void {
    if (this.socket?.connected) return;

    this.connectionState.set('connecting');

    if (!this.socket) {
      this.socket = io(AppConfig.API_URL, { transports: ['websocket'] });

      this.socket.on('connect', () => {
        this.connectionState.set('connected');
        const joinPayload: JoinRoomPayload = { roomId, user: me };
        this.socket?.emit(SocketEvents.JOIN_ROOM, joinPayload);
      });

      this.socket.on('disconnect', () => {
        this.connectionState.set('disconnected');
        this.botTyping.set(false);
      });

      this.socket.on(SocketEvents.ROOM_HISTORY, (payload: RoomHistoryPayload) => {
        this.historyHandlers.forEach((h: HistoryHandler) => h(payload));
      });

      this.socket.on(SocketEvents.NEW_MESSAGE, (msg: ChatMessage) => {
        this.messageHandlers.forEach((h: MessageHandler) => h(msg));
      });

      this.socket.on(SocketEvents.BOT_TYPING, (p: BotTypingPayload) => {
        this.botTyping.set(!!p?.isTyping);
      });

      return;
    }

    this.socket.connect();
  }

  sendMessage(message: ChatMessage, roomId = 'main'): void {
    if (!this.socket?.connected) return;

    const payload: SendMessagePayload = { roomId, message };
    this.socket.emit(SocketEvents.SEND_MESSAGE, payload);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.connectionState.set('disconnected');
    this.botTyping.set(false);
  }
}
