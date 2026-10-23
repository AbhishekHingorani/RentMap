import { test } from "node:test";
import assert from "node:assert/strict";
import { cityFrom, distanceM, distancesFor, coordinatesText, editPlaceBody, editedPlaceIn, formatDistance, parseCoordinates, placesFromRows, spotPlan } from "../public/lib/places.mjs";
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

const SAVED = { name: "Office", address: "Embassy Tech Village", spot: [12.93, 77.69], precision: "building", addedBy: "Asha" };

test("coordinates read as typed or as Google Maps copies them", () => {
  const spot = { lat: 23.03, long: 72.51, precision: "building" };
  for (const text of ["23.03, 72.51", " 23.03,72.51 ", "23.03 72.51", "23.03° N, 72.51° E"]) {
    assert.deepEqual(parseCoordinates(text), { spot }, text);
  }
  assert.deepEqual(parseCoordinates("-33.9, 151.2").spot, { lat: -33.9, long: 151.2, precision: "building" });
  for (const text of ["23.03", "Iscon, 72.51", "23.03, 72.51, 5", "91, 72.5", "23, 181"]) {
    assert.ok(parseCoordinates(text).error, text);
  }
});

test("a new place uses typed coordinates, or the geocoder when the box is empty", () => {
  assert.deepEqual(spotPlan("  "), { geocode: true });
  assert.deepEqual(spotPlan("23.03, 72.51").spot, { lat: 23.03, long: 72.51, precision: "building" });
  assert.ok(spotPlan("near the lake").error);
});

test("an edit keeps the spot, takes new coordinates, or asks the geocoder", () => {
  const shown = coordinatesText(SAVED.spot);
  assert.equal(shown, "12.93, 77.69");
  const kept = { spot: { lat: 12.93, long: 77.69, precision: "building" } };
  assert.deepEqual(spotPlan(shown, SAVED, " embassy tech village "), kept);
  assert.deepEqual(spotPlan(shown, SAVED, "Bagmane Tech Park"), { geocode: true });
  assert.deepEqual(spotPlan("12.98, 77.66", SAVED, "Bagmane Tech Park").spot, { lat: 12.98, long: 77.66, precision: "building" });
  assert.deepEqual(spotPlan("", SAVED, "Embassy Tech Village"), { geocode: true });
  assert.deepEqual(spotPlan("", { ...SAVED, spot: null }, "Embassy Tech Village"), { geocode: true });
});

test("the editPlace call sends what the person saw as old, and the trimmed new values", () => {
  const body = editPlaceBody(SAVED, " HQ ", " Embassy Tech Village ", { lat: 12.93, long: 77.69, precision: "building" });
  assert.deepEqual(body, {
    action: "editPlace",
    old: { name: "Office", address: "Embassy Tech Village", lat: 12.93, long: 77.69 },
    place: { name: "HQ", address: "Embassy Tech Village", lat: 12.93, long: 77.69, precision: "building" },
  });
  assert.deepEqual(editPlaceBody({ ...SAVED, spot: null }, "HQ", "X", { lat: 1, long: 2, precision: "locality" }).old, {
    name: "Office",
    address: "Embassy Tech Village",
    lat: "",
    long: "",
  });
});

test("an edit that went in is found in the sheet by its new name, address and spot", () => {
  const wanted = { name: "HQ", address: "Embassy Tech Village", lat: 12.93, long: 77.69, precision: "building" };
  const hq = { ...SAVED, name: "hq" };
  assert.equal(editedPlaceIn([SAVED, hq], wanted), hq);
  assert.equal(editedPlaceIn([SAVED, { ...hq, spot: [12.94, 77.69] }], wanted), null);
});

test("distance colour runs from green for the nearest listing to red for the farthest", async () => {
  const { coloredDistances, distanceRanges, distanceShare, distanceHue } = await import("../public/lib/places.mjs");
  const office = { name: "Office", spot: [23.0, 72.5] };
  const near = { spot: [23.0, 72.51] };
  const middle = { spot: [23.0, 72.55] };
  const far = { spot: [23.0, 72.6] };
  const ranges = distanceRanges([near, middle, far, { spot: null }], [office, { name: "No spot", spot: null }]);
  assert.equal(ranges[1], null);
  assert.equal(distanceHue(0), 145);
  assert.equal(distanceHue(1), 25);
  assert.equal(coloredDistances(near, [office], ranges)[0].hue, 145);
  assert.equal(coloredDistances(far, [office], ranges)[0].hue, 25);
  const mid = coloredDistances(middle, [office], ranges)[0].hue;
  assert.ok(mid > 25 && mid < 145, String(mid));
  assert.deepEqual(coloredDistances({ spot: null }, [office], ranges)[0], { name: "Office", text: "not given", hue: null });
  // One listing alone is both the nearest and the farthest, so it reads green.
  assert.equal(distanceShare(500, { min: 500, max: 500 }), 0);
});
