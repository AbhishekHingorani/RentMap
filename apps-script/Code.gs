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
  "Shortlisted",
  "Dimple's rating",
  "Abhishek's rating",
  "Reviewed",
];
var PLACES_COLUMNS = ["Name", "Address", "Lat", "Long", "Pin precision", "Added by"];
var SETTINGS_COLUMNS = ["Setting", "Value"];
// City is the start value from "Assumptions" in SPEC.md. The geocoder reads the city from this row.
// setup makes the Drive folder for uploaded photos and writes its link in the Photos folder row.
var SETTINGS_ROWS = [
  ["Budget (₹/month)", ""],
  ["City", "Bangalore"],
  ["Photos folder", ""],
];
var PHOTOS_FOLDER_SETTING = "Photos folder";
var PHOTOS_FOLDER_NAME = "Rental map photos";
var PIN_PRECISIONS = ["building", "society", "locality"];
var RATING_COLUMNS = ["Safety", "Water supply", "Location", "Condition", "Natural light"];
// The script works these out from the other cells. The page never writes them.
var WORKED_OUT_COLUMNS = ["Total monthly cost", "Overall rating"];
// public/lib/columns.mjs has the same list. tests/apps-script.test.mjs checks that they match.
var STATUSES = ["To call", "Visit scheduled", "Visited", "Rejected"];
// Tick boxes. The app writes true or false.
var SHORTLISTED_COLUMN = "Shortlisted";
// A new listing starts with Reviewed false.
var REVIEWED_COLUMN = "Reviewed";
var TICK_BOX_COLUMNS = [SHORTLISTED_COLUMN, REVIEWED_COLUMN];
// Each person's own rating, 0 to 10 in steps of 0.5. They do not count toward Overall rating.
// public/lib/columns.mjs has the same list, and public/lib/our-take.mjs has the same rule.
var PERSON_RATING_COLUMNS = ["Dimple's rating", "Abhishek's rating"];
// These cells hold items split by ";". A save changes them one item at a time, with editList, so they never clash.
var LIST_COLUMNS = ["Pros", "Cons", "Notes", "Photos"];
// editList takes these. Notes wait for the owner to decide how notes are split. See "Known gaps" in SPEC.md.
// public/lib/our-take.mjs has the same list.
var ITEM_COLUMNS = ["Pros", "Cons"];
// editList takes Photos too. An added photo must be the Drive link of an upload, from "Assumptions" in SPEC.md.
var PHOTO_COLUMN = "Photos";
var DRIVE_LINK = /^https:\/\/drive\.google\.com\/file\/d\/[A-Za-z0-9_-]{10,}\/view$/;
// A Drive file id. This copies FILE_ID in public/lib/photos.mjs. Keep the two the same.
var FILE_ID = /^[A-Za-z0-9_-]{10,}$/;
// The page sends a JPEG of about 1600 px on the long side, which is well under 1 MB.
var MAX_PHOTO_BYTES = 5 * 1024 * 1024;
// The app fills these once, when it adds the listing. A save never changes them.
var ADD_ONLY_COLUMNS = ["Listing link", "Date added", "Added by"];
// Move pin writes these. Each must be a number in its range.
var SPOT_RANGES = { Lat: 90, Long: 180 };
var LOCK_WAIT_MS = 20000;

// Run this once from the Apps Script editor. It adds any missing tab and writes its headers.
// A tab that already has rows is left alone, except that Settings gets any setting row it lacks,
// and Tracker gets any column it lacks, at the end of row 1.
// So run setup again after a new setting or column is added here.
function setup() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  makeTab(spreadsheet, "Tracker", [TRACKER_COLUMNS]);
  addMissingColumns(spreadsheet.getSheetByName("Tracker"));
  makeTab(spreadsheet, "Places", [PLACES_COLUMNS]);
  makeTab(spreadsheet, "Settings", [SETTINGS_COLUMNS].concat(SETTINGS_ROWS));
  addMissingSettings(spreadsheet.getSheetByName("Settings"));
  makePhotosFolder(spreadsheet.getSheetByName("Settings"));
}

// An empty Photos folder row gets a new Drive folder. A row that holds a link keeps it.
function makePhotosFolder(sheet) {
  var r = photosFolderRow(sheet.getDataRange().getValues());
  if (r === -1 || String(sheet.getRange(r + 1, 2, 1, 1).getValues()[0][0]).trim()) return;
  var folder = DriveApp.createFolder(PHOTOS_FOLDER_NAME);
  sheet.getRange(r + 1, 2, 1, 1).setValues([[folder.getUrl()]]);
}

// The index of the Photos folder row in the Settings values, or -1.
function photosFolderRow(values) {
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]).trim() === PHOTOS_FOLDER_SETTING) return r;
  }
  return -1;
}

// Shortlisted used to be a Status. When the Shortlisted column is new, each row whose Status says
// Shortlisted gets its box ticked. Its Status stays, and the app asks the person to pick a new one.
function addMissingColumns(sheet) {
  var values = sheet.getDataRange().getValues();
  var headers = values[0] || [];
  var missing = TRACKER_COLUMNS.filter(function (column) {
    return headers.indexOf(column) === -1;
  });
  if (!missing.length) return;
  var first = headers.length + 1;
  sheet.getRange(1, first, 1, missing.length).setValues([missing]);
  var at = missing.indexOf(SHORTLISTED_COLUMN);
  var status = headers.indexOf("Status");
  if (at === -1 || status === -1) return;
  for (var r = 1; r < values.length; r++) {
    if (sameText(values[r][status], "Shortlisted")) sheet.getRange(r + 1, first + at, 1, 1).setValues([[true]]);
  }
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
    } else if (body.action === "editPlace") {
      reply = editPlace(body.old, body.place);
    } else if (body.action === "addListing") {
      reply = addListing(body.listing);
    } else if (body.action === "getListing") {
      reply = getListing(body.id);
    } else if (body.action === "saveCells") {
      reply = saveCells(body.id, body.cells);
    } else if (body.action === "editList") {
      reply = editList(body.id, body.column, body.add, body.remove);
    } else if (body.action === "uploadPhoto") {
      reply = uploadPhoto(body.id, body.data);
    } else if (body.action === "getPhoto") {
      reply = getPhoto(body.fileId);
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
  var problem = placeProblem(place);
  if (problem) return { ok: false, error: problem };
  var values = placeCells(place);
  var name = values.Name;
  var address = values.Address;
  values["Added by"] = String(addedBy || "").trim();
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

// Why a place from the page cannot be written, or "" when it can.
function placeProblem(place) {
  place = place || {};
  if (!String(place.name || "").trim() || !String(place.address || "").trim()) return "A place needs a name and an address.";
  var lat = place.lat;
  var long = place.long;
  if (typeof lat !== "number" || typeof long !== "number" || !isFinite(lat) || !isFinite(long)) return "A place needs a map spot.";
  if (PIN_PRECISIONS.indexOf(place.precision) === -1) return "Unknown Pin precision: " + place.precision;
  return "";
}

// The Places cells the page may write. Added by is not here, because an edit keeps it.
function placeCells(place) {
  return {
    Name: String(place.name).trim(),
    Address: String(place.address).trim(),
    Lat: place.lat,
    Long: place.long,
    "Pin precision": place.precision,
  };
}

// Changes one place. Places have no id, so old holds the name, address, lat and long the person saw.
// Inside the lock, the row must still hold those 4 values. If no row does, someone changed or removed
// the place first: nothing is written and the reply holds the Places tab as it is now.
function editPlace(old, place) {
  old = old || {};
  var problem = placeProblem(place);
  if (problem) return { ok: false, error: problem };
  var values = placeCells(place);
  return withLock(function () {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName("Places");
    if (!sheet) throw new Error("missing tab: Places. Run setup in the Apps Script editor.");
    var cells = sheet.getDataRange().getValues();
    var headers = cells[0] || [];
    var at = function (r, header) {
      var c = headers.indexOf(header);
      return c === -1 ? "" : cells[r][c];
    };
    var rowIndex = -1;
    for (var r = 1; r < cells.length; r++) {
      var same =
        sameText(at(r, "Name"), old.name) &&
        sameText(at(r, "Address"), old.address) &&
        sameCell(old.lat, at(r, "Lat")) &&
        sameCell(old.long, at(r, "Long"));
      if (same) {
        rowIndex = r;
        break;
      }
    }
    if (rowIndex === -1) return { ok: false, error: "place_gone", places: readTab(spreadsheet, "Places") };
    for (var j = 1; j < cells.length; j++) {
      if (j !== rowIndex && sameText(at(j, "Name"), values.Name) && sameText(at(j, "Address"), values.Address)) {
        return { ok: false, error: "Another place has this name and address." };
      }
    }
    var row = headers.map(function (header, c) {
      return Object.prototype.hasOwnProperty.call(values, header) ? values[header] : cells[rowIndex][c];
    });
    sheet.getRange(rowIndex + 1, 1, 1, row.length).setValues([row]);
    var saved = {};
    headers.forEach(function (header, c) {
      if (header) saved[header] = row[c];
    });
    return { ok: true, place: saved };
  });
}

// listing: the new Tracker row keyed by column. The page made the Listing id and filled Status,
// Listing link, Date added, Added by and Reviewed. A row with no Reviewed gets false. A retried call with the same Listing id adds no second row.
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
      if (Object.prototype.hasOwnProperty.call(listing, header)) return listing[header];
      return header === REVIEWED_COLUMN ? false : "";
    });
    var rowNumber = sheet.getLastRow() + 1;
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    return { ok: true, listing: writeWorkedOut(sheet, rowNumber, headers) };
  });
}

// The page reads the listing's row again when a person opens its details. A read needs no lock.
function getListing(id) {
  var found = findListingRow(SpreadsheetApp.getActiveSpreadsheet(), id);
  return found ? { ok: true, listing: found.listing } : { ok: false, error: "row_gone" };
}

// The clash check, from "Two people edit one listing" in SPEC.md. cells: [{ column, old, new }], where old is
// the value the person saw. Inside the lock, each old value is compared with the cell in the sheet now.
// If any differs, nothing is written and the reply holds the sheet values and the clashing columns.
function saveCells(id, cells) {
  if (!Array.isArray(cells) || !cells.length) return { ok: false, error: "A save needs at least one cell." };
  var seen = {};
  for (var i = 0; i < cells.length; i++) {
    var problem = cellProblem(cells[i]);
    if (problem) return { ok: false, error: problem };
    if (seen[cells[i].column]) return { ok: false, error: "A save sends each column once: " + cells[i].column };
    seen[cells[i].column] = true;
  }
  return withLock(function () {
    var found = findListingRow(SpreadsheetApp.getActiveSpreadsheet(), id);
    if (!found) return { ok: false, error: "row_gone" };
    var unknown = cells.filter(function (cell) {
      return found.headers.indexOf(cell.column) === -1;
    });
    if (unknown.length) return { ok: false, error: "Unknown column: " + unknown[0].column };
    var clashes = cells
      .filter(function (cell) {
        return !sameCell(cell.old, found.listing[cell.column]);
      })
      .map(function (cell) {
        return cell.column;
      });
    if (clashes.length) return { ok: false, error: "clash", clashes: clashes, listing: found.listing };
    cells.forEach(function (cell) {
      found.sheet.getRange(found.rowNumber, found.headers.indexOf(cell.column) + 1, 1, 1).setValues([[cellValue(cell)]]);
    });
    return { ok: true, listing: writeWorkedOut(found.sheet, found.rowNumber, found.headers) };
  });
}

// Why one cell of a saveCells call cannot be written, or "" when it can.
function cellProblem(cell) {
  var column = cell && typeof cell.column === "string" ? cell.column : "";
  if (!column) return "Each cell needs a column.";
  if (TRACKER_COLUMNS.indexOf(column) === -1) return "Unknown column: " + column;
  if (column === "Listing id" || WORKED_OUT_COLUMNS.indexOf(column) !== -1) return "The app cannot write " + column + ".";
  if (ADD_ONLY_COLUMNS.indexOf(column) !== -1) return "The app cannot write " + column + ".";
  if (LIST_COLUMNS.indexOf(column) !== -1) return column + " changes one item at a time.";
  if (SPOT_RANGES[column]) {
    var range = SPOT_RANGES[column];
    if (typeof cell.new !== "number" || !isFinite(cell.new) || Math.abs(cell.new) > range) {
      return column + " must be a number from -" + range + " to " + range + ".";
    }
  }
  if (column === "Pin precision" && PIN_PRECISIONS.indexOf(cell.new) === -1) return "Unknown Pin precision: " + cell.new;
  if (column === "Status" && STATUSES.indexOf(cell.new) === -1) return "Unknown Status: " + cell.new;
  if (RATING_COLUMNS.indexOf(column) !== -1 && cell.new !== "" && ratingOf(cell.new) === null) {
    return column + " must be a whole number from 1 to 5, or empty.";
  }
  if (PERSON_RATING_COLUMNS.indexOf(column) !== -1 && cell.new !== "" && personRatingOf(cell.new) === null) {
    return column + " must be a number from 0 to 10 in steps of 0.5, or empty.";
  }
  if (TICK_BOX_COLUMNS.indexOf(column) !== -1 && typeof cell.new !== "boolean") return column + " must be true or false.";
  return "";
}

// A rating goes into the sheet as a number, so Overall rating can read it.
function cellValue(cell) {
  if (RATING_COLUMNS.indexOf(cell.column) !== -1) return cell.new === "" ? "" : ratingOf(cell.new);
  if (PERSON_RATING_COLUMNS.indexOf(cell.column) !== -1) return cell.new === "" ? "" : personRatingOf(cell.new);
  return cell.new === null || cell.new === undefined ? "" : cell.new;
}

function personRatingOf(value) {
  var n = toNumber(value);
  return n !== null && n >= 0 && n <= 10 && n * 2 === Math.floor(n * 2) ? n : null;
}

function ratingOf(value) {
  var n = toNumber(value);
  return n !== null && n === Math.floor(n) && n >= 1 && n <= 5 ? n : null;
}

// The page saw the cell as JSON from load. A date cell went out as an ISO string, and a number as a number.
function sameCell(seen, now) {
  return cellText(seen) === cellText(now);
}

function cellText(value) {
  if (value === null || value === undefined) return "";
  // The fake sheet in the tests makes dates in another realm, so instanceof Date would miss them.
  if (Object.prototype.toString.call(value) === "[object Date]") return value.toISOString();
  return String(value).trim();
}

// "Add one item" or "remove one item" for a list cell. The script changes the cell as it is in the sheet now,
// so these saves never clash. Removing an item that is already gone counts as done.
function editList(id, column, add, remove) {
  if (ITEM_COLUMNS.indexOf(column) === -1 && column !== PHOTO_COLUMN) return { ok: false, error: String(column) + " is not a list cell." };
  var adding = typeof add === "string" && add.trim() !== "";
  var removing = typeof remove === "string" && remove.trim() !== "";
  if (adding === removing) return { ok: false, error: "Send one item to add or to remove." };
  var item = adding ? add : remove;
  if (item.indexOf(";") !== -1) return { ok: false, error: 'An item cannot hold a ";".' };
  // A "×" may remove any photo link, like a site link. An add is always an upload.
  if (adding && column === PHOTO_COLUMN && !DRIVE_LINK.test(item.trim())) {
    return { ok: false, error: "A new photo must be a Drive link like https://drive.google.com/file/d/<ID>/view." };
  }
  return withLock(function () {
    var found = findListingRow(SpreadsheetApp.getActiveSpreadsheet(), id);
    if (!found) return { ok: false, error: "row_gone" };
    var c = found.headers.indexOf(column);
    if (c === -1) return { ok: false, error: "Unknown column: " + column };
    var cell = found.listing[column];
    var next = adding ? addItem(cell, item) : removeItem(cell, item);
    if (next !== cellText(cell)) found.sheet.getRange(found.rowNumber, c + 1, 1, 1).setValues([[next]]);
    return { ok: true, listing: writeWorkedOut(found.sheet, found.rowNumber, found.headers) };
  });
}

// One photo, as base64 JPEG in data, from "Photos uploaded by hand" in SPEC.md. It saves the photo to the
// Photos folder and shares it as "anyone with the link can view". This writes no sheet cell, so it runs
// outside the lock. The page then adds the Drive link to the Photos cell with editList.
function uploadPhoto(id, data) {
  if (typeof data !== "string" || !data) return { ok: false, error: "Send the photo as base64 in data." };
  var bytes;
  try {
    bytes = Utilities.base64Decode(data);
  } catch (err) {
    return { ok: false, error: "The photo is not base64." };
  }
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, error: "The photo is bigger than 5 MB." };
  // Apps Script bytes are signed, so 0xFF reads as -1. Every JPEG starts with FF D8.
  if (bytes.length < 2 || (bytes[0] & 0xff) !== 0xff || (bytes[1] & 0xff) !== 0xd8) {
    return { ok: false, error: "The photo is not a JPEG." };
  }
  // Check the row first, so a photo for a gone listing does not go into Drive.
  var found = findListingRow(SpreadsheetApp.getActiveSpreadsheet(), id);
  if (!found) return { ok: false, error: "row_gone" };
  var name = String(found.listing["Listing id"]).trim() + " " + new Date().toISOString() + ".jpg";
  var file = photosFolder().createFile(Utilities.newBlob(bytes, "image/jpeg", name));
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    // A Workspace domain can block "anyone with the link". The photo would belong to no listing, so bin it.
    file.setTrashed(true);
    return { ok: false, error: "Drive would not share the photo as anyone with the link can view: " + String(err.message || err) };
  }
  return { ok: true, fileId: file.getId() };
}

// The fallback when the thumbnail URL fails: the photo as base64. Anyone with the /exec URL can call this,
// so it returns only a file in the Photos folder, never another file of the sheet owner.
function getPhoto(fileId) {
  if (typeof fileId !== "string" || !FILE_ID.test(fileId)) return { ok: false, error: "Send a Drive file id." };
  var folderId = photosFolder().getId();
  var file;
  try {
    file = DriveApp.getFileById(fileId);
  } catch (err) {
    return { ok: false, error: "No photo with that id in the Photos folder." };
  }
  var parents = file.getParents();
  var inFolder = false;
  while (parents.hasNext()) {
    if (parents.next().getId() === folderId) inFolder = true;
  }
  if (!inFolder) return { ok: false, error: "No photo with that id in the Photos folder." };
  var blob = file.getBlob();
  return { ok: true, mimeType: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

// The Drive folder in the Photos folder row of the Settings tab. The row holds the folder link or its id.
function photosFolder() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Settings");
  if (!sheet) throw new Error("missing tab: Settings. Run setup in the Apps Script editor.");
  var values = sheet.getDataRange().getValues();
  var r = photosFolderRow(values);
  var value = r === -1 ? "" : String(values[r][1] === undefined ? "" : values[r][1]).trim();
  var match = value.match(/\/folders\/([A-Za-z0-9_-]+)/);
  var folderId = match ? match[1] : value;
  if (!folderId) throw new Error("No Photos folder in the Settings tab. Run setup in the Apps Script editor.");
  return DriveApp.getFolderById(folderId);
}

// Apps Script cannot import, so these copy addItem and removeItem in public/lib/our-take.mjs. Keep them the same.
function splitItems(value) {
  return cellText(value)
    .split(";")
    .map(function (item) {
      return item.trim();
    })
    .filter(Boolean);
}

function addItem(cell, item) {
  return splitItems(cell).concat([item.trim()]).join("; ");
}

function removeItem(cell, item) {
  var items = splitItems(cell);
  var at = items.indexOf(item.trim());
  if (at !== -1) items.splice(at, 1);
  return items.join("; ");
}

// The Tracker row whose Listing id is id, as { sheet, headers, rowNumber, listing }, or null when it is gone.
function findListingRow(spreadsheet, id) {
  var key = String(id === null || id === undefined ? "" : id).trim();
  var sheet = spreadsheet.getSheetByName("Tracker");
  if (!sheet) throw new Error("missing tab: Tracker. Run setup in the Apps Script editor.");
  if (!key) return null;
  var values = sheet.getDataRange().getValues();
  var headers = values[0] || [];
  var idColumn = headers.indexOf("Listing id");
  if (idColumn === -1) return null;
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][idColumn]).trim() !== key) continue;
    var listing = {};
    headers.forEach(function (header, c) {
      if (header) listing[header] = values[r][c] === undefined ? "" : values[r][c];
    });
    return { sheet: sheet, headers: headers, rowNumber: r + 1, listing: listing };
  }
  return null;
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
// like M93900012. For housing.com it is "housing-" plus the number after /rent/, like housing-21267780.
// For other sites it is the link without its ?... and #... tail. No link has no key.
// Apps Script cannot import, so this copies linkKey in public/lib/same-listing.mjs. Keep the two the same.
function linkKey(link) {
  var text = link === null || link === undefined ? "" : String(link).trim();
  if (!text) return null;
  var bare = text.split(/[?#]/)[0];
  var spid = /^https?:\/\/([^/]+\.)?99acres\.com\//i.test(bare) ? bare.match(/spid-([A-Za-z0-9]+)/) : null;
  if (spid) return spid[1];
  var housing = /^https?:\/\/([^/]+\.)?housing\.com\//i.test(bare) ? bare.match(/\/rent\/(\d+)(?:[-/]|$)/) : null;
  return housing ? "housing-" + housing[1] : bare;
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
