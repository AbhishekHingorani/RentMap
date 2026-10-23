# Decide what happens when two people edit one listing at once

Type: grilling
Status: resolved
Blocked by: none

## Question

[Decide how to edit and delete a saved listing](15-edit-delete-listing.md) lets anyone edit Claude-filled fields, Status, ratings, notes, pros, cons and photos. [Check that a Google Apps Script can be the backend](10-apps-script-backend.md) found that the script lock stops broken writes, but a newer edit can still overwrite an older one. Example: Asha opens a listing and changes Rent. Ravi has the same listing open from 10 minutes ago and adds a note. Ravi's save writes his old Rent back. Decide: does each save send only the changed cells, or the whole row? Does the sheet need a row version check that refuses a save made on stale data? If a save is refused, what does the person see, and what happens to their unsaved change?

## Resolution

Agreed with the user on 2026-10-23 (Q1 to Q10). All recommended picks accepted.

- **Q1, what a save sends.** A save sends only the plain cells that changed (Rent, Status, a rating, Lat and others), not the whole row.
- **Q2, the clash check.** With each changed cell, the app sends the value the person saw. Inside the script lock, the Apps Script compares it with the cell in the sheet now. If they differ, the script refuses the save. There is no row version column.
- **Q3, list cells.** Notes, Pros, Cons and Photos send "add one item" or "remove one item". The Apps Script changes the cell as it is in the sheet now. These saves are never refused. Removing an item that is already gone counts as done.
- **Q4, the two totals.** After each write, inside the same lock, the Apps Script works out Total monthly cost and Overall rating from the cells in the sheet. This replaces the page doing it in Q1 of [Decide how to edit and delete a saved listing](15-edit-delete-listing.md).
- **Q5, fresh values.** The app reads the listing's row again when a person opens its details and when they click "Edit".
- **Q6, a row that is gone.** A save to a row the sheet owner deleted by hand is refused. The app says "This listing is no longer in the sheet" and removes its pin.
- **Q7, one clash refuses all.** If one cell in a save clashes, the Apps Script writes nothing from that save. The clean changes stay in the person's form.
- **Q8, after a refused Edit save.** The Edit form stays open with what the person typed. Each clashing cell shows "In the sheet now: <value>" with two buttons: "Use sheet value" and "Keep mine". The next Save sends the sheet value as the old value.
- **Q9, "Our take" saves on click.** Status and each of the 5 ratings save at once on one click. There is no Save button on that tab.
- **Q10, a refused click or pin drag.** The control shows the sheet value, and the pin goes back to the sheet spot. A message says, for example, "Someone changed Status to Visited. Your change was not saved." The app does not retry.
