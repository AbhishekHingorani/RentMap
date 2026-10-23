# Same listing added twice

**Type:** task
**Status:** completed

**Completed at:** 2026-10-23T12:47:15Z
**Blocked by:** 05

## What to build

The app stops a person from adding a listing that is already on the map. A sure match (same link) is blocked. A possible match (same society and Configuration) gets a warning, and the person decides.

Spec: "Same listing added twice" in SPEC.md.

## Acceptance criteria

- [ ] The link key for 99acres is the `spid-` part of the link, like `M93900012`. For other sites, it is the link without its `?...` and `#...` tail.
- [ ] The key is worked out from the Listing link column. It is not a column.
- [ ] Right after a link is pasted, before any Claude step, a sure match blocks the add. The app shows "Already on the map: <society>, added by <name> on <date>." with an "Open it" button.
- [ ] On every new-listing write, the script looks for the key again inside its lock. On a match it writes nothing and returns the saved row. The app shows the sure-match message and keeps the person's input.
- [ ] At Save, the app looks for saved listings with the same society (case does not matter) and the same Configuration. It warns: "This might be the same as: <society>, <configuration>, <rent>, <floor>." with "Open it" and "Save anyway".
- [ ] Both checks include Rejected listings. The message names the Status, like "Already on the map (Rejected)".
- [ ] "Open it" opens the listing even when Rejected pins are hidden.
- [ ] A listing with no link has no key. Only the maybe-match runs for it.
- [ ] The maybe-match runs only for a new listing.
