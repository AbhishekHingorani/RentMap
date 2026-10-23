# Bookmarklet and "Ask my local Claude"

Type: task
Status: open
Blocked by: 05

## What to build

When Claude web cannot read the listing, the person clicks a bookmarklet on the open listing page. It copies a prompt that holds the page data. The person pastes it into Claude web. A person with Claude Code can instead paste the text into the app and click "Ask my local Claude".

Spec: "Add a listing by link" (steps 3 to 6, "Step 1 prompt", "Ask my local Claude") in SPEC.md.

## Acceptance criteria

### Bookmarklet step

- [ ] A failed reply opens the bookmarklet step. A small "Reply looks wrong?" link also opens it.
- [ ] The step tells the person how to add the bookmarklet to the bookmarks bar.
- [ ] On 99acres, the bookmarklet sends a trimmed pick from `window.__initialData__.pd.pageData.propertyDetails.prop_data`, about 3,000 characters. It includes lat, long and the photo links from `pd.pageData.galleryDetails.pdGalleryData.property.images[i].variants.O`.
- [ ] On other sites, or when `__initialData__` is missing, it sends `document.body.innerText`.
- [ ] If `Prop_Id` does not match the `spid-` part of the URL, it shows "Reload this page and click again".
- [ ] It copies the step 2 prompt to the clipboard. The step 2 prompt is the step 1 prompt with "Here is the listing page data: <pasted data>" as its first line.
- [ ] If the copy fails, it shows a box on the page with a Copy button and the text selected.
- [ ] Test it in Chrome on the saved 99acres sample and on one live 99acres page.

### Ask my local Claude

- [ ] The button shows only in the bookmarklet step.
- [ ] The local web server runs `claude -p` with exactly the flags in the spec, including `--max-budget-usd 0.10` and `--json-schema`. It does not use `--bare`.
- [ ] The app reads `structured_output`. A missing `structured_output` is a failure.
- [ ] If the $0.10 cap stops the run, the app says "Local Claude stopped. Use the Claude web prompt." and keeps the pasted text in the box.
- [ ] A good reply fills the same review form as the Claude web path.

## Not in this ticket

Safari, housing.com data and 99acres without a reload stay open gaps in the spec.
