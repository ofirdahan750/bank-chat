import { ChatMessage } from "../messages";


export type BotReplyUpsertResult = {
  msg: ChatMessage;
  isNew: boolean;
};
