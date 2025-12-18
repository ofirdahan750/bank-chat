export const SocketEvents = {
  // Room
  JOIN_ROOM: 'join_room',
  ROOM_HISTORY: 'room_history',

  // Messages
  SEND_MESSAGE: 'send_message',
  NEW_MESSAGE: 'new_message',

  // Bot
  BOT_TYPING: 'bot_typing',
} as const;

export type SocketEvent = (typeof SocketEvents)[keyof typeof SocketEvents];
