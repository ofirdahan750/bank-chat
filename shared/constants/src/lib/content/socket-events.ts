export const SocketEvents = {
  JOIN_ROOM: 'join_room',
  ROOM_HISTORY: 'room_history',
  SEND_MESSAGE: 'send_message',
  NEW_MESSAGE: 'new_message',
  BOT_TYPING: 'bot_typing',
  BOT_RESPONSE: 'bot_response',
} as const;

export type SocketEvent = (typeof SocketEvents)[keyof typeof SocketEvents];
