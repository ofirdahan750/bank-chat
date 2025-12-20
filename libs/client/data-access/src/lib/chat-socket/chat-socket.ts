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
  ToggleReactionPayload,
  ReactionKey,
  User,
  ConnectionState,
} from '@poalim/shared-interfaces';

@Injectable({ providedIn: 'root' })
export class SocketClientService {
  private socket: Socket | null = null;

  readonly connectionState = signal<ConnectionState>('disconnected');
  readonly botTyping = signal<boolean>(false);

  readonly roomHistory = signal<RoomHistoryPayload | null>(null);
  readonly newMessage = signal<ChatMessage | null>(null);
  readonly messageUpdated = signal<ChatMessage | null>(null);

  private resolveSocketUrl(raw: string): string {
    if (typeof window === 'undefined') return raw;

    const pageIsHttps = window.location.protocol === 'https:';
    const isLocalTarget =
      raw.includes('localhost') || raw.includes('127.0.0.1');

    // If the page is HTTPS, force HTTPS for remote sockets (=> WSS).
    // Never force HTTPS for localhost.
    if (pageIsHttps && !isLocalTarget) {
      return raw.replace(/^http:\/\//, 'https://').replace(/\/$/, '');
    }

    // If the page is HTTP, keep it HTTP (local dev).
    return raw.replace(/\/$/, '');
  }

  connect(me: User, roomId: string = AppConfig.ROOM_ID): void {
    if (this.socket?.connected) return;

    this.connectionState.set('connecting');

    const url = this.resolveSocketUrl(AppConfig.SOCKET_URL);

    this.socket = io(url, {
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

  editMessage(
    messageId: string,
    content: string,
    roomId: string = AppConfig.ROOM_ID
  ): void {
    if (!this.socket?.connected) return;
    const payload: EditMessagePayload = { roomId, messageId, content };
    this.socket.emit(SocketEvents.EDIT_MESSAGE, payload);
  }

  toggleReaction(
    messageId: string,
    reaction: ReactionKey,
    roomId: string = AppConfig.ROOM_ID
  ): void {
    if (!this.socket?.connected) return;
    const payload: ToggleReactionPayload = { roomId, messageId, reaction };
    this.socket.emit(SocketEvents.TOGGLE_REACTION, payload);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.connectionState.set('disconnected');
    this.botTyping.set(false);
  }
}
