export const SERVER_PERSISTENCE_CONFIG = {
  // Folder name (under project root) where we persist the chat DB.
  DATA_DIR_NAME: '.poalim-data',

  // Persisted DB file name.
  DB_FILE_NAME: 'chat-db.json',

  // Temp suffix used for atomic write (write -> rename).
  TMP_SUFFIX: '.tmp',

  // File encoding used by fs read/write.
  FILE_ENCODING: 'utf8',

  // How many messages to keep per room.
  MAX_HISTORY: 200,
} as const;
