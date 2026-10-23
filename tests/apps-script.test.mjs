// Runs apps-script/Code.gs in a Node vm with a fake SpreadsheetApp and ContentService.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { TRACKER_COLUMNS, PLACES_COLUMNS, SETTINGS_COLUMNS } from "../public/lib/columns.mjs";
import { ALREADY_ON_MAP, linkKey } from "../public/lib/same-listing.mjs";
import { CLASH, ROW_GONE, addItem, removeItem } from "../public/lib/our-take.mjs";

const code = readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8");

// A tab is a 2D array of cell values. The fake keeps the parts of the Sheet API that Code.gs uses.
function fakeSheet(name, cells = []) {
  return {
    name,
    cells,
    getName: () => name,
    getLastRow: () => cells.length,
    getLastColumn: () => Math.max(0, ...cells.map((r) => r.length)),
    getDataRange() {
      return { getValues: () => cells.map((r) => [...r]) };
    },
    getRange(row, col, numRows, numCols) {
      return {
        getValues() {
          return Array.from({ length: numRows }, (_, r) =>
            Array.from({ length: numCols }, (_, c) => cells[row - 1 + r]?.[col - 1 + c] ?? ""),
          );
        },
        setValues(values) {
          assert.equal(values.length, numRows);
          for (let r = 0; r < numRows; r++) {
            assert.equal(values[r].length, numCols);
            cells[row - 1 + r] ??= [];
            for (let c = 0; c < numCols; c++) cells[row - 1 + r][col - 1 + c] = values[r][c];
          }
        },
      };
    },
    setFrozenRows() {},
  };
}

// The fake lock records each step, so a test can check that the write happened inside it.
function fakeLock(log, { busy = false } = {}) {
  return {
    waitLock(ms) {
      log.push(`wait ${ms}`);
      if (busy) throw new Error("Lock timeout");
    },
    releaseLock() {
      log.push("release");
    },
  };
}

function runScript(tabs, { busy = false } = {}) {
  const log = [];
  const sheets = new Map(tabs.map((t) => [t.name, t]));
  const spreadsheet = {
    getSheetByName: (name) => sheets.get(name) ?? null,
    insertSheet(name) {
      const sheet = fakeSheet(name);
      sheets.set(name, sheet);
      return sheet;
    },
  };
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, flush: () => log.push("flush") },
    LockService: { getScriptLock: () => fakeLock(log, { busy }) },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
    },
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  return { context, sheets, log };
}

function post(context, body) {
  const out = context.doPost({ postData: { contents: JSON.stringify(body), type: "text/plain" } });
  return JSON.parse(out.text);
}

test("setup makes the 3 tabs with the spec headers in row 1", () => {
  const { context, sheets } = runScript([]);
  context.setup();
  assert.deepEqual(sheets.get("Tracker").cells[0], TRACKER_COLUMNS);
  assert.equal(sheets.get("Tracker").cells[0].length, 40);
  assert.deepEqual(sheets.get("Places").cells[0], PLACES_COLUMNS);
  assert.deepEqual(sheets.get("Settings").cells[0], SETTINGS_COLUMNS);
  assert.deepEqual(sheets.get("Settings").cells[1], ["Budget (₹/month)", ""]);
  assert.deepEqual(sheets.get("Settings").cells[2], ["City", "Bangalore"]);
});

test("setup adds the City row to a Settings tab that lacks it, and keeps the rows it has", () => {
  const settings = fakeSheet("Settings", [["Setting", "Value"], ["Budget (₹/month)", 45000]]);
  const { context } = runScript([settings]);
  context.setup();
  assert.deepEqual(settings.cells, [["Setting", "Value"], ["Budget (₹/month)", 45000], ["City", "Bangalore"]]);

  settings.cells[2][1] = "Pune";
  context.setup();
  assert.equal(settings.cells.length, 3);
  assert.equal(settings.cells[2][1], "Pune");
});

test("setup leaves a tab that has data alone", () => {
  const tracker = fakeSheet("Tracker", [TRACKER_COLUMNS, ["x1", "Kept row"]]);
  const { context } = runScript([tracker]);
  context.setup();
  assert.equal(tracker.cells[1][1], "Kept row");
});

test("one load call returns all 3 tabs as rows keyed by header", () => {
  const tracker = fakeSheet("Tracker", [
    ["Listing id", "Society / building name", "Lat"],
    ["L1", "Ahad Excellencia", 12.9],
    ["", "", ""],
  ]);
  const places = fakeSheet("Places", [["Name", "Lat"], ["Office", 12.97]]);
  const settings = fakeSheet("Settings", [["Setting", "Value"], ["Budget (₹/month)", 45000]]);
  const { context } = runScript([tracker, places, settings]);

  const reply = post(context, { action: "load" });

  assert.equal(reply.ok, true);
  assert.deepEqual(reply.tracker, [
    { "Listing id": "L1", "Society / building name": "Ahad Excellencia", Lat: 12.9 },
  ]);
  assert.deepEqual(reply.places, [{ Name: "Office", Lat: 12.97 }]);
  assert.deepEqual(reply.settings, [{ Setting: "Budget (₹/month)", Value: 45000 }]);
});

test("an unknown action and a missing tab come back as errors", () => {
  const { context } = runScript([]);
  assert.deepEqual(post(context, { action: "nope" }), { ok: false, error: "unknown action: nope" });
  assert.deepEqual(post(context, { action: "load" }), {
    ok: false,
    error: "missing tab: Tracker. Run setup in the Apps Script editor.",
  });
});

test("the test rows for the sheet fit the Tracker columns and each has a map spot", () => {
  const text = readFileSync(new URL("../apps-script/test-rows.tsv", import.meta.url), "utf8");
  const lines = text.trimEnd().split("\n");
  assert.equal(lines.length, 3);
  for (const line of lines) {
    const cells = line.split("\t");
    assert.equal(cells.length, TRACKER_COLUMNS.length);
    const lat = Number(cells[TRACKER_COLUMNS.indexOf("Lat")]);
    const long = Number(cells[TRACKER_COLUMNS.indexOf("Long")]);
    assert.ok(lat > 0 && long > 0, line);
  }
});

const OFFICE = { name: "Office", address: "Embassy Tech Village, Outer Ring Road", lat: 12.93, long: 77.69, precision: "building" };

test("addPlace writes Name, Address, Lat, Long, Pin precision and Added by inside the lock", () => {
  const places = fakeSheet("Places", [PLACES_COLUMNS]);
  const { context, log } = runScript([places]);

  const reply = post(context, { action: "addPlace", place: OFFICE, addedBy: "Asha" });

  assert.equal(reply.ok, true);
  assert.deepEqual(places.cells[1], ["Office", "Embassy Tech Village, Outer Ring Road", 12.93, 77.69, "building", "Asha"]);
  assert.deepEqual(reply.place, {
    Name: "Office",
    Address: "Embassy Tech Village, Outer Ring Road",
    Lat: 12.93,
    Long: 77.69,
    "Pin precision": "building",
    "Added by": "Asha",
  });
  assert.deepEqual(log, ["wait 20000", "flush", "release"]);
});

test("addPlace writes by the row 1 headers, so a moved column gets the right value", () => {
  const places = fakeSheet("Places", [["Added by", "Name", "Lat", "Long", "Address", "Pin precision"]]);
  const { context } = runScript([places]);
  post(context, { action: "addPlace", place: OFFICE, addedBy: "Ravi" });
  assert.deepEqual(places.cells[1], ["Ravi", "Office", 12.93, 77.69, "Embassy Tech Village, Outer Ring Road", "building"]);
});

test("a retried addPlace with the same name and address adds no second row", () => {
  const places = fakeSheet("Places", [PLACES_COLUMNS]);
  const { context } = runScript([places]);
  post(context, { action: "addPlace", place: OFFICE, addedBy: "Asha" });
  const again = post(context, { action: "addPlace", place: { ...OFFICE, name: " office " }, addedBy: "Asha" });
  assert.equal(again.ok, true);
  assert.equal(places.cells.length, 2);
  assert.equal(again.place.Name, "Office");
});

test("addPlace returns busy when the lock does not come, and writes nothing", () => {
  const places = fakeSheet("Places", [PLACES_COLUMNS]);
  const { context, log } = runScript([places], { busy: true });
  assert.deepEqual(post(context, { action: "addPlace", place: OFFICE, addedBy: "Asha" }), { ok: false, error: "busy" });
  assert.equal(places.cells.length, 1);
  assert.deepEqual(log, ["wait 20000"]);
});

test("addPlace refuses a place with no name, no map spot or an unknown Pin precision", () => {
  const places = fakeSheet("Places", [PLACES_COLUMNS]);
  const { context } = runScript([places]);
  const cases = [
    [{ ...OFFICE, name: " " }, "A place needs a name and an address."],
    [{ ...OFFICE, lat: null }, "A place needs a map spot."],
    [{ ...OFFICE, long: "77.6" }, "A place needs a map spot."],
    [{ ...OFFICE, precision: "city" }, "Unknown Pin precision: city"],
  ];
  for (const [place, error] of cases) {
    assert.deepEqual(post(context, { action: "addPlace", place, addedBy: "Asha" }), { ok: false, error });
  }
  assert.equal(places.cells.length, 1);
});

// A new listing row as the page sends it. The page never sends the two worked-out columns.
function newRow(over = {}) {
  return {
    "Listing id": "L-abc",
    "Society / building name": "Ahad Excellencia",
    Locality: "Chikkanayakanahalli",
    Configuration: "2BHK",
    Status: "To call",
    "Rent (₹/month)": 38999,
    "Maintenance (₹/month)": 3000,
    Photos: "https://imagecdn.99acres.com/a.jpg; https://imagecdn.99acres.com/b.jpg",
    "Listing link": "https://www.99acres.com/flat-spid-M93900012",
    Lat: 12.9,
    Long: 77.7,
    "Pin precision": "society",
    "Date added": "2026-10-23",
    "Added by": "Asha",
    ...over,
  };
}

function cellOf(sheet, rowIndex, column) {
  return sheet.cells[rowIndex][sheet.cells[0].indexOf(column)];
}

test("addListing writes the row by header inside the lock, with Total monthly cost", () => {
  const tracker = fakeSheet("Tracker", [TRACKER_COLUMNS]);
  const { context, log } = runScript([tracker]);

  const reply = post(context, { action: "addListing", listing: newRow() });

  assert.equal(reply.ok, true);
  assert.equal(tracker.cells.length, 2);
  assert.equal(tracker.cells[1].length, 40);
  assert.equal(cellOf(tracker, 1, "Listing id"), "L-abc");
  assert.equal(cellOf(tracker, 1, "Status"), "To call");
  assert.equal(cellOf(tracker, 1, "Added by"), "Asha");
  assert.equal(cellOf(tracker, 1, "Total monthly cost"), 41999);
  assert.equal(cellOf(tracker, 1, "Overall rating"), "");
  // Site photo links stay as the page sent them.
  assert.equal(cellOf(tracker, 1, "Photos"), "https://imagecdn.99acres.com/a.jpg; https://imagecdn.99acres.com/b.jpg");
  assert.equal(reply.listing["Total monthly cost"], 41999);
  assert.equal(reply.listing["Listing id"], "L-abc");
  assert.deepEqual(log, ["wait 20000", "flush", "release"]);
});

test("addListing writes by the row 1 headers, so a moved column gets the right value", () => {
  const headers = [...TRACKER_COLUMNS].reverse();
  const tracker = fakeSheet("Tracker", [headers]);
  const { context } = runScript([tracker]);
  post(context, { action: "addListing", listing: newRow() });
  assert.equal(tracker.cells[1][0], "Asha");
  assert.equal(cellOf(tracker, 1, "Total monthly cost"), 41999);
});

test("a retried addListing with the same Listing id adds no second row", () => {
  const tracker = fakeSheet("Tracker", [TRACKER_COLUMNS]);
  const { context } = runScript([tracker]);
  post(context, { action: "addListing", listing: newRow() });
  const again = post(context, { action: "addListing", listing: newRow({ "Rent (₹/month)": 1 }) });
  assert.equal(again.ok, true);
  assert.equal(tracker.cells.length, 2);
  assert.equal(again.listing["Rent (₹/month)"], 38999);
});

test("the page cannot set Total monthly cost or Overall rating", () => {
  const tracker = fakeSheet("Tracker", [TRACKER_COLUMNS]);
  const { context } = runScript([tracker]);
  post(context, { action: "addListing", listing: newRow({ "Total monthly cost": 5, "Overall rating": 5 }) });
  assert.equal(cellOf(tracker, 1, "Total monthly cost"), 41999);
  assert.equal(cellOf(tracker, 1, "Overall rating"), "");
});

test("Total monthly cost is rent alone when maintenance is empty, and empty when rent is empty", () => {
  const tracker = fakeSheet("Tracker", [TRACKER_COLUMNS]);
  const { context } = runScript([tracker]);
  post(context, { action: "addListing", listing: newRow({ "Listing id": "a", "Maintenance (₹/month)": "" }) });
  post(context, { action: "addListing", listing: newRow({ "Listing id": "b", "Rent (₹/month)": "", "Listing link": "https://housing.com/rent/2" }) });
  assert.equal(cellOf(tracker, 1, "Total monthly cost"), 38999);
  assert.equal(cellOf(tracker, 2, "Total monthly cost"), "");
});

// Ratings come later, from the Our take tab. The script works Overall rating out from the cells after any write.
test("Overall rating with Safety 4 and Location 2 filled and the other 3 empty is 3", () => {
  const tracker = fakeSheet("Tracker", [TRACKER_COLUMNS]);
  const { context } = runScript([tracker]);
  post(context, { action: "addListing", listing: newRow({ Safety: 4, Location: 2 }) });
  assert.equal(cellOf(tracker, 1, "Overall rating"), 3);
});

test("Overall rating with all 5 ratings empty is empty", () => {
  const tracker = fakeSheet("Tracker", [TRACKER_COLUMNS]);
  const { context } = runScript([tracker]);
  const reply = post(context, { action: "addListing", listing: newRow() });
  assert.equal(cellOf(tracker, 1, "Overall rating"), "");
  assert.equal(reply.listing["Overall rating"], "");
});

test("Overall rating reads hand-typed ratings and rounds to 2 decimals", () => {
  const tracker = fakeSheet("Tracker", [TRACKER_COLUMNS]);
  const { context } = runScript([tracker]);
  post(context, { action: "addListing", listing: newRow({ Safety: "4", "Water supply": 5, Condition: 5 }) });
  assert.equal(cellOf(tracker, 1, "Overall rating"), 4.67);
});

test("addListing returns busy when the lock does not come, and writes nothing", () => {
  const tracker = fakeSheet("Tracker", [TRACKER_COLUMNS]);
  const { context, log } = runScript([tracker], { busy: true });
  assert.deepEqual(post(context, { action: "addListing", listing: newRow() }), { ok: false, error: "busy" });
  assert.equal(tracker.cells.length, 1);
  assert.deepEqual(log, ["wait 20000"]);
});

test("addListing refuses a listing with no Listing id", () => {
  const tracker = fakeSheet("Tracker", [TRACKER_COLUMNS]);
  const { context } = runScript([tracker]);
  assert.deepEqual(post(context, { action: "addListing", listing: newRow({ "Listing id": " " }) }), {
    ok: false,
    error: "A new listing needs a Listing id.",
  });
  assert.equal(tracker.cells.length, 1);
});

// "Same listing added twice" in SPEC.md: the script looks for the link key again inside its lock.
test("addListing refuses a new listing whose link key is in the sheet, and returns the saved row", () => {
  const tracker = fakeSheet("Tracker", [TRACKER_COLUMNS]);
  const { context, log } = runScript([tracker]);
  post(context, { action: "addListing", listing: newRow({ "Listing id": "L-first", "Added by": "Asha" }) });
  log.length = 0;
  const again = post(context, {
    action: "addListing",
    listing: newRow({ "Listing id": "L-second", "Added by": "Ravi", "Listing link": "https://99acres.com/other-spid-M93900012?x=1" }),
  });
  assert.equal(again.ok, false);
  assert.equal(again.error, ALREADY_ON_MAP);
  assert.equal(again.listing["Listing id"], "L-first");
  assert.equal(again.listing["Added by"], "Asha");
  assert.equal(tracker.cells.length, 2);
  assert.deepEqual(log, ["wait 20000", "flush", "release"]);
});

test("addListing refuses a same-link listing that is Rejected", () => {
  const tracker = fakeSheet("Tracker", [TRACKER_COLUMNS]);
  const { context } = runScript([tracker]);
  post(context, { action: "addListing", listing: newRow({ "Listing id": "L-first", Status: "Rejected" }) });
  const again = post(context, { action: "addListing", listing: newRow({ "Listing id": "L-second" }) });
  assert.equal(again.error, ALREADY_ON_MAP);
  assert.equal(again.listing.Status, "Rejected");
  assert.equal(tracker.cells.length, 2);
});

test("addListing adds listings with no link or other links, and refuses a link that differs only in its # tail", () => {
  const tracker = fakeSheet("Tracker", [TRACKER_COLUMNS]);
  const { context } = runScript([tracker]);
  post(context, { action: "addListing", listing: newRow({ "Listing id": "a", "Listing link": "" }) });
  post(context, { action: "addListing", listing: newRow({ "Listing id": "b", "Listing link": "" }) });
  post(context, { action: "addListing", listing: newRow({ "Listing id": "c", "Listing link": "https://housing.com/rent/1?x=1" }) });
  const d = post(context, { action: "addListing", listing: newRow({ "Listing id": "d", "Listing link": "https://housing.com/rent/2" }) });
  assert.equal(d.ok, true);
  assert.equal(tracker.cells.length, 5);
  const e = post(context, { action: "addListing", listing: newRow({ "Listing id": "e", "Listing link": "https://housing.com/rent/1#top" }) });
  assert.equal(e.error, ALREADY_ON_MAP);
  assert.equal(e.listing["Listing id"], "c");
});

test("the script's linkKey gives the same key as the page's", () => {
  const { context } = runScript([]);
  const links = [
    "https://www.99acres.com/2-bhk-flat-for-rent-in-ahad-excellencia-spid-M93900012",
    "https://99acres.com/x-spid-M93900012?src=share#photos",
    "https://www.99acres.com/search?city=1",
    "https://housing.com/rent/123-flat?utm=x#top",
    "https://example.com/spid-M93900012",
    "",
    "  ",
    null,
  ];
  for (const link of links) assert.equal(context.linkKey(link), linkKey(link), String(link));
});

// --- Our take: getListing, saveCells and editList, with the clash check ---

// A Tracker tab with one saved listing, L-abc, as addListing wrote it.
function savedTracker(over = {}) {
  const tracker = fakeSheet("Tracker", [TRACKER_COLUMNS]);
  const { context, log } = runScript([tracker]);
  post(context, { action: "addListing", listing: newRow({ Pros: "Quiet street", ...over }) });
  log.length = 0;
  return { tracker, context, log };
}

test("getListing reads the row as it is in the sheet now", () => {
  const { tracker, context } = savedTracker();
  tracker.cells[1][TRACKER_COLUMNS.indexOf("Status")] = "Visited";
  const reply = post(context, { action: "getListing", id: "L-abc" });
  assert.equal(reply.ok, true);
  assert.equal(reply.listing.Status, "Visited");
  assert.deepEqual(post(context, { action: "getListing", id: "L-gone" }), { ok: false, error: ROW_GONE });
});

test("saveCells writes a cell whose old value matches the sheet, inside the lock", () => {
  const { tracker, context, log } = savedTracker();
  const reply = post(context, { action: "saveCells", id: "L-abc", cells: [{ column: "Status", old: "To call", new: "Visited" }] });
  assert.equal(reply.ok, true);
  assert.equal(cellOf(tracker, 1, "Status"), "Visited");
  assert.equal(reply.listing.Status, "Visited");
  assert.deepEqual(log, ["wait 20000", "flush", "release"]);
});

test("saveCells writes nothing and returns the sheet values when any old value differs", () => {
  const { tracker, context } = savedTracker();
  tracker.cells[1][TRACKER_COLUMNS.indexOf("Status")] = "Visited";
  const before = JSON.stringify(tracker.cells);
  const reply = post(context, {
    action: "saveCells",
    id: "L-abc",
    cells: [
      { column: "Safety", old: "", new: 4 },
      { column: "Status", old: "To call", new: "Shortlisted" },
    ],
  });
  assert.equal(reply.ok, false);
  assert.equal(reply.error, CLASH);
  assert.deepEqual(reply.clashes, ["Status"]);
  assert.equal(reply.listing.Status, "Visited");
  assert.equal(JSON.stringify(tracker.cells), before);
});

test("the clash check reads a number cell and the number the page saw as the same", () => {
  const { tracker, context } = savedTracker({ Safety: 4 });
  const reply = post(context, { action: "saveCells", id: "L-abc", cells: [{ column: "Safety", old: 4, new: 2 }] });
  assert.equal(reply.ok, true);
  assert.equal(cellOf(tracker, 1, "Safety"), 2);
});

test("the clash check reads a date cell and the ISO text the page got from load as the same", () => {
  const { tracker, context } = savedTracker();
  const day = new Date(Date.UTC(2026, 9, 22, 18, 30));
  tracker.cells[1][TRACKER_COLUMNS.indexOf("Available from")] = day;
  const seen = post(context, { action: "getListing", id: "L-abc" }).listing["Available from"];
  assert.equal(seen, "2026-10-22T18:30:00.000Z");
  const reply = post(context, { action: "saveCells", id: "L-abc", cells: [{ column: "Available from", old: seen, new: "Now" }] });
  assert.equal(reply.ok, true);
  assert.equal(cellOf(tracker, 1, "Available from"), "Now");
});

test("a rating save writes the new Overall rating inside the same lock", () => {
  const { tracker, context } = savedTracker({ Safety: 4 });
  const reply = post(context, { action: "saveCells", id: "L-abc", cells: [{ column: "Location", old: "", new: 2 }] });
  assert.equal(cellOf(tracker, 1, "Overall rating"), 3);
  assert.equal(reply.listing["Overall rating"], 3);
  const cleared = post(context, { action: "saveCells", id: "L-abc", cells: [{ column: "Safety", old: 4, new: "" }] });
  assert.equal(cleared.listing["Overall rating"], 2);
});

test("saveCells refuses a save when the row is gone from the sheet", () => {
  const { tracker, context } = savedTracker();
  tracker.cells.splice(1, 1);
  const reply = post(context, { action: "saveCells", id: "L-abc", cells: [{ column: "Status", old: "To call", new: "Visited" }] });
  assert.deepEqual(reply, { ok: false, error: ROW_GONE });
  assert.equal(tracker.cells.length, 1);
});

test("saveCells refuses a bad Status, a bad rating, and cells it must not write", () => {
  const { tracker, context } = savedTracker();
  const before = JSON.stringify(tracker.cells);
  const cases = [
    [{ column: "Status", old: "To call", new: "Maybe" }, "Unknown Status: Maybe"],
    [{ column: "Safety", old: "", new: 6 }, "Safety must be a whole number from 1 to 5, or empty."],
    [{ column: "Safety", old: "", new: 2.5 }, "Safety must be a whole number from 1 to 5, or empty."],
    [{ column: "Overall rating", old: "", new: 5 }, "The app cannot write Overall rating."],
    [{ column: "Listing id", old: "L-abc", new: "x" }, "The app cannot write Listing id."],
    [{ column: "Pros", old: "Quiet street", new: "" }, "Pros changes one item at a time."],
    [{ column: "Nope", old: "", new: "x" }, "Unknown column: Nope"],
  ];
  for (const [cell, error] of cases) {
    assert.deepEqual(post(context, { action: "saveCells", id: "L-abc", cells: [cell] }), { ok: false, error }, cell.column);
  }
  assert.deepEqual(post(context, { action: "saveCells", id: "L-abc", cells: [] }), { ok: false, error: "A save needs at least one cell." });
  assert.equal(JSON.stringify(tracker.cells), before);
});

test("saveCells returns busy when the lock does not come, and writes nothing", () => {
  const tracker = fakeSheet("Tracker", [TRACKER_COLUMNS, TRACKER_COLUMNS.map((c) => (c === "Listing id" ? "L-abc" : ""))]);
  const { context } = runScript([tracker], { busy: true });
  const reply = post(context, { action: "saveCells", id: "L-abc", cells: [{ column: "Status", old: "", new: "Visited" }] });
  assert.deepEqual(reply, { ok: false, error: "busy" });
  assert.equal(cellOf(tracker, 1, "Status"), "");
});

test("editList adds one item to the cell as it is in the sheet now", () => {
  const { tracker, context } = savedTracker();
  // Someone else added a pro since this page loaded. It stays.
  tracker.cells[1][TRACKER_COLUMNS.indexOf("Pros")] = "Quiet street; Big balcony";
  const reply = post(context, { action: "editList", id: "L-abc", column: "Pros", add: "Near the metro" });
  assert.equal(reply.ok, true);
  assert.equal(cellOf(tracker, 1, "Pros"), "Quiet street; Big balcony; Near the metro");
  assert.equal(reply.listing.Pros, "Quiet street; Big balcony; Near the metro");
});

test("editList removes one item, and an item that is already gone counts as done", () => {
  const { tracker, context } = savedTracker({ Cons: "Noisy; Old lift" });
  assert.equal(post(context, { action: "editList", id: "L-abc", column: "Cons", remove: "Noisy" }).ok, true);
  assert.equal(cellOf(tracker, 1, "Cons"), "Old lift");
  const again = post(context, { action: "editList", id: "L-abc", column: "Cons", remove: "Noisy" });
  assert.equal(again.ok, true);
  assert.equal(cellOf(tracker, 1, "Cons"), "Old lift");
});

test("editList refuses a gone row, another column, and an item with ;", () => {
  const { tracker, context } = savedTracker();
  assert.deepEqual(post(context, { action: "editList", id: "L-gone", column: "Pros", add: "x" }), { ok: false, error: ROW_GONE });
  assert.deepEqual(post(context, { action: "editList", id: "L-abc", column: "Status", add: "x" }), {
    ok: false,
    error: "Status is not a list cell.",
  });
  assert.deepEqual(post(context, { action: "editList", id: "L-abc", column: "Pros", add: "a; b" }), {
    ok: false,
    error: 'An item cannot hold a ";".',
  });
  assert.deepEqual(post(context, { action: "editList", id: "L-abc", column: "Pros", add: " " }), {
    ok: false,
    error: "Send one item to add or to remove.",
  });
  assert.equal(cellOf(tracker, 1, "Pros"), "Quiet street");
});

test("the script's addItem and removeItem give the same cell as the page's", () => {
  const { context } = runScript([]);
  const cells = ["", "Lift", "Lift; Gym", " Lift ;; Gym ; Lift "];
  for (const cell of cells) {
    for (const item of ["Lift", " Gym ", "Pool"]) {
      assert.equal(context.addItem(cell, item), addItem(cell, item), `add ${item} to ${cell}`);
      assert.equal(context.removeItem(cell, item), removeItem(cell, item), `remove ${item} from ${cell}`);
    }
  }
});
