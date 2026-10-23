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
var SETTINGS_ROWS = [["Budget (₹/month)", ""]];

// Run this once from the Apps Script editor. It adds any missing tab and writes its headers.
// A tab that already has rows is left alone.
function setup() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  makeTab(spreadsheet, "Tracker", [TRACKER_COLUMNS]);
  makeTab(spreadsheet, "Places", [PLACES_COLUMNS]);
  makeTab(spreadsheet, "Settings", [SETTINGS_COLUMNS].concat(SETTINGS_ROWS));
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
