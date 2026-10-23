import { test } from "node:test";
import assert from "node:assert/strict";
import { listingsFromRows } from "../public/lib/listings.mjs";
import { TRACKER_COLUMNS } from "../public/lib/columns.mjs";
import {
  CONTACT_COLUMNS,
  FLAT_COLUMNS,
  MONEY_COLUMNS,
  RATING_COLUMNS,
  allFields,
  fieldText,
  isRoughPin,
  itemsOf,
  photoLinks,
} from "../public/lib/details.mjs";

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

test("Our take shows the 5 ratings, and Overall rating stays in the header", () => {
  assert.deepEqual(RATING_COLUMNS, ["Safety", "Water supply", "Location", "Condition", "Natural light"]);
});

test("every column a details tab names is a Tracker column", () => {
  for (const column of [...MONEY_COLUMNS, ...FLAT_COLUMNS, ...RATING_COLUMNS, ...CONTACT_COLUMNS]) {
    assert.ok(TRACKER_COLUMNS.includes(column), column);
  }
});

test("Pros and Cons split into one item each", () => {
  const [listing] = listingsFromRows([{ Pros: "Big balcony; ; Quiet " }]);
  assert.deepEqual(itemsOf(listing, "Pros"), ["Big balcony", "Quiet"]);
  assert.deepEqual(itemsOf(listing, "Cons"), []);
});

test("balconies are read from Other details in each form Claude writes", async () => {
  const { balconiesOf, balconyText } = await import("../public/lib/details.mjs");
  const of = (text) => balconiesOf({ row: { "Other details": text } });
  assert.equal(of("Balcony: 1; Facing: East"), 1);
  assert.equal(of("Facing: East; Balconies: 3; Building: 5 floors"), 3);
  assert.equal(of("Flat; 2 balconies; facing East"), 2);
  assert.equal(of("0 balcony"), 0);
  assert.equal(of("Balconies: 0"), 0);
  assert.equal(of("No balcony, top floor"), 0);
  assert.equal(of("Modular kitchen; 4-floor building"), null);
  assert.equal(of(""), null);
  assert.deepEqual([0, 1, 2, null].map(balconyText), ["No balcony", "1 balcony", "2 balconies", "Balcony not given"]);
});

test("floor reads as Floor <value>, or not given", async () => {
  const { floorText } = await import("../public/lib/details.mjs");
  assert.equal(floorText({ row: { "Floor / total floors": "3 of 7" } }), "Floor 3 of 7");
  assert.equal(floorText({ row: { "Floor / total floors": "" } }), "Floor not given");
});
