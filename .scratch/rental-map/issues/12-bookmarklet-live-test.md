# Test the bookmarklet live in Chrome and Safari

Type: task
Status: resolved
Blocked by: none

## Question

Run a small test bookmarklet on a live 99acres listing and a live housing.com listing, in Chrome and in Safari. Record for each site and browser:
- Does the bookmarklet run at all (CSP)?
- Can it read `window.__initialData__` on 99acres? What does housing.com hold instead?
- Does `navigator.clipboard.writeText` work from the bookmark click? If not, does the select-and-Cmd+C text box work?
- After opening the listing from a search page (no reload), does `__initialData__` still match the listing in the URL?

Also save one housing.com listing page into `samples/`. Background: [Check what a bookmarklet can read from a listing page](11-bookmarklet.md).

Test asset: [assets/bookmarklet-test.html](../assets/bookmarklet-test.html). It makes a "Rental test" bookmark. The bookmark shows a JSON report on the page.

## Results so far

Chrome 153, macOS, 2026-10-23. 99acres listing M93900012, opened straight from its link:
- The bookmarklet ran. Page CSP did not block it.
- `window.__initialData__` is there. `Prop_Id` matches the `spid-` in the URL. Rent, BHK, lat/long, society and 13 photo links all read fine.
- `navigator.clipboard.writeText` worked from the bookmark click itself, and from the Copy button.
- No `__NEXT_DATA__`. Same 4 ld+json blocks as the saved sample.
- `document.body.innerText` is 3,409 characters, much less than the 11,112 measured on the saved file.

Still to do: 99acres opened from a search page (no reload), housing.com, and all Safari checks.

## Resolution

Closed on 2026-10-23 with only part of the test done. The user chose to close it and note the gaps on the map.

Facts from the one run (Chrome 153, 99acres, listing opened from its own link):
- The bookmarklet runs. 99acres's CSP does not block it in Chrome.
- `window.__initialData__` holds the listing that the URL names. Rent, BHK, lat/long, society and 13 full-size photo links read fine.
- `navigator.clipboard.writeText` works straight from the bookmark click in Chrome. A Copy button is not needed there.
- The page text (`innerText`) is 3,409 characters, about 850 tokens.

Not tested, now in the map's Not yet specified:
- Safari: does the bookmarklet run, and does the clipboard work.
- housing.com: what the page holds. No sample is saved yet.
- 99acres opened from a search page with no reload: does `__initialData__` still match the URL.

Pick for [Decide the add-by-link flow](07-add-by-link-flow.md): keep the Copy button and select-text fallback, since Safari is untested. Check `Prop_Id` against the URL, since the no-reload case is untested.
