# FILE: docs/CLI.md

# CLI Cheatsheet

All commands run from repo root.

## Install
~~~bash
npm ci
~~~

## Serve
~~~bash
npx nx serve server
npx nx serve client
~~~

## Build
~~~bash
npx nx build server
npx nx build client
npx nx run-many -t build
~~~

## Test
~~~bash
npx nx test client
npx nx test feature-chat
npx nx test socket-handler
npx nx test bot-engine
npx nx run-many -t test
~~~

## Lint
~~~bash
npx nx run-many -t lint
~~~

## Format (if configured)
~~~bash
npx nx format:check
npx nx format:write
~~~

## Inspect Nx
~~~bash
npx nx show projects
npx nx show project client
~~~

## Reset Server Persistence (Local)
Delete the persisted DB file (path depends on SERVER_PERSISTENCE_CONFIG):
~~~bash
rm -f "./<DATA_DIR_NAME>/<DB_FILE_NAME>"
~~~

Example (older implementation):
~~~bash
rm -f "./.poalim-data/chat-db.json"
~~~
