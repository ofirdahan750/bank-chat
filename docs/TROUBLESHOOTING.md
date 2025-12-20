# FILE: docs/TROUBLESHOOTING.md

# Troubleshooting

## 1) Watchman Recrawl Warnings (macOS)
If you see:
- watchman warning: Recrawled this watch ...

Reset watch:
~~~bash
watchman watch-del "<PATH_TO_REPO>"
watchman watch-project "<PATH_TO_REPO>"
~~~

If watchman keeps misbehaving, you can also uninstall it or disable watchman integration (depends on your environment).

## 2) Jest Fails Due to Timers
If tests rely on delayed behavior (setTimeout):
- use Jest fake timers in spec
- run pending timers
- restore real timers afterwards

## 3) Socket Not Connecting in HTTPS Deployments
If client page is HTTPS but socket URL is HTTP for remote host:
- the client resolves to HTTPS automatically for non-local targets
- ensure server supports WSS/HTTPS at that domain

## 4) Chat Not Resetting After Redeploy
If persistence uses a persistent volume, redeploy does not clear data.
Reset requires deleting the persisted DB file or removing the volume.

## 5) CORS Blocked Origin
Server checks allowed origins.
Fix by adding deployed client origin to allowed list (server config/constants).
