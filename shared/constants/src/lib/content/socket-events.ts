export const SocketEvents = {
  JOIN_ROOM: 'join_room',
  ROOM_HISTORY: 'room_history',

  SEND_MESSAGE: 'send_message',
  NEW_MESSAGE: 'new_message',

  EDIT_MESSAGE: 'edit_message',
  MESSAGE_UPDATED: 'message_updated',

  BOT_TYPING: 'bot_typing',
} as const;

export type SocketEvent = (typeof SocketEvents)[keyof typeof SocketEvents];
