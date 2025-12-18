import { Injectable, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { AppConfig, SocketEvents } from '@poalim/constants';
import type {
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
  private listenersBound = false;

  private currentUser: User | null = null;
  private currentRoomId = 'main';

  readonly connectionState = signal<ConnectionState>('disconnected');
  readonly botTyping = signal<boolean>(false);

  readonly lastIncomingMessage = signal<ChatMessage | null>(null);
  readonly roomHistory = signal<RoomHistoryPayload | null>(null);

  connect(me: User, roomId = 'main'): void {
    this.currentUser = me;
    this.currentRoomId = roomId;

    // If already connected - just ensure we joined the room (no duplicate listeners)
    if (this.socket?.connected) {
      this.emitJoin();
      return;
    }

    // If socket exists but not connected - reconnect
    if (this.socket) {
      if (this.connectionState() !== 'connecting') {
        this.connectionState.set('connecting');
      }
      this.socket.connect();
      return;
    }

    // First time
    this.connectionState.set('connecting');

    this.socket = io(AppConfig.API_URL, {
      transports: ['websocket'],
    });

    this.bindListeners();
  }

  sendMessage(message: ChatMessage, roomId = 'main'): void {
    if (!this.socket?.connected) return;

    const payload: SendMessagePayload = { roomId, message };
    this.socket.emit(SocketEvents.SEND_MESSAGE, payload);
  }

  clearLastIncomingMessage(): void {
    this.lastIncomingMessage.set(null);
  }

  clearRoomHistory(): void {
    this.roomHistory.set(null);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;

    this.listenersBound = false;
    this.currentUser = null;

    this.connectionState.set('disconnected');
    this.botTyping.set(false);
    this.lastIncomingMessage.set(null);
    this.roomHistory.set(null);
  }

  private bindListeners(): void {
    if (!this.socket || this.listenersBound) return;

    this.listenersBound = true;

    this.socket.on('connect', () => {
      this.connectionState.set('connected');
      this.emitJoin();
    });

    this.socket.on('disconnect', () => {
      this.connectionState.set('disconnected');
      this.botTyping.set(false);
    });

    this.socket.on(SocketEvents.ROOM_HISTORY, (payload: RoomHistoryPayload) => {
      this.roomHistory.set(payload);
    });

    this.socket.on(SocketEvents.NEW_MESSAGE, (msg: ChatMessage) => {
      this.lastIncomingMessage.set(msg);
    });

    this.socket.on(SocketEvents.BOT_TYPING, (p: BotTypingPayload) => {
      this.botTyping.set(p.isTyping);
    });
  }

  private emitJoin(): void {
    if (!this.socket?.connected || !this.currentUser) return;

    const joinPayload: JoinRoomPayload = {
      roomId: this.currentRoomId,
      user: this.currentUser,
    };

    this.socket.emit(SocketEvents.JOIN_ROOM, joinPayload);
  }
}
