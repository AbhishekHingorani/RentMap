import { test } from "node:test";
import assert from "node:assert/strict";
import { listingsFromRows } from "../public/lib/listings.mjs";
import { TRACKER_COLUMNS } from "../public/lib/columns.mjs";
import { allFields, fieldText, isRoughPin, photoLinks } from "../public/lib/details.mjs";

test("All 40 fields lists every Tracker column with its number, in sheet order", () => {
  const [listing] = listingsFromRows([{ "Listing id": "abc", Locality: "Whitefield" }]);
  const fields = allFields(listing);
  assert.equal(fields.length, 40);
  assert.deepEqual(
    fields.map((f) => f.column),
    TRACKER_COLUMNS,
  );
  assert.deepEqual(
    fields.map((f) => f.number),
    TRACKER_COLUMNS.map((_, i) => i + 1),
  );
  assert.equal(fields[2].value, "Whitefield");
});

test("a value the listing does not show reads not given", () => {
  const [listing] = listingsFromRows([{ "Broker name": "  ", Parking: "Yes" }]);
  assert.equal(fieldText(listing, "Broker name"), "not given");
  assert.equal(fieldText(listing, "Owner phone"), "not given");
  assert.equal(fieldText(listing, "Parking"), "Yes");
  assert.ok(allFields(listing).find((f) => f.column === "Deposit").value === "not given");
});

test("money columns show in rupees, and a zero stays a zero", () => {
  const [listing] = listingsFromRows([{ Deposit: 200000, "Brokerage fee": 0, "Rent (₹/month)": "38,999" }]);
  assert.equal(fieldText(listing, "Deposit"), "₹2,00,000");
  assert.equal(fieldText(listing, "Brokerage fee"), "₹0");
  assert.equal(fieldText(listing, "Rent (₹/month)"), "₹38,999");
});

test("a money cell that is not a number shows as typed", () => {
  const [listing] = listingsFromRows([{ Deposit: "2 months rent" }]);
  assert.equal(fieldText(listing, "Deposit"), "2 months rent");
});

test("Total monthly cost and Overall rating show the worked-out value when the cell is empty", () => {
  const [listing] = listingsFromRows([
    { "Rent (₹/month)": 30000, "Maintenance (₹/month)": 2000, "Overall rating": 3.666 },
  ]);
  assert.equal(fieldText(listing, "Total monthly cost"), "₹32,000");
  assert.equal(fieldText(listing, "Overall rating"), "3.7 / 5");
});

test("a pin is rough when Pin precision is society or locality", () => {
  const rough = (precision) => isRoughPin(listingsFromRows([{ "Pin precision": precision }])[0]);
  assert.equal(rough("society"), true);
  assert.equal(rough("Locality"), true);
  assert.equal(rough("building"), false);
  assert.equal(rough(""), false);
});

test("photo links are every link in the Photos cell", () => {
  const [listing] = listingsFromRows([{ Photos: "https://a/1.jpg; ;https://a/2.jpg " }]);
  assert.deepEqual(photoLinks(listing), ["https://a/1.jpg", "https://a/2.jpg"]);
});
