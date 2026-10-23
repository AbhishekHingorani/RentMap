---
name: rental-map-server-run
description: Use when starting or restarting the rental map server.
category: general
---

# Run and check the rental map server

Start the server with `node server.js`. Add `--no-open` to skip Chrome. The default port is 8790. Use `PORT=8800 node server.js` for another port.

The server reads `config.json` once, when it starts. After you create or edit `config.json`, restart the server. A running server does not see the change.

A missing `config.json` does not stop the server. It prints `No appsScriptUrl in config.json` and the page shows no sheet data. Read that line in the output before you say the app works.

Run the server as a background task. Stop it with `TaskStop`, confirm the port is free, then start it again:

    lsof -nP -iTCP:8790 -sTCP:LISTEN || echo "port free"

Check that it answers:

    curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8790/
    curl -s http://localhost:8790/api/config

If `appsScriptUrl` is `null`, the config did not load. Follow "Set up the sheet and the Apps Script" in `README.md`. To test the sheet, use the `load` check in the apps-script-web-app-browser-calls skill.

Never commit `config.json`. The `/exec` URL is the only secret.

After the server runs, the user refreshes `http://localhost:8790` in Chrome and types a name. The name stays in that Chrome only.
