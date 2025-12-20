// Central place for FeatureChat DOM ids.
// These are used for label/aria-describedby wiring (A11y) and should stay stable across refactors.
export const FEATURE_CHAT_DOM_IDS = {
  NICKNAME_INPUT: 'nickname-input',
  NICKNAME_ERROR: 'nickname-error',

  COMPOSER_INPUT: 'composer-input',
  COMPOSER_ERROR: 'composer-error',
} as const;

export type FeatureChatDomId =
  (typeof FEATURE_CHAT_DOM_IDS)[keyof typeof FEATURE_CHAT_DOM_IDS];
