# What a bookmarklet can read from a listing page

Ticket: issues/11-bookmarklet.md
Date: 2026-10-23
Sample: `samples/2 BHK _ Bedroom Apartment _ ... 4th floor (out of 4).html`, a 99acres page saved from Chrome.
Listing URL: https://www.99acres.com/2-bhk-bedroom-apartment-flat-for-rent-in-ahad-excellencia-chikkanayakanahalli-bangalore-south-1160-sqft-spid-M93900012

## Short answer

- The 99acres page holds the whole listing as one JS object, `window.__initialData__`. It has every field we want, the 13 full-size photo URLs, and the listing's lat/long.
- Lat/long: yes. `window.__initialData__.pd.pageData.propertyDetails.prop_data.Latitude` and `.Longitude`. The same pair is in the page's `application/ld+json` block under `geo`.
- CSP in Chrome: a bookmarklet runs with the page's CSP check turned off. This is in Chromium source.
- CSP in Safari: WebKit does check the page's CSP for `javascript:` URLs. The saved 99acres page uses inline scripts with no nonces, so any CSP it sends must allow inline script, which also lets bookmarklets run. I could not read the live headers (HTTP 403).
- Clipboard: Chrome gives the page a user activation when it runs a bookmarklet, so `navigator.clipboard.writeText` should work. In Safari the WebKit code path gives no activation, so it will likely fail. Safe design: show the text in a box on the page with a "Copy" button. That click is a real user gesture in every browser.
- Size: a trimmed JSON of the useful fields is about 3,000 characters. The visible page text is about 11,100 characters. The full `__initialData__` is about 122,000 characters, too big to paste whole.
- housing.com: no sample exists in `samples/`. Live fetches of housing.com return HTTP 406, so nothing was checked there.

## How I inspected the sample

I did not open the page in a browser or run its scripts. I read the HTML with `python3 -I` and grep only. I pulled out the text after `window.__initialData__=` with `json.JSONDecoder.raw_decode` and walked the keys.

## Where the data is on 99acres

### The main object: `window.__initialData__`

An inline `<script>` sets `window.__initialData__=` to a JSON object of 121,908 characters. This is the server-side render state for the page's Redux store. Top-level keys: `pd`, `RecomReducer`, `ellipsisData`, `global`, `header`, `reviewReducer`, and a few small ones. Almost all the useful data is under `pd.pageData` (95,394 characters compact).

The page's own bundles keep reading it after load. For example, `main-0Bundle...js` has `var W=(window.__initialData__||{global:{}}).global` and passes it to the store as its starting state. No bundle deletes it or sets it to null (I grepped for `delete window.__initialData__` and assignments to null or `void 0`). So a bookmarklet that runs after load can read it.

A flag `window.__masked__ = true` sits next to it. The bundle code behind it only decodes ID fields like `assigned_to` and `pid` with a digit map (`{p:"0",s:"1",r:"2",...}`). Listing fields are plain text.

### Listing fields

Base path: `window.__initialData__.pd.pageData.propertyDetails.prop_data` (193 keys, 18,322 characters).

| Field | Key under `prop_data` | Value in the sample |
|---|---|---|
| Listing ID | `Prop_Id` | `"M93900012"` |
| Rent per month | `Price` (also `Min_Price`, a number) | `"38999"` |
| Rent label | `valueLabelPdRevamp` | `"₹38,999"` |
| Deposit | `Deposit_Value`, `securityBrokerageLabel` | `"Rs1.17 Lac"`, `"₹1.17L deposit"` |
| Brokerage | `Brokerage`, `Brokerage_Type` | `"38999"`, `"FIXED_AMOUNT"` |
| BHK | `Bedroom_Num` | `"2"` |
| Bathrooms | `Bathroom_Num` | `"2"` |
| Balconies | `Balcony_Num` | `"2"` |
| Area | `Superbuiltup_Area` + `Superbuiltuparea_Unit` | `"1160.0"`, `"sqft"` |
| Carpet area | none | no carpet key exists for this listing |
| Floor | `Floor_Num`, `Total_Floor` | `"4"`, `"4"` |
| Furnishing | `Furnish_Label`, `furnishDetails` | `"Semifurnished"`, counts per item |
| Facing | `Facing_Label` | `"East"` |
| Parking | `Reserved_Parking_Label` | `"1 Covered, 1 Open"` |
| Available from | `Availability_Text`, `Availability_Info.Availability_Date` | `"Immediate"`, `"Aug 28, 2026"` |
| Society | `Building_Name` (also `Prop_Name`) | `"Ahad Excellencia"` |
| Locality | `Locality_Name`, `localityToBeDisplayed` | `"Chikkanayakanahalli"`, `"Chikkanayakanahalli, Near Sarjapur Road, Bangalore"` |
| City | `City_Text` | `"Bangalore South"` |
| Tenants allowed | `Rental_Attributes.availableFor` | `"FA,SM,SW"` |
| Posted by | `class_name_label`, `name_label` | `"Dealer"`, `"H M Somadatta \| Briq360"` |
| Last updated | `Modify_Date` | `"Oct 17, 2026"` |
| Description | `Description` | free text |
| Nearby places | `nearByPlacesOfInterest[]` | `{category, text, distance}` |

Other useful blocks under `window.__initialData__.pd.pageData`:

- `specification` (2,452 characters): facing, flooring, power backup, amenities.
- `societyDetails` (10,733 characters): project data, builder, configurations, facilities.
- `seoSchema` (507 characters): a short summary with rooms, floor size, floor, first photo, locality and lat/long.

Watch out: the `Description` text says "We are demanding 41,499" and a deposit of 124497. The structured `Price` is 38999 and the deposit label is 1.17 Lac. The free text is stale. Trust the structured fields over the description.

### Photo URLs

Path: `window.__initialData__.pd.pageData.galleryDetails.pdGalleryData.property.images[]`

- 13 entries in the sample. This matches `prop_data.Pic_Count = "13"`.
- Each entry has `name` (room, for example `"Hall"`), `link` (medium size), and `variants` with `T` (thumbnail), `M` (medium) and `O` (original, full size).
- Use `variants.O`. Example: `https://imagecdn.99acres.com/media1/41417/2/828342725O-1787988609938.jpg`.
- The 13 `O` URLs are the same 13 that Claude web listed in `samples/claude-web-reply.txt`.

Siblings of `property` in `pdGalleryData`:

- `society.images[]`: 25 photos of the whole project, not this flat. Skip them.
- `coverPhoto`: the first property photo again.
- `propertyVideos.videos[]`: one YouTube video, `videoLink` is an embed URL.

### Lat/long

There are two pairs. Use the listing pair.

| What | Path | Value |
|---|---|---|
| Listing (use this) | `window.__initialData__.pd.pageData.propertyDetails.prop_data.Latitude` / `.Longitude` | `"12.882808333333333"`, `"77.69001111111112"` (strings) |
| Same, short copy | `window.__initialData__.pd.pageData.seoSchema.latitude` / `.longitude` | same strings |
| Same, in ld+json | `<script type="application/ld+json">` with `"@type":"Apartment"`, at `.geo.latitude` / `.geo.longitude` | same strings |
| Society (project) | `window.__initialData__.pd.pageData.societyDetails.projectData.latitude` / `.longitude` | `12.882087`, `77.689578` (numbers) |

The two pairs are about 90 m apart. `prop_data.Map_Status` is `"MAPPED"`, which suggests the listing pin was placed on a map. The values are strings, so call `parseFloat` on them.

### application/ld+json

The page has 4 `<script type="application/ld+json">` blocks:

- `Apartment` (1,738 characters): description, name, rooms, bathrooms, floor, floor size, URL, first photo, address, and `geo`. It has no rent.
- `RentAction` (409 characters): `priceSpecification.price` `"38999"` and the agent name.
- `VideoObject` (641 characters): the YouTube video.
- `BreadcrumbList` (1,008 characters).

These are a good fallback if `__initialData__` ever disappears. They hold lat/long and rent, but only one photo.

### Other window objects

`window.dataLayer` (Google Tag Manager), `window.dataStore`, `window._tfa`, and `window.process` exist. None of them hold listing data. There is no `__NEXT_DATA__`. The page is not Next.js.

## Content Security Policy

### What the spec says

CSP Level 3, section 9.1 "Vendor-specific Extensions and Addons": "Policy enforced on a resource SHOULD NOT interfere with the operation of user-agent features like addons, extensions, or bookmarklets." Source: https://www.w3.org/TR/CSP3/#extensions

This is a SHOULD. Each browser decides.

### Chrome: bookmarklets skip the page CSP

Source: Chromium `third_party/blink/renderer/core/frame/local_frame.cc`, `LocalFrame::LoadJavaScriptURL` (read from the chromium/chromium GitHub mirror, main branch, 2026-10-23):

```
  NotifyUserActivation(
      mojom::blink::UserActivationNotificationType::kInteraction);
  auto* window = DomWindow();
  window->GetScriptController().ExecuteJavaScriptURL(
      url, network::mojom::CSPDisposition::DO_NOT_CHECK,
      &DOMWrapperWorld::MainWorld(window->GetIsolate()));
```

How it gets there: a browser-side `javascript:` URL (bookmark or omnibox) is a "renderer debug URL". `NavigationControllerImpl::HandleRendererDebugURL` sends it to the renderer. `LocalFrameMojoHandler::HandleRendererDebugURL` calls `frame_->LoadJavaScriptURL(url)`.

What this means:

- The bookmarklet code runs with `CSPDisposition::DO_NOT_CHECK`. Page CSP does not block it.
- It runs in the page's main world, so it can read `window.__initialData__`.
- Only the bookmarklet's own code skips CSP. Anything it then loads (a `<script src>`, a `fetch` to another site) still goes through the page's CSP. So keep the bookmarklet self-contained. Do not load a remote script.
- The only block is for pages whose scheme bans `javascript:` URLs, like `chrome://` pages. 99acres is plain https.

The Chromium security FAQ also treats bookmarklets as a normal feature: "Chromium allows users to create bookmarks to JavaScript URLs that will run on the currently-loaded page when the user clicks the bookmark" (`docs/security/faq.md`).

### Safari: the page CSP applies

Source: WebKit `Source/WebCore/bindings/js/ScriptController.cpp`, `ScriptController::executeJavaScriptURL` (WebKit/WebKit GitHub, main branch, 2026-10-23):

```
    if (!protect(ownerDocument->contentSecurityPolicy())->allowJavaScriptURLs(ownerDocument->url().string(), eventHandlerPosition().m_line, preNavigationCheckURLString, nullptr))
        return;
```

There is no bypass flag here. `allowJavaScriptURLs` follows the inline-script rule of `script-src`. So in Safari a bookmarklet fails on a page whose CSP has `script-src` without `'unsafe-inline'`. WebKit bug 156106 ("bookmarklet blocked by CSP", status NEW, https://bugs.webkit.org/show_bug.cgi?id=156106) is still open.

Caveat: Safari's own app code is closed source. I am assuming its bookmarks bar goes through this WebKit path. That fits the open WebKit bug, but I did not test it in Safari.

### Does 99acres send a CSP

I could not see the live headers. `curl` to the listing and to the 99acres home page got HTTP 403 from Akamai (`server: AkamaiGHost`), with both Chrome and Safari user agents. The saved page has no `<meta http-equiv="Content-Security-Policy">`. Its only `http-equiv` metas are `Content-Type` and `X-UA-Compatible`.

Evidence that any 99acres CSP must allow inline script:

- The page has at least 16 inline `<script>` blocks, including the one that sets `__initialData__`.
- None of them has a `nonce` attribute (grep found 0).
- The page has an inline handler, `onclick="reviewProperty(event)"`.

A CSP without `'unsafe-inline'` would break the site's own page. With `'unsafe-inline'`, WebKit's `allowJavaScriptURLs` passes. So the bookmarklet should run in Safari on 99acres too. This is an inference. A one-time manual test in Safari would confirm it.

## Clipboard

Rules per MDN, Clipboard API, "Security considerations" (https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API):

- Chromium: "Writing requires either the `clipboard-write` permission or transient activation."
- Firefox and Safari: "Writing requires transient activation."
- `clipboard-write` Permissions-Policy only matters for iframes. The bookmarklet runs in the top page.

Chrome: `LocalFrame::LoadJavaScriptURL` calls `NotifyUserActivation(kInteraction)` before it runs the bookmarklet (code above). So the page has transient activation and `navigator.clipboard.writeText` should work. Chrome also wants the document to have focus. Clicking the bookmarks bar does not usually take focus from the page, but I did not test this.

Safari: `ScriptController::executeJavaScriptURL` calls `executeScriptIgnoringException(...)` with the default `forceUserGesture = false` (`ScriptController.h`). The click on the bookmarks bar happens in Safari's UI, not in the page. So the page most likely has no transient activation, and `writeText` will most likely throw `NotAllowedError`. Not tested.

Design that works in both:

1. The bookmarklet builds the text.
2. It tries `navigator.clipboard.writeText(text)`.
3. If that throws, or always, it shows a small overlay on the page with the text in a `<textarea>` and a "Copy" button.
4. The button's click handler calls `writeText`. That click is a real gesture inside the page, so it works in Chrome and Safari. The user can also select the textarea text and press Cmd+C.

Inline styles on the overlay are fine. CSP `style-src` does not apply to styles set with `element.style` from script.

## Sizes, for the prompt

Measured on the saved sample, in characters (`len()` of a Python string).

| What | Characters |
|---|---|
| Whole saved HTML file | 507,286 bytes |
| `window.__initialData__` (compact JSON) | 121,908 |
| `pd.pageData` | 95,394 |
| `pd.pageData.galleryDetails` | 35,397 |
| `pd.pageData.propertyDetails` | 19,806 |
| `pd.pageData.propertyDetails.prop_data` | 18,322 |
| `pd.pageData.specification` | 2,452 |
| 13 photo `O` URLs as a JSON array | 976 |
| Trimmed pick of 29 listing fields + 13 photo URLs (list below) | 2,963 |
| `Apartment` ld+json block | 1,738 |
| Visible page text (body text minus script, style, svg) | 11,112 |

The page text figure is from the saved DOM with Python's `html.parser`, not from a browser's `innerText`. `innerText` drops hidden elements, so the real number is probably a bit lower. The text is about 430 lines and starts with about 80 lines of site menu. It has the rent but no photo URLs and no lat/long.

Fields in the 2,963-character pick: `Prop_Id`, `Price`, `Deposit_Value`, `securityBrokerageLabel`, `Brokerage`, `Bedroom_Num`, `Bathroom_Num`, `Balcony_Num`, `Superbuiltup_Area`, `Superbuiltuparea_Unit`, `Floor_Num`, `Total_Floor`, `Furnish_Label`, `furnishDetails`, `Facing_Label`, `Reserved_Parking_Label`, `Availability_Text`, `Building_Name`, `Locality_Name`, `localityToBeDisplayed`, `City_Text`, `Latitude`, `Longitude`, `Description`, `class_name_label`, `name_label`, `Modify_Date`, `Rental_Attributes`, `Pic_Count`, plus `photos`. The `Description` alone is about 1,000 of those characters.

Best payload: the trimmed pick (about 3,000 characters). Add the page text only if the prompt needs things the JSON lacks. Both together are about 14,000 characters, roughly 4,000 tokens.

## Sketch of the read step

Not tested. Shows the paths only.

```js
const d = window.__initialData__?.pd?.pageData;
const p = d?.propertyDetails?.prop_data;
const photos = (d?.galleryDetails?.pdGalleryData?.property?.images || [])
  .map(i => i.variants?.O || i.link);
const out = p ? {
  url: location.href, id: p.Prop_Id, rent: p.Price, deposit: p.Deposit_Value,
  bhk: p.Bedroom_Num, area: p.Superbuiltup_Area + ' ' + p.Superbuiltuparea_Unit,
  floor: p.Floor_Num + '/' + p.Total_Floor, furnishing: p.Furnish_Label,
  society: p.Building_Name, locality: p.localityToBeDisplayed,
  lat: parseFloat(p.Latitude), lng: parseFloat(p.Longitude),
  description: p.Description, photos
} : { url: location.href, text: document.body.innerText };
```

Two checks to add:

- Compare `p.Prop_Id` with the `spid-...` part of `location.href`. 99acres is a single-page app. If the user moved to another listing inside the app without a full reload, `__initialData__` may still describe the first listing. On mismatch, fall back to page text or ask for a reload.
- If `__initialData__` is missing (another site, or 99acres changes), fall back to the ld+json blocks, then to `document.body.innerText`.

## housing.com

No housing.com page is in `samples/`. `curl` to https://housing.com/ and a housing.com rent search page returned HTTP 406. So I could not check its embedded data or its CSP. To cover it, save one housing.com listing from Chrome ("Webpage, Complete") into `samples/` and repeat these checks.

## Sources

- CSP Level 3, section 9.1: https://www.w3.org/TR/CSP3/#extensions
- Chromium `LocalFrame::LoadJavaScriptURL`: https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/frame/local_frame.cc
- Chromium `LocalFrameMojoHandler::HandleRendererDebugURL`: https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/core/frame/local_frame_mojo_handler.cc
- Chromium `NavigationControllerImpl::HandleRendererDebugURL`: https://github.com/chromium/chromium/blob/main/content/browser/renderer_host/navigation_controller_impl.cc
- Chromium security FAQ, bookmarklets: https://github.com/chromium/chromium/blob/main/docs/security/faq.md
- WebKit `ScriptController::executeJavaScriptURL`: https://github.com/WebKit/WebKit/blob/main/Source/WebCore/bindings/js/ScriptController.cpp
- WebKit bug 156106: https://bugs.webkit.org/show_bug.cgi?id=156106
- Firefox bug 866522, "Bookmarklets affected by CSP" (still open; context only): https://bugzilla.mozilla.org/show_bug.cgi?id=866522
- MDN Clipboard API, security considerations: https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API
- The saved 99acres sample in `samples/`, read with `python3 -I` and grep.
