# FILE: docs/SETUP.md

# Setup & Local Development

## 1) Prerequisites
- Node.js (LTS recommended)
- npm
- Git

Optional:
- Watchman (macOS) for better file watching (can also produce recrawl warnings; see docs/TROUBLESHOOTING.md)

## 2) Install Dependencies
From repo root:
~~~bash
npm ci
~~~

If you do not have a lockfile or prefer:
~~~bash
npm install
~~~

## 3) Nx Concepts (Very Short)
Nx runs targets via:
~~~bash
npx nx <target> <project>
~~~

Examples:
~~~bash
npx nx test client
npx nx test server
npx nx build client
npx nx serve server
~~~

List projects:
~~~bash
npx nx show projects
~~~

Inspect a project:
~~~bash
npx nx show project client
~~~

## 4) Run Locally

### 4.1 Start Server
~~~bash
npx nx serve server
~~~

Server exposes:
- HTTP health check: GET /health → "ok"
- Socket.IO: configured by AppConfig / constants

### 4.2 Start Client
~~~bash
npx nx serve client
~~~

Open the URL Nx prints.

## 5) Build

Build client:
~~~bash
npx nx build client
~~~

Build server:
~~~bash
npx nx build server
~~~

Build multiple:
~~~bash
npx nx run-many -t build
~~~

## 6) Lint
~~~bash
npx nx run-many -t lint
~~~

## 7) Format (if configured)
~~~bash
npx nx format:check
npx nx format:write
~~~
