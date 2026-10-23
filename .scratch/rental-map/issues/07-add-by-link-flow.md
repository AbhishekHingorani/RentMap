# Decide the add-by-link flow

Type: grilling
Status: resolved
Blocked by: 03, 09, 11, 12

## Question

What happens step by step after a person pastes a link? Settled already: link-only prompt for Claude web first, bookmarklet second prompt as fallback, "Ask my local Claude" button for Claude Code users ([Decide how the listing page reaches Claude](08-page-to-claude.md)). Still open:
- The exact prompt text and the reply shape (JSON) the app accepts.
- How the app tells a good reply from a "could not read the page" reply, and when it offers the bookmarklet.
- Does the person review and fix fields before the row is saved.
- How bookmarklet photo links get into Google Drive.
- Flags for the local `claude -p` call to cut cost (`--model`, `--setting-sources`, `--max-budget-usd`).

## Resolution

Agreed with the user on 2026-10-23 (Q1 to Q22).

**Reply shape**
- Claude replies with one JSON object in a ```json block. The keys are short names. The app maps each key to its Tracker column.
- Keys: society, locality, configuration (1RK|1BHK|2BHK|3BHK|4BHK+), listedBy (Owner|Dealer), brokerName, rent, maintenance, deposit, brokerage (numbers in rupees), carpetArea, superArea (sq ft), bathrooms, floor (like "4 of 4"), furnishing (Unfurnished|Semi-furnished|Fully furnished), parking (Yes|No), lift (Yes|No), availableFrom, otherDetails, photos (full-size links of this flat only), lat, long.
- A value the page does not show is `null`. Claude does not guess.

**Prompt text** (the builder may tune the words; the keys stay fixed)

```
Open this rental listing: <link>
Reply with one JSON object in a ```json block and nothing else.
Keys: society, locality, configuration (1RK|1BHK|2BHK|3BHK|4BHK+),
listedBy (Owner|Dealer), brokerName, rent, maintenance, deposit,
brokerage (numbers in rupees), carpetArea, superArea (sq ft),
bathrooms, floor (like "4 of 4"),
furnishing (Unfurnished|Semi-furnished|Fully furnished),
parking (Yes|No), lift (Yes|No), availableFrom, otherDetails,
photos (full-size image links of this flat only), lat, long.
Write null for anything the page does not show. Do not guess.
If you cannot open the page, reply {"error": "could_not_read"}.
```

The step 2 prompt is the same, but its first line is "Here is the listing page data: <pasted data>".

**Steps**
1. The person pastes a link. The app shows the step 1 prompt to copy into Claude web.
2. The person pastes Claude's reply into the app.
3. The reply fails if it is `{"error": "could_not_read"}`, or if it has no rent and no locality. On a failure, the app shows the bookmarklet step. A small "Reply looks wrong?" link also opens that step.
4. Bookmarklet on 99acres: it sends the trimmed data pick from `window.__initialData__` (about 3,000 characters, with lat/long and photo links). On other sites, or with no `__initialData__`, it sends `document.body.innerText`.
5. If `Prop_Id` does not match the `spid-` part of the link, the bookmarklet shows "Reload this page and click again".
6. The bookmarklet copies the step 2 prompt by itself. If that fails, it shows a box with a Copy button.
7. The person pastes Claude's reply into the app. People with Claude Code can paste the bookmarklet text into the app and click "Ask my local Claude" in its place.
8. The app shows a review form with the values filled in. A value in the wrong format (like "2 BHK" or "38,999" as text) is fixed and marked yellow. The person fixes any field and clicks Save. Nothing is written before Save.
9. If lat and long are `null`, the app finds the spot from society plus locality.

**Photos:** the Photos column keeps the site links (like `imagecdn.99acres.com/...`). Nothing is copied into Drive. A person can upload a photo by hand.

**Local `claude -p` call:** `--model haiku --setting-sources "" --tools "" --strict-mcp-config --disable-slash-commands --max-budget-usd 0.10 --no-session-persistence --output-format json --json-schema '<schema>'`. The app reads `structured_output`. A missing `structured_output` is a failure. If the cap stops the run, the app says "Local Claude stopped. Use the Claude web prompt." and keeps the pasted text in the box. The cost with these flags is not measured.
