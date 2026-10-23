# Can an Apps Script web app be the only backend

Ticket: issues/10-apps-script-backend.md
Checked: 2026-10-23
Method: read Google's Apps Script docs. No Google project was made. Nothing was deployed, so no live test.

## Short answer

Yes, with care. The page must send POST with `Content-Type: text/plain` and no custom headers. The script must use `LockService` around writes. Photos must be shrunk in the browser before upload. A short live test of the CORS path is still needed before the build, because Google does not document it.

## Deploy settings

- The manifest lists four access values. `ANYONE` means "any logged in user". `ANYONE_ANONYMOUS` means "any user, logged in or not". [manifest docs](https://developers.google.com/apps-script/manifest/web-app-api-executable)
- Users need no Google login, so the app needs `ANYONE_ANONYMOUS`. In the Deploy dialog that is the plain "Anyone" choice, not "Anyone with Google account". The docs do not state the label mapping. The builder should check it in the dialog.
- Execute as: `USER_DEPLOYING` ("Execute the app as me"). The docs say "the script always executes as you, the owner of the script, no matter who accesses the web app." [web apps guide](https://developers.google.com/apps-script/guides/web)
- With "execute as me", the script cannot see who is calling. `Session.getActiveUser().getEmail()` returns nothing in this mode. So the page must send the person's name in each request if the sheet should record who did what. [authorization docs](https://developers.google.com/apps-script/guides/services/authorization)
- Use the `/exec` URL. The `/dev` URL only works for people with edit access to the script. [web apps guide](https://developers.google.com/apps-script/guides/web)
- Avoid request parameters named `c` or `sid`. They can cause HTTP 405. [web apps guide](https://developers.google.com/apps-script/guides/web)

## CORS and the redirect

What Google documents:

- Only `doGet(e)` and `doPost(e)` exist. They must return `HtmlOutput` or `TextOutput`. [web apps guide](https://developers.google.com/apps-script/guides/web)
- The POST body arrives as `e.postData.contents`, with its type in `e.postData.type`. [web apps guide](https://developers.google.com/apps-script/guides/web)
- ContentService output "is redirected to a one-time URL". Clients must follow redirects. [content service guide](https://developers.google.com/apps-script/guides/content)
- Return JSON with `ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON)`. [content service guide](https://developers.google.com/apps-script/guides/content)
- Google's docs do not mention CORS at all. I found no Apps Script entry on Google's issue tracker about it.

What developers report (not Google docs):

- There is no `doOptions`. A browser preflight (OPTIONS) gets HTTP 405. [GreenFlux blog](https://blog.greenflux.us/so-you-want-to-send-json-to-a-google-apps-script-web-app/), [Apps Script community group](https://groups.google.com/g/google-apps-script-community/c/zJpevovcFLA)
- A body sent as `text/plain;charset=utf-8` is a "simple" request, so the browser sends no preflight. The script still reads the JSON text from `e.postData.contents` and calls `JSON.parse`. [GreenFlux blog](https://blog.greenflux.us/so-you-want-to-send-json-to-a-google-apps-script-web-app/)
- `/exec` answers with 302 to `script.googleusercontent.com`. `fetch` follows it by default and turns the POST into a GET there. The script has already run on the first hop. The second hop only fetches the stored output.
- Many working apps show the redirect target sends `Access-Control-Allow-Origin: *`, so the page can read the JSON. This is widely relied on but is not in Google's docs.

Rules for the page:

- `fetch(url, { method: "POST", body: JSON.stringify(req), headers: { "Content-Type": "text/plain;charset=utf-8" } })`.
- No other headers. No `credentials: "include"`. An `Authorization` header or `application/json` type triggers a preflight and fails.
- Reads can use GET with query parameters, or the same POST shape. One POST shape for everything is simpler.
- A failed fetch may still have written to the sheet. The page should not blindly retry writes. Give each new listing an id made in the browser so a retry can be spotted.

## Quotas for a free account

From the quotas page, consumer (gmail.com) column. [quotas](https://developers.google.com/apps-script/guides/services/quotas)

- Script runtime: 6 min per execution.
- Simultaneous executions: 30 per user, 1,000 per script. With "execute as me", every request runs as the owner. So 30 at once is the real cap. That is plenty for a few friends.
- There is no listed daily cap on web app calls. There is no listed cap on Sheets reads or writes or on Drive file creation by script.
- URL Fetch: 20,000 calls per day, 50 MB per call. This only matters if the script fetches other sites. It does not count calls to the web app.
- Spreadsheets created: 250 per day. Not relevant; the app uses one sheet.
- Triggers total runtime: 90 min per day. Not relevant unless the build adds timed triggers.
- Quotas reset 24 hours after the first request.
- Drive storage is the owner's normal free 15 GB, shared with Gmail and Photos.

## Photo upload to Drive

- The page reads the file, shrinks it on a `<canvas>`, and sends base64 in the JSON body.
- The script runs `Utilities.base64Decode(str)` to get bytes, then `Utilities.newBlob(bytes, mimeType, name)`. [Utilities](https://developers.google.com/apps-script/reference/utilities/utilities)
- Then `DriveApp.getFolderById(FOLDER_ID).createFile(blob)`. The docs list no size limit for the blob form. The `createFile(name, content)` string form throws above 50 MB. The `createFile(name, content, mimeType)` form throws above 10 MB. [Folder](https://developers.google.com/apps-script/reference/drive/folder)
- Google documents no POST body limit for web apps. Base64 adds about 33% to the size.
- Advice: shrink each photo to about 1600 px on the long side, JPEG quality 0.8. That is 200 to 500 KB. Send one photo per request. This keeps each call short and far from any hidden limit.

## Return the photo link

- After `createFile`, call `file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)`. `ANYONE_WITH_LINK` means "Anyone who has the link can access. No sign-in required." [Access enum](https://developers.google.com/apps-script/reference/drive/access), [File](https://developers.google.com/apps-script/reference/drive/file)
- Simpler: set the shared folder itself to "Anyone with the link can view" once. New files then take the folder's sharing.
- Return `file.getId()` and store the id in the sheet. Do not store a full URL.
- `file.getUrl()` opens the Drive viewer page. It cannot go in an `<img>` tag.
- `file.getDownloadUrl()` only works for "users with permission to open the file". [File](https://developers.google.com/apps-script/reference/drive/file)
- For `<img src>`, the page builds `https://drive.google.com/thumbnail?id=<ID>&sz=w1600`. Google does not document this URL as a stable API. The old `uc?export=view` form is known to break in some browsers. Treat the image URL as a risk.
- Fallback that is fully documented: a `getPhoto` action returns `Utilities.base64Encode(file.getBlob().getBytes())` and the page shows it as a `data:` URL. This costs one script call per photo, so cache it in the browser.

## Stop two writes from clashing

- Use `LockService.getScriptLock()`. It "prevents any user from concurrently running a section of code", whoever the user is. [LockService](https://developers.google.com/apps-script/reference/lock/lock-service)
- `getUserLock()` would not work here. All calls run as the owner, and it only blocks the same user.
- `waitLock(ms)` throws after the timeout. `tryLock(ms)` returns `false`. [Lock](https://developers.google.com/apps-script/reference/lock/lock)
- Call `SpreadsheetApp.flush()` before `releaseLock()`. The lock also frees itself when the script ends. [Lock](https://developers.google.com/apps-script/reference/lock/lock)
- Pattern: `lock.waitLock(20000)`, find the row by listing id, write, `flush()`, `releaseLock()` in a `finally`. On timeout, return `{ ok: false, error: "busy" }` so the page can retry.
- Do the Drive upload outside the lock. Only the sheet write needs it.
- The lock stops two writes from mixing. It does not stop one person overwriting another's newer edit. That needs a row version or "updated at" check. This links to the open map item "Two people edit the same listing at the same time".

## Answer

Yes. An Apps Script web app set to execute as the owner, with "Anyone" access, can be the only backend for a page on `http://localhost`.

Main risks:

1. CORS rests on behavior Google does not document: no preflight with `text/plain`, and `Access-Control-Allow-Origin: *` on the redirect. Google could change it. Do a 10-minute live test before the build.
2. The `/exec` URL is the only secret. Anyone with it can read and write the sheet and upload files to Drive. There is no per-user login or audit unless the page sends a name.
3. Showing Drive photos in `<img>` relies on an undocumented thumbnail URL. Keep the base64 fallback ready.
4. No documented POST size limit. Shrink photos in the browser and send one per call.
5. Each call takes a second or more, plus the redirect. Load the whole sheet in one call at start, not one call per listing.
6. A failed fetch may hide a write that worked. Use browser-made listing ids so retries do not add duplicates.
7. Editing the script needs a new version on the same deployment ("Manage deployments", edit). A new deployment gets a new URL, and every user would need the new one.
