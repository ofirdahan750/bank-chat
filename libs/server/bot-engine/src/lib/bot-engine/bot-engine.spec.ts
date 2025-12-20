import { BotEngine } from './bot-engine';
import type {
  ChatMessage,
  PersistedBotRoomMemory,
  User,
} from '@poalim/shared-interfaces';
import { randomUUID } from 'crypto';

jest.mock('crypto', () => ({
  randomUUID: jest.fn(),
}));

jest.mock('@poalim/constants', () => ({
  BOT_ENGINE_TEXT: {
    MISSING_QUESTION_MARK: ['MISSING_QUESTION_MARK'],
    ASK_FOR_ANSWER: ['ASK_FOR_ANSWER'],
    SAVED_PREFIXES: ['SAVED_PREFIX'],
    UPDATED_PREFIXES: ['UPDATED_PREFIX'],
    REMEMBERED_PREFIXES: ['REMEMBERED_PREFIX'],
    TEMPLATES: {
      SAVED_LINE: '{base} Q="{question}" A="{answer}"',
      UPDATED_LINE: '{base} Q="{question}" A="{answer}"',
      REMEMBERED_LINE: '{intro} A="{answer}"',
    },
  },
}));

const makeUser = (overrides?: Partial<User>): User => ({
  id: 'u1',
  username: 'Ofir',
  isBot: false,
  color: '#000',
  ...overrides,
});

const makeBot = (overrides?: Partial<User>): User => ({
  id: 'bot',
  username: 'BOT',
  isBot: true,
  color: '#fff',
  ...overrides,
});

const makeMsg = (overrides?: Partial<ChatMessage>): ChatMessage => ({
  id: 'm1',
  sender: makeUser(),
  content: 'hi',
  timestamp: 1,
  type: 'text',
  ...overrides,
});

describe('BotEngine', () => {
  let engine: BotEngine;

  beforeEach(() => {
    engine = new BotEngine();

    jest.spyOn(Math, 'random').mockReturnValue(0); // pickOne() -> first, pickTypingMs() -> base
    jest.spyOn(Date, 'now').mockReturnValue(1000);

    const uuidMock = randomUUID as jest.MockedFunction<typeof randomUUID>;
    const UUID_1: ReturnType<typeof randomUUID> =
      '11111111-1111-1111-1111-111111111111';

    uuidMock.mockReturnValue(UUID_1);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('hydrateRoom() should restore only valid qa entries and rebuild memory', () => {
    const roomId = 'r1';

    const persisted: PersistedBotRoomMemory = {
      pending: null,
      qa: [
        {
          key: 'hello?',
          question: 'hello?',
          answer: 'world',
          questionMessageId: 'q1',
          answerMessageId: 'a1',
          updatedAt: 123,
        },
        // invalid entry -> should be ignored
        // @ts-expect-error intentional dirty persisted json
        { key: 123, question: null, answer: 'x' },
      ],
    };

    engine.hydrateRoom(roomId, persisted);

    const botUser = makeBot();
    const action = engine.onUserMessage(
      roomId,
      makeMsg({ id: 'mQ', content: 'Hello?' }),
      botUser
    );

    const UUID_1: ReturnType<typeof randomUUID> =
      '11111111-1111-1111-1111-111111111111';

    expect(action).not.toBeNull();
    expect(action!.message.sender).toEqual(botUser);
    expect(action!.message.type).toBe('system');
    expect(action!.message.id).toBe(UUID_1);
    expect(action!.typingMs).toBe(450);
    expect(action!.message.content).toBe('REMEMBERED_PREFIX A="world"');

    // asking something that only existed in invalid entry -> not remembered
    const action2 = engine.onUserMessage(
      roomId,
      makeMsg({ id: 'mQ2', content: 'Bad?' }),
      botUser
    );
    expect(action2).not.toBeNull();
    expect(action2!.message.content).toBe('ASK_FOR_ANSWER');
  });

  it('dumpRoom() should return current persisted memory snapshot', () => {
    const roomId = 'r1';

    engine.onUserMessage(
      roomId,
      makeMsg({ id: 'q1', content: 'Hi?' }),
      makeBot()
    ); // ask for answer
    engine.onUserMessage(
      roomId,
      makeMsg({ id: 'a1', content: 'Hello' }),
      makeBot()
    ); // saves

    const dump = engine.dumpRoom(roomId);

    expect(dump.pending).toBeNull();
    expect(Array.isArray(dump.qa)).toBe(true);
    expect(dump.qa.length).toBe(1);

    const [entry] = dump.qa;
    expect(entry?.questionMessageId).toBe('q1');
    expect(entry?.answerMessageId).toBe('a1');
    expect(entry?.answer).toBe('Hello');
    expect(entry?.question).toBe('Hi?');
  });

  it('onUserMessage() should return null for bot sender or empty content', () => {
    const roomId = 'r1';
    const botUser = makeBot();

    expect(
      engine.onUserMessage(
        roomId,
        makeMsg({ sender: makeBot(), content: 'Hi?' }),
        botUser
      )
    ).toBeNull();

    expect(
      engine.onUserMessage(roomId, makeMsg({ content: '   ' }), botUser)
    ).toBeNull();
  });

  it('onUserMessage() should require "?" to treat message as a question', () => {
    const roomId = 'r1';
    const botUser = makeBot();

    const action = engine.onUserMessage(
      roomId,
      makeMsg({ id: 'm1', content: 'What is this' }),
      botUser
    );

    expect(action).not.toBeNull();
    expect(action!.message.content).toBe('MISSING_QUESTION_MARK');
  });

  it('onUserMessage() should set pending for new question and ask for answer', () => {
    const roomId = 'r1';
    const botUser = makeBot();

    const action = engine.onUserMessage(
      roomId,
      makeMsg({ id: 'q1', content: 'What is this?' }),
      botUser
    );

    expect(action).not.toBeNull();
    expect(action!.message.content).toBe('ASK_FOR_ANSWER');

    const dump = engine.dumpRoom(roomId);
    expect(dump.pending).not.toBeNull();
    expect(dump.pending!.questionMessageId).toBe('q1');
    expect(dump.pending!.question).toBe('What is this?');
    expect(dump.pending!.key).toBe('what is this?');
  });

  it('onUserMessage() should learn the next non-question as the answer when pending', () => {
    const roomId = 'r1';
    const botUser = makeBot();

    engine.onUserMessage(
      roomId,
      makeMsg({ id: 'q1', content: 'What?' }),
      botUser
    );

    const action = engine.onUserMessage(
      roomId,
      makeMsg({ id: 'a1', content: '42' }),
      botUser
    );

    expect(action).not.toBeNull();
    expect(action!.message.content).toBe('SAVED_PREFIX Q="What?" A="42"');

    const dump = engine.dumpRoom(roomId);
    expect(dump.pending).toBeNull();
    expect(dump.qa.length).toBe(1);
    expect(dump.qa[0]?.answer).toBe('42');

    // ask again -> remembered
    const action2 = engine.onUserMessage(
      roomId,
      makeMsg({ id: 'q2', content: 'What?' }),
      botUser
    );
    expect(action2).not.toBeNull();
    expect(action2!.message.content).toBe('REMEMBERED_PREFIX A="42"');
  });

  it('onUserMessage() should drop pending if user asks another question instead of answering', () => {
    const roomId = 'r1';
    const botUser = makeBot();

    engine.onUserMessage(
      roomId,
      makeMsg({ id: 'q1', content: 'First?' }),
      botUser
    );

    const action = engine.onUserMessage(
      roomId,
      makeMsg({ id: 'q2', content: 'Second?' }),
      botUser
    );

    expect(action).not.toBeNull();
    expect(action!.message.content).toBe('ASK_FOR_ANSWER');

    const dump = engine.dumpRoom(roomId);
    expect(dump.pending).not.toBeNull();
    expect(dump.pending!.questionMessageId).toBe('q2');
    expect(dump.qa.length).toBe(0);
  });

  it('onMessageEdited() should update an existing learned ANSWER and respond with updated line', () => {
    const roomId = 'r1';
    const botUser = makeBot();

    engine.onUserMessage(
      roomId,
      makeMsg({ id: 'q1', content: 'What?' }),
      botUser
    );
    engine.onUserMessage(roomId, makeMsg({ id: 'a1', content: '42' }), botUser);

    const action = engine.onMessageEdited(
      roomId,
      makeMsg({ id: 'a1', content: '43' }),
      botUser
    );

    expect(action).not.toBeNull();
    expect(action!.message.content).toBe('UPDATED_PREFIX Q="What?" A="43"');

    const remembered = engine.onUserMessage(
      roomId,
      makeMsg({ id: 'q2', content: 'What?' }),
      botUser
    );
    expect(remembered).not.toBeNull();
    expect(remembered!.message.content).toBe('REMEMBERED_PREFIX A="43"');
  });

  it('onMessageEdited() should update an existing learned QUESTION, move key if needed, and answer immediately if it is a question', () => {
    const roomId = 'r1';
    const botUser = makeBot();

    engine.onUserMessage(
      roomId,
      makeMsg({ id: 'q1', content: 'What?' }),
      botUser
    );
    engine.onUserMessage(roomId, makeMsg({ id: 'a1', content: '42' }), botUser);

    const action = engine.onMessageEdited(
      roomId,
      makeMsg({ id: 'q1', content: 'What now?' }),
      botUser
    );

    expect(action).not.toBeNull();
    expect(action!.message.content).toBe('REMEMBERED_PREFIX A="42"');

    // new key should work
    const remembered2 = engine.onUserMessage(
      roomId,
      makeMsg({ id: 'q2', content: 'what   now???' }),
      botUser
    );
    expect(remembered2).not.toBeNull();
    expect(remembered2!.message.content).toBe('REMEMBERED_PREFIX A="42"');

    // old question should not be remembered anymore
    const old = engine.onUserMessage(
      roomId,
      makeMsg({ id: 'q3', content: 'What?' }),
      botUser
    );
    expect(old).not.toBeNull();
    expect(old!.message.content).toBe('ASK_FOR_ANSWER');
  });

  it('onMessageEdited() should fallback to onUserMessage() when edit is not mapped to known Q/A', () => {
    const roomId = 'r1';
    const botUser = makeBot();

    const action = engine.onMessageEdited(
      roomId,
      makeMsg({ id: 'x1', content: 'No question mark' }),
      botUser
    );

    expect(action).not.toBeNull();
    expect(action!.message.content).toBe('MISSING_QUESTION_MARK');
  });

  it('onMessageEdited() should return null for bot sender or empty content', () => {
    const roomId = 'r1';
    const botUser = makeBot();

    expect(
      engine.onMessageEdited(
        roomId,
        makeMsg({ sender: makeBot(), content: 'Hello?' }),
        botUser
      )
    ).toBeNull();

    expect(
      engine.onMessageEdited(roomId, makeMsg({ content: '   ' }), botUser)
    ).toBeNull();
  });
});
