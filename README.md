# Rental map

A small group hunting for one rental home puts every listing on one map. The data lives in one Google Sheet. An Apps Script attached to the sheet does every read and write. The build spec is `SPEC.md`.

## Start the app

```
node server.js
```

The server serves the page on `http://localhost:8790` and opens it in Chrome. Use `node server.js --no-open` to skip Chrome. Use `PORT=8800 node server.js` for another port.

On first run, the page asks for your name. It keeps the name in this Chrome on this computer.

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

To turn the geocoder off, set `"geocoding": false` in `config.json` and start the app again. The app then cannot find a map spot for a new place.

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

## Our take

Open a listing and pick the Our take tab. A click on a Status or a rating saves it at once. A click on the picked rating clears it. Pros and cons have a box to add one and a "×" to remove one.

If someone changed the same cell first, the sheet keeps their value. The tab shows it, with a message like "Someone changed Status to Visited. Your change was not saved."

After you paste a new `Code.gs`, edit the deployment and pick a new version, or the `getListing`, `saveCells` and `editList` calls fail with "unknown action".

## Test with a few rows

Open `apps-script/test-rows.tsv`, copy all 3 lines, click cell A2 of the Tracker tab, and paste. Each row has Lat and Long, so each one gets a pin. Reload the page.

## Checks

```
npm test
npm run check
```

`npm test` runs the tests in `tests/`. They need Node 18.12 or newer and no packages. `npm run check` checks the syntax of the server and the page scripts.
