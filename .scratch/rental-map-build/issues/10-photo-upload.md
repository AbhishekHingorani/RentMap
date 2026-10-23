# Photo upload

**Type:** task
**Status:** completed

**Completed at:** 2026-10-23T13:52:26Z
**Blocked by:** 08

## What to build

A person takes photos at a visit and uploads them on the Overview tab. The photos go into the shared Drive folder and show on the card and in the details.

Spec: "Photos uploaded by hand" and "Edit a listing > Lists" in SPEC.md.

## Acceptance criteria

- [ ] The Overview tab has a photo upload control.
- [ ] The page shrinks each photo on a `<canvas>` to about 1600 px on the long side, JPEG quality 0.8.
- [ ] It sends one photo per call, as base64 in the JSON body.
- [ ] The script saves the photo to the Drive folder, outside the lock. It shares it as "anyone with the link can view" and returns the file id.
- [ ] The app adds the photo to the Photos cell with "add one item".
- [ ] The page shows a Drive photo with `https://drive.google.com/thumbnail?id=<ID>&sz=w1600`.
- [ ] If that URL fails, a script call returns the photo as base64. The page shows it as a `data:` URL and caches it in the browser.
- [ ] A "×" removes one photo link. The file stays in Drive.

## Assumption

The owner said on 2026-10-23 to build on this assumption.

- **What the Photos cell stores for an upload.** It stores the full Drive link, `https://drive.google.com/file/d/<ID>/view`. So every item in the cell is a link, the same as the site links. To show the photo, the page reads the file id from the link.

## Acceptance criteria for the assumption

- [ ] After an upload, the Photos cell holds the full Drive link, not the bare id.
- [ ] The page reads the id from that link and shows the photo with the thumbnail URL.
