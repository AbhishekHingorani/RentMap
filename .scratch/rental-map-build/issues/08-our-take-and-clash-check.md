# Our take tab, with the clash check

**Type:** task
**Status:** completed

**Completed at:** 2026-10-23T13:26:14Z
**Blocked by:** 03, 05

## What to build

A person sets Status, rates the home, and adds pros, cons and notes on the Our take tab. Each click saves at once. If someone else changed the same cell first, the save is refused and the person sees the sheet value.

This ticket builds the clash check in the Apps Script. Tickets 09 and 10 use it.

Spec: "Edit a listing" (Our take, Lists, Notes, No delete) and "Two people edit one listing" in SPEC.md.

## Acceptance criteria

- [ ] The app reads the listing's row again when a person opens its details.
- [ ] Status and each of the 5 ratings save at once on one click. The tab has no Save button.
- [ ] A save sends only the changed cell, with the value the person saw.
- [ ] Inside the lock, the script compares each old value with the cell in the sheet now. If any cell differs, it writes nothing and returns the sheet values.
- [ ] A refused click shows the sheet value and a message, like "Someone changed Status to Visited. Your change was not saved." The app does not retry.
- [ ] After a rating save, the script writes the new Overall rating inside the same lock.
- [ ] Pros, cons and notes send "add one item" or "remove one item". The script changes the cell as it is in the sheet now. These never clash. Removing an item that is already gone counts as done.
- [ ] A "×" removes one pro or one con.
- [ ] Each new note starts with the writer's name and the date.
- [ ] Each note has a "×" with a "Delete this note?" box. Anyone can delete any note. Nobody can edit a note.
- [ ] If the row is gone from the sheet, the save is refused. The app says "This listing is no longer in the sheet" and removes its pin.
- [ ] If a saved listing is hidden by the filters, its details show a yellow note: "Your filters hide this listing on the map." The filters do not change.
- [ ] There is no Delete button.

## Open question for the owner

- **How notes are split inside the Notes cell.** The spec does not say. The owner must decide before notes are built.
