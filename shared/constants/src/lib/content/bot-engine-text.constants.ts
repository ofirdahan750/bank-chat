import { BotEngineTexts } from "@poalim/shared-interfaces";

export const BOT_ENGINE_TEXT: BotEngineTexts = {
  MISSING_QUESTION_MARK: [
    'I can only treat something as a question if it ends with a "?". Add one and I’ll behave.',
    'No "?" no magic. Add a question mark and I’ll file it properly.',
    'I’m a bot, not a mind reader. Toss in a "?" so I know it’s a question.',
    'Give me a "?" at the end and I’ll switch into answer-machine mode.',
  ],
  ASK_FOR_ANSWER: [
    'New question unlocked. Reply with the answer in your next message and I’ll remember it.',
    'I don’t know this one yet. Send the answer next and I’ll store it forever (or until the server restarts).',
    'Fresh mystery. Drop the answer in your next message and I’ll learn it.',
    'I’ve got nothing for that yet. Next message: the answer. I’ll do the remembering.',
  ],
  SAVED_PREFIXES: [
    'Saved. Next time someone asks, I’ve got you.',
    'Locked in. I will not forget. Probably.',
    'Stored. I am now 0.001% smarter.',
    'Saved. That knowledge is mine now. Thanks, human.',
  ],
  UPDATED_PREFIXES: [
    'Updated. My memory just got a patch.',
    'Edited accepted. Memory rewritten.',
    'Reality has been revised. I have updated the answer.',
    'Version control says: new answer saved.',
  ],
  REMEMBERED_PREFIXES: [
    'I remember this. The answer is:',
    'Memory check: passed. Answer:',
    'Seen this one before. Answer:',
    'Yep. We already solved this. Answer:',
  ],
  TEMPLATES: {
    SAVED_LINE: '{base} Q: "{question}" A: "{answer}"',
    UPDATED_LINE: '{base} Q: "{question}" A: "{answer}"',
    REMEMBERED_LINE: '{intro} "{answer}"',
  },
} as const;
