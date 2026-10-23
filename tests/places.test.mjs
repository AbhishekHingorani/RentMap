import { test } from "node:test";
import assert from "node:assert/strict";
import { cityFrom, distanceM, distancesFor, formatDistance, placesFromRows } from "../public/lib/places.mjs";
import { settingsFromRows } from "../public/lib/listings.mjs";

test("the city comes from the City row of the Settings tab", () => {
  const settings = settingsFromRows([
    { Setting: "Budget (₹/month)", Value: 45000 },
    { Setting: "City", Value: " Bangalore " },
  ]);
  assert.equal(cityFrom(settings), "Bangalore");
  assert.equal(cityFrom({}), "");
});

test("place rows become places with a map spot", () => {
  const [office, home] = placesFromRows([
    { Name: "Office", Address: "ORR", Lat: 12.93, Long: "77.69", "Pin precision": "Building", "Added by": "Asha" },
    { Name: "Parents", Address: "Jayanagar", Lat: "", Long: "" },
  ]);
  assert.deepEqual(office, { name: "Office", address: "ORR", spot: [12.93, 77.69], precision: "building", addedBy: "Asha" });
  assert.equal(home.spot, null);
});

test("straight-line distance matches a known pair of spots", () => {
  // MG Road metro to Koramangala Forum Mall is about 4.6 km in a straight line.
  const metres = distanceM([12.9756, 77.6066], [12.9346, 77.6113]);
  assert.ok(Math.abs(metres - 4580) < 50, String(metres));
  assert.equal(distanceM([12.9, 77.6], [12.9, 77.6]), 0);
});

test("distances read in metres under 1 km and in km above", () => {
  assert.equal(formatDistance(0), "50 m");
  assert.equal(formatDistance(830), "850 m");
  assert.equal(formatDistance(4580), "4.6 km");
  assert.equal(formatDistance(4000), "4.0 km");
  assert.equal(formatDistance(23456), "23 km");
});

test("each listing gets one distance per place, worked out live", () => {
  const places = placesFromRows([
    { Name: "Office", Lat: 12.9346, Long: 77.6113 },
    { Name: "Gym", Lat: "", Long: "" },
  ]);
  assert.deepEqual(distancesFor({ spot: [12.9756, 77.6066] }, places), [
    { name: "Office", text: "4.6 km" },
    { name: "Gym", text: "not given" },
  ]);
  assert.deepEqual(distancesFor({ spot: null }, places)[0], { name: "Office", text: "not given" });
});
