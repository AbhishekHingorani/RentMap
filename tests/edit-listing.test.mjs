import { test } from "node:test";
import assert from "node:assert/strict";
import { TRACKER_COLUMNS } from "../public/lib/columns.mjs";
import { listingsFromRows } from "../public/lib/listings.mjs";
import {
  EDIT_COLUMNS,
  LOCKED_COLUMNS,
  applyClash,
  editClashMessage,
  editCells,
  editForm,
  keepMine,
  pinCells,
  useSheetValue,
} from "../public/lib/edit-listing.mjs";

const row = {
  "Listing id": "L1",
  "Society / building name": "Ahad Excellencia",
  Locality: "Sarjapur Road",
  Configuration: "2BHK",
  Status: "To call",
  "Rent (₹/month)": 38000,
  "Maintenance (₹/month)": "3,000",
  "Total monthly cost": 41000,
  Lat: 12.9,
  Long: 77.7,
  "Pin precision": "society",
};

test("the Edit form locks the 9 columns the spec names", () => {
  assert.deepEqual(LOCKED_COLUMNS, [
    "Listing id",
    "Listing link",
    "Total monthly cost",
    "Overall rating",
    "Date added",
    "Added by",
    "Lat",
    "Long",
    "Pin precision",
  ]);
  for (const column of LOCKED_COLUMNS) assert.equal(EDIT_COLUMNS.includes(column), false, column);
  for (const column of EDIT_COLUMNS) assert.equal(TRACKER_COLUMNS.includes(column), true, column);
});

test("the Edit form leaves Status, the ratings and the list cells to the Our take tab", () => {
  for (const column of ["Status", "Safety", "Natural light", "Pros", "Cons", "Notes", "Photos"]) {
    assert.equal(EDIT_COLUMNS.includes(column), false, column);
  }
  for (const column of ["Society / building name", "Locality", "Rent (₹/month)", "Other details", "Broker phone"]) {
    assert.equal(EDIT_COLUMNS.includes(column), true, column);
  }
});

test("Save sends only the changed cells, each with the value the person saw", () => {
  const form = editForm(row);
  form.values["Rent (₹/month)"] = "40,000";
  form.values.Locality = "Sarjapur Road";
  assert.deepEqual(editCells(form), {
    cells: [{ column: "Rent (₹/month)", old: 38000, new: 40000 }],
    problems: [],
  });
});

test("an untouched hand-typed cell is not sent, even when the app would write it another way", () => {
  const form = editForm(row);
  assert.deepEqual(editCells(form), { cells: [], problems: [] });
});

test("an edit to Locality or Society sends no Lat, Long or Pin precision", () => {
  const form = editForm(row);
  form.values.Locality = "Bellandur";
  form.values["Society / building name"] = "Prestige Lakeside";
  const { cells } = editCells(form);
  assert.deepEqual(
    cells.map((c) => c.column),
    ["Society / building name", "Locality"],
  );
});

test("Save fixes a value in the wrong format and refuses one it cannot fix", () => {
  const form = editForm(row);
  form.values.Configuration = "3 BHK";
  form.values["Maintenance (₹/month)"] = "";
  assert.deepEqual(editCells(form).cells, [
    { column: "Configuration", old: "2BHK", new: "3BHK" },
    { column: "Maintenance (₹/month)", old: "3,000", new: "" },
  ]);
  form.values["Rent (₹/month)"] = "about forty";
  form.values.Parking = "maybe";
  assert.deepEqual(editCells(form).problems, ["Rent (₹/month) must be a number.", "Parking must be one of: Yes, No."]);
});

test("a refused save marks each clashing cell and sends the sheet value as the old value next time", () => {
  const form = editForm(row);
  form.values["Rent (₹/month)"] = "40000";
  form.values.Locality = "Bellandur";
  const sheetNow = { ...row, "Rent (₹/month)": 41000, Bathrooms: 2 };
  applyClash(form, { error: "clash", clashes: ["Rent (₹/month)"], listing: sheetNow });

  assert.deepEqual(form.clashes, { "Rent (₹/month)": 41000 });
  // What the person typed stays.
  assert.equal(form.values["Rent (₹/month)"], "40000");
  assert.equal(form.values.Locality, "Bellandur");
  // A cell the person did not touch shows the sheet value now.
  assert.equal(form.values.Bathrooms, "2");
  assert.deepEqual(editCells(form).cells, [
    { column: "Locality", old: "Sarjapur Road", new: "Bellandur" },
    { column: "Rent (₹/month)", old: 41000, new: 40000 },
  ]);
});

test("Use sheet value drops the change, and Keep mine keeps it", () => {
  const sheetNow = { ...row, "Rent (₹/month)": 41000, Locality: "HSR Layout" };
  const clash = { error: "clash", clashes: ["Rent (₹/month)", "Locality"], listing: sheetNow };

  const form = editForm(row);
  form.values["Rent (₹/month)"] = "40000";
  form.values.Locality = "Bellandur";
  applyClash(form, clash);
  useSheetValue(form, "Rent (₹/month)");
  keepMine(form, "Locality");
  assert.deepEqual(form.clashes, {});
  assert.equal(form.values["Rent (₹/month)"], "41000");
  assert.deepEqual(editCells(form).cells, [{ column: "Locality", old: "HSR Layout", new: "Bellandur" }]);
});

test("a dropped pin sends Lat and Long with the values the person saw, and a building Pin precision", () => {
  const [listing] = listingsFromRows([row]);
  assert.deepEqual(pinCells(listing, { lat: 12.91234567, lng: 77.70000001 }), [
    { column: "Lat", old: 12.9, new: 12.912346 },
    { column: "Long", old: 77.7, new: 77.7 },
    { column: "Pin precision", old: "society", new: "building" },
  ]);
});

test("the clash message counts the clashing cells", () => {
  assert.match(editClashMessage({ clashes: ["Rent (₹/month)"] }), /^Someone changed 1 cell since/);
  assert.match(editClashMessage({ clashes: ["Rent (₹/month)", "Locality"] }), /^Someone changed 2 cells since/);
});
