import { Injectable, WritableSignal, signal } from '@angular/core';
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
  SocketEvent,
  emptySocketEvent,
  socketEvent,
} from '@poalim/shared-interfaces';

@Injectable({ providedIn: 'root' })
export class SocketClientService {
  // Use a strict sentinel instead of null/undefined.
  private socket: Socket | 0 = 0;

  // Socket status (consumed by the UI for "connected/connecting" indicators).
  readonly connectionState: WritableSignal<ConnectionState> =
    signal<ConnectionState>('disconnected');

  // Bot typing indicator state.
  readonly botTyping: WritableSignal<boolean> = signal<boolean>(false);

  // One-shot server events (wrapped — no null/undefined).
  readonly roomHistory: WritableSignal<SocketEvent<RoomHistoryPayload>> =
    signal<SocketEvent<RoomHistoryPayload>>(
      emptySocketEvent<RoomHistoryPayload>()
    );

  readonly newMessage: WritableSignal<SocketEvent<ChatMessage>> = signal<
    SocketEvent<ChatMessage>
  >(emptySocketEvent<ChatMessage>());

  readonly messageUpdated: WritableSignal<SocketEvent<ChatMessage>> = signal<
    SocketEvent<ChatMessage>
  >(emptySocketEvent<ChatMessage>());

  connect(me: User, roomId: string = AppConfig.ROOM_ID): void {
    if (this.socket !== 0 && this.socket.connected) return;

    this.connectionState.set('connecting');

    // Force websocket transport (simple + predictable for this challenge).
    const nextSocket: Socket = io(AppConfig.API_URL, {
      transports: ['websocket'],
    });
    this.socket = nextSocket;

    nextSocket.on('connect', () => {
      this.connectionState.set('connected');

      // Join room once connected so the server can emit history.
      const joinPayload: JoinRoomPayload = { roomId, user: me };
      nextSocket.emit(SocketEvents.JOIN_ROOM, joinPayload);
    });

    nextSocket.on('disconnect', () => {
      this.connectionState.set('disconnected');
      this.botTyping.set(false);
    });

    nextSocket.on(SocketEvents.ROOM_HISTORY, (payload: RoomHistoryPayload) => {
      this.roomHistory.set(socketEvent<RoomHistoryPayload>(payload));
    });

    nextSocket.on(SocketEvents.NEW_MESSAGE, (msg: ChatMessage) => {
      this.newMessage.set(socketEvent<ChatMessage>(msg));
    });

    nextSocket.on(SocketEvents.MESSAGE_UPDATED, (msg: ChatMessage) => {
      this.messageUpdated.set(socketEvent<ChatMessage>(msg));
    });

    nextSocket.on(SocketEvents.BOT_TYPING, (payload: BotTypingPayload) => {
      this.botTyping.set(payload.isTyping);
    });
  }

  sendMessage(message: ChatMessage, roomId: string = AppConfig.ROOM_ID): void {
    if (this.socket === 0 || !this.socket.connected) return;

    const payload: SendMessagePayload = { roomId, message };
    this.socket.emit(SocketEvents.SEND_MESSAGE, payload);
  }

  editMessage(
    messageId: string,
    content: string,
    roomId: string = AppConfig.ROOM_ID
  ): void {
    if (this.socket === 0 || !this.socket.connected) return;

    const payload: EditMessagePayload = { roomId, messageId, content };
    this.socket.emit(SocketEvents.EDIT_MESSAGE, payload);
  }

  toggleReaction(
    messageId: string,
    reaction: ReactionKey,
    roomId: string = AppConfig.ROOM_ID
  ): void {
    if (this.socket === 0 || !this.socket.connected) return;

    const payload: ToggleReactionPayload = { roomId, messageId, reaction };
    this.socket.emit(SocketEvents.TOGGLE_REACTION, payload);
  }

  disconnect(): void {
    if (this.socket !== 0) {
      this.socket.disconnect();
    }

    this.socket = 0;

    // Reset client-side state for a clean UI.
    this.connectionState.set('disconnected');
    this.botTyping.set(false);

    // Clear any pending one-shot events.
    this.roomHistory.set(emptySocketEvent<RoomHistoryPayload>());
    this.newMessage.set(emptySocketEvent<ChatMessage>());
    this.messageUpdated.set(emptySocketEvent<ChatMessage>());
  }
}
