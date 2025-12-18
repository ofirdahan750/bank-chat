import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { SocketEvents } from '@poalim/constants';
import {
  BotTypingPayload,
  JoinRoomPayload,
  SendMessagePayload,
  ChatMessage,
} from '@poalim/shared-interfaces';

@Injectable({ providedIn: 'root' })
export class ChatSocketService {
  private socket: Socket | null = null;

  connect(): void {
    if (this.socket) return;

    this.socket = io('http://localhost:3000', {
      transports: ['websocket'],
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  joinRoom(payload: JoinRoomPayload): void {
    this.socket?.emit(SocketEvents.JOIN_ROOM, payload);
  }

  sendMessage(payload: SendMessagePayload): void {
    this.socket?.emit(SocketEvents.SEND_MESSAGE, payload);
  }

  onNewMessage(cb: (msg: ChatMessage) => void): void {
    this.socket?.on(SocketEvents.NEW_MESSAGE, cb);
  }

  onBotTyping(cb: (p: BotTypingPayload) => void): void {
    this.socket?.on(SocketEvents.BOT_TYPING, cb);
  }
}
