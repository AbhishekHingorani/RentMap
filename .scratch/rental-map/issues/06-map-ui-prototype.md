# Sketch the map and listing detail screen

Type: prototype
Status: resolved
Blocked by: 03, 13

## Question

How should the screen look and behave? A rough page with a Leaflet map, pins, and a detail panel that opens on pin click. The panel shows all columns, photos, and lets the user edit notes, pros, cons, phone numbers, ratings, and Status. It also shows the add-by-link steps (prompt to copy, place to paste Claude's reply, fields to review), the "Ask my local Claude" button, and the "add by hand" form with photo upload. It also shows the important places from the Places tab as their own markers, the straight-line distance from the listing to each place, a way to add a place by name and address, and the first-run box that asks the person's name. It also shows the filter bar from [Pick the map filters](13-map-filters.md). Columns: [Pick the sheet columns](03-excel-columns.md).

Prototype: assets/map-ui-prototype.html (three layouts, switch with ?variant=A|B|C). Run: `python3 -m http.server 8765 -d .scratch/rental-map/assets`, then open http://localhost:8765/map-ui-prototype.html

## Resolution

Agreed with the user on 2026-10-23 (Q1 to Q7). All recommended picks accepted. The prototype had three layouts: A (map first, side drawer), B (list and map), C (map with bottom sheet).

- **Layout (Q1):** B. A list on the left, the map on the right. The list shows the listings the filters let through, sorted by Total monthly cost, lowest first. A listing with no rent goes last. Each card shows a photo, society, Status, locality, total cost, Configuration, Overall rating, and the straight-line distance to each place.
- **Left column tabs:** Listings (filter bar on top, then the list) and Places (the place list and the "add a place" form). "+ Add listing" sits above the tabs.
- **Add steps (Q2):** in the left column, stacked. The current step is open. A done step folds to one line with a "Change" link. Later steps show greyed out. The map stays in view.
- **Listing details (Q3):** a click on a card or a pin opens the details in the left column, with a "Back to the list" link. Header: society, locality, Status, total cost, an "Over budget" tag, Configuration, Overall rating, a link to the listing page. Tabs:
  - Overview: photos and photo upload, money, flat details, distance to each place.
  - Our take: Status, the 5 ratings, pros and cons, notes.
  - Contacts: Listed by, broker name, broker phone, owner name, owner phone.
  - All 40 fields: every Tracker column with its number, plus the "Move pin" button.
- **Pins (Q4):** each pin shows total cost and Configuration, like "₹38k · 2BHK". Its color shows the Status. Places show as a black ★ with their name.
- **Hidden new listing (Q5):** a saved listing that the filters hide still goes into the sheet. Its details show a yellow note: "Your filters hide this listing on the map." The filters do not change.
- **Rough pin spot (Q6):** when a picked listing's pin precision is society or locality, a dashed circle shows around its pin.
- **"Ask my local Claude" (Q7):** shows only in the bookmarklet step. Local Claude cannot open 99acres links, so it needs the page text that the bookmarklet copies.
- The first-run name box is a popup over the page.
- **Design:** the user asked that all design work use Impeccable (https://github.com/pbakaus/impeccable). Install it with `npx impeccable install`, then run `/impeccable init`.

Prototype: assets/map-ui-prototype.html. It is a throwaway and stays out of the build.
