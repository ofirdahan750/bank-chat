export const UIText = {
  LOGIN: {
    TITLE: 'Welcome to Poalim Chat',
    SUBTITLE: 'Please choose a nickname to start',
    INPUT_PLACEHOLDER: 'Enter your nickname...',
    BUTTON: 'Start Chatting',
    ERROR_REQUIRED: 'Nickname is required',
    ERROR_MIN_LENGTH: 'Nickname must be at least 2 characters',
  },

  CHAT: {
    INPUT_PLACEHOLDER: 'Type your message here...',
    SEND_BUTTON: 'Send',
    TYPING: 'is typing...',
    ERROR_REQUIRED: 'Message is required',
  },

  BOT: {
    DEFAULT_GREETING: 'Hello! I am the Poalim Bot. Ask me anything!',
    DUPLICATE_ANSWER_PREFIX:
      'I remember someone asking that! Here is the answer:',
  },
};

export const ChatUi = {
  USER: { DEFAULT_ID: 'me', DEFAULT_COLOR: '#3b82f6', MAX_USERNAME_LENGTH: 24 },
  BOT: { ID: 'bot', DEFAULT_COLOR: '#ed1d24' },
} as const;
