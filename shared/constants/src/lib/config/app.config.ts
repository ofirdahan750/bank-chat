export const AppConfig = (() => {
  const LOCAL_BACKEND_URL = 'http://localhost:3000';

  const PROD_BACKEND_URL = 'http://commercial-merola-ofirdahan-01b4f190.koyeb.app/';

  const hostname =
    typeof window !== 'undefined' ? window.location.hostname : '';

  const isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.local');

  const backendUrl = isLocal ? LOCAL_BACKEND_URL : PROD_BACKEND_URL;

  return {
    API_URL: backendUrl,
    BOT_NAME: 'Poalim Bot',
    BOT_DELAY_MS: 1500,

    STORAGE_KEYS: {
      USERNAME: 'poalim_chat_username',
    },

    // Limits
    MAX_MSG_LENGTH: 500,
    MIN_USERNAME_LENGTH: 2,

    // Socket
    SOCKET_URL: backendUrl,
    ROOM_ID: 'global',
  } as const;
})();
