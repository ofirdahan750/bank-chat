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

@Injectable({ providedIn: 'root' })
export class SocketClientService {
  private socket: Socket | null = null;

  readonly connectionState = signal<ConnectionState>('disconnected');
  readonly botTyping = signal<boolean>(false);

  readonly roomHistory = signal<ChatMessage[] | null>(null);
  readonly lastIncomingMessage = signal<ChatMessage | null>(null);

  connect(me: User, roomId = 'main'): void {
    const isAlreadyConnectingOrConnected =
      !!this.socket && (this.socket.connected || this.connectionState() === 'connecting');

    if (isAlreadyConnectingOrConnected) return;

    this.connectionState.set('connecting');

    this.socket = io(AppConfig.API_URL, {
      transports: ['websocket'],
    });

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
      const messages = Array.isArray(payload?.messages) ? payload.messages : [];
      this.roomHistory.set(messages);
    });

    this.socket.on(SocketEvents.NEW_MESSAGE, (msg: ChatMessage) => {
      this.lastIncomingMessage.set(msg);
    });

    this.socket.on(SocketEvents.BOT_TYPING, (p: BotTypingPayload) => {
      this.botTyping.set(!!p?.isTyping);
    });
  }

  sendMessage(message: ChatMessage, roomId = 'main'): void {
    if (!this.socket?.connected) return;

    const payload: SendMessagePayload = { roomId, message };
    this.socket.emit(SocketEvents.SEND_MESSAGE, payload);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.connectionState.set('disconnected');
    this.botTyping.set(false);
  }
}
