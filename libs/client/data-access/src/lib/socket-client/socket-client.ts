import { Injectable, inject, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { AppConfig, SocketEvents } from '@poalim/constants';
import { ChatMessage, User } from '@poalim/shared-interfaces';

type ConnectedState = 'disconnected' | 'connecting' | 'connected';

@Injectable({ providedIn: 'root' })

export class SocketClientService {
  private socket: Socket | null = null;

  // Small state signals so the UI/store can react without RxJS subjects
  readonly connectionState = signal<ConnectedState>('disconnected');
  readonly lastIncomingMessage = signal<ChatMessage | null>(null);
  readonly botTyping = signal<boolean>(false);

  connect(user: User): void {
    if (this.socket?.connected) return;

    this.connectionState.set('connecting');

    // Create the socket instance once per session
    this.socket = io(AppConfig.SOCKET_URL, {
      transports: ['websocket'],
      autoConnect: true,
    });

    // Lifecycle
    this.socket.on(SocketEvents.CONNECT, () => {
      this.connectionState.set('connected');

      // Join one shared room (simple SPA requirement)
      this.socket?.emit(SocketEvents.JOIN_ROOM, {
        roomId: AppConfig.ROOM_ID,
        user,
      });
    });

    this.socket.on(SocketEvents.DISCONNECT, () => {
      this.connectionState.set('disconnected');
      this.botTyping.set(false);
    });

    // Messages
    this.socket.on(SocketEvents.NEW_MESSAGE, (msg: ChatMessage) => {
      this.lastIncomingMessage.set(msg);
    });

    // Bot UI helpers
    this.socket.on(SocketEvents.BOT_TYPING, (isTyping: boolean) => {
      this.botTyping.set(!!isTyping);
    });

    this.socket.on(SocketEvents.BOT_RESPONSE, (msg: ChatMessage) => {
      this.lastIncomingMessage.set(msg);
      this.botTyping.set(false);
    });
  }

  disconnect(): void {
    if (!this.socket) return;

    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;

    this.connectionState.set('disconnected');
    this.botTyping.set(false);
  }

  sendMessage(msg: ChatMessage): void {
    // If not connected, do nothing (store will decide what to do)
    if (!this.socket?.connected) return;

    this.socket.emit(SocketEvents.SEND_MESSAGE, msg);
  }
}
