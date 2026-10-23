# Rental map app: build spec

Written 2026-10-23 from the wayfinder map in `.scratch/rental-map/map.md`. Each section names the ticket that holds the full decision. Words like Listing, Status and Pin precision have the meaning in `GLOSSARY.md`. Product facts and design rules are in `PRODUCT.md`.

Some questions are still open. They are listed in [Known gaps](#known-gaps). The builder must not guess an answer to a gap. Ask the owner, or build the part that does not depend on it.

## What the app does

A small group hunting for one rental home puts every listing they look at on one map. Each person can add listings, rate them, write notes and change their Status. All data lives in one Google Sheet that the group shares. Photos live in one shared Google Drive folder.

## Parts

| Part | Where it runs | What it does |
|---|---|---|
| Page | Each person's Chrome, from `http://localhost` | The whole UI. Plain HTML, CSS and JavaScript, no framework. Map: OpenStreetMap tiles with Leaflet. |
| Local web server | Each person's computer, started with one command | Serves the page. Geocodes addresses (see [Map spots](#map-spots)). Runs `claude -p` for "Ask my local Claude". |
| Apps Script | Google, attached to the sheet | Does every read and write of the sheet and every photo upload. |
| Google Sheet | Google | The data. Three tabs: Tracker, Places, Settings. |
| Drive folder | Google | Photos people upload by hand. |
| Bookmarklet | A button on each person's bookmarks bar | Reads a listing page the person has open and copies a prompt for Claude. |

There is no central server. There is no Google login. Every copy of the app talks to the same Apps Script.

## The sheet

Source: [Pick the sheet columns](.scratch/rental-map/issues/03-excel-columns.md).

Headers are in row 1. The sheet has no formulas. Every value is a plain value.

### Tracker tab

One row per listing.

| # | Column | Type | Who fills it |
|---|---|---|---|
| 1 | Listing id | text | app (made in the browser) |
| 2 | Society / building name | text | Claude |
| 3 | Locality | text | Claude |
| 4 | Configuration | 1RK, 1BHK, 2BHK, 3BHK, 4BHK+ | Claude |
| 5 | Status | To call, Visit scheduled, Visited, Shortlisted, Rejected | person; a new listing starts as To call |
| 6 | Listed by | Owner, Dealer | Claude |
| 7 | Broker name | text | Claude |
| 8 | Broker phone | text | person (sites hide phone numbers) |
| 9 | Owner name | text | person |
| 10 | Owner phone | text | person |
| 11 | Rent (₹/month) | number | Claude |
| 12 | Maintenance (₹/month) | number | Claude |
| 13 | Total monthly cost | number | Apps Script: rent + maintenance |
| 14 | Deposit | number | Claude |
| 15 | Brokerage fee | number | Claude |
| 16 | Carpet area (sq ft) | number | Claude; may be empty |
| 17 | Super built-up area (sq ft) | number | Claude; may be empty |
| 18 | Bathrooms | number | Claude |
| 19 | Floor / total floors | text, like "4 of 4" | Claude |
| 20 | Furnishing | Unfurnished, Semi-furnished, Fully furnished | Claude |
| 21 | Parking | Yes, No | Claude |
| 22 | Lift | Yes, No | Claude |
| 23 | Available from | text | Claude |
| 24 | Other details | text: facts with no column (facing, balconies, power backup, furnishing items) | Claude |
| 25 | Safety | 1 to 5 | person |
| 26 | Water supply | 1 to 5 | person |
| 27 | Location | 1 to 5 | person |
| 28 | Condition | 1 to 5 | person |
| 29 | Natural light | 1 to 5 | person |
| 30 | Overall rating | number | Apps Script: average of 25 to 29 |
| 31 | Pros | text, items split by ";" | person |
| 32 | Cons | text, items split by ";" | person |
| 33 | Notes | text | person; the app puts the writer's name and the date before each note |
| 34 | Photos | image links (Drive or site), split by ";" | Claude or person |
| 35 | Listing link | URL | app |
| 36 | Lat | number | app; a person can drag the pin |
| 37 | Long | number | app; a person can drag the pin |
| 38 | Pin precision | building, society, locality | app |
| 39 | Date added | date | app |
| 40 | Added by | text | app |

Claude never fills the 5 ratings.

### Places tab

Important places shared by everyone: Name, Address, Lat, Long, Pin precision, Added by. A person adds a place in the app by name and address. The app finds its map spot, unless the person types coordinates like `23.0300, 72.5100`. Typed coordinates get the building Pin precision. A person can edit a place's name, address and coordinates. A new address gets a new map spot from the geocoder. A place has no id, so the Apps Script finds the row by the name, address, lat and long the person saw. If no row still holds them, someone changed the place first, and nothing is written. A place cannot be removed in the app yet.

### Settings tab

Three values: Budget (₹/month), City and Photos folder. City starts as Bangalore. See [Assumptions](#assumptions). `setup` makes the Drive folder for uploaded photos and writes its link in the Photos folder row.

### Who did what

The app asks each person's name once, in a popup over the page on first run. It keeps the name on that computer and sends it with each write. The Apps Script runs as the sheet owner, so it cannot tell who is calling by itself. There is no "last edited by" column.

## The Apps Script

Source: [Check that a Google Apps Script can be the backend](.scratch/rental-map/issues/10-apps-script-backend.md). Details and links: `.scratch/rental-map/research/apps-script-backend.md`.

### Deploy

- Deploy as a web app. Execute as the owner (`USER_DEPLOYING`). Access: anyone, with no login (`ANYONE_ANONYMOUS`).
- The page calls the `/exec` URL. That URL is the only secret. Share it only with trusted people.
- To change the script, edit the existing deployment and pick a new version. A new deployment gets a new URL, and every person would need it.

### Calls

- The page sends POST with `Content-Type: text/plain;charset=utf-8` and no other headers. This avoids a CORS preflight, which Apps Script answers with HTTP 405.
- The body is JSON. The script reads it from `e.postData.contents`.
- `fetch` follows the 302 redirect to `script.googleusercontent.com` by default. The page reads the JSON reply there.
- Do not name a request field `c` or `sid`. They can cause HTTP 405.
- At start, the page loads all three tabs in one call. Each call takes a second or more, so do not load one listing per call.

### Writes

- Every sheet write runs inside `LockService.getScriptLock()`: `waitLock(20000)`, find the row by Listing id, write, `SpreadsheetApp.flush()`, then `releaseLock()` in a `finally`.
- If the lock times out, the script returns `{ "ok": false, "error": "busy" }`. The page may retry.
- Photo uploads to Drive run outside the lock.
- After every write to a listing, inside the same lock, the script works out Total monthly cost and Overall rating from the cells in the sheet and writes them.
- A failed `fetch` may hide a write that worked. Because the browser makes the Listing id, a retried new-listing write does not add a second row.

## Screen

Source: [Sketch the map and listing detail screen](.scratch/rental-map/issues/06-map-ui-prototype.md). The throwaway sketch is `.scratch/rental-map/assets/map-ui-prototype.html`. Do not build from its code.

All design work uses Impeccable, installed in `.claude/skills/impeccable`. Laptop Chrome only. There is no phone layout.

### Layout

- The list is on the left. The map is on the right. The map stays in view at all times.
- Above the left column: a "+ Add listing" button.
- Left column tabs: Listings (filter bar, then the list) and Places (the place list and an "add a place" form).
- The list shows the listings the filters let through. It is sorted by Total monthly cost, lowest first. A listing with no rent goes last.
- Each card shows: a photo, society, Status, locality, total cost, Configuration, Overall rating, and the straight-line distance to each place.
- Money is in rupees with Indian digit groups, like ₹1,17,000.
- A value the listing does not show reads "not given".
- Show "© OpenStreetMap contributors" on the map.

### Pins

- Each listing pin shows total cost and Configuration, like "₹38k · 2BHK". Its color shows the Status.
- Each place shows as a black ★ with its name.
- When a picked listing's Pin precision is society or locality, a dashed circle shows around its pin. The circle has a radius of 250 m for society and 1500 m for locality. These sizes are a builder's guess.

### Listing details

A click on a card or a pin opens the details in the left column, with a "Back to the list" link.

Header: society, locality, Status, total cost, an "Over budget" tag when the total is above the Budget, Configuration, Overall rating, and a link to the listing page.

Tabs:
- **Overview:** photos and photo upload, money, flat details, distance to each place.
- **Our take:** Status, the 5 ratings, pros, cons, notes.
- **Contacts:** Listed by, broker name, broker phone, owner name, owner phone.
- **All 40 fields:** every Tracker column with its number, an "Edit" button, and a "Move pin" button.

If a person saves a listing that their filters hide, its details show a yellow note: "Your filters hide this listing on the map." The filters do not change.

### Filters

Source: [Pick the map filters](.scratch/rental-map/issues/13-map-filters.md).

- **Max ₹/month:** one number box. It checks Total monthly cost. If Maintenance is empty, it checks Rent alone. A listing with no Rent passes. The box starts at the Budget from the Settings tab. Changing the box does not change the sheet.
- **Configuration:** one checkbox each for 1RK, 1BHK, 2BHK, 3BHK, 4BHK+. All are ticked at start. A listing with no Configuration, or one that is not one of the 5, has nothing to check, so it passes.
- **Shortlisted only:** a switch, off at start.
- **Show rejected:** a switch, off at start. Rejected listings are hidden until it is on.
- **Search:** one box. It matches Society / building name and Locality. Case does not matter.
- A filtered-out pin disappears from the map. Places always show.
- The filter bar shows "N of M listings shown".
- Filters belong to one person. They never go into the sheet, and they reset each time the app opens.

### Distances

The app shows the straight-line distance from each listing to each place. It works this out live and stores nothing.

## Add a listing by link

Sources: [Decide the add-by-link flow](.scratch/rental-map/issues/07-add-by-link-flow.md), [Decide how the listing page reaches Claude](.scratch/rental-map/issues/08-page-to-claude.md), [Check what a bookmarklet can read from a listing page](.scratch/rental-map/issues/11-bookmarklet.md), [Test the bookmarklet live in Chrome and Safari](.scratch/rental-map/issues/12-bookmarklet-live-test.md).

Claude cannot fetch 99acres or housing.com pages from a server. 99acres returns HTTP 403 and housing.com returns HTTP 406. So the page content reaches Claude through the person's browser.

The add steps show in the left column, stacked. The current step is open. A done step folds to one line with a "Change" link. Later steps show greyed out.

### Steps

1. The person pastes a listing link. The app runs the link check (see [Same listing added twice](#same-listing-added-twice)). If the link passes, the app shows the step 1 prompt to copy into Claude web (claude.ai).
2. The person pastes Claude's reply into the app.
3. The reply fails if it is `{"error": "could_not_read"}`, or if it has no rent and no locality. On a failure, the app shows the bookmarklet step. A small "Reply looks wrong?" link also opens that step.
4. The person clicks the bookmarklet on the open listing page.
   - On 99acres, the bookmarklet sends a trimmed pick from `window.__initialData__.pd.pageData.propertyDetails.prop_data` (about 3,000 characters). It includes lat, long and the photo links from `pd.pageData.galleryDetails.pdGalleryData.property.images[i].variants.O`.
   - On other sites, or when `__initialData__` is missing, it sends `document.body.innerText`.
   - If `Prop_Id` does not match the `spid-` part of the URL, it shows "Reload this page and click again".
5. The bookmarklet copies the step 2 prompt to the clipboard. If that fails, it shows a box on the page with a Copy button and the text selected.
6. The person pastes the step 2 prompt into Claude web, then pastes Claude's reply into the app. A person with Claude Code can instead paste the bookmarklet text into the app and click "Ask my local Claude". That button shows only in the bookmarklet step.
7. The app shows a review form with the values filled in. A value in the wrong format (like "2 BHK", or "38,999" as text) is fixed and marked yellow. The person fixes any field and clicks Save. Nothing is written before Save.
8. If lat and long are `null`, the app finds the map spot from society plus locality.

- **Built (ticket 05).** The page code is `public/lib/add-listing.mjs` and the add steps in `public/app.mjs`. The Apps Script action is `addListing`.
  - The review form fixes Configuration ("2 BHK" to 2BHK, "5 BHK" to 4BHK+), money and other numbers ("38,999" to 38999, "38k" to 38000, "1.17 lakh" to 117000), Listed by, Furnishing, Parking and Lift. A value it cannot fix stays as it came, unmarked, and Save refuses it with a message that names the column.
  - The Listing id stays the same when the person changes the reply. It is new only for a new link.
  - When the reply gives lat and long, the Pin precision is building, because the listing page puts the pin on the home.
  - The Listing id is `L-` plus a random UUID. Date added is the person's local date, as YYYY-MM-DD.
  - A listing with no map spot still saves. Its card says "No map spot yet", and its details say why.
  - Overall rating is rounded to 2 decimals. Total monthly cost is rent alone when Maintenance is empty, and empty when Rent is empty.
- **Built (ticket 07).** The bookmarklet is `public/lib/bookmarklet.mjs`. "Ask my local Claude" is `local-claude.js` and the server route `POST /api/local-claude`.
  - The bookmarklet step shows only after a failed reply or a "Reply looks wrong?" click. It is a step between "Ask Claude web" and "Check and save".
  - A reply with no JSON at all is a paste mistake. It shows a message and does not open the bookmarklet step.
  - A 99acres page with no `spid-` in its URL also gets "Reload this page and click again".
  - The 99acres pick on the saved sample is 3,194 characters. It leaves out `haveModernLifts`, because the sample has `false` there while its description says it has lifts.
  - The server runs `claude` in the temp folder, so it reads no CLAUDE.md from the repo. It runs one call at a time and stops a call after 3 minutes.

### Claude's reply

Claude replies with one JSON object in a ```json block. The keys are fixed. The app maps each key to its Tracker column. A value the page does not show is `null`.

### Step 1 prompt

The builder may tune the words. The keys stay fixed.

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

The step 2 prompt is the same, except its first line is "Here is the listing page data: <pasted data>".

### "Ask my local Claude"

The local web server runs:

```
claude -p --model haiku --setting-sources "" --tools "" --strict-mcp-config \
  --disable-slash-commands --max-budget-usd 0.10 --no-session-persistence \
  --output-format json --json-schema '<schema>'
```

- The app reads `structured_output`. A missing `structured_output` is a failure.
- If the $0.10 cap stops the run, the app says "Local Claude stopped. Use the Claude web prompt." and keeps the pasted text in the box.
- Do not use `--bare`. It needs an API key.

### Photos from the site

The Photos column keeps the site's own links (like `imagecdn.99acres.com/...`). Nothing is copied into Drive.

## Same listing added twice

Source: [Spot a listing added twice](.scratch/rental-map/issues/14-same-listing-twice.md).

- **Link key.** For 99acres, the key is the `spid-` part of the link (like `M93900012`). For other sites, the key is the link without its `?...` and `#...` tail. The key is worked out from the Listing link column. It is not a column.
- **Sure match.** Right after the person pastes a link, before any Claude call, the app looks for a saved listing with the same key. If one exists, the app blocks the add. It shows "Already on the map: <society>, added by <name> on <date>." with an "Open it" button.
- **Script check.** On every new-listing write, the Apps Script looks for the key again inside its lock. If the key is there, it refuses the write and returns the saved row. The app shows the sure-match message and keeps the person's input in the form.
- **Maybe-match.** At Save in the review form, the app looks for saved listings with the same society name (case does not matter) and the same Configuration. It warns: "This might be the same as: <society>, <configuration>, <rent>, <floor>." with "Open it" and "Save anyway". Rent is not compared.
- Both checks include Rejected listings. The message names the Status, like "Already on the map (Rejected)". "Open it" opens the listing even when Rejected pins are hidden.
- A listing added by hand with no link has no key. Only the maybe-match runs for it.
- The maybe-match runs only for a new listing, not on edit.

- **Built (ticket 06).** The page code is `public/lib/same-listing.mjs` and the add steps in `public/app.mjs`. `apps-script/Code.gs` has its own copy of `linkKey`, and a test checks that the two agree.
  - A 99acres link is one whose host is `99acres.com` or ends in `.99acres.com`. A 99acres link with no `spid-` part gets the other-site key.
  - Only the Rejected Status is named in the message, like "Already on the map (Rejected): ...". The other Statuses show on the map, so the message leaves them out.
  - On a refused write, the Apps Script replies `{ "ok": false, "error": "already_on_map", "listing": <saved row> }`. The Listing id check runs first, so a retried write of the same listing is not refused.
  - The page adds the refused row to its list, so a second Save is blocked in the page with no call.
  - A hand-typed "rejected" or "2 BHK" in the sheet still counts as Rejected or 2BHK. The sure-match message shows Date added as the local day, because the sheet sends a date cell back as a UTC timestamp.
  - When several saved listings are a maybe-match, the warning shows one line for each, each with its own "Open it". One "Save anyway" covers them all. A change to the society or the Configuration runs the check again.

## Edit a listing

Source: [Decide how to edit and delete a saved listing](.scratch/rental-map/issues/15-edit-delete-listing.md).

- **Edit button.** On the "All 40 fields" tab, "Edit" makes the Claude-filled fields editable. "Save" writes them.
- **Locked in the Edit form:** Listing id, Listing link, Total monthly cost, Overall rating, Date added, Added by, Lat, Long, Pin precision.
- **Move pin.** Dragging the pin changes Lat and Long. An edit to Locality or Society does not move the pin.
- **Our take.** Status and each of the 5 ratings save at once on one click. That tab has no Save button.
- **Lists.** A "×" removes one photo link, one pro or one con. A photo file in Drive stays in Drive.
- **Notes.** Anyone can add a note. Each note has a "×" with a "Delete this note?" box. Anyone can delete any note. Nobody can edit a note.
- **No delete.** There is no Delete button. To remove a listing, a person sets its Status to Rejected. The sheet owner can still delete a row by hand in the sheet.

- **Built (ticket 09).** The page code is `public/lib/edit-listing.mjs` and the "All 40 fields" tab in `public/app.mjs`. Both use the `saveCells` action.
  - The Edit form makes 21 cells editable: the Claude-filled cells except Photos, and Broker phone, Owner name and Owner phone. A person fills those 3 by hand, and no other part of the app can change them.
  - Status, the 5 ratings, Pros, Cons and Notes stay on the Our take tab. The form shows them with "Change it on the Our take tab". Photos shows "Change it on the Overview tab".
  - Save fixes a value in the wrong format, like the review form does, and refuses one it cannot fix. A box the person did not touch is not sent, even when the sheet holds it in another format, like "3,000".
  - After a clash, a box the person did not touch shows the sheet value now.
  - A dropped pin also sets Pin precision to building, because the person put the pin on the home. The dashed circle goes away.
  - `saveCells` refuses Listing link, Date added and Added by. It refuses a Lat or Long that is not a number in range, and a Pin precision outside the 3.
  - Move pin needs the pin on the map. A listing with no map spot, or one the filters hide, says so.

## Two people edit one listing

Source: [Decide what happens when two people edit one listing at once](.scratch/rental-map/issues/16-same-listing-two-editors.md).

Example: Asha changes Rent to ₹40,000. Ravi opened the same listing 10 minutes ago. His screen still shows ₹38,000.

- **Fresh values.** The app reads the listing's row again when a person opens its details and when they click "Edit".
- **Only changed cells.** A save sends only the plain cells that changed. With each cell, it sends the value the person saw (the old value).
- **Clash check.** Inside the lock, the Apps Script compares each old value with the cell in the sheet now. If any cell differs, the script writes nothing from that save and returns the sheet values.
- **List cells never clash.** Notes, Pros, Cons and Photos send "add one item" or "remove one item". The script changes the cell as it is in the sheet now. Removing an item that is already gone counts as done.
- **Refused Edit save.** The Edit form stays open with what the person typed. Each clashing cell shows "In the sheet now: <value>" with "Use sheet value" and "Keep mine". The next Save sends the sheet value as the old value.
- **Refused click or pin drag.** The control shows the sheet value. A dragged pin goes back to the sheet spot. A message says, for example, "Someone changed Status to Visited. Your change was not saved." The app does not retry.
- **Row gone.** If the sheet owner deleted the row by hand, the save is refused. The app says "This listing is no longer in the sheet" and removes its pin.

- **Built (ticket 08).** The page code is `public/lib/our-take.mjs` and the Our take tab in `public/app.mjs`. The Apps Script actions are `getListing`, `saveCells` and `editList`.
  - `saveCells` takes `cells: [{ column, old, new }]`. A clash replies `{ "ok": false, "error": "clash", "clashes": [<columns>], "listing": <sheet row> }`. A gone row replies `{ "ok": false, "error": "row_gone" }`.
  - The clash check compares cells as trimmed text. A date cell compares as the ISO text that `load` sends.
  - `saveCells` refuses Listing id, Total monthly cost, Overall rating and the 4 list cells. It refuses a Status outside the 5, and a rating that is not a whole number from 1 to 5 or empty.
  - `editList` takes Pros and Cons. An item cannot hold a ";". It refuses Notes until the owner decides how notes are split. It takes Photos too, from ticket 10.
  - `saveCells` refuses a call that sends the same column twice.
  - A click on the picked rating clears it.
  - A failed call may hide a write that worked, so the app reads the row again and shows what the sheet holds.
  - A row with no Listing id cannot be saved. Its Our take tab says so.
  - The yellow "Your filters hide this listing on the map." note shows on any listing details that the filters hide.
  - **Not built: notes.** Adding a note, the name and date before it, and the "×" with "Delete this note?" wait for the gap "How notes are split inside the Notes cell". The tab shows the Notes cell as plain text.

## Map spots

Source: [Find a free way to turn an Indian address into a map spot](.scratch/rental-map/issues/05-geocoding.md). Details: `.scratch/rental-map/research/geocoding.md`.

- The local web server geocodes, not the browser. It sends at most 1 request per second, through one queue, with a User-Agent that names the app.
- Query order, stop at the first good hit:
  1. Nominatim: `<society>, <city>`.
  2. Nominatim: `<locality>, <city>`.
  3. Photon (`photon.komoot.io`), biased to the city center.
- Always pass `countrycodes=in` and a `viewbox` around the city.
- Save a Pin precision with each spot (building, society or locality), read from `place_rank` or `addresstype`.
- Each listing is geocoded once. The sheet row is the cache, so the app does not ask again once Lat and Long are filled.
- Put the geocoder behind a config switch, so it can be turned off without a code change.
- If the listing page gives lat and long, use those and skip geocoding.
- **Built (ticket 04).** The code is `geocoder.js`, called through `POST /api/geocode` on the local web server. The switch is `"geocoding": false` in `config.json`.
  - The page sends the City from the Settings tab with each call. The server first looks up the city itself on Nominatim, once per city while it runs. That lookup cannot have a `viewbox`, because it is what makes the box. The `viewbox` is the city's box grown by 0.1 degree on each side, so suburbs on the edge fit.
  - Photon names the filters `countrycode` and `bbox`. The server sends both, with the same box.
  - A good hit is inside the box and is a building, a society or a locality. A hit as rough as a whole city does not count. A street can run for kilometres, so a street hit gets the locality Pin precision. Photon has no `place_rank` or `addresstype`, so its `type` gives the Pin precision: house is building, street, locality and district are locality.
  - A Nominatim error, like HTTP 429, moves on to the next query. If Photon then finds nothing, the app shows the Nominatim error. Each request gives up after 15 seconds, so a stalled one cannot hold up the queue.
  - A place has no society or locality. Its Address goes in as the first query, then Photon. If no query finds it, the app does not save the place and says why.

## Photos uploaded by hand

- The page shrinks each photo on a `<canvas>` to about 1600 px on the long side, JPEG quality 0.8.
- It sends one photo per call, as base64 in the JSON body.
- The script saves it to the Drive folder, shares it as "anyone with the link can view", and returns the file id.
- To show a Drive photo, the page uses `https://drive.google.com/thumbnail?id=<ID>&sz=w1600`. Google does not document this URL. Keep a fallback: a script call that returns the photo as base64, shown as a `data:` URL and cached in the browser.

- **Built (ticket 10).** The page code is `public/lib/photos.mjs` and the Overview tab in `public/app.mjs`. The Apps Script actions are `uploadPhoto` and `getPhoto`.
  - `uploadPhoto` takes `{ id, data }`, where data is the base64 JPEG. It refuses data that is not base64, not a JPEG, or over 5 MB, and a gone row. It checks the row before it writes to Drive. It replies `{ "ok": true, "fileId": <id> }`. If Drive will not share the file, for example in a Workspace domain that blocks link sharing, the script moves the file to the bin and says why.
  - The page then sends `editList` with column Photos and `add: "https://drive.google.com/file/d/<ID>/view"`. A Photos add must be a link in that form. A Photos remove takes any link, like a site link.
  - The Drive folder is the one in the Photos folder row of the Settings tab. The row holds the folder link or the bare id.
  - `getPhoto` takes `{ fileId }` and replies `{ "ok": true, "mimeType", "data" }`. It returns only a file in the Photos folder. Anyone with the `/exec` URL can call it, and the script runs as the sheet owner, so it must not return the owner's other files.
  - The page keeps each fallback photo in the browser's Cache Storage, under `rental-map-photos`.
  - Several photos upload one at a time. The first one that fails stops the rest.
  - A phone photo turns upright from its EXIF data before it shrinks. A PNG gets a white ground, because a JPEG has no see-through parts.

## Check before the build

- **CORS live test (10 minutes).** Deploy a test script. From a page on `http://localhost`, POST `text/plain` JSON to `/exec` and read the reply. The no-preflight path comes from developer reports, not Google docs.
- **Deploy dialog.** Confirm which "Anyone" choice maps to `ANYONE_ANONYMOUS`.

## Assumptions

On 2026-10-23 the owner said to build on these 4 assumptions. The build tickets are in `.scratch/rental-map-build/issues/`.

- **Start the app.** The command is `node server.js`. It starts the local web server and opens Chrome on `http://localhost:<port>`.
- **City for geocoding.** The Settings tab has a City row, with Bangalore as the start value. The geocoder reads the city from it and sets the `viewbox` and the Photon bias around that city.
- **Overall rating with some ratings empty.** Overall rating is the average of the filled ratings only. When none of the 5 is filled, it is empty.
- **Photos cell for an upload.** It stores the full Drive link, `https://drive.google.com/file/d/<ID>/view`. The page reads the file id from the link to show the photo.

## Known gaps

These are not decided. Each one needs the owner before that part is built.

- **Install for others.** How other people get the app (zip file or git repo), and how they set the Apps Script address.
- **Refresh.** How often each person's list and map read the whole sheet again, to show other people's new listings and changes.
- **Safari.** Does the bookmarklet run on 99acres and housing.com, and does the clipboard copy work. Only Chrome on 99acres is tested.
- **housing.com.** What data its listing page holds for the bookmarklet. Save one listing page into `samples/` first. Until then, the bookmarklet uses `innerText` there.
- **99acres without a reload.** When a listing is opened from a search page, does `__initialData__` still match the URL. The `Prop_Id` check covers this, but it is untested.
- **Copy site photos into Drive,** so they survive when the listing goes away. No test shows that the browser or the Apps Script can download 99acres photos. For now, site links are kept as they are.
- **Cost of one local `claude -p` call** with the flags above. One run on the saved 99acres sample cost $0.0025 (2026-10-23). Not measured on page text or on other listings.
- **Road distance** by car or bike, in place of straight-line distance. Needs a free routing service for India.
- **Small points the tickets do not settle:**
  - How notes are split inside the Notes cell.
  - Whether a place can be removed.

## Out of scope

- A phone app or phone layout.
- A local `.xlsx` file as the store. The Google Sheet replaced it. See [Pick a Node library to read and write Excel](.scratch/rental-map/issues/04-node-excel-library.md).
