# Rental map app

Label: wayfinder:map

## Destination

A written spec for a shared rental map app. Each person runs it on their own computer against one Google Sheet. It is ready to hand to a builder. Nothing is left to decide before the build starts.

## Notes

- Domain: house rentals in India. Listings come from sites like 99acres and housing.com, or are added by hand.
- Each session consults the `grilling` and `domain-modeling` skills. Talk to the user in plain, short words.
- Fixed choices from charting (2026-10-23, updated the same day for sharing):
  - The app is shared. Other people can view, add listings, write notes, and shortlist.
  - The data lives in a Google Sheet. Photos live in one shared Google Drive folder, reached through the Apps Script. (This replaces the local Excel file and the local `photos/` folder.)
  - There is no central server. Each person runs the app on their own computer. Every copy reads and writes the same Google Sheet.
  - The page is plain HTML, CSS and JavaScript.
  - The map is OpenStreetMap with Leaflet.
  - Each pin spot comes from the page or the address. Any user can drag a pin to fix it.
  - Claude cannot fetch 99acres or housing.com pages directly (see Decisions so far).
  - Add by link: the app first gives the person a prompt with only the link, to run in Claude web. If Claude cannot read the page, a bookmarklet (a bookmarks-bar button) runs on the open listing page, reads the page text and photo links, and copies a second prompt. The person pastes Claude's reply back into the app.
  - People who have Claude Code also get an "Ask my local Claude" button. Their own local helper server runs `claude -p`.
  - A Google Apps Script attached to the sheet does all reads and writes. Users need no Google login. The script's web address is the secret; share it only with trusted people.
  - Each person starts the app with one command that runs a small local web server.
- Design: all design work uses Impeccable (https://github.com/pbakaus/impeccable). It is installed in `.claude/skills/impeccable`. Product facts for it are in `PRODUCT.md`. (User, 2026-10-23.)
- Tracker: local markdown in `.scratch/rental-map/`. See `.scratch/rental-map/README.md`.
- Spec: on 2026-10-23 the user chose to write the spec before every open item was decided. It is `SPEC.md` in the repo root. Its "Known gaps" section lists the items still in Not yet specified, plus a few small points no ticket settled.

## Decisions so far

- [Add the sample Excel sheet](issues/02-sample-excel.md): `Apartment Hunt.xlsx` has a 28-column tracker with a budget limit, a 5-value Status (Shortlisted is one), 5 ratings, and a shortlist comparison sheet.
- [Test Claude web with one listing link](issues/09-test-claude-web.md): Claude web read a 99acres link alone, with 13 photo URLs; no lat/long or contacts; reply was prose, so the prompt must ask for JSON.
- [Check that a Google Apps Script can be the backend](issues/10-apps-script-backend.md): yes; text/plain POST, script lock on writes, one base64 photo per call, browser-made listing ids. CORS needs a live test before the build.
- [Decide how the listing page reaches Claude](issues/08-page-to-claude.md): link-only prompt for Claude web first, a bookmarklet second prompt as fallback, plus a local `claude -p` button for Claude Code users.
- [Can local claude read a listing link](issues/01-claude-reads-listing.md): no, both sites block server fetches; JSON output with `--json-schema` works on the user's login.
- [Find a free way to turn an Indian address into a map spot](issues/05-geocoding.md): Nominatim at 1 request per second, Photon as fallback, save a precision tag per pin. With no central server, each person's app geocodes once per listing and the sheet row is the cache.
- [Check what a bookmarklet can read from a listing page](issues/11-bookmarklet.md): on 99acres, `window.__initialData__` holds all fields, lat/long and 13 photo links; CSP and clipboard need a live test; no housing.com sample yet.
- [Pick the sheet columns](issues/03-excel-columns.md): 40-column Tracker tab plus Places and Settings tabs, no formulas, shared ratings, Shortlisted stays a Status value, live distances to important places.
- [Test the bookmarklet live in Chrome and Safari](issues/12-bookmarklet-live-test.md): Chrome only, 99acres only. The bookmarklet runs, reads the right listing, and copies to the clipboard with no extra click. Safari and housing.com are untested.
- [Decide the add-by-link flow](issues/07-add-by-link-flow.md): fixed JSON keys with `null` for missing values, an error reply plus a "no rent and no locality" check, bookmarklet only after a failure, a review form before Save, site photo links kept, and a cheap `claude -p --model haiku` call capped at $0.10.
- [Pick the map filters](issues/13-map-filters.md): max ₹/month box on total cost (starts at the budget), configuration checkboxes, "Shortlisted only" and "Show rejected" switches, one society/locality search; per person, reset on open.
- [Sketch the map and listing detail screen](issues/06-map-ui-prototype.md): list on the left and map on the right; details and add steps open in the left column; detail tabs (Overview, Our take, Contacts, All 40 fields); pins show "₹38k · 2BHK" colored by Status.
- [Spot a listing added twice](issues/14-same-listing-twice.md): the link key (`spid-` id on 99acres) blocks a second copy at paste time and again in the Apps Script; same society plus Configuration only warns at Save; Rejected listings count.
- [Decide how to edit and delete a saved listing](issues/15-edit-delete-listing.md): an "Edit" button on "All 40 fields" fixes Claude-filled fields; no Delete button, Rejected removes; "×" removes one photo link, note, pro or con; edits do not move the pin.
- [Decide what happens when two people edit one listing at once](issues/16-same-listing-two-editors.md): a save sends only changed cells with the old value, and the Apps Script refuses the whole save if a cell changed meanwhile; list cells add or remove one item and never clash; the script works out the two totals; a refused save keeps the person's input.

## Not yet specified

- How the user starts the app: one command, and what it opens.
- How other people get the app onto their computer (zip file, git repo) and set the Apps Script address.
- Bookmarklet in Safari: does it run on 99acres and housing.com, and does copy to clipboard work. Not tested yet.
- housing.com: what data the listing page holds for a bookmarklet. Save one listing page into `samples/` first.
- 99acres listing opened from a search page with no reload: does `__initialData__` still match the URL. Not tested yet.
- Copy site photos into the Drive folder, so they survive when the listing goes away. No test shows that the browser or Apps Script can download 99acres photos.
- Cost of one local `claude -p` call with the picked flags. Not measured yet.
- How often each person's list and map read the whole sheet again, so they see other people's new listings and changes.
- City for geocoding: the queries need a city and a viewbox, but the Settings tab has only Budget.
- Small points no ticket settled: Overall rating when some ratings are empty, how notes are split in the Notes cell, whether a place can be edited or removed, and whether Photos stores a Drive file id or a full link.
- Road distance (by car or bike) from a listing to each important place, in place of straight-line distance. Needs a free routing service for India.

## Out of scope

- [Pick a Node library to read and write Excel](issues/04-node-excel-library.md): a local `.xlsx` file is no longer the store; the Google Sheet replaced it.
- A phone app.
