# Check Apps Script calls from localhost

Type: task
Status: open
Blocked by: none

## What to build

A 10-minute live test before the build. It proves that a page on `http://localhost` can call an Apps Script web app with no login. The no-preflight path comes from developer reports, not Google docs. So test it first.

Spec: "Check before the build" and "The Apps Script" in SPEC.md.

## Acceptance criteria

- [ ] A test script is deployed as a web app. It executes as the owner. Access is anyone, with no login.
- [ ] The ticket records which "Anyone" choice in the deploy dialog maps to `ANYONE_ANONYMOUS`.
- [ ] A page on `http://localhost` sends POST with `Content-Type: text/plain;charset=utf-8` and a JSON body to the `/exec` URL.
- [ ] The script reads the body from `e.postData.contents` and returns JSON.
- [ ] `fetch` follows the 302 redirect, and the page reads the JSON reply.
- [ ] The result goes in a `## Resolution` section: it works, or it fails with the exact error.
