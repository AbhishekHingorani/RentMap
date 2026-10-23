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

## Test with a few rows

Open `apps-script/test-rows.tsv`, copy all 3 lines, click cell A2 of the Tracker tab, and paste. Each row has Lat and Long, so each one gets a pin. Reload the page.

## Checks

```
npm test
npm run check
```

`npm test` runs the tests in `tests/`. They need Node 18.12 or newer and no packages. `npm run check` checks the syntax of the server and the page scripts.
