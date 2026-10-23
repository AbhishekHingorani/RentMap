// Runs apps-script/Code.gs in a Node vm with a fake SpreadsheetApp and ContentService.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { TRACKER_COLUMNS, PLACES_COLUMNS, SETTINGS_COLUMNS } from "../public/lib/columns.mjs";

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
