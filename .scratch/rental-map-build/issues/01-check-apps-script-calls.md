# Check Apps Script calls from localhost

**Type:** task
**Status:** completed
**Completed at:** 2026-10-23T11:49:19Z
**Blocked by:** None

## What to build

A 10-minute live test before the build. It proves that a page on `http://localhost` can call an Apps Script web app with no login. The no-preflight path comes from developer reports, not Google docs. So test it first.

Spec: "Check before the build" and "The Apps Script" in SPEC.md.

## Acceptance criteria

- [x] A test script is deployed as a web app. It executes as the owner. Access is anyone, with no login.
- [x] The ticket records which "Anyone" choice in the deploy dialog maps to `ANYONE_ANONYMOUS`.
- [x] A page on `http://localhost` sends POST with `Content-Type: text/plain;charset=utf-8` and a JSON body to the `/exec` URL.
- [x] The script reads the body from `e.postData.contents` and returns JSON.
- [x] `fetch` follows the 302 redirect, and the page reads the JSON reply.
- [x] The result goes in a `## Resolution` section: it works, or it fails with the exact error.

## Progress

The kit is in `.scratch/rental-map-build/cors-check/`. Its `README.md` lists the files and the steps.

A dry run on 2026-10-23 used `fake-exec.js` in place of Apps Script. Headless Chromium sent the POST with `text/plain;charset=utf-8`. It sent no OPTIONS preflight. It followed the 302 to a second origin, and the page showed "WORKS". This checked the page code only.

## Resolution

It works. On 2026-10-23 the owner deployed `Code.gs` as a web app from their Google account and ran the live test from `http://localhost:8780`. The page showed "WORKS".

- The page sent POST with `Content-Type: text/plain;charset=utf-8` and a JSON body to the `/exec` URL. It sent no login.
- `fetch` followed Google's 302 redirect and read the JSON reply from `doPost`.
- "Who has access" was set to plain "Anyone", as step 2 of the kit's `README.md` says. That label is `ANYONE_ANONYMOUS`. "Anyone with Google account" is `ANYONE`, and it would have returned a sign-in page, not JSON.

The build can use the no-preflight `text/plain` POST for every write to the Apps Script.
