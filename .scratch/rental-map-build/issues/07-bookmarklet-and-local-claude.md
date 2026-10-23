# Bookmarklet and "Ask my local Claude"

**Type:** task
**Status:** completed

**Completed at:** 2026-10-23T13:12:57Z
**Blocked by:** 05

## What to build

When Claude web cannot read the listing, the person clicks a bookmarklet on the open listing page. It copies a prompt that holds the page data. The person pastes it into Claude web. A person with Claude Code can instead paste the text into the app and click "Ask my local Claude".

Spec: "Add a listing by link" (steps 3 to 6, "Step 1 prompt", "Ask my local Claude") in SPEC.md.

## Acceptance criteria

### Bookmarklet step

- [x] A failed reply opens the bookmarklet step. A small "Reply looks wrong?" link also opens it.
- [x] The step tells the person how to add the bookmarklet to the bookmarks bar.
- [x] On 99acres, the bookmarklet sends a trimmed pick from `window.__initialData__.pd.pageData.propertyDetails.prop_data`, about 3,000 characters. It includes lat, long and the photo links from `pd.pageData.galleryDetails.pdGalleryData.property.images[i].variants.O`.
- [x] On other sites, or when `__initialData__` is missing, it sends `document.body.innerText`.
- [x] If `Prop_Id` does not match the `spid-` part of the URL, it shows "Reload this page and click again".
- [x] It copies the step 2 prompt to the clipboard. The step 2 prompt is the step 1 prompt with "Here is the listing page data: <pasted data>" as its first line.
- [x] If the copy fails, it shows a box on the page with a Copy button and the text selected.
- [ ] Test it in Chrome on the saved 99acres sample and on one live 99acres page.

### Ask my local Claude

- [x] The button shows only in the bookmarklet step.
- [x] The local web server runs `claude -p` with exactly the flags in the spec, including `--max-budget-usd 0.10` and `--json-schema`. It does not use `--bare`.
- [x] The app reads `structured_output`. A missing `structured_output` is a failure.
- [x] If the $0.10 cap stops the run, the app says "Local Claude stopped. Use the Claude web prompt." and keeps the pasted text in the box.
- [x] A good reply fills the same review form as the Claude web path.

## Not in this ticket

Safari, housing.com data and 99acres without a reload stay open gaps in the spec.

## Progress

2026-10-23.

Built:

- `public/lib/bookmarklet.mjs`: the bookmarklet code and its `javascript:` link.
- `local-claude.js` and `POST /api/local-claude` in `server.js`: runs `claude -p` with the spec flags.
- The bookmarklet step in `public/app.mjs`, between "Ask Claude web" and "Check and save".
- `npm test` runs `tests/bookmarklet.test.mjs` and `tests/local-claude.test.mjs`.

Checked:

- Unit tests run the bookmarklet on the `__initialData__` of the saved sample. The pick is 3,194 characters, with lat, long and all 13 `variants.O` photo links.
- Chrome for Testing 156, with Playwright: the bookmarklet code ran on a page with the sample's `__initialData__` at a `spid-M93900012` URL and copied the step 2 prompt to the clipboard. A `spid-R11111111` URL showed "Reload this page and click again".
- Chromium 108, headless, on the full saved sample page: with no clipboard access, the box showed the prompt, selected, with a Copy button.
- The app in Chrome 156, with the sheet and local Claude faked: a `could_not_read` reply opened the bookmarklet step. "Ask my local Claude" shows only there. The budget message showed and the pasted text stayed. A good reply opened the review form.
- One real `claude -p` run on the sample pick gave a full `structured_output`. It cost $0.0025 and took 11 seconds. A run with a $0.0001 cap gave `subtype: "error_max_budget_usd"` and exit code 1.

Not checked: the bookmarklet on a live 99acres page. That needs a person in Chrome.

Steps for the owner:

1. Run `node server.js`.
2. Click "+ Add listing" and paste a live 99acres link. Click Next.
3. Paste `{"error": "could_not_read"}` as the reply and click "Read the reply".
4. Drag "Rental map: read page" to the bookmarks bar.
5. Open the live listing from its own link and click the bookmark. Check that a "Copied" notice shows.
6. Paste the clipboard into Claude web, then paste Claude's reply into the app. Check the review form.
7. If that works, tick the last "Bookmarklet step" box.
