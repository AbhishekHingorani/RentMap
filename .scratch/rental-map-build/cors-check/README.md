# Apps Script call check

The kit for ticket 01. It tests that a page on `http://localhost` can POST to an Apps Script web app with no login.

## Files

- `Code.gs`: the test script. `doPost` reads `e.postData.contents`, parses the JSON, and returns `{ ok, got, contentType, at }` as JSON.
- `appsscript.json`: the manifest. It sets `executeAs: USER_DEPLOYING` and `access: ANYONE_ANONYMOUS`.
- `index.html`: the test page. It sends POST with `Content-Type: text/plain;charset=utf-8` and a JSON body, then prints the reply, `res.redirected` and `res.url`.
- `serve.js`: serves `index.html` on `http://localhost:8780`.

## Steps

1. Open https://script.google.com and make a new project.
2. Paste `Code.gs` into the editor.
3. Project Settings: turn on "Show appsscript.json manifest file in editor". Paste `appsscript.json` over the file there.
4. Deploy > New deployment > type "Web app". Execute as: "Me". Who has access: pick the "Anyone" choice that has no Google account in its name.
5. Copy the `/exec` URL.
6. Open the `/exec` URL in a private window. It must show `{"ok":true,"method":"GET"}` with no login page. If you see a login page, the access choice is wrong.
7. Run `node .scratch/rental-map-build/cors-check/serve.js` from the repo root.
8. Open `http://localhost:8780`, paste the `/exec` URL, and press Send. Or open `http://localhost:8780/?url=<exec URL>`, which sends at once.
9. "WORKS" means the reply came back. `redirected: true` and a `finalUrl` on `script.googleusercontent.com` show that `fetch` followed the 302.
10. On "FAILS", open DevTools > Console and copy the exact error.

Write the result in the ticket's `## Resolution` section.
