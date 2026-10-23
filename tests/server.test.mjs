import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import http from "node:http";

const require = createRequire(import.meta.url);
const { createServer } = require("../server.js");

// Node 18.12 does not wait for an async before() hook and has no top-level after(),
// so start the server with top-level await and unref it, so it does not hold the run open.
// A fake geocoder keeps each call, so no test calls Nominatim.
const geocodeCalls = [];
const fakeGeocoder = {
  async geocode(query) {
    geocodeCalls.push(query);
    if (query.society === "Broken") throw new Error("nominatim.openstreetmap.org answered HTTP 429");
    return { lat: 12.93, long: 77.62, precision: "building" };
  },
};

async function start(config) {
  const server = createServer(config, { geocoder: fakeGeocoder });
  await new Promise((resolve) => server.listen(0, "localhost", resolve));
  server.unref();
  return `http://localhost:${server.address().port}`;
}

const base = await start({ appsScriptUrl: "https://script.google.com/macros/s/TEST/exec" });
const offBase = await start({ appsScriptUrl: "x", geocoding: false });

function postJson(url, body) {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

// fetch cannot set the Host header, so this one uses node:http.
function getWithHost(url, host) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers: { Host: host } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on("error", reject);
  });
}

test("the server serves the page at /", async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/html/);
  assert.match(await res.text(), /id="map"/);
});

test("page modules are served as JavaScript", async () => {
  const res = await fetch(`${base}/lib/listings.mjs`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/javascript/);
});

test("the page reads the Apps Script URL from /api/config", async () => {
  const res = await fetch(`${base}/api/config`);
  assert.deepEqual(await res.json(), {
    appsScriptUrl: "https://script.google.com/macros/s/TEST/exec",
    geocoding: true,
  });
});

test("files outside public/ are not served", async () => {
  for (const path of ["/../server.js", "/%2e%2e/server.js", "/missing.html"]) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 404, path);
  }
});

test("fonts are served as woff2", async () => {
  const res = await fetch(`${base}/fonts/plex-sans-latin.woff2`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "font/woff2");
});

test("POST /api/geocode passes society, locality and city to the geocoder", async () => {
  geocodeCalls.length = 0;
  const res = await postJson(`${base}/api/geocode`, { society: "Embassy Tech Village", locality: "", city: "Bangalore", name: "Asha" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, spot: { lat: 12.93, long: 77.62, precision: "building" } });
  // Only the 3 lookup values reach the geocoder. A person's name never goes to Nominatim.
  assert.deepEqual(geocodeCalls, [{ society: "Embassy Tech Village", locality: "", city: "Bangalore" }]);
});

test("a geocoder failure comes back as JSON with the reason", async () => {
  const res = await postJson(`${base}/api/geocode`, { society: "Broken", city: "Bangalore" });
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { ok: false, error: "nominatim.openstreetmap.org answered HTTP 429" });
});

test("geocoding false in the config turns the geocoder off", async () => {
  geocodeCalls.length = 0;
  const res = await postJson(`${offBase}/api/geocode`, { society: "X", city: "Bangalore" });
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /The geocoder is off/);
  assert.equal(geocodeCalls.length, 0);
  assert.equal((await (await fetch(`${offBase}/api/config`)).json()).geocoding, false);
});

test("a POST that is not application/json gets 415, and bad JSON gets 400", async () => {
  const plain = await fetch(`${base}/api/geocode`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
  assert.equal(plain.status, 415);
  const bad = await fetch(`${base}/api/geocode`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{nope" });
  assert.equal(bad.status, 400);
  const other = await postJson(`${base}/index.html`, {});
  assert.equal(other.status, 405);
});

test("a request with a host name that is not localhost gets 403", async () => {
  assert.equal(await getWithHost(`${base}/`, "evil.example"), 403);
  assert.equal(await getWithHost(`${base}/`, "localhost"), 200);
  assert.equal(await getWithHost(`${base}/`, "127.0.0.1:1234"), 200);
});
