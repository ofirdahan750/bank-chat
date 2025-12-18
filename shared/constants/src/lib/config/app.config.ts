export const AppConfig = {
  BOT_NAME: 'Poalim Bot',
  BOT_DELAY_MS: 1500,

  STORAGE_KEYS: {
    USERNAME: 'poalim_chat_username',
  },

  // Limits
  MAX_MSG_LENGTH: 500,
  MIN_USERNAME_LENGTH: 2,

  // Socket
  SOCKET_URL: 'http://localhost:3000',
  ROOM_ID: 'global',
} as const;
