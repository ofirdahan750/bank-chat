export const UI_TEXT = {
  LOGIN: {
    TITLE: 'Welcome to Poalim Chat',
    SUBTITLE: 'Please choose a nickname to start',
    INPUT_PLACEHOLDER: 'Enter your nickname...',
    BUTTON: 'Start Chatting',
    ERROR_REQUIRED: 'Nickname is required',
    ERROR_MIN_LENGTH: 'Nickname must be at least 2 characters',
    ERROR_MAX_LENGTH: 'Nickname is too long',
  },

  CHAT: {
    INPUT_PLACEHOLDER: 'Type your message here...',
    SEND_BUTTON: 'Send',
    TYPING: 'is typing...',
    ERROR_REQUIRED: 'Message is required',
    EMPTY_STATE: 'Start the conversation by sending a message',
  },

  BOT: {
    DEFAULT_GREETING: 'Hello! I am the Poalim Bot. Ask me anything!',
    DUPLICATE_ANSWER_PREFIX:
      'I remember someone asking that! Here is the answer:',
  },

  // Keep A11y strings centralized too (screen readers + aria labels).
  A11Y: {
    NICKNAME_REGION: 'Nickname setup',
    CHAT_REGION: 'Chat room',
    CHAT_LOG: 'Messages',
    NICKNAME_INPUT_LABEL: 'Nickname',
    MESSAGE_INPUT_LABEL: 'Message',
    LOGOUT_BUTTON: 'Logout',
  },
} as const;

export const ChatUi = {
  USER: {
    DEFAULT_ID: 'me',
    DEFAULT_COLOR: '#3b82f6',
    MAX_USERNAME_LENGTH: 24,
  },
  BOT: {
    ID: 'bot',
    DEFAULT_COLOR: '#ed1d24',
  },
} as const;
