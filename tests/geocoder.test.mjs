// The geocoder with a fake fetch and a fake clock, so no test calls Nominatim or Photon.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGeocoder, USER_AGENT, GAP_MS } = require("../geocoder.js");

// The city lookup reply. Its box is the city boundary, before the margin.
const CITY_HIT = {
  lat: "12.97",
  lon: "77.59",
  place_rank: 14,
  addresstype: "city",
  boundingbox: ["12.83", "13.14", "77.46", "77.78"],
};

// answer(url) gives the JSON for one request. Every request is kept, with its start time.
function setUp(answer) {
  const calls = [];
  let clock = 0;
  const geocoder = createGeocoder({
    now: () => clock,
    wait: async (ms) => {
      clock += ms;
    },
    fetch: async (url, options) => {
      const parsed = new URL(url);
      calls.push({ url: parsed, headers: options.headers, at: clock });
      return { ok: true, json: async () => answer(parsed) };
    },
  });
  return { geocoder, calls };
}

const isCityLookup = (url) => url.host.startsWith("nominatim") && url.searchParams.get("q") === "Bangalore";

test("each listing query goes out with countrycodes=in and a viewbox around the city", async () => {
  const { geocoder, calls } = setUp((url) => (isCityLookup(url) ? [CITY_HIT] : url.host.startsWith("photon") ? { features: [] } : []));
  await geocoder.geocode({ society: "Ahad Excellencia", locality: "Sarjapur Road", city: "Bangalore" });

  const queries = calls.slice(1);
  assert.equal(queries.length, 3);
  for (const { url } of queries.slice(0, 2)) {
    assert.equal(url.searchParams.get("countrycodes"), "in");
    // Grown by 0.1 degree on each side: west, north, east, south.
    assert.deepEqual(url.searchParams.get("viewbox").split(",").map(Number), [77.36, 13.24, 77.88, 12.73]);
  }
  const photon = queries[2].url;
  assert.equal(photon.host, "photon.komoot.io");
  assert.equal(photon.searchParams.get("countrycode"), "in");
  assert.deepEqual(photon.searchParams.get("bbox").split(",").map(Number), [77.36, 12.73, 77.88, 13.24]);
});

test("query order is society, then locality, then Photon biased to the city center", async () => {
  const { geocoder, calls } = setUp((url) => (isCityLookup(url) ? [CITY_HIT] : url.host.startsWith("photon") ? { features: [] } : []));
  const spot = await geocoder.geocode({ society: "Ahad Excellencia", locality: "Sarjapur Road", city: "Bangalore" });

  assert.equal(spot, null);
  assert.deepEqual(
    calls.map(({ url }) => url.searchParams.get("q")),
    ["Bangalore", "Ahad Excellencia, Bangalore", "Sarjapur Road, Bangalore", "Ahad Excellencia, Sarjapur Road, Bangalore"],
  );
  const photon = calls[3].url.searchParams;
  assert.equal(photon.get("lat"), "12.97");
  assert.equal(photon.get("lon"), "77.59");
});

test("the geocoder stops at the first good hit", async () => {
  const { geocoder, calls } = setUp((url) => {
    if (isCityLookup(url)) return [CITY_HIT];
    if (url.searchParams.get("q").startsWith("Sarjapur")) {
      return [{ lat: "12.91", lon: "77.68", place_rank: 19, addresstype: "suburb" }];
    }
    return [];
  });
  const spot = await geocoder.geocode({ society: "Ahad Excellencia", locality: "Sarjapur Road", city: "Bangalore" });

  assert.deepEqual(spot, { lat: 12.91, long: 77.68, precision: "locality" });
  assert.equal(calls.length, 3);
});

test("a hit outside the city box or as rough as a whole city is not a good hit", async () => {
  const { geocoder } = setUp((url) => {
    if (isCityLookup(url)) return [CITY_HIT];
    if (url.host.startsWith("photon")) return { features: [] };
    return [
      { lat: "18.55", lon: "73.78", place_rank: 30, addresstype: "building" },
      { lat: "12.97", lon: "77.59", place_rank: 16, addresstype: "city" },
    ];
  });
  assert.equal(await geocoder.geocode({ society: "Blue Ridge", city: "Bangalore" }), null);
});

test("Pin precision comes from addresstype, or from place_rank when addresstype is not known", async () => {
  const cases = [
    [{ addresstype: "building", place_rank: 30 }, "building"],
    [{ addresstype: "residential", place_rank: 24 }, "society"],
    [{ addresstype: "neighbourhood", place_rank: 22 }, "society"],
    [{ addresstype: "suburb", place_rank: 19 }, "locality"],
    [{ addresstype: "amenity", place_rank: 30 }, "building"],
    [{ addresstype: "something", place_rank: 24 }, "society"],
    [{ addresstype: "something", place_rank: 18 }, "locality"],
  ];
  for (const [hit, precision] of cases) {
    const { geocoder } = setUp((url) => (isCityLookup(url) ? [CITY_HIT] : [{ lat: "12.9", lon: "77.6", ...hit }]));
    const spot = await geocoder.geocode({ society: "X", city: "Bangalore" });
    assert.equal(spot.precision, precision, JSON.stringify(hit));
  }
});

test("a Photon hit gets its Pin precision from the Photon type", async () => {
  const { geocoder } = setUp((url) => {
    if (isCityLookup(url)) return [CITY_HIT];
    if (url.host.startsWith("photon")) {
      return {
        features: [
          { geometry: { coordinates: [77.6, 12.9] }, properties: { type: "city" } },
          { geometry: { coordinates: [77.62, 12.93] }, properties: { type: "house" } },
        ],
      };
    }
    return [];
  });
  const spot = await geocoder.geocode({ society: "Embassy Tech Village", city: "Bangalore" });
  assert.deepEqual(spot, { lat: 12.93, long: 77.62, precision: "building" });
});

test("all requests go through one queue, at least 1 second apart, with the app's User-Agent", async () => {
  const { geocoder, calls } = setUp((url) => (isCityLookup(url) ? [CITY_HIT] : url.host.startsWith("photon") ? { features: [] } : []));
  // Two lookups at the same time still share the queue.
  await Promise.all([
    geocoder.geocode({ society: "A", locality: "B", city: "Bangalore" }),
    geocoder.geocode({ society: "C", city: "Bangalore" }),
  ]);

  // One city lookup, then 3 queries for the first call and 2 for the second.
  assert.equal(calls.length, 6);
  for (let i = 1; i < calls.length; i++) {
    assert.ok(calls[i].at - calls[i - 1].at >= GAP_MS, `request ${i} came ${calls[i].at - calls[i - 1].at} ms after the one before`);
  }
  for (const call of calls) assert.equal(call.headers["User-Agent"], USER_AGENT);
  assert.match(USER_AGENT, /rental-map/);
});

test("the city comes from the call, so another city gets its own lookup", async () => {
  const { geocoder, calls } = setUp(() => [{ ...CITY_HIT, lat: "18.52", lon: "73.85", boundingbox: ["18.4", "18.6", "73.7", "74.0"] }]);
  await geocoder.geocode({ society: "Blue Ridge", city: "Pune" });
  assert.equal(calls[0].url.searchParams.get("q"), "Pune");
  assert.equal(calls[1].url.searchParams.get("q"), "Blue Ridge, Pune");
});

test("a missing city, or nothing to look up, is an error with no request sent", async () => {
  const { geocoder, calls } = setUp(() => []);
  await assert.rejects(geocoder.geocode({ society: "X", city: " " }), /No City in the Settings tab/);
  await assert.rejects(geocoder.geocode({ society: "", locality: "", city: "Bangalore" }), /Nothing to look up/);
  assert.equal(calls.length, 0);
});

test("a city that Nominatim cannot find is an error, and the next call asks again", async () => {
  const { geocoder, calls } = setUp(() => []);
  await assert.rejects(geocoder.geocode({ society: "X", city: "Nowhere" }), /Could not find the city "Nowhere"/);
  await assert.rejects(geocoder.geocode({ society: "X", city: "Nowhere" }), /Could not find the city/);
  assert.equal(calls.length, 2);
});
