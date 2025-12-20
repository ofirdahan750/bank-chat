import { Injectable, WritableSignal, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { AppConfig, SocketEvents } from '@poalim/constants';
import {
  BotTypingPayload,
  ChatMessage,
  ConnectionState,
  EditMessagePayload,
  JoinRoomPayload,
  RoomHistoryPayload,
  SendMessagePayload,
  SocketEvent,
  ToggleReactionPayload,
  ReactionKey,
  User,
  emptySocketEvent,
} from '@poalim/shared-interfaces';

@Injectable({ providedIn: 'root' })
export class SocketClientService {
  // Socket exists only after connect() is called.
  private socket!: Socket;

  // Simple guard so we don't touch an uninitialized socket instance.
  private hasSocket: boolean = false;

  // Expose socket connection status for UI.
  readonly connectionState: WritableSignal<ConnectionState> =
    signal<ConnectionState>('disconnected');

  // Bot typing indicator ("typing..." in the UI).
  readonly botTyping: WritableSignal<boolean> = signal<boolean>(false);

  // One-shot payloads delivered via signals (no nulls; empty means "no event yet").
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

  // Wraps a payload as a typed "value event".
  private valueEvent<T>(value: T): SocketEvent<T> {
    return { kind: 'value', value };
  }

  private resolveSocketUrl(raw: string): string {
    // SSR-safe: keep the URL untouched if window is not available.
    if (typeof window === 'undefined') return raw;

    const pageIsHttps: boolean = window.location.protocol === 'https:';
    const isLocalTarget: boolean =
      raw.includes('localhost') || raw.includes('127.0.0.1');

    // When the page is HTTPS, force HTTPS for remote sockets (=> WSS).
    // We keep localhost as-is to avoid dev pain.
    if (pageIsHttps && !isLocalTarget) {
      return raw.replace(/^http:\/\//, 'https://').replace(/\/$/, '');
    }

    // Normalize trailing slash to keep a consistent URL.
    return raw.replace(/\/$/, '');
  }

  connect(me: User, roomId: string = AppConfig.ROOM_ID): void {
    // Already connected? nothing to do.
    if (this.hasSocket && this.socket.connected) return;

    // Let the UI show a "connecting" state.
    this.connectionState.set('connecting');

    const url: string = this.resolveSocketUrl(AppConfig.SOCKET_URL);

    // Create a socket.io client (websocket only for a stable dev/prod behavior).
    const socket: Socket = io(url, {
      transports: ['websocket'],
    });

    this.socket = socket;
    this.hasSocket = true;

    socket.on('connect', () => {
      // Connected to the server.
      this.connectionState.set('connected');

      // Identify the user and join the requested room.
      const joinPayload: JoinRoomPayload = { roomId, user: me };
      socket.emit(SocketEvents.JOIN_ROOM, joinPayload);
    });

    socket.on('disconnect', () => {
      // Reset local UI indicators on disconnect.
      this.connectionState.set('disconnected');
      this.botTyping.set(false);
    });

    socket.on(SocketEvents.ROOM_HISTORY, (payload: RoomHistoryPayload) => {
      // Room history is a one-time "snapshot" event.
      const evt: SocketEvent<RoomHistoryPayload> =
        this.valueEvent<RoomHistoryPayload>(payload);
      this.roomHistory.set(evt);
    });

    socket.on(SocketEvents.NEW_MESSAGE, (msg: ChatMessage) => {
      // New message pushed by the server.
      const evt: SocketEvent<ChatMessage> = this.valueEvent<ChatMessage>(msg);
      this.newMessage.set(evt);
    });

    socket.on(SocketEvents.MESSAGE_UPDATED, (msg: ChatMessage) => {
      // Message updates include edits + reaction changes.
      const evt: SocketEvent<ChatMessage> = this.valueEvent<ChatMessage>(msg);
      this.messageUpdated.set(evt);
    });

    socket.on(SocketEvents.BOT_TYPING, (payload: BotTypingPayload) => {
      // Bot typing is just a boolean for the UI.
      this.botTyping.set(payload.isTyping);
    });
  }

  sendMessage(message: ChatMessage, roomId: string = AppConfig.ROOM_ID): void {
    // Ignore if we are not connected.
    if (!this.hasSocket || !this.socket.connected) return;

    // Send the message to the server so it can persist + broadcast.
    const payload: SendMessagePayload = { roomId, message };
    this.socket.emit(SocketEvents.SEND_MESSAGE, payload);
  }

  editMessage(
    messageId: string,
    content: string,
    roomId: string = AppConfig.ROOM_ID
  ): void {
    // Ignore if we are not connected.
    if (!this.hasSocket || !this.socket.connected) return;

    // Ask server to update the message content (with server-side validation).
    const payload: EditMessagePayload = { roomId, messageId, content };
    this.socket.emit(SocketEvents.EDIT_MESSAGE, payload);
  }

  toggleReaction(
    messageId: string,
    reaction: ReactionKey,
    roomId: string = AppConfig.ROOM_ID
  ): void {
    // Ignore if we are not connected.
    if (!this.hasSocket || !this.socket.connected) return;

    // Ask server to toggle the reaction and broadcast the updated message.
    const payload: ToggleReactionPayload = { roomId, messageId, reaction };
    this.socket.emit(SocketEvents.TOGGLE_REACTION, payload);
  }

  disconnect(): void {
    // Nothing to disconnect if connect() was never called.
    if (!this.hasSocket) return;

    // Remove handlers to avoid duplicated listeners on a future reconnect.
    this.socket.removeAllListeners();

    // Close the actual socket connection.
    this.socket.disconnect();

    this.hasSocket = false;

    // Reset UI-facing state.
    this.connectionState.set('disconnected');
    this.botTyping.set(false);

    // Reset one-shot events back to "empty".
    this.roomHistory.set(emptySocketEvent<RoomHistoryPayload>());
    this.newMessage.set(emptySocketEvent<ChatMessage>());
    this.messageUpdated.set(emptySocketEvent<ChatMessage>());
  }
}
