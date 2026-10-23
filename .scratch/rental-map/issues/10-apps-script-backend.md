# Check that a Google Apps Script can be the backend

Type: research
Status: resolved
Blocked by: none

## Question

Can a Google Apps Script web app, deployed to run as the sheet owner with access for "Anyone", be the only backend for a page served from `http://localhost`? Find out: how `fetch` from the page handles CORS and the redirect (for example POST with `Content-Type: text/plain` to skip the preflight), quotas for a free Google account (calls per day, run time, Drive upload size), how to upload a photo to a Drive folder (base64 in the POST body, size limit), how to stop two writes at once from clashing (`LockService`), and how to return the photo link so the page can show it.

Research findings: research/apps-script-backend.md

## Resolution

Yes, with risks. Deploy the web app to execute as the owner with anonymous access (`ANYONE_ANONYMOUS`). The page POSTs with `Content-Type: text/plain;charset=utf-8` and no other headers, so no preflight is sent; `fetch` follows the 302 to `script.googleusercontent.com`. This CORS behavior comes from developer reports, not Google docs, so a 10-minute live test is needed before the build. Wrap sheet writes in `LockService.getScriptLock()`; it does not stop one person overwriting a newer edit, which needs a row version check. Photos: the page shrinks each to about 1600 px and sends one base64 photo per call; the script saves it to the Drive folder, shares it by link, and returns the file id. The browser makes each listing's id, so a retried write does not add a duplicate. Edit the existing deployment, because a new one changes the URL. Details: research/apps-script-backend.md.
