---
name: rental-selector-app-decisions
category: design
description: Use when editing the rentalSelector rental map app.
---

The rental map plan lives in `.scratch/rental-map/map.md`. Read it before you ask the user a design question. Do not re-ask a locked pick.

Locked picks (user said "all agree" to rounds 1 and 2, 2026-10-23):

- The Excel file is the main data store on one Mac. Sharing may change this. See Open point.
- A local Node (JavaScript) server runs. The page is plain HTML, CSS and JavaScript.
- The server calls the local `claude -p` CLI to read a pasted listing link. No Anthropic API key.
- Map: OpenStreetMap with Leaflet. No Google Maps key.
- Claude finds each pin spot. The user can drag a pin to fix it.
- Hand-added photos and downloaded listing photos go in `photos/` next to the Excel.
- Tickets are markdown files in `.scratch/rental-map/issues/`.

Open point: the user asked to share the app with other people. That flips the store, the photos folder, and the "runs on my Mac" picks. The candidate is a Google Sheet store with a Google Apps Script web app as the backend (ticket `10-apps-script-backend.md`). The browser-to-script CORS path needs a live test before the build. The user has not confirmed the store change. Ask again before you change the map.

Bookmarklet research (ticket `11-bookmarklet.md`, closed): on 99acres, the listing data sits in `window.__initialData__.pd.pageData.propertyDetails.prop_data`. Rent is `.Price`, area is `.Superbuiltup_Area`, lat and long are `.Latitude` and `.Longitude`. The 13 photo links sit under `pd.pageData.galleryDetails.pdGalleryData.property.images[i].variants.O`. Check that `.Prop_Id` matches the URL first, because the page can change without a reload. The description text can disagree with the structured fields (sample: description says 41,499, field says 38,999). Take rent from the field. Whether a bookmarklet runs under the page's CSP and can copy to the clipboard is not proven yet. Ticket `12-bookmarklet-live-test.md` covers that test in Chrome and Safari.

Claude web test (ticket `09-test-claude-web.md`): claude.ai read a 99acres link alone and listed 13 photo URLs. Its reply was prose, so the real prompt must ask for JSON. It said carpet area was "not listed" instead of guessing.

Sample sheet (ticket `02-sample-excel.md`): `Apartment Hunt.xlsx` has a tracker with headers in row 2 and data in rows 3 to 62. A Status column drives the shortlist sheet.

Geocoding rules: see the `openstreetmap-nominatim-geocoding` skill.
