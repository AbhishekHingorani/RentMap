# Decide how to edit and delete a saved listing

Type: grilling
Status: resolved
Blocked by: none

## Question

The details screen from [Sketch the map and listing detail screen](06-map-ui-prototype.md) lets a person edit Status, ratings, pros, cons, notes, phone numbers, owner name and photos. Claude-filled fields (rent, society, floor and others) are read-only there. Decide: can a person fix a Claude-filled field after Save, and where (for example an "Edit" button on the All 40 fields tab)? Can a person delete a listing, and who may do it? Does delete remove the sheet row, or set Status to Rejected? Can a person remove one photo or one note?

## Resolution

Agreed with the user on 2026-10-23 (Q1 to Q9). All recommended picks accepted.

- **Q1, fix a Claude-filled field.** Yes. An "Edit" button on the "All 40 fields" tab makes the Claude-filled fields editable. "Save" writes the row. In the same save, the app works out Total monthly cost and Overall rating again and writes them.
- **Q2, locked fields.** Listing id, Listing link, Total monthly cost, Overall rating, Date added, Added by, Lat, Long and Pin precision stay locked in the Edit form. The Listing link is the key for the double-add check. The "Move pin" drag still changes Lat and Long.
- **Q3, delete a listing.** There is no Delete button. To remove a listing, a person sets its Status to Rejected. The map hides it and the double-add check still finds it. The sheet owner can delete a row by hand in the Google Sheet.
- **Q4, remove one photo.** A "×" on each photo removes its link from the Photos column. A photo file in the Drive folder stays in Drive.
- **Q5, remove one note.** Each note has a "×" and a "Delete this note?" box. Anyone can delete any note. Nobody can edit a note. To fix one, a person deletes it and writes a new one.
- **Q6, pros and cons.** A "×" removes one pro or one con.
- **Q7, edit trail.** No "last edited by" column.
- **Q8, pin after an address fix.** An edit to Locality or Society does not move the pin. The person drags the pin if needed.
- **Q9, double-add check on edit.** The "might be the same as" warning runs only when a new listing is saved, not on edit.

Later change: [Decide what happens when two people edit one listing at once](16-same-listing-two-editors.md) Q4 moves the Total monthly cost and Overall rating sums from the page to the Apps Script. A save also sends only the changed cells, not the whole row (Q1 there).
