// The geocoder. It turns a society, locality or address into a map spot, from "Map spots" in SPEC.md.
// Only the local web server calls it. The browser never calls Nominatim or Photon.
// The city comes from the Settings tab with each call. No city name is written here.

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const PHOTON = "https://photon.komoot.io/api/";
const USER_AGENT = "rental-map/1.0 (a small group's rental hunt map, run on localhost)";

// The Nominatim policy allows 1 request a second for the whole app.
const GAP_MS = 1000;

// A city's own box is its boundary. Suburbs on the edge (like Sarjapur Road) are often outside it,
// so the viewbox is the city box grown by this much on each side, in degrees (about 11 km).
const CITY_MARGIN_DEG = 0.1;

// Nominatim's addresstype names the kind of object. Words not in this list fall back to place_rank.
const PRECISION_BY_ADDRESSTYPE = {
  building: "building",
  house: "building",
  residential: "society",
  neighbourhood: "society",
  quarter: "society",
  road: "society",
  suburb: "locality",
  city_district: "locality",
  village: "locality",
  hamlet: "locality",
  locality: "locality",
};
const TOO_ROUGH_ADDRESSTYPES = ["city", "town", "municipality", "county", "state_district", "state", "country"];

// place_rank: 30 is a building or a point, about 24 a residential area, about 19 a suburb, 16 or less a city.
function precisionFromRank(rank) {
  if (!Number.isFinite(rank)) return null;
  if (rank >= 28) return "building";
  if (rank >= 22) return "society";
  if (rank >= 17) return "locality";
  return null;
}

function nominatimPrecision(hit) {
  if (TOO_ROUGH_ADDRESSTYPES.includes(hit.addresstype)) return null;
  return PRECISION_BY_ADDRESSTYPE[hit.addresstype] || precisionFromRank(Number(hit.place_rank));
}

// Photon has no place_rank or addresstype. Its "type" is the same idea in fewer steps.
const PRECISION_BY_PHOTON_TYPE = { house: "building", street: "society", locality: "locality", district: "locality" };

function inBox(box, lat, long) {
  return lat >= box.south && lat <= box.north && long >= box.west && long <= box.east;
}

function viewbox(box) {
  return `${box.west},${box.north},${box.east},${box.south}`;
}

function clean(text) {
  return typeof text === "string" ? text.trim() : "";
}

// One queue for every request, so 2 calls at once still go out at least GAP_MS apart.
function createQueue({ fetch, wait, now }) {
  let chain = Promise.resolve();
  let lastStart = -Infinity;
  return function send(url) {
    const run = chain.then(async () => {
      const gap = lastStart + GAP_MS - now();
      if (gap > 0) await wait(gap);
      lastStart = now();
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
      if (!res.ok) throw new Error(`${new URL(url).host} answered HTTP ${res.status}`);
      return res.json();
    });
    chain = run.catch(() => {});
    return run;
  };
}

function createGeocoder({
  fetch = globalThis.fetch,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
} = {}) {
  const send = createQueue({ fetch, wait, now });
  // One lookup per city while the server runs. A failed lookup is dropped, so the next call tries again.
  const cities = new Map();

  function nominatimUrl(q, box) {
    const url = new URL(NOMINATIM);
    url.search = new URLSearchParams({ q, format: "jsonv2", limit: "5", countrycodes: "in" });
    if (box) url.searchParams.set("viewbox", viewbox(box));
    return url.href;
  }

  function cityArea(city) {
    const key = city.toLowerCase();
    if (!cities.has(key)) {
      const lookup = send(nominatimUrl(city, null)).then((hits) => {
        const hit = hits.find((h) => Array.isArray(h.boundingbox));
        if (!hit) throw new Error(`Could not find the city "${city}" in India. Check City in the Settings tab.`);
        const [south, north, west, east] = hit.boundingbox.map(Number);
        return {
          center: [Number(hit.lat), Number(hit.lon)],
          box: {
            south: south - CITY_MARGIN_DEG,
            north: north + CITY_MARGIN_DEG,
            west: west - CITY_MARGIN_DEG,
            east: east + CITY_MARGIN_DEG,
          },
        };
      });
      lookup.catch(() => cities.delete(key));
      cities.set(key, lookup);
    }
    return cities.get(key);
  }

  // A good hit is inside the city box and is a building, a society or a locality. A whole city is too rough.
  async function askNominatim(q, area) {
    const hits = await send(nominatimUrl(q, area.box));
    for (const hit of hits) {
      const lat = Number(hit.lat);
      const long = Number(hit.lon);
      const precision = nominatimPrecision(hit);
      if (precision && inBox(area.box, lat, long)) return { lat, long, precision };
    }
    return null;
  }

  async function askPhoton(q, area) {
    const url = new URL(PHOTON);
    const { box } = area;
    // Photon names the same filters countrycode and bbox. bbox is minLon,minLat,maxLon,maxLat.
    url.search = new URLSearchParams({
      q,
      lat: String(area.center[0]),
      lon: String(area.center[1]),
      limit: "5",
      countrycode: "in",
      bbox: `${box.west},${box.south},${box.east},${box.north}`,
    });
    const reply = await send(url.href);
    for (const feature of reply.features || []) {
      const [long, lat] = feature.geometry?.coordinates || [];
      const precision = PRECISION_BY_PHOTON_TYPE[feature.properties?.type];
      if (precision && inBox(box, lat, long)) return { lat, long, precision };
    }
    return null;
  }

  // Query order, stop at the first good hit: society with city, locality with city, then Photon.
  // Returns { lat, long, precision }, or null when no query finds the spot.
  async function geocode({ society, locality, city }) {
    const cityName = clean(city);
    if (!cityName) throw new Error("No City in the Settings tab. Add a City row, like Bangalore.");
    const parts = [clean(society), clean(locality)];
    if (!parts[0] && !parts[1]) throw new Error("Nothing to look up. Give a society, a locality or an address.");
    const area = await cityArea(cityName);
    for (const part of parts) {
      if (!part) continue;
      const hit = await askNominatim(`${part}, ${cityName}`, area);
      if (hit) return hit;
    }
    return askPhoton([...parts.filter(Boolean), cityName].join(", "), area);
  }

  return { geocode };
}

module.exports = { createGeocoder, USER_AGENT, GAP_MS };
