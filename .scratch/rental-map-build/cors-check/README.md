# Apps Script call check

The kit for ticket 01. It tests that a page on `http://localhost` can POST to an Apps Script web app with no login.

## Files

- `Code.gs`: the test script. `doPost` reads `e.postData.contents`, parses the JSON, and returns `{ ok, got, contentType, at }` as JSON.
- `appsscript.json`: the manifest. It sets `executeAs: USER_DEPLOYING` and `access: ANYONE_ANONYMOUS`. Only a `clasp` or API deploy reads these values. A deploy from the dialog uses the dialog's choices.
- `index.html`: the test page. It sends POST with `Content-Type: text/plain;charset=utf-8` and a JSON body, then prints the reply, `res.redirected` and `res.url`.
- `serve.js`: serves `index.html` on `http://localhost:8780`.
- `fake-exec.js`: a fake `/exec` on port 8766 for a dry run with no deploy. OPTIONS gets 405. POST gets a 302 to a JSON GET on port 8767.

## Steps

1. Open https://script.google.com and make a new project.
2. Paste `Code.gs` into the editor.
3. Project Settings: turn on "Show appsscript.json manifest file in editor". Paste `appsscript.json` over the file there.
4. Deploy > New deployment > type "Web app". Execute as: "Me". Who has access: pick the "Anyone" choice that has no Google account in its name.
5. Copy the `/exec` URL.
6. Open the `/exec` URL in a private window. It must show `{"ok":true,"method":"GET"}` with no login page. If you see a login page, the access choice is wrong.
7. Run `node .scratch/rental-map-build/cors-check/serve.js` from the repo root.
8. Open `http://localhost:8780`, paste the `/exec` URL, and press Send. Or open `http://localhost:8780/?url=<exec URL>`, which sends at once.
9. "WORKS" means the echo came back through a 302. The `finalUrl` must be on `script.googleusercontent.com`.
10. On "FAILS", open DevTools > Console and copy the exact error.

Write the result in the ticket's `## Resolution` section.

## Dry run with no deploy

1. Run `node .scratch/rental-map-build/cors-check/fake-exec.js`.
2. Run `node .scratch/rental-map-build/cors-check/serve.js`.
3. Open `http://localhost:8780/?url=http://127.0.0.1:8766/exec`.

The page shows "WORKS". The `fake-exec.js` log shows `POST /exec` and `GET /echo`, and no `OPTIONS`. This checks the page code only.
