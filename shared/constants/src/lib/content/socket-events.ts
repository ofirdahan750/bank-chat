// socket-events.constants.ts

export const SocketEvents = {
  // Socket lifecycle
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',

  // Room & Messages
  JOIN_ROOM: 'join_room',
  SEND_MESSAGE: 'send_message',
  NEW_MESSAGE: 'new_message',

  // Bot
  BOT_TYPING: 'bot_typing',
  BOT_RESPONSE: 'bot_response',
} as const;

export type SocketEvent = (typeof SocketEvents)[keyof typeof SocketEvents];
