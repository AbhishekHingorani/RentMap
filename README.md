# Rental map

A small group hunting for one rental home puts every listing on one map. The data lives in one Google Sheet. An Apps Script attached to the sheet does every read and write. The build spec is `SPEC.md`.

## Start the app

```
node server.js
```

The server serves the page on `http://localhost:8790` and opens it in Chrome. Use `node server.js --no-open` to skip Chrome. Use `PORT=8800 node server.js` for another port.

On first run, the page asks for your name. It keeps the name in this Chrome on this computer.

## Give the map to someone without Git or Node (Mac)

`setup-mac.sh` downloads its own copy of Node and the newest code into `~/RentalMap`, then starts the map. Send the person these steps and, in a private chat, the `/exec` URL.

1. Press Cmd+Space, type `Terminal`, and press Return.
2. Paste this line and press Return:

   ```
   curl -fsSL https://raw.githubusercontent.com/AbhishekHingorani/RentMap/master/setup-mac.sh | bash
   ```

3. When it asks for the link, paste the `/exec` URL and press Return.

The map opens in the browser. Keep the Terminal window open while you use it. Next time, double-click "Rental Map" on the Desktop. Each start gets the newest code from GitHub. To change the link, delete `~/RentalMap/config.json` and start again.

## Set up the sheet and the Apps Script

Do these steps once, from the Google account that owns the sheet.

1. Make a new Google Sheet.
2. In the sheet, open Extensions > Apps Script.
3. Paste `apps-script/Code.gs` into `Code.gs`. In Project Settings, tick "Show appsscript.json", then paste `apps-script/appsscript.json` into it.
4. Pick `setup` in the function list and click Run. Allow the access Google asks for. `setup` adds the Tracker, Places and Settings tabs with their headers in row 1. It leaves a tab that already has rows alone.
5. Click Deploy > New deployment > Web app. Set "Execute as" to Me. Set "Who has access" to Anyone. Do not pick "Anyone with Google account". That one returns a sign-in page, not JSON.
6. Copy the `/exec` URL. Copy `config.example.json` to `config.json` and paste the URL into `appsScriptUrl`. `config.json` is not in git, because the URL is the only secret. Share it only with trusted people.

To change the script later, edit the existing deployment and pick a new version. A new deployment gets a new URL.

After you paste a new `Code.gs`, run `setup` again. It adds any Settings row the sheet lacks, like City, and keeps the rows that are there.

## Places and the geocoder

The Places tab in the left column lists places like an office. Its form takes a name and an address. The local web server finds the map spot through Nominatim and Photon, at most 1 request a second. The page then writes the place to the Places tab of the sheet. Each card shows the straight-line distance to each place.

The geocoder looks inside the city in the City row of the Settings tab. `setup` writes Bangalore there. Change the cell for another city.

To put the pin on an exact spot, fill the optional Coordinates box, like `23.0300, 72.5100`. Right-click the spot in Google Maps to copy them. The app then skips the geocoder and saves Pin precision as building.

Click "Edit" under a place to change its name, address or coordinates. To fix a wrong pin, click "Drag the pin" in that form, drag the ★ on the map, then click Save. A new address gets a new map spot. If someone changed the same place first, nothing is saved, and the list shows the sheet as it is now.

After you paste a new `Code.gs`, edit the deployment and pick a new version, or the `editPlace` call fails with "unknown action".

To turn the geocoder off, set `"geocoding": false` in `config.json` and start the app again. A new place then needs coordinates.

## Add a listing by link

Click "+ Add listing" above the left column. Paste the listing link. The app shows a prompt with the link in it. Copy the prompt into a new chat on Claude web, then paste Claude's whole reply back. The app reads the ```json block and fills a review form. A value it fixed, like "2 BHK" to 2BHK, is yellow. Check the form and click Save. Nothing goes into the sheet before Save.

If the reply has no Lat and Long, the app finds the map spot from the society and the locality. If Save fails, click Save again. The browser made the Listing id, so the sheet does not get a second row.

After you paste a new `Code.gs`, edit the deployment and pick a new version, or the `addListing` call fails with "unknown action".

### When Claude web cannot read the page

If the reply says `could_not_read`, or has no rent and no locality, the app opens the bookmarklet step. The small "Reply looks wrong?" link opens it too.

1. Drag the "Rental map: read page" button from that step to the bookmarks bar in Chrome. Do this once. Press Cmd+Shift+B if the bar is hidden.
2. Open the listing page and click the bookmark. It copies a prompt with the page data. If it cannot copy, it shows the prompt in a box with a Copy button.
3. Paste the prompt into a new chat on Claude web, and paste Claude's reply back into the app.

With Claude Code on your computer, paste the prompt into the "Ask my local Claude" box instead. The local web server runs `claude -p` with Haiku and a $0.10 cap. One run on the saved 99acres sample cost $0.0025 and took 11 seconds.

A link that is already on the map stops the add at step 1, with an "Open it" button. For 99acres, two links with the same `spid-` part count as the same listing. At Save, a saved listing with the same society and Configuration gets a warning. Click "Save anyway" to add it all the same.

## Find a listing on the map

Point at a listing in the list, or a place on the Places tab, and its pin on the map grows and comes to the front. The map does not move.

## Key facts at the top

The top of a listing's details shows furnishing, floor, balconies and the distance to each place. The sheet has no Balcony column, so the app reads the count from Other details, like "Balcony: 1" or "2 balconies". One or more balconies is green, none is red.

Each distance is green for the listing nearest to that place and red for the farthest, with shades between. The colours compare all listings on the sheet, so they change as listings are added. The cards in the list use the same colours.

## Our take

Open a listing and pick the Our take tab. A click on a rating saves it at once. Shortlisted and the two 0 to 10 ratings sit above the tabs. A click on the picked rating clears it. Pros and cons have a box to add one and a "×" to remove one.

If someone changed the same cell first, the sheet keeps their value. The tab shows it, with a message like "Someone changed Status to Visited. Your change was not saved."

After you paste a new `Code.gs`, edit the deployment and pick a new version, or the `getListing`, `saveCells` and `editList` calls fail with "unknown action".

## Edit a listing and move its pin

Open a listing and pick the "All 43 fields" tab. Click "Edit" to change a value Claude filled in, like a wrong rent. Click Save. The app sends only the cells you changed.

If someone changed the same cell first, nothing is saved. That cell shows "In the sheet now: <value>". Click "Use sheet value" or "Keep mine", then Save again.

Click "Move pin" and drag the pin on the map to the right spot. The app saves it when you drop it. Or type the spot in the Coordinates box, like `23.0300, 72.5100`, and click "Save coordinates".

## Photos

Open a listing. On the Overview tab, click "Upload photos" and pick one photo or more. The page shrinks each photo to 1600 px on the long side and sends it to the Apps Script. The script saves it in the shared Drive folder. The "×" on a photo removes it from the listing. The file stays in Drive.

Click a photo to see it large. Use the arrows or the ← and → keys to move through the listing's photos, or click a small photo in the strip at the bottom. Press Esc to close.

After you paste the new `Code.gs`, run `setup` again. It makes the "Rental map photos" folder in your Drive and writes its link in the Photos folder row of the Settings tab. Allow the Drive access Google asks for. Then edit the deployment and pick a new version, or the `uploadPhoto` call fails with "unknown action". To use a folder you already have, paste its link in that row.

## Test with a few rows

Open `apps-script/test-rows.tsv`, copy all 3 lines, click cell A2 of the Tracker tab, and paste. Each row has Lat and Long, so each one gets a pin. Reload the page.

## Checks

```
npm test
npm run check
```

`npm test` runs the tests in `tests/`. They need Node 18.12 or newer and no packages. `npm run check` checks the syntax of the server and the page scripts.
