# Add by link, Claude web path

**Type:** task
**Status:** completed

**Completed at:** 2026-10-23T12:33:13Z
**Blocked by:** 02, 04

## What to build

A person pastes a listing link. The app gives them a prompt for Claude web. They paste Claude's reply back. The app fills a review form. The person checks it and clicks Save. The new listing shows on the list and the map.

Spec: "Add a listing by link" (steps 1, 2, 3, 7 and 8, "Claude's reply", "Step 1 prompt") and "The Apps Script > Writes" in SPEC.md.

## Acceptance criteria

- [ ] A "+ Add listing" button sits above the left column. It opens the add steps in the left column.
- [ ] The steps are stacked. The current step is open. A done step folds to one line with a "Change" link. Later steps are greyed out.
- [ ] After a link is pasted, the app shows the step 1 prompt with the link in it, ready to copy.
- [ ] The app reads Claude's reply from the ```json block and maps each fixed key to its Tracker column.
- [ ] A reply fails if it is `{"error": "could_not_read"}`, or if it has no rent and no locality. In this ticket, a failure shows a clear message. Ticket 07 adds the bookmarklet step.
- [ ] The review form shows the values. A value in the wrong format (like "2 BHK", or "38,999" as text) is fixed and marked yellow.
- [ ] Nothing is written before Save.
- [ ] The browser makes the Listing id. A retried write with the same id does not add a second row.
- [ ] The app fills Status (To call), Listing link, Date added and Added by.
- [ ] If lat and long are `null`, the app geocodes from society plus locality and saves the Pin precision.
- [ ] Each write runs inside the script lock: `waitLock(20000)`, write, `flush()`, `releaseLock()` in a `finally`. A lock timeout returns `{ "ok": false, "error": "busy" }`.
- [ ] Inside the same lock, the script writes Total monthly cost (rent + maintenance) and Overall rating.
- [ ] Site photo links are kept as they are. Nothing is copied into Drive.

## Assumption

The owner said on 2026-10-23 to build on this assumption.

- **Overall rating with some ratings empty.** Overall rating is the average of the filled ratings only. When none of the 5 is filled, Overall rating is empty.

## Acceptance criteria for the assumption

- [ ] With Safety 4 and Location 2 filled and the other 3 empty, Overall rating is 3.
- [ ] With all 5 ratings empty, Overall rating is empty.
