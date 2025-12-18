export const SocketEvents = {
  // socket.io built-ins
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',

  // Sync
  ROOM_HISTORY: 'room_history',

  // Room & Messages
  JOIN_ROOM: 'join_room',
  SEND_MESSAGE: 'send_message',
  NEW_MESSAGE: 'new_message',

  // Bot
  BOT_TYPING: 'bot_typing',
  BOT_RESPONSE: 'bot_response',
} as const;

export type SocketEvent = (typeof SocketEvents)[keyof typeof SocketEvents];
