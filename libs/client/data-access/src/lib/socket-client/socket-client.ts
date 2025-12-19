import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { AppConfig, SocketEvents } from '@poalim/constants';
import {
  BotTypingPayload,
  ChatMessage,
  EditMessagePayload,
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

  readonly roomHistory = signal<RoomHistoryPayload | null>(null);
  readonly newMessage = signal<ChatMessage | null>(null);
  readonly messageUpdated = signal<ChatMessage | null>(null);

  connect(me: User, roomId: string = AppConfig.ROOM_ID): void {
    if (this.socket?.connected) return;

    this.connectionState.set('connecting');

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
      this.roomHistory.set(payload);
    });

    this.socket.on(SocketEvents.NEW_MESSAGE, (msg: ChatMessage) => {
      this.newMessage.set(msg);
    });

    this.socket.on(SocketEvents.MESSAGE_UPDATED, (msg: ChatMessage) => {
      this.messageUpdated.set(msg);
    });

    this.socket.on(SocketEvents.BOT_TYPING, (p: BotTypingPayload) => {
      this.botTyping.set(p.isTyping);
    });
  }

  sendMessage(message: ChatMessage, roomId: string = AppConfig.ROOM_ID): void {
    if (!this.socket?.connected) return;
    const payload: SendMessagePayload = { roomId, message };
    this.socket.emit(SocketEvents.SEND_MESSAGE, payload);
  }

  editMessage(messageId: string, content: string, roomId: string = AppConfig.ROOM_ID): void {
    if (!this.socket?.connected) return;
    const payload: EditMessagePayload = { roomId, messageId, content };
    this.socket.emit(SocketEvents.EDIT_MESSAGE, payload);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.connectionState.set('disconnected');
    this.botTyping.set(false);
  }
}
