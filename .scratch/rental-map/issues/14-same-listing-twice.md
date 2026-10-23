# Spot a listing added twice

Type: grilling
Status: resolved
Blocked by: none

## Question

Two people can add the same flat, or one person can paste the same link twice. How does the app spot this, and what does it do? Candidates to judge: the same 99acres `spid-` id in the link, the same Listing link, or the same society plus Configuration plus rent. Decide when the check runs (on Save in the review form, from [Decide the add-by-link flow](07-add-by-link-flow.md)), what the person sees, and whether they can still save. The prototype shows the case: its sample reply re-adds Ahad Excellencia, which is already on the map (assets/map-ui-prototype.html).

## Resolution

Agreed with the user on 2026-10-23 (Q1 to Q7).

- **Q1, sure match.** The app gets a link key from each Listing link. For 99acres, the key is the `spid-` part (like `M93900012`). For other sites, the key is the link without its `?...` and `#...` tail. Two listings with the same key are the same listing.
- **Q2, when the link check runs.** At step 1 of [Decide the add-by-link flow](07-add-by-link-flow.md), right after the person pastes the link. This is before any Claude call.
- **Q3, what a sure match does.** The app blocks the add. It shows "Already on the map: <society>, added by <name> on <date>." with an "Open it" button. The person cannot save a second copy.
- **Q4, maybe-match.** At Save in the review form, the app looks for saved listings with the same society name (case does not matter) and the same Configuration. Rent is not checked, because two sites can show different rents for one flat.
- **Q5, what a maybe-match does.** The app warns: "This might be the same as: <society>, <configuration>, <rent>, <floor>." It has two buttons, "Open it" and "Save anyway".
- **Q6, Rejected listings.** Both checks include Rejected listings. The message names the Status, like "Already on the map (Rejected)". "Open it" opens the listing even when the map hides Rejected pins.
- **Q7, check in the Apps Script.** On every new-listing write, the Apps Script looks for the link key again inside its write lock. If the key is there, it refuses the write and sends back the saved row. The app then shows the Q3 message and keeps the person's notes in the form. The script checks only the sure match, not the maybe-match.

Follows from the picks: a listing added by hand with no link has no link key, so only the maybe-match check runs for it. The link key is worked out from the Listing link column. It is not a new column.
