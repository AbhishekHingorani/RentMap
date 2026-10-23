// The rental map backend. It is bound to the Google Sheet and deployed as a web app.
// The page sends POST with Content-Type text/plain and a JSON body, like { "action": "load" }.
// Do not name a request field "c" or "sid". They can cause HTTP 405.

// Row 1 headers, from "The sheet" in SPEC.md. public/lib/columns.mjs has the same lists.
var TRACKER_COLUMNS = [
  "Listing id",
  "Society / building name",
  "Locality",
  "Configuration",
  "Status",
  "Listed by",
  "Broker name",
  "Broker phone",
  "Owner name",
  "Owner phone",
  "Rent (₹/month)",
  "Maintenance (₹/month)",
  "Total monthly cost",
  "Deposit",
  "Brokerage fee",
  "Carpet area (sq ft)",
  "Super built-up area (sq ft)",
  "Bathrooms",
  "Floor / total floors",
  "Furnishing",
  "Parking",
  "Lift",
  "Available from",
  "Other details",
  "Safety",
  "Water supply",
  "Location",
  "Condition",
  "Natural light",
  "Overall rating",
  "Pros",
  "Cons",
  "Notes",
  "Photos",
  "Listing link",
  "Lat",
  "Long",
  "Pin precision",
  "Date added",
  "Added by",
];
var PLACES_COLUMNS = ["Name", "Address", "Lat", "Long", "Pin precision", "Added by"];
var SETTINGS_COLUMNS = ["Setting", "Value"];
// City is the start value from "Assumptions" in SPEC.md. The geocoder reads the city from this row.
var SETTINGS_ROWS = [
  ["Budget (₹/month)", ""],
  ["City", "Bangalore"],
];
var PIN_PRECISIONS = ["building", "society", "locality"];
var RATING_COLUMNS = ["Safety", "Water supply", "Location", "Condition", "Natural light"];
// The script works these out from the other cells. The page never writes them.
var WORKED_OUT_COLUMNS = ["Total monthly cost", "Overall rating"];
var LOCK_WAIT_MS = 20000;

// Run this once from the Apps Script editor. It adds any missing tab and writes its headers.
// A tab that already has rows is left alone, except that Settings gets any setting row it lacks.
// So run setup again after a new setting is added here.
function setup() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  makeTab(spreadsheet, "Tracker", [TRACKER_COLUMNS]);
  makeTab(spreadsheet, "Places", [PLACES_COLUMNS]);
  makeTab(spreadsheet, "Settings", [SETTINGS_COLUMNS].concat(SETTINGS_ROWS));
  addMissingSettings(spreadsheet.getSheetByName("Settings"));
}

// A row whose Setting cell already holds the name is kept, whatever its value.
function addMissingSettings(sheet) {
  var have = {};
  var values = sheet.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) have[String(values[r][0]).trim()] = true;
  var missing = SETTINGS_ROWS.filter(function (row) {
    return !have[row[0]];
  });
  if (missing.length) sheet.getRange(sheet.getLastRow() + 1, 1, missing.length, 2).setValues(missing);
}

function makeTab(spreadsheet, name, rows) {
  var sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() > 0) return;
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sheet.setFrozenRows(1);
}

function doPost(e) {
  var reply;
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === "load") {
      reply = load();
    } else if (body.action === "addPlace") {
      reply = addPlace(body.place, body.addedBy);
    } else if (body.action === "addListing") {
      reply = addListing(body.listing);
    } else {
      reply = { ok: false, error: "unknown action: " + body.action };
    }
  } catch (err) {
    reply = { ok: false, error: String(err.message || err) };
  }
  return json(reply);
}

// Open the /exec URL in a browser tab to see that the deploy is live.
function doGet() {
  return json({ ok: true, method: "GET" });
}

// All 3 tabs in one call. Each call takes a second or more, so the page loads everything at once.
function load() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return {
    ok: true,
    tracker: readTab(spreadsheet, "Tracker"),
    places: readTab(spreadsheet, "Places"),
    settings: readTab(spreadsheet, "Settings"),
  };
}

// Every sheet write runs inside the script lock, as "The Apps Script > Writes" in SPEC.md says.
// A lock that does not come in time returns "busy", and the page may try again.
function withLock(write) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(LOCK_WAIT_MS);
  } catch (err) {
    return { ok: false, error: "busy" };
  }
  try {
    var reply = write();
    SpreadsheetApp.flush();
    return reply;
  } finally {
    lock.releaseLock();
  }
}

// place: { name, address, lat, long, precision }. The local web server found lat, long and precision.
// A place with the same name and address is not added twice, so a retried call is safe.
function addPlace(place, addedBy) {
  place = place || {};
  var name = String(place.name || "").trim();
  var address = String(place.address || "").trim();
  var lat = place.lat;
  var long = place.long;
  if (!name || !address) return { ok: false, error: "A place needs a name and an address." };
  if (typeof lat !== "number" || typeof long !== "number" || !isFinite(lat) || !isFinite(long)) {
    return { ok: false, error: "A place needs a map spot." };
  }
  if (PIN_PRECISIONS.indexOf(place.precision) === -1) return { ok: false, error: "Unknown Pin precision: " + place.precision };

  var values = {
    Name: name,
    Address: address,
    Lat: lat,
    Long: long,
    "Pin precision": place.precision,
    "Added by": String(addedBy || "").trim(),
  };
  return withLock(function () {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var saved = readTab(spreadsheet, "Places");
    for (var i = 0; i < saved.length; i++) {
      if (sameText(saved[i].Name, name) && sameText(saved[i].Address, address)) return { ok: true, place: saved[i] };
    }
    var sheet = spreadsheet.getSheetByName("Places");
    // Write by the row 1 headers, so a moved column still gets the right value.
    var headers = sheet.getDataRange().getValues()[0];
    var row = headers.map(function (header) {
      return Object.prototype.hasOwnProperty.call(values, header) ? values[header] : "";
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    return { ok: true, place: values };
  });
}

// listing: the new Tracker row keyed by column. The page made the Listing id and filled Status,
// Listing link, Date added and Added by. A retried call with the same Listing id adds no second row.
// A listing whose link key is already in the sheet is refused, and the reply holds the saved row.
// The page checks this too, but two people can paste the same link at the same time.
function addListing(listing) {
  listing = listing || {};
  var id = String(listing["Listing id"] || "").trim();
  if (!id) return { ok: false, error: "A new listing needs a Listing id." };
  var key = linkKey(listing["Listing link"]);
  return withLock(function () {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var saved = readTab(spreadsheet, "Tracker");
    // The Listing id check comes first, so a retry of this same write is not called a second copy.
    for (var i = 0; i < saved.length; i++) {
      if (String(saved[i]["Listing id"]).trim() === id) return { ok: true, listing: saved[i] };
    }
    if (key !== null) {
      for (var j = 0; j < saved.length; j++) {
        if (linkKey(saved[j]["Listing link"]) === key) return { ok: false, error: "already_on_map", listing: saved[j] };
      }
    }
    var sheet = spreadsheet.getSheetByName("Tracker");
    var headers = sheet.getDataRange().getValues()[0];
    var row = headers.map(function (header) {
      if (header === "Listing id") return id;
      if (WORKED_OUT_COLUMNS.indexOf(header) !== -1) return "";
      return Object.prototype.hasOwnProperty.call(listing, header) ? listing[header] : "";
    });
    var rowNumber = sheet.getLastRow() + 1;
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    return { ok: true, listing: writeWorkedOut(sheet, rowNumber, headers) };
  });
}

// Run inside the lock after every write to a listing. It reads the row as it is in the sheet now,
// writes Total monthly cost and Overall rating, and returns the row keyed by header.
// Total monthly cost is rent plus maintenance, or rent alone when maintenance is empty.
// Overall rating is the average of the filled ratings only, and empty when none is filled.
function writeWorkedOut(sheet, rowNumber, headers) {
  var cells = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  var byHeader = {};
  headers.forEach(function (header, c) {
    if (header) byHeader[header] = cells[c] === undefined ? "" : cells[c];
  });

  var rent = toNumber(byHeader["Rent (₹/month)"]);
  var maintenance = toNumber(byHeader["Maintenance (₹/month)"]);
  var total = rent === null ? "" : rent + (maintenance === null ? 0 : maintenance);

  var ratings = RATING_COLUMNS.map(function (column) {
    return toNumber(byHeader[column]);
  }).filter(function (n) {
    return n !== null;
  });
  var sum = ratings.reduce(function (a, b) {
    return a + b;
  }, 0);
  var overall = ratings.length ? Math.round((sum / ratings.length) * 100) / 100 : "";

  var worked = { "Total monthly cost": total, "Overall rating": overall };
  WORKED_OUT_COLUMNS.forEach(function (column) {
    var c = headers.indexOf(column);
    if (c !== -1) sheet.getRange(rowNumber, c + 1, 1, 1).setValues([[worked[column]]]);
    byHeader[column] = worked[column];
  });
  return byHeader;
}

// A hand-typed cell can hold "38,999" or "₹38,999" as text. An empty cell is null.
// Apps Script cannot import, so this copies toNumber in public/lib/listings.mjs. Keep the two the same.
function toNumber(value) {
  if (typeof value === "number") return isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  var cleaned = value.replace(/[₹,\s]/g, "");
  if (cleaned === "") return null;
  var n = Number(cleaned);
  return isFinite(n) ? n : null;
}

// The key of a Listing link, from "Same listing added twice" in SPEC.md. For 99acres it is the spid- part,
// like M93900012. For other sites it is the link without its ?... and #... tail. No link has no key.
// Apps Script cannot import, so this copies linkKey in public/lib/same-listing.mjs. Keep the two the same.
function linkKey(link) {
  var text = link === null || link === undefined ? "" : String(link).trim();
  if (!text) return null;
  var bare = text.split(/[?#]/)[0];
  var spid = /^https?:\/\/([^/]+\.)?99acres\.com\//i.test(bare) ? bare.match(/spid-([A-Za-z0-9]+)/) : null;
  return spid ? spid[1] : bare;
}

function sameText(a, b) {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

// Rows as objects keyed by the row 1 headers. Fully empty rows are skipped.
function readTab(spreadsheet, name) {
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error("missing tab: " + name + ". Run setup in the Apps Script editor.");
  var values = sheet.getDataRange().getValues();
  var headers = values[0] || [];
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = {};
    var filled = false;
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      var cell = values[r][c];
      if (cell === undefined) cell = "";
      if (cell !== "") filled = true;
      row[headers[c]] = cell;
    }
    if (filled) rows.push(row);
  }
  return rows;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
