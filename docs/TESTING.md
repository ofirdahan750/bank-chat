# FILE: docs/TESTING.md

# Testing (Jest)

## 1) Test Runner
This repo uses Jest (via Nx integrations / jest configs per project).

Common commands:
~~~bash
npx nx test client
npx nx test feature-chat
npx nx test socket-handler
npx nx test bot-engine
~~~

Run all:
~~~bash
npx nx run-many -t test
~~~

## 2) Running a Single Spec File (Direct Jest)
Sometimes it is useful to run one spec with a specific config:

~~~bash
node node_modules/jest/bin/jest.js "<ABSOLUTE_PATH_TO_SPEC>" -c "<ABSOLUTE_PATH_TO_JEST_CONFIG>"
~~~

## 3) What We Test

### Client
- ChatStore:
  - init only once
  - auto-connect when username already exists
  - submitNickname persistence + connect + optional greeting
  - logout resets everything
  - send optimistic append + socket call
  - edit optimistic update + socket call
  - reaction toggle optimistic update + socket call
  - effects consume one-shot socket events then reset them

- SocketClientService:
  - connect lifecycle (connecting → connected)
  - emits JOIN_ROOM on connect
  - sets signals when server events arrive
  - emits SEND_MESSAGE / EDIT_MESSAGE / TOGGLE_REACTION only when connected
  - disconnect resets state + removes listeners

### Server
- Socket handler:
  - JOIN_ROOM joins/leaves rooms and emits history
  - SEND_MESSAGE prevents sender spoofing, persists, broadcasts, triggers bot typing + reply
  - EDIT_MESSAGE only author allowed, bot reply upsert/update flows correctly
  - TOGGLE_REACTION validates reaction keys, updates message, emits update

- BotEngine:
  - question mark requirement
  - pending answer behavior
  - edit question/answer behavior
  - normalization behavior

## 4) Determinism Tips

### UUIDs in tests
If TypeScript types require UUID template literals, use a valid UUID-shaped string:
- example: 00000000-0000-0000-0000-000000000001

### Timers in tests
Prefer Jest fake timers for deterministic tests:
~~~ts
jest.useFakeTimers();
jest.runOnlyPendingTimers();
jest.useRealTimers();
~~~
