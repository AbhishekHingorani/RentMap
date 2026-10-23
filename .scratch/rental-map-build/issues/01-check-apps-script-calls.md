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

## Progress

The live test is not run yet. It needs a deploy from the owner's Google account. The agent has no Google login and no `clasp`.

The kit is in `.scratch/rental-map-build/cors-check/`. Its `README.md` lists the files and the steps.

A dry run on 2026-10-23 used `fake-exec.js` in place of Apps Script. Headless Chromium sent the POST with `text/plain;charset=utf-8`. It sent no OPTIONS preflight. It followed the 302 to a second origin, and the page showed "WORKS". This checks the page code only. It does not prove that Google answers the same way.

Still open:

- Which "Anyone" label in the deploy dialog maps to `ANYONE_ANONYMOUS`. Google's docs say "Anyone" is `ANYONE_ANONYMOUS` and "Anyone with Google account" is `ANYONE`. Confirm this in the dialog. The `webapp` block in `appsscript.json` does not settle it, because a deploy from the dialog uses the dialog's choice.
- The live result for the `## Resolution` section.
